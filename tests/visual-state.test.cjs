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

test('toolbar and floating link do not depend on live breathing-canvas backdrop sampling', () => {
  const summary = css.match(/\\.ambience-menu>summary\\{([^}]*)\\}/);
  const popup = css.match(/\\.ambience-popover\\{([^}]*)\\}/);
  const link = css.match(/\\.studio-link\\s*\\{([^}]*)\\}/);
  const header = css.match(/\\.header\\{([^}]*)\\}/);
  const stage = css.match(/\\.stage\\s*\\{([^}]*)\\}/);
  const canvas = css.match(/#corona\\s*\\{([^}]*)\\}/);
  assert.ok(summary && popup && link && header && stage && canvas);
  assert.doesNotMatch(summary[1], /backdrop-filter/, 'toolbar cannot sample the animated backdrop');
  assert.doesNotMatch(popup[1], /backdrop-filter/, 'open menus must be stable during animation');
  assert.match(summary[1], /background:rgba\\(10,27,31,\\.86\\)/);
  assert.match(header[1], /isolation:isolate/);
  assert.match(link[1], /transform: translate3d\\(0, 0, 0\\)/);
  assert.match(link[1], /backface-visibility: hidden/);
  assert.match(stage[1], /contain: layout paint/);
  assert.match(canvas[1], /contain: paint/);
  assert.match(canvas[1], /transform: translate3d\\(0, 0, 0\\)/);
});

test('breathing canvas caps GPU surface size and particle workload', () => {
  const corona = fs.readFileSync(path.join(__dirname, '..', 'corona.js'), 'utf8');
  assert.match(corona, /this\\.maxCount = 3800/);
  assert.match(corona, /Math\\.min\\(window\\.devicePixelRatio \\|\\| 1, 1\\.5\\)/);
  assert.match(corona, /elapsed - previousElapsed < 40/);
});
