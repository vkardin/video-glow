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
  glowStyle: 'soft',      // 'soft' — сплошное размытое свечение | 'led' — светодиодная лента (отдельные пятна света)
  ledCount: 40,           // сколько «светодиодов» вокруг видео
  room: false,            // «Цвет комнаты»: вся страница мягко окрашивается в цвета видео
  roomLevel: 50,          // сила окраски, %

  // Полный экран
  fullscreenGlow: true,   // включить свечение в полноэкранном режиме
  fullscreenFill: false,  // заливать весь экран (чёрные полосы), а не только рамку; с 1.1.1.7 выключено:
                          // на нынешнем YouTube рамка вокруг видео в полном экране выглядит надёжнее
  fsSame: true,           // true — в полном экране те же настройки, что на странице
  fsBlur: 36,             // свои значения для полного экрана (когда fsSame = false)
  fsOpacity: 85,
  fsSaturation: 115,
  fsBrightness: 100,
  fsFadeMs: 700,
  fsPauseMode: 'fade',
  // Своя форма и размер рамки в полном экране (работают, когда «заливать весь экран» выключено)
  fsShapeOwn: false,      // true — в полном экране своя форма/размер рамки
  fsShape: 'rounded',
  fsSpread: 18,
  fsFeather: 60,
  fsRadius: 22,

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
  minWidth: 320,          // игнорировать видео, у которого и ширина, и высота меньше этого (превью, баннеры), px

  // ───── Pro ─────
  // Чёрные полосы внутри видео
  barsMode: 'auto',       // 'auto' — как в бесплатной версии | 'force' — принудительное, агрессивное определение | 'manual' — вручную
  barT: 0, barB: 0, barL: 0, barR: 0,   // ручные полосы, % кадра (для barsMode = 'manual')
  barsHide: false,        // убрать полосы с экрана: увеличить видео, чтобы картинка заняла плеер
  barsFill: 100,          // 0 — только вписать, 100 — заполнить плеер целиком (края обрезаются), %
  // Для чувствительных глаз
  guard: false,           // защита от вспышек и стробирования
  guardSens: 2,           // чувствительность: 1 низкая, 2 средняя, 3 высокая
  guardStrength: 60,      // насколько приглушать при вспышках, %
  guardVideo: true,       // приглушать и само видео, а не только свечение
  calm: 0,                // спокойное свечение: сглаживание изменений во времени, %
  // Пульс от звука
  pulse: false,
  pulseAmount: 50,        // сила пульса, %
  pulseMode: 'bass',      // 'bass' — по низким частотам | 'all' — по общей громкости
  // Реакция на сцену (1.3.0)
  scene: false,           // вспышка на резкой смене кадра, «вдох» на тёмных сценах
  sceneAmount: 60,        // сила эффектов, %
  colorCurve: 'normal',   // смена цвета: 'normal' | 'soft' — мягко | 'cinema' — плавно, но сразу на смене сцены | 'sharp' — резко
  // Фильтры видео
  fxOn: false,
  fxBrightness: 100,      // %
  fxContrast: 100,        // %
  fxSaturation: 100,      // %
  fxSharp: 0,             // резкость, 0–100
  fxWarmth: 0,            // тёплые (+) / холодные (−) тона, −100…100
  fxGamma: 100,           // полутона: >100 осветляет тени, %
  // Ночной комфорт (общий для всех сайтов)
  nightOn: false,
  nightFrom: 22,          // час начала
  nightTo: 7,             // час конца
  nightStrength: 50,      // %

  // ───── Philips Hue: лампы повторяют цвет видео (общие для всех сайтов) ─────
  hueOn: false,
  hueIp: '',              // адрес моста в локальной сети
  hueUser: '',            // ключ, выданный мостом после нажатия кнопки
  hueLights: [],          // id выбранных ламп
  // WLED и Home Assistant (1.4.0): адрес, вебхук и параметры лежат отдельно (wledIp, wledPrefs, haUrl, haPrefs, lightDelay)
  // и, как ключ моста Hue, не попадают в резервные копии
  wledOn: false,
  haOn: false,

  // ───── Лицензия (служебные поля, не настройки) ─────
  licenseKey: '',
  proValid: false,        // ключ прошёл проверку подписи (пишет background/options)
  proId: '',
  installedAt: 0,         // когда началось пробное окно, мс

  // ───── Плавающая панель настроек (служебное) ─────
  userPresets: [],        // свои пресеты: [{ id, name, values }]
  presetOverrides: {},    // правки встроенных пресетов: { id: values }

  panelPinned: false,     // закреплена: не скрывается сама
  panelX: -1,             // положение панели на экране, px (-1 — по умолчанию, справа сверху)
  panelY: -1
};

