'use strict';

// ── Telegram WebApp SDK ───────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const TG_USER_ID   = tg?.initDataUnsafe?.user?.id ? String(tg.initDataUnsafe.user.id) : 'local_debug';
const TG_USERNAME  = tg?.initDataUnsafe?.user?.username || 'Игрок';
const SAVE_KEY     = `clicker_save_${TG_USER_ID}`;
const LB_URL       = 'https://raw.githubusercontent.com/MarkHaker/replit-clicker/main/leaderboard.json';

function haptic(t='light') { tg?.HapticFeedback?.impactOccurred(t); }

// ── Звуки (Web Audio API, без внешних файлов) ─────────────────────
let _audioCtx = null;
function getACtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playPop() {
  try {
    const ctx = getACtx(), now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.start(now); osc.stop(now + 0.13);
  } catch(e) {}
}

function playUIClick() {
  try {
    const ctx = getACtx(), now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(550, now + 0.04);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.start(now); osc.stop(now + 0.06);
  } catch(e) {}
}

function playAchChime(isSecret = false) {
  try {
    const ctx = getACtx();
    // обычное: C5-E5-G5; секретное: C5-E5-G5-C6-E6 (квинтет, ярче)
    const freqs = isSecret ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(isSecret ? 0.22 : 0.17, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
      osc.start(t); osc.stop(t + 0.48);
    });
  } catch(e) {}
}

// ── Конфетти ──────────────────────────────────────────────────────
function spawnConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  const COLS = ['#ff6b6b','#ffd700','#7fd49a','#4fc3f7','#b39ddb','#ff6b9d','#ff9f43','#26de81'];
  const pts  = Array.from({length:100}, () => ({
    x:  Math.random() * canvas.width,
    y:  -20 - Math.random() * 60,
    vx: (Math.random() - 0.5) * 5,
    vy: Math.random() * 3 + 1.5,
    w:  Math.random() * 10 + 5,
    h:  Math.random() * 6  + 4,
    r:  Math.random() * Math.PI * 2,
    dr: (Math.random() - 0.5) * 0.14,
    c:  COLS[Math.floor(Math.random() * COLS.length)],
    life: 1,
  }));
  let raf;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let any = false;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.07; p.r += p.dr; p.life -= 0.007;
      if (p.life > 0 && p.y < canvas.height + 20) {
        any = true;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.min(p.life, 1);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      }
    }
    if (any) raf = requestAnimationFrame(draw);
    else canvas.style.display = 'none';
  }
  cancelAnimationFrame(raf);
  draw();
}

// ── Очередь уведомлений о достижениях ────────────────────────────
let _achQueue = [], _achShowing = false;

function queueAchievement(ach) {
  _achQueue.push({ach});
  if (!_achShowing) _showNextAch();
}

function _showNextAch() {
  if (!_achQueue.length) { _achShowing = false; return; }
  _achShowing = true;
  const {ach} = _achQueue.shift();
  const popup = document.getElementById('ach-popup');
  const iconEl = document.getElementById('ach-popup-icon');
  if (ICONS[ach.id]) {
    iconEl.innerHTML = ICONS[ach.id];
  } else {
    iconEl.textContent = ach.icon || '🏆';
  }
  document.getElementById('ach-popup-name').textContent   = ach.name;
  document.getElementById('ach-popup-reward').textContent = '⬇ Заберите награду в разделе «Достижения»';
  // Секретные — радужная рамка + конфетти
  popup.className = ach.secret ? 'secret' : '';
  popup.classList.remove('hidden');
  playAchChime(ach.secret);
  haptic('heavy');
  if (ach.secret) spawnConfetti();
  clearTimeout(popup._t);
  popup._t = setTimeout(() => {
    popup.classList.add('hidden');
    setTimeout(_showNextAch, 350);
  }, 3800);
}

