'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const runtimeURL = pathToFileURL(path.join(__dirname, '..', 'scene-runtime.js')).href;

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, detail = {}) {
      const event = { type, preventDefault() { this.defaultPrevented = true; }, ...detail };
      for (const callback of [...listeners.get(type) || []]) callback(event);
      return event;
    }
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function sceneHandle(id) {
  return {
    scene: { id }, camera: { id }, updates: [], sizes: [], disposed: 0,
    update(time, delta) { this.updates.push({ time, delta }); },
    resize(width, height) { this.sizes.push({ width, height }); },
    dispose() { this.disposed++; }
  };
}

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

async function harness(options = {}) {
  const { SceneRuntime } = await import(runtimeURL);
  const frames = new Map();
  const observers = [];
  const requested = [];
  const handles = [];
  let nextFrame = 0;
  let width = options.width ?? 390, height = options.height ?? 844;
  const reduced = { ...eventTarget(), matches: !!options.reduced };
  const window = {
    ...eventTarget(), devicePixelRatio: options.dpr ?? 3,
    matchMedia: () => reduced,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  const document = { ...eventTarget(), hidden: !!options.hidden };
  const classes = new Set();
  const classList = {
    add: name => classes.add(name), remove: name => classes.delete(name),
    contains: name => classes.has(name),
    toggle(name, force) {
      const add = force === undefined ? !classes.has(name) : force;
      if (add) classes.add(name); else classes.delete(name);
      return add;
    }
  };
  const canvas = {
    ...eventTarget(), width: 0, height: 0, style: {}, dataset: {}, classList,
    setAttribute(name, value) { this[name] = String(value); },
    removeAttribute(name) { delete this[name]; }
  };
  const world = {
    dataset: { scene: options.scene ?? 'ocean' }, classList,
    getBoundingClientRect: () => ({ width, height }),
    querySelector(selector) {
      const id = selector.match(/(?:scene-layer|scene)=?["']?([a-z]+)/)?.[1] || this.dataset.scene;
      return { currentSrc: '/assets/scenes/' + id + '.jpg', src: '/assets/scenes/' + id + '.jpg' };
    }
  };
  let rendererCreates = 0;
  const renderer = {
    renders: [], sizes: [], clears: 0, disposed: 0,
    setSize(width, height, pixelRatio) { this.sizes.push({ width, height, pixelRatio }); },
    render(scene, camera) { this.renders.push({ scene, camera }); },
    clear() { this.clears++; }, dispose() { this.disposed++; }
  };
  const runtime = new SceneRuntime(world, canvas, {
    window, document,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
    createRenderer(args) { rendererCreates++; return options.createRenderer ? options.createRenderer(args, renderer) : renderer; },
    createScene(args) {
      requested.push(args);
      if (options.createScene) return options.createScene(args);
      const handle = sceneHandle(args.id); handles.push(handle); return handle;
    }
  });
  return {
    runtime, renderer, handles, frames, window, document, world, canvas, reduced, observers, requested,
    get rendererCreates() { return rendererCreates; },
    async ready() { await runtime.ready; await flush(); },
    frame(time) {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(time);
    },
    scene(id) { world.dataset.scene = id; runtime.setScene(id); },
    visibility(hidden) { document.hidden = hidden; document.emit('visibilitychange'); },
    reduce(value) { reduced.matches = value; reduced.emit('change'); },
    resize(w, h) { width = w; height = h; window.emit('resize'); }
  };
}

test('GPU scenes start before practice, share one renderer and keep exactly one animation loop', async () => {
  const h = await harness(); await h.ready();
  assert.equal(h.rendererCreates, 1);
  assert.equal(h.requested[0].id, 'ocean');
  assert.equal(h.frames.size, 1);
  h.frame(0); h.frame(40);
  assert.ok(h.renderer.renders.length > 0);
  for (const id of ['cabin', 'mountain', 'ocean']) {
    h.scene(id); await h.ready(); h.runtime.syncPlayback(); h.runtime.syncPlayback();
    assert.equal(h.frames.size, 1, id + ' must have one frame owner');
  }
  assert.equal(h.rendererCreates, 1, 'scene switching reuses the WebGL context');
  assert.ok(h.handles.slice(0, -1).every(handle => handle.disposed === 1));
  h.scene('none'); await h.ready();
  assert.equal(h.frames.size, 0);
  h.runtime.destroy();
  assert.equal(h.renderer.disposed, 1);
});

test('off, legacy, hidden and reduced-motion starts do not allocate a GPU renderer', async () => {
  for (const options of [{ scene: 'none' }, { scene: 'forest' }, { hidden: true }, { reduced: true }]) {
    const h = await harness(options); await h.ready();
    assert.equal(h.rendererCreates, 0, JSON.stringify(options));
    assert.equal(h.frames.size, 0);
    h.runtime.destroy();
  }
});

test('a slow previous scene cannot replace the most recently selected scene', async () => {
  const jobs = new Map();
  const h = await harness({ createScene({ id }) { const job = deferred(); jobs.set(id, job); return job.promise; } });
  await flush();
  const oldReady = h.runtime.ready;
  h.scene('cabin'); await flush();
  const ocean = sceneHandle('ocean'), cabin = sceneHandle('cabin');
  jobs.get('cabin').resolve(cabin); await h.ready();
  jobs.get('ocean').resolve(ocean); await oldReady; await flush();
  assert.equal(ocean.disposed, 1, 'superseded GPU resources must be released');
  assert.equal(cabin.disposed, 0);
  h.frame(0); h.frame(40);
  assert.equal(h.renderer.renders.at(-1).scene.id, 'cabin');
  assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('switching background off during loading disposes the result and does not restart rendering', async () => {
  const job = deferred(), ocean = sceneHandle('ocean');
  const h = await harness({ createScene: () => job.promise }); await flush();
  const loading = h.runtime.ready;
  h.scene('none'); job.resolve(ocean); await loading; await h.ready();
  assert.equal(ocean.disposed, 1);
  assert.equal(h.frames.size, 0);
  h.runtime.destroy();
});

test('visibility, page cache and reduced-motion pause the clock and resume without a large time jump', async () => {
  const h = await harness({ scene: 'cabin' }); await h.ready();
  h.frame(0); h.frame(40);
  const elapsed = h.runtime.elapsed;
  h.visibility(true); assert.equal(h.frames.size, 0);
  h.visibility(false); await h.ready(); assert.equal(h.frames.size, 1);
  h.frame(90000); assert.equal(h.runtime.elapsed, elapsed);
  h.frame(90040); assert.ok(h.runtime.elapsed > elapsed && h.runtime.elapsed - elapsed <= .1);
  h.window.emit('pagehide'); assert.equal(h.frames.size, 0);
  h.window.emit('pageshow'); await h.ready(); assert.equal(h.frames.size, 1);
  h.reduce(true); assert.equal(h.frames.size, 0);
  h.reduce(false); await h.ready(); assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('an initially hidden GPU scene initializes when it becomes visible', async () => {
  const h = await harness({ hidden: true }); await h.ready();
  h.visibility(false); await h.ready();
  assert.equal(h.rendererCreates, 1);
  assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('context loss pauses rendering and context restoration rebuilds the current scene', async () => {
  const h = await harness(); await h.ready();
  const first = h.handles[0];
  const event = h.canvas.emit('webglcontextlost');
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.frames.size, 0);
  h.canvas.emit('webglcontextrestored'); await h.ready();
  assert.equal(h.requested.at(-1).id, 'ocean');
  assert.ok(h.handles.length >= 2, 'context restoration builds fresh scene resources');
  assert.equal(first.disposed, 1);
  assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('rendering is capped, delayed frames are clamped and a large viewport remains bounded', async () => {
  const h = await harness({ width: 3840, height: 2160, dpr: 3 }); await h.ready();
  const initial = h.renderer.renders.length;
  for (let time = 0; time <= 1000; time += 5) h.frame(time);
  const draws = h.renderer.renders.length - initial;
  assert.ok(draws >= 20 && draws <= 32, 'background rendering must remain near the 30 fps budget');
  const elapsed = h.runtime.elapsed;
  h.frame(80000);
  assert.ok(h.runtime.elapsed - elapsed <= .100001, 'a delayed frame cannot launch rain across the scene');
  const size = h.renderer.sizes.at(-1);
  assert.ok(size.pixelRatio <= 1.25);
  assert.ok(size.width * size.height * size.pixelRatio ** 2 <= 1800001, 'GPU drawing surface must be bounded');
  h.resize(844, 390);
  assert.deepEqual(h.handles.at(-1).sizes.at(-1), { width: 844, height: 390 });
  h.runtime.destroy();
});

test('destroy during pending initialization disposes late resources and detaches all listeners', async () => {
  const job = deferred(), ocean = sceneHandle('ocean');
  const h = await harness({ createScene: () => job.promise }); await flush();
  const loading = h.runtime.ready;
  h.runtime.destroy(); job.resolve(ocean); await loading; await flush();
  assert.equal(ocean.disposed, 1);
  assert.equal(h.renderer.disposed, 1);
  assert.equal(h.frames.size, 0);
  assert.ok(h.observers.every(observer => observer.disconnected));
  for (const target of [h.window, h.document, h.canvas, h.reduced]) {
    assert.ok([...target.listeners.values()].every(callbacks => callbacks.size === 0));
  }
});

test('a renderer initialization failure leaves the photograph usable and can be retried explicitly', async () => {
  let attempts = 0;
  const h = await harness({ createRenderer(args, renderer) {
    if (++attempts === 1) throw new Error('WebGL context temporarily unavailable');
    return renderer;
  } });
  await h.ready();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvas.classList.contains('is-ready'), false);
  assert.equal(h.handles.length, 0);
  h.scene('ocean'); await h.ready();
  assert.equal(attempts, 2);
  assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('destroy while the renderer itself is loading releases the late context without loading a scene', async () => {
  const job = deferred();
  const h = await harness({ createRenderer: () => job.promise }); await flush();
  const loading = h.runtime.ready;
  h.runtime.destroy(); job.resolve(h.renderer); await loading;
  assert.equal(h.renderer.disposed, 1);
  assert.equal(h.requested.length, 0);
  assert.equal(h.frames.size, 0);
});

test('resizing during a texture load applies the current viewport before displaying the scene', async () => {
  const job = deferred(), cabin = sceneHandle('cabin');
  const h = await harness({ scene: 'cabin', createScene: () => job.promise }); await flush();
  h.resize(844, 390);
  job.resolve(cabin); await h.ready();
  assert.deepEqual(cabin.sizes.at(-1), { width: 844, height: 390 });
  assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('a texture or scene factory failure retains the still photo and a reselect retries it', async () => {
  let attempts = 0;
  const handle = sceneHandle('cabin');
  const h = await harness({ scene: 'cabin', createScene() {
    if (++attempts === 1) return Promise.reject(new Error('Photo texture could not be decoded'));
    return handle;
  } });
  await h.ready();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvas.classList.contains('is-ready'), false);
  h.scene('cabin'); await h.ready();
  assert.equal(attempts, 2);
  assert.equal(h.frames.size, 1);
  assert.equal(h.canvas.classList.contains('is-ready'), true);
  h.runtime.destroy();
});

test('a shader or draw failure clears the failed scene instead of leaving a black canvas or retry loop', async () => {
  let render;
  const h = await harness({ createRenderer(args, renderer) {
    render = renderer.render.bind(renderer);
    renderer.render = () => { throw new Error('Shader program link failed'); };
    return renderer;
  } });
  await h.ready();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvas.classList.contains('is-ready'), false);
  assert.equal(h.handles[0].disposed, 1);
  h.runtime.syncPlayback(); await h.ready();
  assert.equal(h.handles.length, 1, 'a failed shader must not be rebuilt each frame');
  h.renderer.render = render;
  h.scene('ocean'); await h.ready();
  assert.equal(h.frames.size, 1);
  h.runtime.destroy();
});

test('texture loads completing while hidden or reduced-motion do not start drawing', async () => {
  for (const pause of ['hidden', 'reduced']) {
    const job = deferred(), handle = sceneHandle('cabin');
    const h = await harness({ scene: 'cabin', createScene: () => job.promise }); await flush();
    if (pause === 'hidden') h.visibility(true); else h.reduce(true);
    job.resolve(handle); await h.ready();
    assert.equal(h.frames.size, 0, pause);
    assert.equal(h.renderer.renders.length, 0, pause);
    if (pause === 'hidden') h.visibility(false); else h.reduce(false);
    await h.ready();
    assert.equal(h.requested.length, 1, 'resume reuses the completed resource');
    assert.equal(h.frames.size, 1);
    h.runtime.destroy();
  }
});

test('an obsolete scene load failure cannot disable a newer successful scene', async () => {
  const old = deferred();
  const h = await harness({ createScene: ({ id }) => id === 'ocean' ? old.promise : sceneHandle(id) });
  await flush(); const previousReady = h.runtime.ready;
  h.scene('mountain'); await h.ready();
  old.reject(new Error('Superseded download failed')); await previousReady;
  h.frame(0); h.frame(40);
  assert.equal(h.renderer.renders.at(-1).scene.id, 'mountain');
  assert.equal(h.frames.size, 1);
  assert.equal(h.canvas.classList.contains('is-ready'), true);
  h.runtime.destroy();
});
