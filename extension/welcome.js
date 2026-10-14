self.vgApplyI18n();
document.title = self.vgT('w_title');
document.getElementById('open').addEventListener('click', () => chrome.runtime.openOptionsPage());
