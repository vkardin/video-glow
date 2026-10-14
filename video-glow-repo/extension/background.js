// Бейдж «OFF», горячие клавиши, welcome-страница и подключение к уже открытым вкладкам.
const norm = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

const setBadge = (enabled) => {
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: '#666666' });
};

async function refreshBadge() {
  const { enabled = true } = await chrome.storage.local.get('enabled');
  setBadge(enabled !== false);
}

// После установки/обновления content-скрипт не появляется в уже открытых вкладках сам —
// внедряем его вручную (новый скрипт сам вытесняет старый через событие takeover).
async function injectIntoOpenTabs() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return; }
  for (const tab of tabs) {
    if (tab.id == null || tab.discarded) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['defaults.js', 'content.js']
      });
    } catch (e) { /* служебные страницы, магазин и т.п. — пропускаем */ }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  refreshBadge();
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  if (details.reason === 'install' || details.reason === 'update') injectIntoOpenTabs();
});
chrome.runtime.onStartup.addListener(refreshBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) setBadge(changes.enabled.newValue !== false);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-glow') {
    const { enabled = true } = await chrome.storage.local.get('enabled');
    await chrome.storage.local.set({ enabled: !(enabled !== false) });
    return;
  }
  if (command === 'toggle-site') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let host = '';
    try { host = norm(new URL(tab.url).hostname); } catch (e) { return; }
    if (!host) return;
    const { disabledHosts = [] } = await chrome.storage.local.get('disabledHosts');
    const list = disabledHosts.map(norm);
    const next = list.includes(host) ? list.filter((h) => h !== host) : [...list, host];
    await chrome.storage.local.set({ disabledHosts: next });
  }
});
