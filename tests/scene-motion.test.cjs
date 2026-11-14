'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'scene-motion.js'), 'utf8');
const sceneIds = ['sunset', 'ocean', 'mountain', 'cabin', 'forest', 'waterfall', 'starlight', 'blossom', 'desert'];

function eventTarget() {
  const events = new Map();
  return {
    events,
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
    removeEventListener(type, fn) { events.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of [...events.get(type) || []]) fn({ type, ...event }); }
  };
}

function sceneHarness({ scene = 'ocean', width = 1280, height = 800, dpr = 2, hidden = false, reduced = false } = {}) {
  const commands = [];
  const makeContext = record => new Proxy({}, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'createRadialGradient' || name === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args) => { if (record) commands.push([name, ...args.map(value => value && typeof value === 'object' ? 'image' : value)]); };
    },
    set(target, name, value) { target[name] = value; if (record) commands.push(['set', name, value]); return true; }
  });
  const context = makeContext(true);
  const canvas = { width: 0, height: 0, getContext: () => context };
  const images = new Map(sceneIds.map(id => [id, { ...eventTarget(), complete: true, naturalWidth: 2400, naturalHeight: 1600 }]));
  const world = {
    dataset: { scene }, getBoundingClientRect: () => ({ width, height }),
    querySelector: selector => images.get(selector.match(/data-scene-layer="([^"]+)"/)?.[1]) || null
  };
  const document = {
    ...eventTarget(), hidden, body: { dataset: { status: 'idle' } },
    getElementById: () => null,
    createElement: () => ({ width: 0, height: 0, getContext: () => makeContext(false) })
  };
  const reducedMotion = { ...eventTarget(), matches: reduced };
  let frameCounter = 0;
  const frames = new Map();
  const window = {
    ...eventTarget(), devicePixelRatio: dpr, matchMedia: () => reducedMotion,
    requestAnimationFrame: fn => { const id = ++frameCounter; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  const observers = [];
  let randomState = 5723;
  const sandbox = { window, document,
    Math: Object.assign(Object.create(Math), { random: () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 4294967296;
    } }),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    }
  };
  vm.runInNewContext(source, sandbox);
  const renderer = new window.SceneMotion(world, canvas);
  return {
    renderer, window, document, reducedMotion, world, canvas, images, commands, frames, observers,
    frame(timestamp) { const queued = [...frames.values()]; frames.clear(); for (const callback of queued) callback(timestamp); },
    visibility(value) { document.hidden = value; document.emit('visibilitychange'); },
    reduced(value) { reducedMotion.matches = value; reducedMotion.emit('change'); },
    scene(value) { world.dataset.scene = value; observers[0].callback([{ attributeName: 'data-scene' }]); }
  };
}

test('a selected scene animates while the timer is idle and scene changes keep only one frame loop', () => {
  const h = sceneHarness();
  assert.equal(h.document.body.dataset.status, 'idle'); assert.equal(h.frames.size, 1);
  h.frame(0); h.frame(50);
  assert.ok(h.renderer.elapsed > 0, 'environmental movement starts without a breathing session');
  for (const scene of sceneIds) {
    h.scene(scene); h.renderer.syncPlayback(); h.renderer.syncPlayback();
    assert.equal(h.frames.size, 1, scene + ' owns a single animation loop');
    assert.ok(h.renderer.particles.length <= 240, 'particle workload remains bounded');
  }
  h.scene('none'); assert.equal(h.frames.size, 0);
  assert.equal(h.commands.at(-1)[0], 'clearRect');
  h.scene('invalid-scene'); assert.equal(h.renderer.scene, 'none'); assert.equal(h.frames.size, 0);
  h.renderer.destroy();
});

