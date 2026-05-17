'use strict';

// ── Telegram WebApp SDK ───────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const TG_USER_ID = tg?.initDataUnsafe?.user?.id
  ? String(tg.initDataUnsafe.user.id)
  : 'local_debug';

const SAVE_KEY = `clicker_save_${TG_USER_ID}`;

function haptic(type = 'light') {
  tg?.HapticFeedback?.impactOccurred(type);
}

// ── Конфиг улучшений ──────────────────────────────────────────────
const UPGRADES = {
  click: [
    { id:'click1', name:'Острые когти',   icon:'🦅', desc:'+2 к силе клика',  baseCost:50,    effect:2,  category:'click' },
    { id:'click2', name:'Стальной кулак', icon:'🥊', desc:'+5 к силе клика',  baseCost:250,   effect:5,  category:'click' },
    { id:'click3', name:'Лазерный луч',   icon:'⚡', desc:'+15 к силе клика', baseCost:1200,  effect:15, category:'click' },
    { id:'click4', name:'Квантовый удар', icon:'🔮', desc:'+50 к силе клика', baseCost:8000,  effect:50, category:'click' },
  ],
  auto: [
    { id:'auto1', name:'Мышка-кликер',   icon:'🐭', desc:'+0.5/сек',  baseCost:100,   effect:0.5, category:'auto' },
    { id:'auto2', name:'Робот-помощник', icon:'🤖', desc:'+2/сек',   baseCost:600,   effect:2,   category:'auto' },
    { id:'auto3', name:'Ферма дронов',   icon:'🚁', desc:'+8/сек',   baseCost:3500,  effect:8,   category:'auto' },
    { id:'auto4', name:'ИИ-майнер',      icon:'🧠', desc:'+25/сек',  baseCost:20000, effect:25,  category:'auto' },
  ],
  multi: [
    { id:'multi1', name:'Денежный дождь', icon:'💸', desc:'x1.5 весь доход', baseCost:500,   effect:1.5, category:'multi' },
    { id:'multi2', name:'Золотой бонус',  icon:'🥇', desc:'x2 весь доход',   baseCost:3000,  effect:2,   category:'multi' },
    { id:'multi3', name:'Мегабуст',       icon:'🚀', desc:'x3 весь доход',   baseCost:15000, effect:3,   category:'multi' },
  ],
};

const ACHIEVEMENTS = [
  { id:'ach1', name:'Первый клик',    icon:'👆', desc:'Кликни хотя бы раз',          check:(s)=>s.totalClicks>=1 },
  { id:'ach2', name:'Кликоман',       icon:'🔥', desc:'100 кликов',                  check:(s)=>s.totalClicks>=100 },
  { id:'ach3', name:'Тысячник',       icon:'🏆', desc:'1 000 монет заработано',      check:(s)=>s.totalEarned>=1000 },
  { id:'ach4', name:'Миллионер',      icon:'💰', desc:'1 000 000 монет заработано',  check:(s)=>s.totalEarned>=1_000_000 },
  { id:'ach5', name:'Автоматизатор',  icon:'⚙️', desc:'Купи любой авто-кликер',     check:(s)=>Object.keys(s.upgrades).some(k=>k.startsWith('auto')&&s.upgrades[k]>0) },
  { id:'ach6', name:'Магазинщик',     icon:'🛒', desc:'Купи 5 улучшений суммарно',  check:(s)=>Object.values(s.upgrades).reduce((a,b)=>a+b,0)>=5 },
];

// ── Состояние ─────────────────────────────────────────────────────
function defaultState() {
  return {
    balance:0, clickPower:1, autoIncome:0, multiplier:1,
    upgrades:{}, totalClicks:0, totalEarned:0,
    sessionClicks:0, lastSaveTime:Date.now(), version:3,
  };
}

let state = defaultState();
let autoTickInterval = null;
let autoSaveInterval = null;
let syncInterval     = null;

// ── Сохранение / загрузка ─────────────────────────────────────────
function saveGame() {
  state.lastSaveTime = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  catch(e) { console.warn('localStorage error:', e); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) state = { ...defaultState(), ...JSON.parse(raw) };
  } catch(e) { console.warn('Load error:', e); }
}

function calcOfflineBonus() {
  if (!state.autoIncome || state.autoIncome <= 0) return 0;
  const elapsed = Math.floor((Date.now() - state.lastSaveTime) / 1000);
  if (elapsed < 30) return 0;
  return Math.min(elapsed, 8 * 3600) * state.autoIncome * state.multiplier;
}

