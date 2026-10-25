// WLED и Home Assistant: работа с устройствами в локальной сети.
// Используется фоном (поток цветов, lights-bg.js) и страницей параметров (проверка адреса, разметка ленты).
(() => {
  // Адрес WLED: IPv4 или имя хоста, можно с портом (без схемы и пути).
  const okHost = (h) => /^(\d{1,3}(\.\d{1,3}){3}|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*)(:\d{1,5})?$/i.test(String(h || ''));
  // Вебхук Home Assistant: http(s)://хост[:порт]/api/webhook/<id>
  const okHook = (u) => {
    try {
      const x = new URL(String(u || ''));
      return (x.protocol === 'http:' || x.protocol === 'https:') && !x.username && !x.password &&
        /^\/api\/webhook\/[A-Za-z0-9_-]{4,128}$/.test(x.pathname) && !x.search && !x.hash;
    } catch (e) { return false; }
  };
  const origin = (u) => { try { return new URL(u).origin + '/*'; } catch (e) { return ''; } };

  // Ответ или ошибка: 'net' (не отвечает), 'bad' (не JSON), 'http' (код ответа не 2xx)
  const req = async (url, method, body, ms, json) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 3000);
    let r;
    try {
      r = await fetch(url, {
        method: method || 'GET', signal: ctl.signal, cache: 'no-store', credentials: 'omit',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new Error('net'); } finally { clearTimeout(t); }
    if (!r.ok) throw new Error('http');
    if (!json) return true;
    try { return await r.json(); } catch (e) { throw new Error('bad'); }
  };

  const wurl = (host, p) => {
    if (!okHost(host)) throw new Error('ip');
    return 'http://' + String(host).trim() + p;
  };

  // ── WLED (JSON API) ──
  // Проверка: по адресу WLED? → { name, count, ver }
  async function wledInfo(host) {
    const r = await req(wurl(host, '/json/info'), 'GET', null, 3000, true);
    if (!r || typeof r !== 'object' || !r.leds || typeof r.leds.count !== 'number') throw new Error('notwled');
    return { name: String(r.name || 'WLED'), count: r.leds.count, ver: String(r.ver || '') };
  }
  const wledState = (host) => req(wurl(host, '/json/state'), 'GET', null, 3000, true);
  const wledSet = (host, st) => req(wurl(host, '/json/state'), 'POST', st, 2000, false);

  // Только то, что нужно вернуть: питание, яркость и настройки сегментов (эффект, цвета, палитра).
  function wledRestoreBody(s) {
    if (!s || typeof s !== 'object') return null;
    const body = { on: !!s.on, transition: 7 };
    if (typeof s.bri === 'number') body.bri = s.bri;
    if (Array.isArray(s.seg)) {
      body.seg = s.seg.filter((g) => g && typeof g.id === 'number').map((g) => {
        const o = { id: g.id, frz: false };
        for (const k of ['on', 'bri', 'col', 'fx', 'sx', 'ix', 'pal', 'c1', 'c2', 'c3', 'o1', 'o2', 'o3', 'rev', 'mi'])
          if (k in g) o[k] = g[k];
        return o;
      });
    }
    return body;
  }

  // Кадр по периметру: 46 ячеек сетки 16×9 по часовой стрелке, начиная с нижнего левого угла
  // (левый край снизу вверх, верх слева направо, правый край сверху вниз, низ справа налево).
  const EDGE = 46;
  // Верхняя строка кадра (16 ячеек) — из периметра
  const topRow = (edge) => edge.slice(8, 24);

  const hex = (c) => c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

  // Разметка ленты: layout 'single' — один цвет; 'around' — по периметру экрана; 'top' — только верх.
  // count — светодиодов, offset — сдвиг начала (где первый светодиод), reverse — против часовой.
  // → массив для поля seg.i: [start, stop, 'rrggbb', …] (подряд идущие светодиоды одной ячейки — одним отрезком)
  function wledRanges(edge, count, offset, reverse, layout) {
    const cells = layout === 'top' ? topRow(edge) : edge;
    const n = cells.length;
    const out = [];
    let start = 0, prev = -1;
    for (let i = 0; i < count; i++) {
      let p = ((i + offset) % count + count) % count;
      if (reverse) p = count - 1 - p;
      const c = Math.min(n - 1, Math.floor((p + 0.5) / count * n));
      if (c !== prev) {
        if (prev >= 0) out.push(start, i, hex(cells[prev]));
        start = i; prev = c;
      }
    }
    if (prev >= 0) out.push(start, count, hex(cells[prev]));
    return out;
  }

  // ── Home Assistant: вебхук, дальше автоматизация пользователя ──
  const haPost = (url, body) => {
    if (!okHook(url)) return Promise.reject(new Error('url'));
    return req(url, 'POST', body, 3000, false);
  };

  self.VG_Lights = { okHost, okHook, origin, wledInfo, wledState, wledSet, wledRestoreBody, wledRanges, hex, EDGE, haPost };
})();
