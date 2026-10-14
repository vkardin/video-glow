// Значения по умолчанию. Подключается и в content script, и в popup/options.
self.VG_DEFAULTS = {
  enabled: true,          // глобальный выключатель
  disabledHosts: [],      // сайты, где подсветка отключена
  siteProfiles: {},       // свои настройки для сайтов: { 'host': { ключ: значение, … } } (только отличия от общих)

  // Свечение на странице
  pageGlow: true,         // включить свечение вокруг видео на странице
  pageMode: 'screen',     // 'screen' — поверх, осветление | 'normal' — поверх, обычное | 'under' — под страницей
  shape: 'rounded',       // 'rect' | 'rounded' | 'circle'
  radius: 22,             // скругление для shape=rounded, % от меньшей стороны рамки
  spread: 18,             // размер рамки, % от меньшей стороны картинки
  feather: 60,            // размытие края: за какую долю рамки свечение растворяется к внешней границе, %
  seamless: true,         // бесшовный стык: продолжать картинку за краями кадра, у стыка яркость 100%
  dim: false,             // затемнять страницу вокруг плеера (режим кинотеатра)
  dimLevel: 60,           // сила затемнения, %

  // Полный экран
  fullscreenGlow: true,   // включить свечение в полноэкранном режиме
  fullscreenFill: true,   // заливать весь экран (чёрные полосы), а не только рамку
  fsSame: true,           // true — в полном экране те же настройки, что на странице
  fsBlur: 36,             // свои значения для полного экрана (когда fsSame = false)
  fsOpacity: 85,
  fsSaturation: 115,
  fsBrightness: 100,
  fsFadeMs: 700,
  fsPauseMode: 'fade',

  // Внешний вид
  blur: 36,               // сила размытия, px
  sample: 64,             // ширина семпла (кадра, который берётся с видео), px
  opacity: 85,            // яркость свечения, %
  saturation: 115,        // насыщенность, % (100 — цвета ровно как в видео, самый точный стык)
  brightness: 100,        // яркость цвета, %
  fadeMs: 700,            // плавность появления/исчезновения (старт/пауза), мс
  fps: 30,                // макс. частота обновления свечения

  // Пауза
  pauseMode: 'fade',      // 'fade' — гаснет на паузе | 'hold' — остаётся | 'delay' — гаснет через pauseDelay секунд
  pauseDelay: 5,          // секунд до затухания при pauseMode = 'delay'

  // Дополнительно
  hoverButton: true,      // кнопка вкл/выкл на самом видео (появляется при наведении)
  cropBars: true,         // не брать чёрные полосы, вшитые в само видео (авто-определение)
  fillBars: true,         // заливать чёрные полосы внутри блока плеера (вне полного экрана)
  adaptive: true,         // автоматически снижать частоту, если слабое устройство не успевает
  ecoBattery: true,       // при заряде < 30% без зарядки ограничивать частоту до 15 к/с
  minWidth: 320           // игнорировать видео уже этого значения (превью, баннеры), px
};

// Какие настройки могут отличаться для отдельного сайта (всё, кроме глобальных).
self.VG_SCOPED = Object.keys(self.VG_DEFAULTS).filter(
  (k) => !['enabled', 'disabledHosts', 'siteProfiles'].includes(k)
);

// Какие настройки заменяются своими значениями в полном экране.
self.VG_FS_MAP = {
  blur: 'fsBlur', opacity: 'fsOpacity', saturation: 'fsSaturation',
  brightness: 'fsBrightness', fadeMs: 'fsFadeMs', pauseMode: 'fsPauseMode'
};

// Итоговые настройки = умолчания < общие < настройки сайта (для страницы).
self.VG_effective = (raw, host) => {
  const o = Object.assign({}, self.VG_DEFAULTS, raw);
  const p = o.siteProfiles && typeof o.siteProfiles === 'object' ? o.siteProfiles[host] : null;
  if (p && typeof p === 'object') {
    for (const k of self.VG_SCOPED) if (k in p) o[k] = p[k];
  }
  return o;
};

// Вид настроек для полного экрана.
self.VG_fsView = (o) => {
  if (o.fsSame) return o;
  const r = Object.assign({}, o);
  for (const k in self.VG_FS_MAP) r[k] = o[self.VG_FS_MAP[k]];
  return r;
};

// Ссылки для кнопок «Поддержать» и «Политика конфиденциальности».
// Пустая строка — кнопка скрыта. Заполните перед публикацией.
self.VG_CONFIG = {
  DONATE_URL: '',
  PRIVACY_URL: ''
};
