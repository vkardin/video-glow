// Живое превью в попапе: маленький «экран» со свечением по текущим настройкам.
// Только CSS-переменные, без canvas и таймеров.
(() => {
  const el = document.getElementById('screen');
  if (!el) return;
  let last = '';
  self.vgPreview = (s, kind) => {
    if (kind) el.dataset.kind = kind;
    if (!s) return;
    const lit = s.enabled && s.pageGlow && el.dataset.kind !== 'off';
    const shape = s.shape === 'circle' ? '50%' : s.shape === 'rect' ? '3px' : Math.round(s.radius * 0.5) + 'px';
    const v = [
      ['--pv-spread', Math.round(s.spread * 0.6) + 'px'],
      ['--pv-blur', Math.round(s.blur * (s.glowStyle === 'led' ? 0.12 : 0.35)) + 'px'],
      ['--pv-alpha', lit ? (s.opacity / 100) * Math.min(1.3, s.brightness / 100) : 0],
      ['--pv-sat', (s.saturation || 100) / 100],
      ['--pv-radius', shape],
      ['--pv-led', Math.max(6, Math.round(320 / Math.max(8, s.ledCount || 40))) + 'px'],
      ['--pv-room', lit && s.room ? s.roomLevel / 100 : 0],
      ['--pv-dim', lit && s.dim ? s.dimLevel / 100 : 0]
    ];
    const key = JSON.stringify(v) + s.glowStyle;
    if (key === last) return;
    last = key;
    for (const [k, x] of v) el.style.setProperty(k, x);
    el.dataset.style = s.glowStyle === 'led' ? 'led' : 'soft';
    el.classList.toggle('lit', !!lit);
  };
})();
