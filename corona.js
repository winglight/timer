/* Canvas-only fine-particle corona. CSS draws the sharp, unfiltered core.
 * setFrame is externally driven: this renderer never owns a timer.
 * Paused frames use the same particle coordinates; reduced motion is static.
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  function randomGenerator(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
  }
  class CoronaRenderer {
    constructor(stage, canvas, core) {
      this.stage = stage; this.canvas = canvas; this.core = core;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.motion = matchMedia('(prefers-reduced-motion: reduce)');
      this.frame = { level: 0, phase: 'inhale', status: 'idle', elapsedMs: 0 };
      this.particles = []; this.size = 0; this.lastElapsed = 0; this.maxCount = 6200;
      this.sprite = this.makeSprite();
      this.onMotion = () => this.setFrame(this.frame, true);
      this.motion.addEventListener('change', this.onMotion);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(stage); this.resize();
    }
    makeSprite() {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d');
      const gradient = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(69,160,162,1)');
      gradient.addColorStop(.27, 'rgba(79,172,169,.94)');
      gradient.addColorStop(.57, 'rgba(85,175,171,.45)');
      gradient.addColorStop(1, 'rgba(85,175,171,0)');
      g.fillStyle = gradient; g.fillRect(0, 0, 32, 32); return c;
    }
    get radius() { return this.size * .30 * (.80 + .20 * (this.motion.matches ? .5 : this.frame.level)); }
    resize() {
      const size = this.stage.getBoundingClientRect().width;
      if (!size) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (Math.abs(size - this.size) < .5 && dpr === this.dpr) return;
      this.size = size; this.dpr = dpr;
      this.canvas.width = Math.round(size * dpr); this.canvas.height = Math.round(size * dpr);
      if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.seedParticles(); this.setFrame(this.frame, true);
    }
    seedParticles() {
      const rand = randomGenerator(482193);
      const count = Math.min(this.maxCount, this.size > 510 ? 6200 : this.size > 400 ? 4500 : 3700);
      const band = this.size * .18;
      const streams = Array.from({length: 96}, (_, i) => ({
        angle: i / 96 * TAU + (rand() - .5) * .035,
        length: .48 + rand() * .52,
        curl: (rand() - .5) * .12, seed: rand() * TAU
      }));
      this.particles = Array.from({length: count}, (_, i) => {
        const stream = streams[i % streams.length];
        const boundary = i < count * .31;
        const distance = Math.pow(rand(), boundary ? 2.8 : 1.65) * band * stream.length * (boundary ? .30 : 1);
        return { stream, boundary, r: this.radius + 1 + distance, offset: distance,
          angleOffset: (rand() - .5) * .045, speed: (7 + rand() * 11) * this.size / 600,
          size: (.44 + Math.pow(rand(), 1.9) * .90) * Math.max(.80, this.size / 620),
          opacity: .40 + rand() * .56, seed: rand() * TAU, recycle: rand() };
      });
    }
    setFrame(frame, force = false) {
      const previous = this.frame;
      this.frame = { ...frame, level: clamp(frame.level || 0) };
      const level = this.motion.matches ? .5 : this.frame.level;
      this.core.style.transform = `translate(-50%, -50%) scale(${(.80 + .20 * level).toFixed(5)})`;
      let dt = Math.max(0, (frame.elapsedMs - this.lastElapsed) / 1000);
      this.lastElapsed = frame.elapsedMs;
      if (!this.ctx || !this.size) return;
      if (this.motion.matches && !force && previous.status === frame.status && previous.phase === frame.phase) return;
      if (dt > .3 || dt < 0) { this.seedParticles(); dt = 0; }
      if (this.motion.matches || frame.status !== 'running') dt = 0;
      this.draw(dt);
    }
    draw(dt) {
      const ctx = this.ctx, size = this.size, center = size / 2, radius = this.radius;
      const frame = this.frame;
      const band = size * .18;
      const t = this.motion.matches ? 0 : frame.elapsedMs / 1000;
      const direction = frame.phase === 'inhale' ? -1 : frame.phase === 'exhale' ? 1 : 0;
      const velocity = .10 + .90 * Math.pow(Math.sin(Math.PI * clamp(frame.progress || 0)), .75);
      ctx.clearRect(0, 0, size, size);
      // Subtle air between the particles; the core itself stays fully sharp.
      const aura = ctx.createRadialGradient(center, center, radius, center, center, radius + band);
      aura.addColorStop(0, 'rgba(155,212,195,.028)'); aura.addColorStop(.45, 'rgba(155,212,195,.009)'); aura.addColorStop(1, 'rgba(155,212,195,0)');
      ctx.fillStyle = aura; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#4ba6a4';
      for (const p of this.particles) {
        const extent = band * p.stream.length;
        if (p.boundary) {
          p.r = radius + 1.2 + p.offset * (1 + .12 * Math.sin(t * .23 + p.seed));
        } else if (dt) {
          // World-space flow: exhale particles travel OUT even as the core shrinks.
          p.r += direction * p.speed * velocity * dt;
          if (p.r < radius + .7) p.r = radius + extent * (.74 + .23 * p.recycle);
          if (p.r > radius + extent) p.r = radius + 1.2 + p.recycle * 2.5;
        }
        const q = (p.r - radius) / extent;
        if (q <= 0 || q >= 1) continue;
        const angle = p.stream.angle + p.angleOffset * (1 + q * .8) + p.stream.curl * q * q + Math.sin(q * 3 + p.stream.seed + t * .045) * .015 * q;
        const x = center + Math.cos(angle) * p.r, y = center + Math.sin(angle) * p.r;
        const fade = Math.pow(1 - q, 1.8) * Math.min(1, q / .035);
        const alpha = fade * p.opacity * (p.boundary ? .66 : .79);
        if (alpha < .006) continue;
        const dot = p.size * (1 - q * .33);
        ctx.globalAlpha = alpha;
        if (q > .27) {
          // Distance-dependent softness; no CSS blur/filter on the complete orb.
          const width = dot * 2 * (1.35 + q * 1.45);
          ctx.drawImage(this.sprite, x - width / 2, y - width / 2, width, width);
        } else {
          ctx.beginPath(); ctx.arc(x, y, dot, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    destroy() { this.observer.disconnect(); this.motion.removeEventListener('change', this.onMotion); }
  }
  window.CoronaRenderer = CoronaRenderer;
})();
