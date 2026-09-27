(function () {
  'use strict';
  const { DEFAULTS, RANGES, readConfig, BreathEngine, localDateKey, dateFromKey, formatClock, smooth } = window.BreathingCore;
  const $ = id => document.getElementById(id);
  const KEYS = {
    settings: 'breathing-corona-settings-v1', sessions: 'breathing-corona-sessions-v1',
    legacySettings: 'breath_settings', legacySessions: 'breath_history', lastSync: 'breath_history_last_sync',
    language: 'breathing-language-v1'
  };
  const R2_HISTORY = 'breath-history', R2_SETTINGS = 'breath-settings';
  function load(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
  function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  let language = load(KEYS.language, null);
  if (!['zh-CN', 'en'].includes(language)) language = /^zh(?:[-_]|$)/i.test(navigator.language || 'zh-CN') ? 'zh-CN' : 'en';
  const isZh = () => language === 'zh-CN';
  const tr = (zh, en) => isZh() ? zh : en;
  function safeRecords(value) {
    return Array.isArray(value) ? value.filter(r => r && typeof r.id === 'string' && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.durationMs) && r.durationMs > 0 && r.durationMs <= 24 * 3600000 && typeof r.startedAt === 'string' && Number.isFinite(Date.parse(r.startedAt))) : [];
  }
  function normalizeRecord(record) {
    if (!record || typeof record !== 'object') return null;
    if (safeRecords([record]).length) return record;
    const startedAt = record.startedAt || record.startTime || record.createdAt || record.date;
    const startedMs = Date.parse(startedAt);
    const durationMs = Number.isFinite(Number(record.durationMs)) ? Number(record.durationMs) :
      Number.isFinite(Number(record.durationSec ?? record.durationSeconds ?? record.duration)) ? Number(record.durationSec ?? record.durationSeconds ?? record.duration) * 1000 : NaN;
    if (!Number.isFinite(startedMs) || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 24 * 3600000) return null;
    const start = new Date(startedMs);
    return {
      schemaVersion: 1,
      id: String(record.id || `${start.toISOString()}|${Math.round(durationMs)}`),
      date: localDateKey(start), startedAt: start.toISOString(),
      endedAt: record.endedAt || new Date(startedMs + durationMs).toISOString(),
      durationMs: Math.round(durationMs), completed: record.reason === 'complete' || record.completed === true,
      settings: record.settings || {}
    };
  }
  function mergeRecords(...lists) {
    const merged = new Map();
    lists.flat().forEach(value => { const record = normalizeRecord(value); if (record) merged.set(record.id, record); });
    return [...merged.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  }
  const legacySettings = load(KEYS.legacySettings, {});
  const storedSettings = load(KEYS.settings, null);
  const initialSettings = storedSettings || {
    inhale: legacySettings.inhale, exhale: legacySettings.exhale, hold: legacySettings.pause,
    minutes: Number.isFinite(legacySettings.sessionSeconds) ? Math.max(1, Math.round(legacySettings.sessionSeconds / 60)) : undefined,
    sessionSeconds: Number.isFinite(legacySettings.sessionSeconds) ? Math.round(legacySettings.sessionSeconds) : undefined,
    showCountdown: false
  };
  let dailyGoalMinutes = Number(storedSettings?.dailyGoalMinutes) || (Number(legacySettings.dailyGoalSeconds) / 60) || 10;
  dailyGoalMinutes = Math.max(1, Math.min(1440, Math.round(dailyGoalMinutes)));
  const engine = new BreathEngine(readConfig(initialSettings));
  const renderer = new CoronaRenderer($('stage'), $('corona'), $('orb-core'));
  let records = mergeRecords(load(KEYS.sessions, []), load(KEYS.legacySessions, []));
  persist(KEYS.sessions, records);
  const r2 = new window.R2Sync();
  let session = null, raf = 0, settle = null, toastTimer = 0;
  let modal = null, resumeAfterModal = false, historyDate = null;
  let viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
  let lastDate = localDateKey();
  let audioContext = null, toneOscillator = null, toneGain = null, lastTonePhase = null, wakeLock = null;
  const fields = Object.keys(RANGES);
  const phaseWord = phase => (isZh() ? { inhale: '吸气', exhale: '呼气', hold: '停留' } : { inhale: 'Inhale', exhale: 'Exhale', hold: 'Hold' })[phase];
  function applyLanguage() {
    document.documentElement.lang = language;
    document.title = tr('呼吸 · 回到当下', 'Breathing · Return to the present');
    document.querySelector('meta[name="description"]').content = tr('跟随呼吸的节奏，回到当下。', 'Follow the rhythm of your breath and return to the present.');
    const text = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
    text('.brand h1', tr('呼吸', 'Breathe')); text('.remaining-label', tr('剩余', 'Remaining')); text('.tagline', tr('放慢 · 感受 · 回到当下', 'Slow down · Feel · Return'));
    text('.practice-footer', tr('更平静的你 · 就在每一次呼吸里', 'A calmer you · One breath at a time')); text('.card-header h2', tr('练习日历', 'Practice calendar'));
    $('all-records').childNodes[0].textContent = tr('查看全部', 'View all'); text('#today-button', tr('回到今天', 'Today')); text('.overview-header h3', tr('本月概览', 'This month'));
    (isZh() ? ['练习次数','练习天数','总时长 / 分钟'] : ['Sessions','Practice days','Minutes']).forEach((value, index) => { document.querySelectorAll('.stat-label')[index].textContent = value; });
    (isZh() ? ['一','二','三','四','五','六','日'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).forEach((value, index) => { document.querySelectorAll('.calendar-table th')[index].textContent = value; });
    text('.card-quote p', tr('呼吸是当下的锚，也是通往内心的桥。', 'Breath anchors us in the present and bridges us to our inner self.')); text('.card-quote footer', tr('— 呼吸 · 更好的自己', '— Breathe · A better self'));
    text('#settings-title', tr('练习设置', 'Practice settings'));
    (isZh() ? ['吸气','呼气','停留','练习时长'] : ['Inhale','Exhale','Hold','Session length']).forEach((value, index) => { document.querySelectorAll('.setting-label')[index].childNodes[0].textContent = value; });
    text('#row-hold small', tr('每次呼气后', 'After each exhale'));
    document.querySelectorAll('.stepper .unit').forEach((unit, index) => { unit.textContent = index === 3 ? tr('分钟', 'min') : tr('秒', 'sec'); });
    text('.toggle-row > span:first-child', tr('显示阶段倒计时', 'Show phase countdown')); text('#cloud-title', tr('R2 云同步', 'R2 cloud sync'));
    document.querySelectorAll('.cloud-fields label').forEach((label, index) => { label.childNodes[0].textContent = (isZh() ? ['应用名称','服务地址','访问令牌'] : ['App','Service URL','Access token'])[index]; });
    text('#settings-cancel', tr('取消', 'Cancel')); text('#settings-apply', tr('应用', 'Apply')); text('#end-title', tr('结束这次练习？', 'End this practice?'));
    text('#end-cancel', tr('继续练习', 'Keep practicing')); text('#end-confirm', tr('结束并保存', 'End and save')); text('#records-title', tr('练习记录', 'Practice records'));
    $('export-records').lastChild.textContent = tr('导出', 'Export'); text('#empty-label', tr('还没有练习记录', 'No practice records yet'));
    $('records-start').childNodes[0].textContent = tr('从一次呼吸开始', 'Start with one breath');
    $('settings-open').setAttribute('aria-label', tr('练习设置', 'Practice settings')); $('settings-open').title = tr('练习设置', 'Practice settings');
    $('remaining').setAttribute('aria-label', tr('练习剩余时间', 'Practice time remaining')); $('stage').setAttribute('aria-label', tr('呼吸引导', 'Breathing guide'));
    $('rhythm-settings').setAttribute('aria-label', tr('修改呼吸节奏', 'Edit breathing rhythm'));
    $('reset').setAttribute('aria-label', tr('结束或重置练习', 'End or reset practice')); $('reset').title = tr('结束 / 重置', 'End / reset');
    $('settings-close').setAttribute('aria-label', tr('关闭设置', 'Close settings')); $('end-close').setAttribute('aria-label', tr('关闭', 'Close')); $('records-close').setAttribute('aria-label', tr('关闭练习记录', 'Close practice records'));
    $('r2-enabled').setAttribute('aria-label', tr('启用 R2 同步', 'Enable R2 sync')); document.querySelector('.cloud-title-row label').setAttribute('aria-label', tr('启用 R2 同步', 'Enable R2 sync'));
    document.querySelector('.practice').setAttribute('aria-label', tr('呼吸练习', 'Breathing practice')); document.querySelector('.calendar-card').setAttribute('aria-label', tr('练习日历', 'Practice calendar'));
    document.querySelector('.calendar-table').setAttribute('aria-label', tr('月历', 'Monthly calendar')); document.querySelector('.overview').setAttribute('aria-label', tr('本月统计', 'Monthly statistics'));
    const stepNames = isZh() ? [['缩短吸气时间','增加吸气时间'],['缩短呼气时间','增加呼气时间'],['缩短停留时间','增加停留时间'],['缩短练习时长','增加练习时长']] : [['Decrease inhale','Increase inhale'],['Decrease exhale','Increase exhale'],['Decrease hold','Increase hold'],['Decrease session length','Increase session length']];
    document.querySelectorAll('.setting-row').forEach((row, index) => row.querySelectorAll('.stepper button').forEach((button, side) => button.setAttribute('aria-label', stepNames[index][side])));
    $('prev-month').setAttribute('aria-label', tr('上个月', 'Previous month')); $('next-month').setAttribute('aria-label', tr('下个月', 'Next month'));
    $('month-label').setAttribute('aria-label', tr('跳转到指定月份', 'Jump to a month')); $('month-label').title = tr('跳转到指定月份', 'Jump to a month');
    $('daily-goal').title = tr('修改每日目标', 'Edit daily goal');
    $('language-toggle').textContent = isZh() ? 'EN' : '中';
    $('language-toggle').setAttribute('aria-label', tr('切换到英文', 'Switch to Chinese')); $('language-toggle').title = tr('切换到英文', 'Switch to Chinese');
    document.querySelector('.github-link').setAttribute('aria-label', tr('在 GitHub 上查看源码', 'View source on GitHub')); document.querySelector('.github-link').title = tr('在 GitHub 上查看源码', 'View source on GitHub');
  }
  function setText(id, text) { if ($(id).textContent !== text) $(id).textContent = text; }
  function toast(text) {
    clearTimeout(toastTimer); setText('toast-label', text); $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000);
  }
  function settingsPayload(updatedAt = new Date().toISOString()) {
    return { ...engine.config, pause: engine.config.hold, dailyGoalMinutes, dailyGoalSeconds: dailyGoalMinutes * 60, updatedAt };
  }
  function saveSettings() { return persist(KEYS.settings, settingsPayload()); }
  function setSyncStatus(text, tone = '') {
    setText('sync-status', text);
    if (tone) $('sync-status').dataset.tone = tone; else delete $('sync-status').dataset.tone;
  }
  function refreshSyncStatus() {
    if (!r2.config.enabled) { setSyncStatus(tr('云同步未启用，记录仅保存在当前浏览器。', 'Cloud sync is off. Records are saved in this browser only.')); return; }
    const last = localStorage.getItem(KEYS.lastSync);
    setSyncStatus(last ? `${tr('云同步已启用', 'Cloud sync is on')} · ${new Date(last).toLocaleString(language)}` : tr('云同步已启用，等待首次同步。', 'Cloud sync is on. Waiting for the first sync.'), last ? 'success' : '');
  }
  function extractRecords(payload, seen = new Set()) {
    if (!payload || typeof payload !== 'object' || seen.has(payload)) return [];
    seen.add(payload);
    if (Array.isArray(payload)) return payload;
    const dated = Object.entries(payload).flatMap(([date, value]) => {
      if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date) || !value || typeof value !== 'object') return [];
      const count = Math.max(1, Math.round(Number(value.count) || 1));
      const totalSeconds = Number(value.durationSec ?? value.durationSeconds ?? value.duration);
      if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return [];
      return Array.from({ length: count }, (_, index) => ({
        id: `${date}#${index + 1}`, startedAt: new Date(`${date}T00:00:00`).toISOString(),
        durationSec: Math.max(1, Math.round(totalSeconds / count)), reason: 'cloud-summary'
      }));
    });
    if (dated.length) return dated;
    for (const key of [R2_HISTORY, KEYS.legacySessions, 'historyRecords', 'records', 'history', 'items', 'data', 'todos']) {
      if (payload[key]) { const found = extractRecords(payload[key], seen); if (mergeRecords(found).length) return found; }
    }
    for (const value of Object.values(payload)) { const found = extractRecords(value, seen); if (mergeRecords(found).length) return found; }
    return [];
  }
  function recordsFromResult(result) {
    if (!result?.ok) return [];
    const payloads = [result.data, ...(result.files || []).map(file => file.data)];
    return mergeRecords(payloads.flatMap(payload => extractRecords(payload)));
  }
  async function loadRemoteHistory() {
    let primary = null;
    for (const entity of [R2_HISTORY, 'breath_history', 'history', 'records', 'todos']) {
      const result = await r2.loadFromR2(entity);
      if (entity === R2_HISTORY) primary = result;
      if (recordsFromResult(result).length) return result;
    }
    return primary;
  }
  async function syncHistory() {
    if (!r2.config.enabled) { refreshSyncStatus(); return false; }
    setSyncStatus(tr('正在同步云端记录…', 'Syncing cloud records…'));
    const remote = await loadRemoteHistory();
    if (remote?.ok) records = mergeRecords(records, recordsFromResult(remote));
    else if (remote && !['not_found', 'empty_zip'].includes(remote.reason)) {
      setSyncStatus(remote.reason === 'timeout' ? tr('连接云端超时，请稍后重试。', 'Cloud connection timed out. Try again later.') : tr('无法连接云端，请检查地址、令牌和网络。', 'Could not connect. Check the URL, token, and network.'), 'error');
      return false;
    }
    persist(KEYS.sessions, records); renderCalendar();
    const ok = await r2.syncToR2(records, R2_HISTORY);
    if (!ok) { setSyncStatus(tr('云端同步失败，请检查 R2 配置。', 'Cloud sync failed. Check the R2 configuration.'), 'error'); return false; }
    const now = new Date().toISOString(); localStorage.setItem(KEYS.lastSync, now);
    setSyncStatus(`${tr('云端同步完成', 'Cloud sync complete')} · ${new Date(now).toLocaleString(language)}`, 'success');
    return true;
  }
  async function syncSettings() {
    if (!r2.config.enabled) return false;
    return r2.syncToR2(settingsPayload(), R2_SETTINGS);
  }
  async function hydrateSettings() {
    if (!r2.config.enabled) return;
    const result = await r2.loadFromR2(R2_SETTINGS);
    const remote = result?.ok && result.data && !Array.isArray(result.data) ? result.data : null;
    const local = load(KEYS.settings, {});
    const remoteTime = Number.isFinite(Date.parse(remote?.updatedAt)) ? Date.parse(remote.updatedAt) : 0;
    const localTime = Number.isFinite(Date.parse(local?.updatedAt)) ? Date.parse(local.updatedAt) : 0;
    if (remote && remoteTime > localTime) {
      const compatible = {
        ...remote, hold: remote.hold ?? remote.pause,
        minutes: remote.minutes ?? (Number.isFinite(remote.sessionSeconds) ? Math.max(1, Math.round(remote.sessionSeconds / 60)) : undefined)
      };
      const next = readConfig(compatible); engine.applyConfig(next);
      dailyGoalMinutes = Math.max(1, Math.min(1440, Math.round(Number(remote.dailyGoalMinutes ?? remote.dailyGoalSeconds / 60) || 10)));
      persist(KEYS.settings, remote); captions(); renderCalendar();
    } else if (local.updatedAt) await syncSettings();
  }
  function ensureAudio() {
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      audioContext = new Audio({ latencyHint: 'interactive' });
      toneOscillator = audioContext.createOscillator(); toneGain = audioContext.createGain();
      toneOscillator.type = 'sine'; toneGain.gain.value = 0.0001;
      toneOscillator.connect(toneGain); toneGain.connect(audioContext.destination); toneOscillator.start();
    }
    return audioContext;
  }
  function playTone(phase) {
    if (!audioContext || !toneOscillator || !toneGain || audioContext.state !== 'running') return;
    const now = audioContext.currentTime;
    toneOscillator.frequency.setValueAtTime({ inhale: 440, exhale: 330, hold: 262 }[phase] || 330, now);
    toneGain.gain.cancelScheduledValues(now); toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.075, now + 0.025);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  }
  async function requestWakeLock() {
    if (!navigator.wakeLock || wakeLock) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (_) {}
  }
  async function releaseWakeLock() {
    const lock = wakeLock; wakeLock = null;
    if (lock) try { await lock.release(); } catch (_) {}
  }
  function captions() {
    setText('inhale-caption', `${phaseWord('inhale')} ${engine.config.inhale}${tr(' 秒', 's')}`);
    setText('exhale-caption', `${phaseWord('exhale')} ${engine.config.exhale}${tr(' 秒', 's')}`);
    setText('hold-caption', `${phaseWord('hold')} ${engine.config.hold}${tr(' 秒', 's')}`);
  }
  function saveSession(completed) {
    if (!session || session.saved || engine.elapsedMs < 1000) return;
    const entry = {
      schemaVersion: 1, id: session.id, date: session.date,
      startedAt: session.startedAt, endedAt: new Date().toISOString(),
      durationMs: Math.round(engine.elapsedMs), completed: !!completed,
      settings: { ...engine.config }
    };
    // Merge with the latest persisted array to avoid overwriting another tab's
    // previous writes. Production multi-user storage should replace this adapter.
    const merged = new Map([...safeRecords(load(KEYS.sessions, [])), ...records].map(r => [r.id, r]));
    merged.set(entry.id, entry); records = [...merged.values()];
    const saved = persist(KEYS.sessions, records); session.saved = true;
    renderCalendar();
    toast(saved ? (completed ? tr('本次练习已完成，已记入日历', 'Practice completed and added to the calendar') : tr('已保存到练习日历', 'Saved to the practice calendar')) : tr('本次练习已记录，浏览器未允许本地保存', 'Practice recorded, but browser storage was unavailable'));
    if (r2.config.enabled) void syncHistory();
  }
  function completeIfNeeded() {
    if (engine.status === 'complete' && session && !session.saved) {
      settle = { from: renderer.frame.level, started: performance.now() };
      saveSession(true);
      void releaseWakeLock();
    }
  }
  function render() {
    const frame = engine.snapshot();
    let word = phaseWord(frame.phase);
    if (frame.status === 'idle') { word = tr('准备', 'Ready'); frame.level = 0; }
    else if (frame.status === 'paused') word = tr('已暂停', 'Paused');
    else if (frame.status === 'complete') { word = tr('完成', 'Complete'); frame.level = 0; }
    if (settle && (frame.status === 'complete' || frame.status === 'idle')) {
      const p = renderer.motion.matches ? 1 : Math.min(1, (performance.now() - settle.started) / 950);
      frame.level = settle.from * (1 - smooth(p)); if (p >= 1) settle = null;
    }
    renderer.setFrame(frame);
    if (frame.status === 'running' && frame.phase !== lastTonePhase) { lastTonePhase = frame.phase; playTone(frame.phase); }
    setText('phase-label', word); setText('phase-live', word);
    const isActive = frame.status === 'running' || frame.status === 'paused';
    $('phase-seconds').hidden = !(engine.config.showCountdown && isActive);
    if (isActive) setText('phase-seconds', `${Math.max(1, Math.ceil(frame.duration * (1 - frame.progress)))}${tr(' 秒', 's')}`);
    setText('remaining', formatClock(frame.remainingMs));
    setText('toggle-label', (isZh() ? { idle: '开始练习', running: '暂停', paused: '继续练习', complete: '再次开始' } : { idle: 'Start', running: 'Pause', paused: 'Resume', complete: 'Start again' })[frame.status]);
    $('toggle-icon').setAttribute('href', frame.status === 'running' ? '#i-pause' : '#i-play');
    $('reset').disabled = frame.status === 'idle';
    document.body.dataset.status = frame.status;
    $('stage').dataset.phase = frame.phase;
    if (lastDate !== localDateKey()) { lastDate = localDateKey(); renderCalendar(); }
  }
  function loop(now) {
    raf = 0;
    engine.tick(now); completeIfNeeded(); render();
    if ((engine.status === 'running' || settle) && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function schedule() { cancelAnimationFrame(raf); raf = 0; loop(performance.now()); }
  async function start() {
    const audio = ensureAudio();
    if (audio?.state === 'suspended') { try { await audio.resume(); } catch (_) {} }
    if (engine.status === 'idle' || engine.status === 'complete') {
      session = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        startedAt: new Date().toISOString(), date: localDateKey(), saved: false
      };
      renderer.lastElapsed = 0; renderer.seedParticles(); lastTonePhase = null;
    }
    settle = null; engine.start(); void requestWakeLock(); schedule();
  }
  function pause() { engine.pause(); cancelAnimationFrame(raf); raf = 0; void releaseWakeLock(); completeIfNeeded(); render(); }
  function toggle() { if (modal) return; engine.status === 'running' ? pause() : void start(); }
  function reset() {
    const from = renderer.frame.level;
    cancelAnimationFrame(raf); engine.reset(); session = null; lastTonePhase = null; void releaseWakeLock();
    settle = { from, started: performance.now() }; schedule();
  }
  function openModal(id) {
    if (modal) return false;
    resumeAfterModal = engine.status === 'running';
    if (resumeAfterModal) pause();
    modal = $(id); document.body.classList.add('modal-open'); modal.showModal(); return true;
  }
  function closeModal(resume = true) {
    if (!modal) return;
    const previous = modal, shouldResume = resume && resumeAfterModal && engine.status === 'paused';
    modal = null; resumeAfterModal = false; previous.close(); document.body.classList.remove('modal-open');
    if (shouldResume) void start(); else { render(); if (settle) schedule(); }
  }
  function clearErrors() {
    for (const key of fields) {
      $(`row-${key}`).removeAttribute('data-invalid');
      $(`error-${key}`).hidden = true; $(`${key}-input`).removeAttribute('aria-invalid');
    }
  }
  function openSettings() {
    if (modal) return;
    clearErrors();
    for (const key of fields) $(`${key}-input`).value = String(engine.config[key]);
    $('countdown-input').checked = engine.config.showCountdown;
    $('r2-enabled').checked = !!r2.config.enabled;
    $('r2-app').value = r2.config.app || ''; $('r2-url').value = r2.config.url || ''; $('r2-token').value = r2.config.token || '';
    $('cloud-fields').hidden = !$('r2-enabled').checked;
    openModal('settings-dialog');
  }
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault(); clearErrors();
    const next = { showCountdown: $('countdown-input').checked };
    let firstInvalid = null;
    for (const [key, [min, max]] of Object.entries(RANGES)) {
      const input = $(`${key}-input`), value = input.valueAsNumber;
      if (!Number.isInteger(value) || value < min || value > max) {
        $(`row-${key}`).dataset.invalid = 'true'; input.setAttribute('aria-invalid', 'true');
        $(`error-${key}`).hidden = false; $(`error-${key}`).textContent = tr(`请输入 ${min}–${max} 之间的整数。`, `Enter an integer from ${min} to ${max}.`);
        firstInvalid = firstInvalid || input;
      } else next[key] = value;
    }
    if (firstInvalid) { firstInvalid.focus(); return; }
    next.sessionSeconds = next.minutes * 60;
    // Commit the actual input values before closing. Storage failure must never
    // interrupt apply/close or prevent an in-memory setting from taking effect.
    engine.applyConfig(next);
    r2.updateConfig({ enabled: $('r2-enabled').checked, app: $('r2-app').value.trim(), url: $('r2-url').value.trim(), token: $('r2-token').value });
    const saved = saveSettings();
    captions(); completeIfNeeded(); closeModal(true); render();
    toast(saved ? tr('设置已应用', 'Settings applied') : tr('设置已应用，浏览器未允许本地保存', 'Settings applied, but browser storage was unavailable'));
    refreshSyncStatus();
    if (r2.config.enabled) { void syncSettings(); void syncHistory(); }
  });
  $('settings-form').addEventListener('click', event => {
    const button = event.target.closest('button[data-step]'); if (!button) return;
    const key = button.dataset.field, input = $(`${key}-input`), [min, max] = RANGES[key];
    const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : engine.config[key];
    input.value = String(Math.max(min, Math.min(max, Math.round(current) + Number(button.dataset.step))));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('settings-form').addEventListener('input', event => {
    const key = event.target.dataset.key; if (!key) return;
    $(`row-${key}`).removeAttribute('data-invalid'); $(`error-${key}`).hidden = true;
    event.target.removeAttribute('aria-invalid');
  });
  $('r2-enabled').addEventListener('change', () => { $('cloud-fields').hidden = !$('r2-enabled').checked; });
  function currentStreak() {
    const dates = new Set(records.map(r => r.date));
    const cursor = dateFromKey(localDateKey());
    if (!dates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dates.has(localDateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    return streak;
  }
  function minutesLabel(ms) {
    if (!ms) return '0';
    const minutes = ms / 60000;
    return minutes < 10 && minutes % 1 > .05 ? minutes.toFixed(1) : String(Math.round(minutes));
  }
  function renderCalendar(focusKey) {
    const year = viewMonth.getFullYear(), month = viewMonth.getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    setText('month-label', isZh() ? `${year} 年 ${month + 1} 月` : new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(viewMonth));
    const today = localDateKey();
    const practiced = new Map();
    for (const record of records) {
      const metric = practiced.get(record.date) || { count: 0, durationMs: 0 };
      metric.count += 1; metric.durationMs += record.durationMs; practiced.set(record.date, metric);
    }
    const first = new Date(year, month, 1, 12);
    const start = new Date(year, month, 1 - (first.getDay() + 6) % 7, 12);
    const fragment = document.createDocumentFragment();
    const weeks = Math.ceil(((first.getDay() + 6) % 7 + new Date(year, month + 1, 0).getDate()) / 7);
    for (let week = 0; week < weeks; week++) {
      const row = document.createElement('tr');
      for (let weekday = 0; weekday < 7; weekday++) {
        const day = new Date(start); day.setDate(start.getDate() + week * 7 + weekday);
        const key = localDateKey(day), metric = practiced.get(key) || { count: 0, durationMs: 0 }, count = metric.count;
        const td = document.createElement('td'), button = document.createElement('button');
        button.type = 'button'; button.className = 'day'; button.dataset.date = key;
        button.textContent = String(day.getDate());
        button.classList.toggle('outside', day.getMonth() !== month);
        button.classList.toggle('today', key === today); button.classList.toggle('has-record', count > 0);
        button.classList.toggle('goal-met', metric.durationMs >= dailyGoalMinutes * 60000);
        button.classList.toggle('goal-missed', day < dateFromKey(today) && metric.durationMs < dailyGoalMinutes * 60000);
        if (key === today) button.setAttribute('aria-current', 'date');
        button.setAttribute('aria-label', isZh() ? `${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日${key === today ? '，今天' : ''}，${count ? `${count}次练习` : '无练习记录'}` : `${key}${key === today ? ', today' : ''}, ${count ? `${count} sessions` : 'no practice records'}`);
        td.append(button); row.append(td);
      }
      fragment.append(row);
    }
    $('calendar-body').replaceChildren(fragment);
    const monthly = records.filter(r => r.date.startsWith(prefix));
    setText('stat-sessions', String(monthly.length));
    setText('stat-days', String(new Set(monthly.map(r => r.date)).size));
    setText('stat-minutes', minutesLabel(monthly.reduce((sum, r) => sum + r.durationMs, 0)));
    setText('daily-goal-label', isZh() ? `每日目标 ${dailyGoalMinutes} 分钟` : `Daily goal ${dailyGoalMinutes} min`);
    const streak = currentStreak();
    $('streak-badge').hidden = !streak || !today.startsWith(prefix);
    setText('streak-badge', isZh() ? `连续 ${streak} 天` : `${streak}-day streak`);
    if (focusKey) $('calendar-body').querySelector(`[data-date="${focusKey}"]`)?.focus();
  }
  function changeMonth(delta) {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1, 12); renderCalendar();
  }
  function goToToday() {
    viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12); renderCalendar();
  }
  function jumpToMonth() {
    const current = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
    const value = window.prompt(tr('请输入年月（YYYY-MM）', 'Enter a month (YYYY-MM)'), current);
    if (value === null) return;
    const match = value.trim().match(/^(\d{4})-(\d{2})$/), month = match ? Number(match[2]) : 0;
    if (!match || month < 1 || month > 12) { toast(tr('请输入正确年月，例如 2026-04', 'Use a valid month, for example 2026-04')); return; }
    viewMonth = new Date(Number(match[1]), month - 1, 1, 12); renderCalendar();
  }
  function editDailyGoal() {
    const value = window.prompt(tr('请输入每日目标分钟数', 'Enter the daily goal in minutes'), String(dailyGoalMinutes));
    if (value === null) return;
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { toast(tr('请输入 1–1440 之间的整数', 'Enter an integer from 1 to 1440')); return; }
    dailyGoalMinutes = minutes; saveSettings(); renderCalendar(); toast(tr('每日目标已更新', 'Daily goal updated'));
    if (r2.config.enabled) void syncSettings();
  }
  function editSessionDuration() {
    if (engine.status === 'running' || engine.status === 'paused') return;
    const value = window.prompt(tr('请输入练习时长（分钟或 MM:SS）', 'Enter the session length in minutes or MM:SS'), formatClock(engine.totalMs));
    if (value === null) return;
    const text = value.trim(); let seconds;
    const clock = text.match(/^(\d{1,3}):(\d{1,2})$/);
    if (clock && Number(clock[2]) < 60) seconds = Number(clock[1]) * 60 + Number(clock[2]);
    else if (/^\d+(?:\.\d+)?$/.test(text)) seconds = Math.round(Number(text) * 60);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 7200) { toast(tr('请输入 1 秒到 120 分钟之间的有效时长', 'Enter a valid duration from 1 second to 120 minutes')); return; }
    engine.applyConfig({ ...engine.config, minutes: Math.max(1, Math.min(120, Math.round(seconds / 60))), sessionSeconds: seconds });
    saveSettings(); render(); toast(tr('练习时长已更新', 'Session length updated')); if (r2.config.enabled) void syncSettings();
  }
  function visibleRecords() { return records.filter(r => !historyDate || r.date === historyDate).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)); }
  function renderRecords() {
    const list = visibleRecords();
    if (historyDate) { const d = dateFromKey(historyDate); setText('records-title', isZh() ? `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 练习` : `${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })} · Practice`); }
    else setText('records-title', tr('练习记录', 'Practice records'));
    const duration = list.reduce((n, r) => n + r.durationMs, 0);
    setText('records-summary', isZh() ? `${list.length} 次练习 · ${minutesLabel(duration)} 分钟` : `${list.length} sessions · ${minutesLabel(duration)} min`);
    $('export-records').disabled = list.length === 0; $('records-empty').hidden = list.length !== 0;
    setText('empty-label', historyDate ? tr('这一天还没有练习记录', 'No practice records for this day') : tr('还没有练习记录', 'No practice records yet'));
    $('records-start').hidden = !!historyDate && historyDate !== localDateKey();
    const fragment = document.createDocumentFragment();
    for (const record of list) {
      const item = document.createElement('li'); item.className = 'record-item';
      const main = document.createElement('div'); main.className = 'record-main';
      const title = document.createElement('span'); title.className = 'record-title';
      const d = new Date(record.startedAt), time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      title.textContent = `${record.date === localDateKey() ? tr('今天', 'Today') : record.date} · ${time}`;
      const sub = document.createElement('span'); sub.className = 'record-sub';
      sub.textContent = record.completed ? tr('完成练习', 'Completed') : tr('提前结束', 'Ended early');
      const duration = document.createElement('span'); duration.className = 'record-duration'; duration.textContent = formatClock(record.durationMs);
      main.append(title, sub); item.append(main, duration); fragment.append(item);
    }
    $('records-list').replaceChildren(fragment);
  }
  function openRecords(date = null) { if (modal) return; historyDate = date; renderRecords(); openModal('records-dialog'); }
  function toggleLanguage() {
    language = isZh() ? 'en' : 'zh-CN'; persist(KEYS.language, language);
    applyLanguage(); captions(); renderCalendar(); render(); refreshSyncStatus();
    if (modal === $('records-dialog')) renderRecords();
    if (modal === $('end-dialog')) setText('end-description', tr(`已练习 ${formatClock(engine.elapsedMs)}，结束后将保存到练习日历。`, `${formatClock(engine.elapsedMs)} practiced. Ending now will save it to your calendar.`));
  }
  $('calendar-body').addEventListener('click', e => { const day = e.target.closest('button[data-date]'); if (day) openRecords(day.dataset.date); });
  $('calendar-body').addEventListener('keydown', e => {
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const button = e.target.closest('button[data-date]'); if (!button || !(e.key in steps)) return;
    e.preventDefault(); const target = dateFromKey(button.dataset.date); target.setDate(target.getDate() + steps[e.key]);
    const key = localDateKey(target), existing = $('calendar-body').querySelector(`[data-date="${key}"]`);
    if (existing) existing.focus();
    else { viewMonth = new Date(target.getFullYear(), target.getMonth(), 1, 12); renderCalendar(key); }
  });
  $('export-records').addEventListener('click', () => {
    const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), sessions: visibleRecords() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `breathing-records-${historyDate || localDateKey()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('records-start').addEventListener('click', () => { closeModal(false); if (engine.status !== 'running') start(); });
  $('reset').addEventListener('click', () => {
    if (engine.status === 'complete' || engine.elapsedMs < 1000) { reset(); return; }
    openModal('end-dialog');
    setText('end-description', tr(`已练习 ${formatClock(engine.elapsedMs)}，结束后将保存到练习日历。`, `${formatClock(engine.elapsedMs)} practiced. Ending now will save it to your calendar.`));
  });
  $('end-confirm').addEventListener('click', () => { saveSession(false); closeModal(false); reset(); });
  $('toggle').addEventListener('click', toggle);
  $('language-toggle').addEventListener('click', toggleLanguage);
  $('settings-open').addEventListener('click', openSettings); $('rhythm-settings').addEventListener('click', openSettings);
  for (const id of ['settings-close', 'settings-cancel', 'end-close', 'end-cancel', 'records-close']) $(id).addEventListener('click', () => closeModal(true));
  for (const id of ['settings-dialog', 'end-dialog', 'records-dialog']) {
    const dialog = $(id);
    dialog.addEventListener('cancel', e => { e.preventDefault(); closeModal(true); });
    let backdropDown = false;
    const outside = e => { const r = dialog.getBoundingClientRect(); return e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom); };
    dialog.addEventListener('pointerdown', e => { backdropDown = outside(e); });
    dialog.addEventListener('pointerup', e => { if (backdropDown && outside(e)) closeModal(true); backdropDown = false; });
  }
  $('prev-month').addEventListener('click', () => changeMonth(-1)); $('next-month').addEventListener('click', () => changeMonth(1));
  $('today-button').addEventListener('click', goToToday); $('month-label').addEventListener('click', jumpToMonth);
  $('daily-goal').addEventListener('click', editDailyGoal);
  $('remaining').addEventListener('dblclick', editSessionDuration);
  $('all-records').addEventListener('click', () => openRecords());
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat && !modal && !e.target.closest('input,textarea,button,select,[contenteditable="true"]')) { e.preventDefault(); toggle(); }
  });
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); raf = 0; if (!document.hidden) schedule(); });
  window.addEventListener('storage', e => { if (e.key === KEYS.sessions) { records = safeRecords(load(KEYS.sessions, [])); renderCalendar(); if (modal === $('records-dialog')) renderRecords(); } });
  applyLanguage(); captions(); renderCalendar(); render(); refreshSyncStatus();
  if (r2.config.enabled) void (async () => { await hydrateSettings(); await syncHistory(); })();
})();
