// Philips Hue: работа с мостом в локальной сети (classic API v1, http).
// Используется фоном (поток цветов, lights-bg.js) и страницей параметров (поиск моста, подключение, выбор ламп).
(() => {
  const DEVICE = 'video_glow#browser';

  // Адрес моста: только IPv4 или имя хоста (без схемы, порта и пути), ключ — только [A-Za-z0-9-].
  const okIp = (ip) => /^(\d{1,3}(\.\d{1,3}){3}|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*)$/i.test(String(ip || ''));
  const okUser = (u) => /^[A-Za-z0-9-]{8,64}$/.test(String(u || ''));

  // Ответ моста или ошибка: 'net' (не отвечает), 'bad' (не JSON), 'busy' (сервис поиска ограничил частоту)
  const req = async (url, method, body, ms) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 4000);
    let r;
    try {
      r = await fetch(url, {
        method: method || 'GET', signal: ctl.signal, cache: 'no-store', credentials: 'omit',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new Error('net'); } finally { clearTimeout(t); }
    if (r.status === 429) throw new Error('busy');
    try { return await r.json(); } catch (e) { throw new Error('bad'); }
  };
  const base = (ip, user) => {
    if (!okIp(ip)) throw new Error('ip');
    if (user !== undefined && !okUser(user)) throw new Error('auth');
    return 'http://' + String(ip).trim() + '/api' + (user ? '/' + user : '');
  };
  // Ошибка «нет доступа» (ключ удалён в приложении Hue) → 'auth'
  const authErr = (r) => Array.isArray(r) && r[0] && r[0].error && r[0].error.type === 1;

  // sRGB → координаты xy (гамма снимается, широкая гамма Hue; мост сам подгоняет под охват лампы)
  // и яркость bri 1…254 по самому яркому каналу (как глаз видит «силу» цвета).
  function xy(rgb) {
    const lin = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
    const r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
    const s = X + Y + Z;
    const m = Math.max(rgb[0], rgb[1], rgb[2]) / 255;
    const bri = Math.max(1, Math.min(254, Math.round(m * 254)));
    if (s <= 1e-6) return { xy: [0.3227, 0.329], bri: 1 };
    return { xy: [Math.round(X / s * 1e4) / 1e4, Math.round(Y / s * 1e4) / 1e4], bri };
  }

  // Мосты в сети (сервис Philips, не чаще раза в 15 минут; если недоступен — адрес вводится вручную)
  async function discover() {
    const list = await req('https://discovery.meethue.com/', 'GET', null, 6000);
    return Array.isArray(list) ? list.map((b) => b && b.internalipaddress).filter(okIp) : [];
  }

  // Проверка, что по адресу — мост Hue (без ключа). → { name, id } или ошибка
  async function probe(ip) {
    const r = await req(base(ip) + '/config', 'GET', null, 3000);
    if (!r || typeof r !== 'object' || !r.bridgeid) throw new Error('notbridge');
    return { name: String(r.name || 'Hue Bridge'), id: String(r.bridgeid) };
  }

  // → { user } | { error: 'press' | 'other' }. Перед вызовом нужно нажать кнопку на мосту.
  async function pair(ip) {
    const r = await req(base(ip), 'POST', { devicetype: DEVICE });
    const it = Array.isArray(r) ? r[0] : null;
    if (it && it.success && okUser(it.success.username)) return { user: it.success.username };
    if (it && it.error && it.error.type === 101) return { error: 'press' };
    return { error: 'other' };
  }

  // Цветные лампы и комнаты: { lights: [{ id, name, room, state }] }
  async function lights(ip, user) {
    const [L, G] = await Promise.all([req(base(ip, user) + '/lights'), req(base(ip, user) + '/groups').catch(() => ({}))]);
    if (authErr(L)) throw new Error('auth');
    if (!L || Array.isArray(L) || typeof L !== 'object') throw new Error('bad');
    const room = {};
    if (G && typeof G === 'object' && !Array.isArray(G)) {
      for (const gid in G) {
        const g = G[gid];
        if (g && (g.type === 'Room' || g.type === 'Zone') && Array.isArray(g.lights)) {
          for (const lid of g.lights) if (!room[lid] || g.type === 'Room') room[lid] = String(g.name || '');
        }
      }
    }
    return Object.keys(L).map((id) => ({ id, name: String(L[id].name || id), room: room[id] || '', state: L[id].state }))
      .filter((l) => l.state && Array.isArray(l.state.xy));
  }

  // Состояние ламп (для сохранения перед показом и возврата после): { id: state }
  async function states(ip, user, ids) {
    const L = await req(base(ip, user) + '/lights');
    if (authErr(L)) throw new Error('auth');
    const out = {};
    if (L && typeof L === 'object' && !Array.isArray(L)) for (const id of ids) if (L[id] && L[id].state) out[id] = L[id].state;
    return out;
  }

  // PUT состояния лампы. → true | ошибка ('auth', 'net', …)
  async function setState(ip, user, id, st) {
    const r = await req(base(ip, user) + '/lights/' + encodeURIComponent(id) + '/state', 'PUT', st, 3000);
    if (authErr(r)) throw new Error('auth');
    return true;
  }

  self.VG_Hue = { xy, discover, probe, pair, lights, states, setState, okIp, okUser };
})();
