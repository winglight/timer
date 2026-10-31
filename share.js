/* Local-only share image generation. No records are uploaded to a service. */
(function () {
  'use strict';
  const SITE_URL = 'https://timer.broyustudio.com/';
  const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  let imageUrl = null;

  function createImage(data) {
    const zh = data.language === 'zh-CN';
    const canvas = document.createElement('canvas');
    // Fixed output size keeps the full calendar readable on mobile as well.
    canvas.width = 2400; canvas.height = 1680;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.scale(2, 2);
    const text = (value, x, y, size, color = '#234d49', align = 'left', weight = 400, maxWidth) => {
      ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.fillText(value, x, y, maxWidth);
    };
    const circle = (x, y, radius, color) => {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    };
    const panel = (x, y, width, height, radius, color) => {
      ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fillStyle = color; ctx.fill();
    };
    const background = ctx.createLinearGradient(0, 0, 1200, 840);
    background.addColorStop(0, '#f6fbf9'); background.addColorStop(1, '#e9f4ee');
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1200, 840);
    text(zh ? '呼吸' : 'Breathe', 64, 69, 34, '#245d51', 'left', 500);
    text(zh ? '放慢 · 感受 · 回到当下' : 'Slow down · Feel · Return', 64, 115, 17, '#718c86');
    text(zh ? '我的呼吸练习' : 'My breathing practice', 1136, 76, 17, '#718c86', 'right');

    // Freeze the visible particle frame before the asynchronous PNG encoding.
    const orbX = 300, orbY = 400, stageSize = 530;
    if (data.corona.width && data.corona.height) ctx.drawImage(data.corona, orbX - stageSize / 2, orbY - stageSize / 2, stageSize, stageSize);
    const radius = stageSize * data.coreRatio;
    const orb = ctx.createRadialGradient(orbX - radius * .46, orbY - radius * .54, 0, orbX, orbY, radius * 1.25);
    orb.addColorStop(0, '#e5f3e2'); orb.addColorStop(.3, '#c8e9dd');
    orb.addColorStop(.6, '#a8dad6'); orb.addColorStop(1, '#8bcbd0');
    circle(orbX, orbY, radius, orb);
    ctx.strokeStyle = '#f4fff9'; ctx.lineWidth = 1; ctx.stroke();
    text(data.phase, orbX, orbY, 34, '#204e4c', 'center');
    text(data.rhythm, orbX, 661, 16, '#6b8982', 'center', 400, 500);
    text(zh ? '更平静的你 · 就在每一次呼吸里' : 'A calmer you · One breath at a time', orbX, 710, 15, '#718c86', 'center');

    panel(600, 164, 536, 572, 24, '#ffffff');
    text(data.month, 632, 205, 24, '#234d49', 'left', 500, 330);
    text(zh ? '练习日历' : 'Practice calendar', 1104, 205, 15, '#718c86', 'right');
    const weekdays = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    weekdays.forEach((day, index) => text(day, 655 + index * 71, 254, 14, '#718c86', 'center'));
    data.days.forEach((day, index) => {
      const x = 655 + index % 7 * 71, y = 301 + Math.floor(index / 7) * 47;
      if (day.today) circle(x, y, 21, '#5eaeaa');
      else if (day.goalMet) circle(x, y, 21, day.outside ? '#f0f7f2' : '#e4f3e8');
      else if (day.goalMissed && !day.outside) circle(x, y, 21, '#fbefec');
      text(day.label, x, y, 16, day.today ? '#ffffff' : day.outside ? '#adbfba' : '#234d49', 'center');
      if (day.practiced) circle(x, y + 15, 2, day.today ? '#e5fff4' : '#5faeaa');
    });
    text(data.goal, 632, 575, 13, '#718c86');
    if (data.streak) text(data.streak, 1104, 575, 13, '#39805f', 'right');
    ctx.beginPath(); ctx.moveTo(632, 601); ctx.lineTo(1104, 601); ctx.strokeStyle = '#e0eee8'; ctx.stroke();
    data.stats.forEach((stat, index) => {
      const x = 632 + index * 161;
      panel(x, 618, 150, 94, 12, '#f0f8f4');
      text(stat.value, x + 75, 652, 30, '#234d49', 'center', 500, 130);
      text(stat.label, x + 75, 688, 12, '#718c86', 'center', 400, 138);
    });
    text(SITE_URL, 64, 793, 20, '#245d51');
    text(zh ? '每一次呼吸，都是重新开始。' : 'Every breath is a fresh start.', 1136, 793, 16, '#718c86', 'right');
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
  }

  async function share(data) {
    const $ = id => document.getElementById(id);
    const button = $('share-x');
    if (button.disabled) return;
    const tr = (zh, en) => data.language === 'zh-CN' ? zh : en;
    const status = message => { $('share-status').hidden = false; $('share-status').textContent = message; };
    const intent = new URL('https://x.com/intent/tweet');
    intent.searchParams.set('text', tr('放慢呼吸，回到当下。分享我的呼吸练习。', 'Slow down and return to the present. My breathing practice.'));
    intent.searchParams.set('url', SITE_URL);
    $('share-open-x').href = intent.href;
    $('share-fallback').hidden = true;
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    status(tr('正在生成分享图片…', 'Creating your share image…'));
    let reservedTab = null;
    try {
      const png = createImage(data);
      // Call write in the click gesture, passing the pending Blob for Safari.
      // Reserve a tab before awaiting so popup blockers do not block navigation.
      let copy;
      try {
        copy = window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem
          ? navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(() => true, () => false)
          : Promise.resolve(false);
      } catch (_) { copy = Promise.resolve(false); }
      try {
        reservedTab = window.open('about:blank', '_blank');
        if (reservedTab) reservedTab.opener = null;
      } catch (_) { reservedTab = null; }
      const blob = await png;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob);
      $('share-download').href = imageUrl;
      $('share-download').download = `breathing-${new Date().toISOString().slice(0, 10)}.png`;
      $('share-fallback').hidden = false;
      if (!await copy) {
        if (reservedTab && !reservedTab.closed) reservedTab.close();
        status(tr('无法复制图片。请允许剪贴板访问后重试，或下载图片，在 X 发帖页上传。', 'Could not copy the image. Allow clipboard access and retry, or download it and upload it on X.'));
        return;
      }
      if (reservedTab && !reservedTab.closed) {
        try {
          reservedTab.location.replace(intent.href);
          status(tr('图片已复制。在 X 发帖框粘贴图片（⌘V / Ctrl+V），即可发布。', 'Image copied. Paste it in the X composer (⌘V / Ctrl+V), then post.'));
        } catch (_) {
          reservedTab.close();
          status(tr('图片已复制。请点击「打开 X 发帖页」，粘贴图片后发布。', 'Image copied. Click “Open X composer”, paste the image, then post.'));
        }
      } else {
        status(tr('图片已复制。请点击「打开 X 发帖页」，粘贴图片后发布。', 'Image copied. Click “Open X composer”, paste the image, then post.'));
      }
    } catch (_) {
      if (reservedTab && !reservedTab.closed) reservedTab.close();
      status(tr('图片生成失败，请重试。', 'Could not create the image. Please retry.'));
    } finally {
      button.disabled = false; button.removeAttribute('aria-busy');
    }
  }
  window.BreathingShare = { createImage, share };
})();