// ── SVG-иконки ────────────────────────────────────────────────────
const ICONS = {
  // ─── Достижения: Клики ───
  a01:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M18 8a2 2 0 00-4 0v5.5a2 2 0 00-3 1.8v2a2 2 0 00-1 1.7v2c0 3 2.5 5 5.5 5H17c3 0 5.5-2 5.5-5v-5.5a2 2 0 00-4-0.5V8z" fill="#7fd49a"/><circle cx="16" cy="11" r="1.5" fill="#d4f4e2" opacity=".6"/></svg>`,
  a02:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M9 13h4v8H9c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2z" fill="#7fd49a"/><path d="M23 13h-4v8h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2z" fill="#7fd49a"/><rect x="13" y="11" width="6" height="10" rx="2" fill="#5dc987"/></svg>`,
  a03:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 5c-2 5-6 7-4 13 1 2.5 3 4 4 4s3-1.5 4-4c2-6-2-8-4-13z" fill="#f7c948"/><path d="M16 12c-1 2.5-3 3.5-2 7 .5 1.5 2 2.5 2 2.5s1.5-1 2-2.5c1-3.5-1-4.5-2-7z" fill="#ff9f43"/></svg>`,
  a04:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><g fill="#7fd49a"><rect x="14.5" y="3" width="3" height="5" rx="1"/><rect x="14.5" y="3" width="3" height="5" rx="1" transform="rotate(45 16 16)"/><rect x="14.5" y="3" width="3" height="5" rx="1" transform="rotate(90 16 16)"/><rect x="14.5" y="3" width="3" height="5" rx="1" transform="rotate(135 16 16)"/><rect x="14.5" y="3" width="3" height="5" rx="1" transform="rotate(180 16 16)"/><rect x="14.5" y="3" width="3" height="5" rx="1" transform="rotate(225 16 16)"/><rect x="14.5" y="3" width="3" height="5" rx="1" transform="rotate(270 16 16)"/><rect x="14.5" y="3" width="3" height="5" rx="1" transform="rotate(315 16 16)"/></g><circle cx="16" cy="16" r="5" fill="#3d9e5f"/><circle cx="16" cy="16" r="3" fill="#162b1c"/></svg>`,
  a05:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M8 22c0-4 2-6 4-7l1-3c0-1.5 1.5-2.5 3-2s2.5 2 2 3.5L17 16c2 .5 5 2 5 6" stroke="#7fd49a" stroke-width="2.5" stroke-linecap="round"/><path d="M10 22h12" stroke="#7fd49a" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="10" r="2.5" fill="#5dc987"/></svg>`,
  a06:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><circle cx="16" cy="14" r="7" fill="#f7c948" stroke="#e6a800" stroke-width="1"/><path d="M13 14l2 2 4-4" stroke="#162b1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 21l-2 6 5-3 5 3-2-6" fill="#f7c948" stroke="#e6a800" stroke-width="1"/></svg>`,
  a07:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 4l5 8h5l-4 8-6 7-6-7-4-8h5z" fill="#4fc3f7"/><path d="M16 4l5 8h-10z" fill="#81d4fa"/><path d="M11 12l5 15 5-15" stroke="#0288d1" stroke-width="1" opacity=".6"/><line x1="6" y1="12" x2="26" y2="12" stroke="#81d4fa" stroke-width="1"/></svg>`,

  // ─── Достижения: Баланс/Заработок ───
  b01:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 24c0-8-5-9-4-14 1 2 3 3 4 3s3-1 4-3c1 5-4 6-4 14z" fill="#5dc987"/><path d="M16 26v-2M13 24h6" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  b02:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M10 19h12v5c0 1-1 2-2 2H12c-1 0-2-1-2-2v-5z" fill="#f7c948"/><path d="M10 11h12l-2 8H12l-2-8z" fill="#f7c948"/><path d="M8 11h16" stroke="#e6a800" stroke-width="1.5" stroke-linecap="round"/><path d="M13 9l3-4 3 4" stroke="#f7c948" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  b03:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M11 13c0-2 2-5 5-5s5 3 5 5v11c0 1.5-1 3-5 3s-5-1.5-5-3V13z" fill="#f7c948"/><path d="M13 10c.5-2 1.5-3 3-3s2.5 1 3 3" stroke="#e6a800" stroke-width="1.5" stroke-linecap="round"/><text x="16" y="21" text-anchor="middle" font-size="7" font-weight="900" fill="#162b1c" font-family="sans-serif">$</text></svg>`,
  b04:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><circle cx="16" cy="16" r="9" fill="#f7c948"/><text x="16" y="21" text-anchor="middle" font-size="12" font-weight="900" fill="#162b1c" font-family="sans-serif">$</text><circle cx="16" cy="16" r="9" stroke="#e6a800" stroke-width="1.5" fill="none"/></svg>`,
  b05:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><polygon points="16,5 18.9,12.6 27,13 21,18.5 23,26 16,22 9,26 11,18.5 5,13 13.1,12.6" fill="#f7c948" stroke="#e6a800" stroke-width="1" stroke-linejoin="round"/></svg>`,
  b06:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M8 22h16v2c0 1-1 2-2 2H10c-1 0-2-1-2-2v-2z" fill="#f7c948"/><path d="M8 22l2-9h12l2 9" fill="#f7c948"/><path d="M8 22l4-6v6M16 22V16M24 22l-4-6v6" stroke="#e6a800" stroke-width="1"/><circle cx="10" cy="13" r="2" fill="#ff9f43"/><circle cx="16" cy="11" r="2" fill="#ff9f43"/><circle cx="22" cy="13" r="2" fill="#ff9f43"/></svg>`,
  b07:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 5v22M10 9l6-4 6 4M10 23l6 4 6-4" stroke="#f7c948" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 9v14M22 9v14" stroke="#f7c948" stroke-width="2" stroke-linecap="round"/></svg>`,

  // ─── Достижения: Магазин ───
  u01:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M6 10h20l-2 12H8L6 10z" fill="none" stroke="#7fd49a" stroke-width="1.5"/><path d="M6 10l-2-4H2" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><circle cx="11" cy="25" r="2" fill="#7fd49a"/><circle cx="21" cy="25" r="2" fill="#7fd49a"/><path d="M12 10l1 7M20 10l-1 7M12 17h8" stroke="#5dc987" stroke-width="1" opacity=".7"/></svg>`,
  u02:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="8" y="18" width="16" height="6" rx="2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1"/><rect x="9" y="13" width="14" height="6" rx="2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1"/><rect x="10" y="8" width="12" height="6" rx="2" fill="#5dc987" stroke="#7fd49a" stroke-width="1"/></svg>`,
  u03:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="8" y="14" width="16" height="12" rx="1" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><path d="M5 14h22" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><path d="M8 14l3-6h10l3 6" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5" stroke-linejoin="round"/><rect x="13" y="19" width="6" height="7" rx="1" fill="#7fd49a" opacity=".5"/></svg>`,
  u04:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="8" y="20" width="16" height="6" rx="1" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><rect x="11" y="12" width="10" height="9" rx="1" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><path d="M8 12h16" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><path d="M11 7h10l1 5H10l1-5z" fill="#5dc987" stroke="#7fd49a" stroke-width="1"/><rect x="14" y="14" width="4" height="7" rx="1" fill="#7fd49a" opacity=".5"/></svg>`,
  u05:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><circle cx="16" cy="16" r="8" stroke="#7fd49a" stroke-width="1.5" fill="none"/><ellipse cx="16" cy="16" rx="4" ry="8" stroke="#7fd49a" stroke-width="1.5" fill="none"/><line x1="8" y1="16" x2="24" y2="16" stroke="#7fd49a" stroke-width="1.5"/><line x1="9" y1="11.5" x2="23" y2="11.5" stroke="#7fd49a" stroke-width="1"/><line x1="9" y1="20.5" x2="23" y2="20.5" stroke="#7fd49a" stroke-width="1"/></svg>`,

  // ─── Достижения: Авто-доход ───
  i01:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="9" y="10" width="14" height="12" rx="3" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><circle cx="12.5" cy="15" r="2" fill="#7fd49a"/><circle cx="19.5" cy="15" r="2" fill="#7fd49a"/><path d="M13 20h6" stroke="#5dc987" stroke-width="1.5" stroke-linecap="round"/><rect x="13" y="7" width="6" height="3" rx="1" fill="#5dc987"/><path d="M9 16H6M23 16h3" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  i02:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="7" y="16" width="10" height="10" rx="1" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><rect x="17" y="19" width="8" height="7" rx="1" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><rect x="9" y="13" width="6" height="4" rx="1" fill="#5dc987"/><path d="M11 10V8M13 9V7M15 10V8" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><rect x="9" y="19" width="3" height="4" rx="1" fill="#7fd49a" opacity=".6"/></svg>`,
  i03:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="5" y="18" width="5" height="8" rx="1" fill="#3d9e5f"/><rect x="11" y="13" width="5" height="13" rx="1" fill="#5dc987"/><rect x="17" y="15" width="5" height="11" rx="1" fill="#3d9e5f"/><rect x="23" y="20" width="4" height="6" rx="1" fill="#3d9e5f"/><rect x="12" y="9" width="3" height="5" rx="1" fill="#7fd49a"/><line x1="5" y1="26" x2="27" y2="26" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  i04:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="5" y="19" width="4" height="7" rx="1" fill="#2d7a48"/><rect x="10" y="15" width="4" height="11" rx="1" fill="#3d9e5f"/><rect x="15" y="17" width="4" height="9" rx="1" fill="#2d7a48"/><rect x="20" y="21" width="4" height="5" rx="1" fill="#2d7a48"/><path d="M22 9a4 4 0 11-4 4" stroke="#f7c948" stroke-width="1.5" stroke-linecap="round"/><circle cx="22" cy="9" r="3" fill="#f7c948" opacity=".9"/><line x1="5" y1="26" x2="27" y2="26" stroke="#5dc987" stroke-width="1" stroke-linecap="round"/></svg>`,
  i05:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><circle cx="16" cy="16" r="4" fill="#7fd49a"/><path d="M16 12c-2-3-6-4-8-2" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M12 10c-3-1-6 1-7 4" stroke="#5dc987" stroke-width="1" stroke-linecap="round" fill="none"/><path d="M20 12c2-3 6-4 8-2" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20 20c3 1 6-1 7-4" stroke="#5dc987" stroke-width="1" stroke-linecap="round" fill="none"/><path d="M16 20c2 3 6 4 8 2" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M12 20c-3 1-6-1-7-4" stroke="#5dc987" stroke-width="1" stroke-linecap="round" fill="none"/><circle cx="16" cy="16" r="2" fill="#d4f4e2"/></svg>`,

  // ─── Достижения: Множитель ───
  m01:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 27l-4-6H8l4-6-4-6h4l4-6 4 6h4l-4 6 4 6h-4z" fill="#f7c948" stroke="#e6a800" stroke-width="1" stroke-linejoin="round"/><path d="M16 21l-2-3H11l2-3-2-3h3l2-3 2 3h3l-2 3 2 3h-3z" fill="#ff9f43"/></svg>`,
  m02:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M17 5l-8 13h6l-2 9 9-13h-6z" fill="#f7c948" stroke="#e6a800" stroke-width="1" stroke-linejoin="round"/></svg>`,
  m03:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 16m-1 0a1 1 0 102 0 1 1 0 10-2 0" fill="#7fd49a"/><path d="M16 16c0-3 4-5 4-8" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M16 16c3 0 5 4 8 4" stroke="#5dc987" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M16 16c0 3-4 5-4 8" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M16 16c-3 0-5-4-8-4" stroke="#5dc987" stroke-width="1.5" stroke-linecap="round" fill="none"/><circle cx="16" cy="8" r="2" fill="#7fd49a" opacity=".8"/><circle cx="24" cy="20" r="2" fill="#5dc987" opacity=".8"/><circle cx="16" cy="24" r="2" fill="#7fd49a" opacity=".8"/><circle cx="8" cy="12" r="2" fill="#5dc987" opacity=".8"/></svg>`,
  m04:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M5 16c0-3.5 2.5-6 5.5-6S16 13 16 16s3 6 5.5 6S27 19.5 27 16" stroke="#7fd49a" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="10.5" cy="16" r="3" fill="none" stroke="#7fd49a" stroke-width="2"/><circle cx="21.5" cy="16" r="3" fill="none" stroke="#7fd49a" stroke-width="2"/></svg>`,

  // ─── Достижения: Уровни ───
  l01:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 26c-2-5-8-8-7-15 2 2 4 3 7 3s5-1 7-3c1 7-5 10-7 15z" fill="#5dc987"/><path d="M16 22c-1-3-4-5-4-10 1 1 2.5 2 4 2s3-1 4-2c0 5-3 7-4 10z" fill="#7fd49a"/><line x1="16" y1="8" x2="16" y2="26" stroke="#3d9e5f" stroke-width="1" opacity=".5"/></svg>`,
  l02:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><ellipse cx="16" cy="13" rx="8" ry="7" fill="#3d9e5f"/><ellipse cx="16" cy="13" rx="5" ry="4" fill="#5dc987"/><rect x="14" y="19" width="4" height="7" rx="1" fill="#2d6e45"/><ellipse cx="16" cy="13" rx="2.5" ry="2" fill="#7fd49a"/></svg>`,
  l03:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 6L8 24h16z" fill="#5dc987" stroke="#7fd49a" stroke-width="1" stroke-linejoin="round"/><path d="M11 17L5 27h22L21 17" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1" stroke-linejoin="round"/><path d="M8 24h16" stroke="#7fd49a" stroke-width="1" opacity=".5"/></svg>`,
  l04:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><ellipse cx="16" cy="17" rx="7" ry="5" fill="#f7c948"/><circle cx="16" cy="13" rx="4" ry="4" fill="#f7c948" rx="4"/><circle cx="16" cy="13" r="4" fill="#f7c948"/><circle cx="13" cy="12" r="1.5" fill="#162b1c"/><circle cx="19" cy="12" r="1.5" fill="#162b1c"/><path d="M14 16h4" stroke="#162b1c" stroke-width="1" stroke-linecap="round"/><path d="M10 17c-2 0-3-1-3-2s1-2 3-2M22 17c2 0 3-1 3-2s-1-2-3-2" stroke="#e6a800" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M10 22c2 2 8 3 12 0" stroke="#e6a800" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`,
  l05:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M8 22l12-14" stroke="#f7c948" stroke-width="2" stroke-linecap="round"/><polygon points="20,8 22,12 19,11 21,15 18,13 20,18 16,14 18,10 15,12 17,7" fill="#f7c948"/><circle cx="20" cy="8" r="2.5" fill="#fff" opacity=".9"/></svg>`,

  // ─── Достижения: Прогресс ───
  ac1:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="9" y="8" width="14" height="16" rx="2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><path d="M9 8c0-1 1-2 2-2h10c1 0 2 1 2 2" stroke="#7fd49a" stroke-width="1"/><line x1="12" y1="13" x2="20" y2="13" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="17" x2="20" y2="17" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="21" x2="17" y2="21" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><circle cx="21" cy="21" r="3" fill="#f7c948"/><path d="M20 21l1 1 2-2" stroke="#162b1c" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ac2:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><circle cx="16" cy="16" r="8" stroke="#7fd49a" stroke-width="1.5" fill="none"/><circle cx="16" cy="16" r="5" stroke="#5dc987" stroke-width="1.5" fill="none"/><circle cx="16" cy="16" r="2" stroke="#f7c948" stroke-width="1.5" fill="none"/><circle cx="16" cy="16" r="0.8" fill="#f7c948"/></svg>`,
  ac3:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><circle cx="16" cy="13" r="6" fill="#f7c948" stroke="#e6a800" stroke-width="1"/><polygon points="16,9 17.2,12.1 20.5,12.5 18,14.7 18.8,18 16,16.3 13.2,18 14,14.7 11.5,12.5 14.8,12.1" fill="#162b1c" opacity=".3"/><path d="M12 18l-3 8 7-3 7 3-3-8" fill="#f7c948" stroke="#e6a800" stroke-width="1"/></svg>`,

  // ─── Достижения: Секретные ───
  s01:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#0a0f1a"/><path d="M20 9a8 8 0 11-8 8 6 6 0 008-8z" fill="#f7c948"/><circle cx="9" cy="9" r="1.5" fill="#f7c948" opacity=".6"/><circle cx="22" cy="7" r="1" fill="#f7c948" opacity=".8"/><circle cx="25" cy="14" r="1.2" fill="#f7c948" opacity=".5"/></svg>`,
  s02:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#0a1a2e"/><path d="M5 20h22" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><path d="M16 7v5M9 10l3 3M23 10l-3 3" stroke="#f7c948" stroke-width="1.5" stroke-linecap="round"/><path d="M16 7a6 6 0 016 6H10a6 6 0 016-6z" fill="#f7c948" opacity=".9"/><path d="M5 20c0 0 2-4 11-4s11 4 11 4" fill="#3d9e5f"/></svg>`,
  s03:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M20 6l-10 13h7l-5 7 11-14h-7z" fill="#f7c948"/><path d="M5 16h3M24 16h3M7 10l2 1M23 10l-2 1M7 22l2-1M23 22l-2-1" stroke="#f7c948" stroke-width="1.5" stroke-linecap="round" opacity=".5"/></svg>`,
  s04:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M10 6h12l-5 9h5l-12 11 5-9H10z" fill="none" stroke="#7fd49a" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 15h6" stroke="#7fd49a" stroke-width="2" stroke-linecap="round"/></svg>`,
  s05:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><circle cx="12" cy="12" r="5" stroke="#f7c948" stroke-width="2" fill="none"/><path d="M16 16l9 9" stroke="#f7c948" stroke-width="2.5" stroke-linecap="round"/><rect x="20" y="19" width="4" height="3" rx="1" transform="rotate(45 20 19)" fill="#f7c948"/></svg>`,
  s06:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#0a1a2e"/><path d="M16 4l8 8-8 16-8-16z" fill="#4fc3f7" opacity=".9"/><path d="M16 4l8 8H8z" fill="#81d4fa"/><path d="M8 12l8 16 8-16" stroke="#0288d1" stroke-width="1"/><line x1="8" y1="12" x2="24" y2="12" stroke="#81d4fa" stroke-width="1"/></svg>`,

  // ─── Улучшения: Сила клика ───
  click1:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 8l-6 6 3 1-5 10 4-1-1 4 10-8-4-1 5-9-4 1z" fill="#7fd49a" stroke="#5dc987" stroke-width="1" stroke-linejoin="round"/></svg>`,
  click2:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M10 12c0-4 3-7 7-6 3 1 5 3 5 7v8c0 2-2 3-4 3H13c-2 0-3-1-3-3v-9z" fill="#7fd49a"/><path d="M10 12c0-4 3-6 6-5" stroke="#5dc987" stroke-width="1.5" stroke-linecap="round"/><rect x="12" y="8" width="8" height="4" rx="2" fill="#5dc987"/></svg>`,
  click3:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><line x1="16" y1="5" x2="16" y2="27" stroke="#7fd49a" stroke-width="3" stroke-linecap="round"/><path d="M16 5c0 0 6 5 6 11s-6 11-6 11" stroke="#5dc987" stroke-width="1.5" stroke-linecap="round" fill="none"/><circle cx="16" cy="16" r="3" fill="#7fd49a"/><path d="M9 10l4 6-4 6M23 10l-4 6 4 6" stroke="#7fd49a" stroke-width="1" stroke-linecap="round" fill="none" opacity=".5"/></svg>`,
  click4:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 5l5 9h-3l4 13-10-9h4z" fill="#b39ddb" stroke="#9c7adb" stroke-width="1" stroke-linejoin="round"/><path d="M16 5l-5 9h3l-4 13 10-9h-4z" fill="#9c7adb" opacity=".7"/></svg>`,

  // ─── Улучшения: Авто ───
  auto1:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M8 12h16v12c0 1-1 2-2 2H10c-1 0-2-1-2-2V12z" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><path d="M8 12c0-3 3-5 8-5s8 2 8 5" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1.5"/><line x1="16" y1="7" x2="16" y2="12" stroke="#7fd49a" stroke-width="1.5"/><rect x="11" y="16" width="4" height="4" rx="1" fill="#7fd49a"/><rect x="17" y="16" width="4" height="4" rx="1" fill="#7fd49a"/></svg>`,
  auto2:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><rect x="10" y="9" width="12" height="11" rx="2" fill="#5dc987" stroke="#7fd49a" stroke-width="1.5"/><circle cx="13" cy="14" r="1.5" fill="#162b1c"/><circle cx="19" cy="14" r="1.5" fill="#162b1c"/><path d="M13 19h6" stroke="#162b1c" stroke-width="1.5" stroke-linecap="round"/><rect x="14" y="6" width="4" height="3" rx="1" fill="#7fd49a"/><path d="M10 16H7M22 16h3" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><path d="M12 20l-2 5M20 20l2 5" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  auto3:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><ellipse cx="10" cy="12" rx="4" ry="2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1"/><ellipse cx="22" cy="12" rx="4" ry="2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1"/><ellipse cx="10" cy="20" rx="4" ry="2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1"/><ellipse cx="22" cy="20" rx="4" ry="2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1"/><circle cx="16" cy="16" r="4" fill="#5dc987" stroke="#7fd49a" stroke-width="1.5"/><rect x="15" y="12" width="2" height="8" rx="1" fill="#7fd49a" opacity=".5"/><rect x="12" y="15" width="8" height="2" rx="1" fill="#7fd49a" opacity=".5"/></svg>`,
  auto4:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M11 9c0 0-2 3 0 5s4 1 5 3 0 5-2 6" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M21 9c0 0 2 3 0 5s-4 1-5 3 0 5 2 6" stroke="#5dc987" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M13 9h6M13 23h6" stroke="#7fd49a" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="9" r="2" fill="#7fd49a"/><circle cx="22" cy="9" r="2" fill="#5dc987"/><circle cx="10" cy="23" r="2" fill="#5dc987"/><circle cx="22" cy="23" r="2" fill="#7fd49a"/></svg>`,

  // ─── Улучшения: Множитель ───
  multi1:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M8 14c0-3 3-5 8-5s8 2 8 5" stroke="#7fd49a" stroke-width="1.5" fill="none"/><path d="M8 14c-1 0-2 1-2 2s1 2 2 2h20c1 0 2-1 2-2s-1-2-2-2" fill="#3d9e5f" stroke="#7fd49a" stroke-width="1"/><path d="M10 18l1 8h10l1-8" stroke="#7fd49a" stroke-width="1" fill="none"/><circle cx="12" cy="22" r="1.5" fill="#f7c948"/><circle cx="16" cy="24" r="1.5" fill="#f7c948"/><circle cx="20" cy="22" r="1.5" fill="#f7c948"/></svg>`,
  multi2:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><polygon points="16,5 18.9,12.6 27,13 21,18.5 23,26 16,22 9,26 11,18.5 5,13 13.1,12.6" fill="#f7c948" stroke="#e6a800" stroke-width="1"/><circle cx="16" cy="16" r="4" fill="#e6a800"/><text x="16" y="19.5" text-anchor="middle" font-size="6" font-weight="900" fill="#f7c948" font-family="sans-serif">★</text></svg>`,
  multi3:`<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#162b1c"/><path d="M16 26l-4-5H8l2-5-6-5h6l2-5h8l2 5h6l-6 5 2 5h-4z" fill="#f7c948" stroke="#e6a800" stroke-width="1" stroke-linejoin="round"/><path d="M16 26l-2-5h4z" fill="#ff9f43"/><path d="M8 11l8-7 8 7" fill="#ff9f43" stroke="#e6a800" stroke-width="1" stroke-linejoin="round"/></svg>`,
};

