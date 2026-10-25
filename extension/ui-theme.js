// Тема оформления страниц расширения (popup, панель, настройки, приветствие).
// Подключается в <head> до стилей страницы, чтобы тема применялась без мигания:
// сначала берём копию из localStorage, потом сверяемся с chrome.storage.
(() => {
  const THEMES = ['cinema', 'amber', 'deck', 'midnight', 'day', 'custom'];
  const CUSTOM_DEFAULT = { bg: '#101418', text: '#eef1f4', accent: '#4fd1a5' };
  const LS_KEY = 'vgTheme';
  const LS_CUSTOM = 'vgThemeCustom';
  const root = document.documentElement;

  // ── своя тема: из трёх цветов выводим все токены ──
  const hex = (s) => /^#[0-9a-f]{6}$/i.test(s) ? s : null;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ink = (h) => (lum(h) > 0.4 ? '#111111' : '#ffffff');
  const caret = (h) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23${h.slice(1)}'/%3E%3C/svg%3E")`;
  const customVars = (c) => {
    const bg = hex(c && c.bg) || CUSTOM_DEFAULT.bg, tx = hex(c && c.text) || CUSTOM_DEFAULT.text, ac = hex(c && c.accent) || CUSTOM_DEFAULT.accent;
    const light = lum(bg) > 0.4, m = (t) => mix(bg, tx, t);
    return {
      '--bg': bg, '--card': m(light ? 0.03 : 0.05), '--line': m(0.12), '--text': tx, '--text-2': m(0.88), '--muted': m(0.55), '--faint': m(0.45),
      '--field': m(0.08), '--field-hover': m(0.13), '--track': m(0.16), '--fill': ac, '--thumb': light ? '#ffffff' : tx,
      '--off': m(0.18), '--knob-off': m(0.55), '--on': ac, '--knob-on': ink(ac), '--sel-bg': ac, '--sel-text': ink(ac),
      '--check': m(0.35), '--accent': ac, '--ok': ac, '--info': m(0.55), '--caret': caret(m(0.55)), 'color-scheme': light ? 'light' : 'dark'
    };
  };
  let applied = [];
  const setCustom = (c) => {
    applied.forEach((k) => root.style.removeProperty(k));
    applied = [];
    if (!c) return;
    const v = customVars(c);
    for (const k in v) { root.style.setProperty(k, v[k]); applied.push(k); }
  };

  let custom = null;
  const apply = (name) => {
    const v = THEMES.includes(name) ? name : THEMES[0];
    root.dataset.theme = v;
    setCustom(v === 'custom' ? (custom || CUSTOM_DEFAULT) : null);
    try { localStorage.setItem(LS_KEY, v); } catch (e) { /* нет доступа к хранилищу */ }
    return v;
  };
  const setCustomColors = (c) => {
    custom = Object.assign({}, CUSTOM_DEFAULT, c || {});
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify(custom)); } catch (e) { /* нет доступа к хранилищу */ }
    if (root.dataset.theme === 'custom') setCustom(custom);
  };
  try { custom = JSON.parse(localStorage.getItem(LS_CUSTOM) || 'null'); } catch (e) { custom = null; }
  try { apply(localStorage.getItem(LS_KEY)); } catch (e) { apply(THEMES[0]); }
  chrome.storage.local.get({ uiTheme: THEMES[0], uiCustom: null }, (r) => {
    if (r && r.uiCustom) setCustomColors(r.uiCustom);
    apply(r && r.uiTheme);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.uiCustom) setCustomColors(ch.uiCustom.newValue);
    if (ch.uiTheme) apply(ch.uiTheme.newValue);
  });

  // Заполненная часть ползунка: --p = положение бегунка в процентах.
  const fill = (el) => {
    const min = Number(el.min) || 0, max = Number(el.max) || 100;
    el.style.setProperty('--p', ((Number(el.value) - min) / (max - min || 1) * 100) + '%');
  };
  document.addEventListener('input', (e) => { if (e.target.type === 'range') fill(e.target); }, true);

  self.VG_THEMES = THEMES;
  self.vgSetTheme = (name) => chrome.storage.local.set({ uiTheme: apply(name) });
  self.vgGetCustom = () => Object.assign({}, CUSTOM_DEFAULT, custom || {});
  self.vgSetCustom = (c) => { setCustomColors(c); chrome.storage.local.set({ uiCustom: self.vgGetCustom() }); };
  self.vgPreviewCustom = setCustomColors;   // без записи в хранилище, пока тянут ползунок цвета
  self.vgFill = fill;
})();
