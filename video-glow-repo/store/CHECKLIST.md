# Release checklist

## Before upload
- [ ] defaults.js → VG_CONFIG.DONATE_URL (Ko-fi / Boosty / Buy Me a Coffee) and PRIVACY_URL filled in
- [ ] Search the Web Store for name conflicts ("Video Glow", "Ambilight"); rename in _locales/*/messages.json if taken
- [ ] Chrome Web Store dashboard: trader status = non-trader (hobby, free); switch to trader if you start selling
- [ ] Upload video-glow-<version>-store.zip (manifest.json at the zip root)

## Screenshots (1280×800, you take them)
- Use legal content: Blender open movies (Big Buck Bunny, Sintel), your own videos, YouTube Creative Commons
- DO NOT use pirate-site screenshots — grounds for rejection
- Suggested: 1) glow on a page, 2) fullscreen on 16:10, 3) popup with presets, 4) shapes comparison, 5) before/after
- Promo images are in store/promo/ (440×280 tile, 1400×560 marquee)

## Tests
- Automated (real Chromium + extension): store/tests/run.py (needs python playwright; serve store/tests/ on port 8765) — 26 checks: pause modes, dim, hover button, site profiles, fullscreen settings, popup, options. Last run: all passed.
- store/tests/bars_test.js — black-bar detection.

## Manual test plan (real sites are NOT tested yet — only a synthetic video page)
- [ ] YouTube: normal, theater, fullscreen; pause fades out, play fades in
- [ ] Twitch, Vimeo, Reddit, Dailymotion
- [ ] Fullscreen: container fullscreen vs bare <video> fullscreen (Wikipedia/direct mp4 file)
- [ ] Cross-origin/DRM video (Netflix etc.): popup should say it can't be read; no errors
- [ ] Letterboxed movie: bars are cropped, no dark zones in the glow
- [ ] 16:10 and ultrawide fullscreen
- [ ] Weak laptop: FPS adapts, battery saver at <30% unplugged
- [ ] Pause modes (fade / stay / delay), own fullscreen settings, per-site settings, dim, button on video (does it clash with site players' controls?)
- [ ] Popup status line for each state; presets; reset; site toggle; Alt+Shift+B
- [ ] Options: add/remove site, export/import JSON, reset all
- [ ] Reload extension with open tabs: no double glow
- [ ] Languages: switch browser UI to ru/uk/en