// ── Конфиг улучшений ──────────────────────────────────────────────
// Мультипликаторы цены по категориям (сбалансированные):
//   click: ×1.50 — умеренный рост (основа геймплея)
//   auto:  ×1.40 — медленнее, т.к. пассивный доход
//   multi: ×1.60 — дороже всего, т.к. глобальный бонус
const COST_MULT = { click: 1.50, auto: 1.40, multi: 1.60 };

const UPGRADES = {
  click:[
    {id:'click1',name:'Острые когти',  icon:'🦅',desc:'+2 к силе клика', baseCost:50,   effect:2,  category:'click'},
    {id:'click2',name:'Стальной кулак',icon:'🥊',desc:'+5 к силе клика', baseCost:250,  effect:5,  category:'click'},
    {id:'click3',name:'Лазерный луч',  icon:'⚡',desc:'+15 к силе клика',baseCost:1200, effect:15, category:'click'},
    {id:'click4',name:'Квантовый удар',icon:'🔮',desc:'+50 к силе клика',baseCost:8000, effect:50, category:'click'},
  ],
  auto:[
    {id:'auto1',name:'Мышка-кликер',  icon:'🐭',desc:'+0.5/сек', baseCost:100,   effect:0.5,category:'auto'},
    {id:'auto2',name:'Робот-помощник',icon:'🤖',desc:'+2/сек',   baseCost:600,   effect:2,  category:'auto'},
    {id:'auto3',name:'Ферма дронов',  icon:'🚁',desc:'+8/сек',   baseCost:3500,  effect:8,  category:'auto'},
    {id:'auto4',name:'ИИ-майнер',     icon:'🧠',desc:'+25/сек',  baseCost:20000, effect:25, category:'auto'},
  ],
  multi:[
    {id:'multi1',name:'Денежный дождь',icon:'💸',desc:'x1.5 весь доход',baseCost:500,   effect:1.5,category:'multi'},
    {id:'multi2',name:'Золотой бонус', icon:'🥇',desc:'x2 весь доход',  baseCost:3000,  effect:2,  category:'multi'},
    {id:'multi3',name:'Мегабуст',      icon:'🚀',desc:'x3 весь доход',  baseCost:15000, effect:3,  category:'multi'},
  ],
};

