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
    title: 'Video Glow — подсветка для любого видео',
    fb_title: 'Есть идея или нашли ошибку?', fb_sub: 'Расскажите, чего не хватает. Лучшие идеи попадут в следующие версии.', fb_btn: 'Написать',
    more_title: 'Ещё от автора', more_sub: 'Video Glow делает один разработчик. Вот ещё два бесплатных инструмента с открытым кодом: для звука в видео и для скриншотов.', more_site: 'Сайт', more_dl: 'Скачать', lv_kind: 'Расширение для Chrome, Edge и Firefox', lv_desc: 'Выравнивает громкость любого видео: тихие диалоги громче, взрывы тише. Можно смотреть фильм ночью и не тянуться к регулятору громкости.', lv_c1: 'Ночной режим', lv_c2: 'Громкость до 400%', lv_c3: 'Эквалайзер', lv_c4: 'Скорость 0,25–4×', sn_kind: 'Программа для Windows, macOS и Linux', sn_desc: 'Быстрые и лёгкие скриншоты: выделите область, добавьте стрелку или подпись и скопируйте. Без аккаунтов и облака.', sn_c1: 'Мгновенно', sn_c2: 'Точное выделение', sn_c3: 'Пометки', sn_c4: 'Приватно', sn_url: 'https://vkardin.github.io/snapt/ru/',
    nav_features: 'Возможности', nav_install: 'Установить', nav_donate: 'Поддержать', nav_support: 'Обратная связь',
    hero_title: 'Подсветка в цвет картинки вокруг любого видео',
    hero_lead: 'Video Glow превращает экран в маленький кинозал: вокруг видео загорается мягкий свет, который повторяет цвета кадра.',
    btn_chrome: 'Добавить в Chrome', btn_firefox: 'Добавить в Firefox',
    hero_free: 'Бесплатно, без аккаунтов и рекламы. YouTube, Twitch, VK Видео и любые другие сайты.',
    f_title: 'Что умеет', f_sub: 'Свет подстраивается под каждый кадр и не мешает смотреть.',
    f_led_t: 'Светодиодная лента', f_led_d: 'Вокруг видео горят отдельные пятна света, как лента за телевизором. Каждое повторяет цвет своего края кадра.',
    f_room_t: 'Цвет комнаты', f_room_d: 'Вся страница мягко окрашивается в цвета видео: слева в цвет левого края, справа в цвет правого.',
    f_themes_t: 'Шесть тем оформления', f_themes_d: 'Окно и настройки в стиле «Кинозал» и ещё пять тем. Можно собрать свою тему из своих цветов.',
    m_title: 'И ещё много всего', m_sub: 'Всё настраивается, но и без настроек выглядит хорошо.',
    m1_t: 'Любые сайты', m1_d: 'Видео в iframe, Shadow DOM и полноэкранный режим.',
    m2_t: 'Форма и мягкость', m2_d: 'Размер, размытие, яркость, насыщенность, скругление рамки.',
    m3_t: 'Чёрные полосы', m3_d: 'Расширение само находит полосы, вшитые в фильм.',
    m4_t: 'Свет в такт звуку', m4_d: 'Подсветка пульсирует вместе с басами.',
    m5_t: 'Philips Hue', m5_d: 'Лампы в комнате повторяют цвета видео.',
    m6_t: 'Для каждого сайта', m6_d: 'Свои настройки, горячие клавиши и резервная копия.',
    i_title: 'Установить', i_sub: 'Расширение одинаково работает в Chrome, Edge, Opera, Brave и Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave, Яндекс Браузер', i_firefox: 'Firefox для компьютера',
    d_title: 'Поддержать проект',
    d_sub: 'Video Glow бесплатен и без рекламы. Если он вам нравится, можно поддержать разработку криптовалютой. Любая сумма помогает выпускать новые версии.',
    d_warn: 'Отправляйте монеты только в той сети, что указана на карточке. Перевод в другой сети может потеряться.',
    d_thanks: 'Спасибо, что вы с нами.',
    copy: 'Скопировать адрес', copied: 'Скопировано',
    privacy: 'Конфиденциальность'
  },
  uk: {
    title: 'Video Glow — підсвітка для будь-якого відео',
    fb_title: 'Маєте ідею чи знайшли помилку?', fb_sub: 'Розкажіть, чого бракує. Найкращі ідеї потраплять у наступні версії.', fb_btn: 'Написати',
    more_title: 'Ще від автора', more_sub: 'Video Glow робить один розробник. Ось ще два безкоштовні інструменти з відкритим кодом: для звуку у відео та для скриншотів.', more_site: 'Сайт', more_dl: 'Завантажити', lv_kind: 'Розширення для Chrome, Edge і Firefox', lv_desc: 'Вирівнює гучність будь-якого відео: тихі діалоги гучніше, вибухи тихіше. Можна дивитися фільм уночі й не тягнутися до регулятора гучності.', lv_c1: 'Нічний режим', lv_c2: 'Гучність до 400%', lv_c3: 'Еквалайзер', lv_c4: 'Швидкість 0,25–4×', sn_kind: 'Програма для Windows, macOS і Linux', sn_desc: 'Швидкі й легкі скриншоти: виділіть область, додайте стрілку чи підпис і скопіюйте. Без акаунтів і хмари.', sn_c1: 'Миттєво', sn_c2: 'Точне виділення', sn_c3: 'Позначки', sn_c4: 'Приватно', sn_url: 'https://vkardin.github.io/snapt/uk/',
    nav_features: 'Можливості', nav_install: 'Встановити', nav_donate: 'Підтримати', nav_support: 'Зворотний зв’язок',
    hero_title: 'Підсвітка в колір картинки навколо будь-якого відео',
    hero_lead: 'Video Glow перетворює екран на маленький кінозал: навколо відео спалахує м’яке світло, що повторює кольори кадру.',
    btn_chrome: 'Додати до Chrome', btn_firefox: 'Додати до Firefox',
    hero_free: 'Безкоштовно, без акаунтів і реклами. YouTube, Twitch та будь-які інші сайти.',
    f_title: 'Що вміє', f_sub: 'Світло підлаштовується під кожен кадр і не заважає дивитися.',
    f_led_t: 'Світлодіодна стрічка', f_led_d: 'Навколо відео світяться окремі плями світла, як стрічка за телевізором. Кожна повторює колір свого краю кадру.',
    f_room_t: 'Колір кімнати', f_room_d: 'Уся сторінка м’яко забарвлюється в кольори відео: ліворуч у колір лівого краю, праворуч у колір правого.',
    f_themes_t: 'Шість тем оформлення', f_themes_d: 'Вікно й налаштування в стилі «Кінозал» і ще п’ять тем. Можна зібрати власну тему зі своїх кольорів.',
    m_title: 'І ще багато всього', m_sub: 'Усе налаштовується, але й без налаштувань виглядає добре.',
    m1_t: 'Будь-які сайти', m1_d: 'Відео в iframe, Shadow DOM і повноекранний режим.',
    m2_t: 'Форма й м’якість', m2_d: 'Розмір, розмиття, яскравість, насиченість, заокруглення рамки.',
    m3_t: 'Чорні смуги', m3_d: 'Розширення саме знаходить смуги, вшиті у фільм.',
    m4_t: 'Світло в такт звуку', m4_d: 'Підсвітка пульсує разом із басами.',
    m5_t: 'Philips Hue', m5_d: 'Лампи в кімнаті повторюють кольори відео.',
    m6_t: 'Для кожного сайту', m6_d: 'Власні налаштування, гарячі клавіші й резервна копія.',
    i_title: 'Встановити', i_sub: 'Розширення однаково працює в Chrome, Edge, Opera, Brave і Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave', i_firefox: 'Firefox для комп’ютера',
    d_title: 'Підтримати проєкт',
    d_sub: 'Video Glow безкоштовний і без реклами. Якщо він вам подобається, можна підтримати розробку криптовалютою. Будь-яка сума допомагає випускати нові версії.',
    d_warn: 'Надсилайте монети лише в тій мережі, що вказана на картці. Переказ в іншій мережі може загубитися.',
    d_thanks: 'Дякуємо, що ви з нами.',
    copy: 'Скопіювати адресу', copied: 'Скопійовано',
    privacy: 'Конфіденційність'
  },
  en: {
    title: 'Video Glow — ambient light for any video',
    fb_title: 'Have an idea or found a bug?', fb_sub: 'Tell me what’s missing. The best ideas go into the next versions.', fb_btn: 'Write to us',
    more_title: 'More from the author', more_sub: 'Video Glow is made by one developer. Here are two more free, open-source tools: one for video sound and one for screenshots.', more_site: 'Website', more_dl: 'Download', lv_kind: 'Extension for Chrome, Edge and Firefox', lv_desc: 'Evens out the loudness of any video: quiet dialogue gets louder, explosions get softer, so you can watch a movie at night without reaching for the volume.', lv_c1: 'Night mode', lv_c2: 'Volume up to 400%', lv_c3: 'Equalizer', lv_c4: 'Speed 0.25–4×', sn_kind: 'App for Windows, macOS and Linux', sn_desc: 'Fast, lightweight screenshots: select an area, add an arrow or a caption, copy. No accounts, no cloud.', sn_c1: 'Instant', sn_c2: 'Precise selection', sn_c3: 'Annotate', sn_c4: 'Private', sn_url: 'https://vkardin.github.io/snapt/',
    nav_features: 'Features', nav_install: 'Install', nav_donate: 'Donate', nav_support: 'Feedback',
    hero_title: 'Ambient light around any video',
    hero_lead: 'Video Glow turns your screen into a small cinema: a soft light that follows the colours of the picture glows around every video.',
    btn_chrome: 'Add to Chrome', btn_firefox: 'Add to Firefox',
    hero_free: 'Free, no accounts, no ads. YouTube, Twitch and any other site.',
    f_title: 'What it does', f_sub: 'The light follows every frame and never gets in the way.',
    f_led_t: 'LED strip', f_led_d: 'Separate spots of light glow around the video, like a strip behind a TV. Each one follows the colour of its edge of the frame.',
    f_room_t: 'Room colour', f_room_d: 'The whole page is softly tinted in the video’s colours: the left side like the left edge, the right side like the right.',
    f_themes_t: 'Six UI themes', f_themes_d: 'The popup and settings come in a “Cinema” style and five more themes. You can also build your own from your colours.',
    m_title: 'And much more', m_sub: 'Everything is adjustable, and it looks good with no setup at all.',
    m1_t: 'Any site', m1_d: 'Videos in iframes, Shadow DOM and fullscreen.',
    m2_t: 'Shape and softness', m2_d: 'Size, blur, brightness, saturation, rounded corners.',
    m3_t: 'Black bars', m3_d: 'Detects letterbox bars burned into the film.',
    m4_t: 'Light to the beat', m4_d: 'The glow pulses with the bass.',
    m5_t: 'Philips Hue', m5_d: 'Lamps in your room follow the video colours.',
    m6_t: 'Per-site settings', m6_d: 'Own settings per site, hotkeys and backup.',
    i_title: 'Install', i_sub: 'Works the same in Chrome, Edge, Opera, Brave and Firefox.',
    i_chrome: 'Chrome, Edge, Opera, Brave', i_firefox: 'Firefox for desktop',
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

// Переливание подсветки только пока превью на экране
(() => {
  const el = document.querySelector('.screen');
  if (!el || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => el.classList.toggle('paused', !e.isIntersecting)).observe(el);
})();
