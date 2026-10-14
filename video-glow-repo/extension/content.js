/* Video Glow — content script.
 * Рисует размытую подсветку вокруг любого <video> (в т.ч. в полноэкранном режиме).
 *
 * Режимы:
 *  inline — рамка свечения вокруг видео на странице. Три варианта наложения:
 *           screen/normal — поверх страницы (видно даже на непрозрачных фонах),
 *           с вырезом под само видео, чтобы не перекрывать картинку и плеер;
 *           under — под страницей (z-index:-1), контент не трогается;
 *  fs     — на весь экран раскрыт контейнер плеера: свечение заливает весь экран
 *           (чёрные полосы 16:9 на экране 16:10);
 *  bare   — на весь экран раскрыт сам <video>: детей добавить нельзя, поэтому
 *           размытый кадр кладётся в background самого элемента (видно в полосах).
 *
 * Бесшовный стык: кадр рисуется в canvas в том же масштабе, что и на экране, а область
 * вокруг него заполняется зеркальным продолжением картинки — цвета у края видео и у
 * начала свечения совпадают. Форма, мягкость внешнего края и яркость у стыка задаются
 * альфа-маской (см. buildMask).
 *
 * Чёрные полосы, вшитые в само видео (кинофильмы 2.39:1), определяются по маленькому
 * кадру (см. detectBars) и не попадают в свечение.
 */
