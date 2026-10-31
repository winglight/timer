'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Blob } = require('node:buffer');

function harness({ clipboard = 'success', popup = true, encode = true } = {}) {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, disabled: false, setAttribute() {}, removeAttribute() {} });
    return elements.get(id);
  };
  const calls = [], texts = [], canvas = {};
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (_, key) => key === 'fillText' ? text => texts.push(text) : key.startsWith('create') ? () => gradient : () => {} });
  canvas.getContext = () => ctx;
  canvas.toBlob = callback => queueMicrotask(() => callback(encode ? new Blob(['png'], { type: 'image/png' }) : null));
  const tab = { closed: false, opener: {}, close() { this.closed = true; }, location: { replace(url) { calls.push(['navigate', url]); } } };
  class ClipboardItem { constructor(data) { this.data = data; } }
  const write = async items => {
    calls.push(['write']);
    assert.ok(items[0].data['image/png'] instanceof Promise);
    await items[0].data['image/png'];
    if (clipboard === 'denied') throw new Error('NotAllowedError');
    calls.push(['copied']);
  };
  class TestURL extends URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} }
  const window = {
    isSecureContext: true, ClipboardItem,
    open(url) { calls.push(['open', url]); return popup ? tab : null; }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../share.js'), 'utf8'), {
    window, ClipboardItem, URL: TestURL, Promise, Date,
    navigator: { clipboard: clipboard === 'unsupported' ? undefined : { write } },
    document: { getElementById: $, createElement: () => canvas }
  });
  const data = {
    language: 'zh-CN', month: '2026 年 11 月', phase: '吸气', rhythm: '吸气 4 秒 · 呼气 6 秒',
    corona: { width: 600, height: 600 }, coreRatio: .2,
    days: Array.from({ length: 42 }, (_, i) => ({ label: String(i + 1) })),
    stats: [{ value: '8', label: '练习次数' }, { value: '6', label: '练习天数' }, { value: '68', label: '总时长 / 分钟' }],
    goal: '每日目标 10 分钟', streak: ''
  };
  return { $, canvas, calls, texts, tab, data, share: window.BreathingShare.share };
}

test('share writes a PNG in the click gesture, reserves a tab, then navigates after copying', async () => {
  const h = harness();
  const pending = h.share(h.data);
  assert.deepEqual(h.calls.map(c => c[0]), ['write', 'open']);
  assert.equal(h.$('share-x').disabled, true);
  await pending;
  assert.deepEqual(h.calls.map(c => c[0]), ['write', 'open', 'copied', 'navigate']);
  const intent = new URL(h.calls.at(-1)[1]);
  assert.equal(intent.origin, 'https://x.com');
  assert.equal(intent.searchParams.get('url'), 'https://timer.broyustudio.com/');
  assert.equal(h.tab.opener, null);
  assert.deepEqual([h.canvas.width, h.canvas.height], [2400, 1680]);
  for (const text of ['2026 年 11 月', '42', '68', 'https://timer.broyustudio.com/']) assert.ok(h.texts.includes(text));
  assert.match(h.$('share-status').textContent, /图片已复制/);
  assert.equal(h.$('share-x').disabled, false);
});

for (const clipboard of ['denied', 'unsupported']) {
  test(`${clipboard} clipboard keeps the image downloadable and closes the reserved tab`, async () => {
    const h = harness({ clipboard });
    await h.share(h.data);
    assert.equal(h.tab.closed, true);
    assert.equal(h.calls.some(c => c[0] === 'navigate'), false);
    assert.equal(h.$('share-download').href, 'blob:test');
    assert.equal(h.$('share-fallback').hidden, false);
    assert.match(h.$('share-status').textContent, /无法复制/);
    assert.equal(h.$('share-x').disabled, false);
  });
}

test('blocked popup preserves the copied image and provides a manual composer link in English', async () => {
  const h = harness({ popup: false }); h.data.language = 'en';
  await h.share(h.data);
  assert.match(h.$('share-status').textContent, /Image copied.*Open X composer/);
  assert.equal(new URL(h.$('share-open-x').href).hostname, 'x.com');
});

test('PNG encoding failure closes the reserved tab and permits retry', async () => {
  const h = harness({ encode: false });
  await h.share(h.data);
  assert.equal(h.tab.closed, true);
  assert.equal(h.$('share-fallback').hidden, true);
  assert.match(h.$('share-status').textContent, /图片生成失败/);
  assert.equal(h.$('share-x').disabled, false);
});