// ── Достижения ────────────────────────────────────────────────────
// reward.type: 'coins' | 'click' | 'auto'
// secret: true — не показываются в списке пока не получены, радуга при получении

const ACHIEVEMENTS = [
  // === КЛИКИ ===
  {id:'a01',name:'Первое прикосновение',icon:'👆',desc:'Сделай 1 клик',         reward:{type:'coins',val:5},     check:s=>s.totalClicks>=1},
  {id:'a02',name:'Тепло рук',           icon:'🤲',desc:'10 кликов',            reward:{type:'coins',val:25},    check:s=>s.totalClicks>=10},
  {id:'a03',name:'Кликоман',            icon:'🔥',desc:'100 кликов',           reward:{type:'coins',val:100},   check:s=>s.totalClicks>=100},
  {id:'a04',name:'Машина кликов',       icon:'⚙️',desc:'1 000 кликов',        reward:{type:'coins',val:500},   check:s=>s.totalClicks>=1000},
  {id:'a05',name:'Клик-мастер',         icon:'💪',desc:'10 000 кликов',        reward:{type:'click',val:1},     check:s=>s.totalClicks>=10000},
  {id:'a06',name:'Легенда кликера',     icon:'🏅',desc:'100 000 кликов',       reward:{type:'click',val:3},     check:s=>s.totalClicks>=100000},
  {id:'a07',name:'Миллион касаний',     icon:'💎',desc:'1 000 000 кликов',     reward:{type:'click',val:10},    check:s=>s.totalClicks>=1000000},

  // === БАЛАНС / ЗАРАБОТОК ===
  {id:'b01',name:'Первые монеты',   icon:'🌱',desc:'Заработай 500 монет',        reward:{type:'coins',val:50},    check:s=>s.totalEarned>=500},
  {id:'b02',name:'Тысячник',        icon:'🏆',desc:'Заработай 1 000 монет',      reward:{type:'coins',val:250},   check:s=>s.totalEarned>=1000},
  {id:'b03',name:'Капиталист',      icon:'💰',desc:'Заработай 10 000 монет',     reward:{type:'coins',val:1000},  check:s=>s.totalEarned>=10000},
  {id:'b04',name:'Богач',           icon:'🤑',desc:'Заработай 100 000 монет',    reward:{type:'coins',val:5000},  check:s=>s.totalEarned>=100000},
  {id:'b05',name:'Миллионер',       icon:'🌟',desc:'Заработай 1 000 000 монет',  reward:{type:'auto', val:1},     check:s=>s.totalEarned>=1000000},
  {id:'b06',name:'Мультимиллионер', icon:'👑',desc:'Заработай 10M монет',        reward:{type:'auto', val:5},     check:s=>s.totalEarned>=10000000},
  {id:'b07',name:'Биллионер',       icon:'🔱',desc:'Заработай 1B монет',         reward:{type:'auto', val:25},    check:s=>s.totalEarned>=1000000000},

  // === МАГАЗИН / УЛУЧШЕНИЯ ===
  {id:'u01',name:'Первая покупка',  icon:'🛒',desc:'Купи 1 улучшение',            reward:{type:'coins',val:50},    check:s=>totalUpgrades(s)>=1},
  {id:'u02',name:'Коллекционер',   icon:'🗂️',desc:'Купи 5 улучшений суммарно',  reward:{type:'coins',val:250},   check:s=>totalUpgrades(s)>=5},
  {id:'u03',name:'Шоппер',         icon:'🏪',desc:'Купи 20 улучшений суммарно',  reward:{type:'click',val:2},     check:s=>totalUpgrades(s)>=20},
  {id:'u04',name:'Магнат',         icon:'🏦',desc:'Купи 50 улучшений суммарно',  reward:{type:'click',val:5},     check:s=>totalUpgrades(s)>=50},
  {id:'u05',name:'Монополист',     icon:'🌐',desc:'Купи 100 улучшений суммарно', reward:{type:'click',val:15},    check:s=>totalUpgrades(s)>=100},

  // === АВТ0-ДОХОД ===
  {id:'i01',name:'Первый автомат', icon:'🤖',desc:'Получи авто-доход 0.5/сек',   reward:{type:'auto', val:0.5},   check:s=>s.autoIncome>=0.5},
  {id:'i02',name:'Небольшой завод',icon:'🏭',desc:'Авто-доход 10/сек',           reward:{type:'auto', val:1},     check:s=>s.autoIncome>=10},
  {id:'i03',name:'Корпорация',     icon:'🌆',desc:'Авто-доход 50/сек',           reward:{type:'auto', val:5},     check:s=>s.autoIncome>=50},
  {id:'i04',name:'Мегакорпорация', icon:'🌃',desc:'Авто-доход 200/сек',          reward:{type:'auto', val:20},    check:s=>s.autoIncome>=200},
  {id:'i05',name:'Гиперимперия',   icon:'🌌',desc:'Авто-доход 1 000/сек',        reward:{type:'auto', val:100},   check:s=>s.autoIncome>=1000},

  // === МНОЖИТЕЛЬ ===
  {id:'m01',name:'Ускорение',     icon:'🚀',desc:'Множитель x1.5',               reward:{type:'coins',val:500},   check:s=>s.multiplier>=1.5},
  {id:'m02',name:'Турбо',         icon:'⚡',desc:'Множитель x3',                 reward:{type:'coins',val:2500},  check:s=>s.multiplier>=3},
  {id:'m03',name:'Гиперскорость', icon:'🌀',desc:'Множитель x6',                 reward:{type:'click',val:5},     check:s=>s.multiplier>=6},
  {id:'m04',name:'Бесконечность', icon:'♾️',desc:'Множитель x12',               reward:{type:'auto', val:10},    check:s=>s.multiplier>=12},

  // === УРОВНИ ===
  {id:'l01',name:'Новобранец',  icon:'🌿',desc:'Достигни 5 уровня',              reward:{type:'coins',val:250},   check:s=>getLevel(s)>=5},
  {id:'l02',name:'Опытный',     icon:'🌳',desc:'Достигни 10 уровня',             reward:{type:'coins',val:1000},  check:s=>getLevel(s)>=10},
  {id:'l03',name:'Ветеран',     icon:'🏔️',desc:'Достигни 25 уровня',           reward:{type:'click',val:3},     check:s=>getLevel(s)>=25},
  {id:'l04',name:'Элита',       icon:'🦁',desc:'Достигни 50 уровня',             reward:{type:'click',val:8},     check:s=>getLevel(s)>=50},
  {id:'l05',name:'Легенда',     icon:'🌠',desc:'Достигни 100 уровня',            reward:{type:'auto', val:15},    check:s=>getLevel(s)>=100},

  // === ПРОГРЕСС ДОСТИЖЕНИЙ ===
  {id:'ac1',name:'На пути',    icon:'🗺️',desc:'Получи 5 достижений',            reward:{type:'coins',val:1000},  check:s=>countUnlocked(s,'regular')>=5},
  {id:'ac2',name:'Охотник',    icon:'🎯',desc:'Получи 15 достижений',            reward:{type:'coins',val:5000},  check:s=>countUnlocked(s,'regular')>=15},
  {id:'ac3',name:'Коллекция',  icon:'🎖️',desc:'Получи 28 достижений',          reward:{type:'auto', val:5},     check:s=>countUnlocked(s,'regular')>=28},

  // === СЕКРЕТНЫЕ ===
  {id:'s01',name:'Ночной кликер',   icon:'🌙',desc:'Играй с полуночи до 4 утра',   reward:{type:'coins',val:1000},  check:s=>s.flags.playedAtNight,  secret:true},
  {id:'s02',name:'Ранняя пташка',   icon:'🌅',desc:'Войди в игру в 5–7 утра',      reward:{type:'coins',val:750},   check:s=>s.flags.playedEarlyMorn,secret:true},
  {id:'s03',name:'Скоростной',      icon:'⚡',desc:'20 кликов за 3 секунды',       reward:{type:'click',val:5},     check:s=>s.flags.rapidClick,     secret:true},
  {id:'s04',name:'Терпеливый',      icon:'⏳',desc:'Забери оффлайн-бонус за 8ч+', reward:{type:'auto', val:8},     check:s=>s.flags.longOffline,    secret:true},
  {id:'s05',name:'Искатель секретов',icon:'🔑',desc:'Открой 3 секретных достижения',reward:{type:'coins',val:7500},  check:s=>countUnlocked(s,'secret')>=3,secret:true},
  {id:'s06',name:'Перфекционист',   icon:'💠',desc:'Открой все 36 обычных достижений',reward:{type:'click',val:25}, check:s=>countUnlocked(s,'regular')>=36,secret:true},
];

