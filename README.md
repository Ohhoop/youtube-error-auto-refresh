# YouTube Auto-Refresh on Error

Workaround for YouTube playback errors caused by ad-blocker interactions. When YouTube shows an "An error occurred. Please try again later" message, the extension automatically reloads the page with cache bypass. Capped at 3 reloads per video to avoid infinite loops.

## How it works

Two detection paths run in parallel:

1. **Network path (fastest)**: the background service worker listens for `HTTP 400` responses on `youtubei/v1/player` via `webRequest.onHeadersReceived` and triggers the reload immediately when the response headers arrive, before YouTube renders its error overlay.
2. **DOM path (fallback)**: a content-script `MutationObserver` watches for the `.ytp-error-content-wrap-reason` element appearing in the DOM and posts a reload request to the service worker.

The reload itself is `chrome.tabs.reload(tabId, { bypassCache: true })` so YouTube's JavaScript is fetched fresh from the server. A persistent port from the content script keeps the service worker awake so the network trigger fires without a cold-start delay. Both paths share a per-tab dedup window and a 3-reload cap that resets when the tab navigates to a new URL.

## Install (Opera GX / Chrome / Edge)

Direct download: [youtube-error-auto-refresh.crx](https://github.com/Ohhoop/youtube-error-auto-refresh/releases/latest/download/youtube-error-auto-refresh.crx)

1. Download the `.crx` file from the link above.
2. Open `opera://extensions` (or `chrome://extensions`, `edge://extensions`).
3. Enable Developer Mode.
4. Drag and drop the `.crx` file into the page.

Alternatively, load the unpacked source: clone the repo, then click "Load unpacked" and select the `Unpacked` folder.

## Configuration

The refresh cap is set in `content.js` and `background.js`:

```js
const MAX_REFRESH = 3;        // content.js, per video
const MAX_RELOADS_PER_TAB = 3; // background.js, per tab
```

## Build

Pack the `Unpacked/` folder with any Chromium browser. Example with Edge:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --pack-extension="D:\path\to\Unpacked" `
  --pack-extension-key="D:\path\to\youtube-error-auto-refresh.pem"
```

The output `.crx` lands next to `Unpacked/`. Sign with the existing `.pem` key (kept outside the repo) so the extension ID stays stable across releases.
