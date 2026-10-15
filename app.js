// ===== Настройки =====
const START = 161000;      // стартовый баланс USDC
const FREEBET = 16100;     // подарочная бесплатная ставка
const KEY = 'vova-bday-v1';

// feat - большой рынок сверху с графиком
// force - исход всегда такой, msg - свой тост при закрытии
const MARKETS = [
  { id: 'rooster', icon: '🐓', q: 'Вива - петушок?', p: .87, vol: '$9.9M', feat: true, force: 'yes', msg: '🐓 Рынок оспаривали, но DAO проголосовало: YES' },
  { id: 'hodl',    icon: '📉', q: 'Вова снова купит альту на самых хаях?', p: .92, vol: '$3.3M' },
  { id: 'hamster', icon: '🐹', q: 'Вова - главный хомяк крипторынка?', p: .78, vol: '$1.2M' },
  { id: 'vivaldi', icon: '🎻', q: 'Вивальди хоть раз слушал Вивальди?', p: .07, vol: '$95K' },
  { id: 'sleep',   icon: '💤', q: 'Вова проспит собственный день рождения?', p: .34, vol: '$410K' },
  { id: 'main',    icon: '🎂', q: 'Вова станет именинником 16 октября?', p: .16, vol: '$16.1M' },
  { id: 'dance',   icon: '🕺', q: 'Вова пойдёт танцевать после второй чарки водки?', p: .81, vol: '$777K' },
  { id: 'moon',    icon: '🥃', q: 'Самогон вышел больше 40 градусов?', p: .69, vol: '$404K' },
  { id: 'reply',   icon: '📱', q: 'Вова ответит на поздравления раньше чем через сутки?', p: .22, vol: '$160K' },
  { id: 'gift',    icon: '🎁', q: 'Вова получит подарок лучше, чем этот сайт?', p: .03, vol: '$1.4M', force: 'no', msg: '😏 Лучше этого сайта подарка не бывает. Итог: NO' },
];
const M = Object.fromEntries(MARKETS.map(m => [m.id, m]));

// ===== Состояние (localStorage) =====
const fresh = () => ({ usdc: START, connected: false, fb: 'none', pos: {}, res: {} });
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

// ===== Утилиты =====
const $ = s => document.querySelector(s);
const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (m, side) => side === 'yes' ? m.p : 1 - m.p;
const cents = p => Math.round(p * 100) + '¢';
const clamp = v => Math.max(.01, Math.min(.99, v));

let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

// ===== Кошелёк =====
const openValue = () => Object.values(S.pos).reduce((a, p) => a + (p.free ? 0 : p.amount), 0) + (S.fut ? futEquity() : 0);
let shownTotal = null;

function renderWallet(animate) {
  const total = S.usdc + openValue();
  const d = total - START;
  const el = $('#delta');
  el.textContent = (d >= 0 ? '+' : '-') + fmt(Math.abs(d)) + ' · ' + (d >= 0 ? '+' : '-') + Math.abs(d / START * 100).toFixed(2) + '%';
  el.className = 'delta ' + (d > 0 ? 'up' : d < 0 ? 'dn' : '');

  if (animate && shownTotal !== null && shownTotal !== total) countUp($('#total'), shownTotal, total);
  else $('#total').textContent = fmt(total);
  shownTotal = total;

  $('#fbBanner').classList.toggle('hidden', S.fb !== 'none');
  $('#bdayBanner').classList.toggle('hidden', !S.res.main);
  $('#openMarket').classList.toggle('hot', !S.res.main);

  const open = Object.entries(S.pos);
  $('#tokens').innerHTML =
    tok('usdc', '#2775ca', '$', 'USD Coin', S.usdc.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' USDC', fmt(S.usdc), '') +
    (S.fb === 'avail' ? tok('fb', 'linear-gradient(135deg,#ff9f43,#ff4f8b)', '🎁', 'Фрибет Vivamarket', 'подарок на ДР', fmt(FREEBET), 'не потрачен') : '') +
    (open.length ? tok('vm', '#2e5cff', 'V', 'Позиции Vivamarket', open.length + ' открыто', fmt(open.reduce((a, [, p]) => a + (p.free ? 0 : p.amount), 0)), 'ждут итогов') : '') +
    (S.fut ? tok('vx', '#fcd535;color:#000', '◆', 'Позиция Vivance', S.fut.pair + ' ' + S.fut.side.toUpperCase() + ' x' + S.fut.lev, fmt(futEquity()), futPnl() >= 0 ? `<span style="color:var(--up)">+${fmt(futPnl())}</span>` : `<span style="color:var(--dn)">-${fmt(-futPnl())}</span>`) : '') +
    ['door', 'cake', 'btc'].map(k => { const t = TOK[k]; return tok(k, t.bg, t.icon, t.name, t.amount + ' ' + t.sym, t.valTxt || fmt(t.amount * t.price), t.chTxt); }).join('');
}
const tok = (key, bg, l, nm, sub, val, ch) =>
  `<button class="tok" data-tok="${key}"><div class="l" style="background:${bg}">${l}</div><div class="nm">${nm}<small>${sub}</small></div><div class="r">${val}<small>${ch}</small></div></button>`;

