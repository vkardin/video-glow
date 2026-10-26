(() => {
  const D = self.VG_DEFAULTS;
  const CFG = self.VG_CONFIG || {};
  const t = self.vgT;
  const $ = (s) => document.querySelector(s);
  const store = chrome.storage.local;
  const norm = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

  let state = Object.assign({}, D);
  let toastTimer = 0;

  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ── отключённые сайты ──
  function renderSites() {
    const ul = $('#sites');
    ul.textContent = '';
    const list = (state.disabledHosts || []).map(norm);
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = t('o_sites_empty');
      ul.append(li);
      return;
    }
    list.forEach((host) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = host;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('o_site_remove');
      btn.addEventListener('click', () => {
        state.disabledHosts = list.filter((h) => h !== host);
        store.set({ disabledHosts: state.disabledHosts }, renderSites);
      });
      li.append(name, btn);
      ul.append(li);
    });
  }

  // ── сайты со своими настройками ──
  function renderCustom() {
    const ul = $('#customSites');
    ul.textContent = '';
    const profiles = state.siteProfiles && typeof state.siteProfiles === 'object' ? state.siteProfiles : {};
    const hosts = Object.keys(profiles).sort();
    if (!hosts.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = t('o_custom_empty');
      ul.append(li);
      return;
    }
    hosts.forEach((host) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = host + ' (' + Object.keys(profiles[host] || {}).length + ')';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('o_site_remove');
      btn.addEventListener('click', () => {
        const next = Object.assign({}, profiles);
        delete next[host];
        state.siteProfiles = next;
        store.set({ siteProfiles: next }, renderCustom);
      });
      li.append(name, btn);
      ul.append(li);
    });
  }

  function addSite() {
    const input = $('#siteInput');
    let raw = input.value.trim();
    if (!raw) return;
    let host = '';
    try { host = new URL(raw.includes('://') ? raw : 'https://' + raw).hostname; } catch (e) { /* ignore */ }
    host = norm(host);
    if (!host || !host.includes('.')) return;
    const list = (state.disabledHosts || []).map(norm);
    if (!list.includes(host)) list.push(host);
    state.disabledHosts = list;
    input.value = '';
    store.set({ disabledHosts: list }, renderSites);
  }

  // ── Pro: лицензия ──
  function renderPro() {
    const ps = self.VG_proState(state);
    $('#pro').hidden = ps.kind === 'free';
    if (ps.kind === 'free') return;
    const el = $('#proState');
    if (ps.kind === 'license') {
      el.textContent = state.proId ? t('o_pro_license', state.proId) : t('o_pro_license_anon');
    } else if (ps.kind === 'trial') {
      el.textContent = t('o_pro_trial', ps.trialDays);
    } else {
      el.textContent = t('o_pro_none');
    }
    $('#keyRemove').hidden = !state.licenseKey;
    if (CFG.BUY_URL) $('#buy').hidden = false;
  }

  async function activateKey() {
    const key = $('#keyInput').value.replace(/\s+/g, '');
    if (!key) { toast(t('o_key_empty')); return; }
    const r = await self.VG_License.verify(key);
    if (!r.ok) { toast(t(r.reason === 'format' ? 'o_key_format' : 'o_key_bad')); return; }
    state.licenseKey = key; state.proValid = true; state.proId = r.id;
    store.set({ licenseKey: key, proValid: true, proId: r.id }, () => {
      $('#keyInput').value = '';
      renderPro();
      toast(t('o_key_ok'));
    });
  }

  function removeKey() {
    state.licenseKey = ''; state.proValid = false; state.proId = '';
    store.set({ licenseKey: '', proValid: false, proId: '' }, () => { renderPro(); toast(t('o_key_removed')); });
  }


  // ── пресеты: менять встроенные и делать свои ──
  const openPresets = new Set();
  const saveTimers = {};
  const fmtV = (def, v) => v + (def.unit || '');

  function persistPreset(p) {
    const P = self.VG_presets;
    if (p.builtin) {
      const ov = Object.assign({}, state.presetOverrides);
      ov[p.id] = P.snapshot(p.values);
      state.presetOverrides = ov;
      store.set({ presetOverrides: ov });
    } else {
      const list = (state.userPresets || []).map((u) => (u.id === p.id ? { id: u.id, name: p.name, values: P.snapshot(p.values) } : u));
      state.userPresets = list;
      store.set({ userPresets: list });
    }
  }
  function persistSoon(p) {
    clearTimeout(saveTimers[p.id]);
    saveTimers[p.id] = setTimeout(() => persistPreset(p), 250);
  }

  function paramControl(p, def) {
    const wrap = document.createElement('div');
    wrap.className = 'pctl';
    const lbl = document.createElement('span');
    lbl.textContent = t(def.label);
    wrap.append(lbl);
    const v = p.values[def.key];
    if (def.type === 'range') {
      const out = document.createElement('output');
      out.textContent = fmtV(def, v);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = def.min; inp.max = def.max; inp.step = def.step; inp.value = v;
      self.vgFill(inp);
      inp.addEventListener('input', () => {
        p.values[def.key] = Number(inp.value);
        out.textContent = fmtV(def, p.values[def.key]);
        persistSoon(p);
      });
      wrap.append(out, inp);
    } else if (def.type === 'bool') {
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.checked = !!v;
      inp.addEventListener('change', () => { p.values[def.key] = inp.checked; persistPreset(p); });
      wrap.classList.add('bool');
      wrap.append(inp);
    } else {
      const sel = document.createElement('select');
      def.opts.forEach(([val, key]) => {
        const o = document.createElement('option');
        o.value = val; o.textContent = t(key); sel.append(o);
      });
      sel.value = v;
      sel.addEventListener('change', () => { p.values[def.key] = sel.value; persistPreset(p); });
      wrap.classList.add('enum');
      wrap.append(sel);
    }
    return wrap;
  }

  function presetRow(p) {
    const P = self.VG_presets;
    const row = document.createElement('div');
    row.className = 'preset';
    const head = document.createElement('div');
    head.className = 'phead';
    let nameEl;
    if (p.builtin) {
      nameEl = document.createElement('b');
      nameEl.textContent = t(p.nameKey);
      if (p.overridden) {
        const m = document.createElement('em');
        m.textContent = t('o_preset_changed');
        nameEl.append(' ', m);
      }
    } else {
      nameEl = document.createElement('input');
      nameEl.type = 'text'; nameEl.maxLength = 40; nameEl.value = p.name;
      nameEl.addEventListener('change', () => { p.name = nameEl.value.trim() || t('preset_default_name'); nameEl.value = p.name; persistPreset(p); });
    }
    const btns = document.createElement('div');
    btns.className = 'pbtns';
    const mk = (key, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = t(key); b.addEventListener('click', fn); btns.append(b); return b;
    };
    mk('o_preset_edit', () => { if (openPresets.has(p.id)) openPresets.delete(p.id); else openPresets.add(p.id); renderPresets(); });
    mk('o_preset_from_current', () => { p.values = P.snapshot(state); persistPreset(p); toast(t('o_preset_saved')); renderPresets(); });
    if (p.builtin) {
      if (p.overridden) {
        mk('o_preset_reset', () => {
          const ov = Object.assign({}, state.presetOverrides); delete ov[p.id];
          state.presetOverrides = ov;
          store.set({ presetOverrides: ov }, renderPresets);
        });
      }
    } else {
      mk('o_preset_delete', () => {
        state.userPresets = (state.userPresets || []).filter((u) => u.id !== p.id);
        openPresets.delete(p.id);
        store.set({ userPresets: state.userPresets }, renderPresets);
      });
    }
    head.append(nameEl, btns);
    row.append(head);
    if (openPresets.has(p.id)) {
      const form = document.createElement('div');
      form.className = 'pform';
      const groups = [['glow', 'o_pg_glow'], ['page', 'o_pg_page'], ['fx', 'o_pg_fx'], ['scene', 'o_pg_scene']];
      groups.forEach(([g, key]) => {
        const h = document.createElement('h4');
        h.textContent = t(key);
        const grid = document.createElement('div');
        grid.className = 'pgrid';
        P.PARAMS.filter((d) => d.group === g).forEach((d) => grid.append(paramControl(p, d)));
        form.append(h, grid);
      });
      row.append(form);
    }
    return row;
  }

  function renderPresets() {
    const box = $('#presetList');
    box.textContent = '';
    self.VG_presets.list(state).forEach((p) => box.append(presetRow(p)));
  }

  function addPreset() {
    const list = (state.userPresets || []).slice();
    const id = self.VG_presets.newId();
    list.push({ id, name: t('preset_default_name') + ' ' + (list.length + 1), values: self.VG_presets.snapshot(state) });
    state.userPresets = list;
    openPresets.add(id);
    store.set({ userPresets: list }, () => { renderPresets(); toast(t('o_preset_saved')); });
  }

  // ── резервная копия ──
  // Лицензия в резервные копии не попадает: файл можно безопасно отправить кому угодно.
  const LIC = (self.VG_LICENSE_KEYS || []).concat(self.VG_PANEL_KEYS || [], self.VG_HUE_KEYS || []);   // ключ моста Hue — тоже
  function exportSettings() {
    const pub = {};
    for (const k in state) if (!LIC.includes(k)) pub[k] = state[k];
    const data = { app: 'video-glow', version: chrome.runtime.getManifest().version, settings: pub };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'video-glow-settings.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const sanitize = (obj) => self.VG_sanitizeBackup(obj);

  function importSettings(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const clean = sanitize(JSON.parse(String(reader.result)));
        if (!Object.keys(clean).length) throw new Error('empty');
        store.set(clean, () => {
          Object.assign(state, clean);
          renderSites();
          renderCustom();
          toast(t('o_import_ok'));
        });
      } catch (e) {
        toast(t('o_import_err'));
      }
    };
    reader.onerror = () => toast(t('o_import_err'));
    reader.readAsText(file);
  }

  function bind() {
    $('#keyActivate').addEventListener('click', activateKey);
    $('#keyRemove').addEventListener('click', removeKey);
    if (CFG.BUY_URL) {
      $('#buy').addEventListener('click', () => chrome.tabs.create({ url: CFG.BUY_URL }));
    }
    // оформление: тема хранится в uiTheme, применяет её ui-theme.js
    const pickers = document.querySelectorAll('#customBox input[type=color]');
    const showCustom = () => {
      const c = self.vgGetCustom();
      pickers.forEach((i) => { i.value = c[i.dataset.c]; });
      const sw = $('#customSw');
      sw.style.background = c.bg;
      sw.firstElementChild.style.background = c.text + '1a';
      sw.lastElementChild.style.background = c.accent;
    };
    const marks = () => {
      document.querySelectorAll('.theme[data-pick]').forEach((b) => {
        const on = b.dataset.pick === document.documentElement.dataset.theme;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      });
      $('#customBox').hidden = document.documentElement.dataset.theme !== 'custom';
      showCustom();
    };
    // своя тема: цвета применяются сразу, в хранилище пишем не чаще раза в 300 мс
    let customTimer = 0;
    pickers.forEach((i) => i.addEventListener('input', () => {
      const c = self.vgGetCustom();
      c[i.dataset.c] = i.value;
      self.vgPreviewCustom(c);
      showCustom();
      clearTimeout(customTimer);
      customTimer = setTimeout(() => self.vgSetCustom(c), 300);
    }));
    $('#customReset').addEventListener('click', () => { self.vgSetCustom(null); showCustom(); });
    document.querySelectorAll('.theme[data-pick]').forEach((b) => b.addEventListener('click', () => self.vgSetTheme(b.dataset.pick)));
    new MutationObserver(marks).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    marks();
    $('#siteAdd').addEventListener('click', addSite);
    $('#siteInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSite(); });
    $('#export').addEventListener('click', exportSettings);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importSettings(f);
      e.target.value = '';
    });
    $('#resetAll').addEventListener('click', () => {
      if (!confirm(t('o_reset_confirm'))) return;
      // лицензия и дата начала пробного периода при сбросе остаются
      const next = Object.assign({}, D);
      for (const k of LIC) next[k] = state[k];
      store.set(next, () => { state = next; renderSites(); renderCustom(); renderPro(); });
    });
    // Firefox для Android: горячих клавиш нет — карточку прячем
    if (!(typeof browser !== 'undefined' ? browser : chrome).commands) $('#shortcutsCard').hidden = true;
    $('#shortcuts').addEventListener('click', () => {
      // Firefox: openShortcutSettings; Edge: edge://; Opera: opera://; Chrome: chrome://
      const api = typeof browser !== 'undefined' ? browser : chrome;
      if (api.commands && api.commands.openShortcutSettings) { api.commands.openShortcutSettings(); return; }
      const ua = navigator.userAgent;
      const scheme = /\bEdg\//.test(ua) ? 'edge' : /\bOPR\//.test(ua) ? 'opera' : 'chrome';
      chrome.tabs.create({ url: scheme + '://extensions/shortcuts' });
    });
    if (CFG.PRIVACY_URL) {
      const b = $('#privacy');
      b.hidden = false;
      b.addEventListener('click', () => chrome.tabs.create({ url: CFG.PRIVACY_URL }));
    }
    if (CFG.SITE_URL) {
      const b = $('#site');
      b.hidden = false;
      b.addEventListener('click', () => chrome.tabs.create({ url: CFG.SITE_URL }));
    }
    if (CFG.DONATE_URL) {
      const b = $('#donate');
      b.hidden = false;
      b.addEventListener('click', () => chrome.tabs.create({ url: CFG.DONATE_URL }));
    }
  }

  store.get(D, (res) => {
    state = Object.assign({}, D, res);
    self.vgApplyI18n();
    document.title = t('o_title');
    $('#version').textContent = t('o_version', chrome.runtime.getManifest().version);
    bind();
    renderSites();
    renderCustom();
    renderPro();
    renderPresets();
    $('#presetAdd').addEventListener('click', addPreset);
    if (location.hash === '#pro') $('#pro').scrollIntoView();
    if (location.hash === '#presets') $('#presets').scrollIntoView();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    for (const k of LIC) if (changes[k]) { state[k] = changes[k].newValue === undefined ? D[k] : changes[k].newValue; touched = true; }
    if (touched) renderPro();
    // пресет сохранили в popup, пока открыта эта страница
    for (const k of ['userPresets', 'presetOverrides']) {
      if (!changes[k]) continue;
      const nv = changes[k].newValue === undefined ? D[k] : changes[k].newValue;
      if (JSON.stringify(nv) !== JSON.stringify(state[k])) { state[k] = nv; renderPresets(); }
    }
  });
})();
