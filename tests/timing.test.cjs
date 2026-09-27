'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, BreathEngine, phaseAt, readConfig } = require('../engine.js');

test('breathing phases follow the configured monotonic timeline', () => {
  assert.equal(phaseAt(0, DEFAULTS).phase, 'inhale');
  assert.equal(phaseAt(4000, DEFAULTS).phase, 'exhale');
  assert.equal(phaseAt(10000, DEFAULTS).phase, 'hold');
  assert.equal(phaseAt(12000, DEFAULTS).phase, 'inhale');
  assert.equal(phaseAt(10000, { ...DEFAULTS, hold: 0 }).phase, 'inhale');
});

test('pause and resume exclude paused wall-clock time', () => {
  let now = 0;
  const engine = new BreathEngine(DEFAULTS, () => now);
  engine.start(); now = 3250; engine.pause(); now = 43000; engine.tick();
  assert.equal(engine.elapsedMs, 3250);
  engine.start(); now += 750; engine.tick();
  assert.equal(engine.elapsedMs, 4000);
  assert.equal(engine.snapshot().phase, 'exhale');
});

test('exact MM:SS session lengths are supported without rounding', () => {
  let now = 0;
  const config = readConfig({ ...DEFAULTS, minutes: 10, sessionSeconds: 630 });
  const engine = new BreathEngine(config, () => now);
  assert.equal(engine.totalMs, 630000);
  engine.start(); now = 629999; engine.tick(); assert.equal(engine.status, 'running');
  now = 630000; engine.tick(); assert.equal(engine.status, 'complete');
});

test('changing rhythm preserves elapsed time and normalized phase progress', () => {
  let now = 0;
  const engine = new BreathEngine(DEFAULTS, () => now);
  engine.start(); now = 2000; engine.pause();
  const before = engine.snapshot();
  engine.applyConfig(readConfig({ ...DEFAULTS, inhale: 8, exhale: 8 }));
  assert.equal(engine.elapsedMs, 2000);
  assert.equal(engine.snapshot().phase, before.phase);
  assert.equal(engine.snapshot().progress, before.progress);
});

test('page keeps sound, R2 sync, records, export, wake lock and prototype assets wired', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const marker of ['styles.css', 'corona.js', 'app.js', 'r2-sync.js', 'jszip']) assert.ok(html.includes(marker));
  for (const marker of ['AudioContext', 'playTone', 'syncHistory', 'syncSettings', 'wakeLock', 'export-records', 'dailyGoalMinutes']) assert.ok(app.includes(marker));
});

test('Chinese and English can be switched and the preference is persisted', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(html.includes('id="language-toggle"'));
  for (const marker of ['breathing-language-v1', 'toggleLanguage', "language = isZh() ? 'en' : 'zh-CN'", "persist(KEYS.language, language)"]) assert.ok(app.includes(marker));
  for (const translation of ['Practice calendar', 'Practice settings', 'Cloud sync is off.', 'No practice records yet', 'Enter a month (YYYY-MM)']) assert.ok(app.includes(translation));
});