(() => {
  'use strict';

  const D = self.VG_DEFAULTS;
  if (!D || window.__vgLoaded) return;
  window.__vgLoaded = true;

  const EVENTS = ['play', 'playing', 'pause', 'ended', 'emptied', 'loadeddata',
    'loadedmetadata', 'resize', 'seeked', 'ratechange'];
  const RESET_CROP_EVENTS = new Set(['emptied', 'loadedmetadata', 'resize']);
  const NO_HOST_TAGS = new Set(['VIDEO', 'IMG', 'IFRAME', 'EMBED', 'OBJECT', 'CANVAS',
    'INPUT', 'TEXTAREA', 'SELECT', 'SVG']);
  const NO_CROP = Object.freeze({ t: 0, b: 0, l: 0, r: 0 });

  let rawStore = {};                       // всё, что лежит в chrome.storage
  let settings = Object.assign({}, D);     // итоговые настройки для страницы (с учётом сайта)
  let settingsFs = settings;               // то же для полного экрана
  let siteOff = false;
  let battery = null;
  let battLow = false;

  // ───────────────────────── утилиты ─────────────────────────

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const normHost = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
  const r1 = (x) => Math.round(x * 10) / 10;
  const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  function setImp(el, obj) {
    for (const k in obj) el.style.setProperty(k, obj[k], 'important');
  }

  function normalize(raw) {
    const o = Object.assign({}, D, raw);
    const n = (k, a, b) => { o[k] = clamp(num(Number(o[k]), D[k]), a, b); };
    n('spread', 0, 100);
    n('feather', 0, 100);
    n('radius', 0, 50);
    n('blur', 0, 200);
    n('sample', 8, 512);
    n('opacity', 0, 100);
    n('saturation', 0, 400);
    n('brightness', 20, 300);
    n('fps', 5, 120);
    n('fadeMs', 0, 10000);
    n('minWidth', 0, 4000);
    n('dimLevel', 0, 100);
    n('pauseDelay', 0, 600);
    n('fsBlur', 0, 200);
    n('fsOpacity', 0, 100);
    n('fsSaturation', 0, 400);
    n('fsBrightness', 20, 300);
    n('fsFadeMs', 0, 10000);
    ['enabled', 'pageGlow', 'fullscreenGlow', 'fullscreenFill', 'fillBars', 'seamless',
      'cropBars', 'adaptive', 'ecoBattery', 'hoverButton', 'fsSame'].forEach((k) => { o[k] = o[k] !== false; });
    o.dim = !!o.dim;
    ['pauseMode', 'fsPauseMode'].forEach((k) => {
      if (!['fade', 'hold', 'delay'].includes(o[k])) o[k] = D[k];
    });
    if (!['screen', 'normal', 'under'].includes(o.pageMode)) o.pageMode = D.pageMode;
    if (!['rect', 'rounded', 'circle'].includes(o.shape)) o.shape = D.shape;
    o.disabledHosts = Array.isArray(o.disabledHosts) ? o.disabledHosts : [];
    return o;
  }

  // Сайт, чьи настройки действуют: верхняя страница (для встроенных плееров), иначе текущая.
  function siteKey() {
    try {
      const ao = location.ancestorOrigins;
      if (ao && ao.length) return normHost(new URL(ao[ao.length - 1]).hostname);
    } catch (e) { /* ignore */ }
    return normHost(location.hostname);
  }

  function computeSiteOff() {
    const list = settings.disabledHosts.map(normHost);
    const hosts = [location.hostname];
    try {
      const ao = location.ancestorOrigins;
      if (ao && ao.length) hosts.push(new URL(ao[ao.length - 1]).hostname);
    } catch (e) { /* ignore */ }
    return hosts.some((h) => list.includes(normHost(h)));
  }

  // Максимальная частота обновления с учётом режима экономии на батарее.
  const fpsLimit = () => (battLow ? Math.min(settings.fps, 15) : settings.fps);

  function updateBattery() {
    battLow = !!(battery && settings.ecoBattery && !battery.charging && battery.level < 0.3);
  }

  // Элемент, раскрытый на весь экран (с учётом shadow DOM).
  function getFsElement() {
    let el = document.fullscreenElement || document.webkitFullscreenElement || null;
    while (el && el.shadowRoot && el.shadowRoot.fullscreenElement) {
      el = el.shadowRoot.fullscreenElement;
    }
    return el;
  }

  // node лежит внутри container (через границы shadow DOM тоже).
  function isInside(node, container) {
    while (node) {
      if (node === container) return true;
      node = node.parentNode || node.host || null;
    }
    return false;
  }

  // Реальная область картинки внутри элемента <video> (без чёрных полос object-fit: contain).
  function contentRect(v) {
    const r = v.getBoundingClientRect();
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh || !r.width || !r.height) return r;
    const fit = getComputedStyle(v).objectFit;
    if (fit === 'fill' || fit === 'cover') return r;
    let k = Math.min(r.width / vw, r.height / vh);
    if (fit === 'none') k = 1;
    else if (fit === 'scale-down') k = Math.min(k, 1);
    const w = vw * k, h = vh * k;
    const left = r.left + (r.width - w) / 2;
    const top = r.top + (r.height - h) / 2;
    return { left, top, right: left + w, bottom: top + h, width: w, height: h };
  }

  // Ищет чёрные полосы по краям кадра (letterbox / pillarbox).
  // data — RGBA маленького кадра w×h. Возвращает доли кадра {t,b,l,r}.
  // Полосы засчитываются, только если они симметричны (иначе это, скорее всего, тёмная сцена).
  function detectBars(data, w, h) {
    const none = { t: 0, b: 0, l: 0, r: 0 };
    const bright = (x, y) => {
      const i = (y * w + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] > 28;
    };
    // строка/столбец «чёрные», если ярких пикселей ≤ 4% (так субтитры в полосе не мешают)
    const rowBlack = (y, x0, x1) => {
      let n = 0;
      for (let x = x0; x < x1; x++) if (bright(x, y)) n++;
      return n <= (x1 - x0) * 0.04;
    };
    const colBlack = (x, y0, y1) => {
      let n = 0;
      for (let y = y0; y < y1; y++) if (bright(x, y)) n++;
      return n <= (y1 - y0) * 0.04;
    };

    let t = 0, b = 0;
    while (t < h * 0.45 && rowBlack(t, 0, w)) t++;
    while (b < h * 0.45 && rowBlack(h - 1 - b, 0, w)) b++;
    if (t + b >= h * 0.9) return none;                       // тёмная сцена целиком
    // Одна сторона короче другой — возможно, в полосе субтитры/логотип: принимаем,
    // если в «короткой» полосе почти всё чёрное (≤12% ярких пикселей).
    if (Math.min(t, b) >= 2 && Math.abs(t - b) > 2) {
      const k = Math.max(t, b);
      const y0s = t < b ? 0 : h - k, y1s = t < b ? k : h;
      let n = 0;
      for (let y = y0s; y < y1s; y++) for (let x = 0; x < w; x++) if (bright(x, y)) n++;
      if (n <= k * w * 0.12) { t = k; b = k; }
    }
    if (t < 2 || Math.abs(t - b) > 2) { t = 0; b = 0; }

    const y0 = t, y1 = h - b;
    let l = 0, r = 0;
    while (l < w * 0.45 && colBlack(l, y0, y1)) l++;
    while (r < w * 0.45 && colBlack(w - 1 - r, y0, y1)) r++;
    if (l + r >= w * 0.9) return none;
    if (Math.min(l, r) >= 2 && Math.abs(l - r) > 2) {
      const k = Math.max(l, r);
      const x0s = l < r ? 0 : w - k, x1s = l < r ? k : w;
      let n = 0;
      for (let x = x0s; x < x1s; x++) for (let y = y0; y < y1; y++) if (bright(x, y)) n++;
      if (n <= k * (y1 - y0) * 0.12) { l = k; r = k; }
    }
    if (l < 2 || Math.abs(l - r) > 2) { l = 0; r = 0; }

    return { t: t / h, b: b / h, l: l / w, r: r / w };
  }

  // Альфа-маска свечения (строится только при смене геометрии/настроек, не каждый кадр).
  // Все расстояния — в css-пикселях внутри холста (W×H), отверстие под видео — (hx,hy,hw,hh).
  //  • форма и мягкий внешний край: плавное нарастание альфы от внешней границы внутрь;
  //  • бесшовный стык: у самого края видео альфа = 1, дальше плавно уходит к «яркости свечения».
  function buildMask(g, p) {
    const scale = Math.min(1, 128 / Math.max(g.cw, g.ch));
    const mw = Math.max(2, Math.round(g.cw * scale));
    const mh = Math.max(2, Math.round(g.ch * scale));
    const cv = document.createElement('canvas');
    cv.width = mw; cv.height = mh;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(mw, mh);
    const d = img.data;
    const W = g.W, H = g.H;
    const cx = W / 2, cy = H / 2;
    const sx = W / mw, sy = H / mh;
    const rr = Math.min(p.rr, Math.min(W, H) / 2);
    const hx0 = g.hx, hy0 = g.hy, hx1 = g.hx + g.hw, hy1 = g.hy + g.hh;

    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const X = (x + 0.5) * sx, Y = (y + 0.5) * sy;
        let a = 1;

        if (p.fade && p.feather > 0) {
          let depth;   // расстояние от внешней границы внутрь (отрицательное — снаружи)
          if (p.shape === 'circle') {
            const ex = (X - cx) / cx, ey = (Y - cy) / cy;
            const rho = Math.hypot(ex, ey);
            const gl = Math.hypot((X - cx) / (cx * cx), (Y - cy) / (cy * cy));
            depth = gl > 1e-9 ? ((1 - rho) * rho) / gl : Infinity;
          } else {
            const qx = Math.abs(X - cx) - (cx - rr);
            const qy = Math.abs(Y - cy) - (cy - rr);
            depth = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
              Math.min(Math.max(qx, qy), 0) - rr);
          }
          a *= smooth(depth / p.feather);
        }

        if (p.seam) {
          const dx = Math.max(hx0 - X, 0, X - hx1);
          const dy = Math.max(hy0 - Y, 0, Y - hy1);
          const e = smooth(Math.hypot(dx, dy) / p.edgeW);
          a *= (1 - e) + e * p.op;
        } else {
          a *= p.op;
        }
        d[(y * mw + x) * 4 + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // ───────────────────────── Glow ─────────────────────────

  class Glow {
    constructor(video) {
      this.v = video;
      this.dead = false;
      this.raf = 0;
      this.level = 0;          // 0..1 — текущая «видимость» свечения (плавно меняется)
      this.lastStep = 0;
      this.lastDraw = 0;
      this.lastTime = -1;
      this.forceDraw = false;  // перерисовать кадр принудительно (после смены настроек)
      this.drawnKey = '';
      this.geo = null;
      this.mask = null;
      this.maskKey = '';
      this.inView = true;
      this.visOk = true;
      this.visAt = 0;
      this.mode = null;        // 'inline' | 'fs' | 'bare'
      this.why = 'novideo';    // причина (не)активности — для диагностики в popup
      this.rootKey = '';
      this.cache = {};
      this.cleaned = null;     // изменённые фоны контейнеров (fs)
      this.bare = null;        // состояние режима bare
      this.crop = NO_CROP;     // найденные чёрные полосы внутри видео (доли кадра)
      this.cropPend = null;
      this.cropAt = 0;
      this.probe = null;
      this.readable = null;    // можно ли читать пиксели кадра (false — видео чужого домена без CORS)
      this.s = settings;       // действующие настройки: страница или полный экран
      this.played = false;     // видео уже запускалось (для режимов паузы)
      this.pausedAt = 0;
      this.userOff = false;    // выключено кнопкой на видео (до перезагрузки страницы)
      this.btnUntil = 0;
      this.btnHover = false;
      this.hr = null;          // область видео на экране (для наведения)
      this.fpsCap = fpsLimit();
      this.drawEma = 0;        // средняя длительность отрисовки, мс
      this.adaptAt = 0;

      this.root = document.createElement('video-glow-root');
      setImp(this.root, {
        display: 'block', position: 'fixed', left: '0', top: '0',
        width: '0', height: '0', margin: '0', padding: '0', border: '0',
        'z-index': '-1', 'pointer-events': 'none', overflow: 'visible',
        background: 'none', opacity: '1', transform: 'none', filter: 'none',
        visibility: 'visible'
      });
      this.canvas = document.createElement('canvas');
      setImp(this.canvas, {
        display: 'block', position: 'absolute', left: '0', top: '0',
        margin: '0', padding: '0', border: '0', 'max-width': 'none', 'max-height': 'none',
        'pointer-events': 'none', opacity: '0', 'image-rendering': 'auto', background: 'none'
      });
      this.root.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.tile = document.createElement('canvas');   // кадр видео в масштабе экрана
      this.tctx = this.tile.getContext('2d');
      this.buildUi();

      this.loop = (now) => { this.raf = 0; this.frame(now); };
      this.onEvt = (e) => {
        if (e && e.type === 'emptied') { this.played = false; this.pausedAt = 0; }
        if (e && (e.type === 'play' || e.type === 'playing')) this.played = true;
        if (e && RESET_CROP_EVENTS.has(e.type)) { this.crop = NO_CROP; this.cropPend = null; this.cropAt = 0; }
        this.kick();
      };
      EVENTS.forEach((e) => video.addEventListener(e, this.onEvt));

      this.io = new IntersectionObserver((entries) => {
        this.inView = entries[entries.length - 1].isIntersecting;
        this.kick();
      }, { rootMargin: '300px' });
      this.io.observe(video);
      this.ro = new ResizeObserver(() => this.kick());
      this.ro.observe(video);

      this.kick();
    }

    // ── интерфейс поверх страницы: затемнение вокруг плеера и кнопка вкл/выкл ──
    buildUi() {
      const base = {
        display: 'block', position: 'fixed', left: '0', top: '0', width: '0', height: '0',
        margin: '0', padding: '0', border: '0', 'pointer-events': 'none', overflow: 'visible',
        background: 'none', opacity: '1', transform: 'none', filter: 'none', visibility: 'visible'
      };
      const mk = (tag, css) => { const el = document.createElement(tag); setImp(el, css); return el; };
      // затемнение лежит под свечением (z-index ниже), кнопка — выше всего
      this.dimRoot = mk('video-glow-dim', Object.assign({}, base, { 'z-index': '2147483645' }));
      this.dimEl = mk('video-glow-dimlayer', {
        display: 'block', position: 'absolute', margin: '0', padding: '0', border: '0',
        background: '#000', opacity: '0', 'pointer-events': 'none'
      });
      this.dimRoot.appendChild(this.dimEl);
      this.uiRoot = mk('video-glow-ui', Object.assign({}, base, { 'z-index': '2147483647' }));
      this.btn = mk('video-glow-btn', {
        display: 'flex', position: 'absolute', 'align-items': 'center', 'justify-content': 'center',
        width: '30px', height: '30px', margin: '0', padding: '0', 'box-sizing': 'border-box',
        'border-radius': '50%', border: '1px solid rgba(255,255,255,.35)',
        background: 'rgba(18,18,26,.72)', color: '#fff', font: '15px/1 system-ui,sans-serif',
        cursor: 'pointer', opacity: '0', 'pointer-events': 'none', 'user-select': 'none',
        transition: 'opacity .2s, box-shadow .2s, color .2s'
      });
      this.btn.textContent = '\u2726';
      try { this.btn.title = chrome.i18n.getMessage('hover_tip') || 'Video Glow'; } catch (e) { /* ignore */ }
      ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'touchstart'].forEach((ev) => {
        this.btn.addEventListener(ev, (e) => {
          e.stopPropagation();
          if (ev === 'click') { e.preventDefault(); this.userOff = !this.userOff; this.btnUntil = performance.now() + 2200; this.kick(); }
        });
      });
      this.btn.addEventListener('mouseenter', () => { this.btnHover = true; });
      this.btn.addEventListener('mouseleave', () => { this.btnHover = false; this.btnUntil = performance.now() + 1200; });
      this.uiRoot.appendChild(this.btn);
      this.uiCache = {};
    }

    uiSet(el, key, obj) {
      const k = JSON.stringify(obj);
      if (this.uiCache[key] === k) return;
      this.uiCache[key] = k;
      setImp(el, obj);
    }

    layoutUi(mode, c, fs) {
      const s = this.s;
      const wantDim = s.dim && mode === 'inline' && s.pageMode !== 'under';
      const wantBtn = s.hoverButton;
      const host = fs || document.documentElement;
      this.dimOn = wantDim;
      this.btnOn = wantBtn;
      this.hr = { l: c.left, t: c.top, r: c.right, b: c.bottom };
      if (wantDim) {
        if (this.dimRoot.parentNode !== host) host.appendChild(this.dimRoot);
        const o = this.dimRoot.getBoundingClientRect();
        const W = window.innerWidth, H = window.innerHeight;
        const x0 = r1(c.left), y0 = r1(c.top), x1 = r1(c.right), y1 = r1(c.bottom);
        this.uiSet(this.dimEl, 'dim', {
          left: r1(-o.left) + 'px', top: r1(-o.top) + 'px', width: W + 'px', height: H + 'px',
          'clip-path': 'path(evenodd,"M0 0H' + W + 'V' + H + 'H0Z M' + x0 + ' ' + y0 + 'H' + x1 +
            'V' + y1 + 'H' + x0 + 'Z")'
        });
      } else if (this.dimRoot.parentNode) {
        this.dimRoot.remove();
      }
      if (wantBtn) {
        if (this.uiRoot.parentNode !== host) host.appendChild(this.uiRoot);
        const o = this.uiRoot.getBoundingClientRect();
        const bx = Math.max(c.left + 4, Math.min(c.right - 42, window.innerWidth - 40));
        const by = Math.max(4, Math.min(c.top + 12, window.innerHeight - 36));
        this.uiSet(this.btn, 'btn', { left: r1(bx - o.left) + 'px', top: r1(by - o.top) + 'px' });
      } else if (this.uiRoot.parentNode) {
        this.uiRoot.remove();
      }
    }

    paintUi(e) {
      const s = this.s;
      if (this.dimOn) this.uiSet(this.dimEl, 'dimA', { opacity: (e * s.dimLevel / 100).toFixed(3) });
      if (this.btnOn) {
        const show = this.btnHover || performance.now() < this.btnUntil;
        const on = !this.userOff;
        this.uiSet(this.btn, 'btnS', {
          opacity: show ? '1' : '0', 'pointer-events': show ? 'auto' : 'none',
          'box-shadow': on ? '0 0 10px 2px rgba(255,79,163,.75), 0 0 16px 4px rgba(63,208,255,.35)' : 'none',
          color: on ? '#fff' : 'rgba(255,255,255,.4)'
        });
      }
    }

    removeUi() {
      this.dimRoot.remove();
      this.uiRoot.remove();
      this.dimOn = false;
      this.btnOn = false;
      this.hr = null;
      this.btnHover = false;
      this.uiCache = {};
    }

    kick() {
      if (!this.raf && !this.dead) this.raf = requestAnimationFrame(this.loop);
    }

    // ── главный цикл (работает, пока видео играет или свечение гаснет) ──
    frame(now) {
      if (this.dead) return;
      const fs = getFsElement();
      const inFs = !!fs && isInside(this.v, fs);
      this.s = inFs ? settingsFs : settings;
      const active = this.isActive(now, fs, inFs);
      const lit = active && !this.userOff;
      const target = lit ? 1 : 0;
      const fade = this.s.fadeMs;
      const dt = this.lastStep ? Math.min(100, now - this.lastStep) : 0;
      this.lastStep = now;

      if (fade <= 0) this.level = target;
      else if (this.level < target) this.level = Math.min(target, this.level + dt / fade);
      else if (this.level > target) this.level = Math.max(target, this.level - dt / fade);

      if (!active && this.level <= 0) {
        this.release();
        this.lastStep = 0;
        return;
      }
      if (!this.layout(fs)) {
        this.release();
        this.lastStep = 0;
        if (active) this.kick();
        return;
      }
      if (lit) {
        if (this.s.cropBars) this.updateCrop(now);
        this.adaptFps(now);
        this.draw(now);
      }
      this.paint();
      this.kick();
    }

    isActive(now, fs, inFs) {
      const v = this.v, s = this.s;
      const no = (why) => { this.why = why; return false; };
      if (this.dead) return no('novideo');
      if (!s.enabled) return no('disabled');
      if (siteOff) return no('site');
      if (!v.videoWidth) return no('novideo');
      if (!this.inView) return no('offscreen');
      if (!v.paused && !v.ended) { this.played = true; this.pausedAt = 0; }
      else if (!this.pausedAt) this.pausedAt = now;
      if (v.paused || v.ended) {
        // как ведёт себя свечение на паузе
        let keep = false;
        if (this.played && v.readyState >= 2) {
          if (s.pauseMode === 'hold') keep = true;
          else if (s.pauseMode === 'delay') keep = now - this.pausedAt < s.pauseDelay * 1000;
        }
        if (!keep) return no('paused');
      }
      if (document.pictureInPictureElement === v) return no('pip');
      if (fs && !inFs) return no('otherfs');
      if (inFs ? !s.fullscreenGlow : !s.pageGlow) return no(inFs ? 'fsoff' : 'pageoff');
      const r = v.getBoundingClientRect();
      if (r.width < s.minWidth || r.height < s.minWidth * 0.4) return no('small');
      if (now - this.visAt > 500) {
        this.visAt = now;
        const cs = getComputedStyle(v);
        this.visOk = cs.visibility !== 'hidden' && cs.display !== 'none' &&
          parseFloat(cs.opacity) > 0.05;
      }
      if (!this.visOk) return no('hidden');
      this.why = this.userOff ? 'useroff' : 'ok';
      return true;
    }

    // ── автоопределение чёрных полос внутри самого видео ──
    updateCrop(now) {
      const v = this.v;
      if (now - this.cropAt < 600) return;
      this.cropAt = now;
      if (v.readyState < 2) return;
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return;
      const pw = 96, ph = Math.max(24, Math.round(pw * vh / vw));
      if (!this.probe) {
        const cv = document.createElement('canvas');
        this.probe = { cv, ctx: cv.getContext('2d', { willReadFrequently: true }) };
      }
      const p = this.probe;
      if (p.cv.width !== pw || p.cv.height !== ph) { p.cv.width = pw; p.cv.height = ph; }
      let data;
      try {
        p.ctx.drawImage(v, 0, 0, pw, ph);
        data = p.ctx.getImageData(0, 0, pw, ph).data;
        this.readable = true;
      } catch (e) {
        this.readable = false;       // кадр прочитать нельзя (чужой домен без CORS)
        this.cropAt = now + 10000;
        return;
      }

      const next = detectBars(data, pw, ph);
      const cur = this.crop;
      const eq = (a, b) => Math.abs(a.t - b.t) < 1e-3 && Math.abs(a.b - b.b) < 1e-3 &&
        Math.abs(a.l - b.l) < 1e-3 && Math.abs(a.r - b.r) < 1e-3;
      const shrink = next.t < cur.t - 1e-3 || next.b < cur.b - 1e-3 ||
        next.l < cur.l - 1e-3 || next.r < cur.r - 1e-3;

      if (shrink) {
        // в полосах появилась картинка — сразу отдаём её свечению
        this.crop = { t: Math.min(cur.t, next.t), b: Math.min(cur.b, next.b),
          l: Math.min(cur.l, next.l), r: Math.min(cur.r, next.r) };
        this.cropPend = null;
        this.forceDraw = true;
      } else if (!eq(next, cur)) {
        // новые полосы принимаем только если они устойчивы ~2 секунды
        if (this.cropPend && eq(this.cropPend.v, next)) {
          if (++this.cropPend.n >= 3) { this.crop = next; this.cropPend = null; this.forceDraw = true; }
        } else {
          this.cropPend = { v: next, n: 1 };
        }
      } else {
        this.cropPend = null;
      }
    }

    // ── авто-снижение частоты, если устройство не успевает ──
    adaptFps(now) {
      const target = fpsLimit();
      if (!this.s.adaptive) { this.fpsCap = target; return; }
      if (now - this.adaptAt >= 2000) {
        this.adaptAt = now;
        if (this.drawEma > 8) this.fpsCap = Math.max(10, this.fpsCap * 0.75);
        else if (this.drawEma < 3) this.fpsCap = Math.min(target, this.fpsCap * 1.15);
      }
      this.fpsCap = Math.min(this.fpsCap, target);
    }

    // ── геометрия и размещение ──
    layout(fs) {
      const v = this.v, s = this.s;
      let mode = 'inline';
      if (fs && isInside(v, fs)) {
        if (fs === v) mode = 'bare';
        else if (NO_HOST_TAGS.has(fs.tagName.toUpperCase())) return false;
        else mode = s.fullscreenFill ? 'fs' : 'inline';
      }
      if (mode !== this.mode) this.switchMode(mode);
      if (mode === 'bare') return true;

      const over = mode === 'inline' && s.pageMode !== 'under';
      this.applyRootStyle(mode, over);

      const c = contentRect(v);
      if (!(c.width > 0 && c.height > 0)) return false;

      // картинка без чёрных полос, вшитых в видео
      let cr = s.cropBars ? this.crop : NO_CROP;
      let pic = c;
      if (cr.t || cr.b || cr.l || cr.r) {
        const pw = c.width * (1 - cr.l - cr.r), ph = c.height * (1 - cr.t - cr.b);
        if (pw > 8 && ph > 8) {
          const pl = c.left + cr.l * c.width, pt = c.top + cr.t * c.height;
          pic = { left: pl, top: pt, right: pl + pw, bottom: pt + ph, width: pw, height: ph };
        } else {
          cr = NO_CROP;
        }
      }

      let L, T, R, B, host;
      if (mode === 'fs') {
        host = fs;
        this.cleanBackgrounds(fs);
        const hr = fs.getBoundingClientRect();
        const over2 = Math.ceil(s.blur * 2) + 8;   // запас, чтобы края не бледнели от размытия
        L = hr.left - over2; T = hr.top - over2; R = hr.right + over2; B = hr.bottom + over2;
      } else {
        const pad = (s.spread / 100) * Math.min(c.width, c.height);
        L = c.left - pad; T = c.top - pad; R = c.right + pad; B = c.bottom + pad;
        if (s.fillBars) {
          const b = v.getBoundingClientRect();
          L = Math.min(L, b.left); T = Math.min(T, b.top);
          R = Math.max(R, b.right); B = Math.max(B, b.bottom);
        }
        if (s.shape === 'circle') {
          // эллипс, описанный вокруг рамки, чтобы углы видео тоже были подсвечены
          const cx = (L + R) / 2, cy = (T + B) / 2;
          const a = ((R - L) / 2) * Math.SQRT2, b2 = ((B - T) / 2) * Math.SQRT2;
          L = cx - a; R = cx + a; T = cy - b2; B = cy + b2;
        }
        host = over ? (fs || document.documentElement) : v.parentNode;
        if (!host) return false;
        if (fs && !isInside(host, fs)) host = fs;
      }

      if (this.root.parentNode !== host) host.appendChild(this.root);

      const g = this.geometry(c, pic, cr, L, T, R, B);
      this.geo = g;
      const origin = this.root.getBoundingClientRect();
      this.css('left', r1(g.left - origin.left) + 'px');
      this.css('top', r1(g.top - origin.top) + 'px');
      this.css('width', r1(g.W) + 'px');
      this.css('height', r1(g.H) + 'px');

      // форма рамки (обрезка краёв холста; мягкость края даёт маска)
      let br = '0px';
      if (mode === 'inline') {
        if (s.shape === 'circle') br = '50%';
        else if (s.shape === 'rounded') br = r1(Math.min(g.W, g.H) * s.radius / 100) + 'px';
      }
      this.css('border-radius', br);

      // вырез под само видео (когда свечение лежит поверх страницы)
      let clip = 'none';
      if (over) {
        // Внешний контур шире холста на размах размытия: clip-path срабатывает ПОСЛЕ filter,
        // и без запаса он резал бы «хвост» размытия по границе рамки (видимый резкий край).
        const m = Math.ceil(s.blur * 3) + 4;
        clip = 'path(evenodd,"M' + (-m) + ' ' + (-m) + 'H' + r1(g.W + m) + 'V' + r1(g.H + m) + 'H' + (-m) +
          'Z M' + r1(g.hx) + ' ' + r1(g.hy) + 'H' + r1(g.hx + g.hw) + 'V' + r1(g.hy + g.hh) + 'H' +
          r1(g.hx) + 'Z")';
      }
      this.css('clip-path', clip);
      this.layoutUi(mode, c, fs);
      return true;
    }

    // Размеры холста и положение видео внутри него (в css-пикселях и в пикселях холста).
    // c — область видео на экране (вырез), pic — область «живой» картинки внутри неё.
    geometry(c, pic, cr, L, T, R, B) {
      const s = this.s;
      const sw = Math.round(s.sample);
      const sh = Math.max(4, Math.round(sw * pic.height / pic.width));
      const kx = sw / pic.width, ky = sh / pic.height;
      const g = {
        sw, sh, hw: c.width, hh: c.height, cr,
        crKey: cr.t.toFixed(3) + cr.b.toFixed(3) + cr.l.toFixed(3) + cr.r.toFixed(3)
      };
      if (s.seamless) {
        // холст в масштабе экрана: картинка — внутри, вокруг — зеркальное продолжение
        const cap = 1500;
        const ox = Math.min(cap, Math.ceil(Math.max(0, pic.left - L) * kx));
        const oy = Math.min(cap, Math.ceil(Math.max(0, pic.top - T) * ky));
        const rx = Math.min(cap, Math.ceil(Math.max(0, R - pic.right) * kx));
        const ry = Math.min(cap, Math.ceil(Math.max(0, B - pic.bottom) * ky));
        g.seam = true;
        g.ox = ox; g.oy = oy;
        g.cw = ox + sw + rx; g.ch = oy + sh + ry;
        g.W = g.cw / kx; g.H = g.ch / ky;
        g.left = pic.left - ox / kx; g.top = pic.top - oy / ky;
      } else {
        // как раньше: кадр растягивается на всю рамку
        g.seam = false;
        g.ox = 0; g.oy = 0;
        g.cw = sw; g.ch = sh;
        g.W = R - L; g.H = B - T;
        g.left = L; g.top = T;
      }
      g.hx = c.left - g.left; g.hy = c.top - g.top;
      return g;
    }

    css(prop, val) {
      if (this.cache[prop] !== val) {
        this.cache[prop] = val;
        this.canvas.style.setProperty(prop, val, 'important');
      }
    }

    applyRootStyle(mode, over) {
      const s = this.s;
      const key = mode + '|' + (over ? s.pageMode : 'under');
      if (this.rootKey === key) return;
      this.rootKey = key;
      setImp(this.root, {
        'z-index': over ? '2147483646' : '-1',
        // mix-blend-mode должен стоять на корне: он создаёт stacking context
        'mix-blend-mode': over && s.pageMode === 'screen' ? 'screen' : 'normal',
        width: mode === 'fs' ? '100vw' : '0',
        height: mode === 'fs' ? '100vh' : '0',
        overflow: mode === 'fs' ? 'hidden' : 'visible'
      });
    }

    switchMode(mode) {
      if (this.mode === 'bare') this.restoreBare();
      if (this.mode === 'fs') this.restoreBackgrounds();
      this.mode = mode;
      this.cache = {};
      this.rootKey = '';
      if (mode === 'bare') {
        this.root.remove();
        this.removeUi();
        this.startBare();
      }
    }

    // ── кадр → маленький canvas (с продолжением краёв и маской) ──
    draw(now) {
      const v = this.v, s = this.s;
      if (v.readyState < 2) return;
      const bare = this.mode === 'bare';
      const g = bare ? null : this.geo;
      if (!bare && !g) return;
      const gkey = bare ? 'bare' + (s.cropBars ? this.crop.t + '|' + this.crop.l : '') :
        g.cw + 'x' + g.ch + '|' + g.sw + 'x' + g.sh + '|' + (g.seam ? 1 : 0) + '|' + g.crKey;

      if (!this.forceDraw && gkey === this.drawnKey) {
        const interval = 1000 / this.fpsCap;
        if (this.lastDraw && now - this.lastDraw < interval - 2) return;
        if (this.lastDraw && v.currentTime === this.lastTime) return;
      }
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return;
      this.forceDraw = false;
      this.drawnKey = gkey;
      this.lastDraw = now;
      this.lastTime = v.currentTime;
      const t0 = performance.now();

      if (bare) {
        const sw = Math.round(s.sample);
        this.drawBare(sw, Math.max(4, Math.round(sw * vh / vw)));
        return;
      }

      const cr = g.cr;
      const tile = this.tile, tctx = this.tctx;
      if (tile.width !== g.sw || tile.height !== g.sh) { tile.width = g.sw; tile.height = g.sh; }
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      try {
        tctx.drawImage(v, cr.l * vw, cr.t * vh, vw * (1 - cr.l - cr.r), vh * (1 - cr.t - cr.b),
          0, 0, g.sw, g.sh);
      } catch (e) { return; }

      const cv = this.canvas, ctx = this.ctx;
      if (cv.width !== g.cw || cv.height !== g.ch) { cv.width = g.cw; cv.height = g.ch; }
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;

      if (g.seam) {
        ctx.clearRect(0, 0, g.cw, g.ch);
        const i0 = Math.max(-4, -Math.ceil(g.ox / g.sw));
        const i1 = Math.min(4, Math.ceil((g.cw - g.ox - g.sw) / g.sw));
        const j0 = Math.max(-4, -Math.ceil(g.oy / g.sh));
        const j1 = Math.min(4, Math.ceil((g.ch - g.oy - g.sh) / g.sh));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const x = g.ox + i * g.sw, y = g.oy + j * g.sh;
            const fx = Math.abs(i) % 2 === 1, fy = Math.abs(j) % 2 === 1;   // зеркальные плитки
            ctx.setTransform(fx ? -1 : 1, 0, 0, fy ? -1 : 1, fx ? x + g.sw : x, fy ? y + g.sh : y);
            ctx.drawImage(tile, 0, 0);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.drawImage(tile, 0, 0, g.cw, g.ch);
      }

      // форма, мягкий внешний край и яркость у стыка
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.getMask(g), 0, 0, g.cw, g.ch);
      ctx.globalCompositeOperation = 'source-over';

      const dtm = performance.now() - t0;
      this.drawEma = this.drawEma ? this.drawEma * 0.9 + dtm * 0.1 : dtm;
    }

    getMask(g) {
      const s = this.s, fs = this.mode === 'fs';
      const W = g.W, H = g.H;
      const padMin = Math.max(1, Math.min(g.hx, g.hy, W - g.hx - g.hw, H - g.hy - g.hh));
      const p = {
        shape: fs ? 'rect' : s.shape,
        rr: !fs && s.shape === 'rounded' ? Math.min(W, H) * s.radius / 100 : 0,
        feather: fs ? 0 : padMin * s.feather / 100,   // на весь экран край не гасим
        edgeW: Math.max(24, padMin * 0.7),            // ширина зоны «полная яркость у стыка → яркость свечения»
        op: s.opacity / 100,
        seam: g.seam,
        fade: !fs
      };
      const key = [g.cw, g.ch, Math.round(W), Math.round(H), Math.round(g.hx), Math.round(g.hy),
        Math.round(g.hw), Math.round(g.hh), p.shape, Math.round(p.rr), Math.round(p.feather),
        Math.round(p.edgeW), p.op.toFixed(3), p.seam ? 1 : 0, p.fade ? 1 : 0].join('|');
      if (key !== this.maskKey || !this.mask) {
        this.mask = buildMask(g, p);
        this.maskKey = key;
      }
      return this.mask;
    }

    // ── применение прозрачности/фильтров ──
    paint() {
      const s = this.s;
      const e = this.level * this.level * (3 - 2 * this.level);   // smoothstep
      if (this.mode === 'bare') { this.paintBare((s.opacity / 100) * e); return; }
      this.paintUi(e);
      // «яркость свечения» уже учтена в маске, поэтому здесь только плавное появление
      this.css('opacity', e.toFixed(3));
      this.css('filter', 'blur(' + s.blur + 'px) saturate(' + s.saturation +
        '%) brightness(' + s.brightness + '%)');
    }

    // ── fs: делаем фоны контейнеров прозрачными, иначе они закроют свечение ──
    cleanBackgrounds(top) {
      if (this.cleaned) return;
      this.cleaned = [];
      let el = this.v;
      while (el && el !== top) {
        if (el.nodeType === 1) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== 'transparent' && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(bg)) {
            this.cleaned.push([el, el.style.getPropertyValue('background-color'),
              el.style.getPropertyPriority('background-color')]);
            el.style.setProperty('background-color', 'transparent', 'important');
          }
        }
        el = el.parentNode || el.host || null;
      }
    }

    restoreBackgrounds() {
      if (!this.cleaned) return;
      for (const [el, val, pr] of this.cleaned) {
        el.style.removeProperty('background-color');
        if (val) el.style.setProperty('background-color', val, pr);
      }
      this.cleaned = null;
    }

    // ── bare: на весь экран раскрыт сам <video> ──
    startBare() {
      const v = this.v;
      const props = ['background-image', 'background-size', 'background-repeat', 'background-position'];
      this.bare = {
        saved: props.map((p) => [p, v.style.getPropertyValue(p), v.style.getPropertyPriority(p)]),
        url: null, last: '', cv: null, ctx: null
      };
      setImp(v, { 'background-size': '100% 100%', 'background-repeat': 'no-repeat',
        'background-position': '0 0' });
    }

    drawBare(sw) {
      const b = this.bare, v = this.v, s = this.s;
      if (!b) return;
      const cr = s.cropBars ? this.crop : NO_CROP;
      const vw = v.videoWidth, vh = v.videoHeight;
      const srcW = vw * (1 - cr.l - cr.r), srcH = vh * (1 - cr.t - cr.b);
      const w = Math.max(16, sw);
      const h = Math.max(9, Math.round(w * srcH / srcW));
      if (!b.cv) { b.cv = document.createElement('canvas'); b.ctx = b.cv.getContext('2d'); }
      if (b.cv.width !== w || b.cv.height !== h) { b.cv.width = w; b.cv.height = h; }
      const r = Math.max(1.2, s.blur * w / (v.clientWidth || screen.width || 1920));
      const p = Math.ceil(r * 2);
      const c = b.ctx;
      c.filter = 'blur(' + r.toFixed(2) + 'px) saturate(' + s.saturation +
        '%) brightness(' + s.brightness + '%)';
      try {
        c.drawImage(v, cr.l * vw, cr.t * vh, srcW, srcH, -p, -p, w + 2 * p, h + 2 * p);
        c.filter = 'none';
        // Если видео чужого домена без CORS, canvas «грязный» и toDataURL бросит исключение.
        b.url = b.cv.toDataURL('image/jpeg', 0.8);
        this.readable = true;
      } catch (e) {
        c.filter = 'none';
        this.readable = false;
      }
    }

    paintBare(alpha) {
      const b = this.bare;
      if (!b || !b.url) return;
      const a = (1 - alpha).toFixed(3);
      const val = 'linear-gradient(rgba(0,0,0,' + a + '),rgba(0,0,0,' + a + ')),url("' + b.url + '")';
      if (b.last !== val) {
        b.last = val;
        this.v.style.setProperty('background-image', val, 'important');
      }
    }

    restoreBare() {
      const b = this.bare;
      if (!b) return;
      for (const [p, val, pr] of b.saved) {
        this.v.style.removeProperty(p);
        if (val) this.v.style.setProperty(p, val, pr);
      }
      this.bare = null;
    }

    // ── полностью убрать свечение со страницы ──
    release() {
      this.root.remove();
      this.removeUi();
      this.restoreBare();
      this.restoreBackgrounds();
      this.mode = null;
      this.rootKey = '';
      this.level = 0;
      this.cache = {};
      this.lastDraw = 0;
      this.lastTime = -1;
      this.forceDraw = false;
      this.drawnKey = '';
      this.geo = null;
      this.mask = null;
      this.maskKey = '';
    }

    destroy() {
      this.dead = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      EVENTS.forEach((e) => this.v.removeEventListener(e, this.onEvt));
      this.io.disconnect();
      this.ro.disconnect();
      this.release();
    }
  }

  // ───────────────────────── менеджер видео ─────────────────────────

  const glows = new Map();
  const watchedRoots = new WeakSet();
  let timer = 0;

  function adopt(v) {
    if (!(v instanceof HTMLVideoElement) || glows.has(v)) return;
    glows.set(v, new Glow(v));
  }

  const kickAll = () => glows.forEach((g) => g.kick());

  function scanVideos(root) {
    if (root.querySelectorAll) root.querySelectorAll('video').forEach(adopt);
  }

  function watch(shadow) {
    if (watchedRoots.has(shadow)) return;
    watchedRoots.add(shadow);
    mo.observe(shadow, { childList: true, subtree: true });
  }

  // Ищем видео, в том числе внутри открытых shadow root (Reddit, и т.п.)
  function deepScan(root, depth) {
    scanVideos(root);
    if (depth > 6 || !root.querySelectorAll) return;
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) {
        watch(el.shadowRoot);
        deepScan(el.shadowRoot, depth + 1);
      }
    });
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.localName === 'video') adopt(n);
        else {
          scanVideos(n);
          if (n.shadowRoot) { watch(n.shadowRoot); deepScan(n.shadowRoot, 1); }
        }
      }
    }
  });

  function cleanup() {
    for (const [v, g] of glows) {
      if (!v.isConnected) { g.destroy(); glows.delete(v); }
    }
  }

  // Показываем кнопку на видео, пока мышь над ним.
  const onMove = (e) => {
    const now = performance.now();
    for (const g of glows.values()) {
      const h = g.hr;
      if (h && g.btnOn && e.clientX >= h.l && e.clientX <= h.r && e.clientY >= h.t && e.clientY <= h.b) {
        g.btnUntil = now + 2200;
      }
    }
  };

  const onPlay = (e) => {
    if (e.target instanceof HTMLVideoElement) adopt(e.target);
  };

  // Старый экземпляр (после обновления расширения) снимает себя, чтобы не было двойного свечения.
  function teardown() {
    glows.forEach((g) => g.destroy());
    glows.clear();
    mo.disconnect();
    clearInterval(timer);
    document.removeEventListener('play', onPlay, true);
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('fullscreenchange', kickAll);
    document.removeEventListener('webkitfullscreenchange', kickAll);
    window.removeEventListener('resize', kickAll);
    window.removeEventListener('video-glow-takeover', teardown);
    window.__vgLoaded = false;
  }

  // ───────────────────────── настройки ─────────────────────────

  function applySettings(raw) {
    rawStore = raw;
    settings = normalize(self.VG_effective(raw, siteKey()));
    settingsFs = self.VG_fsView(settings);
    siteOff = computeSiteOff();
    updateBattery();
    glows.forEach((g) => {
      g.forceDraw = true;   // перерисовать кадр с новыми параметрами (даже на паузе)
      g.cache = {};
      g.rootKey = '';
      g.fpsCap = fpsLimit();
      g.kick();
    });
  }

  function initBattery() {
    try {
      if (!navigator.getBattery) return;
      navigator.getBattery().then((b) => {
        battery = b;
        const f = () => { updateBattery(); glows.forEach((g) => { g.fpsCap = fpsLimit(); }); kickAll(); };
        b.addEventListener('chargingchange', f);
        b.addEventListener('levelchange', f);
        updateBattery();
      }).catch(() => { /* нет доступа к батарее */ });
    } catch (e) { /* ignore */ }
  }

  function start() {
    window.dispatchEvent(new Event('video-glow-takeover'));   // снять старый экземпляр
    window.addEventListener('video-glow-takeover', teardown);
    deepScan(document, 0);
    mo.observe(document, { childList: true, subtree: true });
    document.addEventListener('play', onPlay, true);
    document.addEventListener('mousemove', onMove, { capture: true, passive: true });
    document.addEventListener('fullscreenchange', kickAll);
    document.addEventListener('webkitfullscreenchange', kickAll);
    window.addEventListener('resize', kickAll);
    timer = setInterval(() => {
      if (document.hidden) return;
      deepScan(document, 0);
      cleanup();
    }, 4000);
    initBattery();
  }

  // Диагностика для popup: почему свечения нет / что происходит.
  function onMessage(msg, sender, sendResponse) {
    if (!msg || msg.type !== 'vg:status' || glows.size === 0) return;
    let best = null, bestScore = -1;
    for (const g of glows.values()) {
      const score = (g.why === 'ok' ? 1e9 : 0) + g.v.clientWidth;
      if (score > bestScore) { best = g; bestScore = score; }
    }
    sendResponse({ count: glows.size, why: best.why, mode: best.mode, readable: best.readable });
  }

  try {
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.storage.local.get(D, (res) => {
      applySettings(chrome.runtime.lastError ? D : res);
      start();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const next = Object.assign({}, rawStore);
      for (const k in changes) {
        next[k] = changes[k].newValue === undefined ? D[k] : changes[k].newValue;
      }
      applySettings(next);
    });
  } catch (e) {
    applySettings(D);
    start();
  }
})();
