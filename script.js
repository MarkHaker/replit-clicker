/**
 * Telegram Clicker WebApp — основная логика игры
 * Стек: чистый JS, без фреймворков
 * Хостинг: GitHub Pages (статика)
 *
 * Архитектура синхронизации:
 *   Текущая: localStorage → sendData() → бот парсит JSON
 *   Будущая: POST /api/sync с JWT из initData (FastAPI + asyncpg)
 *            для валидации кликов и защиты от накруток
 */

'use strict';

// ══════════════════════════════════════════════════════════════════
// 1. TELEGRAM WEBAPP SDK
// ══════════════════════════════════════════════════════════════════

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const TG_USER_ID = tg?.initDataUnsafe?.user?.id
  ? String(tg.initDataUnsafe.user.id)
  : 'local_debug';

const SAVE_KEY = `clicker_save_${TG_USER_ID}`;

/** Вибрация через Telegram SDK */
function haptic(type = 'light') {
  tg?.HapticFeedback?.impactOccurred(type);
}

// ══════════════════════════════════════════════════════════════════
// 2. КОНФИГ УЛУЧШЕНИЙ
// ══════════════════════════════════════════════════════════════════

const UPGRADES = {
  click: [
    { id: 'click1', name: 'Острые когти',   icon: '🦅', desc: '+2 к силе клика',   baseCost: 50,   effect: 2,  category: 'click' },
    { id: 'click2', name: 'Стальной кулак', icon: '🥊', desc: '+5 к силе клика',   baseCost: 250,  effect: 5,  category: 'click' },
    { id: 'click3', name: 'Лазерный луч',   icon: '⚡', desc: '+15 к силе клика',  baseCost: 1200, effect: 15, category: 'click' },
    { id: 'click4', name: 'Квантовый удар', icon: '🔮', desc: '+50 к силе клика',  baseCost: 8000, effect: 50, category: 'click' },
  ],
  auto: [
    { id: 'auto1', name: 'Мышка-кликер',  icon: '🐭', desc: '+0.5/сек',  baseCost: 100,   effect: 0.5, category: 'auto' },
    { id: 'auto2', name: 'Робот-помощник',icon: '🤖', desc: '+2/сек',   baseCost: 600,   effect: 2,   category: 'auto' },
    { id: 'auto3', name: 'Ферма дронов',  icon: '🚁', desc: '+8/сек',   baseCost: 3500,  effect: 8,   category: 'auto' },
    { id: 'auto4', name: 'ИИ-майнер',     icon: '🧠', desc: '+25/сек',  baseCost: 20000, effect: 25,  category: 'auto' },
  ],
  multi: [
    { id: 'multi1', name: 'Денежный дождь', icon: '💸', desc: '×1.5 весь доход', baseCost: 500,   effect: 1.5, category: 'multi' },
    { id: 'multi2', name: 'Золотой бонус',  icon: '🥇', desc: '×2 весь доход',   baseCost: 3000,  effect: 2,   category: 'multi' },
    { id: 'multi3', name: 'Мегабуст',       icon: '🚀', desc: '×3 весь доход',   baseCost: 15000, effect: 3,   category: 'multi' },
  ],
};

// Достижения
const ACHIEVEMENTS = [
  { id: 'ach1', name: 'Первый клик',    icon: '🖱️', desc: 'Кликни хотя бы раз',           check: (s) => s.totalClicks >= 1 },
  { id: 'ach2', name: 'Кликоман',       icon: '👆', desc: '100 кликов',                   check: (s) => s.totalClicks >= 100 },
  { id: 'ach3', name: 'Тысячник',       icon: '🏆', desc: '1,000 монет заработано',        check: (s) => s.totalEarned >= 1000 },
  { id: 'ach4', name: 'Миллионер',      icon: '💰', desc: '1,000,000 монет заработано',    check: (s) => s.totalEarned >= 1_000_000 },
  { id: 'ach5', name: 'Автоматизатор', icon: '⚙️', desc: 'Купи любой авто-кликер',        check: (s) => Object.keys(s.upgrades).some(k => k.startsWith('auto') && s.upgrades[k] > 0) },
  { id: 'ach6', name: 'Магазинщик',    icon: '🛒', desc: 'Купи 5 улучшений',               check: (s) => Object.values(s.upgrades).reduce((a, b) => a + b, 0) >= 5 },
];

