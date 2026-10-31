// Свободный зум и сдвиг картинки любого <video> мышью.
//   Alt + колесо — приблизить/отдалить вокруг курсора
//   Alt + перетаскивание — сдвинуть увеличенную картинку
//   Alt + двойной щелчок — вернуть как было
// Самостоятельный модуль: ни от чего не зависит, его можно просто скопировать в другое расширение.
// API: ZoomPan.setEnabled(bool), ZoomPan.get(video) → {k, fx, fy} | null, ZoomPan.reset(video?),
// ZoomPan.onBeforeApply = (video) => {} — вызывается перед тем, как модуль впервые тронет style видео
// (чтобы чужой код успел убрать свои transform/clip-path). На видео при каждом изменении — событие 'zoompan'.
(function () {
  'use strict';
  if (globalThis.ZoomPan) return;

  const MAX = 8, STEP = 1.15;
  const PROPS = ['transform', 'transform-origin', 'clip-path'];
  const st = new WeakMap();          // video → { k, fx, fy, saved, str }
  const live = new Set();            // видео, у которых сейчас есть зум
  let enabled = true;
  let drag = null;                   // { v, x, y, fx, fy, moved }
  let used = false;                  // пока держали Alt, модуль что-то делал (тогда гасим меню Firefox)
  let ro = null;

  const api = {
    onBeforeApply: null,
    setEnabled(on) {
      enabled = !!on;
      if (!enabled) api.reset();
    },
    get(v) {
      const z = st.get(v);
      return z && z.k > 1.0001 ? { k: z.k, fx: z.fx, fy: z.fy } : null;
    },
    reset(v) {
      (v ? [v] : Array.from(live)).forEach((x) => { const z = st.get(x); if (z) { z.k = 1; z.fx = 0; z.fy = 0; apply(x); } });
    }
  };
  globalThis.ZoomPan = api;

  // Все <video> страницы, включая открытые shadow root.
  function videos(root, out) {
    out = out || [];
    root.querySelectorAll('video').forEach((v) => out.push(v));
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) videos(el.shadowRoot, out); });
    return out;
  }
  let cache = null, cacheAt = 0;
  function videoAt(x, y) {
    const now = performance.now();
    if (!cache || now - cacheAt > 1500) { cache = videos(document); cacheAt = now; }
    let best = null, area = 0;
    for (const v of cache) {
      // видео, которое забрал другой плеер (Video Drift ставит data-video-drift), не трогаем
      if (!v.isConnected || v.ownerDocument !== document || v.hasAttribute('data-video-drift')) continue;
      const r = box(v);
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const a = r.width * r.height;
      if (a > area && r.width >= 160 && r.height >= 90) { best = v; area = a; }
    }
    return best;
  }

  // Рамка элемента без нашего transform (clip-path и так держит картинку в ней).
  function box(v) {
    const r = v.getBoundingClientRect();
    const z = st.get(v);
    if (!z || !z.str) return r;
    const w = r.width / z.k, h = r.height / z.k;
    const cx = r.left + r.width / 2 - z.fx * w, cy = r.top + r.height / 2 - z.fy * h;
    return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, width: w, height: h };
  }

  // Сдвиг не больше, чем позволяет увеличение: края картинки не заходят внутрь рамки.
  function clampPan(z) {
    const m = (z.k - 1) / 2;
    z.fx = Math.max(-m, Math.min(m, z.fx));
    z.fy = Math.max(-m, Math.min(m, z.fy));
  }

  function apply(v) {
    const z = st.get(v);
    if (!z) return;
    clampPan(z);
    if (z.k <= 1.0001) {
      if (z.saved) {
        for (const [p, val, pr] of z.saved) {
          v.style.removeProperty(p);
          if (val) v.style.setProperty(p, val, pr);
        }
      }
      st.delete(v);
      live.delete(v);
      if (ro) ro.unobserve(v);
      v.dispatchEvent(new CustomEvent('zoompan'));
      return;
    }
    if (!z.saved) {
      if (typeof api.onBeforeApply === 'function') { try { api.onBeforeApply(v); } catch (e) { /* чужой код */ } }
      z.saved = PROPS.map((p) => [p, v.style.getPropertyValue(p), v.style.getPropertyPriority(p)]);
      live.add(v);
      if (!ro && typeof ResizeObserver === 'function') ro = new ResizeObserver((es) => es.forEach((e) => apply(e.target)));
      if (ro) ro.observe(v);
    }
    const w = v.offsetWidth || 1, h = v.offsetHeight || 1;
    const tx = Math.round(z.fx * w * 10) / 10, ty = Math.round(z.fy * h * 10) / 10;
    const k = Math.round(z.k * 10000) / 10000;
    // clip-path считается до transform: вырез в координатах элемента = исходная рамка на экране
    const ix = w / 2 * (1 - 1 / k), iy = h / 2 * (1 - 1 / k);
    const l = Math.max(0, ix - tx / k), r = Math.max(0, ix + tx / k);
    const t = Math.max(0, iy - ty / k), b = Math.max(0, iy + ty / k);
    const f = (n) => Math.round(n * 10) / 10 + 'px';
    v.style.setProperty('transform', 'translate(' + tx + 'px,' + ty + 'px) scale(' + k + ')', 'important');
    v.style.setProperty('transform-origin', '50% 50%', 'important');
    v.style.setProperty('clip-path', 'inset(' + f(t) + ' ' + f(r) + ' ' + f(b) + ' ' + f(l) + ')', 'important');
    z.str = v.style.getPropertyValue('transform');
    v.dispatchEvent(new CustomEvent('zoompan'));
  }

  function state(v) {
    let z = st.get(v);
    if (!z) { z = { k: 1, fx: 0, fy: 0, saved: null, str: '' }; st.set(v, z); }
    // сайт сам переписал transform — начинаем с чистого листа поверх его стилей
    if (z.str && v.style.getPropertyValue('transform') !== z.str) { z.k = 1; z.fx = 0; z.fy = 0; z.saved = null; z.str = ''; }
    return z;
  }

  function stop(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    used = true;
  }

  window.addEventListener('wheel', (e) => {
    if (!enabled || !e.altKey || e.ctrlKey) return;
    const v = videoAt(e.clientX, e.clientY);
    if (!v) return;
    stop(e);
    const z = state(v);
    const r = box(v);
    const dir = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
    if (!dir) return;
    const k2 = Math.max(1, Math.min(MAX, z.k * (dir > 0 ? STEP : 1 / STEP)));
    if (k2 === z.k) return;
    // точка под курсором остаётся на месте
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    const ux = (px - z.fx) / z.k, uy = (py - z.fy) / z.k;
    z.fx = px - k2 * ux; z.fy = py - k2 * uy; z.k = k2;
    apply(v);
  }, { capture: true, passive: false });

  window.addEventListener('pointerdown', (e) => {
    if (!enabled || !e.altKey || e.button !== 0) return;
    const v = videoAt(e.clientX, e.clientY);
    if (!v || !api.get(v)) return;
    stop(e);
    const z = st.get(v);
    drag = { v, x: e.clientX, y: e.clientY, fx: z.fx, fy: z.fy };
  }, true);

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    stop(e);
    const z = st.get(drag.v);
    if (!z) { drag = null; return; }
    const r = box(drag.v);
    z.fx = drag.fx + (e.clientX - drag.x) / r.width;
    z.fy = drag.fy + (e.clientY - drag.y) / r.height;
    apply(drag.v);
  }, true);

  const endDrag = (e) => {
    if (!drag) return;
    stop(e);
    drag = null;
    // сайт не должен принять конец перетаскивания за щелчок (пауза/запуск)
    const eat = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
    window.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', eat, true), 400);
  };
  window.addEventListener('pointerup', endDrag, true);
  window.addEventListener('pointercancel', endDrag, true);

  // mousedown/click с Alt над увеличенным видео тоже наши (иначе сайт ставит паузу)
  ['mousedown', 'mouseup', 'click'].forEach((type) => window.addEventListener(type, (e) => {
    if (!enabled || !e.altKey || e.button !== 0) return;
    const v = videoAt(e.clientX, e.clientY);
    if (v && api.get(v)) stop(e);
  }, true));

  window.addEventListener('dblclick', (e) => {
    if (!enabled || !e.altKey) return;
    const v = videoAt(e.clientX, e.clientY);
    if (!v || !api.get(v)) return;
    stop(e);
    api.reset(v);
  }, true);

  // Firefox показывает строку меню, если Alt отпустили «просто так»
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && used) { e.preventDefault(); used = false; }
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Alt') used = false; }, true);
})();