// ── Игровая механика ──────────────────────────────────────────────
function upgradeCost(upg) {
  return Math.floor(upg.baseCost * Math.pow(1.65, state.upgrades[upg.id] || 0));
}

function recalcStats() {
  let click=1, auto=0, multi=1;
  for (const cat of Object.values(UPGRADES))
    for (const u of cat) {
      const lv = state.upgrades[u.id] || 0;
      if (!lv) continue;
      if (u.category==='click') click += u.effect * lv;
      if (u.category==='auto')  auto  += u.effect * lv;
      if (u.category==='multi') multi *= Math.pow(u.effect, lv);
    }
  state.clickPower = click;
  state.autoIncome = auto;
  state.multiplier = multi;
}

function handleClick(e) {
  const earned = Math.floor(state.clickPower * state.multiplier);
  state.balance       += earned;
  state.totalClicks   += 1;
  state.totalEarned   += earned;
  state.sessionClicks += 1;
  haptic('light');
  spawnFloatNumber(e, `+${formatNum(earned)}`);
  updateUI();
}

function autoTick() {
  if (state.autoIncome <= 0) return;
  const earned = state.autoIncome * state.multiplier;
  state.balance     += earned;
  state.totalEarned += earned;
  updateBalanceDisplay();
}

function buyUpgrade(upgId) {
  const all = [...UPGRADES.click, ...UPGRADES.auto, ...UPGRADES.multi];
  const upg = all.find(u => u.id === upgId);
  if (!upg) return;
  const cost = upgradeCost(upg);
  if (state.balance < cost) { showToast('Недостаточно монет!'); haptic('medium'); return; }
  state.balance -= cost;
  state.upgrades[upg.id] = (state.upgrades[upg.id] || 0) + 1;
  recalcStats();
  haptic('rigid');
  saveGame();
  updateUI();
  showToast(`${upg.name} — уровень ${state.upgrades[upg.id]}!`);
}

// ── Синхронизация с ботом ─────────────────────────────────────────
function syncWithBot() {
  if (!tg?.sendData) return;
  try {
    const payload = JSON.stringify({
      balance:       Math.floor(state.balance),
      clickPower:    state.clickPower,
      autoIncome:    state.autoIncome,
      sessionClicks: state.sessionClicks,
    });
    if (payload.length > 4000) return;
    tg.sendData(payload);
    state.sessionClicks = 0;
  } catch(e) { console.warn('sendData error:', e); }
}

// ── Форматирование чисел ──────────────────────────────────────────
function formatNum(n) {
  n = Math.floor(n);
  if (n >= 1e12) return (n/1e12).toFixed(2)+'T';
  if (n >= 1e9)  return (n/1e9).toFixed(2)+'B';
  if (n >= 1e6)  return (n/1e6).toFixed(2)+'M';
  if (n >= 1e3)  return (n/1e3).toFixed(2)+'K';
  return n.toLocaleString('ru');
}

// ── UI ────────────────────────────────────────────────────────────
function updateBalanceDisplay() {
  document.getElementById('coin-count').textContent = formatNum(state.balance);
}

function updateUI() {
  updateBalanceDisplay();

  document.getElementById('header-cps').textContent   = formatNum(state.autoIncome * state.multiplier);
  document.getElementById('header-click').textContent = formatNum(state.clickPower * state.multiplier);

  document.getElementById('info-click').textContent = formatNum(state.clickPower);
  document.getElementById('info-auto').textContent  = formatNum(state.autoIncome * state.multiplier);
  document.getElementById('info-multi').textContent = state.multiplier.toFixed(2);

  const earned   = state.totalEarned;
  const level    = Math.floor(earned / 1000) + 1;
  const progress = (earned % 1000) / 1000;
  document.getElementById('level-text').textContent  = `Уровень ${level}`;
  document.getElementById('level-next').textContent  = `${formatNum(earned % 1000)} / 1 000`;
  document.getElementById('level-fill').style.width  = `${Math.min(progress*100,100)}%`;

  renderShop();
  renderStats();
  checkAchievements();
}

