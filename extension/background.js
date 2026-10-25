// Бейдж «OFF», горячие клавиши, welcome-страница и подключение к уже открытым вкладкам.
// Режим «необязательные права»: в манифесте нет host_permissions, доступ к сайтам пользователь
// выдаёт сам (окно приветствия). Тогда content-скрипт регистрируется динамически.
const api = typeof browser !== 'undefined' ? browser : chrome;   // Firefox: promises через browser.*
if (typeof importScripts === 'function') { try { importScripts('defaults.js', 'license.js', 'hue.js', 'lights.js', 'lights-bg.js'); } catch (e) { /* Firefox грузит через manifest */ } }
const OPTIONAL_MODE = !(api.runtime.getManifest().host_permissions || []).length;

async function syncScripts() {
  if (!OPTIONAL_MODE) return;
  try { await api.scripting.unregisterContentScripts({ ids: ['vg'] }); } catch (e) { /* ещё не было */ }
  let origins = [];
  try { origins = (await api.permissions.getAll()).origins || []; } catch (e) { return; }
  if (!origins.length) return;
  try {
    await api.scripting.registerContentScripts([{
      id: 'vg', matches: origins, js: ['defaults.js', 'content.js'],
      allFrames: true, matchAboutBlank: true, runAt: 'document_idle', persistAcrossSessions: true
    }]);
  } catch (e) { /* неподходящий шаблон — пропускаем */ }
}

// Проверка лицензионного ключа (офлайн, по подписи). Результат — в proValid/proId.
async function revalidateLicense() {
  if (!self.VG_CONFIG || !self.VG_CONFIG.PRO_REQUIRED) return;
  try {
    const { licenseKey = '', proValid = false, proId = '' } = await api.storage.local.get(['licenseKey', 'proValid', 'proId']);
    let ok = false, id = '';
    if (licenseKey && self.VG_License) {
      const r = await self.VG_License.verify(licenseKey);
      ok = r.ok; id = r.ok ? r.id : '';
    }
    if (ok !== !!proValid || id !== proId) await api.storage.local.set({ proValid: ok, proId: id });
  } catch (e) { /* ignore */ }
}

// Начало пробного периода: при установке (и один раз для тех, кто обновился с версии без Pro).
async function ensureTrialStart() {
  if (!self.VG_CONFIG || !self.VG_CONFIG.PRO_REQUIRED) return;
  try {
    const { installedAt = 0 } = await api.storage.local.get('installedAt');
    if (!installedAt) await api.storage.local.set({ installedAt: Date.now() });
  } catch (e) { /* ignore */ }
}

const norm = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

const setBadge = (enabled) => {
  api.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  api.action.setBadgeBackgroundColor({ color: '#666666' });
};

async function refreshBadge() {
  const { enabled = true } = await api.storage.local.get('enabled');
  setBadge(enabled !== false);
}

// После установки/обновления content-скрипт не появляется в уже открытых вкладках сам —
// внедряем его вручную (новый скрипт сам вытесняет старый через событие takeover).
async function injectIntoOpenTabs() {
  let tabs = [];
  try { tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return; }
  for (const tab of tabs) {
    if (tab.id == null || tab.discarded) continue;
    try {
      await api.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['defaults.js', 'content.js']
      });
    } catch (e) { /* служебные страницы, магазин и т.п. — пропускаем */ }
  }
}

api.runtime.onInstalled.addListener(async (details) => {
  refreshBadge();
  await ensureTrialStart();
  await revalidateLicense();
  await syncScripts();
  if (details.reason === 'install') {
    try { await api.storage.local.set({ migFsFill: true }); } catch (e) { /* не критично */ }
    api.tabs.create({ url: api.runtime.getURL('welcome.html' + (OPTIONAL_MODE ? '#grant' : '')) });
  }
  if (details.reason === 'update') {
    // бесшовный край теперь включён у всех сразу (в том числе в профилях сайтов)
    try {
      const { siteProfiles = {}, seamless } = await api.storage.local.get(['siteProfiles', 'seamless']);
      const patch = {};
      if (seamless === false) patch.seamless = true;
      let changed = false;
      for (const h in siteProfiles) if (siteProfiles[h] && siteProfiles[h].seamless === false) { delete siteProfiles[h].seamless; changed = true; }
      if (changed) patch.siteProfiles = siteProfiles;
      if (Object.keys(patch).length) await api.storage.local.set(patch);
    } catch (e) { /* не критично */ }
    // 1.1.1.7: «заливать весь экран» выключается у всех один раз (по умолчанию теперь выключено).
    // Кто включит обратно — при следующих обновлениях это не сбрасывается (метка migFsFill).
    try {
      const { siteProfiles = {}, fullscreenFill, migFsFill } = await api.storage.local.get(['siteProfiles', 'fullscreenFill', 'migFsFill']);
      if (!migFsFill) {
        const patch = { migFsFill: true };
        if (fullscreenFill === true) patch.fullscreenFill = false;
        let changed = false;
        for (const h in siteProfiles) if (siteProfiles[h] && siteProfiles[h].fullscreenFill === true) { delete siteProfiles[h].fullscreenFill; changed = true; }
        if (changed) patch.siteProfiles = siteProfiles;
        await api.storage.local.set(patch);
      }
    } catch (e) { /* не критично */ }
  }
  if (details.reason === 'install' || details.reason === 'update') injectIntoOpenTabs();
});
api.runtime.onStartup.addListener(() => { refreshBadge(); syncScripts(); revalidateLicense(); });

if (api.permissions && api.permissions.onAdded) {
  api.permissions.onAdded.addListener(async () => { await syncScripts(); injectIntoOpenTabs(); });
  api.permissions.onRemoved.addListener(() => syncScripts());
}

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) setBadge(changes.enabled.newValue !== false);
  if (changes.licenseKey) revalidateLicense();
});

api.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-glow') {
    const { enabled = true } = await api.storage.local.get('enabled');
    await api.storage.local.set({ enabled: !(enabled !== false) });
    return;
  }
  if (command === 'toggle-panel') {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null) { try { await api.tabs.sendMessage(tab.id, { type: 'vg:panel', op: 'toggle' }); } catch (e) { /* на странице нет скрипта */ } }
    return;
  }
  if (command === 'toggle-site') {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    let host = '';
    try { host = norm(new URL(tab.url).hostname); } catch (e) { return; }
    if (!host) return;
    const { disabledHosts = [] } = await api.storage.local.get('disabledHosts');
    const list = disabledHosts.map(norm);
    const next = list.includes(host) ? list.filter((h) => h !== host) : [...list, host];
    await api.storage.local.set({ disabledHosts: next });
  }
});
