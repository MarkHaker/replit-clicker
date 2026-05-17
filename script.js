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

function queueAchievement(ach, rewardMsg) {
  _achQueue.push({ach, rewardMsg});
  if (!_achShowing) _showNextAch();
}

function _showNextAch() {
  if (!_achQueue.length) { _achShowing = false; return; }
  _achShowing = true;
  const {ach, rewardMsg} = _achQueue.shift();
  const popup = document.getElementById('ach-popup');
  document.getElementById('ach-popup-icon').textContent   = ach.icon;
  document.getElementById('ach-popup-name').textContent   = ach.name;
  document.getElementById('ach-popup-reward').textContent = `Награда: ${rewardMsg}`;
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

// ── Конфиг улучшений ──────────────────────────────────────────────
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
  {id:'a01',name:'Первое прикосновение',icon:'👆',desc:'Сделай 1 клик',         reward:{type:'coins',val:10},    check:s=>s.totalClicks>=1},
  {id:'a02',name:'Тепло рук',           icon:'🤲',desc:'10 кликов',            reward:{type:'coins',val:50},    check:s=>s.totalClicks>=10},
  {id:'a03',name:'Кликоман',            icon:'🔥',desc:'100 кликов',           reward:{type:'coins',val:200},   check:s=>s.totalClicks>=100},
  {id:'a04',name:'Машина кликов',       icon:'⚙️',desc:'1 000 кликов',        reward:{type:'coins',val:1000},  check:s=>s.totalClicks>=1000},
  {id:'a05',name:'Клик-мастер',         icon:'💪',desc:'10 000 кликов',        reward:{type:'click',val:1},     check:s=>s.totalClicks>=10000},
  {id:'a06',name:'Легенда кликера',     icon:'🏅',desc:'100 000 кликов',       reward:{type:'click',val:3},     check:s=>s.totalClicks>=100000},
  {id:'a07',name:'Миллион касаний',     icon:'💎',desc:'1 000 000 кликов',     reward:{type:'click',val:10},    check:s=>s.totalClicks>=1000000},

  // === БАЛАНС / ЗАРАБОТОК ===
  {id:'b01',name:'Первые монеты',   icon:'🌱',desc:'Заработай 500 монет',        reward:{type:'coins',val:100},   check:s=>s.totalEarned>=500},
  {id:'b02',name:'Тысячник',        icon:'🏆',desc:'Заработай 1 000 монет',      reward:{type:'coins',val:500},   check:s=>s.totalEarned>=1000},
  {id:'b03',name:'Капиталист',      icon:'💰',desc:'Заработай 10 000 монет',     reward:{type:'coins',val:2000},  check:s=>s.totalEarned>=10000},
  {id:'b04',name:'Богач',           icon:'🤑',desc:'Заработай 100 000 монет',    reward:{type:'coins',val:10000}, check:s=>s.totalEarned>=100000},
  {id:'b05',name:'Миллионер',       icon:'🌟',desc:'Заработай 1 000 000 монет',  reward:{type:'auto', val:1},     check:s=>s.totalEarned>=1000000},
  {id:'b06',name:'Мультимиллионер', icon:'👑',desc:'Заработай 10M монет',        reward:{type:'auto', val:5},     check:s=>s.totalEarned>=10000000},
  {id:'b07',name:'Биллионер',       icon:'🔱',desc:'Заработай 1B монет',         reward:{type:'auto', val:25},    check:s=>s.totalEarned>=1000000000},

  // === МАГАЗИН / УЛУЧШЕНИЯ ===
  {id:'u01',name:'Первая покупка',  icon:'🛒',desc:'Купи 1 улучшение',            reward:{type:'coins',val:100},   check:s=>totalUpgrades(s)>=1},
  {id:'u02',name:'Коллекционер',   icon:'🗂️',desc:'Купи 5 улучшений суммарно',  reward:{type:'coins',val:500},   check:s=>totalUpgrades(s)>=5},
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
  {id:'m01',name:'Ускорение',     icon:'🚀',desc:'Множитель x1.5',               reward:{type:'coins',val:1000},  check:s=>s.multiplier>=1.5},
  {id:'m02',name:'Турбо',         icon:'⚡',desc:'Множитель x3',                 reward:{type:'coins',val:5000},  check:s=>s.multiplier>=3},
  {id:'m03',name:'Гиперскорость', icon:'🌀',desc:'Множитель x6',                 reward:{type:'click',val:5},     check:s=>s.multiplier>=6},
  {id:'m04',name:'Бесконечность', icon:'♾️',desc:'Множитель x12',               reward:{type:'auto', val:10},    check:s=>s.multiplier>=12},

  // === УРОВНИ ===
  {id:'l01',name:'Новобранец',  icon:'🌿',desc:'Достигни 5 уровня',              reward:{type:'coins',val:500},   check:s=>getLevel(s)>=5},
  {id:'l02',name:'Опытный',     icon:'🌳',desc:'Достигни 10 уровня',             reward:{type:'coins',val:2000},  check:s=>getLevel(s)>=10},
  {id:'l03',name:'Ветеран',     icon:'🏔️',desc:'Достигни 25 уровня',           reward:{type:'click',val:3},     check:s=>getLevel(s)>=25},
  {id:'l04',name:'Элита',       icon:'🦁',desc:'Достигни 50 уровня',             reward:{type:'click',val:8},     check:s=>getLevel(s)>=50},
  {id:'l05',name:'Легенда',     icon:'🌠',desc:'Достигни 100 уровня',            reward:{type:'auto', val:15},    check:s=>getLevel(s)>=100},

  // === ПРОГРЕСС ДОСТИЖЕНИЙ ===
  {id:'ac1',name:'На пути',    icon:'🗺️',desc:'Получи 5 достижений',            reward:{type:'coins',val:2000},  check:s=>countUnlocked(s,'regular')>=5},
  {id:'ac2',name:'Охотник',    icon:'🎯',desc:'Получи 15 достижений',            reward:{type:'coins',val:10000}, check:s=>countUnlocked(s,'regular')>=15},
  {id:'ac3',name:'Коллекция',  icon:'🎖️',desc:'Получи 28 достижений',          reward:{type:'auto', val:5},     check:s=>countUnlocked(s,'regular')>=28},

  // === СЕКРЕТНЫЕ ===
  {id:'s01',name:'Ночной кликер',   icon:'🌙',desc:'Играй с полуночи до 4 утра',   reward:{type:'coins',val:2000},  check:s=>s.flags.playedAtNight,  secret:true},
  {id:'s02',name:'Ранняя пташка',   icon:'🌅',desc:'Войди в игру в 5–7 утра',      reward:{type:'coins',val:1500},  check:s=>s.flags.playedEarlyMorn,secret:true},
  {id:'s03',name:'Скоростной',      icon:'⚡',desc:'20 кликов за 3 секунды',       reward:{type:'click',val:5},     check:s=>s.flags.rapidClick,     secret:true},
  {id:'s04',name:'Терпеливый',      icon:'⏳',desc:'Забери оффлайн-бонус за 8ч+', reward:{type:'auto', val:8},     check:s=>s.flags.longOffline,    secret:true},
  {id:'s05',name:'Искатель секретов',icon:'🔑',desc:'Открой 3 секретных достижения',reward:{type:'coins',val:15000}, check:s=>countUnlocked(s,'secret')>=3,secret:true},
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
  if (totalClicks < 1000) {
    return { level:1, current:totalClicks, needed:1000, pct: totalClicks/1000 };
  }
  const level = Math.floor(totalClicks / 500);
  const start  = 500 * level;
  const end    = 500 * (level + 1);
  const cur    = totalClicks - start;
  return { level, current:cur, needed:500, pct: cur/500 };
}

