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
  const MAX_GLOWS = 3;                     // одновременно рисуем свечение не более чем у стольких видео
  const PGW = 16, PGH = 9;                 // сетка цветов кадра для ленты, «Цвета комнаты» и Hue

  // ctx.filter есть не везде: без него размытие остаётся на CSS (медленнее, но работает)
  const CTX_FILTER = (() => {
    try {
      const c = document.createElement('canvas').getContext('2d');
      c.filter = 'blur(1px)';
      return c.filter === 'blur(1px)';
    } catch (e) { return false; }
  })();

  let rawStore = {};                       // всё, что лежит в chrome.storage
  let settings = Object.assign({}, D);     // итоговые настройки для страницы (с учётом сайта)
  let settingsFs = settings;               // то же для полного экрана
  let siteOff = false;
  let battery = null;
  let battLow = false;

  // ───────────────────────── утилиты ─────────────────────────

  const now0 = () => performance.now();
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const normHost = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
  const r1 = (x) => Math.round(x * 10) / 10;
  const r3 = (x) => Math.max(0, Math.round(x * 1000) / 1000);
  const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  function setImp(el, obj) {
    for (const k in obj) el.style.setProperty(k, obj[k], 'important');
  }

  // ── Ночной комфорт: в заданные часы видео теплеет и темнеет, свечение приглушается ──
  const NIGHT_OFF = Object.freeze({ on: false, warm: 0, dark: 1, glow: 1 });
  let nightCache = { at: 0, key: '', val: NIGHT_OFF };
  function night(s) {
    if (!s.nightOn) return NIGHT_OFF;
    const nowMs = Date.now();
    const key = s.nightFrom + '|' + s.nightTo + '|' + s.nightStrength;
    if (nightCache.key === key && nowMs - nightCache.at < 1000) return nightCache.val;
    const h = new Date(nowMs).getHours(), f = s.nightFrom, t = s.nightTo;
    const on = f === t ? true : f < t ? (h >= f && h < t) : (h >= f || h < t);
    const k = s.nightStrength / 100;
    const val = on ? { on: true, warm: k * 70, dark: 1 - k * 0.25, glow: 1 - k * 0.35 } : NIGHT_OFF;
    nightCache = { at: nowMs, key, val };
    return val;
  }

  // ── Фильтры видео: резкость, тёплые тона и гамма — через SVG-фильтр рядом с видео ──
  const fxNodes = new WeakMap();
  function fxFor(v) {
    const root = (v.getRootNode && v.getRootNode()) || document;
    let n = fxNodes.get(root);
    if (n && n.svg.isConnected) return n;
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };
    const id = 'vgfx' + Math.random().toString(36).slice(2, 8);
    const svg = mk('svg', { width: '0', height: '0', 'aria-hidden': 'true' });
    setImp(svg, { position: 'absolute', width: '0', height: '0', 'pointer-events': 'none', overflow: 'hidden' });
    const f = mk('filter', { id, x: '0', y: '0', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' });
    const conv = mk('feConvolveMatrix', { order: '3', kernelMatrix: '0 0 0 0 1 0 0 0 0', divisor: '1',
      bias: '0', edgeMode: 'duplicate', preserveAlpha: 'true' });
    const mat = mk('feColorMatrix', { type: 'matrix', values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0' });
    const ct = mk('feComponentTransfer', {});
    const funcs = ['R', 'G', 'B'].map((c) => {
      const fn = mk('feFunc' + c, { type: 'gamma', amplitude: '1', exponent: '1', offset: '0' });
      ct.appendChild(fn);
      return fn;
    });
    f.append(conv, mat, ct);
    svg.appendChild(f);
    (root === document ? document.documentElement : root).appendChild(svg);
    n = {
      id, svg, key: '',
      set(sharp, warm, gamma) {
        const key = sharp + '|' + warm + '|' + gamma;
        if (key === this.key) return;
        this.key = key;
        const a = (sharp / 100) * 0.9;
        conv.setAttribute('kernelMatrix', '0 ' + -a + ' 0 ' + -a + ' ' + (1 + 4 * a) + ' ' + -a + ' 0 ' + -a + ' 0');
        const w = warm / 100;
        mat.setAttribute('values', (1 + 0.14 * w) + ' 0 0 0 0 0 ' + (1 + 0.02 * w) + ' 0 0 0 0 0 ' +
          (1 - 0.22 * w) + ' 0 0 0 0 0 1 0');
        const ex = String(100 / gamma);
        funcs.forEach((fn) => fn.setAttribute('exponent', ex));
      }
    };
    fxNodes.set(root, n);
    return n;
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
    n('roomLevel', 0, 100);
    n('ledCount', 8, 160);
    if (!['soft', 'led'].includes(o.glowStyle)) o.glowStyle = D.glowStyle;
    o.room = !!o.room;
    o.hueOn = !!o.hueOn;
    o.wledOn = !!o.wledOn;
    o.haOn = !!o.haOn;
    n('pauseDelay', 0, 600);
    n('fsBlur', 0, 200);
    n('fsOpacity', 0, 100);
    n('fsSaturation', 0, 400);
    n('fsBrightness', 20, 300);
    n('fsFadeMs', 0, 10000);
    n('fsSpread', 0, 100);
    n('fsFeather', 0, 100);
    n('fsRadius', 0, 50);
    o.fsShapeOwn = !!o.fsShapeOwn;
    if (!['rect', 'rounded', 'circle'].includes(o.fsShape)) o.fsShape = D.fsShape;
    ['barT', 'barB', 'barL', 'barR'].forEach((k) => n(k, 0, 45));
    n('barsFill', 0, 100);
    n('guardSens', 1, 3);
    n('guardStrength', 0, 100);
    n('calm', 0, 100);
    n('pulseAmount', 0, 100);
    n('sceneAmount', 0, 100);
    o.scene = !!o.scene;
    if (!['normal', 'soft', 'cinema', 'sharp'].includes(o.colorCurve)) o.colorCurve = D.colorCurve;
    n('fxBrightness', 40, 200);
    n('fxContrast', 40, 200);
    n('fxSaturation', 0, 250);
    n('fxSharp', 0, 100);
    n('fxWarmth', -100, 100);
    n('fxGamma', 50, 200);
    n('nightFrom', 0, 23);
    n('nightTo', 0, 23);
    n('nightStrength', 0, 100);
    ['barsHide', 'guard', 'pulse', 'fxOn', 'nightOn'].forEach((k) => { o[k] = !!o[k]; });
    o.guardVideo = o.guardVideo !== false;
    if (!['auto', 'force', 'manual'].includes(o.barsMode)) o.barsMode = D.barsMode;
    if (!['bass', 'all'].includes(o.pulseMode)) o.pulseMode = D.pulseMode;
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
  function contentRect(v, box) {
    const r = box || v.getBoundingClientRect();
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
  // opts.force (Pro): порог ярче (серые/шумные полосы), терпимость к логотипам и субтитрам выше,
  // полосы с разных сторон принимаются независимо (не обязаны быть симметричными).
  function detectBars(data, w, h, opts) {
    const force = !!(opts && opts.force);
    const thr = force ? 46 : 28, tol = force ? 0.09 : 0.04;
    const none = { t: 0, b: 0, l: 0, r: 0 };
    const bright = (x, y) => {
      const i = (y * w + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] > thr;
    };
    // строка/столбец «чёрные», если ярких пикселей ≤ 4% (так субтитры в полосе не мешают)
    const rowBlack = (y, x0, x1) => {
      let n = 0;
      for (let x = x0; x < x1; x++) if (bright(x, y)) n++;
      return n <= (x1 - x0) * tol;
    };
    const colBlack = (x, y0, y1) => {
      let n = 0;
      for (let y = y0; y < y1; y++) if (bright(x, y)) n++;
      return n <= (y1 - y0) * tol;
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
    if (force) { if (t < 2) t = 0; if (b < 2) b = 0; }
    else if (t < 2 || Math.abs(t - b) > 2) { t = 0; b = 0; }

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
    if (force) { if (l < 2) l = 0; if (r < 2) r = 0; }
    else if (l < 2 || Math.abs(l - r) > 2) { l = 0; r = 0; }

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
      this.curCr = NO_CROP;    // доли кадра, которые реально показаны (после полос и зума)
      // Pro: зум без чёрных полос
      this.zc = null;          // текущее состояние зума {k,fx,fy,it,ib,il,ir}
      this.zApplied = null;    // что записано в style видео {k,fx,fy}
      this.zStr = '';
      this.zSaved = null;
      this.zOff = false;       // сайт сам трогает transform/clip-path — не вмешиваемся
      this.zs = null;          // результат последнего шага зума для layout
      this.zT = 0;
      // Pro: защита от вспышек
      this.gcv = null; this.gctx = null; this.gT = -1; this.gAt = 0;
      this.gLast = -1; this.gEvts = []; this.guardUntil = 0; this.gLevel = 0;
      this.gBad = false;
      // Pro: пульс от звука
      this.au = null; this.auFail = 0; this.auRetry = 0; this.pk = 0; this.pv = 0; this.pvOut = 0;
      this.bgT = 0; this.zAnim = false; this.gDir = 0;
      // Реакция на сцену: вспышка на резкой смене кадра, «вдох» на тёмных сценах
      this.scv = null; this.sctx = null; this.sAt = 0; this.sT = -1; this.sPrev = null; this.sBad = false;
      this.sL = -1; this.sSlow = -1; this.sF = 0; this.sFT = 0; this.sFlashAt = 0; this.sCuts = [];
      this.sQuiet = 0; this.cutAt = 0; this.sDark = 0;
      this.ap = null; this.apS = null;   // автопресет: состояние и статистика окна
      this.feedAt = 0;
      this.curSc = 1; this.pulseAt = 0; this.clipInfo = null;
      // Pro: фильтры видео
      this.fxKey = ''; this.fxSaved = null;
      this.tileFresh = true;
      this.fkey = ''; this.baked = false; this.wk = null; this.wctx = null; this.ml = null; this.mlctx = null; this.av = null; this.bmask = null; this.bmaskKey = '';
      this.rect = null; this.lkKey = ''; this.lkAt = 0; this.lkFs = null; this.lkS = null; this.lkCrop = null;
      this.candAt = 0; this.area = 0;
      // цвета кадра (сетка PGW×PGH) и то, что из них строится
      this.pc = null; this.pcAt = 0; this.pcv = null; this.pctx = null;
      this.rc = null; this.roomAt = 0; this.roomOn = false; this.hueAt = 0;

      this.root = null;   // DOM создаётся при первом показе (ensureDom), а не для каждого <video> на странице
      this.canvas = null; this.ctx = null; this.tile = null; this.tctx = null;

      this.loop = (now) => { this.raf = 0; this.frame(now); };
      // ровное свечение во время игры обновляется по кадрам видео, а не на частоте монитора (144 Гц и т.п.)
      this.vloop = (now) => { clearTimeout(this.vfcT); this.vfc = 0; this.raf = 0; this.frame(now); };
      this.vlate = () => { if (this.vfc) { this.unVfc(); this.steady = false; this.next(); } };   // кадров нет — назад к rAF
      this.onEvt = (e) => {
        if (e && e.type === 'emptied') { this.played = false; this.pausedAt = 0; this.zOff = false; this.audioClose(); }
        if (e && (e.type === 'play' || e.type === 'playing')) this.played = true;
        if (e && RESET_CROP_EVENTS.has(e.type)) { this.crop = NO_CROP; this.cropPend = null; this.cropAt = 0; }
        this.kick();
      };
      EVENTS.forEach((e) => video.addEventListener(e, this.onEvt));

      sharedIo.observe(video);
      sharedRo.observe(video);

      this.kick();
    }

    ensureDom() {
      if (this.root) return;
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
      // «Цвет комнаты»: слой на весь экран, осветляет страницу цветами видео (blend — на самом корне,
      // иначе он смешивался бы только внутри своего stacking context). Ниже затемнения и свечения.
      this.roomRoot = mk('video-glow-room', Object.assign({}, base, {
        'z-index': '2147483644', 'mix-blend-mode': 'screen', opacity: '0'
      }));
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
      // шестерёнка: открыть плавающую панель настроек поверх видео
      this.gear = mk('video-glow-gear', {
        display: 'flex', position: 'absolute', 'align-items': 'center', 'justify-content': 'center',
        width: '30px', height: '30px', margin: '0', padding: '0', 'box-sizing': 'border-box',
        'border-radius': '50%', border: '1px solid rgba(255,255,255,.35)',
        background: 'rgba(18,18,26,.72)', color: '#fff', font: '16px/1 system-ui,sans-serif',
        cursor: 'pointer', opacity: '0', 'pointer-events': 'none', 'user-select': 'none',
        transition: 'opacity .2s'
      });
      this.gear.textContent = '\u2699';
      try { this.gear.title = chrome.i18n.getMessage('hover_gear_tip') || 'Settings'; } catch (e) { /* ignore */ }
      ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'touchstart'].forEach((ev) => {
        this.gear.addEventListener(ev, (e) => {
          e.stopPropagation();
          if (ev === 'click') { e.preventDefault(); this.btnUntil = performance.now() + 2200; togglePanel(); }
        });
      });
      this.gear.addEventListener('mouseenter', () => { this.btnHover = true; });
      this.gear.addEventListener('mouseleave', () => { this.btnHover = false; this.btnUntil = performance.now() + 1200; });
      this.uiRoot.appendChild(this.gear);
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
      const wantRoom = s.room && mode === 'inline' && !fs;
      const host = fs || document.documentElement;
      this.dimOn = wantDim;
      this.roomOn = wantRoom;
      if (wantRoom) {
        if (this.roomRoot.parentNode !== host) host.appendChild(this.roomRoot);
        const W = window.innerWidth, H = window.innerHeight;
        const x0 = r1(c.left), y0 = r1(c.top), x1 = r1(c.right), y1 = r1(c.bottom);
        this.roomBox = { cx: r1((c.left + c.right) / 2), cy: r1((c.top + c.bottom) / 2) };
        this.roomKey = '';
        this.uiSet(this.roomRoot, 'room', {
          width: W + 'px', height: H + 'px',
          'clip-path': 'path(evenodd,"M0 0H' + W + 'V' + H + 'H0Z M' + x0 + ' ' + y0 + 'H' + x1 +
            'V' + y1 + 'H' + x0 + 'Z")'
        });
      } else if (this.roomRoot.parentNode) {
        this.roomRoot.remove();
      }
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
        // место под обе кнопки (✦ и ⚙ рядом), чтобы шестерёнка не уходила за правый край экрана
        const bx = Math.max(c.left + 4, Math.min(c.right - 78, window.innerWidth - 76));
        const by = Math.max(4, Math.min(c.top + 12, window.innerHeight - 36));
        this.uiSet(this.btn, 'btn', { left: r1(bx - o.left) + 'px', top: r1(by - o.top) + 'px' });
        this.uiSet(this.gear, 'gear', { left: r1(bx - o.left + 36) + 'px', top: r1(by - o.top) + 'px' });
      } else if (this.uiRoot.parentNode) {
        this.uiRoot.remove();
      }
    }

    paintUi(e) {
      const s = this.s;
      if (this.roomOn) this.paintRoom(e);
      if (this.dimOn) this.uiSet(this.dimEl, 'dimA', { opacity: (e * s.dimLevel / 100).toFixed(3) });
      if (this.btnOn) {
        const show = this.btnHover || performance.now() < this.btnUntil;
        const on = !this.userOff;
        this.uiSet(this.btn, 'btnS', {
          opacity: show ? '1' : '0', 'pointer-events': show ? 'auto' : 'none',
          'box-shadow': on ? '0 0 10px 2px rgba(255,79,163,.75), 0 0 16px 4px rgba(63,208,255,.35)' : 'none',
          color: on ? '#fff' : 'rgba(255,255,255,.4)'
        });
        this.uiSet(this.gear, 'gearS', { opacity: show ? '1' : '0', 'pointer-events': show ? 'auto' : 'none' });
      }
    }

    removeUi() {
      if (this.dimRoot) this.dimRoot.remove();
      if (this.uiRoot) this.uiRoot.remove();
      if (this.roomRoot) this.roomRoot.remove();
      this.dimOn = false;
      this.roomOn = false;
      this.rc = null;
      this.btnOn = false;
      this.hr = null;
      this.btnHover = false;
      this.uiCache = {};
    }

    // Внешний повод (событие видео, прокрутка, настройки) — ответить на ближайшем кадре экрана.
    kick() {
      if (this.vfc) this.unVfc();
      this.next();
    }

    next() {
      if (this.raf || this.dead) return;
      const v = this.v;
      if (this.steady && v.requestVideoFrameCallback && !v.paused && performance.now() - motionAt > 400) {
        this.vfc = v.requestVideoFrameCallback(this.vloop);
        this.vfcT = setTimeout(this.vlate, 300);
        this.raf = -1;
      } else {
        this.raf = requestAnimationFrame(this.loop);
      }
    }

    unVfc() {
      try { this.v.cancelVideoFrameCallback(this.vfc); } catch (e) { /* ignore */ }
      clearTimeout(this.vfcT);
      this.vfc = 0; this.raf = 0;
    }

    // ── главный цикл (работает, пока видео играет или свечение гаснет) ──
    frame(now) {
      if (this.dead) return;
      this.steady = false;
      const fs = getFsElement();
      const inFs = !!fs && isInside(this.v, fs);
      const s = this.s = this.autoView(inFs ? settingsFs : settings, now);
      const v = this.v;
      this.rect = null;
      const active = this.isActive(now, fs, inFs);
      const lit = active && !this.userOff;
      const target = lit ? 1 : 0;
      const fade = s.fadeMs;
      const dt = this.lastStep ? Math.min(100, now - this.lastStep) : 0;
      this.lastStep = now;
      const bdt = this.bgT ? Math.min(100, now - this.bgT) : 0;
      this.bgT = now;

      // ── Pro: работает независимо от самого свечения (защита, зум, фильтры) ──
      const live = s.enabled && !siteOff;
      const playing = live && !v.paused && !v.ended && v.readyState >= 2 && !!v.videoWidth && this.inView;
      if (live && s.guard) this.guardStep(now, bdt, playing);
      else if (this.gLevel) { this.gLevel = 0; this.guardUntil = 0; this.gEvts = []; this.gLast = -1; }
      if (playing && this.wantDetect(s) && (lit || s.barsHide)) this.updateCrop(now);
      if (lit && playing && (s.scene || s.colorCurve === 'cinema' || s.autoPreset)) this.sceneStep(now, bdt);
      else if (this.sF || this.sDark || this.sFT) { this.sF = 0; this.sFT = 0; this.sDark = 0; this.sPrev = null; }
      this.zoomTick(bdt);
      this.applyFx();
      // видео в «картинке в картинке»: свечения на странице нет, но лампы и окно-подсветка получают цвет
      const feed = live && !this.userOff && document.pictureInPictureElement === v && !v.paused && v.readyState >= 2 &&
        (s.hueOn || s.wledOn || s.haOn || !!pipWin);
      if (feed) this.feed(now);
      const keep = (live && s.guard && playing) || this.gLevel > 0.001 || this.zAnim || feed;

      if (fade <= 0) this.level = target;
      else if (this.level < target) this.level = Math.min(target, this.level + dt / fade);
      else if (this.level > target) this.level = Math.max(target, this.level - dt / fade);

      if (!active && this.level <= 0) {
        this.release();
        this.lastStep = 0;
        if (keep) this.next();
        return;
      }
      if (!this.layout(fs)) {
        this.release();
        this.lastStep = 0;
        if (active || keep) this.next();
        return;
      }
      if (lit) {
        this.adaptFps(now);
        this.draw(now);
      }
      this.pulseStep(now, bdt, lit);
      this.paint();
      this.steady = lit && playing && this.level >= 1 && !s.pulse && !this.zAnim && !this.gLevel &&
        this.sF < 0.005 && this.sDark < 0.01;
      this.next();
    }

    // ── Pro: определение полос нужно, если включено авто-определение или принудительный режим ──
    wantDetect(s) {
      return s.barsMode !== 'manual' && (s.cropBars || s.barsMode === 'force');
    }

    // Полосы, вшитые в кадр, в долях кадра: ручные, найденные или никаких.
    baseCrop(s) {
      if (s.barsMode === 'manual') {
        const t = s.barT / 100, b = s.barB / 100, l = s.barL / 100, r = s.barR / 100;
        return (t + b < 0.9 && l + r < 0.9 && (t || b || l || r)) ? { t, b, l, r } : NO_CROP;
      }
      return (s.cropBars || s.barsMode === 'force') ? this.crop : NO_CROP;
    }

    // ── Pro: защита от вспышек ──
    guardStep(now, dt, playing) {
      if (playing && !this.gBad) this.guardSample(now);
      const tgt = playing && now < this.guardUntil ? 1 : 0;
      if (tgt > this.gLevel) this.gLevel = Math.min(1, this.gLevel + dt / 150);
      else this.gLevel = Math.max(0, this.gLevel - dt / 900);
      if (!playing) { this.gEvts = []; this.gLast = -1; }
    }

    // Средняя яркость маленького кадра; частые резкие скачки вверх-вниз — это вспышки.
    guardSample(now) {
      const v = this.v;
      if (v.currentTime === this.gT || now - this.gAt < 45) return;   // ~20 выборок в секунду достаточно для вспышек 3+ Гц
      this.gAt = now;
      this.gT = v.currentTime;
      if (!this.gcv) {
        this.gcv = document.createElement('canvas');
        this.gcv.width = 32; this.gcv.height = 18;
        this.gctx = this.gcv.getContext('2d', { willReadFrequently: true });
      }
      let d;
      try {
        this.gctx.drawImage(v, 0, 0, 32, 18);
        d = this.gctx.getImageData(0, 0, 32, 18).data;
      } catch (e) { this.gBad = true; this.readable = false; return; }
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const L = sum / (576 * 255);
      if (this.gLast < 0) { this.gLast = L; this.gDir = 0; return; }
      const thr = [0, 0.2, 0.12, 0.07][this.s.guardSens] || 0.12;
      let ev = 0;
      if (L - this.gLast >= thr) ev = 1;
      else if (this.gLast - L >= thr) ev = -1;
      if (ev) {
        this.gLast = L; this.gDir = ev;
        const last = this.gEvts[this.gEvts.length - 1];
        if (!last || last.dir !== ev) this.gEvts.push({ t: now, dir: ev }); else last.t = now;
      } else if ((this.gDir > 0 && L > this.gLast) || (this.gDir < 0 && L < this.gLast)) {
        this.gLast = L;   // идём за пиком, чтобы плавный рост/спад тоже считался
      }
      while (this.gEvts.length && now - this.gEvts[0].t > 1000) this.gEvts.shift();
      if (this.gEvts.length >= 6) this.guardUntil = now + 2500;   // 3+ вспышки в секунду
    }

    // ── Реакция на сцену (и кривая «Кино»): кадр 16×9 ~12 раз в секунду ──
    // Смена сцены = средняя разница ячеек с прошлой выборкой. Вспышка только на резком скачке яркости
    // вверх, не чаще раза в 1,2 с; три смены за 2 с — это мелькание, и вспышки молчат 3 с.
    // Защита от вспышек (guard) важнее: пока она работает, эффектов нет.
    sceneStep(now, dt) {
      const s = this.s;
      if (!this.sBad && this.v.currentTime !== this.sT && now - this.sAt >= 80) this.sceneSample(now);
      const guardOn = s.guard && (this.gLevel > 0.01 || now < this.guardUntil);
      if (guardOn || !s.scene) this.sFT = 0;
      // нарастание за ~80 мс (не «удар»), затухание ~350 мс
      if (this.sFT > this.sF) this.sF = Math.min(this.sFT, this.sF + dt / 80);
      else this.sF = Math.max(0, this.sF - (this.sF - this.sFT) * Math.min(1, dt / 120));
      this.sFT *= Math.exp(-dt / 350);
      if (this.sFT < 0.003) this.sFT = 0;
      if (this.sF < 0.003 && !this.sFT) this.sF = 0;
      const darkT = s.scene && !guardOn && this.sSlow >= 0 ? smooth((0.16 - this.sSlow) / 0.1) : 0;
      this.sDark += (darkT - this.sDark) * Math.min(1, dt / 800);
      if (this.sDark < 0.005 && !darkT) this.sDark = 0;
    }

    sceneSample(now) {
      const v = this.v;
      const gap = this.sAt ? now - this.sAt : 0;
      this.sAt = now; this.sT = v.currentTime;
      if (!this.scv) {
        this.scv = document.createElement('canvas');
        this.scv.width = 16; this.scv.height = 9;
        this.sctx = this.scv.getContext('2d', { willReadFrequently: true });
      }
      let d;
      try {
        this.sctx.drawImage(v, 0, 0, 16, 9);
        d = this.sctx.getImageData(0, 0, 16, 9).data;
      } catch (e) { this.sBad = true; return; }
      const cur = this.sNext || new Float32Array(144);   // два буфера по очереди, без мусора
      let sum = 0, diff = 0;
      for (let i = 0, c = 0; c < 144; i += 4, c++) {
        const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        cur[c] = l; sum += l;
        if (this.sPrev) diff += Math.abs(l - this.sPrev[c]);
      }
      const L = sum / 144;
      if (this.s.autoPreset) this.autoStat(d, cur, L, this.sPrev && gap <= 400 ? diff / 144 : -1);
      if (!this.sPrev || gap > 400) {      // начало или долгий перерыв (перемотка, вкладка) — без реакции
        this.sNext = this.sPrev; this.sPrev = cur;
        this.sL = L; this.sSlow = L;
        return;
      }
      diff /= 144;
      const prevL = this.sL;
      this.sNext = this.sPrev; this.sPrev = cur;
      this.sL = L;
      this.sSlow += (L - this.sSlow) * Math.min(1, gap / 1500);
      if (diff < 0.14) return;
      this.cutAt = now;
      this.sCuts.push(now);
      while (this.sCuts.length && now - this.sCuts[0] > 2000) this.sCuts.shift();
      if (this.sCuts.length >= 3) { this.sQuiet = now + 3000; return; }
      const jump = L - prevL;
      if (jump < 0.08 || now < this.sQuiet || now - this.sFlashAt < 1200) return;
      this.sFlashAt = now;
      this.sFT = Math.min(1, jump * 4) * (this.s.sceneAmount / 100);
    }

    // ── Pro: фильтры видео, защита и ночной режим складываются в один CSS-фильтр ──
    applyFx() {
      const s = this.s, v = this.v;
      let b = 100, c = 100, sat = 100, sh = 0, warm = 0, gam = 100;
      if (s.enabled && !siteOff) {
        if (s.fxOn) {
          b = s.fxBrightness; c = s.fxContrast; sat = s.fxSaturation;
          sh = s.fxSharp; warm = s.fxWarmth; gam = s.fxGamma;
        }
        const nt = night(s);
        if (nt.on) { b *= nt.dark; warm = clamp(warm + nt.warm, -100, 100); }
        if (s.guard && s.guardVideo && this.gLevel > 0.01) b *= 1 - this.gLevel * (s.guardStrength / 100) * 0.8;
      }
      b = Math.round(b * 10) / 10; warm = Math.round(warm);
      const key = b + '|' + c + '|' + sat + '|' + sh + '|' + warm + '|' + gam;
      if (key === this.fxKey) return;
      this.fxKey = key;
      if (b === 100 && c === 100 && sat === 100 && sh === 0 && warm === 0 && gam === 100) {
        this.restoreFx();
        return;
      }
      if (!this.fxSaved) this.fxSaved = [v.style.getPropertyValue('filter'), v.style.getPropertyPriority('filter')];
      let f = '';
      if (sh > 0 || warm !== 0 || gam !== 100) {
        const n = fxFor(v);
        n.set(sh, warm, gam);
        f += 'url(#' + n.id + ') ';
      }
      f += 'brightness(' + b + '%) contrast(' + c + '%) saturate(' + sat + '%)';
      setImp(v, { filter: f });
    }

    restoreFx() {
      if (!this.fxSaved) return;
      const [val, pr] = this.fxSaved;
      this.v.style.removeProperty('filter');
      if (val) this.v.style.setProperty('filter', val, pr);
      this.fxSaved = null;
    }

    // ── Pro: убрать чёрные полосы с экрана — увеличить видео и обрезать лишнее ──
    // Видео масштабируется вокруг центра (transform), а clip-path обрезает всё, что не картинка.
    zoomBox() {
      const r = this.v.getBoundingClientRect();
      const z = this.zApplied;
      if (!z) return r;
      const w = r.width / z.k, h = r.height / z.k;
      const cx = r.left + r.width / 2 - z.fx * w, cy = r.top + r.height / 2 - z.fy * h;
      return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, width: w, height: h };
    }

    zoomTick(bdt) {
      const v = this.v, s = this.s;
      this.zAnim = false;
      const live = s.enabled && !siteOff && v.readyState >= 2 && v.videoWidth > 0;
      const want = live && s.barsHide && !this.zOff;
      if (!want && !this.zApplied) { this.zs = null; this.zc = null; return; }
      const box = this.zoomBox();
      if (!(box.width > 0 && box.height > 0)) { this.zs = null; return; }
      // сайт сам переписал transform — не воюем с ним
      if (this.zApplied && v.style.getPropertyValue('transform') !== this.zStr) {
        this.zOff = true; this.restoreZoom(); this.zs = null; return;
      }
      if (want && !this.zApplied) {
        const cs = getComputedStyle(v);
        if (cs.transform !== 'none' || cs.clipPath !== 'none') { this.zOff = true; this.zs = null; return; }
      }
      const ow = v.offsetWidth;
      const bad = ow > 0 && Math.abs(box.width / ow - 1) > 0.05;   // страница масштабирует плеер — зум неточен
      const c0 = contentRect(v, box);
      const cb = want && !bad ? this.baseCrop(s) : NO_CROP;
      const has = !!(cb.t || cb.b || cb.l || cb.r);
      const bw = box.width, bh = box.height;
      const ident = { k: 1, fx: 0, fy: 0,
        it: (c0.top - box.top) / bh, ib: (box.bottom - c0.bottom) / bh,
        il: (c0.left - box.left) / bw, ir: (box.right - c0.right) / bw };
      let tgt = ident;
      if (has) {
        const pw = c0.width * (1 - cb.l - cb.r), ph = c0.height * (1 - cb.t - cb.b);
        if (pw > 8 && ph > 8) {
          const pcx = c0.left + c0.width * cb.l + pw / 2, pcy = c0.top + c0.height * cb.t + ph / 2;
          const bcx = box.left + bw / 2, bcy = box.top + bh / 2;
          const kfit = Math.min(bw / pw, bh / ph), kfill = Math.max(bw / pw, bh / ph);
          const k = Math.max(1, kfit + (kfill - kfit) * (s.barsFill / 100));
          const Rw = Math.min(bw, k * pw) / k, Rh = Math.min(bh, k * ph) / k;
          const Rl = pcx - Rw / 2, Rt = pcy - Rh / 2;
          tgt = { k, fx: -k * (pcx - bcx) / bw, fy: -k * (pcy - bcy) / bh,
            il: (Rl - box.left) / bw, ir: (box.right - Rl - Rw) / bw,
            it: (Rt - box.top) / bh, ib: (box.bottom - Rt - Rh) / bh };
        }
      }
      if (!this.zc) this.zc = Object.assign({}, ident);
      const z = this.zc;
      const a = 1 - Math.exp(-Math.max(bdt, 16) / 140);
      let moving = false;
      for (const key of ['k', 'fx', 'fy', 'it', 'ib', 'il', 'ir']) {
        const d = tgt[key] - z[key];
        if (Math.abs(d) > 0.0004) { z[key] += d * a; moving = true; } else z[key] = tgt[key];
      }
      if (!has && !moving) { this.restoreZoom(); this.zc = null; this.zs = null; return; }
      this.zAnim = moving;

      // Значения, которые реально попадут в style (округлённые), — по ним же считаем всё остальное.
      const kq = Math.round(z.k * 10000) / 10000, tx = r1(z.fx * bw), ty = r1(z.fy * bh);
      const bcx = box.left + bw / 2, bcy = box.top + bh / 2;
      const X = (x) => bcx + tx + kq * (x - bcx), Y = (y) => bcy + ty + kq * (y - bcy);
      // Обрезку задаём целыми пикселями элемента: Chrome всё равно округляет inset() в его системе
      // координат, и дробные значения давали бы полоску видео за пределами выреза в свечении.
      const ins = {
        l: Math.max(0, Math.round(z.il * bw)), r: Math.max(0, Math.round(z.ir * bw)),
        t: Math.max(0, Math.round(z.it * bh)), b: Math.max(0, Math.round(z.ib * bh))
      };
      const R = { l: box.left + ins.l, r: box.right - ins.r, t: box.top + ins.t, b: box.bottom - ins.b };
      const vis = { left: X(R.l), right: X(R.r), top: Y(R.t), bottom: Y(R.b) };
      vis.width = vis.right - vis.left; vis.height = vis.bottom - vis.top;
      if (!(vis.width > 4 && vis.height > 4)) { this.restoreZoom(); this.zc = null; this.zs = null; return; }
      if (!this.zApplied) {
        this.zSaved = ['transform', 'transform-origin', 'clip-path']
          .map((p) => [p, v.style.getPropertyValue(p), v.style.getPropertyPriority(p)]);
      }
      setImp(v, {
        transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + kq + ')',
        'transform-origin': '50% 50%',
        'clip-path': 'inset(' + ins.t + 'px ' + ins.r + 'px ' + ins.b + 'px ' + ins.l + 'px)'
      });
      this.zStr = v.style.getPropertyValue('transform');
      this.zApplied = { k: kq, fx: tx / bw, fy: ty / bh };

      // какая часть кадра в этом участвует
      const cr = {
        l: clamp((R.l - c0.left) / c0.width, 0, 0.9), r: clamp((c0.right - R.r) / c0.width, 0, 0.9),
        t: clamp((R.t - c0.top) / c0.height, 0, 0.9), b: clamp((c0.bottom - R.b) / c0.height, 0, 0.9)
      };
      this.zs = { box, vis, cr };
    }

    restoreZoom() {
      if (this.zSaved) {
        for (const [p, val, pr] of this.zSaved) {
          this.v.style.removeProperty(p);
          if (val) this.v.style.setProperty(p, val, pr);
        }
      }
      this.zSaved = null; this.zApplied = null; this.zStr = '';
    }

    // ── Pro: пульс от звука (анализ громкости локально, звук не записывается и не выводится) ──
    audioInit(now) {
      if (now < this.auRetry) return;
      const v = this.v;
      const cap = v.captureStream || v.mozCaptureStream;
      if (!cap) { this.auRetry = now + 60000; this.auFail = 2; return; }
      try {
        const st = cap.call(v);
        const tr = st.getAudioTracks();
        if (!tr.length) { this.auRetry = now + 3000; this.auFail = 1; return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(new MediaStream([tr[0]]));
        const an = ctx.createAnalyser();
        an.fftSize = 256; an.smoothingTimeConstant = 0.4;
        src.connect(an);      // к выходу не подключаем: слышимый звук не меняется
        this.au = { ctx, an, src, track: tr[0], buf: new Uint8Array(an.frequencyBinCount) };
        this.auFail = 0;
      } catch (e) { this.auRetry = now + 10000; this.auFail = 3; }
    }

    audioClose() {
      const a = this.au;
      this.au = null; this.pv = 0; this.pvOut = 0; this.pk = 0;
      if (!a) return;
      try { a.src.disconnect(); } catch (e) { /* ignore */ }
      try { a.ctx.close(); } catch (e) { /* ignore */ }
    }

    pulseStep(now, dt, lit) {
      const s = this.s;
      if (!s.pulse || !lit) {
        if (this.au) this.audioClose();
        this.pv = 0; this.pvOut = 0;
        return;
      }
      if (!this.au) { this.audioInit(now); if (!this.au) { this.pv = 0; this.pvOut = 0; return; } }
      const a = this.au;
      if (a.track.readyState === 'ended') { this.audioClose(); this.auRetry = now + 1000; return; }
      if (a.ctx.state === 'suspended') a.ctx.resume().catch(() => { /* нужен жест пользователя */ });
      a.an.getByteFrequencyData(a.buf);
      const buf = a.buf;
      let e = 0, n = 0;
      if (s.pulseMode === 'bass') { for (let i = 1; i <= 4; i++) { e += buf[i]; n++; } }
      else { for (let i = 1; i < buf.length; i++) { e += buf[i]; n++; } }
      e = e / (n * 255);
      this.pk = Math.max(e, this.pk * Math.pow(0.5, dt / 4000));          // «потолок» громкости, затухает за ~4 с
      const rel = e / (this.pk + 0.04);
      const quiet = Math.min(1, this.pk / 0.04);                           // тишина — пульса нет
      const tgt = smooth((rel - 0.45) / 0.55) * quiet;
      const k = tgt > this.pv ? Math.min(1, dt / 40) : Math.min(1, dt / 160);
      this.pv += (tgt - this.pv) * k;
      if (now - this.pulseAt >= 30) { this.pulseAt = now; this.pvOut = Math.round(this.pv * (1 - this.gLevel) * 50) / 50; }
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
      const r = this.rect = v.getBoundingClientRect();
      // «мелкое» — это превью/баннер: смотрим по длинной стороне, чтобы узкие вертикальные
      // ролики (Shorts, TikTok, Reels) не отсекались в невысоком окне или при масштабе страницы
      if (Math.max(r.width, r.height) < s.minWidth || Math.min(r.width, r.height) < s.minWidth * 0.4) return no('small');
      this.candAt = now;
      this.area = r.width * r.height;
      if (now - rankAt > 500) rank(now);
      if (rankSet && !rankSet.has(this)) return no('limit');
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

      const force = this.s.barsMode === 'force';
      const next = detectBars(data, pw, ph, { force });
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
          if (++this.cropPend.n >= (force ? 2 : 3)) { this.crop = next; this.cropPend = null; this.forceDraw = true; }
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
      this.ensureDom();
      let mode = 'inline';
      if (fs && isInside(v, fs)) {
        if (fs === v) mode = 'bare';
        else if (NO_HOST_TAGS.has(fs.tagName.toUpperCase())) return false;
        else mode = s.fullscreenFill ? 'fs' : 'inline';
      }
      if (mode !== this.mode) this.switchMode(mode);
      if (mode === 'bare') { this.curCr = this.zs ? this.zs.cr : this.baseCrop(s); return true; }

      const over = mode === 'inline' && s.pageMode !== 'under';
      this.applyRootStyle(mode, over);

      const zs = this.zs;
      const box = zs ? zs.box : (this.rect && !this.zApplied ? this.rect : v.getBoundingClientRect());
      // Ничего не сдвинулось и настройки те же — геометрию и стили пересчитывать не нужно
      // (так страница не получает лишних принудительных layout на каждом кадре).
      const lk = !zs && this.geo ? [mode, fs === this.lkFs ? 1 : 0, s === this.lkS ? 1 : 0, this.crop === this.lkCrop ? 1 : 0,
        v.videoWidth, v.videoHeight, box.left, box.top, box.width, box.height].join('|') : '';
      if (lk && lk === this.lkKey && now0() - this.lkAt < 500 && this.root.parentNode) return true;
      this.lkKey = lk; this.lkAt = now0(); this.lkFs = fs; this.lkS = s; this.lkCrop = this.crop;
      const c = zs ? zs.vis : contentRect(v, box);
      if (!(c.width > 0 && c.height > 0)) return false;

      // картинка без чёрных полос, вшитых в видео (при зуме — то, что реально видно)
      let cr = zs ? zs.cr : this.baseCrop(s);
      let pic = c;
      if (!zs && (cr.t || cr.b || cr.l || cr.r)) {
        const pw = c.width * (1 - cr.l - cr.r), ph = c.height * (1 - cr.t - cr.b);
        if (pw > 8 && ph > 8) {
          const pl = c.left + cr.l * c.width, pt = c.top + cr.t * c.height;
          pic = { left: pl, top: pt, right: pl + pw, bottom: pt + ph, width: pw, height: ph };
        } else {
          cr = NO_CROP;
        }
      }
      this.curCr = cr;

      let L, T, R, B, host, hr = null;
      if (mode === 'fs') {
        // Слой кладётся рядом с самим <video> с z-index:-1: так он попадает в контекст наложения
        // плеера (у YouTube #movie_player, z-index:0) — над всем, что под плеером (своя подложка
        // YouTube из превью, фон страницы), но под видео, даже если <video> не позиционирован.
        // Раньше он лежал в fs (а у YouTube fs — это весь <html>), и подложка закрывала свечение.
        host = v.parentNode || fs;
        this.cleanBackgrounds(fs);   // фоны между видео и слоем иначе легли бы поверх свечения
        // Заливаем экран, но только в пределах плеера: в полном экране YouTube можно прокрутить
        // вниз к комментариям, и свечение не должно ложиться на них.
        hr = this.fsArea(fs);
        if (!(hr.width > 0 && hr.height > 0)) return false;
        const over2 = Math.ceil(s.blur * 2) + 8;   // запас, чтобы края не бледнели от размытия
        L = hr.left - over2; T = hr.top - over2; R = hr.right + over2; B = hr.bottom + over2;
      } else {
        const pad = (s.spread / 100) * Math.min(c.width, c.height);
        L = c.left - pad; T = c.top - pad; R = c.right + pad; B = c.bottom + pad;
        if (s.fillBars) {
          const b = box;
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

      if (this.root.parentNode !== host) {
        if (mode === 'fs' && host === v.parentNode) host.insertBefore(this.root, v); else host.appendChild(this.root);
        this.rootFit = '';
      }
      if (mode === 'fs') this.fitRoot(hr);

      const g = this.geometry(c, pic, cr, L, T, R, B);
      // границы экрана в координатах холста: по ним считается, где полоса кончается (см. getBlendMask)
      if (hr) g.scr = { l: hr.left - g.left, t: hr.top - g.top, r: hr.right - g.left, b: hr.bottom - g.top };
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
      // Внешний контур шире холста на размах размытия: clip-path срабатывает ПОСЛЕ filter,
      // и без запаса он резал бы «хвост» размытия по границе рамки (видимый резкий край).
      this.clipInfo = over ? { m: (CTX_FILTER ? 0 : Math.ceil(s.blur * 3)) + 4, g } : null;
      if (mode !== 'inline' && this.curSc !== 1) this.curSc = 1;
      this.css('clip-path', this.clipInfo ? this.buildClip(this.curSc) : 'none');
      this.css('transform-origin', r1(g.hx + g.hw / 2) + 'px ' + r1(g.hy + g.hh / 2) + 'px');
      this.css('transform', this.curSc === 1 ? 'none' : 'scale(' + this.curSc + ')');
      this.layoutUi(mode, c, fs);
      return true;
    }

    // Контур выреза под видео. При «пульсе» холст масштабируется вокруг центра выреза,
    // поэтому сам вырез делаем в 1/масштаб раз меньше — на экране он остаётся точно по видео.
    buildClip(sc) {
      const { m, g } = this.clipInfo;
      const cx = g.hx + g.hw / 2, cy = g.hy + g.hh / 2, hw = g.hw / sc, hh = g.hh / sc;
      const x0 = r1(cx - hw / 2), x1 = r1(cx + hw / 2), y0 = r1(cy - hh / 2), y1 = r1(cy + hh / 2);
      return 'path(evenodd,"M' + (-m) + ' ' + (-m) + 'H' + r1(g.W + m) + 'V' + r1(g.H + m) + 'H' + (-m) +
        'Z M' + x0 + ' ' + y0 + 'H' + x1 + 'V' + y1 + 'H' + x0 + 'Z")';
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
        left: '0', top: '0',
        // mix-blend-mode должен стоять на корне: он создаёт stacking context
        'mix-blend-mode': over && s.pageMode === 'screen' ? 'screen' : 'normal',
        width: '0', height: '0',               // в fs размер и место задаёт fitRoot
        overflow: mode === 'fs' ? 'hidden' : 'visible'
      });
      this.rootFit = '';
    }

    // fs: область заливки = экран ∩ плеер. Плеер — самый внешний предок видео (до fs), который
    // ещё не больше экрана; сам fs не годится: у YouTube это ytd-app вместе со всей страницей.
    fsArea(fs) {
      const W = window.innerWidth, H = window.innerHeight;
      if (this.pboxFs !== fs || !this.pbox || !this.pbox.isConnected || !isInside(this.v, this.pbox)) {
        let box = fs, el = this.v.parentNode || this.v.host || null;
        while (el && el !== fs) {
          if (el.nodeType === 1) {
            const r = el.getBoundingClientRect();
            if (r.width <= W + 2 && r.height <= H + 2) box = el; else break;
          }
          el = el.parentNode || el.host || null;
        }
        this.pbox = box; this.pboxFs = fs;
      }
      const r = this.pbox.getBoundingClientRect();
      const l = Math.max(0, r.left), t = Math.max(0, r.top);
      const rr = Math.min(W, r.right), b = Math.min(H, r.bottom);
      return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t };
    }

    // fs: корень (position:fixed) ровно по экрану. Если у предка плеера есть transform или contain,
    // fixed отсчитывается от этого предка, поэтому сдвиг меряем и компенсируем, а не верим left:0/top:0.
    fitRoot(hr) {
      const o = this.root.getBoundingClientRect();
      const cur = this.rootPos || { x: 0, y: 0 };
      const x = this.rootFit ? r1(cur.x + hr.left - o.left) : 0;
      const y = this.rootFit ? r1(cur.y + hr.top - o.top) : 0;
      const key = x + '|' + y + '|' + r1(hr.width) + '|' + r1(hr.height);
      if (key === this.rootFit) return;
      setImp(this.root, { left: x + 'px', top: y + 'px', width: r1(hr.width) + 'px', height: r1(hr.height) + 'px' });
      this.rootPos = { x, y };
      this.rootFit = key;
      if (!x && !y) {
        // первый проход: left/top = 0, теперь видно реальный сдвиг — поправляем сразу
        const o2 = this.root.getBoundingClientRect();
        if (Math.abs(o2.left - hr.left) > 0.5 || Math.abs(o2.top - hr.top) > 0.5) this.fitRoot(hr);
      }
    }

    switchMode(mode) {
      if (this.mode === 'bare') this.restoreBare();
      if (this.mode === 'fs') this.restoreBackgrounds();
      this.mode = mode;
      this.cache = {};
      this.rootKey = '';
      this.baked = false;      // иначе до первой отрисовки в новом режиме свечение шло бы без размытия
      this.fkey = '';
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
      this.fkey = '';
      const led = !bare && s.glowStyle === 'led' && this.mode === 'inline';
      if (led) this.fkey = 'led|' + s.ledCount + '|' + s.saturation + '|' + s.brightness + '|' + s.opacity;
      else if (!bare && CTX_FILTER && this.mode !== 'fs') {   // в полном экране — как в 1.0.0: размытие CSS-фильтром
        // радиус в пикселях холста: 1 px холста = W/cw px экрана
        const rpx = s.blur > 0 ? Math.max(1.2, s.blur * g.cw / g.W) : 0;
        this.fkey = (rpx ? 'blur(' + rpx.toFixed(2) + 'px) ' : '') + 'saturate(' + s.saturation +
          '%) brightness(' + Math.round(s.brightness * night(s).glow) + '%)';
      }
      this.baked = !!this.fkey;
      const gkey = this.mode + '|' + (this.fkey ? this.fkey + '|' : '') + (bare ?
        'bare' + this.curCr.t + '|' + this.curCr.b + '|' + this.curCr.l + '|' + this.curCr.r :
        g.cw + 'x' + g.ch + '|' + g.sw + 'x' + g.sh + '|' + (g.seam ? 1 : 0) + '|' + g.crKey);

      if (!this.forceDraw && gkey === this.drawnKey) {
        const interval = 1000 / this.fpsCap;
        if (this.lastDraw && now - this.lastDraw < interval - 2) return;
        if (this.lastDraw && v.currentTime === this.lastTime) return;
      }
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return;
      const prevDraw = this.lastDraw, wasForced = this.forceDraw;
      this.forceDraw = false;
      this.drawnKey = gkey;
      this.lastDraw = now;
      this.lastTime = v.currentTime;
      const t0 = performance.now();

      // «Спокойное свечение»: каждый новый кадр подмешивается к прошлому (скользящее среднее по времени)
      // Кривая смены цвета: «мягкая» и «кино» всегда сглаживают, «кино» мгновенно меняет цвет на смене сцены,
      // «резкая» не сглаживает (кроме защиты от вспышек).
      const ccv = s.colorCurve, gc = this.gLevel > 0.05 ? 80 : 0;
      const calm = ccv === 'sharp' ? gc : Math.max(s.calm, gc, ccv === 'soft' ? 70 : ccv === 'cinema' ? 60 : 0);
      const cut = ccv === 'cinema' && !gc && this.cutAt > prevDraw;
      const blend = (fresh) => {
        if (calm <= 0 || fresh || wasForced || !prevDraw || cut) return 1;
        return 1 - Math.exp(-(now - prevDraw) / 1000 / (calm / 100 * 1.5));
      };

      if (bare) {
        const sw = Math.round(s.sample);
        this.drawBare(sw, Math.max(4, Math.round(sw * vh / vw)), blend(false));
        return;
      }

      const cr = g.cr;
      const tile = this.tile, tctx = this.tctx;
      let fresh = this.tileFresh;
      if (tile.width !== g.sw || tile.height !== g.sh) { tile.width = g.sw; tile.height = g.sh; fresh = true; }
      this.tileFresh = false;
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      try {
        tctx.globalAlpha = blend(fresh);
        tctx.drawImage(v, cr.l * vw, cr.t * vh, vw * (1 - cr.l - cr.r), vh * (1 - cr.t - cr.b),
          0, 0, g.sw, g.sh);
        tctx.globalAlpha = 1;
      } catch (e) { tctx.globalAlpha = 1; return; }

      const lights = s.hueOn || s.wledOn || s.haOn;
      if (led || s.room || lights || pipWin) {
        const pc = this.probeColors(now, led);
        if (lights && pc) this.lightSend(now, pc);
        if (pipWin && pc) pipFeed(this, now, pc);
        if (led) {
          this.drawLed(g, pc);
          const dl = performance.now() - t0;
          this.drawEma = this.drawEma ? this.drawEma * 0.9 + dl * 0.1 : dl;
          return;
        }
      }

      // Размытие, насыщенность и яркость считаем в маленьком холсте (десятки пикселей), а не CSS-фильтром
      // на огромном слое экрана: браузеру не нужно размывать мегапиксели на каждом кадре.
      const useIn = CTX_FILTER && this.mode !== 'fs';
      const out = this.canvas;
      if (out.width !== g.cw || out.height !== g.ch) { out.width = g.cw; out.height = g.ch; }
      let cv = out, ctx = this.ctx;
      if (useIn) {
        if (!this.wk) { this.wk = document.createElement('canvas'); this.wctx = this.wk.getContext('2d'); }
        cv = this.wk; ctx = this.wctx;
        if (cv.width !== g.cw || cv.height !== g.ch) { cv.width = g.cw; cv.height = g.ch; }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;

      if (g.seam) {
        // В полном экране у краёв, где продолжение кадра тёмное (пол сцены, чёрный низ), свечение
        // получалось почти чёрным — «полоса» у нижнего края. Поэтому по мере удаления от видео
        // зеркальное продолжение плавно подмешивается к среднему цвету кадра (общий цвет сцены).
        const mix = this.mode === 'fs';
        let lc = ctx;
        if (mix) {
          if (!this.ml) { this.ml = document.createElement('canvas'); this.mlctx = this.ml.getContext('2d'); }
          if (this.ml.width !== g.cw || this.ml.height !== g.ch) { this.ml.width = g.cw; this.ml.height = g.ch; }
          lc = this.mlctx;
          lc.globalCompositeOperation = 'source-over';
          lc.imageSmoothingEnabled = true;
        }
        lc.clearRect(0, 0, g.cw, g.ch);
        const i0 = Math.max(-4, -Math.ceil(g.ox / g.sw));
        const i1 = Math.min(4, Math.ceil((g.cw - g.ox - g.sw) / g.sw));
        const j0 = Math.max(-4, -Math.ceil(g.oy / g.sh));
        const j1 = Math.min(4, Math.ceil((g.ch - g.oy - g.sh) / g.sh));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const x = g.ox + i * g.sw, y = g.oy + j * g.sh;
            const fx = Math.abs(i) % 2 === 1, fy = Math.abs(j) % 2 === 1;   // зеркальные плитки
            lc.setTransform(fx ? -1 : 1, 0, 0, fy ? -1 : 1, fx ? x + g.sw : x, fy ? y + g.sh : y);
            lc.drawImage(tile, 0, 0);
          }
        }
        lc.setTransform(1, 0, 0, 1, 0, 0);
        if (mix) {
          ctx.clearRect(0, 0, g.cw, g.ch);
          // основа: средний цвет кадра (кадр, ужатый до одного пикселя и растянутый на всю рамку)
          // (ужимаем ступенями 16 → 4 → 1, чтобы получилось именно среднее, а не один пиксель)
          if (!this.av) {
            this.av = [16, 4, 1].map((n) => { const c = document.createElement('canvas'); c.width = n; c.height = n; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; return { c, x, n }; });
          }
          let src = tile;
          for (const st of this.av) { st.x.clearRect(0, 0, st.n, st.n); st.x.drawImage(src, 0, 0, st.n, st.n); src = st.c; }
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(this.av[2].c, 0, 0, g.cw, g.ch);
          ctx.imageSmoothingEnabled = true;
          lc.globalCompositeOperation = 'destination-in';
          lc.drawImage(this.getBlendMask(g), 0, 0, g.cw, g.ch);
          lc.globalCompositeOperation = 'source-over';
          ctx.drawImage(this.ml, 0, 0);                    // сверху — продолжение кадра, слабеющее с расстоянием
        }
      } else {
        ctx.drawImage(tile, 0, 0, g.cw, g.ch);
      }

      // форма, мягкий внешний край и яркость у стыка
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.getMask(g), 0, 0, g.cw, g.ch);
      if (this.mode === 'fs') {
        // Фоны плеера мы сделали прозрачными, и сквозь неполную яркость свечения просвечивал фон
        // страницы (в светлой теме YouTube — белый). Под свечением должна быть та же чернота, что была в полосах.
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, g.cw, g.ch);
      }
      ctx.globalCompositeOperation = 'source-over';

      if (useIn) {
        const oc = this.ctx;
        oc.globalCompositeOperation = 'copy';
        oc.filter = this.fkey;
        oc.drawImage(cv, 0, 0);
        oc.filter = 'none';
        oc.globalCompositeOperation = 'source-over';
      }

      const dtm = performance.now() - t0;
      this.drawEma = this.drawEma ? this.drawEma * 0.9 + dtm * 0.1 : dtm;
    }

    // ── цвета кадра: тайл, ужатый до сетки PGW×PGH (одно маленькое чтение пикселей) ──
    // avg — средний цвет; vivid — «характерный» цвет сцены (насыщенные пиксели весят больше),
    // приведённый к яркости среднего, чтобы тёмная сцена не давала яркий свет.
    probeColors(now, force, src) {
      if (!force && this.pc && now - this.pcAt < 100) return this.pc;
      this.pcAt = now;
      if (!this.pcv) {
        this.pcv = document.createElement('canvas');
        this.pcv.width = PGW; this.pcv.height = PGH;
        this.pctx = this.pcv.getContext('2d', { willReadFrequently: true });
        this.pctx.imageSmoothingQuality = 'high';
      }
      let d;
      try {
        this.pctx.drawImage(src || this.tile, 0, 0, PGW, PGH);
        d = this.pctx.getImageData(0, 0, PGW, PGH).data;
      } catch (e) { return this.pc; }
      let ar = 0, ag = 0, ab = 0, vr = 0, vg = 0, vb = 0, vw = 0;
      const lr = [0, 0, 0], rr = [0, 0, 0];
      for (let y = 0; y < PGH; y++) {
        for (let x = 0; x < PGW; x++) {
          const i = (y * PGW + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
          ar += r; ag += gg; ab += b;
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          const w = ((mx - mn) / 255) * (mx / 255) + 0.03;
          vr += r * w; vg += gg * w; vb += b * w; vw += w;
          if (x < 3) { lr[0] += r; lr[1] += gg; lr[2] += b; }
          if (x >= PGW - 3) { rr[0] += r; rr[1] += gg; rr[2] += b; }
        }
      }
      const n = PGW * PGH, ne = PGH * 3;
      const avg = [ar / n, ag / n, ab / n];
      const vivid = [vr / vw, vg / vw, vb / vw];
      const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const k = Math.min(1.6, lum(avg) / Math.max(1, lum(vivid)));
      this.pc = {
        d, avg,
        color: vivid.map((v) => Math.min(255, v * k)),
        left: lr.map((v) => v / ne), right: rr.map((v) => v / ne)
      };
      return this.pc;
    }

    // Насыщенность и яркость свечения — прямо в цвете (у ленты нет CSS-фильтра).
    tone(r, g, b) {
      const s = this.s, sat = s.saturation / 100, br = (s.brightness / 100) * night(s).glow;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const f = (c) => Math.max(0, Math.min(255, Math.round((l + (c - l) * sat) * br)));
      return f(r) + ',' + f(g) + ',' + f(b);
    }

    // ── «Светодиодная лента»: вокруг видео — отдельные пятна света, каждое цвета ближайшего края кадра ──
    drawLed(g, pc) {
      const s = this.s, out = this.canvas, ctx = this.ctx;
      const k = Math.min(0.5, 900 / Math.max(g.W, g.H));      // холст в половину экрана: пятна мягкие, но чёткие
      const w = Math.max(2, Math.round(g.W * k)), h = Math.max(2, Math.round(g.H * k));
      if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      if (!pc) return;
      const d = pc.d;
      const hx = g.hx * k, hy = g.hy * k, hw = g.hw * k, hh = g.hh * k;
      const pad = Math.max(4, Math.min(hx, hy, w - hx - hw, h - hy - hh));
      const off = pad * 0.16, rad = pad * 0.8, core = Math.max(1, 2.2 * k * 2);
      const n = s.ledCount, per = 2 * (hw + hh), step = per / n;
      const op = s.opacity / 100;
      // цвет «светодиода» — среднее крайней клетки сетки и соседней с ней (ближе к центру)
      const cell = (cx, cy, dx, dy) => {
        const a = (cy * PGW + cx) * 4, b = ((cy + dy) * PGW + cx + dx) * 4;
        return this.tone((d[a] * 2 + d[b]) / 3, (d[a + 1] * 2 + d[b + 1]) / 3, (d[a + 2] * 2 + d[b + 2]) / 3);
      };
      const col = (f) => Math.min(PGW - 1, Math.max(0, Math.floor(f * PGW)));
      const row = (f) => Math.min(PGH - 1, Math.max(0, Math.floor(f * PGH)));
      ctx.globalCompositeOperation = 'lighter';
      const cores = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * step;
        let x, y, c;
        if (t < hw) { x = hx + t; y = hy - off; c = cell(col(t / hw), 0, 0, 1); }
        else if (t < hw + hh) { const u = t - hw; x = hx + hw + off; y = hy + u; c = cell(PGW - 1, row(u / hh), -1, 0); }
        else if (t < 2 * hw + hh) { const u = t - hw - hh; x = hx + hw - u; y = hy + hh + off; c = cell(col(1 - u / hw), PGH - 1, 0, -1); }
        else { const u = t - 2 * hw - hh; x = hx - off; y = hy + hh - u; c = cell(0, row(1 - u / hh), 1, 0); }
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(' + c + ',' + op + ')');
        gr.addColorStop(0.3, 'rgba(' + c + ',' + (op * 0.5).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + c + ',0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        cores.push(x, y);
      }
      // сами «диоды» — маленькие светлые точки поверх пятен
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * op).toFixed(3) + ')';
      ctx.beginPath();
      for (let i = 0; i < cores.length; i += 2) { ctx.moveTo(cores[i] + core, cores[i + 1]); ctx.arc(cores[i], cores[i + 1], core, 0, Math.PI * 2); }
      ctx.fill();
    }

    // ── «Цвет комнаты»: слева — цвет левого края кадра, справа — правого, вокруг плеера — цвет сцены ──
    paintRoom(e) {
      const pc = this.pc, now = performance.now();
      if (!pc || !this.roomBox) return;
      const dt = this.roomAt ? Math.min(500, now - this.roomAt) : 0;
      if (dt && dt < 90) { this.uiSet(this.roomRoot, 'roomA', { opacity: e.toFixed(3) }); return; }   // ~10 обновлений в секунду
      this.roomAt = now;
      const tgt = [pc.color, pc.left, pc.right];
      if (!this.rc) this.rc = tgt.map((c) => c.slice());
      const k = dt ? 1 - Math.exp(-dt / 450) : 1;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) this.rc[j][i] += (tgt[j][i] - this.rc[j][i]) * k;
      const a = (this.s.roomLevel / 100) * 0.7;
      const [cm, cl, cr] = this.rc.map((c) => this.tone(c[0], c[1], c[2]));
      const { cx, cy } = this.roomBox;
      const bg = 'radial-gradient(ellipse 75% 90% at ' + cx + 'px ' + cy + 'px, rgba(' + cm + ',' + a.toFixed(3) + ') 0%, rgba(' + cm + ',' +
        (a * 0.45).toFixed(3) + ') 45%, rgba(' + cm + ',0) 85%), linear-gradient(90deg, rgba(' + cl + ',' + (a * 0.6).toFixed(3) +
        ') 0%, rgba(' + cl + ',0) 40%, rgba(' + cr + ',0) 60%, rgba(' + cr + ',' + (a * 0.6).toFixed(3) + ') 100%)';
      if (bg !== this.roomKey) { this.roomKey = bg; setImp(this.roomRoot, { background: bg }); }
      this.uiSet(this.roomRoot, 'roomA', { opacity: e.toFixed(3) });
    }

    // Цвета прямо с видео, когда свечение на странице не рисуется (видео в «картинке в картинке»).
    feed(now) {
      if (now - this.feedAt < 100) return;
      this.feedAt = now;
      const pc = this.probeColors(now, true, this.v);
      if (!pc) return;
      if (this.s.hueOn || this.s.wledOn || this.s.haOn) this.lightSend(now, pc);
      if (pipWin) pipFeed(this, now, pc);
    }

    // ── Автопресет: тип ролика по кадру 16×9 (тот же, что у реакции на сцену) ──
    // Каждые 2 с — признаки окна: яркость, насыщенность, доля «травы», движение, полосы.
    // Новый тип принимается, только если держится 3 окна подряд (первый раз — 2), и не чаще раза в 20 с.
    // Меняются только параметры свечения и сцены, плавно за 2 с; фильтры видео и затемнение не трогаем.
    autoStat(d, cur, L, motion) {
      const st = this.apS || (this.apS = { n: 0, L: 0, S: 0, G: 0, M: 0, mn: 0, bars: 0 });
      let sat = 0, green = 0, top = 0, bot = 0;
      for (let i = 0, c = 0; c < 144; i += 4, c++) {
        const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), ch = (mx - Math.min(r, g, b)) / 255;
        sat += mx ? ch * 255 / mx : 0;
        if (g > r * 1.12 && g > b * 1.12 && ch > 0.1) green++;
        if (c < 16) top += cur[c]; else if (c >= 128) bot += cur[c];
      }
      st.n++; st.L += L; st.S += sat / 144; st.G += green / 144;
      top /= 16; bot /= 16;
      if (top < 0.045 && bot < 0.045 && (L * 144 - (top + bot) * 16) / 112 > 0.1) st.bars++;
      if (motion >= 0 && motion < 0.14) { st.M += motion; st.mn++; }   // смену сцены движением не считаем
    }

    autoEval(now) {
      const a = this.ap, st = this.apS;
      this.apS = null;
      if (!st || st.n < 6) return;
      const f = { L: st.L / st.n, S: st.S / st.n, G: st.G / st.n, M: st.mn ? st.M / st.mn : 0, bars: st.bars / st.n };
      if (a.f) for (const k in f) f[k] = a.f[k] + (f[k] - a.f[k]) * 0.5;
      a.f = f;
      const c = autoClass(f, a.cls);
      if (c === a.cand) a.candN++; else { a.cand = c; a.candN = 1; }
      a.ready = true;
      if (c === a.cls || a.candN < (a.at ? 3 : 2) || (a.at && now - a.at < 20000)) return;
      a.from = Object.assign({}, a.view ? pickAuto(a.view) : null);
      a.cls = c; a.at = now; a.t0 = now;
      a.to = c ? autoValues(c) : null;
      a.toBase = !c;
    }

    autoView(base, now) {
      if (!base.autoPreset) {
        if (this.ap) { this.ap = null; this.apS = null; this.forceDraw = true; this.cache = {}; this.lkKey = ''; this.rootKey = ''; }
        return base;
      }
      const a = this.ap || (this.ap = { cls: '', cand: '', candN: 0, at: 0, evalAt: now, t0: 0, from: null, to: null,
        toBase: false, f: null, ready: false, view: null, base: null, k: -1 });
      if (now - a.evalAt >= 2000) { a.evalAt = now; if (this.apS) this.autoEval(now); }
      if (!a.t0) return base;                      // ещё ничего не выбрано — настройки пользователя
      const k = Math.round(smooth((now - a.t0) / 2000) * 20) / 20;
      if (a.base === base && a.k === k && a.view) return a.view;
      a.base = base; a.k = k;
      const to = a.toBase ? base : a.to, from = a.from || base;
      const v = Object.assign({}, base);
      for (const key of AUTO_KEYS) {
        const x = key in from ? from[key] : base[key], y = to[key];
        v[key] = typeof y === 'number' && typeof x === 'number' ? r1(x + (y - x) * k) : (k >= 0.5 ? y : x);
      }
      a.view = v;
      this.forceDraw = true; this.cache = {}; this.lkKey = ''; this.rootKey = '';
      return v;
    }

    // ── Свет в комнате (Hue, WLED, Home Assistant): цвета сцены уходят в фон расширения,
    // тот сам ограничивает частоту команд устройствам. edge — 46 ячеек периметра кадра по часовой
    // стрелке от нижнего левого угла, каждая — среднее крайней ячейки сетки и соседней внутрь ──
    lightSend(now, pc) {
      if (now - this.hueAt < 100 || this.userOff) return;
      this.hueAt = now;
      const d = pc.d, R = Math.round;
      const cell = (x, y, dx, dy) => {
        const i = (y * PGW + x) * 4, j = ((y + dy) * PGW + x + dx) * 4;
        return [R((d[i] + d[j]) / 2), R((d[i + 1] + d[j + 1]) / 2), R((d[i + 2] + d[j + 2]) / 2)];
      };
      const edge = [];
      for (let y = PGH - 1; y >= 1; y--) edge.push(cell(0, y, 1, 0));
      for (let x = 0; x < PGW - 1; x++) edge.push(cell(x, 0, 0, 1));
      for (let y = 0; y < PGH - 1; y++) edge.push(cell(PGW - 1, y, -1, 0));
      for (let x = PGW - 1; x >= 1; x--) edge.push(cell(x, PGH - 1, 0, -1));
      try {
        chrome.runtime.sendMessage({
          type: 'vg:light', rgb: pc.color.map(R), left: pc.left.map(R), right: pc.right.map(R), edge,
          area: R(this.area)
        }, () => void chrome.runtime.lastError);
      } catch (e) { /* расширение обновили — старый скрипт уже не может писать */ }
    }

    // Доля «продолжения кадра» (1 — у видео, к краю экрана спадает до 0.15): только альфа-канал.
    // Расстояние меряется долей пути от видео до края экрана с этой стороны: на 16:10 полосы
    // всего 40–80 px, и при фиксированных 60 px полоса целиком была зеркалом крайних строк кадра —
    // сверху (небо) свечение выходило белёсым, снизу (земля, тени) почти чёрным.
    getBlendMask(g) {
      const sc = g.scr || { l: 0, t: 0, r: g.W, b: g.H };
      const key = [g.cw, g.ch, Math.round(g.W), Math.round(g.H), Math.round(g.hx), Math.round(g.hy),
        Math.round(g.hw), Math.round(g.hh), Math.round(sc.l), Math.round(sc.t), Math.round(sc.r), Math.round(sc.b)].join('|');
      if (this.bmask && this.bmaskKey === key) return this.bmask;
      const scale = Math.min(1, 96 / Math.max(g.cw, g.ch));
      const mw = Math.max(2, Math.round(g.cw * scale)), mh = Math.max(2, Math.round(g.ch * scale));
      const cv = document.createElement('canvas');
      cv.width = mw; cv.height = mh;
      const c2 = cv.getContext('2d');
      const img = c2.createImageData(mw, mh);
      const d = img.data;
      const sx = g.W / mw, sy = g.H / mh;
      const x0 = g.hx, y0 = g.hy, x1 = g.hx + g.hw, y1 = g.hy + g.hh;
      // ширина полосы с каждой стороны (не меньше 24 px, чтобы узкая полоса не давала резкого перехода)
      const bl = Math.max(24, x0 - sc.l), br = Math.max(24, sc.r - x1);
      const bt = Math.max(24, y0 - sc.t), bb = Math.max(24, sc.b - y1);
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const X = (x + 0.5) * sx, Y = (y + 0.5) * sy;
          const nx = Math.max((x0 - X) / bl, (X - x1) / br, 0);
          const ny = Math.max((y0 - Y) / bt, (Y - y1) / bb, 0);
          d[(y * mw + x) * 4 + 3] = Math.round((1 - 0.85 * smooth(Math.hypot(nx, ny) / 0.7)) * 255);
        }
      }
      c2.putImageData(img, 0, 0);
      this.bmask = cv; this.bmaskKey = key;
      return cv;
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
      // пульс от звука и защита от вспышек: между ударами свечение чуть тускнеет, на ударах — полное и «дышит»
      const amt = s.pulse ? s.pulseAmount / 100 : 0;
      const pv = amt && this.au ? this.pvOut : 1;
      // реакция на сцену: «вдох» (медленное дыхание яркости) на тёмных сценах, вспышка — ярче и чуть шире
      const sa = s.sceneAmount / 100, sf = this.sF;
      const breath = this.sDark ? 1 - 0.3 * sa * this.sDark * (0.5 - 0.5 * Math.cos(performance.now() / 4200 * 2 * Math.PI)) : 1;
      const opMul = (1 - 0.35 * amt * (1 - pv)) * (1 - this.gLevel * (s.guardStrength / 100) * (s.guard ? 1 : 0)) *
        breath * (1 + 0.3 * sf);
      const fb = Math.round((1 + 0.7 * sf) * 50) / 50;
      const nt = night(s);
      if (this.mode === 'bare') { this.paintBare(Math.min(1, (s.opacity / 100) * e * opMul)); return; }
      this.paintUi(e);
      const sc = this.mode !== 'inline' ? 1 : Math.round((1 + (amt && this.au ? 0.06 * amt * pv : 0) + 0.04 * sf) * 300) / 300;
      if (sc !== this.curSc) {
        this.curSc = sc;
        this.css('transform', sc === 1 ? 'none' : 'scale(' + sc + ')');
        if (this.clipInfo) this.css('clip-path', this.buildClip(sc));
      }
      // «яркость свечения» уже учтена в маске, поэтому здесь только плавное появление
      this.css('opacity', Math.min(1, e * opMul).toFixed(3));
      this.css('--vg-fx', this.baked ? this.fkey : 'css');   // для диагностики и тестов
      if (this.baked) this.css('filter', fb > 1 ? 'brightness(' + fb + ')' : 'none');
      else {
        this.css('filter', 'blur(' + s.blur + 'px) saturate(' + s.saturation +
          '%) brightness(' + Math.round(s.brightness * nt.glow * fb) + '%)');
      }
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

    drawBare(sw, _h, alpha) {
      const b = this.bare, v = this.v, s = this.s;
      if (!b) return;
      const cr = this.curCr;
      const vw = v.videoWidth, vh = v.videoHeight;
      const srcW = vw * (1 - cr.l - cr.r), srcH = vh * (1 - cr.t - cr.b);
      const w = Math.max(16, sw);
      const h = Math.max(9, Math.round(w * srcH / srcW));
      if (!b.cv) { b.cv = document.createElement('canvas'); b.ctx = b.cv.getContext('2d'); }
      if (b.cv.width !== w || b.cv.height !== h) { b.cv.width = w; b.cv.height = h; b.sized = false; }
      const r = Math.max(1.2, s.blur * w / (v.clientWidth || screen.width || 1920));
      const p = Math.ceil(r * 2);
      const c = b.ctx;
      c.filter = 'blur(' + r.toFixed(2) + 'px) saturate(' + s.saturation +
        '%) brightness(' + Math.round(s.brightness * night(s).glow) + '%)';
      try {
        c.globalAlpha = b.sized ? (alpha || 1) : 1;
        b.sized = true;
        c.drawImage(v, cr.l * vw, cr.t * vh, srcW, srcH, -p, -p, w + 2 * p, h + 2 * p);
        c.globalAlpha = 1;
        c.filter = 'none';
        // Если видео чужого домена без CORS, canvas «грязный» и toDataURL бросит исключение.
        b.url = b.cv.toDataURL('image/jpeg', 0.8);
        this.readable = true;
      } catch (e) {
        c.globalAlpha = 1;
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
      this.audioClose();
      this.curSc = 1;
      this.tileFresh = true;
      if (this.root) { this.root.remove(); this.removeUi(); }
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
      this.lkKey = '';
    }

    destroy() {
      this.dead = true;
      if (this.vfc) this.unVfc();
      else if (this.raf) cancelAnimationFrame(this.raf);
      EVENTS.forEach((e) => this.v.removeEventListener(e, this.onEvt));
      sharedIo.unobserve(this.v);
      sharedRo.unobserve(this.v);
      this.release();
      this.restoreFx();
      this.restoreZoom();
    }
  }

  // ───────────────────────── менеджер видео ─────────────────────────

  const glows = new Map();
  let rankAt = 0;
  let rankSet = null;

  // Рисуем свечение только у MAX_GLOWS самых больших играющих видео (в ленте с десятком превью
  // иначе получится десяток тяжёлых слоёв). Уже выбранное видео чуть предпочитаем — без мигания.
  function rank(now) {
    rankAt = now;
    const cand = [];
    for (const g of glows.values()) {
      if (g.userOff || g.v.paused || !g.inView) continue;
      if (now - g.candAt < 1500 || g.why === 'limit') cand.push(g);
    }
    if (cand.length <= MAX_GLOWS) {
      const had = rankSet;
      rankSet = null;
      if (had) for (const g of cand) g.kick();
      return;
    }
    cand.sort((a, b) => b.area * (rankSet && rankSet.has(b) ? 1.2 : 1) - a.area * (rankSet && rankSet.has(a) ? 1.2 : 1));
    rankSet = new Set(cand.slice(0, MAX_GLOWS));
    // тем, кто не выбран, — перепроверить себя (погаснуть); ждавшим своей очереди — проснуться
    for (const g of cand) g.kick();
  }
  const watchedRoots = new WeakSet();
  let timer = 0;
  let proSig = '';

  function adopt(v) {
    if (down || !(v instanceof HTMLVideoElement) || glows.has(v)) return;
    glows.set(v, new Glow(v));
  }


  // ───────────────────────── плавающая панель настроек ─────────────────────────
  // Те же настройки, что и во всплывающем окне, но прямо поверх страницы и полноэкранного плеера:
  // в полном экране панель инструментов браузера скрыта, а здесь видно, что меняешь.
  // Закреплённая панель не скрывается сама; незакреплённая уходит через 10 с без курсора.
  let panel = null;

  // ───────────────── автопресет: какие ключи меняет и куда ─────────────────
  const AUTO_KEYS = ['spread', 'radius', 'feather', 'blur', 'opacity', 'saturation', 'brightness', 'calm',
    'scene', 'sceneAmount', 'colorCurve'];
  const pickAuto = (o) => { const r = {}; if (o) AUTO_KEYS.forEach((k) => { r[k] = o[k]; }); return r; };
  // Значения пресета с правками пользователя (presets.js загружен перед content.js)
  function autoValues(id) {
    const P = self.VG_presets;
    const p = P && P.list(rawStore).find((x) => x.id === id);
    return pickAuto(p ? p.values : settings);
  }
  // Тип ролика. Текущему типу проще удержаться (порог на 15% мягче) — без «мигания» на границе.
  function autoClass(f, cur) {
    const m = (c) => (c === cur ? 0.85 : 1);
    if (f.bars >= 0.6 * m('cinema') || (f.L < 0.17 / m('cinema') && f.S < 0.35)) return 'cinema';
    if (f.G > 0.38 * m('sport') && f.M > 0.006 * m('sport')) return 'sport';
    if (f.S > 0.42 * m('games') && f.M > 0.035 * m('games')) return 'games';
    if (f.S > 0.42 * m('anime')) return 'anime';
    return '';
  }

  // ───────────────── окно-подсветка (Document Picture-in-Picture, Chrome 116+) ─────────────────
  // Отдельное окно, которое светится цветом видео: его можно унести на второй монитор или поставить рядом.
  let pipWin = null, pipSrc = null, pipSrcAt = 0, pipAt = 0, pipRc = null, pipKey = '', pipTimer = 0;
  async function openGlowWindow() {
    if (pipWin) return;
    const api = window.documentPictureInPicture;
    if (!api) return;
    let w;
    try { w = await api.requestWindow({ width: 480, height: 270 }); } catch (e) { return; }
    pipWin = w; pipRc = null; pipKey = ''; pipAt = 0; pipSrc = null;
    const d = w.document;
    d.title = 'Video Glow';
    const st = d.createElement('style');
    st.textContent = 'html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
      'p{position:fixed;left:0;right:0;bottom:12px;margin:0;text-align:center;font:13px system-ui,sans-serif;' +
      'color:#fff;text-shadow:0 1px 3px #000;opacity:.85;transition:opacity 1s}';
    d.head.append(st);
    const hint = d.createElement('p');
    try { hint.textContent = chrome.i18n.getMessage('pip_hint'); } catch (e) { /* ignore */ }
    d.body.append(hint);
    setTimeout(() => { hint.style.opacity = '0'; }, 4000);
    w.addEventListener('pagehide', () => { if (pipWin === w) { pipWin = null; pipSrc = null; clearInterval(pipTimer); } });
    // видео остановилось — окно плавно гаснет
    pipTimer = setInterval(() => {
      if (pipWin && performance.now() - pipAt > 1500 && pipKey !== 'off') { pipKey = 'off'; pipRc = null; d.body.style.background = '#000'; }
    }, 500);
    kickAll();
  }
  function closeGlowWindow() {
    clearInterval(pipTimer);
    if (pipWin) { try { pipWin.close(); } catch (e) { /* ignore */ } }
    pipWin = null; pipSrc = null;
  }
  // Цвет берётся у самого крупного играющего видео; ~10 обновлений в секунду с плавным переходом.
  function pipFeed(g, now, pc) {
    if (!pipWin) return;
    if (pipSrc && pipSrc !== g && !pipSrc.dead && now - pipAt < 1000 && g.area <= pipSrc.area) return;
    pipSrc = g;
    const dt = pipAt ? Math.min(500, now - pipAt) : 0;
    if (dt && dt < 90) return;
    pipAt = now;
    const tgt = [pc.left, pc.color, pc.right];
    if (!pipRc) pipRc = tgt.map((c) => c.slice());
    const k = dt ? 1 - Math.exp(-dt / 300) : 1;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) pipRc[j][i] += (tgt[j][i] - pipRc[j][i]) * k;
    const [cl, cm, cr] = pipRc.map((c) => g.tone(c[0], c[1], c[2]));
    const bg = 'linear-gradient(90deg,rgb(' + cl + ') 0%,rgb(' + cm + ') 50%,rgb(' + cr + ') 100%)';
    if (bg !== pipKey) { pipKey = bg; try { pipWin.document.body.style.background = bg; } catch (e) { pipWin = null; } }
  }
  const PANEL_W = 340;

  function panelHost() {
    const fs = getFsElement();
    if (!fs) return document.documentElement;
    return NO_HOST_TAGS.has(fs.tagName.toUpperCase()) ? null : fs;
  }

  function panelHere() {
    // кадр, в котором показываем панель: тот, где идёт полный экран, иначе верхняя страница
    const fs = getFsElement();
    if (fs) {
      if (NO_HOST_TAGS.has(fs.tagName.toUpperCase())) return false;
      for (const v of glows.keys()) if (isInside(v, fs)) return true;
      return false;
    }
    return window === window.top;
  }

  function panelPlace() {
    if (!panel) return;
    const st = panel.st;
    const w = PANEL_W, hh = Math.min(640, Math.max(240, window.innerHeight - 70));
    let x = Number(rawStore.panelX), y = Number(rawStore.panelY);
    if (!(x >= 0) || !(y >= 0)) { x = window.innerWidth - w - 16; y = 16; }
    x = Math.max(0, Math.min(x, window.innerWidth - 60));
    y = Math.max(0, Math.min(y, window.innerHeight - 40));
    setImp(panel.el, { left: x + 'px', top: y + 'px', width: w + 'px' });
    setImp(panel.frame, { height: hh + 'px' });
    st.x = x; st.y = y;
  }

  function panelStyleButtons() {
    if (!panel) return;
    const pinned = rawStore.panelPinned === true;
    panel.pin.style.setProperty('opacity', pinned ? '1' : '.55', 'important');
    panel.pin.style.setProperty('background', pinned ? 'rgba(139,107,255,.45)' : 'transparent', 'important');
    try { panel.pin.title = chrome.i18n.getMessage(pinned ? 'panel_unpin' : 'panel_pin') || 'Pin'; } catch (e) { /* ignore */ }
  }

  function panelIdle() {
    clearTimeout(panel && panel.idleT);
    if (!panel) return;
    panel.idleT = setTimeout(() => {
      if (panel && rawStore.panelPinned !== true && !panel.over && !panel.dragging) closePanel();
    }, 10000);
  }

  function closePanel() {
    if (!panel) return;
    clearTimeout(panel.idleT);
    panel.el.remove();
    panel = null;
  }

  function openPanel() {
    const host = panelHost();
    if (!host) return;
    if (panel) {
      if (panel.el.parentNode !== host) host.appendChild(panel.el);
      panelPlace();
      return;
    }
    const mk = (tag, css) => { const el = document.createElement(tag); setImp(el, css); return el; };
    const el = mk('video-glow-panel', {
      display: 'block', position: 'fixed', 'z-index': '2147483647', margin: '0', padding: '0',
      border: '1px solid rgba(139,107,255,.7)', 'border-radius': '12px', overflow: 'hidden',
      background: '#15151b', 'box-shadow': '0 8px 30px rgba(0,0,0,.55)', 'pointer-events': 'auto',
      opacity: '.92', transition: 'opacity .2s', 'box-sizing': 'border-box', filter: 'none', transform: 'none',
      'mix-blend-mode': 'normal', visibility: 'visible'
    });
    const bar = mk('video-glow-panelbar', {
      display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', height: '28px',
      padding: '0 6px 0 10px', background: '#1e1e27', color: '#ecebf3', cursor: 'move',
      font: '600 12px/1 system-ui,sans-serif', 'user-select': 'none', 'box-sizing': 'border-box',
      'border-bottom': '1px solid #2d2d39'
    });
    const title = mk('video-glow-paneltitle', { display: 'block', color: '#ecebf3', font: '600 12px/1 system-ui,sans-serif' });
    try { title.textContent = chrome.i18n.getMessage('panel_title') || 'Video Glow'; } catch (e) { title.textContent = 'Video Glow'; }
    const btns = mk('video-glow-panelbtns', { display: 'flex', gap: '4px', 'align-items': 'center' });
    const mkBtn = (txt) => mk('video-glow-panelbtn', {
      display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '22px', height: '22px',
      'border-radius': '6px', color: '#ecebf3', font: '13px/1 system-ui,sans-serif', cursor: 'pointer',
      border: '1px solid transparent', background: 'transparent', 'user-select': 'none'
    });
    const pin = mkBtn(); pin.textContent = '📌';
    const win = 'documentPictureInPicture' in window ? mkBtn() : null;
    if (win) {
      win.textContent = '◫';
      try { win.title = chrome.i18n.getMessage('q_glowwin') || 'Glow window'; } catch (e) { /* ignore */ }
      win.addEventListener('click', openGlowWindow);
      btns.append(win);
    }
    const close = mkBtn(); close.textContent = '✕';
    try { close.title = chrome.i18n.getMessage('panel_close') || 'Close'; } catch (e) { /* ignore */ }
    btns.append(pin, close);
    bar.append(title, btns);
    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html?panel=1');
    frame.setAttribute('allowtransparency', 'true');
    setImp(frame, { display: 'block', width: '100%', border: '0', margin: '0', padding: '0',
      background: '#15151b', 'color-scheme': 'dark' });
    el.append(bar, frame);
    panel = { el, bar, pin, close, frame, win, st: { x: 0, y: 0 }, over: false, dragging: false, idleT: 0 };

    el.addEventListener('mouseenter', () => { panel.over = true; clearTimeout(panel.idleT); el.style.setProperty('opacity', '1', 'important'); });
    el.addEventListener('mouseleave', () => {
      panel.over = false;
      el.style.setProperty('opacity', rawStore.panelPinned === true ? '.55' : '.4', 'important');
      panelIdle();
    });
    ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'wheel', 'touchstart'].forEach((ev) => {
      el.addEventListener(ev, (e) => e.stopPropagation());
    });
    pin.addEventListener('click', () => {
      const v = rawStore.panelPinned !== true;
      rawStore.panelPinned = v;
      try { chrome.storage.local.set({ panelPinned: v }); } catch (e) { /* ignore */ }
      panelStyleButtons();
    });
    close.addEventListener('click', closePanel);
    bar.addEventListener('pointerdown', (e) => {
      if (e.target === pin || e.target === close || (win && e.target === win) || e.button !== 0) return;
      panel.dragging = true;
      const sx = e.clientX - panel.st.x, sy = e.clientY - panel.st.y;
      try { bar.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      const move = (ev) => {
        const x = Math.max(0, Math.min(ev.clientX - sx, window.innerWidth - 60));
        const y = Math.max(0, Math.min(ev.clientY - sy, window.innerHeight - 40));
        panel.st.x = x; panel.st.y = y;
        setImp(el, { left: x + 'px', top: y + 'px' });
      };
      const up = () => {
        panel.dragging = false;
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        rawStore.panelX = panel.st.x; rawStore.panelY = panel.st.y;
        try { chrome.storage.local.set({ panelX: Math.round(panel.st.x), panelY: Math.round(panel.st.y) }); } catch (er) { /* ignore */ }
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      e.preventDefault();
    });
    host.appendChild(el);
    panelPlace();
    panelStyleButtons();
    panelIdle();
  }

  function togglePanel(op) {
    if (op === 'close' || (op !== 'open' && panel)) { closePanel(); return; }
    openPanel();
  }

  // Полный экран включился/выключился: закреплённая панель переезжает за ним, обычная закрывается.
  function panelOnFullscreen() {
    if (!panel) return;
    if (rawStore.panelPinned === true) {
      const host = panelHost();
      if (host && panel.el.parentNode !== host) { host.appendChild(panel.el); panelPlace(); } else if (!host) closePanel();
    } else {
      closePanel();
    }
  }

  const kickAll = () => glows.forEach((g) => g.kick());
  let motionAt = 0;   // прокрутка/ресайз: на это время — снова частота экрана, чтобы свечение не отставало
  const onScroll = () => { const t = performance.now(); if (t - motionAt > 100) kickAll(); motionAt = t; };

  // Один IntersectionObserver и один ResizeObserver на все видео страницы
  const sharedIo = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const g = glows.get(e.target);
      if (g) { g.inView = e.isIntersecting; g.kick(); }
    }
  }, { rootMargin: '300px' });
  const sharedRo = new ResizeObserver((entries) => {
    for (const e of entries) { const g = glows.get(e.target); if (g) g.kick(); }
  });

  let dirty = true;         // в DOM что-то менялось с прошлого поиска shadow root
  let scanning = false;
  let flushT = 0;
  let down = false;
  const later = (f) => (self.requestIdleCallback ? self.requestIdleCallback(f, { timeout: 800 }) : setTimeout(f, 30));

  function adoptIn(root) {
    if (root.querySelectorAll) root.querySelectorAll('video').forEach(adopt);
  }

  function watch(shadow) {
    if (watchedRoots.has(shadow)) return;
    watchedRoots.add(shadow);
    mo.observe(shadow, { childList: true, subtree: true });
    shadow.addEventListener('play', onPlay, true);
  }

  // Ищем видео внутри открытых shadow root (Reddit и т.п.). Обход DOM порциями по ~6 мс в простое,
  // чтобы на огромных страницах (десятки тысяч узлов) не появлялось длинных задач.
  function deepScan() {
    if (scanning || down) return;
    scanning = true;
    dirty = false;
    const queue = [[document, 0]];
    let tw = null, depth = 0, cnt = 0;
    const pump = () => {
      if (down) { scanning = false; return; }
      const t0 = performance.now();
      for (;;) {
        if (!tw) {
          const it = queue.shift();
          if (!it) { scanning = false; return; }
          depth = it[1];
          adoptIn(it[0]);
          if (depth > 6) continue;
          tw = document.createTreeWalker(it[0], 1);
        }
        const n = tw.nextNode();
        if (!n) { tw = null; continue; }
        const sr = n.shadowRoot;
        if (sr) { watch(sr); queue.push([sr, depth + 1]); }
        if ((++cnt & 255) === 0 && performance.now() - t0 > 6) { later(pump); return; }
      }
    };
    pump();
  }

  // Изменения DOM только помечают страницу «грязной»; сам разбор — редко и одним лёгким проходом.
  const mo = new MutationObserver(() => {
    dirty = true;
    if (!flushT) {
      flushT = setTimeout(() => {
        flushT = 0;
        if (!down && !document.hidden) adoptIn(document);
      }, 500);
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

  const onFs = () => { kickAll(); panelOnFullscreen(); };
  const onResize = () => { motionAt = performance.now(); kickAll(); panelPlace(); };

  const onPlay = (e) => {
    if (e.target instanceof HTMLVideoElement) adopt(e.target);
  };

  // Старый экземпляр (после обновления расширения) снимает себя, чтобы не было двойного свечения.
  function teardown() {
    glows.forEach((g) => g.destroy());
    glows.clear();
    down = true;
    closePanel();
    closeGlowWindow();
    mo.disconnect();
    clearTimeout(flushT);
    sharedIo.disconnect();
    sharedRo.disconnect();
    clearInterval(timer);
    document.removeEventListener('play', onPlay, true);
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('fullscreenchange', onFs);
    document.removeEventListener('webkitfullscreenchange', onFs);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);
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
      g.lkKey = '';
      g.rootKey = '';
      g.fpsCap = fpsLimit();
      g.fxKey = '';
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
    deepScan();
    mo.observe(document, { childList: true, subtree: true });
    document.addEventListener('play', onPlay, true);
    document.addEventListener('mousemove', onMove, { capture: true, passive: true });
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    timer = setInterval(() => {
      if (document.hidden) return;
      if (dirty) deepScan();
      cleanup();
      // истёк пробный период или сменился час «ночного комфорта» — пересчитать
      const sig = (self.VG_proState(rawStore).pro ? 'p' : 'f') + (night(settings).on ? 'n' : 'd');
      if (sig !== proSig) { proSig = sig; applySettings(rawStore); }
    }, 4000);
    initBattery();
  }

  // Диагностика для popup: почему свечения нет / что происходит.
  function onMessage(msg, sender, sendResponse) {
    if (msg && msg.type === 'vg:panel') {
      if (!panelHere()) return;
      if (msg.op === 'glowwin') {
        // окно открывается только по клику на странице: если клик был (кнопка в панели на видео) — сразу,
        // иначе открываем панель и подсвечиваем её кнопку ◫
        if (navigator.userActivation && navigator.userActivation.isActive) openGlowWindow();
        else { openPanel(); if (panel && panel.win) panel.win.animate([{ outline: '2px solid #8b6bff' }, { outline: '2px solid transparent' }], { duration: 700, iterations: 4 }); }
        return;
      }
      togglePanel(msg.op);
      return;
    }
    if (!msg || msg.type !== 'vg:status' || glows.size === 0) return;
    let best = null, bestScore = -1;
    for (const g of glows.values()) {
      const score = (g.why === 'ok' ? 1e9 : 0) + g.v.clientWidth;
      if (score > bestScore) { best = g; bestScore = score; }
    }
    sendResponse({
      count: glows.size, why: best.why, mode: best.mode, readable: best.readable,
      guard: best.gLevel > 0.05, pulse: !best.s.pulse ? 'off' : best.au ? 'on' : 'nodata',
      zoom: !!best.zApplied,
      auto: best.ap ? (best.ap.t0 || best.ap.ready ? best.ap.cls || 'none' : 'wait') : ''
    });
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
      let only = true;
      for (const k in changes) {
        next[k] = changes[k].newValue === undefined ? D[k] : changes[k].newValue;
        if (!(self.VG_PANEL_KEYS || []).includes(k)) only = false;
      }
      if (only) { rawStore = next; panelStyleButtons(); return; }   // двигали/закрепляли панель — свечение не трогаем
      applySettings(next);
    });
  } catch (e) {
    applySettings(D);
    start();
  }
})();