self.VG_PANEL_KEYS = ['panelPinned', 'panelX', 'panelY'];
self.VG_PRESET_STORE_KEYS = ['userPresets', 'presetOverrides'];
// Подключение к мосту Hue: не входит в резервные копии и не сбрасывается вместе с настройками.
self.VG_HUE_KEYS = ['hueIp', 'hueUser', 'hueLights'];

// Служебные поля лицензии: не входят в резервные копии, сброс настроек их не трогает.
self.VG_LICENSE_KEYS = ['licenseKey', 'proValid', 'proId', 'installedAt'];

// Платные настройки: без Pro (и вне пробного периода) принудительно возвращаются к умолчаниям.
self.VG_PRO_KEYS = ['barsMode', 'barT', 'barB', 'barL', 'barR', 'barsHide', 'barsFill',
  'guard', 'guardSens', 'guardStrength', 'guardVideo', 'calm', 'pulse', 'pulseAmount', 'pulseMode',
  'fxOn', 'fxBrightness', 'fxContrast', 'fxSaturation', 'fxSharp', 'fxWarmth', 'fxGamma',
  'nightOn', 'nightFrom', 'nightTo', 'nightStrength'];

// Какие настройки могут отличаться для отдельного сайта (всё, кроме глобальных).
self.VG_SCOPED = Object.keys(self.VG_DEFAULTS).filter(
  (k) => !['enabled', 'disabledHosts', 'siteProfiles', 'nightOn', 'nightFrom', 'nightTo', 'nightStrength', 'hueOn', 'wledOn', 'haOn']
    .concat(self.VG_HUE_KEYS, self.VG_LICENSE_KEYS, self.VG_PANEL_KEYS, ['userPresets', 'presetOverrides']).includes(k)
);

// Какие настройки заменяются своими значениями в полном экране.
self.VG_FS_MAP = {
  blur: 'fsBlur', opacity: 'fsOpacity', saturation: 'fsSaturation',
  brightness: 'fsBrightness', fadeMs: 'fsFadeMs', pauseMode: 'fsPauseMode'
};

// Состояние Pro: лицензия, пробный период или ничего.
self.VG_proState = (raw) => {
  const C = self.VG_CONFIG;
  // 1.1.1: пока всё доступно сразу, ключи и пробный период выключены (код лицензий спит)
  if (!C.PRO_REQUIRED) return { pro: true, kind: 'free', trialDays: 0 };
  if (raw && raw.proValid === true) return { pro: true, kind: 'license', trialDays: 0 };
  const at = raw && Number(raw.installedAt);
  if (C.TRIAL_DAYS > 0 && at > 0) {
    const left = at + C.TRIAL_DAYS * 864e5 - Date.now();
    if (left > 0) return { pro: true, kind: 'trial', trialDays: Math.ceil(left / 864e5) };
  }
  return { pro: false, kind: 'none', trialDays: 0 };
};

// Итоговые настройки = умолчания < общие < настройки сайта (для страницы).
// Без Pro платные настройки возвращаются к умолчаниям — и в content script, и в popup.
self.VG_effective = (raw, host) => {
  const o = Object.assign({}, self.VG_DEFAULTS, raw);
  const p = o.siteProfiles && typeof o.siteProfiles === 'object' ? o.siteProfiles[host] : null;
  if (p && typeof p === 'object') {
    for (const k of self.VG_SCOPED) if (k in p) o[k] = p[k];
  }
  if (!self.VG_proState(raw).pro) {
    for (const k of self.VG_PRO_KEYS) o[k] = self.VG_DEFAULTS[k];
  }
  return o;
};

// Вид настроек для полного экрана.
self.VG_FS_SHAPE_MAP = { shape: 'fsShape', spread: 'fsSpread', feather: 'fsFeather', radius: 'fsRadius' };

self.VG_fsView = (o) => {
  if (o.fsSame && !o.fsShapeOwn) return o;
  const r = Object.assign({}, o);
  if (!o.fsSame) for (const k in self.VG_FS_MAP) r[k] = o[self.VG_FS_MAP[k]];
  if (o.fsShapeOwn) for (const k in self.VG_FS_SHAPE_MAP) r[k] = o[self.VG_FS_SHAPE_MAP[k]];
  return r;
};

// Ссылки для кнопок «Поддержать» и «Политика конфиденциальности».
// Пустая строка — кнопка скрыта. Заполните перед публикацией.
self.VG_CONFIG = {
  PRO_REQUIRED: false,
  SITE_URL: 'https://vkardin.github.io/video-glow/',
  DONATE_URL: 'https://vkardin.github.io/video-glow/#donate',
  PRIVACY_URL: 'https://vkardin.github.io/video-glow/privacy.html',
  BUY_URL: '',            // страница покупки Pro (кнопка «Купить»); пусто — кнопка скрыта
  TRIAL_DAYS: 7           // пробный период Pro после установки, дней (0 — без пробного)
};
