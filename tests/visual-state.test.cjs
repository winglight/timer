'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

test('active and paused practices hide the complete calendar and use the available width', () => {
  assert.match(css, /body:is\(\[data-status="running"\], \[data-status="paused"\]\) \.calendar-card\s*\{\s*display:\s*none;/);
  assert.match(css, /body:is\(\[data-status="running"\], \[data-status="paused"\]\) \.app\s*\{\s*grid-template-columns:/);
});

test('selected photographic scenes use a translucent orb without affecting the default scene', () => {
  assert.match(css, /body:not\(\[data-scene="none"\]\) \.orb-core\s*\{\s*background:\s*radial-gradient\([\s\S]*?rgba\(/);
  assert.match(css, /\.orb-core\s*\{[^}]*background:\s*radial-gradient\(/);
});

test('background ambient animations do not pulse opacity or repaint background position', () => {
  for (const name of ['scene-water-shimmer', 'scene-mist-drift', 'scene-warm-glow']) {
    const match = css.match(new RegExp('@keyframes\\s+' + name + '\\s*\\{([^\\n]*)\\}'));
    assert.ok(match, name + ' exists');
    assert.doesNotMatch(match[1], /opacity|background-position/, name + ' should animate transform only');
  }
});

test('delayed particle animation frames preserve the particle field and are frame-limited', () => {
  const spriteContext = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}
  };
  const sandbox = {
    window: { devicePixelRatio: 1 },
    document: { createElement: () => ({ getContext: () => spriteContext }) },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    ResizeObserver: class { observe() {} disconnect() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'corona.js'), 'utf8'), sandbox);
  const stage = { getBoundingClientRect: () => ({ width: 0 }) };
  const canvas = { getContext: () => ({}) };
  const core = { style: {} };
  const renderer = new sandbox.window.CoronaRenderer(stage, canvas, core);
  renderer.size = 600;
  const drawn = [];
  let reseeds = 0;
  renderer.draw = dt => drawn.push(dt);
  renderer.seedParticles = () => { reseeds++; };
  const frame = elapsedMs => ({ elapsedMs, status: 'running', phase: 'inhale', level: .5, progress: .5 });
  renderer.setFrame(frame(100));
  renderer.setFrame(frame(116));
  assert.equal(drawn.length, 1, 'short intervals do not redraw the expensive canvas');
  renderer.setFrame(frame(142));
  assert.equal(drawn.length, 2);
  renderer.setFrame(frame(900));
  assert.equal(drawn.length, 3, 'delayed frames still draw without resetting particles');
  assert.equal(reseeds, 0);
  assert.ok(drawn.every(dt => dt >= 0 && dt <= .05), 'particle displacement remains bounded');
  renderer.destroy();
});

test('idle scene animations are frozen and unnecessary forced compositor layers are absent', () => {
  assert.match(css, /body:not\(\[data-status="running"\]\) \.scene-layer\.active img,[\s\S]*?body:not\(\[data-status="running"\]\) \.scene-motion\s*\{\s*animation:\s*none !important;/);
  assert.match(css, /body\[data-status="running"\] \.scene-layer\.active img\s*\{\s*will-change:\s*transform;/);
  const link = css.match(/\.studio-link\s*\{([^}]*)\}/);
  const header = css.match(/\.header\{([^}]*)\}/);
  const stage = css.match(/\.stage\s*\{([^}]*)\}/);
  const canvas = css.match(/#corona\s*\{([^}]*)\}/);
  assert.ok(link && header && stage && canvas);
  assert.doesNotMatch(link[1], /will-change|backface-visibility|contain:\s*paint|translate3d/);
  assert.doesNotMatch(header[1], /isolation/);
  assert.doesNotMatch(stage[1], /contain:\s*layout paint/);
  assert.doesNotMatch(canvas[1], /contain:\s*paint|translate3d|backface-visibility/);
});

test('calendar glass does not continuously sample the scene behind it', () => {
  const card = css.match(/\.calendar-card\{([^}]*)\}/);
  assert.ok(card);
  assert.doesNotMatch(card[1], /backdrop-filter/);
  assert.match(card[1], /background:rgba\(10,26,30,\.84\)/);
});

test('breathing canvas caps GPU surface size and particle workload', () => {
  const corona = fs.readFileSync(path.join(__dirname, '..', 'corona.js'), 'utf8');
  assert.match(corona, /this\\.maxCount = 3800/);
  assert.match(corona, /Math\\.min\\(window\\.devicePixelRatio \\|\\| 1, 1\\.5\\)/);
  assert.match(corona, /elapsed - previousElapsed < 40/);
});
