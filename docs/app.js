// Ссылки на магазины.
const STORES = {
  chrome: 'https://chromewebstore.google.com/detail/bjgbalkabocifimhnhbcnomeknpbhkea',
  firefox: 'https://addons.mozilla.org/firefox/addon/video-glow/'
};

// Кошельки (Trust Wallet). QR-коды лежат в qr/<id>.svg.
const WALLETS = [
  { id: 'usdt-trc20', name: 'USDT', net: 'TRON · TRC-20', color: '#26a17b', sign: '₮', addr: 'TWW4iFFTPtvDBu3NH2iy6WFKQZgkq3TRhN' },
  { id: 'btc', name: 'Bitcoin', net: 'BTC', color: '#f7931a', sign: '₿', addr: 'bc1qk2eu8d53x08p0m6k3z5ernv55v2clr4ywarp7w' },
  { id: 'eth', name: 'Ethereum', net: 'ETH · ERC-20', color: '#627eea', sign: 'Ξ', addr: '0x3D0765a406dD7AEDF9614bB3742A9084dfF42f18' },
  { id: 'sol', name: 'Solana', net: 'SOL', color: '#9945ff', sign: 'S', addr: 'G1iMvFiS6yzTouDnZcaFHimkdicNmTtuxhYjZW1UTpPE' }
];

// Куда шлются сообщения с формы обратной связи (FormSubmit.co: почта или выданный им адрес-псевдоним).
// Пусто — форма скрыта.
const FEEDBACK_TO = '5b15bb3081e4f8971c3f368b305ab261';

