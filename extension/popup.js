(() => {
  const D = self.VG_DEFAULTS;
  const CFG = self.VG_CONFIG || {};
  const SCOPED = new Set(self.VG_SCOPED);
  const t = self.vgT;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const store = chrome.storage.local;
  const norm = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

  const SLIDERS = {
    pageSliders: [
      { key: 'spread', label: 's_spread', hint: 's_spread_hint', min: 0, max: 60, step: 1, unit: '%' },
      { key: 'feather', label: 's_feather', hint: 's_feather_hint', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'radius', label: 's_radius', min: 0, max: 50, step: 1, unit: '%', show: (s) => s.shape === 'rounded' }
    ],
    dimSliders: [
      { key: 'dimLevel', label: 's_dim', min: 10, max: 95, step: 5, unit: '%', show: (s) => s.dim }
    ],
    pauseSliders: [
      { key: 'pauseDelay', label: 's_pause_delay', min: 1, max: 60, step: 1, unitKey: 'u_sec',
        show: (s) => s.pauseMode === 'delay' || (!s.fsSame && s.fsPauseMode === 'delay') }
    ],
    fsSliders: [
      { key: 'fsBlur', label: 's_blur', min: 0, max: 120, step: 1, unit: ' px' },
      { key: 'fsOpacity', label: 's_opacity', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'fsSaturation', label: 's_saturation', min: 0, max: 250, step: 5, unit: '%' },
      { key: 'fsBrightness', label: 's_brightness', min: 40, max: 200, step: 5, unit: '%' },
      { key: 'fsFadeMs', label: 's_fade', min: 0, max: 3000, step: 50, unitKey: 'u_ms' }
    ],
    lookSliders: [
      { key: 'blur', label: 's_blur', min: 0, max: 120, step: 1, unit: ' px' },
      { key: 'sample', label: 's_sample', hint: 's_sample_hint', min: 8, max: 256, step: 8, unit: ' px' },
      { key: 'opacity', label: 's_opacity', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'saturation', label: 's_saturation', min: 0, max: 250, step: 5, unit: '%' },
      { key: 'brightness', label: 's_brightness', min: 40, max: 200, step: 5, unit: '%' },
      { key: 'fadeMs', label: 's_fade', hint: 's_fade_hint', min: 0, max: 3000, step: 50, unitKey: 'u_ms' }
    ],
    advSliders: [
      { key: 'minWidth', label: 's_minwidth', hint: 's_minwidth_hint', min: 0, max: 800, step: 10, unit: ' px' }
    ]
  };

  const PRESETS = {
    soft:   { spread: 22, feather: 80, blur: 50, opacity: 70,  saturation: 110, brightness: 100, shape: 'rounded', radius: 30, seamless: true },
    cinema: { spread: 14, feather: 60, blur: 36, opacity: 85,  saturation: 115, brightness: 100, shape: 'rounded', radius: 22, seamless: true },
    neon:   { spread: 26, feather: 40, blur: 24, opacity: 100, saturation: 190, brightness: 120, shape: 'rounded', radius: 40, seamless: true },
    exact:  { spread: 12, feather: 70, blur: 30, opacity: 90,  saturation: 100, brightness: 100, shape: 'rect',    radius: 0,  seamless: true }
  };

  // Вид индикатора статуса для каждой причины.
  const STATUS_KIND = {
    ok: 'ok', paused: 'info', offscreen: 'info', pip: 'info', otherfs: 'info',
    small: 'warn', hidden: 'warn', novideo: 'warn',
    site: 'off', disabled: 'off', pageoff: 'off', fsoff: 'off', useroff: 'off'
  };

  let raw = Object.assign({}, D);        // всё, что лежит в хранилище
  let host = '';                         // текущий сайт (пусто для служебных страниц)
  let siteMode = false;                  // редактируем настройки только этого сайта
  let state = Object.assign({}, D);      // то, что показываем (общие + настройки сайта)
  let statusTimer = 0;
  const sliders = [];
  const fmt = (def, v) => v + (def.unitKey ? t(def.unitKey) : def.unit);

  // Итоговые значения для показа.
  function compute() {
    state = self.VG_effective(raw, siteMode ? host : '');
  }

  // Сохраняет набор значений: в профиль сайта или в общие настройки.
  function saveMany(obj, cb) {
    const global = {};
    let profileChanged = false;
    const profiles = Object.assign({}, raw.siteProfiles);
    const prof = siteMode ? Object.assign({}, profiles[host]) : null;
    for (const k in obj) {
      state[k] = obj[k];
      if (siteMode && SCOPED.has(k)) { prof[k] = obj[k]; profileChanged = true; }
      else { global[k] = obj[k]; raw[k] = obj[k]; }
    }
    if (profileChanged) {
      profiles[host] = prof;
      raw.siteProfiles = profiles;
      global.siteProfiles = profiles;
    }
    store.set(global, cb);
    scheduleStatus();
  }
  const save = (key, val) => saveMany({ [key]: val });

  function addSlider(def, host) {
    const wrap = document.createElement('div');
    wrap.className = 'ctl';
    const top = document.createElement('div');
    top.className = 'top';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = t(def.label);
    const out = document.createElement('output');
    top.append(lbl, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = def.min; input.max = def.max; input.step = def.step;
    wrap.append(top, input);
    if (def.hint) {
      const h = document.createElement('div');
      h.className = 'hint';
      h.textContent = t(def.hint);
      wrap.append(h);
    }
    host.append(wrap);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = fmt(def, v);
      save(def.key, v);
      markPreset();
    });
    sliders.push({ input, out, def, wrap });
  }

  function buildPresets() {
    const el = $('#presets');
    Object.keys(PRESETS).forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.preset = id;
      b.textContent = t('preset_' + id);
      b.addEventListener('click', () => saveMany(PRESETS[id], render));
      el.append(b);
    });
  }

  function markPreset() {
    $$('.chip').forEach((b) => {
      const p = PRESETS[b.dataset.preset];
      b.classList.toggle('active', Object.keys(p).every((k) => state[k] === p[k]));
    });
  }

  function render() {
    for (const { input, out, def, wrap } of sliders) {
      input.value = state[def.key];
      out.textContent = fmt(def, state[def.key]);
      if (def.show) wrap.hidden = !def.show(state);
    }
    $$('input[type=checkbox][data-key]').forEach((el) => { el.checked = !!state[el.dataset.key]; });
    $$('select[data-key]').forEach((el) => { el.value = String(state[el.dataset.key]); });
    $$('.seg[data-key]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', b.dataset.v === state[seg.dataset.key]);
      });
    });
    $('#fsSame').checked = !!state.fsSame;
    $('#fsOwn').hidden = !!state.fsSame;
    $('#siteMode').checked = siteMode;
    $('#scopeReset').hidden = !siteMode;
    $('#scopeBadge').hidden = !siteMode;
    document.body.classList.toggle('site-mode', siteMode);
    markPreset();
  }

  function bind() {
    $$('input[type=checkbox][data-key]').forEach((el) => {
      el.addEventListener('change', () => { save(el.dataset.key, el.checked); render(); });
    });
    $$('select[data-key]').forEach((el) => {
      el.addEventListener('change', () => {
        save(el.dataset.key, el.dataset.type === 'number' ? Number(el.value) : el.value);
        render();
      });
    });
    $$('.seg[data-key]').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        save(seg.dataset.key, b.dataset.v);
        render();
      });
    });

    // «как на странице» / свои значения для полного экрана
    $('#fsSame').addEventListener('change', (e) => {
      if (e.target.checked) { save('fsSame', true); }
      else {
        // начинаем со значений страницы, чтобы ничего не «прыгнуло»
        const o = { fsSame: false };
        for (const k in self.VG_FS_MAP) o[self.VG_FS_MAP[k]] = state[k];
        saveMany(o);
      }
      render();
    });

    $('#reset').addEventListener('click', () => {
      if (siteMode) { resetSite(); return; }
      const next = {};
      for (const k of SCOPED) next[k] = D[k];
      saveMany(next, render);
    });
    $('#scopeReset').addEventListener('click', resetSite);
    $('#openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
    if (CFG.DONATE_URL) {
      const d = $('#donate');
      d.hidden = false;
      d.addEventListener('click', () => chrome.tabs.create({ url: CFG.DONATE_URL }));
    }
  }

  // Сбросить настройки сайта к общим (режим «только этот сайт» остаётся включённым).
  function resetSite() {
    const profiles = Object.assign({}, raw.siteProfiles);
    profiles[host] = {};
    raw.siteProfiles = profiles;
    store.set({ siteProfiles: profiles }, () => { compute(); render(); scheduleStatus(); });
  }

  // ── переключатели для текущего сайта ──
  function setupSite() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      try { host = norm(new URL(tabs[0].url).hostname); } catch (e) { host = ''; }
      if (!host) { $('#site').hidden = true; $('#scope').hidden = true; return; }

      $('#siteOffText').textContent = t('p_site_off', host);
      $('#siteModeText').textContent = t('p_scope_site', host);
      const cb = $('#siteOff');
      const list = () => (raw.disabledHosts || []).map(norm);
      cb.checked = list().includes(host);
      cb.addEventListener('change', () => {
        const next = list().filter((h) => h !== host);
        if (cb.checked) next.push(host);
        raw.disabledHosts = next;
        store.set({ disabledHosts: next });
        scheduleStatus();
      });

      siteMode = !!(raw.siteProfiles && raw.siteProfiles[host]);
      compute();
      render();

      $('#siteMode').addEventListener('change', (e) => {
        const profiles = Object.assign({}, raw.siteProfiles);
        if (e.target.checked) profiles[host] = profiles[host] || {};
        else delete profiles[host];
        siteMode = e.target.checked;
        raw.siteProfiles = profiles;
        store.set({ siteProfiles: profiles }, () => { compute(); render(); scheduleStatus(); });
      });
    });
  }

  // ── статус: что происходит на текущей вкладке ──
  function showStatus(kind, key, noteKey) {
    $('#status').dataset.kind = kind;
    $('#statusText').textContent = t(key);
    const note = $('#statusNote');
    note.textContent = noteKey ? t(noteKey) : '';
    note.hidden = !noteKey;
  }

  function refreshStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const url = (tab && tab.url) || '';
      if (!tab || !/^(https?|file):/.test(url)) { showStatus('off', 'st_unsupported'); return; }
      chrome.tabs.sendMessage(tab.id, { type: 'vg:status' }, (res) => {
        if (chrome.runtime.lastError || !res) { showStatus('info', 'st_none'); return; }
        showStatus(STATUS_KIND[res.why] || 'info', 'st_' + res.why,
          res.readable === false ? 'st_unreadable' : '');
      });
    });
  }

  function scheduleStatus() {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(refreshStatus, 350);
  }

  store.get(D, (res) => {
    raw = Object.assign({}, D, res);
    if (!raw.siteProfiles || typeof raw.siteProfiles !== 'object') raw.siteProfiles = {};
    compute();
    self.vgApplyI18n();
    for (const id in SLIDERS) SLIDERS[id].forEach((d) => addSlider(d, $('#' + id)));
    buildPresets();
    bind();
    render();
    setupSite();
    refreshStatus();
  });
})();
