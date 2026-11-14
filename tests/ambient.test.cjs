'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'ambient.js'), 'utf8');
const KEY = 'breathing-ambience-v2';
const soundIds = ['off', 'ocean', 'rain', 'birds', 'forest', 'brook', 'fire', 'breeze'];
const sceneIds = ['none', 'sunset', 'ocean', 'mountain', 'cabin', 'forest', 'waterfall', 'starlight', 'blossom', 'desert'];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const failure = name => Object.assign(new Error(name), { name });

class Element {
  constructor(id = '') {
    this.id = id; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map();
    this.textContent = ''; this.value = ''; this.open = false; this.parentElement = null;
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle: (name, force = !classes.has(name)) => { force ? classes.add(name) : classes.delete(name); return force; }
    };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, callback, options = {}) {
    const listeners = this.listeners.get(name) || [];
    listeners.push({ callback, capture: options === true || !!options.capture, once: !!options.once });
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, callback) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(listener => listener.callback !== callback));
  }
  emit(name, init = {}, capture) {
    const event = { type: name, target: this, isTrusted: true, ...init };
    for (const listener of [...this.listeners.get(name) || []]) {
      if (capture !== undefined && listener.capture !== capture) continue;
      listener.callback(event);
      if (listener.once) this.removeEventListener(name, listener.callback);
    }
    return event;
  }
  closest(selector) {
    const matches = selector.split(',').some(part => {
      part = part.trim();
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      if (part === '[data-sound]') return this.dataset.sound !== undefined;
      if (part === '[data-scene]') return this.dataset.scene !== undefined;
      return false;
    });
    return matches ? this : this.parentElement?.closest(selector) || null;
  }
  querySelector(selector) { return selector === '.sound-state' ? this.state : null; }
  querySelectorAll() { return []; }
}

function ambienceHarness(saved = { sound: 'ocean', scene: 'ocean', volume: 32 }, { playPlan = [], hidden = false, storageThrows = false } = {}) {
  const storage = new Map(saved === null ? [] : [[KEY, JSON.stringify(saved)]]);
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  for (const id of ['ambient-world', 'ambient-volume', 'ambient-volume-value', 'scene-menu', 'sound-menu', 'scene-current', 'sound-current', 'toast', 'toast-label']) get(id);
  get('scene-menu').classList.add('ambience-menu'); get('sound-menu').classList.add('ambience-menu');
  const buttons = new Map(soundIds.map(id => {
    const button = new Element(); button.dataset.sound = id; button.state = new Element();
    button.parentElement = get('sound-menu'); return [id, button];
  }));
  const sceneButtons = sceneIds.map(id => { const button = new Element(); button.dataset.scene = id; return button; });
  const layers = sceneIds.filter(id => id !== 'none').map(id => { const layer = new Element(); layer.dataset.sceneLayer = id; return layer; });
  get('ambient-world').querySelectorAll = () => layers;
  const document = new Element();
  document.hidden = hidden; document.visibilityState = hidden ? 'hidden' : 'visible';
  document.body = new Element(); document.body.dataset.status = 'idle';
  document.documentElement = new Element(); document.documentElement.lang = 'en';
  document.getElementById = get;
  document.querySelectorAll = selector => selector === '[data-sound]' ? [...buttons.values()] : selector === '[data-scene]' ? sceneButtons : [];
  const window = new Element();
  window.localStorage = {
    getItem: key => { if (storageThrows) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (storageThrows) throw new Error('Storage unavailable'); storage.set(key, value); }
  };
  const timers = new Map(); let nextTimer = 0;
  window.setTimeout = callback => { const id = ++nextTimer; timers.set(id, callback); return id; };
  window.clearTimeout = id => timers.delete(id);
  const audio = [];
  class MockAudio extends Element {
    constructor() {
      super(); this.paused = true; this.readyState = 0; this.currentTime = 0; this.playCalls = 0; this.pauseCalls = 0;
      this.src = ''; this.error = null; audio.push(this);
    }
    play() {
      this.playCalls++;
      const behavior = playPlan.shift();
      if (behavior) return behavior(this);
      this.startPlaying(); return Promise.resolve();
    }
    startPlaying() { this.paused = false; this.readyState = 4; this.emit('play'); this.emit('playing'); }
    pause() { this.pauseCalls++; const wasPlaying = !this.paused; this.paused = true; if (wasPlaying) this.emit('pause'); }
    load() { this.readyState = 0; }
    removeAttribute(name) { super.removeAttribute(name); if (name === 'src') this.src = ''; }
  }
  const observers = [];
  const sandbox = { document, window, Audio: MockAudio,
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
    console, navigator: { userActivation: { isActive: true } }
  };
  vm.runInNewContext(source, sandbox);
  function gesture(type = 'click', target = get('timer-toggle'), init = {}) {
    const event = { target, isTrusted: true, ...init };
    document.emit(type, event, true);
    target.emit(type, event);
    document.emit(type, event, false);
  }
  return {
    get, document, window, audio, playPlan, storage, observers,
    saved: () => JSON.parse(storage.get(KEY) || '{}'),
    state: () => get('sound-menu').dataset.playbackState,
    choose: id => gesture('click', buttons.get(id)), gesture,
    visibility(value) { document.hidden = value; document.visibilityState = value ? 'hidden' : 'visible'; document.emit('visibilitychange'); }
  };
}