const T = {
  ru: {
    m_list: [
      'Работает на любом сайте с HTML5-видео, в том числе в iframe, Shadow DOM и на весь экран',
      'Десять пресетов (Кино, Аниме, Игры, Спорт, Музыка, Ночь и другие) и свои; автопресет сам подбирает подходящий',
      'Форма, размер, размытие, яркость, насыщенность и плавность смены цвета',
      'Находит чёрные полосы, вшитые в фильм, и берёт цвет из самой картинки',
      'На весь экран заливает чёрные поля на мониторах 16:10 и ультрашироких',
      'Фильтры видео: яркость, контраст, насыщенность, резкость, теплота',
      'Затемнение страницы вокруг плеера, защита от резких вспышек, свечение в такт звуку',
      'Умный свет: Philips Hue, WLED и Home Assistant повторяют цвета видео',
      'Окно свечения поверх других окон (Chrome) и приближение видео по Alt + колёсику',
      'Лёгкий режим для слабых компьютеров; на паузе и вне экрана расширение не нагружает процессор',
      'Свои настройки для каждого сайта, горячие клавиши, резервная копия',
      'Восемь языков интерфейса'
    ],
    nav_demo: 'Попробовать', hero_badge: 'Новая версия: простой попап и живое превью',
    demo_title: 'Попробуйте прямо здесь', demo_sub: 'Это не видеозапись: свечение считается из картинки на ваших глазах, как в расширении. Переключите пресет или стиль и посмотрите, как меняется свет.',
    demo_alt: 'Пример видео со свечением вокруг', demo_on: 'Свечение', demo_presets: 'Пресеты', demo_style: 'Стиль свечения', demo_soft: 'Мягкий', demo_led: 'Светодиоды',
    demo_bright: 'Яркость', demo_size: 'Размер рамки', demo_room: 'Цвет комнаты', demo_note: 'Так выглядит попап расширения. Остальное в полных настройках.',
    pr_soft: 'Мягкий', pr_cinema: 'Кино', pr_neon: 'Неон', pr_music: 'Музыка', pr_night: 'Ночь',
    f_set_t: 'Простой попап и полные настройки', f_set_d: 'В попапе только частое: включить, выбрать пресет, поправить форму и яркость. Остальное в настройках, там же мини-экран, который сразу показывает результат, и шесть тем оформления.',
    title: 'Video Glow — подсветка для любого видео',
    fb_title: 'Есть идея или нашли ошибку?', fb_sub: 'Расскажите, чего не хватает. Лучшие идеи попадут в следующие версии.', fb_btn: 'Написать',
    more_title: 'Ещё от автора', more_sub: 'Video Glow делает один разработчик. Вот ещё четыре бесплатных проекта с открытым кодом: для видео, скриншотов и домашнего сервера.', more_site: 'Сайт', more_dl: 'Скачать', lv_kind: 'Расширение для Chrome, Edge и Firefox', lv_desc: 'Выравнивает громкость любого видео: тихие диалоги громче, взрывы тише. Можно смотреть фильм ночью и не тянуться к регулятору громкости.', lv_c1: 'Ночной режим', lv_c2: 'Громкость до 400%', lv_c3: 'Эквалайзер', lv_c4: 'Скорость 0,25–4×', sn_kind: 'Программа для Windows, macOS и Linux', sn_desc: 'Быстрые и лёгкие скриншоты: выделите область, добавьте стрелку или подпись и скопируйте. Без аккаунтов и облака.', sn_c1: 'Мгновенно', sn_c2: 'Точное выделение', sn_c3: 'Пометки', sn_c4: 'Приватно', sn_url: 'https://vkardin.github.io/snapt/ru/',
    fl_kind: 'Расширение для Chrome, Edge и Firefox', fl_desc: 'Выносит любое веб-видео в плавающее окно поверх всего, вместе с субтитрами сайта. Помнит секунду, где вы остановились, а заметки к кадрам выгружает в Markdown.', fl_c1: 'Плавающее окно', fl_c2: 'Субтитры', fl_c3: 'Память таймкодов', fl_c4: 'Заметки в Markdown', un_kind: 'Бот для Telegram на вашем сервере', un_desc: 'Домашний сервер в Telegram: приложения, мониторинг, уведомления и новости в чате и в мини-приложении. Ставится одной командой.', un_c1: 'Доска приложений', un_c2: 'Мониторинг', un_c3: 'Самовосстановление', un_c4: 'Мини-приложение',
    nav_features: 'Возможности', nav_install: 'Установить', nav_donate: 'Поддержать', nav_support: 'Обратная связь',
    hero_title: 'Подсветка в цвет картинки вокруг любого видео',
    hero_lead: 'Вокруг видео загорается мягкий свет в цвет кадра, как подсветка за телевизором, только в браузере.',
    btn_chrome: 'Добавить в Chrome', btn_firefox: 'Добавить в Firefox',
    hero_free: 'Бесплатно, без аккаунтов и рекламы. YouTube, Twitch, VK Видео и любые другие сайты.',
    f_title: 'Что умеет', f_sub: 'Сначала главное, остальное коротким списком ниже.',
    f_led_t: 'Мягкий свет или светодиоды', f_led_d: 'Свечение бывает сплошным и размытым или из отдельных точек, как лента за телевизором. Каждая точка берёт цвет своего края кадра.',
    f_room_t: 'Цвет комнаты', f_room_d: 'Страница вокруг видео слегка окрашивается в его цвета: слева в цвет левого края, справа в цвет правого. Лучше всего смотрится на тёмной теме сайта.',
    m_title: 'Ещё в расширении', m_sub: 'Всё это можно не трогать: без настроек тоже выглядит хорошо.',
    i_title: 'Установить', i_sub: 'Расширение одинаково работает в Chrome, Edge, Opera, Brave и Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave, Яндекс Браузер', i_firefox: 'Firefox для компьютера и Android',
    d_title: 'Поддержать проект',
    d_sub: 'Video Glow бесплатен и без рекламы. Если он вам нравится, можно поддержать разработку криптовалютой. Любая сумма помогает выпускать новые версии.',
    d_warn: 'Отправляйте монеты только в той сети, что указана на карточке. Перевод в другой сети может потеряться.',
    d_thanks: 'Спасибо, что вы с нами.',
    copy: 'Скопировать адрес', copied: 'Скопировано',
    privacy: 'Конфиденциальность'
  },
  uk: {
    m_list: [
      'Працює на будь-якому сайті з HTML5-відео, зокрема в iframe, Shadow DOM і на весь екран',
      'Десять пресетів (Кіно, Аніме, Ігри, Спорт, Музика, Ніч та інші) і власні; автопресет сам добирає відповідний',
      'Форма, розмір, розмиття, яскравість, насиченість і плавність зміни кольору',
      'Знаходить чорні смуги, вшиті у фільм, і бере колір із самої картинки',
      'На весь екран заливає чорні поля на моніторах 16:10 і ультрашироких',
      'Фільтри відео: яскравість, контраст, насиченість, різкість, теплота',
      'Затемнення сторінки навколо плеєра, захист від різких спалахів, світіння в такт звуку',
      'Розумне світло: Philips Hue, WLED і Home Assistant повторюють кольори відео',
      'Вікно світіння поверх інших вікон (Chrome) і наближення відео через Alt + коліщатко',
      'Легкий режим для слабких компʼютерів; на паузі й поза екраном розширення не навантажує процесор',
      'Власні налаштування для кожного сайту, гарячі клавіші, резервна копія',
      'Вісім мов інтерфейсу'
    ],
    nav_demo: 'Спробувати', hero_badge: 'Нова версія: простий попап і живе превʼю',
    demo_title: 'Спробуйте просто тут', demo_sub: 'Це не відеозапис: світіння рахується з картинки на ваших очах, як у розширенні. Перемкніть пресет чи стиль і подивіться, як змінюється світло.',
    demo_alt: 'Приклад відео зі світінням навколо', demo_on: 'Світіння', demo_presets: 'Пресети', demo_style: 'Стиль світіння', demo_soft: 'Мʼякий', demo_led: 'Світлодіоди',
    demo_bright: 'Яскравість', demo_size: 'Розмір рамки', demo_room: 'Колір кімнати', demo_note: 'Так виглядає попап розширення. Решта в повних налаштуваннях.',
    pr_soft: 'Мʼякий', pr_cinema: 'Кіно', pr_neon: 'Неон', pr_music: 'Музика', pr_night: 'Ніч',
    f_set_t: 'Простий попап і повні налаштування', f_set_d: 'У попапі лише часте: увімкнути, вибрати пресет, підправити форму та яскравість. Решта в налаштуваннях, там же міні-екран, що одразу показує результат, і шість тем оформлення.',
    title: 'Video Glow — підсвітка для будь-якого відео',
    fb_title: 'Маєте ідею чи знайшли помилку?', fb_sub: 'Розкажіть, чого бракує. Найкращі ідеї потраплять у наступні версії.', fb_btn: 'Написати',
    more_title: 'Ще від автора', more_sub: 'Video Glow робить один розробник. Ось ще чотири безкоштовні проєкти з відкритим кодом: для відео, скриншотів і домашнього сервера.', more_site: 'Сайт', more_dl: 'Завантажити', lv_kind: 'Розширення для Chrome, Edge і Firefox', lv_desc: 'Вирівнює гучність будь-якого відео: тихі діалоги гучніше, вибухи тихіше. Можна дивитися фільм уночі й не тягнутися до регулятора гучності.', lv_c1: 'Нічний режим', lv_c2: 'Гучність до 400%', lv_c3: 'Еквалайзер', lv_c4: 'Швидкість 0,25–4×', sn_kind: 'Програма для Windows, macOS і Linux', sn_desc: 'Швидкі й легкі скриншоти: виділіть область, додайте стрілку чи підпис і скопіюйте. Без акаунтів і хмари.', sn_c1: 'Миттєво', sn_c2: 'Точне виділення', sn_c3: 'Позначки', sn_c4: 'Приватно', sn_url: 'https://vkardin.github.io/snapt/uk/',
    fl_kind: 'Розширення для Chrome, Edge і Firefox', fl_desc: 'Виносить будь-яке веб-відео у плаваюче вікно поверх усього, разом із субтитрами сайту. Пам\'ятає секунду, де ви зупинилися, а нотатки до кадрів вивантажує в Markdown.', fl_c1: 'Плаваюче вікно', fl_c2: 'Субтитри', fl_c3: 'Пам\'ять таймкодів', fl_c4: 'Нотатки в Markdown', un_kind: 'Бот для Telegram на вашому сервері', un_desc: 'Домашній сервер у Telegram: застосунки, моніторинг, сповіщення й новини в чаті та в міні-застосунку. Ставиться однією командою.', un_c1: 'Дошка застосунків', un_c2: 'Моніторинг', un_c3: 'Самовідновлення', un_c4: 'Міні-застосунок',
    nav_features: 'Можливості', nav_install: 'Встановити', nav_donate: 'Підтримати', nav_support: 'Зворотний зв’язок',
    hero_title: 'Підсвітка в колір картинки навколо будь-якого відео',
    hero_lead: 'Навколо відео спалахує мʼяке світло в колір кадру, як підсвітка за телевізором, тільки в браузері.',
    btn_chrome: 'Додати до Chrome', btn_firefox: 'Додати до Firefox',
    hero_free: 'Безкоштовно, без акаунтів і реклами. YouTube, Twitch та будь-які інші сайти.',
    f_title: 'Що вміє', f_sub: 'Спершу головне, решта коротким списком нижче.',
    f_led_t: 'Мʼяке світло або світлодіоди', f_led_d: 'Світіння буває суцільним і розмитим або з окремих точок, як стрічка за телевізором. Кожна точка бере колір свого краю кадру.',
    f_room_t: 'Колір кімнати', f_room_d: 'Сторінка навколо відео трохи забарвлюється в його кольори: ліворуч у колір лівого краю, праворуч у колір правого. Найкраще виглядає на темній темі сайту.',
    m_title: 'Ще в розширенні', m_sub: 'Усе це можна не чіпати: без налаштувань теж виглядає добре.',
    i_title: 'Встановити', i_sub: 'Розширення однаково працює в Chrome, Edge, Opera, Brave і Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave', i_firefox: 'Firefox для комп’ютера та Android',
    d_title: 'Підтримати проєкт',
    d_sub: 'Video Glow безкоштовний і без реклами. Якщо він вам подобається, можна підтримати розробку криптовалютою. Будь-яка сума допомагає випускати нові версії.',
    d_warn: 'Надсилайте монети лише в тій мережі, що вказана на картці. Переказ в іншій мережі може загубитися.',
    d_thanks: 'Дякуємо, що ви з нами.',
    copy: 'Скопіювати адресу', copied: 'Скопійовано',
    privacy: 'Конфіденційність'
  },
  en: {
    m_list: [
      'Works on any site with HTML5 video, including iframes, Shadow DOM and fullscreen',
      'Ten presets (Cinema, Anime, Games, Sport, Music, Night and more) plus your own; the auto preset picks one for you',
      'Shape, size, blur, brightness, saturation and how smoothly colours change',
      'Detects black bars burned into the film and takes colour from the picture itself',
      'In fullscreen, fills the black margins on 16:10 and ultrawide monitors',
      'Video filters: brightness, contrast, saturation, sharpness, warmth',
      'Page dimming around the player, protection from harsh flashes, glow to the beat',
      'Smart lights: Philips Hue, WLED and Home Assistant follow the video colours',
      'A glow window on top of other windows (Chrome) and video zoom with Alt + mouse wheel',
      'Lite mode for slower computers; when paused or off screen the extension uses no CPU',
      'Per-site settings, hotkeys and backup',
      'Eight interface languages'
    ],
    nav_demo: 'Try it', hero_badge: 'New version: a simpler popup and a live preview',
    demo_title: 'Try it right here', demo_sub: 'This is not a recording: the glow is computed from the picture as you watch, just like in the extension. Switch a preset or the style and see how the light changes.',
    demo_alt: 'Sample video with a glow around it', demo_on: 'Glow', demo_presets: 'Presets', demo_style: 'Glow style', demo_soft: 'Soft', demo_led: 'LEDs',
    demo_bright: 'Brightness', demo_size: 'Frame size', demo_room: 'Room colour', demo_note: 'This is what the extension popup looks like. Everything else is in the full settings.',
    pr_soft: 'Soft', pr_cinema: 'Cinema', pr_neon: 'Neon', pr_music: 'Music', pr_night: 'Night',
    f_set_t: 'A simple popup and full settings', f_set_d: 'The popup keeps what you use often: on/off, preset, shape and brightness. Everything else is in the settings, along with a mini screen that shows the result right away and six UI themes.',
    title: 'Video Glow — ambient light for any video',
    fb_title: 'Have an idea or found a bug?', fb_sub: 'Tell me what’s missing. The best ideas go into the next versions.', fb_btn: 'Write to us',
    more_title: 'More from the author', more_sub: 'Video Glow is made by one developer. Here are four more free, open-source projects: for video, screenshots and your home server.', more_site: 'Website', more_dl: 'Download', lv_kind: 'Extension for Chrome, Edge and Firefox', lv_desc: 'Evens out the loudness of any video: quiet dialogue gets louder, explosions get softer, so you can watch a movie at night without reaching for the volume.', lv_c1: 'Night mode', lv_c2: 'Volume up to 400%', lv_c3: 'Equalizer', lv_c4: 'Speed 0.25–4×', sn_kind: 'App for Windows, macOS and Linux', sn_desc: 'Fast, lightweight screenshots: select an area, add an arrow or a caption, copy. No accounts, no cloud.', sn_c1: 'Instant', sn_c2: 'Precise selection', sn_c3: 'Annotate', sn_c4: 'Private', sn_url: 'https://vkardin.github.io/snapt/',
    fl_kind: 'Extension for Chrome, Edge and Firefox', fl_desc: 'Pops any web video out into a floating window that stays on top, subtitles included. Remembers the second you stopped and exports frame notes to Markdown.', fl_c1: 'Floating window', fl_c2: 'Subtitles', fl_c3: 'Resume where you left off', fl_c4: 'Markdown notes', un_kind: 'Telegram bot on your own server', un_desc: 'Your home server in Telegram: apps, monitoring, notifications and news in the chat and in a mini app. Installs with one command.', un_c1: 'App board', un_c2: 'Monitoring', un_c3: 'Self-healing', un_c4: 'Mini app',
    nav_features: 'Features', nav_install: 'Install', nav_donate: 'Donate', nav_support: 'Feedback',
    hero_title: 'Ambient light around any video',
    hero_lead: 'A soft light in the colours of the frame glows around the video, like bias lighting behind a TV, only in your browser.',
    btn_chrome: 'Add to Chrome', btn_firefox: 'Add to Firefox',
    hero_free: 'Free, no accounts, no ads. YouTube, Twitch and any other site.',
    f_title: 'What it does', f_sub: 'The main things first, the rest in a short list below.',
    f_led_t: 'Soft light or LEDs', f_led_d: 'The glow can be a smooth blur or separate dots, like a strip behind a TV. Each dot takes the colour of its edge of the frame.',
    f_room_t: 'Room colour', f_room_d: 'The page around the video is lightly tinted in its colours: the left side like the left edge, the right side like the right. Looks best on a site’s dark theme.',
    m_title: 'Also in the extension', m_sub: 'You can leave all of this alone: it looks good with no setup.',
    i_title: 'Install', i_sub: 'Works the same in Chrome, Edge, Opera, Brave and Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave', i_firefox: 'Firefox for desktop and Android',
    d_title: 'Support the project',
    d_sub: 'Video Glow is free and has no ads. If you enjoy it, you can support development with crypto. Any amount helps ship new versions.',
    d_warn: 'Send coins only on the network shown on the card. A transfer on another network may be lost.',
    d_thanks: 'Thank you for being here.',
    copy: 'Copy address', copied: 'Copied',
    privacy: 'Privacy'
  }
};