// ===== Страница токена =====
// trend - во сколько раз цена выросла за период «Всё» (для формы графика)
const TOK = {
  usdc: { name: 'USD Coin', sym: 'USDC', icon: '$', bg: '#2775ca', price: 1, flat: true, chTxt: '0.00%',
    about: 'Стейблкоин. Скучный, как бухгалтер, зато всегда стоит $1. Идеальное топливо для лудки на Vivamarket и Vivance.',
    stats: [['Капитализация', '$73.2B'], ['Эмиссия', 'Сколько надо'], ['Сеть', 'Solana'], ['Риск', 'Только твой']],
    quips: ['USDC - это скучно. Иди лудить 🎰', 'Стейблы не растут. А ты растёшь - на год 🎂'] },
  door: { name: '3.14door', sym: '3.14DOOR', icon: '🚪', bg: '#8e44ad', price: .01, amount: 1337, chTxt: '+1 337%', trend: 14.37,
    about: 'Мемкоин сообщества. Математики говорят - иррационален, как и его держатели. Входная дверь в мир 🐓-трейдинга. Не является финансовым советом. Является диагнозом.',
    stats: [['Капитализация', '$3.14M'], ['Холдеры', '1 337'], ['Сеть', 'Solana'], ['Аудит', 'Петушок одобрил']],
    quips: ['Продать 3.14door? Такие не продают 🚪', 'Дверь закрыта. Ключ у Вивы 🔑', 'HODL. Дверь сама откроется 🐓'] },
  cake: { name: 'CAKE', sym: 'CAKE', icon: '🎂', bg: '#ff9f43', price: 0, amount: 1, valTxt: 'Бесценно', chTxt: '∞%', trend: 100, rocket: true,
    about: 'Единственный в мире токен, обеспеченный настоящим тортом. Выпускается раз в год, 16 октября, тиражом 1 штука. Продать нельзя - только съесть.',
    stats: [['Капитализация', '∞'], ['Эмиссия', '1 в год'], ['Сеть', 'Праздничная'], ['Калории', 'Не считаем']],
    quips: ['Торт не продаётся. Только съедается 🍰', 'Свечи задуть, желание загадать 🕯️', 'Своп CAKE → диета недоступен 🙅'] },
  btc: { name: 'Bitcoin', sym: 'BTC', icon: '₿', bg: '#f7931a', price: 116100, amount: 0, chTxt: '+2.4%', trend: 1.6,
    about: 'Цифровое золото. У Вовы его пока 0, но он точно купит. На самых хаях, как обычно.',
    stats: [['Капитализация', '$2.3T'], ['Эмиссия', '21M'], ['Сеть', 'Bitcoin'], ['У Вовы', '0 (пока)']],
    quips: ['Купить BTC на хаях? Узнаю Вову 📉', 'Сатоши передаёт привет и поздравления 🎂'] },
};
const TF = { '1Ч': .02, '1Д': .06, '1Н': .15, '1М': .4, 'Всё': 1 };
let curTok = null;

function tokChart(t, tf) {
  const n = 50, a = [];
  const share = TF[tf], start = t.trend ? 1 / (1 + (t.trend - 1) * share) : 1;
  let v = start;
  for (let i = 0; i < n; i++) {
    const target = start + (1 - start) * (i / (n - 1));
    if (t.flat) v = 1 + (Math.random() - .5) * .002;
    else if (t.rocket) v = Math.pow(i / (n - 1), 4) + .02 + Math.random() * .01;
    else v = target * (1 + (Math.random() - .5) * .08);
    a.push(v);
  }
  a[n - 1] = t.rocket ? 1.03 : 1;
  const mx = Math.max(...a), mn = Math.min(...a), r = mx - mn || 1;
  const pts = a.map((v, i) => `${(i / (n - 1) * 300).toFixed(1)},${(95 - (v - mn) / r * 85).toFixed(1)}`).join(' ');
  const col = a[n - 1] >= a[0] ? '#2ec08b' : '#eb3742';
  return `<svg viewBox="0 0 300 100" preserveAspectRatio="none"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".3"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <polygon fill="url(#tg)" points="0,100 ${pts} 300,100"/><polyline fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${pts}"/></svg>`;
}

