self.vgApplyI18n();
document.title = self.vgT('w_title');
document.getElementById('open').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Доступ к сайтам: блок показываем, если он ещё не выдан (необязательные права в Chrome/Edge,
// либо пользователь отключил доступ в Firefox). Если уже выдан — блок скрыт.
{
  const box = document.getElementById('grant');
  const btn = document.getElementById('allow');
  const done = document.getElementById('granted');
  const refresh = () => chrome.permissions.contains({ origins: ['<all_urls>'] }, (ok) => {
    const wasShown = !box.hidden;
    box.hidden = !!ok && !wasShown;
    btn.hidden = !!ok;
    done.hidden = !ok;
  });
  btn.addEventListener('click', () => {
    chrome.permissions.request({ origins: ['<all_urls>'] }, refresh);   // нужен клик пользователя
  });
  refresh();
}
