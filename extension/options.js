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

  // ── резервная копия ──
  function exportSettings() {
    const data = { app: 'video-glow', version: chrome.runtime.getManifest().version, settings: state };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'video-glow-settings.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Принимаем только известные ключи с совпадающим типом значения.
  function sanitize(obj) {
    const src = obj && typeof obj === 'object' && obj.settings && typeof obj.settings === 'object'
      ? obj.settings : obj;
    const clean = {};
    for (const k in D) {
      if (!src || !(k in src)) continue;
      const dv = D[k], v = src[k];
      if (k === 'siteProfiles') {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const out = {};
          Object.keys(v).slice(0, 300).forEach((host) => {
            const p = v[host];
            if (!p || typeof p !== 'object' || Array.isArray(p)) return;
            const q = {};
            self.VG_SCOPED.forEach((sk) => {
              if (sk in p && typeof p[sk] === typeof D[sk] && (typeof p[sk] !== 'number' || isFinite(p[sk]))) q[sk] = p[sk];
            });
            out[String(host).toLowerCase().slice(0, 253)] = q;
          });
          clean[k] = out;
        }
      } else if (Array.isArray(dv)) {
        if (Array.isArray(v)) clean[k] = v.filter((x) => typeof x === 'string').slice(0, 500);
      } else if (typeof v === typeof dv && (typeof v !== 'number' || isFinite(v))) {
        clean[k] = v;
      }
    }
    return clean;
  }

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
      store.set(Object.assign({}, D), () => { state = Object.assign({}, D); renderSites(); renderCustom(); });
    });
    $('#shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
    if (CFG.PRIVACY_URL) {
      const b = $('#privacy');
      b.hidden = false;
      b.addEventListener('click', () => chrome.tabs.create({ url: CFG.PRIVACY_URL }));
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
  });
})();