function renderShop() {
  const sections = [
    { label:'Сила клика',      upgrades: UPGRADES.click },
    { label:'Авто-кликер',     upgrades: UPGRADES.auto  },
    { label:'Множитель дохода',upgrades: UPGRADES.multi },
  ];
  let html = '';
  for (const s of sections) {
    html += `<div class="shop-section-title">${s.label}</div>`;
    for (const upg of s.upgrades) {
      const lv     = state.upgrades[upg.id] || 0;
      const cost   = upgradeCost(upg);
      const afford = state.balance >= cost;
      const pct    = Math.min((lv / 20) * 100, 100);
      html += `
        <div class="upgrade-card ${afford?'affordable':''}">
          <div class="upgrade-icon">${upg.icon}</div>
          <div class="upgrade-info">
            <div class="upgrade-name">${upg.name}</div>
            <div class="upgrade-desc">${upg.desc}</div>
            <div class="upgrade-level">Уровень ${lv}</div>
            <div class="upgrade-mini-bar">
              <div class="upgrade-mini-fill" style="width:${pct}%"></div>
            </div>
          </div>
          <button class="upgrade-buy-btn" ${afford?'':'disabled'} onclick="buyUpgrade('${upg.id}')">
            Купить
            <span class="btn-cost">${formatNum(cost)}</span>
          </button>
        </div>`;
    }
  }
  document.getElementById('shop-content').innerHTML = html;
}

function renderStats() {
  document.getElementById('stat-balance').textContent      = formatNum(state.balance);
  document.getElementById('stat-click').textContent        = formatNum(state.clickPower);
  document.getElementById('stat-auto').textContent         = formatNum(state.autoIncome);
  document.getElementById('stat-multi').textContent        = `x${state.multiplier.toFixed(2)}`;
  document.getElementById('stat-total-clicks').textContent = formatNum(state.totalClicks);
  document.getElementById('stat-total-earned').textContent = formatNum(state.totalEarned);
}

function checkAchievements() {
  let html = '';
  for (const ach of ACHIEVEMENTS) {
    const ok = ach.check(state);
    html += `
      <div class="achievement ${ok?'':'locked'}">
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-info">
          <div class="ach-name">${ach.name}</div>
          <div class="ach-desc">${ach.desc}</div>
        </div>
      </div>`;
  }
  document.getElementById('achievements-list').innerHTML = html;
}

// ── Всплывающие числа ─────────────────────────────────────────────
function spawnFloatNumber(event, text) {
  const btn  = document.getElementById('click-btn');
  const rect = btn.getBoundingClientRect();
  const el   = document.createElement('div');
  el.className   = 'float-num';
  el.textContent = text;

  const cx = ((event.clientX ?? rect.left + rect.width/2) - rect.left);
  const cy = ((event.clientY ?? rect.top  + rect.height/2) - rect.top);
  el.style.left = `${cx + (Math.random()-0.5)*60}px`;
  el.style.top  = `${cy}px`;

  btn.parentElement.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ── Тосты ────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.className   = 'toast';
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ── Вкладки ──────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id===`tab-${name}`));
  if (name==='stats') renderStats();
}

// ── Оффлайн-бонус ────────────────────────────────────────────────
function showOfflineBonus(bonus) {
  if (bonus <= 0) return;
  const overlay = document.getElementById('offline-overlay');
  document.getElementById('offline-amount').textContent = `+${formatNum(bonus)}`;
  overlay.classList.remove('hidden');
  document.getElementById('offline-claim-btn').onclick = () => {
    state.balance     += bonus;
    state.totalEarned += bonus;
    overlay.classList.add('hidden');
    updateUI(); saveGame(); haptic('heavy');
    showToast(`Получено ${formatNum(bonus)} монет!`);
  };
}

// ── Инициализация ────────────────────────────────────────────────
function init() {
  loadGame();
  const offlineBonus = calcOfflineBonus();
  recalcStats();
  updateUI();

  const btn = document.getElementById('click-btn');
  btn.addEventListener('click', handleClick);
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) handleClick(t);
  }, { passive: false });

  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  autoTickInterval = setInterval(autoTick, 1000);
  autoSaveInterval = setInterval(saveGame, 30_000);
  syncInterval     = setInterval(syncWithBot, 60_000);

  window.addEventListener('beforeunload', () => { saveGame(); syncWithBot(); });
  if (tg) tg.onEvent('viewportChanged', saveGame);

  setTimeout(() => showOfflineBonus(offlineBonus), 350);
}

document.addEventListener('DOMContentLoaded', init);