test('a saved enabled recording starts on page load and restores volume without a gesture', async () => {
  const h = ambienceHarness(); await flush();
  assert.equal(h.audio.length, 1); assert.equal(h.audio[0].playCalls, 1);
  assert.equal(h.audio[0].volume, .32); assert.equal(h.audio[0].loop, true);
  assert.equal(h.state(), 'playing');
  assert.match(h.get('sound-current').textContent, /ocean/i);
});

test('blocked autoplay shows an activation state, then one trusted click resumes the same recording', async () => {
  const h = ambienceHarness(undefined, { playPlan: [() => Promise.reject(failure('NotAllowedError'))] });
  await flush(); assert.equal(h.state(), 'blocked');
  assert.equal(h.get('sound-current').textContent, 'Tap to play', 'the compact picker keeps the recovery action visible');
  assert.equal(h.get('toast').classList.contains('show'), false, 'policy denial is not presented as a broken recording');
  h.gesture('click', undefined, { isTrusted: false }); await flush();
  assert.equal(h.audio[0].playCalls, 1, 'synthetic input must not claim audio was unlocked');
  h.gesture(); await flush();
  assert.equal(h.audio.length, 1); assert.equal(h.audio[0].playCalls, 2); assert.equal(h.state(), 'playing');
  h.gesture(); h.gesture('keydown', undefined, { key: 'Enter' }); await flush();
  assert.equal(h.audio[0].playCalls, 2, 'unrelated input never toggles or duplicates established playback');
});

test('touch and keyboard activation can retry after a policy denial', async () => {
  for (const [type, event] of [['touchend', {}], ['keydown', { key: 'Enter' }]]) {
    const h = ambienceHarness(undefined, { playPlan: [() => Promise.reject(failure('NotAllowedError'))] });
    await flush(); h.gesture(type, undefined, event); await flush();
    assert.equal(h.state(), 'playing', type);
    assert.equal(h.audio.length, 1, type);
  }
});

test('a trusted gesture retries a still-pending paused startup instead of waiting on its promise', async () => {
  let rejectInitial;
  const h = ambienceHarness(undefined, { playPlan: [() => new Promise((resolve, reject) => { rejectInitial = reject; })] });
  assert.equal(h.state(), 'loading'); assert.equal(h.audio[0].paused, true);
  h.gesture(); await flush();
  assert.equal(h.audio[0].playCalls, 2); assert.equal(h.state(), 'playing');
  rejectInitial(failure('NotAllowedError')); await flush();
  assert.equal(h.state(), 'playing', 'the stale denial cannot overwrite the newer successful gesture');
});

test('off and explicitly paused preferences stay silent through reload and ordinary interactions', async () => {
  for (const saved of [{ sound: 'off', volume: 24 }, { sound: 'ocean', enabled: false, volume: 24 }, null]) {
    const h = ambienceHarness(saved); await flush();
    h.gesture(); h.gesture('touchend'); h.gesture('keydown', undefined, { key: 'Enter' });
    h.visibility(true); h.visibility(false); h.window.emit('pageshow'); await flush();
    assert.equal(h.audio.reduce((total, track) => total + track.playCalls, 0), 0);
    assert.equal(h.state(), saved?.sound === 'ocean' ? 'paused' : 'off');
  }
});

test('selecting the current recording pauses and persists intent, without the bubbling click resuming it', async () => {
  const h = ambienceHarness(); await flush();
  h.choose('ocean'); await flush();
  assert.equal(h.state(), 'paused'); assert.equal(h.saved().enabled, false); assert.equal(h.saved().sound, 'ocean');
  h.gesture(); h.visibility(true); h.visibility(false); await flush();
  assert.equal(h.audio[0].paused, true); assert.equal(h.audio[0].playCalls, 1);
  h.choose('ocean'); await flush();
  assert.equal(h.state(), 'playing'); assert.equal(h.saved().enabled, true); assert.equal(h.audio[0].playCalls, 2);
});

