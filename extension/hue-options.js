// Карточка Philips Hue на странице параметров: поиск моста, подключение кнопкой, выбор ламп.
(() => {
  const H = self.VG_Hue;
  const t = self.vgT;
  const $ = (s) => document.querySelector(s);
  const store = chrome.storage.local;
  const PREFS = { bri: 100, speed: 250, restore: true };
  if (!H || !$('#hue')) return;

  let st = { hueOn: false, hueIp: '', hueUser: '', hueLights: [], huePrefs: PREFS, hueZones: {} };
  let pairing = 0;

  const say = (key, ...a) => { $('#hueMsg').textContent = key ? t(key, ...a) : ''; };
  const errKey = (e) => ({ net: 'hue_err_net', ip: 'hue_err_ip', auth: 'hue_err_auth', busy: 'hue_err_busy', notbridge: 'hue_err_notbridge' })[e && e.message] || 'hue_err_net';

  // В режиме «необязательные права» адрес моста нужно разрешить отдельно (в обычной сборке уже есть <all_urls>).
  async function allow(ip) {
    const origins = ['http://' + ip + '/*'];
    try { if (await chrome.permissions.contains({ origins })) return true; return await chrome.permissions.request({ origins }); } catch (e) { return true; }
  }

  function render() {
    const on = !!st.hueOn, linked = H.okIp(st.hueIp) && H.okUser(st.hueUser);
    $('#hueOn').checked = on;
    if (document.activeElement !== $('#hueIp')) $('#hueIp').value = st.hueIp || '';
    $('#hueLinked').hidden = !linked;
    $('#hueForget').hidden = !linked;
    const p = Object.assign({}, PREFS, st.huePrefs);
    $('#hueBri').value = p.bri; $('#hueBriOut').textContent = p.bri + '%';
    $('#hueSpeed').value = String(p.speed);
    $('#hueRestore').checked = !!p.restore;
  }

  async function loadLights() {
    const box = $('#hueList');
    box.textContent = '';
    if (!H.okIp(st.hueIp) || !H.okUser(st.hueUser)) return;
    let list;
    try { list = await H.lights(st.hueIp, st.hueUser); } catch (e) { say(errKey(e)); return; }
    if (!list.length) { say('hue_no_lights'); return; }
    // первое подключение — сразу все цветные лампы
    if (!st.hueLights.length) { st.hueLights = list.map((l) => l.id); store.set({ hueLights: st.hueLights }); }
    for (const l of list) {
      const lab = document.createElement('label');
      lab.className = 'pctl';
      const name = document.createElement('span');
      name.textContent = l.name + (l.room ? ' · ' + l.room : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = st.hueLights.includes(l.id);
      cb.addEventListener('change', () => {
        st.hueLights = cb.checked ? [...new Set([...st.hueLights, l.id])] : st.hueLights.filter((x) => x !== l.id);
        store.set({ hueLights: st.hueLights });
      });
      // зона кадра для лампы: весь кадр, левый или правый край
      const zone = document.createElement('select');
      zone.setAttribute('aria-label', t('hue_zone'));
      for (const z of ['a', 'l', 'r']) zone.append(new Option(t('hue_zone_' + z), z));
      zone.value = st.hueZones[l.id] || 'a';
      zone.addEventListener('change', () => {
        st.hueZones = Object.assign({}, st.hueZones, { [l.id]: zone.value });
        if (zone.value === 'a') delete st.hueZones[l.id];
        store.set({ hueZones: st.hueZones });
      });
      const ctl = document.createElement('span');
      ctl.className = 'row';
      ctl.append(zone, cb);
      lab.append(name, ctl);
      box.append(lab);
    }
    say(st.hueLights.length > 6 ? 'hue_many' : '');
  }

  async function find() {
    say('hue_searching');
    try {
      const ips = await H.discover();
      if (!ips.length) { say('hue_not_found'); return; }
      $('#hueIp').value = ips[0];
      say('hue_found', ips[0]);
    } catch (e) { say(e.message === 'busy' ? 'hue_err_busy' : 'hue_not_found'); }
  }

  async function link() {
    const ip = $('#hueIp').value.trim();
    if (!H.okIp(ip)) { say('hue_err_ip'); return; }
    if (!(await allow(ip))) return;
    try { await H.probe(ip); } catch (e) { say(errKey(e)); return; }
    const my = ++pairing, until = Date.now() + 30000;
    while (my === pairing && Date.now() < until) {
      say('hue_press', Math.ceil((until - Date.now()) / 1000));
      let r;
      try { r = await H.pair(ip); } catch (e) { say(errKey(e)); pairing++; return; }
      if (r.user) {
        pairing++;
        st.hueIp = ip; st.hueUser = r.user; st.hueLights = [];
        await store.set({ hueIp: ip, hueUser: r.user, hueLights: [], hueOn: true });
        st.hueOn = true;
        render(); say('hue_linked');
        loadLights();
        return;
      }
      if (r.error !== 'press') { say('hue_err_net'); pairing++; return; }
      await new Promise((res) => setTimeout(res, 1500));
    }
    if (my === pairing) { pairing++; say('hue_timeout'); }
  }

  const savePrefs = () => {
    st.huePrefs = { bri: +$('#hueBri').value, speed: +$('#hueSpeed').value, restore: $('#hueRestore').checked };
    $('#hueBriOut').textContent = st.huePrefs.bri + '%';
    store.set({ huePrefs: st.huePrefs });
  };

  $('#hueOn').addEventListener('change', () => { st.hueOn = $('#hueOn').checked; store.set({ hueOn: st.hueOn }); });
  $('#hueFind').addEventListener('click', find);
  $('#hueLink').addEventListener('click', link);
  $('#hueForget').addEventListener('click', () => {
    pairing++;
    st = Object.assign(st, { hueOn: false, hueIp: '', hueUser: '', hueLights: [] });
    store.set({ hueOn: false, hueIp: '', hueUser: '', hueLights: [], hueZones: {} });
    st.hueZones = {};
    $('#hueList').textContent = ''; render(); say('');
  });
  $('#hueBri').addEventListener('input', savePrefs);
  $('#hueSpeed').addEventListener('change', savePrefs);
  $('#hueRestore').addEventListener('change', savePrefs);

  // ошибки фонового потока (мост пропал, ключ отозван) — из storage.session
  const showStatus = (s) => { if (s && (s.s === 'net' || s.s === 'auth')) say(s.s === 'auth' ? 'hue_err_auth' : 'hue_err_net'); };
  if (chrome.storage.session) {
    chrome.storage.session.get('hueStatus').then((r) => showStatus(r.hueStatus)).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'session' && ch.hueStatus) showStatus(ch.hueStatus.newValue); });
  }

  store.get(['hueOn', 'hueIp', 'hueUser', 'hueLights', 'huePrefs', 'hueZones'], (r) => {
    st = Object.assign(st, r);
    if (!st.hueZones || typeof st.hueZones !== 'object') st.hueZones = {};
    if (!Array.isArray(st.hueLights)) st.hueLights = [];
    render();
    loadLights();
  });
})();