test('hidden pages and page-cache suspension stop motion and resume without a time jump', () => {
  const h = sceneHarness({ scene: 'cabin' }); h.frame(0); h.frame(50);
  const elapsed = h.renderer.elapsed;
  h.visibility(true); assert.equal(h.frames.size, 0);
  h.frame(80000); assert.equal(h.renderer.elapsed, elapsed);
  h.visibility(false); assert.equal(h.frames.size, 1);
  h.frame(90000); assert.equal(h.renderer.elapsed, elapsed, 'the first visible frame resets the clock');
  h.frame(90050); assert.ok(h.renderer.elapsed > elapsed);
  h.window.emit('pagehide'); assert.equal(h.frames.size, 0);
  h.window.emit('pageshow'); assert.equal(h.frames.size, 1);
  h.renderer.destroy();
});

test('off, hidden and reduced-motion settings avoid starting an animation loop', () => {
  for (const options of [{ scene: 'none' }, { hidden: true }, { reduced: true }]) {
    const h = sceneHarness(options); assert.equal(h.frames.size, 0);
    h.renderer.destroy();
  }
  const h = sceneHarness(); h.reduced(true);
  assert.equal(h.frames.size, 0); assert.equal(h.commands.at(-1)[0], 'clearRect');
  h.reduced(false); assert.equal(h.frames.size, 1); h.renderer.destroy();
});

test('the renderer bounds pixel count, redraw rate and delayed-frame displacement', () => {
  const h = sceneHarness({ width: 3840, height: 2160, dpr: 3 });
  assert.ok(h.renderer.pixelRatio <= 1.25);
  assert.ok(h.canvas.width * h.canvas.height <= 1803000, 'rounding keeps the canvas near the 1.8MP budget');
  h.commands.length = 0;
  for (let time = 0; time <= 1000; time += 10) h.frame(time);
  const draws = h.commands.filter(command => command[0] === 'clearRect').length;
  assert.ok(draws >= 20 && draws <= 25, 'redraws remain bounded on a fast display');
  const elapsed = h.renderer.elapsed;
  h.frame(20000);
  assert.ok(h.renderer.elapsed - elapsed <= .100001, 'a delayed frame cannot fling rain or petals across the screen');
  h.renderer.destroy();
});

test('every scenery effect changes locally over time without moving the photograph or page DOM', () => {
  const h = sceneHarness();
  for (const scene of sceneIds) {
    h.scene(scene); h.renderer.elapsed = 0; h.commands.length = 0; h.renderer.draw();
    const first = JSON.stringify(h.commands);
    h.renderer.elapsed = 8; h.commands.length = 0; h.renderer.draw();
    assert.notEqual(JSON.stringify(h.commands), first, scene + ' has environmental movement');
    assert.equal(h.world.dataset.scene, scene);
    assert.equal(h.document.body.dataset.status, 'idle');
  }
  h.renderer.destroy();
});

test('water and cloud photo effects respect source cropping in portrait and landscape viewports', () => {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const h = sceneHarness({ width, height, scene: 'ocean' });
    const bounds = h.renderer.photoBounds;
    assert.ok(bounds.width >= width && bounds.height >= height, 'cover keeps the photograph filling the viewport');
    const center = h.renderer.sourcePoint(.5, .5);
    assert.equal(center.x, width / 2); assert.equal(center.y, height / 2);
    const horizon = Math.max(0, Math.min(height, h.renderer.sourcePoint(0, .60).y));
    h.commands.length = 0; h.renderer.draw();
    const photoStrips = h.commands.filter(command => command[0] === 'drawImage' && command.length === 10);
    assert.ok(photoStrips.length > 0);
    assert.ok(photoStrips.every(command => command[7] >= horizon), 'wave distortion stays below the photographed horizon');
    h.renderer.destroy();
  }
});

function drawAt(h, seconds) {
  h.renderer.elapsed = seconds;
  h.commands.length = 0;
  h.renderer.draw();
  return h.commands.map(command => [...command]);
}

function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function textureOffsets(commands) {
  return commands.filter(command => command[0] === 'drawImage' && command.length === 10).map(command => ({
    // Convert the sampled source position into destination CSS pixels. This
    // detects both source-window movement and destination displacement.
    x: command[6] - command[2] * command[8] / command[4],
    y: command[7] - command[3] * command[9] / command[5]
  }));
}