// ══════════════════════════════════════════════════════════════════
// 3. СОСТОЯНИЕ ИГРЫ
// ══════════════════════════════════════════════════════════════════

/** Дефолтное состояние нового игрока */
function defaultState() {
  return {
    balance:       0,
    clickPower:    1,
    autoIncome:    0,
    multiplier:    1,
    upgrades:      {},   // { upgradeId: level }
    totalClicks:   0,
    totalEarned:   0,
    sessionClicks: 0,
    lastSaveTime:  Date.now(),
    version:       2,
  };
}

let state = defaultState();
let autoTickInterval  = null;
let autoSaveInterval  = null;
let syncInterval      = null;

// ══════════════════════════════════════════════════════════════════
// 4. СОХРАНЕНИЕ / ЗАГРУЗКА
// ══════════════════════════════════════════════════════════════════

function saveGame() {
  state.lastSaveTime = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('localStorage недоступен:', e);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Мёрджим с дефолтным (защита от неполных сохранений)
    state = { ...defaultState(), ...saved };
  } catch (e) {
    console.warn('Ошибка загрузки сохранения:', e);
  }
}

/** Оффлайн-прогресс: начисляем авто-доход за время отсутствия */
function calcOfflineBonus() {
  if (!state.autoIncome || state.autoIncome <= 0) return 0;
  const now = Date.now();
  const elapsed = Math.floor((now - state.lastSaveTime) / 1000); // секунды
  if (elapsed < 30) return 0; // меньше 30 сек — не показываем
  // Максимум 8 часов оффлайна
  const clampedSec = Math.min(elapsed, 8 * 3600);
  return clampedSec * state.autoIncome * state.multiplier;
}

// ══════════════════════════════════════════════════════════════════
// 5. ИГРОВАЯ МЕХАНИКА
// ══════════════════════════════════════════════════════════════════

/** Стоимость улучшения с учётом уровня */
function upgradeCost(upg) {
  const level = state.upgrades[upg.id] || 0;
  // Экспоненциальный рост: baseCost × 1.65^level
  return Math.floor(upg.baseCost * Math.pow(1.65, level));
}

/** Пересчитать click_power, auto_income, multiplier из купленных улучшений */
function recalcStats() {
  let clickBonus = 1;
  let autoBonus  = 0;
  let multiBonus = 1;

  for (const category of Object.values(UPGRADES)) {
    for (const upg of category) {
      const level = state.upgrades[upg.id] || 0;
      if (level === 0) continue;
      if (upg.category === 'click') clickBonus += upg.effect * level;
      if (upg.category === 'auto')  autoBonus  += upg.effect * level;
      if (upg.category === 'multi') multiBonus *= Math.pow(upg.effect, level);
    }
  }

  state.clickPower = clickBonus;
  state.autoIncome = autoBonus;
  state.multiplier = multiBonus;
}

/** Обработка нажатия на кнопку */
function handleClick(e) {
  const earned = Math.floor(state.clickPower * state.multiplier);
  state.balance      += earned;
  state.totalClicks  += 1;
  state.totalEarned  += earned;
  state.sessionClicks += 1;

  haptic('light');
  spawnFloatNumber(e, `+${formatNum(earned)}`);
  updateUI();
}

/** Авто-тик (раз в секунду) */
function autoTick() {
  if (state.autoIncome <= 0) return;
  const earned = state.autoIncome * state.multiplier;
  state.balance     += earned;
  state.totalEarned += earned;
  updateBalanceDisplay();
}

/** Купить улучшение */
function buyUpgrade(upgId) {
  const allUpgrades = [
    ...UPGRADES.click,
    ...UPGRADES.auto,
    ...UPGRADES.multi,
  ];
  const upg = allUpgrades.find(u => u.id === upgId);
  if (!upg) return;

  const cost = upgradeCost(upg);
  if (state.balance < cost) {
    showToast('💸 Недостаточно монет!');
    haptic('medium');
    return;
  }

  state.balance -= cost;
  state.upgrades[upg.id] = (state.upgrades[upg.id] || 0) + 1;
  recalcStats();
  haptic('rigid');
  saveGame();
  renderShop();
  updateUI();
  showToast(`✅ ${upg.name} улучшено до ур. ${state.upgrades[upg.id]}!`);
}

