// ===== ViJumpAss - мини-игра в стиле Doodle Jump =====
// Отдельно от балансов кошелька. Использует $, toast, confetti из app.js.
(() => {
  const cv = $('#gCv'), ctx = cv.getContext('2d');
  const BEST_KEY = 'vova-jump-best';

  // Физика (в «кадрах» по 1/60 сек)
  const GRAV = .36, JUMP = -11.6, SPRING = -19, PW = 62, PH = 12, FEET = 18;
  const SCORE_DIV = 3;      // пикселей высоты на 1 «метр»
  const BDAY_SCORE = 1610;  // пасхалка

  let W = 0, H = 0, G = null;
  let running = false, paused = false, raf = 0, last = 0;
  const keys = { L: 0, R: 0 }, ptrs = new Map();
  let tiltOn = false, tilt = null;

  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + .4, p: Math.random() * .2 + .03 }));

  const MSG = {
    mon: ['Тебя ректанули 💀', 'Рект отобрал всё. Классика.', 'Ликвидирован ректом. Бывает.', 'Надо было топтать сверху 👻'],
    fall: ['Упал как биток в 2022 📉', 'Холдил до нуля. Респект.', 'Гравитация - главный медведь рынка 🐻', 'Слишком рано зафиксировал убыток'],
  };

  // ---------- утилиты ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const best = () => +localStorage.getItem(BEST_KEY) || 0;
  const score = () => Math.floor(G.maxH / SCORE_DIV);

  function resize() {
    const r = $('#gWrap').getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- новая партия ----------
  function newGame() {
    const y0 = H - 40;
    G = {
      p: { x: W / 2, y: y0 - FEET, vx: 0, vy: JUMP, dir: 1, squash: 0, dead: false, spin: 0 },
      y0, cam: 0, maxH: 0, genY: y0, lastMon: y0,
      plats: [{ x: W / 2 - PW / 2, y: y0, w: PW, t: 'n' }], coins: [], mons: [], fx: [], texts: [],
      btc: 0, eth: 0, kills: 0, bday: false, over: null, t: 0,
    };
    gen();
  }

  // Генерация уровня выше камеры
  function gen() {
    while (G.genY > G.cam - 200) {
      const h = G.y0 - G.genY, d = Math.min(1, h / 9000);
      const gap = rnd(48, 78 + d * 78); // максимум ~156 < высоты прыжка (~187)
      G.genY -= gap;
      const moving = Math.random() < .08 + d * .27;
      const pl = { x: rnd(0, W - PW), y: G.genY, w: PW, t: moving ? 'm' : 'n', vx: moving ? (Math.random() < .5 ? -1 : 1) * rnd(.8, 1.2 + d * 1.4) : 0 };
      if (!moving && h > 300 && Math.random() < .07) pl.spring = true;
      G.plats.push(pl);
      // Ломкие красные свечи - лишние, основной путь не перекрывают
      if (Math.random() < .12 + d * .2) G.plats.push({ x: rnd(0, W - PW), y: G.genY - gap * .5, w: PW, t: 'b' });
      if (Math.random() < .32) G.coins.push({ x: Math.min(W - 16, Math.max(16, pl.x + PW / 2 + rnd(-30, 30))), y: pl.y - rnd(45, 85), k: Math.random() < .7 ? 'btc' : 'eth', a: rnd(0, 6) });
      // Ректы - с высоты, не слишком часто
      if (h > 1400 && G.genY < G.lastMon - 520 && Math.random() < .06 + d * .1) {
        G.lastMon = G.genY;
        const x0 = rnd(50, W - 50);
        G.mons.push({ x0, x: x0, y: G.genY - gap * .5, ph: rnd(0, 6), amp: rnd(20, 60), alive: true, vy: 0 });
      }
    }
  }

  function addText(x, y, s, c, big) { G.texts.push({ x, y, s, c, life: 1, big }); }
  function burst(x, y, c, n = 10) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(1.5, 4); G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c, life: 1 }); }
  }

  function die(kind) {
    const p = G.p;
    if (p.dead) return;
    p.dead = true; G.over = kind;
    p.vy = Math.min(p.vy, -6); p.vx = 0;
    if (navigator.vibrate) navigator.vibrate(120);
  }

  // ---------- шаг симуляции ----------
  function step(dt) {
    const p = G.p;
    G.t += dt;
    const dir = (keys.R - keys.L) || [...ptrs.values()].pop() || (tiltOn && tilt) || 0;
    if (!p.dead) {
      p.vx += (dir * 6.4 - p.vx) * Math.min(1, .25 * dt);
      if (Math.abs(dir) > .15) p.dir = dir > 0 ? 1 : -1;
    }
    p.x += p.vx * dt;
    if (p.x < -20) p.x += W + 40;
    if (p.x > W + 20) p.x -= W + 40;
    const prevB = p.y + FEET;
    p.vy += GRAV * dt;
    p.y += p.vy * dt;
    p.squash = Math.max(0, p.squash - .07 * dt);
    if (p.dead) p.spin += .18 * dt;

    for (const pl of G.plats) {
      if (pl.t === 'm') {
        pl.x += pl.vx * dt;
        if (pl.x < 0 || pl.x > W - pl.w) { pl.vx *= -1; pl.x = Math.max(0, Math.min(W - pl.w, pl.x)); }
      }
      if (pl.broken) { pl.vy += GRAV * dt; pl.y += pl.vy * dt; pl.rot += .05 * dt; continue; }
      if (pl.sprung) pl.sprung = Math.max(0, pl.sprung - .05 * dt);
      if (p.dead || p.vy <= 0) continue;
      const b = p.y + FEET;
      if (prevB <= pl.y + 2 && b >= pl.y && p.x + 13 > pl.x && p.x - 13 < pl.x + pl.w) {
        if (pl.t === 'b') { pl.broken = true; pl.vy = 0; pl.rot = 0; burst(pl.x + pl.w / 2, pl.y, '#f6465d', 6); continue; }
        p.y = pl.y - FEET; p.squash = 1;
        if (pl.spring) { p.vy = SPRING; pl.sprung = 1; addText(p.x, p.y - 30, 'PUMP! 🚀', '#fcd535'); }
        else p.vy = JUMP;
      }
    }

    for (const c of G.coins) {
      if (c.got || p.dead) continue;
      if (Math.abs(c.x - p.x) < 26 && Math.abs(c.y - p.y) < 30) {
        c.got = true; G[c.k]++;
        burst(c.x, c.y, c.k === 'btc' ? '#f7931a' : '#8fa4ff', 8);
        addText(c.x, c.y - 10, c.k === 'btc' ? '+₿' : '+Ξ', c.k === 'btc' ? '#f7931a' : '#8fa4ff');
      }
    }

    for (const m of G.mons) {
      if (!m.alive) { m.vy += GRAV * dt; m.y += m.vy * dt; continue; }
      m.ph += .03 * dt;
      m.x = m.x0 + Math.sin(m.ph) * m.amp;
      if (p.dead) continue;
      const dx = p.x - m.x, dy = p.y - m.y;
      if (Math.abs(dx) < 34 && Math.abs(dy) < 34) {
        if (p.vy > 0 && dy < -8) {
          m.alive = false; m.vy = -3; p.vy = -13; p.squash = 1; G.kills++;
          burst(m.x, m.y, '#f6465d', 14);
          addText(m.x, m.y - 20, 'Рект ректанут 😎', '#0ecb81');
        } else die('mon');
      }
    }

    // Камера едет только вверх
    if (!p.dead && p.y - G.cam < H * .38) G.cam = p.y - H * .38;
    G.maxH = Math.max(G.maxH, G.y0 - FEET - p.y);
    if (!G.bday && score() >= BDAY_SCORE) {
      G.bday = true;
      addText(W / 2, G.cam + H * .3, '🎂 1610! С ДР, Вова!', '#fcd535', true);
      confetti(2500);
    }

    for (const f of G.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += .15 * dt; f.life -= .03 * dt; }
    for (const t of G.texts) { t.y -= (t.big ? .3 : .8) * dt; t.life -= (t.big ? .008 : .02) * dt; }

    // Чистим всё, что ушло ниже экрана
    const lim = G.cam + H + 120;
    G.plats = G.plats.filter(o => o.y < lim);
    G.coins = G.coins.filter(o => o.y < lim && !o.got);
    G.mons = G.mons.filter(o => o.y < lim);
    G.fx = G.fx.filter(o => o.life > 0);
    G.texts = G.texts.filter(o => o.life > 0);
    gen();

    if (p.y - G.cam > H + 60) end(G.over || 'fall');
  }

  // ---------- отрисовка ----------
  function drawBg() {
    const k = Math.min(1, G.maxH / 15000);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix('#1b1f4b', '#05030f', k));
    g.addColorStop(1, mix('#3b2d6b', '#120b2e', k));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Звёзды (параллакс)
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      const y = ((s.y * H - G.cam * s.p) % H + H) % H;
      ctx.globalAlpha = .25 + s.p * 3 + k * .2;
      ctx.fillRect(s.x * W, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // Луна проявляется с высотой
    const ma = Math.min(1, G.maxH / 6000);
    if (ma > 0) {
      ctx.globalAlpha = ma;
      const mx = W - 70, my = 110;
      ctx.fillStyle = '#f4f1c9'; ctx.beginPath(); ctx.arc(mx, my, 42, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ddd8a8';
      [[-14, -8, 8], [10, 10, 6], [12, -14, 4], [-6, 16, 5]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(mx + x, my + y, r, 0, 6.28); ctx.fill(); });
      ctx.globalAlpha = 1;
    }

    // Фоновый «график», уходящий вверх
    ctx.strokeStyle = 'rgba(14,203,129,.10)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let sy = -20; sy <= H + 20; sy += 24) {
      const wy = sy + G.cam * .5;
      const x = W * .5 + Math.sin(wy * .011) * W * .28 + Math.sin(wy * .047) * 24;
      sy === -20 ? ctx.moveTo(x, sy) : ctx.lineTo(x, sy);
    }
    ctx.stroke();
  }

  function drawPlat(pl) {
    const x = pl.x, y = pl.y - G.cam;
    if (y < -30 || y > H + 30) return;
    const col = pl.t === 'b' ? '#f6465d' : pl.t === 'm' ? '#33b5ff' : '#0ecb81';
    ctx.save();
    if (pl.broken) { ctx.translate(x + pl.w / 2, y); ctx.rotate(pl.rot); ctx.translate(-x - pl.w / 2, -y); ctx.globalAlpha = .7; }
    // Фитиль свечи
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + pl.w / 2, y - 7); ctx.lineTo(x + pl.w / 2, y + PH + 7); ctx.stroke();
    // Тело свечи
    ctx.fillStyle = col; rr(x, y, pl.w, PH, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(x + 3, y + 2, pl.w - 6, 3, 1.5); ctx.fill();
    if (pl.t === 'b') {
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + pl.w * .45, y); ctx.lineTo(x + pl.w * .52, y + 6); ctx.lineTo(x + pl.w * .47, y + PH); ctx.stroke();
    }
    if (pl.t === 'm') {
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = 'bold 9px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('◂ ▸', x + pl.w / 2, y + 10);
    }
    ctx.restore();
    if (pl.spring) {
      ctx.save();
      ctx.translate(x + pl.w / 2 + 14, y - 12 - (pl.sprung || 0) * 8);
      ctx.font = '18px system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.rotate(-.78); ctx.fillText('🚀', 0, 0);
      ctx.restore();
    }
  }

  function drawCoin(c) {
    const y = c.y - G.cam + Math.sin(G.t * .08 + c.a) * 3;
    if (y < -20 || y > H + 20) return;
    const sx = Math.max(.15, Math.abs(Math.cos(G.t * .05 + c.a)));
    ctx.save(); ctx.translate(c.x, y); ctx.scale(sx, 1);
    const btc = c.k === 'btc';
    ctx.fillStyle = btc ? '#f7931a' : '#627eea';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.28); ctx.fill();
    ctx.strokeStyle = btc ? '#ffc067' : '#a9b8ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(btc ? '₿' : 'Ξ', 0, 1);
    ctx.restore();
  }

  function drawMon(m) {
    const y = m.y - G.cam;
    if (y < -40 || y > H + 40) return;
    ctx.save(); ctx.translate(m.x, y);
    if (!m.alive) { ctx.rotate(G.t * .1); ctx.globalAlpha = .6; }
    const wob = Math.sin(G.t * .15) * 2;
    // Тело-привидение
    ctx.fillStyle = '#f6465d';
    ctx.beginPath();
    ctx.moveTo(-24, 14); ctx.lineTo(-24, 0); ctx.arc(0, 0, 24, Math.PI, 0); ctx.lineTo(24, 14);
    for (let i = 0; i < 4; i++) { const x1 = 24 - i * 12; ctx.quadraticCurveTo(x1 - 3, 22 + wob * (i % 2 ? 1 : -1), x1 - 6, 14); ctx.quadraticCurveTo(x1 - 9, 6, x1 - 12, 14); }
    ctx.closePath(); ctx.fill();
    // Глаза следят за петушком
    const look = m.alive && G ? Math.max(-2, Math.min(2, (G.p.x - m.x) / 40)) : 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-8, -5, 6, 0, 6.28); ctx.arc(8, -5, 6, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#1b1f4b';
    ctx.beginPath(); ctx.arc(-8 + look, -4, 3, 0, 6.28); ctx.arc(8 + look, -4, 3, 0, 6.28); ctx.fill();
    // Злые брови
    ctx.strokeStyle = '#7a0f1c'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-3, -10); ctx.moveTo(14, -14); ctx.lineTo(3, -10); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 9px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('REKT', 0, 8);
    ctx.restore();
  }

  // Усатый петушок. Смотрит вправо, dir = -1 - отражение.
  function drawRooster(c, x, y, dir, squash, spin, dead) {
    c.save(); c.translate(x, y);
    if (spin) c.rotate(spin);
    c.scale(dir * (1 + squash * .12), 1 - squash * .16);
    c.lineCap = 'round'; c.lineJoin = 'round';
    // Хвост
    [['#1abc9c', -.9], ['#2c3e70', -.5], ['#e67e22', -.15]].forEach(([col, a]) => {
      c.save(); c.translate(-13, -2); c.rotate(a); c.fillStyle = col;
      c.beginPath(); c.ellipse(-8, 0, 11, 4.5, 0, 0, 6.28); c.fill(); c.restore();
    });
    // Лапы
    c.strokeStyle = '#f6b93b'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(-4, 11); c.lineTo(-5, FEET); c.lineTo(-9, FEET); c.moveTo(4, 11); c.lineTo(5, FEET); c.lineTo(9, FEET); c.stroke();
    // Тело и крыло
    c.fillStyle = '#fff7e6'; c.strokeStyle = '#d9c39a'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 2, 15, 13, 0, 0, 6.28); c.fill(); c.stroke();
    c.fillStyle = '#eedcb8'; c.beginPath(); c.ellipse(-3, 4, 9, 6, -.3, 0, 6.28); c.fill();
    // Гребешок
    c.fillStyle = '#e3342f';
    [[6, -19, 4], [10.5, -21, 4.5], [15, -19, 3.8]].forEach(([a, b, r]) => { c.beginPath(); c.arc(a, b, r, 0, 6.28); c.fill(); });
    // Голова
    c.fillStyle = '#fff7e6'; c.strokeStyle = '#d9c39a';
    c.beginPath(); c.arc(10, -11, 8.5, 0, 6.28); c.fill(); c.stroke();
    // Клюв и серёжка
    c.fillStyle = '#f6b93b'; c.beginPath(); c.moveTo(17, -13); c.lineTo(25, -10); c.lineTo(17, -7.5); c.closePath(); c.fill();
    c.fillStyle = '#e3342f'; c.beginPath(); c.ellipse(16, -2.5, 2.4, 3.8, 0, 0, 6.28); c.fill();
    // Глаз
    if (dead) {
      c.strokeStyle = '#222'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(10, -15); c.lineTo(14, -11); c.moveTo(14, -15); c.lineTo(10, -11); c.stroke();
    } else {
      c.fillStyle = '#222'; c.beginPath(); c.arc(12, -13, 2.2, 0, 6.28); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(12.8, -13.8, .8, 0, 6.28); c.fill();
    }
    // УСЫ - главная деталь
    // Пышные усы-«руль» с закрученными кончиками
    c.fillStyle = '#1a1a1a'; c.strokeStyle = '#1a1a1a';
    c.beginPath();
    c.moveTo(18.5, -9);
    c.bezierCurveTo(15, -2, 8, -1, 5, -6);   // левый ус: низ
    c.bezierCurveTo(9, -4, 14, -5, 18.5, -9); // левый ус: верх
    c.moveTo(18.5, -9);
    c.bezierCurveTo(22, -2, 29, -1, 32, -6);
    c.bezierCurveTo(28, -4, 23, -5, 18.5, -9);
    c.fill();
    c.lineWidth = 2.2;
    c.beginPath(); c.arc(6.2, -8.2, 2.4, Math.PI * .6, Math.PI * 2.2); c.stroke();
    c.beginPath(); c.arc(30.8, -8.2, 2.4, Math.PI * .4, -Math.PI * 1.2, true); c.stroke();
    c.restore();
  }

  function draw() {
    drawBg();
    G.plats.forEach(drawPlat);
    G.coins.forEach(drawCoin);
    G.mons.forEach(drawMon);
    const p = G.p;
    drawRooster(ctx, p.x, p.y - G.cam, p.dir, p.squash, p.spin, p.dead);
    // Если петушок у края - рисуем «призрака» с другой стороны (бесшовный переход)
    if (p.x < 30) drawRooster(ctx, p.x + W + 40, p.y - G.cam, p.dir, p.squash, p.spin, p.dead);
    if (p.x > W - 30) drawRooster(ctx, p.x - W - 40, p.y - G.cam, p.dir, p.squash, p.spin, p.dead);
    for (const f of G.fx) { ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - G.cam - 2, 4, 4); }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = `900 ${t.big ? 26 : 16}px system-ui,sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText(t.s, t.x, t.y - G.cam);
      ctx.fillStyle = t.c; ctx.fillText(t.s, t.x, t.y - G.cam);
    }
    ctx.globalAlpha = 1;
  }

  // HUD меняем только когда числа изменились
  const hudLast = {};
  function hud() {
    const v = { gScore: score(), gBtc: G.btc, gEth: G.eth };
    for (const k in v) if (hudLast[k] !== v[k]) { hudLast[k] = v[k]; document.getElementById(k).textContent = v[k]; }
  }

  // ---------- цикл ----------
  function loop(t) {
    raf = requestAnimationFrame(loop);
    let dt = Math.min((t - last) / 16.667, 4);
    last = t;
    if (paused || !running) return;
    while (dt > 0 && running) { const s = Math.min(dt, 1); step(s); dt -= s; }
    draw(); hud();
  }

  function start() {
    resize(); newGame();
    ['gStart', 'gOver', 'gPaused'].forEach(id => $('#' + id).classList.add('hidden'));
    running = true; paused = false; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function end(kind) {
    running = false;
    cancelAnimationFrame(raf);
    draw();
    const s = score(), b = best(), rec = s > b;
    if (rec) localStorage.setItem(BEST_KEY, s);
    const list = MSG[kind];
    $('#gOverT').textContent = kind === 'mon' ? 'REKT 💀' : 'Ликвидация 📉';
    $('#gOverS').textContent = list[Math.random() * list.length | 0];
    const usd = G.btc * 116100 + G.eth * 4200;
    $('#gRes').innerHTML = `
      <div>Высота<b>${s} м</b></div>
      <div class="rec">${rec ? '🏆 Новый рекорд!' : 'Рекорд'}<b>${Math.max(s, b)} м</b></div>
      <div>Биткоины<b>₿ ${G.btc}</b></div>
      <div>Эфир<b>Ξ ${G.eth}</b></div>
      <div class="wide">Собранный портфель<b>$${usd.toLocaleString('en-US')}</b></div>`;
    $('#gOver').classList.remove('hidden');
    if (rec && s > 50) confetti(2000);
  }

  function pause(on) {
    if (!running) return;
    paused = on;
    $('#gPaused').classList.toggle('hidden', !on);
    if (!on) last = performance.now();
  }

  function showStart() {
    resize(); newGame();
    G.p.vy = 0;
    draw();
    $('#gBest').textContent = best();
    $('#gHelp').textContent = matchMedia('(pointer:fine)').matches
      ? 'Управление: ← → или A / D'
      : 'Тапай по левой или правой половине экрана';
    ['gOver', 'gPaused'].forEach(id => $('#' + id).classList.add('hidden'));
    $('#gStart').classList.remove('hidden');
    // Герой на стартовом экране
    const h = $('#gHero'), hc = h.getContext('2d');
    hc.setTransform(1, 0, 0, 1, 0, 0); hc.clearRect(0, 0, h.width, h.height);
    hc.setTransform(3, 0, 0, 3, 100, 82);
    drawRooster(hc, 0, 0, 1, 0, 0, false);
  }

  // ---------- управление ----------
  // Тач/мышь: левая или правая половина экрана
  const wrap = $('#gWrap');
  const ptrDir = e => { const r = wrap.getBoundingClientRect(); return e.clientX - r.left < r.width / 2 ? -1 : 1; };
  wrap.addEventListener('pointerdown', e => {
    if (!running || paused || e.target !== cv) return;
    e.preventDefault();
    ptrs.set(e.pointerId, ptrDir(e));
  });
  wrap.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, ptrDir(e)); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => wrap.addEventListener(n, e => ptrs.delete(e.pointerId)));
  wrap.addEventListener('contextmenu', e => e.preventDefault());

  const isOpen = () => $('#game').classList.contains('open');
  document.addEventListener('keydown', e => {
    if (!isOpen()) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === 'ф') { keys.L = 1; e.preventDefault(); }
    else if (k === 'arrowright' || k === 'd' || k === 'в') { keys.R = 1; e.preventDefault(); }
    else if (k === 'escape' || k === 'p' || k === 'з') pause(!paused);
    else if ((k === ' ' || k === 'enter') && !running) { e.preventDefault(); start(); }
  });
  document.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a' || k === 'ф') keys.L = 0;
    if (k === 'arrowright' || k === 'd' || k === 'в') keys.R = 0;
  });

  // Наклон телефона (на iOS нужен запрос разрешения по нажатию)
  function onTilt(e) {
    if (e.gamma === null) return;
    const g = e.gamma / 20;
    tilt = Math.abs(g) < .08 ? 0 : Math.max(-1, Math.min(1, g));
  }
  $('#gTilt').onclick = async () => {
    if (tiltOn) {
      tiltOn = false; tilt = null;
      removeEventListener('deviceorientation', onTilt);
    } else {
      try {
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
          if (await DeviceOrientationEvent.requestPermission() !== 'granted') return toast('Без разрешения наклон не работает 🤷');
        }
        if (!('DeviceOrientationEvent' in window)) return toast('Тут нет гироскопа. Тапай по экрану 👆');
        addEventListener('deviceorientation', onTilt);
        tiltOn = true;
        setTimeout(() => { if (tiltOn && tilt === null) toast('Гироскоп молчит. Управляй тапами 👆'); }, 1500);
      } catch { toast('Не удалось включить наклон'); }
    }
    $('#gTilt').classList.toggle('on', tiltOn);
    $('#gTilt').textContent = '📱 Управление наклоном: ' + (tiltOn ? 'вкл' : 'выкл');
  };

  $('#gPlay').onclick = start;
  $('#gAgain').onclick = start;
  $('#gResume').onclick = () => pause(false);
  $('#gPauseBtn').onclick = () => pause(!paused);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
  addEventListener('resize', () => {
    if (!isOpen()) return;
    if (running) resize();
    else if (!$('#gStart').classList.contains('hidden')) showStart();
  });

  $('#openGame').onclick = () => {
    $('#game').classList.add('open');
    // Ждём, пока экран выедет, чтобы размеры canvas были верными
    setTimeout(showStart, 50);
  };
  $('#game').addEventListener('click', e => {
    if (!e.target.closest('[data-gclose]')) return;
    running = false; paused = false; cancelAnimationFrame(raf); ptrs.clear(); keys.L = keys.R = 0;
    $('#game').classList.remove('open');
  });

  // Для отладки из консоли
  window.__game = { get G() { return G; }, start, end };
})();