// ── Вспомогательные функции для чеков ────────────────────────────
function totalUpgrades(s) { return Object.values(s.upgrades).reduce((a,b)=>a+b,0); }
function countUnlocked(s, type) {
  return ACHIEVEMENTS.filter(a=>{
    if(type==='regular') return !a.secret && s.claimed.includes(a.id);
    if(type==='secret')  return  a.secret && s.claimed.includes(a.id);
    return s.claimed.includes(a.id);
  }).length;
}

// ── Состояние игры ────────────────────────────────────────────────
function defaultState() {
  return {
    balance:0, clickPower:1, autoIncome:0, multiplier:1,
    achClickBonus:0, achAutoBonus:0,
    upgrades:{}, totalClicks:0, totalEarned:0,
    sessionClicks:0, lastSaveTime:Date.now(), version:4,
    claimed:[],
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
  return Math.floor(upg.baseCost * Math.pow(1.65, state.upgrades[upg.id]||0));
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
    if(state.claimed.includes(ach.id)) continue;
    if(ach.check(state)){
      state.claimed.push(ach.id);
      const rewardMsg = applyReward(ach.reward);
      queueAchievement(ach, rewardMsg);
      anyNew=true;
    }
  }
  if(anyNew){ saveGame(); updateAchStats(); }
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
      html+=`<div class="upgrade-card ${afford?'affordable':''}">
        <div class="upgrade-icon">${upg.icon}</div>
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
    const unlocked = state.claimed.includes(ach.id);
    if(ach.secret && !unlocked){
      html+=`<div class="achievement secret locked">
        <div class="achievement-icon">🔒</div>
        <div class="achievement-info">
          <div class="ach-name">???</div>
          <div class="ach-desc">Секретное достижение</div>
        </div>
        <div class="ach-secret-badge">SECRET</div>
      </div>`;
      continue;
    }
    html+=`<div class="achievement ${ach.secret?'secret':''}${unlocked?' unlocked':' locked'}">
      <div class="achievement-icon">${ach.icon}</div>
      <div class="achievement-info">
        <div class="ach-name">${ach.name}</div>
        <div class="ach-desc">${ach.desc}</div>
        <div class="ach-reward">${rewardLabel(ach.reward)}</div>
      </div>
      ${ach.secret?'<div class="ach-secret-badge">SECRET</div>':''}
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