test('new track preference is saved before the play promise resolves or rejects', async () => {
  const h = ambienceHarness({ sound: 'off', volume: 24 });
  let rejectPlay;
  h.playPlan.push(() => new Promise((resolve, reject) => { rejectPlay = reject; }));
  h.choose('rain');
  assert.equal(h.saved().sound, 'rain'); assert.equal(h.saved().enabled, true); assert.equal(h.state(), 'loading');
  rejectPlay(failure('NotAllowedError')); await flush();
  assert.equal(h.saved().sound, 'rain'); assert.equal(h.state(), 'blocked');
});

test('late completions and events from a replaced recording cannot revive it or overwrite the current selection', async () => {
  let resolveOld;
  const h = ambienceHarness(undefined, { playPlan: [() => new Promise(resolve => { resolveOld = resolve; })] });
  const old = h.audio[0];
  h.choose('rain'); await flush();
  const current = h.audio.at(-1);
  assert.notEqual(old, current); assert.equal(h.state(), 'playing'); assert.equal(h.saved().sound, 'rain');
  old.emit('playing'); resolveOld(); old.emit('error'); await flush();
  assert.equal(old.paused, true, 'disposing the old source leaves it paused when queued events arrive');
  assert.equal(old.src, '', 'the replaced source is unloaded');
  assert.equal(h.state(), 'playing'); assert.equal(h.saved().sound, 'rain');
  assert.equal(current.paused, false); assert.equal(h.get('toast').classList.contains('show'), false);
});

test('choosing off invalidates pending playback and prevents gesture or lifecycle recovery', async () => {
  let resolveOld;
  const h = ambienceHarness(undefined, { playPlan: [() => new Promise(resolve => { resolveOld = resolve; })] });
  const old = h.audio[0]; h.choose('off');
  assert.equal(h.saved().sound, 'off'); assert.equal(h.saved().enabled, false); assert.equal(h.state(), 'off');
  old.emit('playing'); resolveOld(); await flush();
  h.gesture(); h.visibility(true); h.visibility(false); h.window.emit('pageshow'); await flush();
  assert.equal(old.paused, true); assert.equal(h.state(), 'off'); assert.equal(old.playCalls, 1);
});

test('tab visibility preserves ongoing ambient playback and recovers a browser-induced pause', async () => {
  const h = ambienceHarness(); await flush();
  const calls = h.audio[0].playCalls;
  h.visibility(true); await flush(); assert.equal(h.audio[0].paused, false); assert.equal(h.saved().enabled, true);
  h.visibility(false); await flush(); assert.equal(h.audio[0].playCalls, calls, 'a visible tab does not restart audio that kept playing');
  h.audio[0].pause(); h.visibility(true); h.visibility(false); await flush();
  assert.equal(h.audio[0].playCalls, calls + 1); assert.equal(h.state(), 'playing');
});

test('an already requested recording may finish loading while its tab is hidden', async () => {
  let resolvePlay;
  const h = ambienceHarness(undefined, { playPlan: [() => new Promise(resolve => { resolvePlay = resolve; })] });
  h.visibility(true); h.audio[0].startPlaying(); resolvePlay(); await flush();
  assert.equal(h.audio[0].paused, false); assert.equal(h.state(), 'playing');
  h.visibility(false); await flush(); assert.equal(h.audio[0].playCalls, 1);
});

test('an initially hidden page waits for visibility and a back-forward cache restore reuses one player', async () => {
  const h = ambienceHarness(undefined, { hidden: true }); await flush();
  assert.equal(h.audio.length, 0);
  h.visibility(false); await flush();
  assert.equal(h.audio.length, 1); assert.equal(h.state(), 'playing');
  h.window.emit('pagehide', { persisted: true }); await flush();
  assert.equal(h.audio[0].paused, true); assert.equal(h.saved().enabled, true);
  h.window.emit('pageshow', { persisted: true }); await flush();
  assert.equal(h.audio.length, 1); assert.equal(h.audio[0].playCalls, 2); assert.equal(h.state(), 'playing');
});

test('a real media failure is distinct from autoplay denial and is recoverable by choosing the track again', async () => {
  const h = ambienceHarness(undefined, { playPlan: [() => Promise.reject(failure('NotSupportedError'))] });
  await flush(); assert.equal(h.state(), 'error'); assert.equal(h.get('toast').classList.contains('show'), true);
  h.visibility(true); h.visibility(false); h.window.emit('pageshow'); await flush();
  assert.equal(h.state(), 'error'); assert.equal(h.audio[0].playCalls, 1, 'lifecycle changes do not repeatedly retry broken media');
  h.choose('ocean'); await flush(); assert.equal(h.state(), 'playing');
});

test('blocked localStorage does not prevent sound selection or playback', async () => {
  const h = ambienceHarness(null, { storageThrows: true }); h.choose('rain'); await flush();
  assert.equal(h.state(), 'playing'); assert.equal(h.audio.length, 1);
});