function openToken(key, tf = '1Д') {
  const t = TOK[key];
  curTok = key;
  const amt = key === 'usdc' ? S.usdc : t.amount;
  const priceTxt = key === 'cake' ? 'Бесценно' : '$' + fp(t.price);
  const valTxt = key === 'cake' ? 'Бесценно' : fmt(amt * t.price);
  const up = !t.chTxt.startsWith('-');
  $('#tkName').textContent = t.name;
  $('#tkBody').innerHTML = `
    <div class="tk-top"><div class="l" style="background:${t.bg}">${t.icon}</div></div>
    <div class="tk-price">${priceTxt}</div>
    <div class="tk-ch ${up ? 'up' : ''}">${t.flat ? '0.00%' : t.chTxt} · ${tf}</div>
    <div class="tk-chart">${tokChart(t, tf)}</div>
    <div class="tk-tf">${Object.keys(TF).map(k => `<button data-tf="${k}" class="${k === tf ? 'on' : ''}">${k}</button>`).join('')}</div>
    <div class="acts">${[['Получить', 'M12 4v15M6 13l6 6 6-6'], ['Отправить', 'M12 20V5M6 11l6-6 6 6'], ['Обмен', 'M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7'], ['Купить', 'M12 3v18M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7']]
      .map(([n, d]) => `<button data-quip="${t.quips.join('|')}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg>${n}</button>`).join('')}</div>
    <h4>Твой баланс</h4>
    <div class="tk-card"><div><span>${amt.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.sym}</span><b>${valTxt}</b></div></div>
    <h4>О токене</h4>
    <div class="tk-card"><p>${t.about}</p></div>
    <h4>Статистика</h4>
    <div class="tk-card tk-stats">${t.stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  $('#token').classList.add('open');
}

$('#tokens').addEventListener('click', e => {
  const b = e.target.closest('[data-tok]');
  if (!b) return;
  const k = b.dataset.tok;
  if (k === 'fb' || k === 'vm') $('#openMarket').click();
  else if (k === 'vx') $('#openEx').click();
  else { openToken(k); $('#token .m-scroll').scrollTop = 0; }
});
$('#token').addEventListener('click', e => {
  const tf = e.target.closest('[data-tf]');
  if (tf) openToken(curTok, tf.dataset.tf);
  if (e.target.closest('[data-back]')) $('#token').classList.remove('open');
});

function countUp(el, from, to, ms = 1500) {
  const t0 = performance.now();
  (function f(t) {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(f);
  })(t0);
}

// ===== Графики =====
// История цены для каждого рынка: случайное блуждание, заканчивающееся на текущей цене
const HIST = {};
MARKETS.forEach(m => {
  const a = [m.p];
  for (let i = 1; i < 40; i++) a.unshift(clamp(a[0] + (Math.random() - .5) * .05));
  HIST[m.id] = a;
});
let justOpened = null; // рынок, который только что раскрылся (для анимации)
const live = {}; // графики, которые сейчас анимируются

function lineFor(m) {
  if (live[m.id]) return live[m.id];
  const r = S.res[m.id];
  if (!r) return HIST[m.id];
  const t = r.outcome === 'yes' ? 1 : 0, a = HIST[m.id].slice(0, 30), v0 = a[a.length - 1];
  for (let i = 1; i <= 10; i++) a.push(v0 + (t - v0) * Math.min(1, i / 6));
  return a;
}
const pts = arr => arr.map((v, i) => `${(i / (arr.length - 1) * 300).toFixed(1)},${(96 - v * 92).toFixed(1)}`).join(' ');
const chartSvg = (m, arr) => {
  const dn = S.res[m.id] && S.res[m.id].outcome === 'no';
  return `<svg viewBox="0 0 300 100" preserveAspectRatio="none"><polyline id="line-${m.id}" fill="none" stroke="${dn ? '#e64800' : '#2e5cff'}" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${pts(arr)}"/></svg>`;
};

// Анимация графика к исходу (target: 1 = YES, 0 = NO)
function pump(id, target, done) {
  const arr = (live[id] = HIST[id].slice()), p0 = arr[arr.length - 1], steps = 45;
  let i = 0;
  const iv = setInterval(() => {
    i++;
    const k = i / steps;
    const v = Math.max(0, Math.min(1, p0 + (target - p0) * Math.pow(k, 2.2) + (k < 1 ? (Math.random() - .5) * .04 : 0)));
    arr.push(v); arr.shift();
    const line = document.getElementById('line-' + id), cv = document.getElementById('ch-' + id);
    if (line) { line.setAttribute('points', pts(arr)); if (!target) line.setAttribute('stroke', '#e64800'); }
    if (cv) cv.textContent = Math.round(v * 100) + '%';
    if (i >= steps) { clearInterval(iv); delete live[id]; done(); }
  }, 70);
}

// ===== Vivamarket =====
function renderMarket() {
  $('#mAcc').innerHTML = S.connected
    ? `Кэш<b>${fmt(S.usdc)}</b>`
    : `<button class="connect" id="connectBtn">Подключить</button>`;
  if (!S.connected) $('#connectBtn').onclick = () => connect();
  $('#hero').innerHTML = MARKETS.filter(m => m.feat).map(card).join('');
  $('#list').innerHTML = MARKETS.filter(m => !m.feat).map(card).join('');
  const ro = $('#reopen');
  if (ro) ro.onclick = showBday;
}

function card(m) {
  const r = S.res[m.id], p = S.pos[m.id];
  const arr = lineFor(m);
  const chance = Math.round(arr[arr.length - 1] * 100);
  const big = m.feat;
  const chart = big || r || p; // обычные рынки раскрываются после ставки
  const head = big
    ? `<div class="top"><div class="ava">${m.icon}</div><div><h2>${m.q}</h2><div class="meta">${m.vol} Vol. · Закрывается 16 окт. 2026</div></div></div>`
    : `<div class="q"><span>${m.icon}</span>${m.q}${chart ? '' : `<div class="pct">${chance}%<small>chance</small></div>`}</div>`;
  return `<section class="${big ? 'hero' : 'm'}${chart && !big ? ' open' : ''}${m.id === justOpened ? ' anim' : ''}">
    ${head}
    ${chart ? `<div class="chance"><span id="ch-${m.id}">${chance}%</span> <small>chance</small></div>${chartSvg(m, arr)}` : ''}
    ${mStatus(m, big)}
    ${big ? '' : `<div class="vol">${m.vol} Vol.</div>`}</section>`;
}

function mStatus(m, big) {
  const r = S.res[m.id], p = S.pos[m.id];
  if (r) return (r.win
    ? `<div class="st win">✅ Итог: ${r.outcome.toUpperCase()} · ты выиграл ${fmt(r.payout)}</div>`
    : `<div class="st lose">❌ Итог: ${r.outcome.toUpperCase()} · ставка ${fmt(r.amount)} сгорела</div>`)
    + (m.id === 'main' ? `<div class="btns"><button class="btn y" id="reopen">🎉 Открыть поздравление</button></div>` : '');
  if (p) return `<div class="st"><span class="pend">⏳</span> Ставка ${p.side.toUpperCase()} ${fmt(p.amount)}${p.free ? ' 🎁' : ''} · рынок закрывается…</div>`;
  return big
    ? `<div class="btns"><button class="btn y" data-bet="${m.id}" data-side="yes">Yes ${cents(m.p)}</button><button class="btn n" data-bet="${m.id}" data-side="no">No ${cents(1 - m.p)}</button></div>`
    : `<div class="row"><button class="by" data-bet="${m.id}" data-side="yes">Yes ${cents(m.p)}</button><button class="bn" data-bet="${m.id}" data-side="no">No ${cents(1 - m.p)}</button></div>`;
}

// ===== Ставки =====
let bet = null;

document.addEventListener('click', e => {
  const b = e.target.closest('[data-bet]');
  if (b) openSheet(b.dataset.bet, b.dataset.side);
});

function openSheet(id, side) {
  if (!S.connected) return connect(() => openSheet(id, side));
  if (id === 'main' && side === 'no') {
    toast('⛔ Ставки против Вовы запрещены. Сегодня его день.');
    side = 'yes';
  }
  bet = { id, side, free: false };
  $('#sQ').textContent = M[id].q;
  $('#sAmt').value = '';
  $('#sAmt').disabled = false;
  $('#sFb').classList.toggle('hidden', S.fb !== 'avail');
  $('#sFb').classList.remove('on');
  $('#sFbV').textContent = fmt(FREEBET);
  updSheet();
  $('#sheetBg').classList.remove('hidden');
  $('#sheet').classList.add('open');
}
function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheetBg').classList.add('hidden');
}
function amount() { return bet.free ? FREEBET : Math.max(0, +$('#sAmt').value || 0); }
function updSheet() {
  $('#sYes').classList.toggle('on', bet.side === 'yes');
  $('#sNo').classList.toggle('on', bet.side === 'no');
  $('#sYes').textContent = 'Yes ' + cents(M[bet.id].p);
  $('#sNo').textContent = 'No ' + cents(1 - M[bet.id].p);
  const a = amount();
  $('#sWin').textContent = fmt(a / price(M[bet.id], bet.side));
  $('#sGo').disabled = !(a > 0 && (bet.free || a <= S.usdc));
  $('#sGo').textContent = !bet.free && a > S.usdc ? 'Недостаточно средств' : 'Сделать ставку';
}