function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (T[q]) return q;
  try { const s = localStorage.getItem('vg-lang'); if (T[s]) return s; } catch (e) {}
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (c === 'uk' || c === 'ru' || c === 'en') return c;
    if (c === 'be') return 'ru';
  }
  return 'en';
}

let lang = pickLang();

function apply() {
  const t = T[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = (el.dataset.i18n in t) ? t[el.dataset.i18n] : (window.PAGE_T && PAGE_T[lang][el.dataset.i18n]);
    if (v != null) el.textContent = v;
  });
  const ml = document.getElementById('mlist');
  if (ml && t.m_list) ml.replaceChildren(...t.m_list.map(x => { const li = document.createElement('li'); li.textContent = x; return li; }));
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { const v = t[el.dataset.i18nAria]; if (v != null) el.setAttribute('aria-label', v); });
  document.title = (window.PAGE_T && PAGE_T[lang].title) || t.title;
  document.querySelectorAll('[data-href]').forEach(a => { if (t[a.dataset.href]) a.href = t[a.dataset.href]; });
  document.querySelectorAll('[data-shot]').forEach(img => { img.src = `img/${img.dataset.shot}-${lang}.webp`; });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.querySelectorAll('[data-ph]').forEach(el => {
    const v = (window.PAGE_T && PAGE_T[lang][el.dataset.ph]) || t[el.dataset.ph];
    if (v != null) el.placeholder = v;
  });
  document.querySelectorAll('.copy').forEach(b => { if (!b.classList.contains('done')) b.textContent = t.copy; });
}

