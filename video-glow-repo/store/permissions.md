# "Privacy practices" tab answers

Single purpose: Draws an ambient glow around HTML5 videos on web pages.

- storage: saves the user's settings (shape, blur, disabled sites) locally.
- scripting: after install/update, attaches the content script to tabs that are already open so the glow works without reloading them.
- Host permission (<all_urls>): the glow must work on any site that contains a <video>; the content script finds videos and draws a canvas next to them. No page data is read except video frames, which stay in the browser.
- Remote code: No. (All code is in the package, no eval, no external scripts.)
- Data usage: do NOT tick any data-collection boxes. Certify all three statements (no sale, no unrelated use, no creditworthiness use).
- Privacy policy URL: publish store/PRIVACY.md somewhere public (GitHub Pages / gist) and paste the link here AND into VG_CONFIG.PRIVACY_URL in defaults.js.
