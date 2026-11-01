// Страница настроек: мини-экран со свечением по общим настройкам и меню разделов.
(() => {
  const store = chrome.storage.local;
  const show = () => store.get(null, (r) => {
    const s = self.VG_effective ? self.VG_effective(Object.assign({}, self.VG_DEFAULTS, r), '') : Object.assign({}, self.VG_DEFAULTS, r);
    if (self.vgPreview) self.vgPreview(s, s.enabled ? 'ok' : 'off');
  });
  show();
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local') show(); });

  // подсветка текущего раздела в меню
  const links = [...document.querySelectorAll('.toc a')];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const mark = (id) => links.forEach((a) => a.toggleAttribute('aria-current', a === byId.get(id)));
  if (!('IntersectionObserver' in self)) return;
  const seen = new Map();
  const io = new IntersectionObserver((list) => {
    for (const e of list) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null);
    let best = null, top = Infinity;
    for (const [id, y] of seen) if (y !== null && y < top && !document.getElementById(id).hidden) { top = y; best = id; }
    if (best) mark(best);
  }, { rootMargin: '-10% 0px -55% 0px' });
  for (const id of byId.keys()) { const g = document.getElementById(id); if (g) io.observe(g); }
  // раздел без видимых карточек (например, горячие клавиши на Android) убираем из меню
  setTimeout(() => {
    for (const [id, a] of byId) {
      const g = document.getElementById(id);
      a.hidden = !g || ![...g.children].some((c) => !c.hidden);
      if (g) g.hidden = a.hidden;
    }
  }, 300);
})();
