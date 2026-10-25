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
    glowSliders: [
      { key: 'spread', label: 's_spread', hint: 's_spread_hint', min: 0, max: 60, step: 1, unit: '%' },
      { key: 'radius', label: 's_radius', min: 0, max: 50, step: 1, unit: '%', show: (s) => s.shape === 'rounded' },
      { key: 'opacity', label: 's_opacity', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'blur', label: 's_blur', min: 0, max: 120, step: 1, unit: ' px' }
    ],
    tuneSliders: [
      { key: 'feather', label: 's_feather', hint: 's_feather_hint', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'saturation', label: 's_saturation', min: 0, max: 250, step: 5, unit: '%' },
      { key: 'brightness', label: 's_brightness', min: 40, max: 200, step: 5, unit: '%' },
      { key: 'fadeMs', label: 's_fade', hint: 's_fade_hint', min: 0, max: 3000, step: 50, unitKey: 'u_ms' },
      { key: 'sample', label: 's_sample', hint: 's_sample_hint', min: 8, max: 256, step: 8, unit: ' px' }
    ],
    ledSliders: [
      { key: 'ledCount', label: 's_leds', min: 12, max: 120, step: 2, unit: '', show: (s) => s.glowStyle === 'led' }
    ],
    roomSliders: [
      { key: 'roomLevel', label: 's_room', min: 10, max: 100, step: 5, unit: '%', show: (s) => s.room }
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
    fsShapeSliders: [
      { key: 'fsSpread', label: 's_spread', hint: 's_spread_hint', min: 0, max: 60, step: 1, unit: '%' },
      { key: 'fsFeather', label: 's_feather', hint: 's_feather_hint', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'fsRadius', label: 's_radius', min: 0, max: 50, step: 1, unit: '%', show: (s) => s.fsShape === 'rounded' }
    ],
    advSliders: [
      { key: 'minWidth', label: 's_minwidth', hint: 's_minwidth_hint', min: 0, max: 800, step: 10, unit: ' px' }
    ],
    // ── Pro ──
    barSliders: [
      { key: 'barT', label: 's_bar_t', min: 0, max: 45, step: 0.5, unit: '%', show: (s) => s.barsMode === 'manual' },
      { key: 'barB', label: 's_bar_b', min: 0, max: 45, step: 0.5, unit: '%', show: (s) => s.barsMode === 'manual' },
      { key: 'barL', label: 's_bar_l', min: 0, max: 45, step: 0.5, unit: '%', show: (s) => s.barsMode === 'manual' },
      { key: 'barR', label: 's_bar_r', min: 0, max: 45, step: 0.5, unit: '%', show: (s) => s.barsMode === 'manual' }
    ],
    barsFillSliders: [
      { key: 'barsFill', label: 's_barsfill', hint: 's_barsfill_hint', min: 0, max: 100, step: 5, unit: '%', show: (s) => s.barsHide }
    ],
    guardSliders: [
      { key: 'guardStrength', label: 's_guard_strength', min: 20, max: 100, step: 5, unit: '%' }
    ],
    calmSliders: [
      { key: 'calm', label: 's_calm', hint: 's_calm_hint', min: 0, max: 100, step: 5, unit: '%' }
    ],
    sceneSliders: [
      { key: 'sceneAmount', label: 's_scene', min: 10, max: 100, step: 5, unit: '%' }
    ],
    pulseSliders: [
      { key: 'pulseAmount', label: 's_pulse', min: 10, max: 100, step: 5, unit: '%' }
    ],
    fxSliders: [
      { key: 'fxBrightness', label: 's_fx_brightness', min: 40, max: 200, step: 5, unit: '%', show: (s) => s.fxOn },
      { key: 'fxContrast', label: 's_fx_contrast', min: 40, max: 200, step: 5, unit: '%', show: (s) => s.fxOn },
      { key: 'fxSaturation', label: 's_fx_saturation', min: 0, max: 250, step: 5, unit: '%', show: (s) => s.fxOn },
      { key: 'fxSharp', label: 's_fx_sharp', hint: 's_fx_sharp_hint', min: 0, max: 100, step: 5, unit: '', show: (s) => s.fxOn },
      { key: 'fxWarmth', label: 's_fx_warmth', min: -100, max: 100, step: 5, unit: '', show: (s) => s.fxOn },
      { key: 'fxGamma', label: 's_fx_gamma', min: 50, max: 200, step: 5, unit: '%', show: (s) => s.fxOn }
    ],
    nightSliders: [
      { key: 'nightStrength', label: 's_night_strength', min: 10, max: 100, step: 5, unit: '%' }
    ]
  };

  // Пресеты фильтров видео (Pro)
  const FX_BASE = { fxOn: true, fxBrightness: 100, fxContrast: 100, fxSaturation: 100, fxSharp: 0, fxWarmth: 0, fxGamma: 100 };
  const FX_PRESETS = {
    clarity: Object.assign({}, FX_BASE, { fxSharp: 40, fxContrast: 110, fxSaturation: 105 }),
    cinema:  Object.assign({}, FX_BASE, { fxContrast: 112, fxSaturation: 108, fxWarmth: 12, fxGamma: 95, fxSharp: 15 }),
    vivid:   Object.assign({}, FX_BASE, { fxContrast: 118, fxSaturation: 140, fxSharp: 25 }),
    warm:    Object.assign({}, FX_BASE, { fxWarmth: 45, fxBrightness: 92 }),
    off:     Object.assign({}, FX_BASE, { fxOn: false })
  };

  const presetList = () => self.VG_presets.list(raw);

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
  let proInfo = { pro: false, kind: 'none', trialDays: 0 };
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
    el.textContent = '';
    presetList().forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.preset = p.id;
      b.textContent = p.builtin ? t(p.nameKey) : p.name;
      b.title = p.builtin ? '' : p.name;
      b.addEventListener('click', () => saveMany(Object.assign({}, p.values), render));
      el.append(b);
    });
  }

  function markPreset() {
    const lst = presetList();
    $$('#presets .chip').forEach((b) => {
      const p = lst.find((x) => x.id === b.dataset.preset);
      b.classList.toggle('active', !!p && Object.keys(p.values).every((k) => state[k] === p.values[k]));
    });
    $$('#fxPresets .chip').forEach((b) => {
      const p = FX_PRESETS[b.dataset.fx];
      b.classList.toggle('active', Object.keys(p).every((k) => state[k] === p[k]));
    });
  }

  function buildFxPresets() {
    const el = $('#fxPresets');
    Object.keys(FX_PRESETS).forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.fx = id;
      b.textContent = t('fx_' + id);
      b.addEventListener('click', () => saveMany(FX_PRESETS[id], render));
      el.append(b);
    });
  }

  function buildHours() {
    $$('select[data-hours]').forEach((sel) => {
      for (let h = 0; h < 24; h++) {
        const o = document.createElement('option');
        o.value = String(h);
        o.textContent = String(h).padStart(2, '0') + ':00';
        sel.append(o);
      }
    });
  }

  // Полоса «Pro»: состояние лицензии/пробного периода и замки на платных блоках.
  function renderPro() {
    proInfo = self.VG_proState(raw);
    const locked = !proInfo.pro;
    document.body.classList.toggle('locked', locked);
    $$('details.pro input, details.pro select, details.pro button').forEach((el) => { el.disabled = locked; });
    $('#proBadge').hidden = proInfo.kind !== 'license';
    const bar = $('#proBar');
    bar.hidden = proInfo.kind === 'license' || proInfo.kind === 'free';
    if (proInfo.kind === 'trial') {
      $('#proText').textContent = t('p_pro_trial', proInfo.trialDays);
      $('#proBtn').textContent = t('p_pro_key');
    } else if (proInfo.kind === 'none') {
      $('#proText').textContent = t('p_pro_locked');
      $('#proBtn').textContent = t('p_pro_get');
    }
  }

  function render() {
    for (const { input, out, def, wrap } of sliders) {
      input.value = state[def.key];
      self.vgFill(input);
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
    $('#qRoom').classList.toggle('on', !!state.room);
    $('#qLed').classList.toggle('on', state.glowStyle === 'led');
    $('#guardOpts').hidden = !state.guard;
    $('#pulseOpts').hidden = !state.pulse;
    $('#sceneOpts').hidden = !state.scene;
    $('#nightOpts').hidden = !state.nightOn;
    $('#fsSame').checked = !!state.fsSame;
    $('#fsOwn').hidden = !!state.fsSame;
    $('#fsShapeOwn').checked = !!state.fsShapeOwn;
    $('#fsShapeBox').hidden = !state.fsShapeOwn;
    $('#fsShapeNote').hidden = !state.fullscreenFill;
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

    // своя форма и размер рамки для полного экрана
    $('#fsShapeOwn').addEventListener('change', (e) => {
      if (!e.target.checked) { save('fsShapeOwn', false); }
      else {
        const o = { fsShapeOwn: true };
        for (const k in self.VG_FS_SHAPE_MAP) o[self.VG_FS_SHAPE_MAP[k]] = state[k];
        saveMany(o);
      }
      render();
    });

    $('#openPanel').addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (tab) {
          try { chrome.tabs.sendMessage(tab.id, { type: 'vg:panel', op: 'open' }, () => void chrome.runtime.lastError); } catch (er) { /* ignore */ }
        }
        window.close();
      });
    });

    $('#reset').addEventListener('click', () => {
      if (siteMode) { resetSite(); return; }
      const next = {};
      for (const k of SCOPED) next[k] = D[k];
      saveMany(next, render);
    });
    $('#scopeReset').addEventListener('click', resetSite);

    // мини-кнопки в закреплённой шапке
    $('#qRoom').addEventListener('click', () => { save('room', !state.room); render(); });
    $('#qLed').addEventListener('click', () => { save('glowStyle', state.glowStyle === 'led' ? 'soft' : 'led'); render(); });
    $('#qPanel').addEventListener('click', () => $('#openPanel').click());
    $('#qOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
    // сброс — в два нажатия, чтобы не сбросить случайно
    let qArm = 0;
    $('#qReset').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (!qArm) {
        b.classList.add('warn'); b.title = t('q_reset_confirm');
        qArm = setTimeout(() => { qArm = 0; b.classList.remove('warn'); b.title = t('q_reset'); }, 3000);
        return;
      }
      clearTimeout(qArm); qArm = 0; b.classList.remove('warn'); b.title = t('q_reset');
      $('#reset').click();
    });
    $('#openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
    // свои пресеты: сохранить текущий вид; редактировать — на странице настроек
    $('#presetSaveBtn').addEventListener('click', () => {
      const box = $('#presetSave');
      box.hidden = !box.hidden;
      if (!box.hidden) { $('#presetName').value = ''; $('#presetName').focus(); }
    });
    const savePreset = () => {
      const name = $('#presetName').value.trim() || t('preset_default_name');
      const list = (Array.isArray(raw.userPresets) ? raw.userPresets : []).slice();
      list.push({ id: self.VG_presets.newId(), name: name.slice(0, 40), values: self.VG_presets.snapshot(state) });
      raw.userPresets = list;
      store.set({ userPresets: list }, () => { buildPresets(); markPreset(); });
      $('#presetSave').hidden = true;
    };
    $('#presetOk').addEventListener('click', savePreset);
    $('#presetName').addEventListener('keydown', (e) => { if (e.key === 'Enter') savePreset(); });
    $('#presetEditBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#presets') });
      if (!document.body.classList.contains('panel')) window.close();
    });
    $('#proBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#pro') });
      window.close();
    });
    // ключ могли ввести на странице настроек, пока popup открыт
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.userPresets || changes.presetOverrides) {
        if (changes.userPresets) raw.userPresets = changes.userPresets.newValue || [];
        if (changes.presetOverrides) raw.presetOverrides = changes.presetOverrides.newValue || {};
        buildPresets(); markPreset();
      }
      let touched = false;
      for (const k of ['proValid', 'licenseKey', 'proId', 'installedAt']) {
        if (changes[k]) { raw[k] = changes[k].newValue === undefined ? D[k] : changes[k].newValue; touched = true; }
      }
      if (touched) { compute(); renderPro(); render(); renderPro(); }
    });
    if (CFG.SITE_URL) {
      const w = $('#site');
      w.hidden = false;
      w.addEventListener('click', () => chrome.tabs.create({ url: CFG.SITE_URL }));
    }
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
      if (!host) { $('#siteCard').hidden = true; return; }

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
        const note = res.guard ? 'st_guard' : res.readable === false ? 'st_unreadable' :
          res.pulse === 'nodata' ? 'st_pulse_nodata' : '';
        showStatus(STATUS_KIND[res.why] || 'info', 'st_' + res.why, note);
      });
    });
  }

  function scheduleStatus() {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(refreshStatus, 350);
  }

  // Режим «необязательные права»: пока доступ к сайтам не выдан, показываем кнопку.
  function setupPerm() {
    chrome.permissions.contains({ origins: ['<all_urls>'] }, (ok) => {
      if (ok) return;
      $('#perm').hidden = false;
      $('#status').hidden = true;
      $('#permBtn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html#grant') });
        window.close();
      });
    });
  }

  // Сворачиваемые разделы: состояние помним между открытиями.
  const FOLD_KEY = 'vgFold';
  const FOLD_DEFAULT_OPEN = { page: true };
  function setupFold() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    const secs = $$('details[data-sec]');
    secs.forEach((d) => {
      const id = d.dataset.sec;
      d.open = id in saved ? !!saved[id] : !!FOLD_DEFAULT_OPEN[id];
      d.addEventListener('toggle', () => { saveFold(); updateFoldBtn(); });
      // переключатель внутри заголовка не должен сворачивать раздел
      const sw = d.querySelector(':scope > summary .switch');
      if (sw) sw.addEventListener('click', (e) => e.stopPropagation());
    });
    function saveFold() {
      const o = {};
      secs.forEach((d) => { o[d.dataset.sec] = d.open; });
      try { localStorage.setItem(FOLD_KEY, JSON.stringify(o)); } catch (e) { /* нет доступа к хранилищу */ }
    }
    function updateFoldBtn() {
      const any = secs.some((d) => d.open);
      const b = $('#foldAll');
      b.textContent = any ? '\u25B4' : '\u25BE';
      b.title = t(any ? 'p_fold_all' : 'p_unfold_all');
    }
    $('#foldAll').addEventListener('click', () => {
      const any = secs.some((d) => d.open);
      secs.forEach((d) => { d.open = !any; });
      saveFold(); updateFoldBtn();
    });
    updateFoldBtn();
  }

  if (/[?&]panel=1/.test(location.search)) document.body.classList.add('panel');

  store.get(D, (res) => {
    raw = Object.assign({}, D, res);
    if (!raw.siteProfiles || typeof raw.siteProfiles !== 'object') raw.siteProfiles = {};
    compute();
    self.vgApplyI18n();
    for (const id in SLIDERS) SLIDERS[id].forEach((d) => addSlider(d, $('#' + id)));
    buildPresets();
    buildFxPresets();
    buildHours();
    bind();
    setupFold();
    renderPro();
    render();
    renderPro();   // выставить disabled уже после того, как render() расставил значения
    setupSite();
    setupPerm();
    refreshStatus();
  });
})();