// ══════════════════════════════════════════════════════════════════
// 6. СИНХРОНИЗАЦИЯ С БОТОМ
// ══════════════════════════════════════════════════════════════════

/**
 * Отправить данные боту через sendData.
 * Размер ограничен: ~4096 байт. Поэтому отправляем только числа.
 *
 * В будущем: заменить на fetch('/api/sync', { method:'POST', headers: {
 *   'Authorization': `tgWebAppInitData ${tg.initData}`
 * }, body: JSON.stringify(payload) }) с FastAPI-бэкендом.
 */
function syncWithBot() {
  if (!tg || !tg.sendData) return;
  try {
    const payload = JSON.stringify({
      balance:       Math.floor(state.balance),
      clickPower:    state.clickPower,
      autoIncome:    state.autoIncome,
      sessionClicks: state.sessionClicks,
    });
    if (payload.length > 4000) {
      console.warn('Payload слишком большой для sendData');
      return;
    }
    tg.sendData(payload);
    state.sessionClicks = 0; // сбрасываем счётчик сессии
  } catch (e) {
    console.warn('sendData ошибка:', e);
  }
}

// ══════════════════════════════════════════════════════════════════
// 7. UI — РЕНДЕРИНГ
// ══════════════════════════════════════════════════════════════════

/** Форматировать большие числа: 1250000 → 1.25M */
function formatNum(n) {
  n = Math.floor(n);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString();
}

function updateBalanceDisplay() {
  document.getElementById('coin-count').textContent = formatNum(state.balance);
}

function updateUI() {
  updateBalanceDisplay();
  document.getElementById('header-cps').textContent   = formatNum(state.autoIncome * state.multiplier);
  document.getElementById('header-click').textContent = formatNum(state.clickPower * state.multiplier);
  document.getElementById('info-click').textContent   = formatNum(state.clickPower);
  document.getElementById('info-auto').textContent    = formatNum(state.autoIncome);
  document.getElementById('info-multi').textContent   = `×${state.multiplier.toFixed(2)}`;

  // Прогресс уровня (каждые 1000 монет = уровень)
  const level     = Math.floor(state.totalEarned / 1000) + 1;
  const progress  = (state.totalEarned % 1000) / 1000;
  document.getElementById('level-text').textContent    = `Уровень ${level}`;
  document.getElementById('level-next').textContent    = `${formatNum(state.totalEarned % 1000)} / 1,000`;
  document.getElementById('level-fill').style.width   = `${Math.min(progress * 100, 100)}%`;

  renderShop();
  renderStats();
  checkAchievements();
}

/** Рендер карточек магазина */
function renderShop() {
  const sections = [
    { key: 'click', label: '👆 Сила клика',       upgrades: UPGRADES.click },
    { key: 'auto',  label: '⚡ Авто-кликер',       upgrades: UPGRADES.auto  },
    { key: 'multi', label: '✖️ Множитель дохода',  upgrades: UPGRADES.multi },
  ];

  let html = '';
  for (const section of sections) {
    html += `<div class="shop-section-title">${section.label}</div>`;
    for (const upg of section.upgrades) {
      const level  = state.upgrades[upg.id] || 0;
      const cost   = upgradeCost(upg);
      const afford = state.balance >= cost;
      const maxLvl = 20;
      const pct    = Math.min((level / maxLvl) * 100, 100);

      html += `
        <div class="upgrade-card ${afford ? 'affordable' : ''}">
          <div class="upgrade-icon">${upg.icon}</div>
          <div class="upgrade-info">
            <div class="upgrade-name">${upg.name}</div>
            <div class="upgrade-desc">${upg.desc}</div>
            <div class="upgrade-level">Уровень ${level}</div>
            <div class="upgrade-mini-bar">
              <div class="upgrade-mini-fill" style="width:${pct}%"></div>
            </div>
          </div>
          <button class="upgrade-buy-btn" ${afford ? '' : 'disabled'}
                  onclick="buyUpgrade('${upg.id}')">
            Купить
            <span class="btn-cost">🪙 ${formatNum(cost)}</span>
          </button>
        </div>
      `;
    }
  }
  document.getElementById('shop-content').innerHTML = html;
}

