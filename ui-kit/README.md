# vkardin UI

Shared presentation tokens, component styles and range-input helper, version 1.0.0.

`tokens.json` is the palette source. `components.css` contains common controls. `controls.js` exposes `VkUI.fillRange(input)`. The sync script vendors these files into the five checkouts; installed applications never fetch shared code over the network.

Run `python ui-kit/sync.py --workspace /path/to/checkouts`, review the resulting changes in each repository, then run again with `--check` before committing. Existing Video Glow custom themes remain available. Native Snapt uses the same neutral palette while retaining its native drawing and theme selection. Telegram keeps its own link accent for charts.

Keep shared code limited to presentation and input helpers. Audio processing, video relocation, screenshot capture and server access stay within their respective applications.