function renderWallets() {
  const box = document.getElementById('wallets');
  const tpl = document.getElementById('wallet');
  if (!box || !tpl) return;
  for (const w of WALLETS) {
    const n = tpl.content.cloneNode(true);
    const i = n.querySelector('.coin i');
    i.textContent = w.sign; i.style.background = w.color;
    n.querySelector('.coin b').textContent = w.name;
    n.querySelector('.coin small').textContent = w.net;
    n.querySelector('.qr img').src = `qr/${w.id}.svg`;
    n.querySelector('.qr img').alt = `QR ${w.name}`;
    n.querySelector('.addr').textContent = w.addr;
    const btn = n.querySelector('.copy');
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(w.addr); }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents(btn.previousElementSibling);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy');
      }
      btn.classList.add('done'); btn.textContent = T[lang].copied;
      setTimeout(() => { btn.classList.remove('done'); btn.textContent = T[lang].copy; }, 1800);
    });
    box.appendChild(n);
  }
}

function setStores() {
  for (const k of ['chrome', 'firefox']) {
    document.querySelectorAll('.store-' + k).forEach(a => {
      if (STORES[k]) { a.href = STORES[k]; a.target = '_blank'; a.rel = 'noopener'; }
      else { a.href = '#install'; a.removeAttribute('target'); }
    });
  }
}