test('water and cloud textures move perceptibly over a short viewing interval on desktop and mobile', () => {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    for (const [scene, minimum, maximum] of [['ocean', 3, 50], ['sunset', 1.5, 35], ['mountain', 6, 65]]) {
      const h = sceneHarness({ scene, width, height });
      const first = textureOffsets(drawAt(h, 2));
      const second = textureOffsets(drawAt(h, 4.5));
      assert.ok(first.length > 10 && first.length === second.length, scene + ' renders a continuous local texture');
      const displacement = first.map((point, index) => Math.hypot(point.x - second[index].x, point.y - second[index].y));
      const movement = quantile(displacement, .75);
      assert.ok(movement >= minimum, `${scene} at ${width}px should visibly move in 2.5 seconds; observed ${movement.toFixed(2)}px`);
      assert.ok(movement <= maximum, scene + ' stays calm rather than moving across the viewport');
      h.renderer.destroy();
    }
  }
});

function drawingStrokes(commands) {
  let alpha = 1, width = 1, points = [];
  const strokes = [];
  for (const command of commands) {
    if (command[0] === 'set' && command[1] === 'globalAlpha') alpha = command[2];
    else if (command[0] === 'set' && command[1] === 'lineWidth') width = command[2];
    else if (command[0] === 'beginPath') points = [];
    else if (command[0] === 'moveTo' || command[0] === 'lineTo') points.push([command[1], command[2]]);
    else if (command[0] === 'stroke') strokes.push({ alpha, width, points });
  }
  return strokes;
}

test('rain reads as a visible rainfall field with enough contrast and coverage', () => {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const h = sceneHarness({ scene: 'cabin', width, height });
    const drops = drawingStrokes(drawAt(h, 2)).filter(stroke => stroke.points.length === 2 &&
      stroke.points[0][0] >= 0 && stroke.points[0][0] <= width && stroke.points[0][1] >= 0 && stroke.points[0][1] <= height);
    assert.ok(drops.length >= 90, `${width}px scene should show a rainfall field, not a handful of drops`);
    assert.ok(quantile(drops.map(drop => drop.alpha), .5) >= .3, 'rain retains contrast beneath the scene shade');
    assert.ok(quantile(drops.map(drop => drop.width), .5) >= 1, 'rain is not reduced to barely visible subpixel lines');
    assert.ok(drops.some(drop => drop.points[0][0] < width / 3) && drops.some(drop => drop.points[0][0] > width * 2 / 3), 'rain covers both sides of the scene');
    h.renderer.destroy();
  }
});

test('forest haze has visible contrast and traverses several mobile pixels in a few seconds', () => {
  const h = sceneHarness({ scene: 'forest', width: 390, height: 844 });
  const firstCommands = drawAt(h, 2), secondCommands = drawAt(h, 4.5);
  const first = firstCommands.filter(command => command[0] === 'drawImage' && command.length === 6);
  const second = secondCommands.filter(command => command[0] === 'drawImage' && command.length === 6);
  assert.ok(first.length >= 3 && first.length === second.length);
  const movement = first.map((command, index) => Math.abs(command[2] - second[index][2]));
  assert.ok(quantile(movement, .5) >= 5, 'cloud and fog movement is observable within a short glance');
  const alphas = firstCommands.filter(command => command[0] === 'set' && command[1] === 'globalAlpha').map(command => command[2]);
  assert.ok(Math.max(...alphas) >= .3, 'haze remains visible after the photograph and shade are composited');
  h.renderer.destroy();
});

test('destroy removes frame callbacks, observers and all lifecycle and photo listeners', () => {
  const h = sceneHarness(); h.scene('mountain');
  assert.equal(h.images.get('ocean').events.get('load')?.size, 0, 'switching scenes releases the previous image listener');
  h.renderer.destroy(); assert.equal(h.frames.size, 0); assert.ok(h.observers.every(observer => observer.disconnected));
  assert.equal(h.images.get('mountain').events.get('load')?.size, 0);
  for (const target of [h.window, h.document, h.reducedMotion]) {
    assert.ok([...target.events.values()].every(listeners => listeners.size === 0));
  }
  h.window.emit('pageshow'); h.document.emit('visibilitychange'); assert.equal(h.frames.size, 0);
});