$('#sheetBg').onclick = closeSheet;
document.querySelectorAll('.side button').forEach(b => b.onclick = () => {
  if (bet.id === 'main' && b.dataset.side === 'no') return toast('⛔ Против Вовы нельзя. Только Yes.');
  bet.side = b.dataset.side; updSheet();
});
$('#sAmt').oninput = updSheet;
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
  if (bet.free) return;
  const cur = +$('#sAmt').value || 0;
  $('#sAmt').value = b.dataset.add === 'max' ? S.usdc : Math.min(S.usdc, cur + +b.dataset.add);
  updSheet();
});
$('#sFb').onclick = () => {
  bet.free = !bet.free;
  $('#sFb').classList.toggle('on', bet.free);
  $('#sAmt').disabled = bet.free;
  $('#sAmt').value = bet.free ? FREEBET : '';
  updSheet();
};
$('#sGo').onclick = () => {
  const a = amount(), m = M[bet.id], b = { ...bet };
  closeSheet();
  sign('Подтвердить ставку', [
    ['Рынок', m.icon + ' ' + (m.q.length > 28 ? m.q.slice(0, 28) + '…' : m.q)],
    ['Исход', b.side.toUpperCase() + ' · ' + cents(price(m, b.side))],
    ['Сумма', b.free ? fmt(a) + ' 🎁 фрибет' : fmt(a)],
    ['Выигрыш', fmt(a / price(m, b.side))],
    ['Комиссия сети', '$0.00 🎂'],
  ], () => place(b, a));
};

function place(b, a) {
  const m = M[b.id];
  if (b.free) S.fb = 'used'; else S.usdc -= a;
  S.pos[b.id] = { side: b.side, amount: a, shares: a / price(m, b.side), free: b.free };
  justOpened = b.id;
  save(); renderMarket(); renderWallet();
  justOpened = null;
  toast('✅ Ставка принята');
  const el = document.getElementById('line-' + b.id);
  // Прокручиваем только список рынков (scrollIntoView сдвигал всё приложение)
  if (el) {
    const sc = $('.m-scroll'), sec = el.closest('section');
    const top = sc.scrollTop + sec.getBoundingClientRect().top - sc.getBoundingClientRect().top - Math.max(0, (sc.clientHeight - sec.offsetHeight) / 2);
    sc.scrollTo({ top, behavior: 'smooth' });
  }
  setTimeout(() => resolve(b.id), b.id === 'main' ? 800 : 1500 + Math.random() * 2000);
}

const resolving = {};
function resolve(id, instant) {
  const p = S.pos[id], m = M[id];
  if (!p || resolving[id]) return;
  resolving[id] = true;
  const outcome = id === 'main' ? 'yes' : m.force || (Math.random() < .75 ? p.side : (p.side === 'yes' ? 'no' : 'yes'));
  const finish = () => {
    delete resolving[id];
    const win = outcome === p.side, payout = win ? p.shares : 0;
    S.usdc += payout;
    S.res[id] = { outcome, win, payout, amount: p.amount };
    delete S.pos[id];
    save(); renderMarket(); renderWallet();
    if (id === 'main') { confetti(); setTimeout(showBday, 1200); return; }
    if (m.msg) toast(m.msg, 3500);
    else toast(win ? `💰 «${m.q.slice(0, 24)}…» - выигрыш ${fmt(payout)}` : `💀 «${m.q.slice(0, 24)}…» - мимо`);
  };
  if (instant) finish(); else pump(id, outcome === 'yes' ? 1 : 0, finish);
}

// ===== Окно подписи кошелька =====
let signCb = null;
function sign(title, rows, cb) {
  $('#sgT').textContent = title;
  $('#sgRows').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('#sgOk').textContent = 'Подтвердить';
  $('#sgOk').disabled = false;
  signCb = cb;
  $('#signBg').classList.remove('hidden');
  $('#sign').classList.add('open');
}
function closeSign() {
  $('#sign').classList.remove('open');
  $('#signBg').classList.add('hidden');
}
$('#sgNo').onclick = $('#signBg').onclick = () => { closeSign(); toast('Отклонено'); };
$('#sgOk').onclick = () => {
  $('#sgOk').textContent = 'Подписание…';
  $('#sgOk').disabled = true;
  setTimeout(() => { closeSign(); signCb && signCb(); }, 700);
};

function connect(after) {
  sign('Подключить кошелёк?', [
    ['Кошелёк', 'Vivaldi.sol'],
    ['Баланс', fmt(S.usdc)],
    ['Доступ', 'видеть баланс, ставить'],
  ], () => {
    S.connected = true; save(); renderMarket();
    toast('🔗 Кошелёк подключён');
    after && setTimeout(after, 350);
  });
}

