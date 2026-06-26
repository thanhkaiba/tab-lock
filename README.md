# Tab Lock

A Chrome/Edge extension that blocks all keyboard input on the current tab with one click.

![locked](icons/locked-48.png) Red keyboard = locked &nbsp;|&nbsp; ![unlocked](icons/unlocked-48.png) Green keyboard = unlocked

## What it does

- Click the toolbar icon → toggle the lock on/off
- A red border appears on the page when keyboard is blocked
- Lock state is per-tab and independent
- Resets on full page navigation, persists through SPA navigation

## Dev setup

Requires Node.js 18+ and Microsoft Edge (for Playwright extension testing).

```bash
npm install
```

**Load the extension in Edge/Chrome:**
1. Go to `edge://extensions` (or `chrome://extensions`)
2. Enable Developer mode
3. Load unpacked → select this directory

**Regenerate icons** (after editing `generate-icons.mjs`):
```bash
node generate-icons.mjs
```

**Run tests:**
```bash
npx playwright test
```

Tests use Edge with the extension loaded. All tests are in `tests/tab-lock.spec.js`.

## Project structure

```
manifest.json          # Extension manifest (MV3)
service-worker.js      # Background SW — manages lock state, injects content script
content.js             # Injected into pages — blocks keydown events, shows red border
popup.html/js/css      # Toolbar popup UI (toggle switch)
generate-icons.mjs     # Generates icons/locked-*.png and icons/unlocked-*.png
```

## Contributing

PRs welcome. Keep changes focused — one concern per PR. Run `npx playwright test` before submitting.
