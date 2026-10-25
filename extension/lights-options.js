// Карточка «Свет в комнате» на странице параметров: задержка света, WLED, Home Assistant.
(() => {
  const L = self.VG_Lights;
  const t = self.vgT;
  const $ = (s) => document.querySelector(s);
  const store = chrome.storage.local;
  if (!L || !$('#lights')) return;

  const WP = { bri: 100, speed: 100, layout: 'around', count: 0, offset: 0, reverse: false, restore: true };
  const HP = { speed: 500 };
  let st = { lightDelay: 0, wledOn: false, wledIp: '', wledPrefs: WP, haOn: false, haUrl: '', haPrefs: HP, haHookId: '' };

  const say = (el, key, ...a) => { $(el).textContent = key ? t(key, ...a) : ''; };
  const errKey = (e) => ({ net: 'lt_err_net', ip: 'hue_err_ip', url: 'ha_err_url', http: 'ha_err_http', notwled: 'wl_err_notwled', bad: 'wl_err_notwled' })[e && e.message] || 'lt_err_net';

  // В режиме «необязательные права» адрес устройства нужно разрешить отдельно.
  async function allow(origin) {
    const origins = [origin];
    try { if (await chrome.permissions.contains({ origins })) return true; return await chrome.permissions.request({ origins }); } catch (e) { return true; }
  }

  // Пример автоматизации для Home Assistant с id вебхука пользователя
  function yaml() {
    let id = st.haHookId;
    try { if (L.okHook(st.haUrl)) id = new URL(st.haUrl).pathname.split('/').pop(); } catch (e) { /* остаётся предложенный */ }
    return [
      'alias: Video Glow',
      'mode: queued',
      'max: 10',
      'trigger:',
      '  - platform: webhook',
      '    webhook_id: ' + id,
      '    allowed_methods: [POST]',
      '    local_only: true',
      'action:',
      '  - choose:',
      '      - conditions: "{{ trigger.json.state == \'start\' }}"',
      '        sequence:',
      '          - service: scene.create',
      '            data: { scene_id: before_video_glow, snapshot_entities: [light.tv] }',
      '      - conditions: "{{ trigger.json.state == \'play\' }}"',
      '        sequence:',
      '          - service: light.turn_on',
      '            target: { entity_id: light.tv }',
      '            data:',
      '              rgb_color: "{{ trigger.json.rgb }}"',
      '              brightness: "{{ trigger.json.brightness }}"',
      '              transition: "{{ trigger.json.transition }}"',
      '      - conditions: "{{ trigger.json.state == \'stop\' }}"',
      '        sequence:',
      '          - service: scene.turn_on',
      '            target: { entity_id: scene.before_video_glow }'
    ].join('\n');
  }

  function render() {
    const w = Object.assign({}, WP, st.wledPrefs), h = Object.assign({}, HP, st.haPrefs);
    $('#ltDelay').value = st.lightDelay || 0;
    $('#ltDelayOut').textContent = (st.lightDelay || 0) + ' ms';
    $('#wlOn').checked = !!st.wledOn;
    if (document.activeElement !== $('#wlIp')) $('#wlIp').value = st.wledIp || '';
    $('#wlLayout').value = w.layout;
    $('#wlCount').value = w.count;
    $('#wlOffset').value = w.offset;
    $('#wlReverse').checked = !!w.reverse;
    $('#wlBri').value = w.bri; $('#wlBriOut').textContent = w.bri + '%';
    $('#wlSpeed').value = String(w.speed);
    $('#wlRestore').checked = !!w.restore;
    const zoned = w.layout !== 'single';
    for (const id of ['#wlCount', '#wlOffset', '#wlReverse']) $(id).disabled = !zoned;
    $('#haOn').checked = !!st.haOn;
    if (document.activeElement !== $('#haUrl')) $('#haUrl').value = st.haUrl || '';
    $('#haUrl').placeholder = 'http://homeassistant.local:8123/api/webhook/' + st.haHookId;
    $('#haSpeed').value = String(h.speed);
    $('#haYaml').value = yaml();
    if (self.vgFill) document.querySelectorAll('#lights input[type=range]').forEach(self.vgFill);
  }

  const saveW = () => {
    st.wledPrefs = {
      layout: $('#wlLayout').value, count: Math.max(0, Math.min(1500, Math.round(+$('#wlCount').value || 0))),
      offset: Math.max(-1500, Math.min(1500, Math.round(+$('#wlOffset').value || 0))), reverse: $('#wlReverse').checked,
      bri: +$('#wlBri').value, speed: +$('#wlSpeed').value, restore: $('#wlRestore').checked
    };
    store.set({ wledPrefs: st.wledPrefs }); render();
  };

  // Адрес WLED: проверяем, что это WLED, и только потом сохраняем и включаем
  async function checkWled() {
    const host = $('#wlIp').value.trim();
    if (!L.okHost(host)) { say('#wlMsg', 'hue_err_ip'); return; }
    if (!(await allow('http://' + host.replace(/:\d+$/, '') + '/*'))) return;
    say('#wlMsg', 'lt_checking');
    try {
      const i = await L.wledInfo(host);
      st.wledIp = host; st.wledOn = true;
      await store.set({ wledIp: host, wledOn: true });
      render(); say('#wlMsg', 'wl_found', i.name, String(i.count));
    } catch (e) { say('#wlMsg', errKey(e)); }
  }

  async function testHa() {
    const url = $('#haUrl').value.trim();
    if (!L.okHook(url)) { say('#haMsg', 'ha_err_url'); return; }
    if (!(await allow(L.origin(url)))) return;
    try {
      await L.haPost(url, { state: 'play', source: 'video_glow', rgb: [255, 120, 0], hex: '#ff7800', brightness: 255, left: [255, 120, 0], right: [255, 120, 0], transition: 0.5 });
      st.haUrl = url; st.haOn = true;
      await store.set({ haUrl: url, haOn: true });
      render(); say('#haMsg', 'ha_sent');
    } catch (e) { say('#haMsg', errKey(e)); }
  }

  $('#ltDelay').addEventListener('input', () => {
    st.lightDelay = +$('#ltDelay').value; store.set({ lightDelay: st.lightDelay }); render();
  });
  $('#wlOn').addEventListener('change', () => { st.wledOn = $('#wlOn').checked; store.set({ wledOn: st.wledOn }); });
  $('#wlCheck').addEventListener('click', checkWled);
  for (const id of ['#wlLayout', '#wlCount', '#wlOffset', '#wlReverse', '#wlSpeed', '#wlRestore']) $(id).addEventListener('change', saveW);
  $('#wlBri').addEventListener('input', saveW);
  $('#haOn').addEventListener('change', () => { st.haOn = $('#haOn').checked; store.set({ haOn: st.haOn }); });
  $('#haTest').addEventListener('click', testHa);
  $('#haSpeed').addEventListener('change', () => { st.haPrefs = { speed: +$('#haSpeed').value }; store.set({ haPrefs: st.haPrefs }); });

  // ошибки фонового потока (устройство пропало) — из storage.session
  const show = (el, s) => { if (s && s.s === 'net') say(el, 'lt_err_net'); };
  if (chrome.storage.session) {
    chrome.storage.session.get(['wledStatus', 'haStatus']).then((r) => { show('#wlMsg', r.wledStatus); show('#haMsg', r.haStatus); }).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'session') return;
      if (ch.wledStatus) show('#wlMsg', ch.wledStatus.newValue);
      if (ch.haStatus) show('#haMsg', ch.haStatus.newValue);
    });
  }

  store.get(Object.keys(st), (r) => {
    st = Object.assign(st, r);
    // предложенный id вебхука: случайный, чтобы его нельзя было угадать в сети
    if (!/^[A-Za-z0-9_-]{4,128}$/.test(st.haHookId || '')) {
      const b = new Uint8Array(9); crypto.getRandomValues(b);
      st.haHookId = 'video_glow_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      store.set({ haHookId: st.haHookId });
    }
    render();
  });
})();
