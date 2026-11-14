/* Local Canvas motion for waterfall, stars and desert. */
(() => {
  'use strict';

  // WebGL scenes belong exclusively to scene-runtime.js, including fallback.
  const SCENES = new Set(['waterfall', 'starlight', 'desert']);
  const TAU = Math.PI * 2;

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
      this.dustSprite = this.makeMistSprite('225,193,151');
      this.starSprite = this.makeStarSprite();
      this.resize();
      this.setScene(world.dataset.scene);
    }

    makeMistSprite(color = '228,238,238') {
      const sprite = document.createElement('canvas');
      sprite.width = 256;
      sprite.height = 96;
      const ctx = sprite.getContext('2d');
      if (!ctx) return sprite;
      ctx.scale(1, .375);
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, 'rgba(' + color + ',.85)');
      gradient.addColorStop(.42, 'rgba(' + color + ',.42)');
      gradient.addColorStop(1, 'rgba(' + color + ',0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      return sprite;
    }

    makeStarSprite() {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 40;
      const ctx = sprite.getContext('2d');
      if (!ctx) return sprite;
      const glow = ctx.createRadialGradient(20, 20, 0, 20, 20, 20);
      glow.addColorStop(0, 'rgba(238,245,255,.95)');
      glow.addColorStop(.15, 'rgba(214,231,255,.65)');
      glow.addColorStop(.5, 'rgba(187,214,255,.14)');
      glow.addColorStop(1, 'rgba(187,214,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 40, 40);
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
      const count = next === 'waterfall' ? 96 : next === 'none' ? 0 : 64;
      this.particles = Array.from({ length: count }, (_, index) => ({
        x: Math.random(), y: Math.random(), depth: .3 + Math.random() * .7,
        phase: Math.random() * TAU, speed: .65 + Math.random() * .7, index
      }));
      this.syncPlayback();
      this.draw();
    }

    preparePhoto() {
      this.photoBounds = null;
      const image = this.photo;
      if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight || !this.ctx) return;
      // Match object-fit: cover / object-position: center exactly, including
      // portrait cropping. Source coordinates keep streams on the waterfall.
      const scale = Math.max(this.width / image.naturalWidth, this.height / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      this.photoBounds = { x: (this.width - width) / 2, y: (this.height - height) / 2, width, height };
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
      if (this.scene === 'waterfall') this.drawWaterfall();
      else if (this.scene === 'starlight') this.drawStars();
      else if (this.scene === 'desert') this.drawDust();
      ctx.restore();
    }

    drawMist(level, opacity, sprite = this.mistSprite) {
      const ctx = this.ctx, w = this.width, h = this.height, t = this.elapsed;
      for (let i = 0; i < 6; i++) {
        const span = w * (.65 + (i % 3) * .10);
        const speed = (w * .008 + 3) * (i % 2 ? .75 : 1);
        // Wrap only while fully off-screen; no visible fog panel pops in.
        const x = ((i * .23 * (w + span) + t * speed) % (w + span)) - span;
        const y = h * (level + Math.sin(i * 2.2) * .15) + Math.sin(t * .15 + i) * 14;
        ctx.globalAlpha = opacity * (i % 2 ? .78 : 1);
        ctx.drawImage(sprite, x, y - h * .14, span, h * .28);
      }
    }

    drawWaterfall() {
      const ctx = this.ctx, t = this.elapsed;
      // Continuous columns follow the actual waterfall, while flowing ribbons
      // and pool spray make the falling water visible through the dark shade.
      const streams = [[.375, .402], [.49, .545], [.59, .625], [.757, .785]];
      ctx.lineCap = 'round';
      for (const particle of this.particles) {
        const region = streams[particle.index % streams.length];
        const x = region[0] + (region[1] - region[0]) * particle.x;
        const top = this.sourcePoint(x, .245), bottom = this.sourcePoint(x, .71);
        const phase = (particle.y + t * .19 * particle.speed) % 1;
        const length = .12 + particle.depth * .17;
        const y1 = .245 + phase * .465, y2 = .245 + Math.min(1, phase + length) * .465;
        const start = this.sourcePoint(x, y1);
        const end = this.sourcePoint(x + Math.sin(t * .4 + particle.phase) * .003, y2);
        ctx.strokeStyle = '#e4fbff';
        ctx.lineWidth = 1.1 + particle.depth * 2.7;
        ctx.globalAlpha = .035;
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke();
        const ribbon = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
        ribbon.addColorStop(0, 'rgba(228,251,255,0)');
        ribbon.addColorStop(.3, 'rgba(228,251,255,.9)');
        ribbon.addColorStop(.6, 'rgba(228,251,255,1)');
        ribbon.addColorStop(1, 'rgba(228,251,255,0)');
        ctx.strokeStyle = ribbon;
        ctx.globalAlpha = (.26 + particle.depth * .20) * Math.sin(phase * Math.PI);
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      }
      const base = this.sourcePoint(.54, .74);
      ctx.globalAlpha = .42;
      const sway = Math.sin(t * .30) * 32;
      ctx.drawImage(this.mistSprite, base.x - this.width * .31 + sway, base.y - 42, this.width * .68, 120);
      for (let i = 0; i < 5; i++) {
        const phase = (i / 5 + t * .07) % 1;
        ctx.globalAlpha = (1 - phase) * .22;
        ctx.strokeStyle = '#c9f2ef'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(base.x + Math.sin(i * 2) * 38, base.y + phase * 18, 18 + phase * 90, 2 + phase * 8, 0, 0, TAU);
        ctx.stroke();
      }
    }

    drawStars() {
      const ctx = this.ctx, t = this.elapsed;
      for (const star of this.particles) {
        const x = star.x * this.width, y = star.y * this.height * .68;
        const twinkle = .5 + .5 * Math.sin(t * .55 * star.speed + star.phase);
        const radius = 1.0 + star.depth * 1.6;
        const glowSize = 11 + star.depth * 14;
        ctx.globalAlpha = .22 + twinkle * .48;
        ctx.drawImage(this.starSprite, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
        ctx.globalAlpha = .30 + twinkle * .60;
        ctx.fillStyle = '#ecf5ff';
        ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
      }
    }

    drawDust() {
      const ctx = this.ctx, w = this.width, h = this.height, t = this.elapsed;
      this.drawMist(.78, .32, this.dustSprite);
      for (const grain of this.particles) {
        const x = ((grain.x * (w + 50) + t * (14 + 16 * grain.depth)) % (w + 50)) - 25;
        const y = h * (.58 + grain.y * .42) + Math.sin(t * .30 + grain.phase) * 12;
        ctx.globalAlpha = .22 + grain.depth * .24;
        ctx.fillStyle = '#f1d4a9';
        ctx.beginPath(); ctx.arc(x, y, .8 + grain.depth * 1.2, 0, TAU); ctx.fill();
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
      this.photo = this.mistSprite = this.dustSprite = this.starSprite = null;
    }
  }

  window.SceneMotion = SceneMotion;
  const world = document.getElementById('ambient-world');
  const canvas = document.getElementById('scene-motion');
  if (world && canvas) new SceneMotion(world, canvas);
})();
