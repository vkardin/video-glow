<p align="center"><img src=".github/assets/project-banner.svg" alt="Video Glow by vkardin" width="100%"></p>

<h1 align="center">Video Glow</h1>

<p align="center"><b>Підсвітка для будь-якого відео в браузері</b><br>
<a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · Українська</p>

<p align="center">
<a href="https://chromewebstore.google.com/detail/bjgbalkabocifimhnhbcnomeknpbhkea"><img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/bjgbalkabocifimhnhbcnomeknpbhkea?label=Chrome&logo=googlechrome&logoColor=white"></a>
<a href="https://addons.mozilla.org/firefox/addon/video-glow/"><img alt="Firefox Add-ons" src="https://img.shields.io/amo/v/video-glow?label=Firefox&logo=firefoxbrowser&logoColor=white"></a>
<a href="https://vkardin.github.io/video-glow/"><img alt="Website" src="https://img.shields.io/badge/site-vkardin.github.io%2Fvideo--glow-222"></a>
<a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

Video Glow перетворює екран на маленький кінозал: навколо будь-якого HTML5-відео спалахує м’яке світло в колір картинки. Працює на YouTube, Twitch та будь-якому іншому сайті, зокрема в повноекранному режимі. Безкоштовно, без акаунтів.

<p align="center"><img src="docs/img/glow-uk.webp" width="720" alt="Підсвітка навколо відео"></p>

## Встановлення

- **Chrome, Edge, Brave, Opera:** [Chrome Web Store](https://chromewebstore.google.com/detail/bjgbalkabocifimhnhbcnomeknpbhkea)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/video-glow/)
- **Вручну:** zip-архіви для Chrome і Firefox на сторінці [Releases](../../releases)

## Можливості

- Будь-які сайти, відео в iframe і повноекранний режим (заливає чорні смуги на екранах 16:10 та ультрашироких)
- Два стилі: м’яке розмиття або світлодіодна стрічка, де кожна пляма повторює колір свого краю кадру
- Колір кімнати: уся сторінка м’яко забарвлюється в кольори відео
- Налаштовуються форма, розмір, м’якість краю, розмиття, яскравість і насиченість
- Плавна поява і згасання під час паузи, автовизначення чорних смуг, вшитих у фільм
- Фільтри відео, нічний комфорт, захист від спалахів, сяйво в такт звуку
- Режим кінотеатру, кнопка вкл/викл на відео, власні налаштування для кожного сайту, гарячі клавіші, резервна копія
- Шість тем оформлення; English, Deutsch, Español, Polski, Português (Brasil), Türkçe, Русский, Українська

| Світлодіодна стрічка | Колір кімнати | Налаштування |
|---|---|---|
| ![Стрічка](docs/img/led-uk.webp) | ![Колір кімнати](docs/img/room-uk.webp) | ![Налаштування](docs/img/settings-uk.webp) |

## Конфіденційність

Розширення не збирає даних і нікуди нічого не надсилає: усе працює на вашому пристрої. [Політика конфіденційності](https://vkardin.github.io/video-glow/privacy.html).

## Зворотний зв’язок і підтримка

- Ідеї та помилки: [сторінка зворотного зв’язку](https://vkardin.github.io/video-glow/support.html) або [GitHub Issues](../../issues/new/choose)
- Підтримати проєкт криптовалютою: [https://vkardin.github.io/video-glow/#donate](https://vkardin.github.io/video-glow/#donate)

## Що в репозиторії

| Тека | Що всередині |
|---|---|
| [`extension/`](extension) | Вихідний код розширення (`chrome://extensions` → Режим розробника → Завантажити розпаковане) |
| [`docs/`](docs) | Сайт, публікується через GitHub Pages |
| [`store/`](store) | Тексти для магазинів, графіка й тестові скрипти |
| [`tools/`](tools) | `build.py` збирає zip для Chrome і Firefox |


## Ліцензія

[MIT](LICENSE) © vkardin

<!-- project-family:start -->

[**vkardin / tools — каталог усіх проєктів ↗**](https://vkardin.github.io/video-glow/projects/)
## Інші інструменти від vkardin

| Проєкт | Опис |
| --- | --- |
| **[Leveler](https://vkardin.github.io/leveler/)** | Рівна гучність, розбірливі діалоги, еквалайзер і керування швидкістю. [GitHub](https://github.com/vkardin/leveler) |
| **[Video Drift](https://vkardin.github.io/video-drift/)** | Відео поверх інших вікон, субтитри, збереження позиції й нотатки до моментів. [GitHub](https://github.com/vkardin/video-drift) |
| **[Snapt](https://vkardin.github.io/snapt/)** | Знімки екрана, стрілки й підписи. Застосунок для Windows, macOS та Linux і розширення браузера. [GitHub](https://github.com/vkardin/snapt) |
| **[UNI](https://vkardin.github.io/uni-homebot/)** | Домашній сервер у Telegram: застосунки, моніторинг, сповіщення й мінізастосунок. [GitHub](https://github.com/vkardin/uni-homebot) |

[github.com/vkardin](https://github.com/vkardin) · Незалежні інструменти · відкритий код
<!-- project-family:end -->
