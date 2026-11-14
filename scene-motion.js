/* Calm, local environmental motion. Photographs and the page UI stay still. */
(() => {
  'use strict';

  const SCENES = new Set(['sunset', 'ocean', 'mountain', 'cabin', 'forest', 'waterfall', 'starlight', 'blossom', 'desert']);
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class SceneMotion {
    constructor(world, canvas) {
      this.world = world;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scene = 'none';
      this.width = this.height = 0;
      this.pixelRatio = 1;
      this.frameInterval = 1000 / 24;
      this.frameId = null;
      this.lastFrame = null;
      this.elapsed = 0;
      this.pageSuspended = false;
      this.destroyed = false;
      this.photo = null;
      this.photoTexture = null;
      this.photoBounds = null;
      this.particles = [];
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.onFrame = timestamp => this.tick(timestamp);
      this.onResize = () => this.resize();
      this.onVisibility = () => this.syncPlayback();
      this.onPageHide = () => { this.pageSuspended = true; this.syncPlayback(); };
      this.onPageShow = () => { this.pageSuspended = false; this.syncPlayback(); };
      this.onPhotoLoad = () => { this.preparePhoto(); this.draw(); };
      this.observer = new MutationObserver(() => this.setScene(world.dataset.scene));
      this.observer.observe(world, { attributes: true, attributeFilter: ['data-scene'] });
      window.addEventListener('resize', this.onResize);
      window.addEventListener('pagehide', this.onPageHide);
      window.addEventListener('pageshow', this.onPageShow);
      document.addEventListener('visibilitychange', this.onVisibility);
      this.reducedMotion.addEventListener('change', this.onVisibility);
      this.mistSprite = this.makeMistSprite();
      this.resize();
      this.setScene(world.dataset.scene);
    }

    makeMistSprite() {
      const sprite = document.createElement('canvas');
      sprite.width = 256;
      sprite.height = 96;
      const ctx = sprite.getContext('2d');
      if (!ctx) return sprite;
      ctx.scale(1, .375);
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, 'rgba(228,238,238,.55)');
      gradient.addColorStop(.45, 'rgba(228,238,238,.20)');
      gradient.addColorStop(1, 'rgba(228,238,238,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      return sprite;
    }

    resize() {
      const bounds = this.world.getBoundingClientRect();
      this.width = Math.max(1, Math.round(bounds.width));
      this.height = Math.max(1, Math.round(bounds.height));
      // Bound both density and total surface size, even on a 4K/Retina display.
      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1800000 / (this.width * this.height)));
      this.canvas.width = Math.round(this.width * this.pixelRatio);
      this.canvas.height = Math.round(this.height * this.pixelRatio);
      if (!this.ctx) return;
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      this.preparePhoto();
      this.draw();
    }

    setScene(id) {
      const next = SCENES.has(id) ? id : 'none';
      if (next === this.scene) { this.syncPlayback(); return; }
      if (this.photo) this.photo.removeEventListener('load', this.onPhotoLoad);
      this.scene = next;
      this.elapsed = 0;
      this.lastFrame = null;
      this.photo = this.world.querySelector('[data-scene-layer="' + next + '"] img');
      if (this.photo) this.photo.addEventListener('load', this.onPhotoLoad);
      this.preparePhoto();
      // Seed once per scene; frames reuse these values instead of changing DOM.
      const count = next === 'cabin' ? 72 : next === 'starlight' ? 42 : next === 'blossom' ? 14 : 28;
      this.particles = Array.from({ length: count }, (_, index) => ({
        x: Math.random(), y: Math.random(), depth: .3 + Math.random() * .7,
        phase: Math.random() * TAU, speed: .65 + Math.random() * .7, index
      }));
      this.syncPlayback();
      this.draw();
    }

    preparePhoto() {
      this.photoBounds = null;
      this.photoTexture = null;
      const image = this.photo;
      if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight || !this.ctx) return;
      // Match object-fit: cover / object-position: center exactly, including
      // portrait cropping. Source coordinates keep waves out of the sky.
      const scale = Math.max(this.width / image.naturalWidth, this.height / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      this.photoBounds = { x: (this.width - width) / 2, y: (this.height - height) / 2, width, height };
      if (!['ocean', 'sunset', 'mountain'].includes(this.scene)) return;
      const texture = document.createElement('canvas');
      texture.width = this.canvas.width;
      texture.height = this.canvas.height;
      const ctx = texture.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      ctx.drawImage(image, this.photoBounds.x, this.photoBounds.y, width, height);
      if (this.scene === 'mountain') {
        // A foreground ridge enters the photograph at the lower right. Remove
        // it from the moving texture so the original mountain stays anchored.
        // The buffer exceeds the 15px cloud drift; the feather hides its edge.
        const ridge = [[.84, .81], [.90, .775], [.95, .745], [1.04, .69], [1.04, 1.1], [.84, 1.1]];
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 18 * this.pixelRatio;
        ctx.beginPath();
        ridge.forEach(([x, y], index) => {
          const point = this.sourcePoint(x, y);
          const px = point.x + (x > 1 ? 24 : -24), py = point.y - (index < 4 ? 24 : 0);
          if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      this.photoTexture = texture;
    }

    sourcePoint(x, y) {
      const bounds = this.photoBounds;
      return bounds ? { x: bounds.x + x * bounds.width, y: bounds.y + y * bounds.height } : { x: x * this.width, y: y * this.height };
    }

    shouldAnimate() {
      return !!this.ctx && this.scene !== 'none' && !document.hidden && !this.pageSuspended && !this.reducedMotion.matches && !this.destroyed;
    }

    syncPlayback() {
      if (this.shouldAnimate()) {
        if (this.frameId === null) this.frameId = window.requestAnimationFrame(this.onFrame);
      } else {
        if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
        this.frameId = null;
        this.lastFrame = null;
        if (this.ctx && (this.scene === 'none' || this.reducedMotion.matches)) this.ctx.clearRect(0, 0, this.width, this.height);
      }
    }

    tick(timestamp) {
      this.frameId = null;
      if (!this.shouldAnimate()) { this.lastFrame = null; return; }
      if (this.lastFrame === null) {
        this.lastFrame = timestamp;
        this.draw();
      } else if (timestamp - this.lastFrame >= this.frameInterval) {
        // A delayed frame never makes rain/petals jump across the screen.
        this.elapsed += Math.min((timestamp - this.lastFrame) / 1000, .1);
        this.lastFrame = timestamp;
        this.draw();
      }
      this.frameId = window.requestAnimationFrame(this.onFrame);
    }

    draw() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      if (this.scene === 'none' || this.reducedMotion.matches || this.destroyed) return;
      ctx.save();
      if (this.scene === 'ocean' || this.scene === 'sunset') this.drawWater();
      else if (this.scene === 'mountain') { this.drawCloudSea(); this.drawMist(.63, .11); }
      else if (this.scene === 'cabin') this.drawRain();
      else if (this.scene === 'forest') this.drawMist(.58, .14);
      else if (this.scene === 'waterfall') this.drawWaterfall();
      else if (this.scene === 'starlight') this.drawStars();
      else if (this.scene === 'blossom') this.drawPetals();
      else if (this.scene === 'desert') this.drawDust();
      ctx.restore();
    }

    drawWater() {
      const ctx = this.ctx, w = this.width, h = this.height, t = this.elapsed;
      const ocean = this.scene === 'ocean';
      const horizon = clamp(this.sourcePoint(0, ocean ? .60 : .665).y, 0, h);
      const depth = h - horizon;
      if (depth < 1) return;
      if (this.photoTexture) {
        const ratio = this.pixelRatio;
        const strip = Math.max(5, depth / 80);
        for (let y = horizon; y < h; y += strip) {
          const size = Math.min(strip + .5, h - y);
          const fraction = (y - horizon) / depth;
          const fade = Math.min(1, (y - horizon) / 28);
          const amplitude = (ocean ? 2.5 : 1.2) * fraction;
          const dx = Math.sin(t * .40 + y * .024) * amplitude;
          const dy = Math.sin(t * .32 + y * .016) * amplitude * .45;
          const sy = clamp(y + dy, 0, h - size);
          ctx.globalAlpha = fade * Math.min(1, t / 1.2);
          ctx.drawImage(this.photoTexture, 0, sy * ratio, w * ratio, size * ratio, dx, y, w, size);
        }
      }
      // Low-contrast reflections roll gently forward; no whole-image movement.
      ctx.lineWidth = .7;
      for (let i = 0; i < 9; i++) {
        const phase = (i / 9 + t * (ocean ? .009 : .004)) % 1;
        const y = horizon + depth * phase * phase;
        const alpha = Math.sin(phase * Math.PI) * (ocean ? .105 : .07);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = ocean ? '#d5e8e7' : '#f0d2a4';
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 18) {
          const wave = Math.sin(x / (90 + phase * 90) + t * .28 + i) * (1 + phase * 2);
          if (x === -10) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      }
    }

    drawCloudSea() {
      if (!this.photoTexture) return;
      const ctx = this.ctx, h = this.height, w = this.width, ratio = this.pixelRatio;
      const top = clamp(this.sourcePoint(0, .60).y, 0, h);
      const strip = Math.max(8, (h - top) / 55);
      for (let y = top; y < h; y += strip) {
        const size = Math.min(strip + .5, h - y);
        const fraction = (y - top) / Math.max(1, h - top);
        ctx.globalAlpha = Math.min(1, (y - top) / 60) * Math.min(1, this.elapsed / 1.2);
        const dx = Math.sin(this.elapsed * .035) * (3 + fraction * 12);
        ctx.drawImage(this.photoTexture, 0, y * ratio, w * ratio, size * ratio, dx, y, w, size);
      }
    }

    drawMist(level, opacity) {
      const ctx = this.ctx, w = this.width, h = this.height, t = this.elapsed;
      for (let i = 0; i < 4; i++) {
        const span = w * .78;
        const x = ((i * .34 + t * .0019) % 1.6 - .45) * w;
        const y = h * (level + Math.sin(i * 2.2) * .13) + Math.sin(t * .07 + i) * 6;
        ctx.globalAlpha = opacity * (i % 2 ? .8 : 1);
        ctx.drawImage(this.mistSprite, x, y - h * .12, span, h * .24);
      }
    }

    drawRain() {
      const ctx = this.ctx, w = this.width, h = this.height, t = this.elapsed;
      ctx.lineCap = 'round';
      for (const drop of this.particles) {
        const speed = 80 + drop.depth * 65;
        const y = ((drop.y * (h + 40) + t * speed) % (h + 40)) - 20;
        const x = (drop.x * (w + 50) + t * 8 * drop.depth) % (w + 50) - 25;
        const length = 9 + drop.depth * 13;
        ctx.globalAlpha = .10 + drop.depth * .14;
        ctx.strokeStyle = '#e2eced';
        ctx.lineWidth = .55 + drop.depth * .45;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length * .09, y + length);
        ctx.stroke();
      }
      this.drawMist(.72, .07);
    }

    drawWaterfall() {
      const ctx = this.ctx, t = this.elapsed;
      // These columns follow the actual waterfall in the credited photograph.
      const streams = [[.365, .40], [.47, .61], [.735, .79]];
      for (const particle of this.particles) {
        const region = streams[particle.index % streams.length];
        const phase = (particle.y + t * .07 * particle.speed) % 1;
        const x = region[0] + (region[1] - region[0]) * particle.x;
        const start = this.sourcePoint(x, .245 + phase * .465);
        const end = this.sourcePoint(x + Math.sin(t * .2 + particle.phase) * .002, .245 + Math.min(1, phase + .09) * .465);
        ctx.globalAlpha = .12 * Math.sin(phase * Math.PI);
        ctx.strokeStyle = '#ecffff';
        ctx.lineWidth = .7 + particle.depth;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      const base = this.sourcePoint(.54, .74);
      ctx.globalAlpha = .10;
      const sway = Math.sin(t * .11) * 10;
      ctx.drawImage(this.mistSprite, base.x - this.width * .25 + sway, base.y - 25, this.width * .55, 75);
    }

    drawStars() {
      const ctx = this.ctx, t = this.elapsed;
      for (const star of this.particles) {
        const x = star.x * this.width, y = star.y * this.height * .68;
        ctx.globalAlpha = .08 + (.5 + .5 * Math.sin(t * .32 * star.speed + star.phase)) * .16;
        ctx.fillStyle = '#e7eefb';
        ctx.beginPath();
        ctx.arc(x, y, .4 + star.depth * .7, 0, TAU);
        ctx.fill();
      }
    }

    drawPetals() {
      const ctx = this.ctx, w = this.width, h = this.height, t = this.elapsed;
      for (const petal of this.particles) {
        const y = ((petal.y * (h + 40) + t * (8 + 10 * petal.depth)) % (h + 40)) - 20;
        const x = ((petal.x * (w + 60) + t * 5 * petal.speed) % (w + 60)) - 30 + Math.sin(t * .4 + petal.phase) * 12;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * .35 + petal.phase) * .7 + petal.phase);
        ctx.globalAlpha = .20 + petal.depth * .25;
        ctx.fillStyle = '#f5d9df';
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.8 + petal.depth * 2.3, 1 + petal.depth * 1.2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawDust() {
      const ctx = this.ctx, w = this.width, h = this.height, t = this.elapsed;
      for (const grain of this.particles) {
        const x = ((grain.x * (w + 30) + t * (5 + 6 * grain.depth)) % (w + 30)) - 15;
        const y = h * (.58 + grain.y * .42) + Math.sin(t * .15 + grain.phase) * 5;
        ctx.globalAlpha = .07 + grain.depth * .08;
        ctx.fillStyle = '#e9c9a1';
        ctx.beginPath();
        ctx.arc(x, y, .5 + grain.depth * .7, 0, TAU);
        ctx.fill();
      }
    }

    destroy() {
      this.destroyed = true;
      this.syncPlayback();
      this.observer.disconnect();
      if (this.photo) this.photo.removeEventListener('load', this.onPhotoLoad);
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('pageshow', this.onPageShow);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.reducedMotion.removeEventListener('change', this.onVisibility);
      if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
      this.photoTexture = this.photo = this.mistSprite = null;
    }
  }

  window.SceneMotion = SceneMotion;
  const world = document.getElementById('ambient-world');
  const canvas = document.getElementById('scene-motion');
  if (world && canvas) new SceneMotion(world, canvas);
})();
