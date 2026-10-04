'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DEFAULTS, BreathEngine, phaseAt, readConfig } = require('../engine.js');

test('calendar overview limits the current streak to the displayed month', () => {
  const { localDateKey, dateFromKey } = require('../engine.js');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const calendarCode = app.slice(app.indexOf('  function currentStreak('), app.indexOf('  function changeMonth('));
  function overview(today, dates, displayedMonth = today.slice(0, 7)) {
    const elements = new Map();
    const element = () => ({ classList: { toggle() {} }, dataset: {}, append() {}, setAttribute() {}, replaceChildren() {} });
    const context = {
      Date, Set, Map, Intl,
      records: dates.map(date => ({ date, durationMs: 600000 })),
      viewMonth: dateFromKey(`${displayedMonth}-01`), dailyGoalMinutes: 10,
      localDateKey: date => date ? localDateKey(date) : today, dateFromKey,
      isZh: () => true,
      $: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      setText: (id, text) => { context.$(id).textContent = text; },
      document: { createDocumentFragment: element, createElement: element }
    };
    vm.runInNewContext(`${calendarCode}\nrenderCalendar();`, context);
    return { streak: elements.get('streak-badge').textContent, hidden: elements.get('streak-badge').hidden, days: elements.get('stat-days').textContent };
  }
  assert.deepEqual(overview('2026-10-01', ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']), { streak: '连续 1 天', hidden: false, days: '1' });
  assert.deepEqual(overview('2027-01-01', ['2026-12-31', '2027-01-01']), { streak: '连续 1 天', hidden: false, days: '1' });
  assert.deepEqual(overview('2026-10-01', ['2026-09-30']), { streak: '连续 0 天', hidden: true, days: '0' });
  assert.deepEqual(overview('2026-10-04', ['2026-10-01', '2026-10-02', '2026-10-02', '2026-10-03']), { streak: '连续 3 天', hidden: false, days: '3' });
  assert.deepEqual(overview('2026-10-04', ['2026-10-01', '2026-10-03', '2026-10-04']), { streak: '连续 2 天', hidden: false, days: '3' });
  assert.equal(overview('2026-10-01', ['2026-09-30', '2026-10-01'], '2026-09').hidden, true);
});

test('breathing phases follow the configured monotonic timeline', () => {
  assert.equal(phaseAt(0, DEFAULTS).phase, 'inhale');
  assert.deepEqual([phaseAt(4000, DEFAULTS).phase, phaseAt(4000, DEFAULTS).level], ['hold', 1]);
  assert.equal(phaseAt(6000, DEFAULTS).phase, 'exhale');
  assert.deepEqual([phaseAt(12000, DEFAULTS).phase, phaseAt(12000, DEFAULTS).level], ['hold', 0]);
  assert.equal(phaseAt(14000, DEFAULTS).phase, 'inhale');
  assert.equal(phaseAt(10000, { ...DEFAULTS, hold: 0 }).phase, 'inhale');
});

function soundHarness(config = DEFAULTS, hidden = false) {
  let now = 0, timerId = 0;
  const timers = new Map(), tones = [], envelopes = [], elements = new Map();
  const engine = new BreathEngine(config, () => now);
  const context = {
    engine, audioContext: null, toneOscillator: null, toneGain: null, lastTonePhase: null,
    raf: 0, phaseTimer: 0, settle: null, session: null,
    renderer: { frame: { level: 0 }, motion: { matches: true }, seedParticles() {}, setFrame() {} },
    performance: { now: () => now },
    document: { hidden, body: { dataset: {} } },
    window: { AudioContext: class {
      state = 'running';
      get currentTime() { return now / 1000; }
      createOscillator() { return { connect() {}, start() {}, frequency: { setValueAtTime: frequency => tones.push([now, frequency]) } }; }
      createGain() { return { connect() {}, gain: {
        cancelScheduledValues: time => envelopes.push(['cancel', time]),
        setValueAtTime: (value, time) => envelopes.push(['set', value, time]),
        linearRampToValueAtTime: (value, time) => envelopes.push(['linear', value, time]),
        exponentialRampToValueAtTime: (value, time) => envelopes.push(['exponential', value, time])
      } }; }
    } },
    $: id => { if (!elements.has(id)) elements.set(id, { dataset: {}, setAttribute() {} }); return elements.get(id); },
    setText() {}, phaseWord: phase => phase, tr: zh => zh, isZh: () => true,
    formatClock: () => '', smooth: t => t,
    localDateKey: () => '2026-10-04', lastDate: '2026-10-04',
    completeIfNeeded() {}, requestWakeLock() {}, releaseWakeLock() {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const audioCode = app.slice(app.indexOf('  function ensureAudio('), app.indexOf('  async function requestWakeLock('));
  const timingCode = app.slice(app.indexOf('  function render('), app.indexOf('  function openModal('));
  vm.createContext(context);
  vm.runInContext(`${audioCode}\n${timingCode}\nensureAudio(); engine.start(); schedule();`, context);
  return {
    tones, envelopes, engine, context,
    run: code => vm.runInContext(code, context),
    advance(ms) {
      const target = now + ms;
      while (timers.size) {
        const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (timer.at > target) break;
        now = timer.at; timers.delete(id); timer.callback();
      }
      now = target;
    }
  };
}

test('phase cues use equal pitch and gain, distinct lengths and smooth fades to silence', () => {
  const harness = soundHarness();
  const lengths = {};
  for (const phase of ['inhale', 'hold', 'exhale']) {
    harness.envelopes.length = 0;
    harness.run(`playTone('${phase}');`);
    const events = harness.envelopes;
    const peak = events.find(event => event[0] === 'linear' && event[1] > 0);
    const sustain = events.find(event => event[0] === 'set' && event[1] > 0);
    assert.equal(harness.tones.at(-1)[1], 330);
    assert.equal(peak[1], 0.1);
    assert.equal(sustain[1], peak[1]);
    assert.ok(peak[2] > 0);
    assert.ok(sustain[2] > peak[2]);
    assert.equal(events.at(-1)[0], 'linear');
    assert.equal(events.at(-1)[1], 0);
    assert.ok(events.at(-1)[2] > sustain[2]);
    lengths[phase] = events.at(-1)[2];
  }
  assert.ok(lengths.hold < lengths.inhale / 2);
  assert.equal(lengths.inhale, 0.4);
  assert.ok(lengths.inhale < lengths.exhale);
  assert.ok(lengths.exhale < 1); // Finish before even a one-second phase changes.
});

for (const hidden of [false, true]) {
  test(`every phase plays a cue including both holds (${hidden ? 'background' : 'foreground without animation frames'})`, () => {
    const harness = soundHarness(DEFAULTS, hidden);
    harness.advance(14000);
    assert.deepEqual(harness.tones, [[0, 330], [4000, 330], [6000, 330], [12000, 330], [14000, 330]]);
    harness.run('render(); render();');
    assert.equal(harness.tones.length, 5);
  });
}

test('phase cues stop when paused and skip holds configured to zero', async () => {
  const harness = soundHarness({ ...DEFAULTS, hold: 0 }, true);
  harness.advance(4000);
  harness.run('pause();'); harness.advance(20000);
  assert.deepEqual(harness.tones, [[0, 330], [4000, 330]]);
  await harness.run('start();'); harness.advance(6000);
  assert.deepEqual(harness.tones, [[0, 330], [4000, 330], [30000, 330]]);
});

test('an interrupted audio context can retry the current hold cue after recovery', () => {
  const harness = soundHarness();
  harness.context.audioContext.state = 'suspended';
  harness.advance(4000);
  assert.deepEqual(harness.tones, [[0, 330]]);
  harness.context.audioContext.state = 'running';
  harness.run('render(); render();');
  assert.deepEqual(harness.tones, [[0, 330], [4000, 330]]);
});

test('phase cues stop at session completion and reset', () => {
  const completed = soundHarness(readConfig({ ...DEFAULTS, sessionSeconds: 6 }), true);
  completed.advance(20000);
  assert.equal(completed.engine.status, 'complete');
  assert.deepEqual(completed.tones, [[0, 330], [4000, 330]]);
  const reset = soundHarness();
  reset.advance(4000); reset.run('reset();'); reset.advance(20000);
  assert.equal(reset.engine.status, 'idle');
  assert.deepEqual(reset.tones, [[0, 330], [4000, 330]]);
});

test('pause and resume exclude paused wall-clock time', () => {
  let now = 0;
  const engine = new BreathEngine(DEFAULTS, () => now);
  engine.start(); now = 3250; engine.pause(); now = 43000; engine.tick();
  assert.equal(engine.elapsedMs, 3250);
  engine.start(); now += 750; engine.tick();
  assert.equal(engine.elapsedMs, 4000);
  assert.equal(engine.snapshot().phase, 'hold');
  assert.equal(engine.snapshot().level, 1);
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

test('changing hold duration preserves the correct high or low hold', () => {
  let now = 0;
  const engine = new BreathEngine(DEFAULTS, () => now);
  engine.start(); now = 4500; engine.pause();
  engine.applyConfig(readConfig({ ...DEFAULTS, hold: 1 }));
  assert.equal(engine.snapshot().phase, 'hold');
  assert.equal(engine.snapshot().level, 1);
  assert.equal(engine.snapshot().progress, .25);
  engine.start(); now += 7500; engine.tick();
  assert.equal(engine.snapshot().phase, 'hold');
  assert.equal(engine.snapshot().level, 0);
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
