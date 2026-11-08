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
  renderer.setFrame(frame(134));
  assert.equal(drawn.length, 2);
  renderer.setFrame(frame(900));
  assert.equal(drawn.length, 3, 'delayed frames still draw without resetting particles');
  assert.equal(reseeds, 0);
  assert.ok(drawn.every(dt => dt >= 0 && dt <= .05), 'particle displacement remains bounded');
  renderer.destroy();
});