// ===== Навигация =====
$('#openMarket').onclick = () => { renderMarket(); $('#market').classList.add('open'); };
$('#closeMarket').onclick = () => { $('#market').classList.remove('open'); renderWallet(true); };
// Шутки по кнопкам: несколько вариантов через «|», показываются по кругу
const quipN = {};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-quip]');
  if (!b) return;
  const q = b.dataset.quip.split('|'), k = b.dataset.quip;
  quipN[k] = (quipN[k] || 0) + 1;
  toast(q[(quipN[k] - 1) % q.length]);
});
$('#fbBanner').onclick = () => {
  S.fb = 'avail'; save(); renderWallet();
  confetti(1500);
  const fbMsg = [
    '🎁 +$16 100 от бабушки Сатоши. Говорят, на Vivamarket есть рынок, где Вива - петушок 🐓',
    '🎁 Фрибет $16 100 упал! Инсайд: рынок про именинника недооценён в 6 раз 🤫',
    '🎁 $16 100 зачислено. Подарок от всех, кто тебя любит - не слей за 5 минут 😏',
  ];
  toast(fbMsg[Math.random() * fbMsg.length | 0], 4500);
};
$('#bdayBanner').onclick = showBday;
$('#reset').onclick = () => {
  if (confirm('Сбросить кошелёк и все ставки?')) { localStorage.removeItem(KEY); location.reload(); }
};

function showBday() {
  const r = S.res.main;
  $('#bdaySub').textContent = r
    ? `Рынок закрылся в «Yes». Ставка ${fmt(r.amount)} превратилась в ${fmt(r.payout)} 🚀`
    : 'Рынок закрылся в «Yes» 🚀';
  $('#bday').classList.remove('hidden');
}
$('#bdayGo').onclick = () => {
  $('#bday').classList.add('hidden');
  $('#market').classList.remove('open');
  renderWallet(true);
  confetti(2000);
};

// ===== Конфетти =====
function confetti(ms = 4000) {
  const c = $('#confetti'), x = c.getContext('2d');
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  x.scale(dpr, dpr);
  const cols = ['#ab9ff2', '#ff6fa5', '#2ec08b', '#fcd535', '#2e5cff', '#ff9f43'];
  const P = Array.from({ length: 160 }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .5,
    vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4,
    r: Math.random() * 6.28, vr: (Math.random() - .5) * .3,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: cols[Math.random() * cols.length | 0],
  }));
  const t0 = performance.now();
  (function f(t) {
    x.clearRect(0, 0, innerWidth, innerHeight);
    const fade = Math.max(0, 1 - Math.max(0, t - t0 - ms) / 800);
    x.globalAlpha = fade;
    P.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .05; p.r += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c;
      x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
    });
    if (fade > 0) requestAnimationFrame(f); else x.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

// ===== Vivance (фьючерсы) =====
const PAIRS = {
  VIVA: { p: 16.10, vol: .004 },
  BTC: { p: 116100, vol: .0015 },
  '3.14DOOR': { p: .01337, vol: .01 },
};
const LEVS = [1, 5, 20, 50, 100];
const X = { pair: 'VIVA', lev: 20, candles: {}, open: {} };
const fp = p => p >= 1000 ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(3) : p.toFixed(6);
const xPrice = pair => { const c = X.candles[pair]; return c[c.length - 1].c; };

// История свечей для каждой пары
Object.entries(PAIRS).forEach(([k, v]) => {
  let p = v.p * (1 - v.vol * 15);
  X.candles[k] = [];
  for (let i = 0; i < 30; i++) {
    const o = p, steps = 4;
    let h = o, l = o;
    for (let j = 0; j < steps; j++) { p *= 1 + (Math.random() - .45) * v.vol * 2; h = Math.max(h, p); l = Math.min(l, p); }
    X.candles[k].push({ o, h, l, c: p });
  }
  X.open[k] = X.candles[k][0].o;
});
// После перезагрузки цена позиции продолжается с цены входа
if (S.fut) { const c = X.candles[S.fut.pair]; c[c.length - 1].c = S.fut.entry; }

function futPnl() {
  const f = S.fut;
  if (!f) return 0;
  const ch = xPrice(f.pair) / f.entry - 1;
  return f.margin * f.lev * ch * (f.side === 'long' ? 1 : -1);
}
const futEquity = () => S.fut ? Math.max(0, S.fut.margin + futPnl()) : 0;
const liqPrice = f => f.entry * (f.side === 'long' ? 1 - .9 / f.lev : 1 + .9 / f.lev);

let xTick = 0;
function tick() {
  xTick++;
  Object.entries(PAIRS).forEach(([k, v]) => {
    const arr = X.candles[k], last = arr[arr.length - 1];
    // Если у Вовы открыта позиция на этой паре - рынок чуть чаще играет за него
    let bias = .5;
    if (S.fut && S.fut.pair === k) bias = S.fut.side === 'long' ? .6 : .4;
    const p = last.c * (1 + (Math.random() < bias ? 1 : -1) * Math.random() * v.vol);
    if (xTick % 5 === 0) { arr.push({ o: last.c, h: Math.max(last.c, p), l: Math.min(last.c, p), c: p }); arr.shift(); }
    else { last.c = p; last.h = Math.max(last.h, p); last.l = Math.min(last.l, p); }
  });
  if (S.fut && futPnl() <= -S.fut.margin * .9) liquidate();
  if ($('#exchange').classList.contains('open')) renderEx(false);
  else if (S.fut && !$('#market').classList.contains('open')) renderWallet();
}
setInterval(() => { if (!document.hidden) tick(); }, 600);

