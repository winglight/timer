/* Pure timing model. A single monotonic clock drives phase, duration and UI. */
(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({ inhale: 4, exhale: 6, hold: 2, minutes: 10, showCountdown: false });
  const RANGES = Object.freeze({ inhale: [1, 60], exhale: [1, 60], hold: [0, 60], minutes: [1, 120] });
  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  const smooth = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  function validConfig(config) {
    return !!config && Object.entries(RANGES).every(([key, [min, max]]) => Number.isInteger(config[key]) && config[key] >= min && config[key] <= max) && (config.sessionSeconds === undefined || (Number.isInteger(config.sessionSeconds) && config.sessionSeconds >= 1 && config.sessionSeconds <= 7200)) && typeof config.showCountdown === 'boolean';
  }
  function readConfig(value) {
    const c = { ...DEFAULTS };
    if (!value || typeof value !== 'object') return c;
    for (const [k, [min, max]] of Object.entries(RANGES)) if (Number.isInteger(value[k]) && value[k] >= min && value[k] <= max) c[k] = value[k];
    c.sessionSeconds = Number.isInteger(value.sessionSeconds) && value.sessionSeconds >= 1 && value.sessionSeconds <= 7200 ? value.sessionSeconds : c.minutes * 60;
    if (typeof value.showCountdown === 'boolean') c.showCountdown = value.showCountdown;
    return c;
  }
  function phaseAt(ms, config) {
    const cycle = (config.inhale + config.exhale + config.hold * 2) * 1000;
    let t = ((ms % cycle) + cycle) % cycle;
    for (const [phase, duration, level] of [
      ['inhale', config.inhale, null], ['hold', config.hold, 1],
      ['exhale', config.exhale, null], ['hold', config.hold, 0]
    ]) {
      if (!duration) continue;
      if (t < duration * 1000) {
        const progress = t / (duration * 1000);
        return { phase, duration, progress, level: level ?? (phase === 'inhale' ? smooth(progress) : 1 - smooth(progress)) };
      }
      t -= duration * 1000;
    }
    return { phase: 'inhale', duration: config.inhale, progress: 0, level: 0 };
  }
  class BreathEngine {
    constructor(config = DEFAULTS, now = () => performance.now()) {
      if (!validConfig(config)) throw new TypeError('Invalid breathing configuration');
      this.config = Object.freeze(readConfig(config));
      this.now = now;
      this.reset();
    }
    get totalMs() { return this.config.sessionSeconds * 1000; }
    reset() { this.status = 'idle'; this.elapsedMs = 0; this.cycleOffsetMs = 0; this.lastNow = this.now(); }
    tick(now = this.now()) {
      if (this.status !== 'running') return this.snapshot();
      const delta = Math.min(Math.max(0, now - this.lastNow), Math.max(0, this.totalMs - this.elapsedMs));
      this.lastNow = now;
      this.elapsedMs += delta;
      this.cycleOffsetMs = (this.cycleOffsetMs + delta) % ((this.config.inhale + this.config.exhale + this.config.hold * 2) * 1000);
      if (this.elapsedMs >= this.totalMs) this.status = 'complete';
      return this.snapshot();
    }
    start(now = this.now()) {
      if (this.status === 'running') return;
      if (this.status === 'idle' || this.status === 'complete') this.reset();
      this.lastNow = now; this.status = 'running';
    }
    pause(now = this.now()) {
      this.tick(now);
      if (this.status === 'running') this.status = 'paused';
      return this.snapshot();
    }
    applyConfig(next, now = this.now()) {
      if (!validConfig(next)) throw new TypeError('Invalid breathing configuration');
      this.tick(now);
      const old = phaseAt(this.cycleOffsetMs, this.config);
      const resolved = readConfig(next);
      this.config = Object.freeze(resolved);
      // Preserve the phase and volume when timings change, including which
      // side of the breath a hold belongs to.
      if (old.phase === 'inhale') this.cycleOffsetMs = old.progress * resolved.inhale * 1000;
      else if (old.phase === 'exhale') this.cycleOffsetMs = (resolved.inhale + resolved.hold + old.progress * resolved.exhale) * 1000;
      else if (old.level === 1) this.cycleOffsetMs = (resolved.inhale + old.progress * resolved.hold) * 1000;
      else this.cycleOffsetMs = resolved.hold ? (resolved.inhale + resolved.hold + resolved.exhale + old.progress * resolved.hold) * 1000 : 0;
      if (this.status !== 'idle' && this.elapsedMs >= this.totalMs) this.status = 'complete';
      this.lastNow = now;
    }
    snapshot() {
      const phase = phaseAt(this.cycleOffsetMs, this.config);
      return { ...phase, status: this.status, elapsedMs: this.elapsedMs,
        remainingMs: this.status === 'complete' ? 0 : Math.max(0, this.totalMs - this.elapsedMs),
        showCountdown: this.config.showCountdown };
    }
  }
  function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function dateFromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }
  function formatClock(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  const api = { DEFAULTS, RANGES, readConfig, validConfig, phaseAt, BreathEngine, localDateKey, dateFromKey, formatClock, smooth, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BreathingCore = api;
})(typeof window === 'undefined' ? globalThis : window);