const REGULAR_COUNT = ACHIEVEMENTS.filter(a=>!a.secret).length; // 36
const SECRET_COUNT  = ACHIEVEMENTS.filter(a=>a.secret).length;  // 6

// ── Система уровней ───────────────────────────────────────────────
// Уровень 1: 0–999 кликов (надо 1000 до след.)
// Уровень 2: 1000–1499 (надо 500, порог = 500*2 = 1000)
// Уровень N≥2: порог = 500*N, т.е. каждые 500 кликов — новый уровень
// Примеры: lv2=1000 кликов, lv3=1500, lv4=2000, lv10=5000, lv100=50000

function getLevel(s) {
  const tc = s.totalClicks;
  if (tc < 1000) return 1;
  return Math.floor(tc / 500);
}

function getLevelData(totalClicks) {
  const idx   = Math.floor(totalClicks / 500);
  const start = idx * 500;
  const cur   = totalClicks - start;
  return { level: idx + 1, current: cur, needed: 500, pct: cur / 500 };
}

// ── Вспомогательные функции для чеков ────────────────────────────
function totalUpgrades(s) { return Object.values(s.upgrades).reduce((a,b)=>a+b,0); }
function countUnlocked(s, type) {
  return ACHIEVEMENTS.filter(a=>{
    const has = s.claimed.includes(a.id) || (s.unlocked||[]).includes(a.id);
    if(type==='regular') return !a.secret && has;
    if(type==='secret')  return  a.secret && has;
    return has;
  }).length;
}