document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  try { localStorage.setItem('vg-lang', lang); } catch (e) {}
  apply();
}));
const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
function tr(k) { return (window.PAGE_T && PAGE_T[lang][k]) || T[lang][k] || k; }

function setupFeedback() {
  const f = document.getElementById('fbForm');
  if (!f || !FEEDBACK_TO) return;
  f.hidden = false;
  const st = document.getElementById('fbStatus');
  const btn = f.querySelector('button[type=submit]');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (f._honey.value) return;
    const kind = f.kind.value;
    const data = {
      _subject: `Video Glow: ${kind === 'idea' ? 'идея' : kind === 'bug' ? 'ошибка' : 'сообщение'}`,
      _template: 'table',
      kind,
      message: f.message.value.trim(),
      email: f.email.value.trim(),
      lang,
      browser: navigator.userAgent
    };
    if (data.email) data._replyto = data.email;
    btn.disabled = true; st.className = 'fb-status'; st.textContent = tr('f_sending');
    try {
      const r = await fetch('https://formsubmit.co/ajax/' + FEEDBACK_TO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || String(j.success) === 'false') throw new Error(j.message || r.status);
      f.reset(); st.className = 'fb-status ok'; st.textContent = tr('f_ok');
    } catch (err) {
      st.className = 'fb-status err'; st.textContent = tr('f_err');
    } finally { btn.disabled = false; }
  });
}

renderWallets();
setStores();
setupFeedback();
apply();

// Плавное появление блоков при прокрутке (только transform/opacity, один раз)
(() => {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const els = document.querySelectorAll('.feat, .mlist, .app, .install .tile, .demo-grid, .wallets .tile');
  const io = new IntersectionObserver((list) => list.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--rv-d', (i % 3) * 70 + 'ms'); io.observe(el); });
})();

// Переливание подсветки только пока превью на экране
(() => {
  const el = document.querySelector('.screen');
  if (!el || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => el.classList.toggle('paused', !e.isIntersecting)).observe(el);
})();
