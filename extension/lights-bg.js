// Свет в комнате, в фоне: принимает цвета сцены от вкладок (сообщение vg:light), выбирает один источник
// и ведёт устройства через общий слой: Philips Hue, WLED, Home Assistant. У каждого устройства свой
// такт (ограничение частоты) и не больше одного запроса в полёте, поэтому очередь не копится.
// Перед показом состояние устройства сохраняется и возвращается, когда видео замолкло (пауза, вкладка закрыта).
(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const H = self.VG_Hue, L = self.VG_Lights;
  if (!H || !L) return;
  const sess = api.storage.session || null;     // переживает перезапуск фонового воркера

  const FRESH = 1500;     // источник считается живым, мс после последнего сообщения
  const IDLE = 4000;      // тишина, после которой сеанс заканчивается и свет возвращается
  const PAUSE_NET = 10000;

  // ── источники: активная вкладка, затем самое большое видео, затем самое свежее ──
  const sources = new Map();   // 'tab:frame' → { area, active, at, hist: [{ at, f }] }
  let lastMsg = 0, delay = 0;

  function pick(now) {
    let best = null;
    for (const [k, s] of sources) {
      if (now - s.at > FRESH) { sources.delete(k); continue; }
      if (!best || s.active > best.active || (s.active === best.active && (s.area > best.area ||
        (s.area === best.area && s.at > best.at)))) best = s;
    }
    return best;
  }
  // Кадр с учётом задержки: последний, пришедший не позже чем delay мс назад
  function frame(now) {
    const s = pick(now);
    if (!s) return null;
    const h = s.hist, t = now - delay;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].at <= t) return h[i].f;
    return h[0].f;
  }

  const clamp = (v, a, b, d) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : d));
  const mix = (cur, to, k) => (cur ? cur.map((c, i) => c + (to[i] - c) * k) : to.slice());
  const near = (a, b, d) => a && b && a.every((v, i) => Math.abs(v - b[i]) < d);

  // ── общий ход устройства: такт, сохранение до показа, возврат после, отказ сети ──
  function device(drv) {
    let cfg = drv.read({}), timer = 0, period = 0, live = false, starting = false, saved = null;
    let fails = 0, pausedUntil = 0, dead = false, status = '';
    const sKey = drv.name + 'Saved';

    const setStatus = (s) => {
      if (s === status) return;
      status = s;
      if (sess) sess.set({ [drv.name + 'Status']: { s, at: Date.now() } }).catch(() => {});
    };
    const usable = () => !dead && drv.usable(cfg);
    const ctx = {
      ok() { fails = 0; },
      fail(e) {
        const m = e && e.message;
        if (m === 'auth') { dead = true; setStatus('auth'); end(false); return; }
        if (++fails >= 3) { pausedUntil = Date.now() + PAUSE_NET; fails = 0; setStatus('net'); }
      }
    };

    function startTimer() {
      if (!usable() && !saved) return;
      const p = drv.period(cfg);
      if (timer && p === period) return;
      clearInterval(timer);
      period = p;
      timer = setInterval(tick, period);
    }

    async function begin() {
      if (live || starting) return;
      starting = true;
      drv.reset();
      if (!saved) {
        try {
          saved = await drv.save(cfg);
          if (sess) sess.set({ [sKey]: saved }).catch(() => {});
        } catch (e) { saved = null; starting = false; ctx.fail(e); return; }
      }
      starting = false;
      live = true;
    }

    async function end(restore, c = cfg) {
      clearInterval(timer); timer = 0; period = 0;
      live = false;
      drv.reset();
      const s = saved;
      saved = null;
      if (sess) sess.remove(sKey).catch(() => {});
      if (status === 'live') setStatus('idle');
      if (!restore || !s) return;
      try { await drv.restore(c, s); } catch (e) { /* устройство недоступно — оставляем как есть */ }
    }

    function tick() {
      const now = Date.now();
      if (!usable()) { end(true); return; }
      const f = frame(now);
      if (!f) { if (now - lastMsg > IDLE) end(true); return; }
      if (now < pausedUntil) return;
      if (!live) { begin(); return; }        // первый такт — сохраняем состояние
      if (status !== 'live') setStatus('live');
      drv.send(cfg, f, period, ctx, saved);
    }

    return {
      keys: drv.keys,
      on: () => usable(),
      poke: startTimer,
      async load(r) {
        cfg = drv.read(r);
        if (sess) {
          const o = await sess.get(sKey);
          if (o[sKey] && typeof o[sKey] === 'object') { saved = o[sKey]; lastMsg = Date.now(); startTimer(); }
        }
      },
      changed(ch, r) {
        const prev = cfg;
        cfg = drv.read(r);
        const addr = drv.addrKeys.some((k) => ch[k]);
        if (addr) { dead = false; fails = 0; pausedUntil = 0; setStatus(''); }
        // выключили / сменили адрес или набор ламп — вернуть свет и начать заново со следующего кадра
        const reset = !drv.usable(cfg) || addr || drv.resetKeys.some((k) => ch[k]);
        if (reset && (live || saved)) end(true, prev);
        else if (live) startTimer();
      }
    };
  }

  // ── Philips Hue: мост принимает ~10 команд в секунду на все лампы, поэтому
  // период = max(скорость, 100 мс × число ламп); лампа берёт цвет своей зоны кадра ──
  const huePrefs = { bri: 100, speed: 250, restore: true };
  const hue = (() => {
    let cur = {};               // зона → сглаженный цвет
    const sent = {};            // id → { x, y, bri } — последнее отправленное
    const busy = new Set();     // лампы с запросом в полёте
    return {
      name: 'hue',
      keys: ['hueOn', 'hueIp', 'hueUser', 'hueLights', 'huePrefs', 'hueZones'],
      addrKeys: ['hueIp', 'hueUser'], resetKeys: ['hueLights'],
      read(r) {
        const p = Object.assign({}, huePrefs, r.huePrefs && typeof r.huePrefs === 'object' ? r.huePrefs : {});
        p.bri = clamp(p.bri, 5, 100, 100);
        p.speed = clamp(p.speed, 100, 1000, 250);
        return {
          on: r.hueOn === true, ip: String(r.hueIp || ''), user: String(r.hueUser || ''),
          lights: Array.isArray(r.hueLights) ? r.hueLights.map(String).slice(0, 50) : [], prefs: p,
          zones: r.hueZones && typeof r.hueZones === 'object' ? r.hueZones : {}
        };
      },
      usable: (c) => c.on && H.okIp(c.ip) && H.okUser(c.user) && c.lights.length > 0,
      period: (c) => Math.max(c.prefs.speed, 100 * Math.max(1, c.lights.length)),
      reset() { cur = {}; for (const k in sent) delete sent[k]; },
      save: (c) => H.states(c.ip, c.user, c.lights),
      send(c, f, period, ctx) {
        // лёгкое сглаживание: мост и так плавно переходит за transitiontime
        const zc = {};
        for (const z of ['a', 'l', 'r']) {
          if (!c.lights.some((id) => (c.zones[id] || 'a') === z)) continue;
          cur[z] = mix(cur[z], z === 'l' ? f.left : z === 'r' ? f.right : f.rgb, 0.6);
          zc[z] = H.xy(cur[z]);
        }
        const tt = Math.max(1, Math.round(period / 100));
        for (const id of c.lights) {
          if (busy.has(id)) continue;
          const z = zc[c.zones[id] || 'a'] || zc.a;
          if (!z) continue;
          const bri = Math.max(1, Math.round(z.bri * c.prefs.bri / 100));
          const last = sent[id];
          if (last && Math.abs(last.x - z.xy[0]) + Math.abs(last.y - z.xy[1]) < 0.004 && Math.abs(last.bri - bri) < 4) continue;
          busy.add(id);
          sent[id] = { x: z.xy[0], y: z.xy[1], bri };
          H.setState(c.ip, c.user, id, { on: true, xy: z.xy, bri, transitiontime: tt })
            .then(() => ctx.ok(), (e) => { delete sent[id]; ctx.fail(e); })
            .finally(() => busy.delete(id));
        }
      },
      async restore(c, s) {
        if (!c.prefs.restore || !H.okUser(c.user)) return;
        for (const id in s) {
          const st = s[id];
          const body = { on: !!st.on, transitiontime: 8 };
          if (st.on) {
            if (typeof st.bri === 'number') body.bri = st.bri;
            if (st.colormode === 'ct' && typeof st.ct === 'number') body.ct = st.ct;
            else if (st.colormode === 'hs' && typeof st.hue === 'number') { body.hue = st.hue; body.sat = st.sat; }
            else if (Array.isArray(st.xy)) body.xy = st.xy;
          }
          try { await H.setState(c.ip, c.user, id, body); } catch (e) { /* мост недоступен */ }
        }
      }
    };
  })();

  // ── WLED: лента на ESP32/ESP8266, JSON API по http; лента по периметру, сверху или одним цветом ──
  const wledPrefs = { bri: 100, speed: 100, layout: 'around', count: 0, offset: 0, reverse: false, restore: true };
  const wled = (() => {
    let cur = null, last = null, busy = false, lastAt = 0;
    return {
      name: 'wled',
      keys: ['wledOn', 'wledIp', 'wledPrefs'],
      addrKeys: ['wledIp'], resetKeys: [],
      read(r) {
        const p = Object.assign({}, wledPrefs, r.wledPrefs && typeof r.wledPrefs === 'object' ? r.wledPrefs : {});
        p.bri = clamp(p.bri, 5, 100, 100);
        p.speed = clamp(p.speed, 50, 1000, 100);
        p.count = Math.round(clamp(p.count, 0, 1500, 0));
        p.offset = Math.round(clamp(p.offset, -1500, 1500, 0));
        if (!['single', 'around', 'top'].includes(p.layout)) p.layout = 'around';
        return { on: r.wledOn === true, host: String(r.wledIp || ''), prefs: p };
      },
      usable: (c) => c.on && L.okHost(c.host),
      period: (c) => c.prefs.speed,
      reset() { cur = null; last = null; },
      // Сохраняем состояние и запоминаем главный сегмент: его длина — число светодиодов по умолчанию
      async save(c) {
        const st = await L.wledState(c.host);
        if (!st || typeof st !== 'object') throw new Error('bad');
        const id = typeof st.mainseg === 'number' ? st.mainseg : 0;
        const g = Array.isArray(st.seg) ? st.seg.find((x) => x && x.id === id) : null;
        const len = g && typeof g.len === 'number' ? g.len : g ? (g.stop - g.start) : 0;
        return { st, seg: id, len: len > 0 ? len : 0 };
      },
      send(c, f, period, ctx, sv) {
        if (busy) return;
        const p = c.prefs, single = p.layout === 'single' || !f.edge;
        const target = single ? [f.rgb] : f.edge;
        cur = cur && cur.length === target.length ? cur.map((x, i) => mix(x, target[i], 0.7)) : target.map((x) => x.slice());
        const now = Date.now();
        if (last && now - lastAt < 2000 && cur.every((x, i) => near(x, last[i], 3))) return;
        const seg = { id: sv ? sv.seg : 0, fx: 0 };
        const count = p.count || (sv && sv.len) || 0;
        if (single || !count) seg.col = [cur[0].map(Math.round)];
        else seg.i = L.wledRanges(cur, count, p.offset, p.reverse, p.layout);
        busy = true;
        last = cur.map((x) => x.slice()); lastAt = now;
        L.wledSet(c.host, { on: true, bri: Math.round(p.bri * 2.55), tt: Math.max(0, Math.round(period / 100) - 1), seg: [seg] })
          .then(() => ctx.ok(), (e) => { last = null; ctx.fail(e); })
          .finally(() => { busy = false; });
      },
      async restore(c, s) {
        if (!c.prefs.restore) return;
        const body = L.wledRestoreBody(s && s.st);
        if (body) await L.wledSet(c.host, body);
      }
    };
  })();

  // ── Home Assistant: вебхук с цветом; лампы ведёт автоматизация пользователя.
  // start — сделать снимок сцены, play — цвет, stop — вернуть снимок ──
  const haPrefs = { speed: 500 };
  const ha = (() => {
    let cur = null, last = null, busy = false, lastAt = 0;
    const out = (c) => c.map((v) => Math.round(Math.max(0, Math.min(255, v))));
    return {
      name: 'ha',
      keys: ['haOn', 'haUrl', 'haPrefs'],
      addrKeys: ['haUrl'], resetKeys: [],
      read(r) {
        const p = Object.assign({}, haPrefs, r.haPrefs && typeof r.haPrefs === 'object' ? r.haPrefs : {});
        p.speed = clamp(p.speed, 200, 2000, 500);
        return { on: r.haOn === true, url: String(r.haUrl || ''), prefs: p };
      },
      usable: (c) => c.on && L.okHook(c.url),
      period: (c) => c.prefs.speed,
      reset() { cur = null; last = null; },
      save: (c) => L.haPost(c.url, { state: 'start', source: 'video_glow' }).then(() => ({ url: c.url })),
      send(c, f, period, ctx) {
        if (busy) return;
        cur = mix(cur, f.rgb, 0.7);
        const now = Date.now();
        if (last && now - lastAt < 5000 && near(cur, last, 4)) return;
        last = cur.slice(); lastAt = now;
        const rgb = out(cur);
        busy = true;
        L.haPost(c.url, {
          state: 'play', source: 'video_glow', rgb, hex: '#' + L.hex(rgb),
          brightness: Math.max(1, Math.max(rgb[0], rgb[1], rgb[2])),
          left: out(f.left), right: out(f.right), transition: period / 1000
        }).then(() => ctx.ok(), (e) => { last = null; ctx.fail(e); })
          .finally(() => { busy = false; });
      },
      // «stop» шлём всегда: автоматизация сама решает, возвращать ли сцену
      restore: (c, s) => L.haPost((s && s.url) || c.url, { state: 'stop', source: 'video_glow' })
    };
  })();

  const devices = [device(hue), device(wled), device(ha)];
  const ALL = ['lightDelay'].concat(...devices.map((d) => d.keys));
  let ready = null;

  function load() {
    ready = (async () => {
      const r = await api.storage.local.get(ALL);
      delay = clamp(r.lightDelay, 0, 1000, 0);
      // воркер перезапустился посреди показа — вернуть свет, если видео так и не продолжится
      for (const d of devices) await d.load(r);
    })().catch(() => {});
  }

  // ── кадр от вкладки: rgb — общий цвет, left/right — края, edge — 46 ячеек по периметру ──
  const okc = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number' && v >= 0 && v <= 255);
  api.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || (msg.type !== 'vg:light' && msg.type !== 'vg:hue') || !sender || !sender.tab) return;
    if (!okc(msg.rgb)) return;
    const f = {
      rgb: msg.rgb,
      left: okc(msg.left) ? msg.left : msg.rgb,
      right: okc(msg.right) ? msg.right : msg.rgb,
      edge: Array.isArray(msg.edge) && msg.edge.length === L.EDGE && msg.edge.every(okc) ? msg.edge : null
    };
    const go = () => {
      if (!devices.some((d) => d.on())) return;
      const now = Date.now();
      lastMsg = now;
      const k = sender.tab.id + ':' + (sender.frameId || 0);
      const s = sources.get(k) || { hist: [] };
      s.area = Number(msg.area) || 0; s.active = sender.tab.active ? 1 : 0; s.at = now;
      s.hist.push({ at: now, f });
      // старше нужного для задержки не держим
      while (s.hist.length > 1 && (s.hist[1].at <= now - delay - 200 || s.hist.length > 80)) s.hist.shift();
      sources.set(k, s);
      for (const d of devices) if (d.on()) d.poke();
    };
    if (ready) ready.then(go); else go();
  });

  api.tabs.onRemoved.addListener((tabId) => {
    for (const k of sources.keys()) if (k.startsWith(tabId + ':')) sources.delete(k);
  });

  api.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (!ALL.some((k) => ch[k])) return;
    api.storage.local.get(ALL).then((r) => {
      delay = clamp(r.lightDelay, 0, 1000, 0);
      for (const d of devices) if (d.keys.some((k) => ch[k])) d.changed(ch, r);
    });
  });

  load();
})();