// ── Состояние игры ────────────────────────────────────────────────
function defaultState() {
  return {
    balance:0, clickPower:1, autoIncome:0, multiplier:1,
    achClickBonus:0, achAutoBonus:0,
    upgrades:{}, totalClicks:0, totalEarned:0,
    sessionClicks:0, lastSaveTime:Date.now(), version:6,
    claimed:[], unlocked:[],
    flags:{ playedAtNight:false, playedEarlyMorn:false, rapidClick:false, longOffline:false },
    offlineBonusMax:0,
  };
}

let state = defaultState();
let rapidClickBuf = [];
let autoTickInterval=null, autoSaveInterval=null, syncInterval=null;
let lbCategory = 'balance';
let lbCache = null;

// ── Сохранение / загрузка ─────────────────────────────────────────
function saveGame() {
  state.lastSaveTime = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){}
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw) {
      const saved = JSON.parse(raw);
      state = {...defaultState(), ...saved};
      if(!state.flags) state.flags={playedAtNight:false,playedEarlyMorn:false,rapidClick:false,longOffline:false};
      if(!state.claimed) state.claimed=[];
      if(!state.unlocked) state.unlocked=[];
      if(state.achClickBonus===undefined) state.achClickBonus=0;
      if(state.achAutoBonus ===undefined) state.achAutoBonus=0;
    }
  } catch(e){}
}

function calcOfflineBonus() {
  if(state.autoIncome<=0) return 0;
  const elapsed = Math.floor((Date.now()-state.lastSaveTime)/1000);
  if(elapsed<30) return 0;
  const sec = Math.min(elapsed, 8*3600);
  return sec * state.autoIncome * state.multiplier;
}

// ── Игровая механика ──────────────────────────────────────────────
function upgradeCost(upg) {
  const mult = COST_MULT[upg.category] || 1.50;
  return Math.floor(upg.baseCost * Math.pow(mult, state.upgrades[upg.id]||0));
}

function recalcStats() {
  let click=1, auto=0, multi=1;
  for(const cat of Object.values(UPGRADES))
    for(const u of cat){
      const lv=state.upgrades[u.id]||0; if(!lv) continue;
      if(u.category==='click') click+=u.effect*lv;
      if(u.category==='auto')  auto +=u.effect*lv;
      if(u.category==='multi') multi*=Math.pow(u.effect,lv);
    }
  state.clickPower = click + state.achClickBonus;
  state.autoIncome = auto  + state.achAutoBonus;
  state.multiplier = multi;
}

function handleClick(e) {
  // Флаг "Ночной кликер"
  const h = new Date().getHours();
  if(h>=0&&h<4)  state.flags.playedAtNight  = true;
  if(h>=5&&h<8)  state.flags.playedEarlyMorn= true;

  // Флаг "Скоростной": 20 кликов за 3 сек
  const now = Date.now();
  rapidClickBuf.push(now);
  rapidClickBuf = rapidClickBuf.filter(t=>now-t<=3000);
  if(rapidClickBuf.length>=20) state.flags.rapidClick = true;

  const earned = Math.floor(state.clickPower * state.multiplier);
  state.balance       += earned;
  state.totalClicks   += 1;
  state.totalEarned   += earned;
  state.sessionClicks += 1;
  playPop();
  haptic('light');
  spawnFloatNumber(e, `+${formatNum(earned)}`);
  updateUI();
  checkAllAchievements();
}

function autoTick() {
  if(state.autoIncome<=0) return;
  const earned = state.autoIncome * state.multiplier;
  state.balance     += earned;
  state.totalEarned += earned;
  updateBalanceDisplay();
}

function buyUpgrade(upgId) {
  const all=[...UPGRADES.click,...UPGRADES.auto,...UPGRADES.multi];
  const upg=all.find(u=>u.id===upgId); if(!upg) return;
  const cost=upgradeCost(upg);
  if(state.balance<cost){ showToast('Недостаточно монет!'); haptic('medium'); return; }
  state.balance-=cost;
  state.upgrades[upgId]=(state.upgrades[upgId]||0)+1;
  recalcStats();
  haptic('rigid');
  saveGame(); updateUI();
  showToast(`${upg.name} — уровень ${state.upgrades[upgId]}!`);
  checkAllAchievements();
}

