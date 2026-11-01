// Живая демонстрация на главной: нарисованное «видео» (вечерний город у воды)
// и свечение вокруг него, которое берёт цвета из самой картинки, как расширение.
// Настройки повторяют простой попап 2.0: вкл/выкл, пресет, стиль, яркость, размер, цвет комнаты.
(() => {
  // ---------- Сцена ----------
  function VGScene(cv) {
    const W = cv.width, H = cv.height, g = cv.getContext('2d');
    const HZ = Math.round(H * 0.64);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const NEON = ['#ff4fa3', '#45e3ff', '#ffd25a', '#9b7bff', '#ff7a45'];
    // дома: силуэт с окнами
    const blds = [];
    for (let x = -10; x < W + 10;) {
      const w = 22 + rnd() * 46, h = H * (0.14 + rnd() * 0.36) * (Math.abs(x - W * 0.62) < W * 0.2 ? 1.25 : 1);
      const wins = [];
      for (let wy = HZ - h + 8; wy < HZ - 6; wy += 9) for (let wx = x + 5; wx < x + w - 6; wx += 8) {
        if (rnd() < 0.36) wins.push([wx, wy, NEON[(rnd() * 5) | 0], rnd() * 6.28, rnd() < 0.18]);
      }
      blds.push({ x, w, h, wins, sign: rnd() < 0.3 ? [NEON[(rnd() * 5) | 0], rnd() * 6.28] : null });
      x += w + 1 + rnd() * 5;
    }
    const cars = Array.from({ length: 9 }, () => [rnd() * W, 0.6 + rnd() * 1.4, rnd() < 0.5]);
    const stars = Array.from({ length: 60 }, () => [rnd() * W, rnd() * HZ * 0.6, rnd() * 6.28]);

    const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

    return function draw(t) {
      // медленная смена «времени суток»: закат ↔ неоновая ночь
      const k = (Math.sin(t / 7) + 1) / 2;
      const sky = g.createLinearGradient(0, 0, 0, HZ);
      sky.addColorStop(0, rgb(mix([28, 30, 110], [10, 8, 40], k)));
      sky.addColorStop(0.45, rgb(mix([120, 70, 200], [70, 20, 120], k)));
      sky.addColorStop(0.78, rgb(mix([235, 95, 125], [200, 40, 140], k)));
      sky.addColorStop(1, rgb(mix([255, 165, 80], [255, 90, 120], k)));
      g.fillStyle = sky; g.fillRect(0, 0, W, HZ);

      // цветные пятна по краям, чтобы свечение слева и справа было разным
      const side = (x, c, a) => {
        const r = g.createRadialGradient(x, HZ * 0.55, 0, x, HZ * 0.55, W * 0.45);
        r.addColorStop(0, `rgba(${c},${a})`); r.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = r; g.fillRect(0, 0, W, HZ);
      };
      side(0, '255,60,150', 0.35 + 0.25 * Math.sin(t * 0.9));
      side(W, '40,210,255', 0.35 + 0.25 * Math.cos(t * 0.7));

      g.fillStyle = '#fff';
      for (const s of stars) { g.globalAlpha = (1 - k * 0.2) * (0.25 + 0.35 * Math.sin(t * 2 + s[2])); g.fillRect(s[0], s[1], 1.4, 1.4); }
      g.globalAlpha = 1;

      // солнце садится и встаёт
      const sy = HZ - H * 0.2 + Math.sin(t / 7) * H * 0.1, sx = W * 0.3;
      const sun = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.3);
      sun.addColorStop(0, 'rgba(255,245,210,1)'); sun.addColorStop(0.18, 'rgba(255,200,110,.95)');
      sun.addColorStop(0.45, 'rgba(255,130,90,.35)'); sun.addColorStop(1, 'rgba(255,120,90,0)');
      g.fillStyle = sun; g.fillRect(0, 0, W, HZ);

      // город
      for (const b of blds) {
        g.fillStyle = '#0d0b1e'; g.fillRect(b.x, HZ - b.h, b.w, b.h);
        for (const w of b.wins) {
          const on = !w[4] || Math.sin(t * 1.3 + w[3]) > 0;
          if (!on) continue;
          g.globalAlpha = 0.55 + 0.45 * k; g.fillStyle = w[2]; g.fillRect(w[0], w[1], 3, 4);
        }
        g.globalAlpha = 1;
        if (b.sign) {
          const a = 0.5 + 0.5 * Math.sin(t * 2.4 + b.sign[1]);
          g.shadowColor = b.sign[0]; g.shadowBlur = 12 * a; g.fillStyle = b.sign[0];
          g.globalAlpha = 0.4 + 0.6 * a; g.fillRect(b.x + 4, HZ - b.h - 7, b.w - 8, 3);
          g.shadowBlur = 0; g.globalAlpha = 1;
        }
      }

      // вода с отражением
      const sea = g.createLinearGradient(0, HZ, 0, H);
      sea.addColorStop(0, rgb(mix([70, 40, 120], [40, 10, 80], k))); sea.addColorStop(1, '#07061a');
      g.fillStyle = sea; g.fillRect(0, HZ, W, H - HZ);
      for (let y = HZ + 3; y < H; y += 4) {
        const d = (y - HZ) / (H - HZ);
        g.globalAlpha = 0.5 * (1 - d);
        g.fillStyle = '#ffc77a';
        const ww = W * 0.1 * (1 - d * 0.5) * (0.7 + 0.3 * Math.sin(t * 3 + y));
        g.fillRect(sx - ww / 2 + Math.sin(t * 2 + y * 0.3) * 6, y, ww, 1.6);
      }
      // огни лодок/машин на набережной
      for (const c of cars) {
        c[0] = (c[0] + (c[2] ? 1 : -1) * c[1] * 0.9 + W) % W;
        g.globalAlpha = 0.9; g.fillStyle = c[2] ? '#ff5a6e' : '#fff3c4';
        g.fillRect(c[0], HZ + 2, 6, 2);
        g.globalAlpha = 0.25; g.fillRect(c[0], HZ + 6, 6, 10);
      }
      g.globalAlpha = 1;
    };
  }
  self.VGScene = VGScene;

  // ---------- Демонстрация на странице ----------
  const root = document.getElementById('demo');
  if (!root) return;
  const stage = root.querySelector('.demo-stage');
  const cv = root.querySelector('canvas.pic');
  const halo = root.querySelector('canvas.halo');
  const draw = VGScene(cv);
  const hg = halo.getContext('2d');
  const probe = document.createElement('canvas'); probe.width = 2; probe.height = 1;
  const pg = probe.getContext('2d', { willReadFrequently: true });

  // те же пресеты, что и в расширении (presets.js), только нужные для показа поля
  const PRESETS = {
    soft:   { spread: 22, blur: 50, opacity: 70, saturation: 110, radius: 30 },
    cinema: { spread: 14, blur: 36, opacity: 85, saturation: 115, radius: 22, dim: 55 },
    neon:   { spread: 26, blur: 24, opacity: 100, saturation: 190, radius: 40 },
    music:  { spread: 28, blur: 40, opacity: 100, saturation: 180, radius: 40, pulse: true },
    night:  { spread: 18, blur: 60, opacity: 55, saturation: 100, radius: 28, dim: 70 }
  };
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, raf = 0, last = 0, lastRoom = 0;
  const st = { on: true, preset: 'cinema', style: 'soft', bright: 100, size: 100, room: false };

  const ctl = (n) => root.querySelector(`[data-demo="${n}"]`);
  function apply() {
    const p = PRESETS[st.preset];
    const s = stage.style;
    const sz = st.size / 100;
    s.setProperty('--d-spread', (p.spread * 1.7 * sz).toFixed(1) + 'px');
    s.setProperty('--d-blur', Math.round(p.blur * (st.style === 'led' ? 0.25 : 0.9)) + 'px');
    s.setProperty('--d-alpha', st.on ? Math.min(1, (p.opacity / 100) * (st.bright / 100)).toFixed(2) : 0);
    s.setProperty('--d-sat', (p.saturation / 100).toFixed(2));
    s.setProperty('--d-radius', Math.round(p.radius * 0.7) + 'px');
    s.setProperty('--d-dim', st.on && p.dim ? (p.dim / 100).toFixed(2) : 0);
    stage.dataset.style = st.style;
    stage.classList.toggle('off', !st.on);
    stage.classList.toggle('pulse', st.on && !!p.pulse);
    root.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === st.preset)));
    root.querySelectorAll('[data-style]').forEach((b) => { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.style === st.style)); });
    ctl('on').checked = st.on;
    ctl('room').checked = st.room;
    if (!st.room) { s.removeProperty('--d-l'); s.removeProperty('--d-r'); }
    root.classList.toggle('is-off', !st.on);
    last = 0; lastRoom = 0; kick();
  }
  root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { st.preset = b.dataset.preset; apply(); }));
  root.querySelectorAll('button[data-style]').forEach((b) => b.addEventListener('click', () => { st.style = b.dataset.style; apply(); }));
  ctl('on').addEventListener('change', (e) => { st.on = e.target.checked; apply(); });
  ctl('room').addEventListener('change', (e) => { st.room = e.target.checked; apply(); });
  for (const n of ['bright', 'size']) {
    const r = ctl(n);
    const out = root.querySelector(`output[for="${r.id}"]`);
    const upd = () => {
      st[n] = +r.value;
      r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
      if (out) out.textContent = r.value + '%';
      apply();
    };
    r.addEventListener('input', upd); upd();
  }

  // цикл: рисуем ~30 к/с и только пока блок на экране
  const t0 = performance.now();
  function frame(now) {
    raf = 0;
    if (!visible) return;
    if (now - last >= 33) {
      last = now;
      const t = still.matches ? 9 : (now - t0) / 1000;
      draw(t);
      hg.drawImage(cv, 0, 0, halo.width, halo.height);
      if (st.room && st.on && now - lastRoom > 150) {
        lastRoom = now;
        pg.drawImage(cv, 0, 0, probe.width, probe.height);
        const d = pg.getImageData(0, 0, 2, 1).data;
        stage.style.setProperty('--d-l', `rgb(${d[0]} ${d[1]} ${d[2]} / .55)`);
        stage.style.setProperty('--d-r', `rgb(${d[4]} ${d[5]} ${d[6]} / .55)`);
      }
      if (still.matches) return;   // один кадр без анимации
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (visible && !raf) raf = requestAnimationFrame(frame); }
  let onscreen = !('IntersectionObserver' in window);
  const sync = () => { visible = onscreen && !document.hidden; kick(); };
  if (!onscreen) new IntersectionObserver(([e]) => { onscreen = e.isIntersecting; sync(); }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  if (still.addEventListener) still.addEventListener('change', () => { last = 0; kick(); });
  apply();
  sync();
})();
