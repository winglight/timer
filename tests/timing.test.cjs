const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');

function harness({ pause = 0, delayedResume = false } = {}) {
  let now = 0;
  let resolveResume;
  const cues = [];
  const counts = { contexts: 0, oscillators: 0, gains: 0 };
  const element = () => ({ textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } });
  class AudioContext {
    constructor() { counts.contexts++; this.state = 'suspended'; this.destination = {}; }
    get currentTime() { return now / 1000; }
    createOscillator() {
      counts.oscillators++;
      return { frequency: {}, connect() {}, start() {} };
    }
    createGain() {
      counts.gains++;
      return { connect() {}, gain: {
        cancelScheduledValues() {},
        setValueAtTime(value) { if (value === 0.0001) cues.push({ now, label: ctx.label.textContent }); },
        exponentialRampToValueAtTime() {}
      } };
    }
    resume() {
      if (delayedResume) return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; });
      this.state = 'running';
      return Promise.resolve();
    }
  }
  const ctx = vm.createContext({
    console, performance: { now: () => now }, navigator: {},
    window: { AudioContext, setInterval: () => 1 }, clearInterval() {},
    getComputedStyle: () => ({ transform: 'scale(0.8)' }),
    breathShell: element(), label: element(), toggleBtn: element(), remainingEl: element(),
    getInhale: () => 4, getExhale: () => 6, getPause: () => pause,
    getSessionDurationSeconds: () => 600,
    phaseText: (name, seconds) => `${name}:${seconds}`, t: key => key,
    formatTime: value => String(value), setBreathVisualScale() {},
    beginRunRecord() {}, finalizeRunRecord() {}, updateTimeLeftEditState() {}, renderCalendar() {}
  });
  vm.runInContext(html.slice(html.indexOf("let phase = 'inhale';"), html.indexOf('let historyRecords =')) +
    '\nlet sessionLeft = 600;\n' +
    html.slice(html.indexOf('function ensureAudio()'), html.indexOf('function generateWaves()')), ctx);
  return {
    ctx, counts, cues, eval: code => vm.runInContext(code, ctx),
    at(value) { now = value; }, resolveResume() { resolveResume(); }
  };
}

test('prepares and reuses audio; first cue coincides with the first label', async () => {
  const h = harness();
  h.eval('ensureAudio(); ensureAudio()');
  await h.eval('start()');
  assert.deepEqual(h.cues, [{ now: 0, label: 'inhale:4' }]);
  for (let now = 50; now <= 590000; now += 50) { h.at(now); h.eval('tick()'); }
  assert.deepEqual(h.counts, { contexts: 1, oscillators: 1, gains: 1 });
  assert.equal(h.eval('sessionLeft'), 10);
  for (const cue of h.cues) {
    assert.equal(cue.now % 10000, cue.label.startsWith('inhale') ? 0 : 4000);
  }
});

test('late callbacks preserve deadlines and emit only the current phase cue', async () => {
  const h = harness({ pause: 2 });
  await h.eval('start()');
  h.at(4150); h.eval('tick()');
  assert.equal(h.ctx.label.textContent, 'pause:2');
  assert.equal(h.eval('phaseDeadline'), 6000);
  h.at(6100); h.eval('tick()');
  assert.equal(h.ctx.label.textContent, 'exhale:6');
  h.at(29100); h.eval('tick()');
  assert.equal(h.ctx.label.textContent, 'inhale:3');
  assert.equal(h.eval('phaseDeadline'), 32000);
  assert.equal(h.cues.length, 4);
  assert.equal(h.eval('sessionLeft'), 571);
});

test('stop/resume preserves fractional time and completion restarts with inhale', async () => {
  const h = harness();
  await h.eval('start()');
  h.at(1250); h.eval('stop()');
  h.at(5000); await h.eval('start()');
  assert.equal(h.eval('phaseDeadline'), 7750);
  assert.equal(h.eval('sessionDeadline'), 603750);
  h.at(7750); h.eval('tick()');
  assert.equal(h.ctx.label.textContent, 'exhale:6');
  h.at(603750); h.eval('tick()');
  assert.equal(h.ctx.label.textContent, 'complete');
  assert.equal(h.eval('running'), false);
  await h.eval('start()');
  assert.equal(h.ctx.label.textContent, 'inhale:4');
});

test('audio startup latency does not consume practice time and can be cancelled', async () => {
  const h = harness({ delayedResume: true });
  const start = h.eval('start()');
  h.at(4000);
  assert.equal(h.eval('running'), false);
  assert.equal(h.cues.length, 0);
  h.resolveResume(); await start;
  assert.equal(h.eval('phaseDeadline'), 8000);
  assert.equal(h.cues[0].now, 4000);
  const cancelled = harness({ delayedResume: true });
  const pending = cancelled.eval('start()');
  cancelled.eval('stop()');
  cancelled.resolveResume(); await pending;
  assert.equal(cancelled.eval('running'), false);
  assert.equal(cancelled.cues.length, 0);
});