// ── Достижения — проверка и выдача наград ─────────────────────────
function applyReward(reward, silent=false) {
  const {type,val} = reward;
  let msg = '';
  if(type==='coins'){ state.balance+=val; state.totalEarned+=val; msg=`+${formatNum(val)} монет`; }
  if(type==='click'){ state.achClickBonus+=val; recalcStats(); msg=`+${val} к силе клика`; }
  if(type==='auto') { state.achAutoBonus +=val; recalcStats(); msg=`+${val}/сек`; }
  return msg;
}

function checkAllAchievements() {
  let anyNew=false;
  for(const ach of ACHIEVEMENTS){
    if(state.claimed.includes(ach.id) || state.unlocked.includes(ach.id)) continue;
    if(ach.check(state)){
      state.unlocked.push(ach.id);
      queueAchievement(ach);
      anyNew=true;
    }
  }
  if(anyNew){ saveGame(); updateAchStats(); }
}

function claimAchievement(id) {
  if(state.claimed.includes(id) || !state.unlocked.includes(id)) return;
  const ach = ACHIEVEMENTS.find(a=>a.id===id);
  if(!ach) return;
  state.claimed.push(id);
  const msg = applyReward(ach.reward);
  showToast(`${ach.name}: ${msg}!`);
  haptic('heavy');
  saveGame();
  updateUI();
  renderAchievements();
  updateAchStats();
}

// ── Синхронизация с ботом ─────────────────────────────────────────
function syncWithBot() {
  if(!tg?.sendData) return;
  try {
    const payload = JSON.stringify({
      balance:      Math.floor(state.balance),
      clickPower:   state.clickPower,
      autoIncome:   state.autoIncome,
      sessionClicks:state.sessionClicks,
      totalClicks:  state.totalClicks,
      achievements: state.claimed.length,
      level:        getLevel(state),
      username:     TG_USERNAME,
    });
    if(payload.length>4000) return;
    tg.sendData(payload);
    state.sessionClicks=0;
  } catch(e){}
}

// ── Форматирование ────────────────────────────────────────────────
function formatNum(n) {
  n=Math.floor(n);
  if(n>=1e12) return (n/1e12).toFixed(2)+'T';
  if(n>=1e9)  return (n/1e9).toFixed(2)+'B';
  if(n>=1e6)  return (n/1e6).toFixed(2)+'M';
  if(n>=1e3)  return (n/1e3).toFixed(2)+'K';
  return n.toLocaleString('ru');
}

// ── UI ────────────────────────────────────────────────────────────
function updateBalanceDisplay() {
  document.getElementById('coin-count').textContent = formatNum(state.balance);
}

function updateUI() {
  updateBalanceDisplay();
  document.getElementById('header-cps').textContent   = formatNum(state.autoIncome*state.multiplier);
  document.getElementById('header-click').textContent = formatNum(state.clickPower*state.multiplier);
  document.getElementById('info-click').textContent   = formatNum(state.clickPower);
  document.getElementById('info-auto').textContent    = formatNum(state.autoIncome*state.multiplier);
  document.getElementById('info-multi').textContent   = state.multiplier.toFixed(2);
  const ld = getLevelData(state.totalClicks);
  document.getElementById('level-text').textContent = `Уровень ${ld.level}`;
  document.getElementById('level-next').textContent = `${ld.current.toLocaleString('ru')} / ${ld.needed.toLocaleString('ru')} кликов`;
  document.getElementById('level-fill').style.width = `${Math.min(ld.pct*100,100)}%`;
  renderShop();
  renderStats();
}

function renderShop() {
  const sections=[
    {label:'Сила клика',      upgrades:UPGRADES.click},
    {label:'Авто-кликер',     upgrades:UPGRADES.auto},
    {label:'Множитель дохода',upgrades:UPGRADES.multi},
  ];
  let html='';
  for(const s of sections){
    html+=`<div class="shop-section-title">${s.label}</div>`;
    for(const upg of s.upgrades){
      const lv=state.upgrades[upg.id]||0, cost=upgradeCost(upg);
      const afford=state.balance>=cost, pct=Math.min((lv/20)*100,100);
      const iconHtml = ICONS[upg.id]
        ? `<div class="upgrade-icon svg-icon">${ICONS[upg.id]}</div>`
        : `<div class="upgrade-icon">${upg.icon}</div>`;
      html+=`<div class="upgrade-card ${afford?'affordable':''}">
        ${iconHtml}
        <div class="upgrade-info">
          <div class="upgrade-name">${upg.name}</div>
          <div class="upgrade-desc">${upg.desc}</div>
          <div class="upgrade-level">Уровень ${lv}</div>
          <div class="upgrade-mini-bar"><div class="upgrade-mini-fill" style="width:${pct}%"></div></div>
        </div>
        <button class="upgrade-buy-btn" ${afford?'':'disabled'} onclick="buyUpgrade('${upg.id}')">
          Купить<span class="btn-cost">${formatNum(cost)}</span>
        </button>
      </div>`;
    }
  }
  document.getElementById('shop-content').innerHTML=html;
}

function renderStats() {
  document.getElementById('stat-balance').textContent     = formatNum(state.balance);
  document.getElementById('stat-click').textContent       = formatNum(state.clickPower);
  document.getElementById('stat-auto').textContent        = formatNum(state.autoIncome);
  document.getElementById('stat-multi').textContent       = `x${state.multiplier.toFixed(2)}`;
  document.getElementById('stat-total-clicks').textContent= formatNum(state.totalClicks);
  document.getElementById('stat-total-earned').textContent= formatNum(state.totalEarned);
  updateAchStats();
  renderAchievements();
}

function updateAchStats() {
  const reg = countUnlocked(state,'regular');
  const sec = countUnlocked(state,'secret');
  document.getElementById('ach-count-regular').textContent = `${reg} / ${REGULAR_COUNT}`;
  document.getElementById('ach-fill-regular').style.width  = `${(reg/REGULAR_COUNT)*100}%`;
  document.getElementById('ach-count-secret').textContent  = sec>0 ? `${sec} / ${SECRET_COUNT}` : '? / ?';
  document.getElementById('ach-fill-secret').style.width   = `${(sec/SECRET_COUNT)*100}%`;
  // Badge: сколько наград ещё не получено
  const unclaimed = state.unlocked.filter(id=>!state.claimed.includes(id)).length;
  const badge = document.getElementById('stats-tab-badge');
  if(badge){
    badge.textContent = unclaimed > 0 ? unclaimed : '';
    badge.style.display = unclaimed > 0 ? 'flex' : 'none';
  }
}

function rewardLabel(r) {
  if(r.type==='coins') return `+${formatNum(r.val)} монет`;
  if(r.type==='click') return `+${r.val} к силе клика`;
  if(r.type==='auto')  return `+${r.val}/сек`;
  return '';
}