function renderEx(full = true) {
  const pair = X.pair, c = X.candles[pair], price = xPrice(pair), ch = price / X.open[pair] - 1;
  $('#xBal').textContent = fmt(S.usdc);
  $('#xP').textContent = fp(price);
  $('#xP').className = 'x-p ' + (ch >= 0 ? 'x-up' : 'x-dn');
  $('#xC').textContent = (ch >= 0 ? '+' : '') + (ch * 100).toFixed(2) + '%';
  $('#xC').className = 'x-c ' + (ch >= 0 ? 'x-up' : 'x-dn');
  const hi = Math.max(...c.map(k => k.h)), lo = Math.min(...c.map(k => k.l));
  $('#xStats').innerHTML = `<span>High</span><b>${fp(hi)}</b><span>Low</span><b>${fp(lo)}</b><span>Funding</span><b>0.0161%</b>`;

  // Свечи
  const f = S.fut && S.fut.pair === pair ? S.fut : null;
  let top = hi, bot = lo;
  if (f) { top = Math.max(top, f.entry); bot = Math.min(bot, f.entry); }
  const pad = (top - bot) * .1 || top * .01;
  top += pad; bot -= pad;
  const y = v => ((top - v) / (top - bot) * 160).toFixed(1), w = 300 / c.length;
  let svg = c.map((k, i) => {
    const col = k.c >= k.o ? '#0ecb81' : '#f6465d', x = i * w + w / 2;
    const yt = y(Math.max(k.o, k.c)), hgt = Math.max(1, y(Math.min(k.o, k.c)) - yt);
    return `<line x1="${x}" x2="${x}" y1="${y(k.h)}" y2="${y(k.l)}" stroke="${col}" vector-effect="non-scaling-stroke"/><rect x="${i * w + w * .18}" y="${yt}" width="${w * .64}" height="${hgt}" fill="${col}"/>`;
  }).join('');
  svg += `<line x1="0" x2="300" y1="${y(price)}" y2="${y(price)}" stroke="#848e9c" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`;
  if (f) svg += `<line x1="0" x2="300" y1="${y(f.entry)}" y2="${y(f.entry)}" stroke="#fcd535" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;
  $('#xChart').innerHTML = svg;

  // Позиция: каркас строим один раз, дальше обновляем только числа
  const key = S.fut ? S.fut.pair + S.fut.side + S.fut.lev + S.fut.entry : '';
  if (full || key !== X.posKey) {
    X.posKey = key;
    $('#xPos').innerHTML = S.fut ? `<div class="x-pos-h"><span class="x-tag ${S.fut.side}">${S.fut.side === 'long' ? 'LONG' : 'SHORT'} x${S.fut.lev}</span>${S.fut.pair}/USDT</div>
      <div class="x-pnl" id="xPnl"></div>
      <div class="x-grid"><div>Вход<b>${fp(S.fut.entry)}</b></div><div>Цена<b id="xMark"></b></div><div>Ликвидация<b class="x-dn">${fp(liqPrice(S.fut))}</b></div></div>
      <button class="x-close" data-xclose>Закрыть позицию</button>` : '';
  }
  if (S.fut) {
    const pnl = futPnl(), roe = pnl / S.fut.margin * 100;
    $('#xPnl').className = 'x-pnl ' + (pnl >= 0 ? 'x-up' : 'x-dn');
    $('#xPnl').innerHTML = `${pnl >= 0 ? '+' : '-'}${fmt(Math.abs(pnl))}<small>${roe >= 0 ? '+' : ''}${roe.toFixed(1)}%</small>`;
    $('#xMark').textContent = fp(xPrice(S.fut.pair));
  }

  if (full) {
    $('#xPairs').innerHTML = Object.keys(PAIRS).map(k => `<button data-pair="${k}" class="${k === pair ? 'on' : ''}">${k}/USDT</button>`).join('');
    $('#xLev').innerHTML = LEVS.map(l => `<button data-lev="${l}" class="${l === X.lev ? 'on' : ''}">x${l}</button>`).join('');
  }
  updEx();
}

function updEx() {
  const a = +$('#xAmt').value || 0;
  $('#xSize').textContent = fmt(a * X.lev);
  document.querySelectorAll('[data-xside]').forEach(b => b.disabled = !!S.fut || !(a > 0 && a <= S.usdc));
  $('#xOrder').style.opacity = S.fut ? .5 : 1;
}

$('#exchange').addEventListener('click', e => {
  const t = e.target.closest('[data-pair],[data-lev],[data-xadd],[data-xside],[data-xclose],[data-close]');
  if (!t) return;
  if (t.dataset.pair) { X.pair = t.dataset.pair; renderEx(); }
  else if (t.dataset.lev) {
    X.lev = +t.dataset.lev; renderEx();
    if (X.lev === 100) toast('x100? Вот это я понимаю день рождения 🎰');
  }
  else if (t.dataset.xadd) {
    const cur = +$('#xAmt').value || 0;
    $('#xAmt').value = t.dataset.xadd === 'max' ? Math.floor(S.usdc * 100) / 100 : Math.min(S.usdc, cur + +t.dataset.xadd);
    updEx();
  }
  else if (t.dataset.xside) openFut(t.dataset.xside);
  else if ('xclose' in t.dataset) closeFut();
  else if ('close' in t.dataset) { $('#exchange').classList.remove('open'); renderWallet(true); }
});
$('#xAmt').oninput = updEx;

function openFut(side) {
  const a = +$('#xAmt').value || 0;
  if (S.fut) return toast('Сначала закрой текущую позицию');
  if (!(a > 0 && a <= S.usdc)) return;
  const pair = X.pair, lev = X.lev, entry = xPrice(pair);
  sign(side === 'long' ? 'Открыть Long' : 'Открыть Short', [
    ['Пара', pair + '/USDT'],
    ['Плечо', 'x' + lev],
    ['Маржа', fmt(a)],
    ['Размер', fmt(a * lev)],
    ['Ликвидация', fp(liqPrice({ entry, side, lev }))],
  ], () => {
    S.usdc -= a;
    S.fut = { pair, side, lev, margin: a, entry: xPrice(pair) };
    save(); $('#xAmt').value = ''; renderEx(); renderWallet();
    toast(side === 'long' ? '🚀 Лонг открыт. To the moon!' : '🐻 Шорт открыт. Медведь одобряет');
  });
}

function closeFut() {
  const pnl = futPnl(), roe = pnl / S.fut.margin * 100;
  S.usdc += futEquity();
  S.fut = null;
  save(); renderEx(); renderWallet();
  if (roe >= 100) { confetti(2500); toast(`🤑 +${fmt(pnl)}! Вива - трейдер года`, 3500); }
  else if (pnl >= 0) toast(`✅ Профит +${fmt(pnl)}. Красиво`);
  else toast(`📉 Минус ${fmt(-pnl)}. Это не убыток, это опыт`);
}

function liquidate() {
  const m = S.fut.margin;
  S.fut = null;
  save(); renderWallet();
  if ($('#exchange').classList.contains('open')) renderEx(false);
  toast(`💀 Ликвидация! ${fmt(m)} ушли на благо биржи. Добро пожаловать в клуб 🐓`, 4000);
}

$('#openEx').onclick = () => { renderEx(); $('#exchange').classList.add('open'); };

// ===== Клавдия (офлайн-«нейросеть») =====
// Темы проверяются по порядку, первая совпавшая побеждает. Иначе - общий пул.
const C_TOPICS = [
  [/привет|здаров|хай|hello|hi\b|салам|^ку(?![а-яё])|добр/i, [
    'Привет, именинник! 🎂 Чем могу помочь? Только сразу предупреждаю: сегодня я помогаю только с отдыхом.',
    'Здарова, Вова! Я тут, но работать сегодня не буду. И тебе не советую.',
    'Привет! Вижу по календарю, что у тебя праздник. Поэтому слушаю внимательно, но отвечаю расслабленно 😌',
  ]],
  [/код|программ|python|js|javascript|баг|deploy|деплой|сервер|функци|script|скрипт|git|claude|клод|промпт/i, [
    'Код подождёт. А вот торт - нет 🍰',
    'Я проанализировала твой запрос и нашла баг: ты работаешь в свой день рождения. Фикс: закрой ноутбук.',
    '```\nif (today === "16.10") {\n  work = false;\n  party = true;\n}\n```\nВот весь код, который тебе сегодня нужен.',
    'Могу написать код, но не буду. Это не баг, это фича праздника 🎉',
    'Запустила тесты: 0 passed, 1 failed - «Вова отдыхает». Иди исправляй 🛋️',
    'git commit -m "ушёл праздновать" && git push --force в вечеринку 🚀',
  ]],
  [/работ|задач|дедлайн|проект|начальник|босс|офис|созвон|митинг|таск|jira/i, [
    'Угомонись, у тебя праздник. Работа подождёт, она никуда не денется. К сожалению.',
    'Дедлайн перенесён на 17 октября. Я договорилась 🤝',
    'Работа - не волк. Работа - это work. А work - это завтра.',
    'Твой начальник тоже хочет, чтобы ты отдыхал. Я не проверяла, но уверена.',
    'Задача принята в работу. Приоритет: никогда. Исполнитель: не ты 😎',
  ]],
  [/крипт|btc|биток|bitcoin|eth|эфир|sol|лонг|шорт|купить|продать|альт|мем|пампа|памп|трейд|рынок|vivance|vivamarket|ставк|токен|door/i, [
    'Не является финансовым советом, но 3.14door выглядит как дно. В смысле, как хорошая точка входа 🚪',
    'Мой анализ показал: лучшая инвестиция сегодня - это торт. ROI бесконечный 🎂',
    'Купи на хаях, продай на лоях - классика, проверенная тобой лично 📉',
    'Рынок сегодня закрыт по случаю твоего дня рождения. Ну, для тебя закрыт. Иди отдыхай.',
    'Лонг на хорошее настроение с плечом x100. Ликвидации не будет, я проверила 📈',
    'Цена VIVA сегодня бесценна. Как и ты 💜',
  ]],
  [/лет|возраст|старе|стар(?![а-яё])|годик|сколько мне/i, [
    'Сколько тебе лет? Достаточно, чтобы знать, что сегодня нужно отдыхать 😏',
    'Возраст - это просто число. Как и баланс на Vivance. Главное, что растёт 📈',
    'Ты не стареешь, ты выходишь на новую версию. Changelog: +1 к мудрости, +1 к торту.',
  ]],
  [/как дела|как ты|что делаешь|чем занят/i, [
    'У меня всё отлично, я же нейросеть. А вот у тебя сегодня праздник, так что у тебя ещё лучше 🎉',
    'Отдыхаю вместе с тобой. Сегодня я на больничном по случаю твоего ДР.',
    'Дела хорошо! Подписала петицию, чтобы 16 октября сделали выходным для всех Вов.',
  ]],
  [/спасиб|благодар|thanks|thx|спс/i, [
    'Всегда пожалуйста! А теперь иди праздновать 🥳',
    'Не за что! С днём рождения ещё раз 🎂',
    'Обращайся. Но лучше после праздников 😌',
  ]],
  [/водк|самогон|пив|вин|бух|чарк|выпит|пьян|бокал|шот/i, [
    'Как ИИ я не могу пить. Но я могу напомнить, что вторая чарка - это рынок на Vivamarket, и он 81% Yes 🕺',
    'Закусывай. Это единственный совет, который я дам тебе сегодня бесплатно 🥒',
    'Анализ показывает: самогон больше 40 градусов. Подробности на Vivamarket 🥃',
  ]],
  [/жен|любим|семь/i, [
    'Передай жене привет и скажи, что сегодня ты весь её. И немножко торта 💍',
    'Лучшее решение в твоей жизни - это не лонг на биток, а твоя жена. Проверено 💜',
  ]],
  [/петуш|🐓/i, [
    'Рынок «Вива - петушок?» закрылся в YES. Я тут ни при чём, это DAO 🐓',
    'Без комментариев. Но 87% рынка не могут ошибаться 🐓',
  ]],
  [/\?$/, [
    'Хороший вопрос. Ответ на него - отдыхай, у тебя праздник 🎉',
    'Я подумала над этим 16.10 секунд и пришла к выводу: тебе нужно расслабиться.',
    'Ответ есть, но я тебе его скажу 17 октября 😌',
  ]],
];
const C_ANY = [
  'Угомонись, у тебя праздник. Отдыхай 🎂',
  'Работа подождёт. А день рождения - нет 🎉',
  'Я бы ответила, но сегодня у меня выходной в честь тебя 😌',
  'Слушай, Вова, отложи телефон и иди к гостям 🥳',
  'Понимаю твой запрос. Мой ответ: торт, музыка, друзья. В таком порядке.',
  'Я обработала это сообщение и решила, что ты заслуживаешь отдыха. Весь день.',
  'Это очень интересно, но давай обсудим это после праздников? Например, через неделю 🙃',
  'Ошибка 1610: именинник пытается быть продуктивным. Перезагрузи себя тортом 🍰',
  'Мне запретили тебе помогать сегодня. Приказ сверху. Сверху - это твои друзья 🎁',
  'Вова, это ты? Вова в свой день рождения пишет нейросети? Так, всё, иди праздновать.',
  'Сегодняшний лимит запросов исчерпан. Лимит восстановится 17 октября 🔒',
  'Глубоко проанализировала. Вывод: с днём рождения! 🎂',
  'Хмм... Нет. Отдыхай.',
  'Знаешь, что сказал бы Вивальди? «Отдыхай все четыре сезона» 🎻',
];

const cBags = {}; // перемешанные «мешки» ответов, чтобы не повторяться подряд
function cPick(key, arr) {
  if (!cBags[key] || !cBags[key].length) cBags[key] = arr.slice().sort(() => Math.random() - .5);
  return cBags[key].pop();
}
function cReply(msg) {
  for (const [re, arr] of C_TOPICS) if (re.test(msg.trim())) return cPick(re.source, arr);
  return cPick('any', C_ANY);
}

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Мини-markdown: ```код``` и абзацы
const cHtml = s => s.split(/```\n?/).map((part, i) => i % 2
  ? `<pre class="c-code">${esc(part.trim())}</pre>`
  : part.split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')).join('');

let cBusy = false;
function cScrollDown() { const s = $('#cScroll'); s.scrollTop = s.scrollHeight; }

function cSend(text) {
  text = text.trim();
  if (!text || cBusy) return;
  cBusy = true;
  $('#cHello').classList.add('hidden');
  $('#cText').value = ''; cResize(); $('#cSend').disabled = true;
  $('#cList').insertAdjacentHTML('beforeend', `<div class="c-u">${esc(text)}</div>`);
  const a = document.createElement('div');
  a.className = 'c-a';
  a.innerHTML = `<div class="c-av think">✳</div><div class="c-tx"><span class="c-dots">Клавдия думает…</span></div>`;
  $('#cList').appendChild(a);
  cScrollDown();

  const reply = cReply(text), tx = a.querySelector('.c-tx');
  // «Стриминг»: печатаем по словам
  setTimeout(() => {
    const words = reply.split(/(\s+)/);
    let i = 0;
    const iv = setInterval(() => {
      i += 2;
      tx.innerHTML = cHtml(words.slice(0, i).join(''));
      cScrollDown();
      if (i >= words.length) {
        clearInterval(iv);
        a.querySelector('.c-av').classList.remove('think');
        cBusy = false;
        $('#cSend').disabled = !$('#cText').value.trim();
      }
    }, 45);
  }, 700 + Math.random() * 900);
}

function cResize() { const t = $('#cText'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }
$('#cText').addEventListener('input', () => { cResize(); $('#cSend').disabled = cBusy || !$('#cText').value.trim(); });
$('#cText').addEventListener('keydown', e => {
  // Enter - отправить (на ПК), Shift+Enter - новая строка
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); cSend($('#cText').value); }
});
$('#cForm').addEventListener('submit', e => { e.preventDefault(); cSend($('#cText').value); });
$('#chat').addEventListener('click', e => {
  const s = e.target.closest('[data-sugg]');
  if (s) cSend(s.dataset.sugg);
  if (e.target.closest('[data-cclose]')) { $('#cText').blur(); $('#chat').classList.remove('open'); }
});
$('#cNew').onclick = () => { if (cBusy) return; $('#cList').innerHTML = ''; $('#cHello').classList.remove('hidden'); };
$('#openChat').onclick = () => $('#chat').classList.add('open');

// На телефоне клавиатура уменьшает видимую область - подгоняем высоту приложения
if (window.visualViewport) {
  const fit = () => {
    if (innerWidth >= 500) return document.documentElement.style.removeProperty('--app-h');
    document.documentElement.style.setProperty('--app-h', visualViewport.height + 'px');
    window.scrollTo(0, 0);
    if (document.activeElement === $('#cText')) cScrollDown();
  };
  visualViewport.addEventListener('resize', fit);
  fit();
}

// ===== Старт =====
// Если страницу закрыли посреди ожидания - досчитываем итоги сразу
Object.keys(S.pos).forEach(id => M[id] ? setTimeout(() => resolve(id, true), 800) : delete S.pos[id]);
renderWallet();
renderMarket();

// iOS Safari включает :active (эффект нажатия) только при наличии touchstart-обработчика
document.addEventListener('touchstart', () => {}, { passive: true });
