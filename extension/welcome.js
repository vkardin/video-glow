self.vgApplyI18n();
document.title = self.vgT('w_title');
document.getElementById('open').addEventListener('click', () => chrome.runtime.openOptionsPage());
{
  const url = (self.VG_CONFIG || {}).DONATE_URL;
  const b = document.getElementById('donate');
  if (url) { b.hidden = false; b.addEventListener('click', () => chrome.tabs.create({ url })); }
}

// Шаг 1: живой пример — «кадр» меняет сцены, а свечение за ним берёт его цвета (как на настоящем видео).
{
  const demo = document.getElementById('demo');
  const pic = demo.querySelector('.pic').getContext('2d');
  const glow = demo.querySelector('.glow').getContext('2d');
  const SCENES = [   // небо, земля, солнце
    ['#ff8a3d', '#5a1d4a', '#ffd56b'], ['#1b6fd1', '#0b2a4a', '#bfe8ff'],
    ['#2f9e44', '#14361d', '#e9fac8'], ['#9c36b5', '#1d0b33', '#ff6bcb']
  ];
  const mix = (a, b, k) => {
    const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return 'rgb(' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k)).join(',') + ')';
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = (t) => {
    const n = SCENES.length, x = (t / 4000) % n, i = Math.floor(x), k = Math.min(1, (x - i) * 3);
    const a = SCENES[i], b = SCENES[(i + 1) % n];
    const g = pic.createLinearGradient(0, 0, 0, 180);
    g.addColorStop(0, mix(a[0], b[0], k)); g.addColorStop(1, mix(a[1], b[1], k));
    pic.fillStyle = g; pic.fillRect(0, 0, 320, 180);
    const sx = 60 + ((t / 30) % 200);
    pic.fillStyle = mix(a[2], b[2], k);
    pic.beginPath(); pic.arc(sx, 70, 26, 0, 7); pic.fill();
    glow.drawImage(pic.canvas, 0, 0, 32, 18);
    if (!reduce) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  // Шаг 2: выбор стиля сразу сохраняется
  const P = self.VG_presets;
  const btns = [...document.querySelectorAll('#styles button')];
  const mark = (st) => {
    btns.forEach((b) => b.classList.toggle('active', b.dataset.style === st));
    demo.className = 'demo ' + (st === 'led' ? 'led' : st === 'cinema' ? 'cinema' : '');
  };
  btns.forEach((b) => b.addEventListener('click', () => {
    const st = b.dataset.style;
    let set;
    if (st === 'auto') set = { autoPreset: true, glowStyle: 'soft' };
    else if (st === 'led') set = { autoPreset: false, glowStyle: 'led' };
    else set = Object.assign({}, P.defaultsOf(st), { autoPreset: false, glowStyle: 'soft' });
    chrome.storage.local.set(set);
    mark(st);
  }));
  chrome.storage.local.get({ autoPreset: false, glowStyle: 'soft' }, (r) => {
    mark(r.autoPreset ? 'auto' : r.glowStyle === 'led' ? 'led' : '');
  });
}

// Перенос с другого компьютера: файл из «Экспорт настроек» (тот же формат и та же проверка, что в настройках)
{
  const msg = document.getElementById('importMsg');
  const say = (key) => { msg.textContent = self.vgT(key); msg.hidden = false; };
  const file = document.getElementById('importFile');
  document.getElementById('importBtn').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const clean = self.VG_sanitizeBackup(JSON.parse(String(r.result)));
        if (!Object.keys(clean).length) throw new Error('empty');
        chrome.storage.local.set(clean, () => {
          say('o_import_ok');
          document.querySelectorAll('#styles button').forEach((b) => b.classList.toggle('active',
            b.dataset.style === (clean.autoPreset ? 'auto' : clean.glowStyle === 'led' ? 'led' : '')));
        });
      } catch (e) { say('o_import_err'); }
    };
    r.onerror = () => say('o_import_err');
    r.readAsText(f);
  });
}

// Доступ к сайтам: блок показываем, если он ещё не выдан (необязательные права в Chrome/Edge,
// либо пользователь отключил доступ в Firefox). Если уже выдан — блок скрыт.
{
  const box = document.getElementById('grant');
  const btn = document.getElementById('allow');
  const done = document.getElementById('granted');
  const refresh = () => chrome.permissions.contains({ origins: ['<all_urls>'] }, (ok) => {
    const wasShown = !box.hidden;
    box.hidden = !!ok && !wasShown;
    btn.hidden = !!ok;
    done.hidden = !ok;
  });
  btn.addEventListener('click', () => {
    chrome.permissions.request({ origins: ['<all_urls>'] }, refresh);   // нужен клик пользователя
  });
  refresh();
}