function renderAchievements() {
  let html='';
  for(const ach of ACHIEVEMENTS){
    const isClaimed  = state.claimed.includes(ach.id);
    const isUnlocked = state.unlocked.includes(ach.id);
    const hasAny = isClaimed || isUnlocked;
    const iconSvg = ICONS[ach.id]
      ? `<div class="achievement-icon svg-icon">${ICONS[ach.id]}</div>`
      : `<div class="achievement-icon">${ach.icon}</div>`;
    if(ach.secret && !hasAny){
      html+=`<div class="achievement secret locked">
        <div class="achievement-icon svg-icon"><svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#0f1f14"/><rect x="11" y="15" width="10" height="9" rx="2" fill="#3d9e5f"/><path d="M12 15v-3a4 4 0 018 0v3" stroke="#5dc987" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="16" cy="19.5" r="1.5" fill="#162b1c"/></svg></div>
        <div class="achievement-info">
          <div class="ach-name">???</div>
          <div class="ach-desc">Секретное достижение</div>
        </div>
        <div class="ach-secret-badge">SECRET</div>
      </div>`;
      continue;
    }
    const claimBtn = isUnlocked && !isClaimed
      ? `<button class="ach-claim-btn" onclick="claimAchievement('${ach.id}')">Получить</button>`
      : '';
    const rewardHtml = isClaimed
      ? `<div class="ach-reward claimed-label">✓ Получено: ${rewardLabel(ach.reward)}</div>`
      : `<div class="ach-reward">${rewardLabel(ach.reward)}</div>`;
    html+=`<div class="achievement ${ach.secret?'secret':''}${isClaimed?' claimed':isUnlocked?' unlocked':' locked'}">
      ${iconSvg}
      <div class="achievement-info">
        <div class="ach-name">${ach.name}</div>
        <div class="ach-desc">${ach.desc}</div>
        ${rewardHtml}
      </div>
      ${ach.secret?'<div class="ach-secret-badge">SECRET</div>':''}
      ${claimBtn}
    </div>`;
  }
  document.getElementById('achievements-list').innerHTML=html;
}

// ── Всплывающие числа ─────────────────────────────────────────────
function spawnFloatNumber(event, text) {
  const btn=document.getElementById('click-btn'), rect=btn.getBoundingClientRect();
  const el=document.createElement('div'); el.className='float-num'; el.textContent=text;
  const cx=(event.clientX??rect.left+rect.width/2)-rect.left;
  const cy=(event.clientY??rect.top+rect.height/2)-rect.top;
  el.style.left=`${cx+(Math.random()-.5)*60}px`;
  el.style.top=`${cy}px`;
  btn.parentElement.appendChild(el);
  el.addEventListener('animationend',()=>el.remove());
}

// ── Тосты ────────────────────────────────────────────────────────
function showToast(msg) {
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg;
  document.getElementById('toast-container').appendChild(el);
  el.addEventListener('animationend',()=>el.remove());
}

// ── Вкладки ──────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${name}`));
  if(name==='stats')   renderStats();
  if(name==='leaders') loadLeaderboard();
}

// ── Лидерборд ────────────────────────────────────────────────────
const LB_LABELS = {
  balance:'Баланс', clicks:'Кликов', auto:'Авто/сек', achievements:'Достижений', levels:'Уровень'
};
const LB_SUFFIX = {
  balance:'', clicks:'', auto:'/сек', achievements:' очив', levels:' ур.'
};

function switchLbTab(cat) {
  lbCategory=cat;
  document.querySelectorAll('.lb-tab').forEach(b=>b.classList.toggle('active',b.dataset.lb===cat));
  renderLeaderboard();
}

async function loadLeaderboard(force=false) {
  if(lbCache && !force) { renderLeaderboard(); return; }
  document.getElementById('lb-content').innerHTML='<div class="lb-loading">⏳ Загрузка рейтинга...</div>';
  try {
    const res = await fetch(LB_URL+'?t='+Date.now(), {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    lbCache = await res.json();
    renderLeaderboard();
  } catch(e) {
    document.getElementById('lb-content').innerHTML=`
      <div class="lb-error">
        Не удалось загрузить рейтинг.<br>
        Рейтинг обновляется ботом раз в час.<br>
        Проверьте команду <code>/leaderboard</code> в боте.
      </div>
      <div class="lb-bot-hint">
        Полный рейтинг доступен в боте:<br>
        <code>/leaderboard</code>
      </div>`;
  }
}

function renderLeaderboard() {
  if(!lbCache) return;
  const list = lbCache[lbCategory] || [];
  const meUsername = TG_USERNAME;

  let html='<div class="lb-list">';
  if(list.length===0){
    html+='<div class="lb-loading">Нет данных. Играй и синхронизируй прогресс через бота!</div>';
  }
  list.slice(0,10).forEach((entry,i)=>{
    const rank=i+1, isMe=entry.username===meUsername;
    const rankClass=rank===1?'top1':rank===2?'top2':rank===3?'top3':'';
    const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':rank;
    const suffix = LB_SUFFIX[lbCategory]||'';
    html+=`<div class="lb-item ${rankClass} ${isMe?'me':''}">
      <div class="lb-rank">${medal}</div>
      <div class="lb-name">@${entry.username||'Аноним'}${isMe?'<span class="lb-you">ВЫ</span>':''}</div>
      <div class="lb-value">${formatNum(entry.value)}${suffix}</div>
    </div>`;
  });
  html+='</div><div class="lb-bot-hint">Рейтинг обновляется через бота (<code>/leaderboard</code>)</div>';

  document.getElementById('lb-content').innerHTML=html;
  if(lbCache.updated){
    const d=new Date(lbCache.updated*1000);
    document.getElementById('lb-updated').textContent='Обновлено: '+d.toLocaleTimeString('ru');
  }
}

// ── Оффлайн-бонус ────────────────────────────────────────────────
function showOfflineBonus(bonus) {
  if(bonus<=0) return;
  const overlay=document.getElementById('offline-overlay');
  document.getElementById('offline-amount').textContent=`+${formatNum(bonus)}`;
  overlay.classList.remove('hidden');
  document.getElementById('offline-claim-btn').onclick=()=>{
    state.balance+=bonus; state.totalEarned+=bonus;
    if(bonus>=state.autoIncome*8*3600*0.9) state.flags.longOffline=true;
    state.offlineBonusMax=Math.max(state.offlineBonusMax,bonus);
    overlay.classList.add('hidden');
    updateUI(); saveGame(); haptic('heavy');
    showToast(`Получено ${formatNum(bonus)} монет!`);
    checkAllAchievements();
  };
}

// ── Инициализация ────────────────────────────────────────────────
function init() {
  loadGame();
  const offlineBonus=calcOfflineBonus();

  // Флаги времени суток при старте
  const h=new Date().getHours();
  if(h>=0&&h<4) state.flags.playedAtNight  =true;
  if(h>=5&&h<8) state.flags.playedEarlyMorn=true;

  recalcStats();
  updateUI();
  checkAllAchievements();

  const btn=document.getElementById('click-btn');
  btn.addEventListener('click',handleClick);
  btn.addEventListener('touchstart',(e)=>{
    e.preventDefault();
    for(const t of e.changedTouches) handleClick(t);
  },{passive:false});

  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click',()=>switchTab(b.dataset.tab));
  });
  document.querySelectorAll('.lb-tab').forEach(b=>{
    b.addEventListener('click',()=>switchLbTab(b.dataset.lb));
  });

  // Звук щелчка на все кнопки кроме главной монеты
  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn && btn.id !== 'click-btn') playUIClick();
  }, {passive: true});

  autoTickInterval = setInterval(autoTick, 1000);
  autoSaveInterval = setInterval(saveGame, 30_000);
  syncInterval     = setInterval(syncWithBot, 60_000);

  window.addEventListener('beforeunload',()=>{saveGame();syncWithBot();});
  if(tg) tg.onEvent('viewportChanged',saveGame);

  setTimeout(()=>showOfflineBonus(offlineBonus),350);
}

document.addEventListener('DOMContentLoaded',init);