/** Рендер статистики */
function renderStats() {
  document.getElementById('stat-balance').textContent     = formatNum(state.balance);
  document.getElementById('stat-click').textContent       = formatNum(state.clickPower);
  document.getElementById('stat-auto').textContent        = formatNum(state.autoIncome);
  document.getElementById('stat-multi').textContent       = `×${state.multiplier.toFixed(2)}`;
  document.getElementById('stat-total-clicks').textContent = formatNum(state.totalClicks);
  document.getElementById('stat-total-earned').textContent = formatNum(state.totalEarned);
}

/** Проверка достижений */
function checkAchievements() {
  const container = document.getElementById('achievements-list');
  let html = '';
  for (const ach of ACHIEVEMENTS) {
    const unlocked = ach.check(state);
    html += `
      <div class="achievement ${unlocked ? '' : 'locked'}">
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-info">
          <div class="ach-name">${ach.name}</div>
          <div class="ach-desc">${ach.desc}</div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════
// 8. ВСПЛЫВАЮЩИЕ ЧИСЛА
// ══════════════════════════════════════════════════════════════════

function spawnFloatNumber(event, text) {
  const btn    = document.getElementById('click-btn');
  const rect   = btn.getBoundingClientRect();
  const el     = document.createElement('div');
  el.className = 'float-num';
  el.textContent = text;

  // Случайный сдвиг от центра нажатия
  const cx = (event.clientX || rect.left + rect.width / 2) - rect.left;
  const cy = (event.clientY || rect.top  + rect.height / 2) - rect.top;
  const offsetX = (Math.random() - 0.5) * 60;

  el.style.left = `${cx + offsetX}px`;
  el.style.top  = `${cy}px`;

  btn.parentElement.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ══════════════════════════════════════════════════════════════════
// 9. ТОСТЫ
// ══════════════════════════════════════════════════════════════════

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className   = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ══════════════════════════════════════════════════════════════════
// 10. НАВИГАЦИЯ ПО ВКЛАДКАМ
// ══════════════════════════════════════════════════════════════════

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
  if (tabName === 'stats') renderStats();
}

// ══════════════════════════════════════════════════════════════════
// 11. ОФФЛАЙН-БОНУС
// ══════════════════════════════════════════════════════════════════

function showOfflineBonus(bonus) {
  if (bonus <= 0) return;
  const overlay = document.getElementById('offline-overlay');
  document.getElementById('offline-amount').textContent = `+${formatNum(bonus)} 🪙`;
  overlay.classList.remove('hidden');

  document.getElementById('offline-claim-btn').onclick = () => {
    state.balance     += bonus;
    state.totalEarned += bonus;
    overlay.classList.add('hidden');
    updateUI();
    saveGame();
    haptic('heavy');
    showToast(`🎉 Получено ${formatNum(bonus)} монет!`);
  };
}

// ══════════════════════════════════════════════════════════════════
// 12. ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════════════

function init() {
  // Загрузка сохранения
  loadGame();

  // Оффлайн-бонус
  const offlineBonus = calcOfflineBonus();

  // Пересчёт характеристик
  recalcStats();
  updateUI();

  // Кнопка клика
  const clickBtn = document.getElementById('click-btn');
  clickBtn.addEventListener('click', handleClick);
  // Поддержка тач-событий (несколько пальцев)
  clickBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      handleClick(touch);
    }
  }, { passive: false });

  // Навигация
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Авто-тик (раз в 1 секунду)
  autoTickInterval = setInterval(autoTick, 1000);

  // Авто-сохранение (каждые 30 секунд)
  autoSaveInterval = setInterval(() => {
    saveGame();
  }, 30_000);

  // Синхронизация с ботом (каждые 60 секунд)
  syncInterval = setInterval(syncWithBot, 60_000);

  // Сохранение при закрытии
  window.addEventListener('beforeunload', () => {
    saveGame();
    syncWithBot();
  });
  // Telegram: кнопка "Назад" — тоже сохраняем
  if (tg) {
    tg.onEvent('viewportChanged', () => saveGame());
  }

  // Показываем оффлайн-бонус с задержкой (дать UI отрисоваться)
  setTimeout(() => showOfflineBonus(offlineBonus), 400);
}

// Запуск после загрузки DOM
document.addEventListener('DOMContentLoaded', init);
