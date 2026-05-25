# YouTube Auto-Refresh on Error

Temporary workaround for a uBlock Origin issue on YouTube. When the player shows a playback error, the extension reloads the page automatically. Capped at 3 reloads per video to avoid infinite loops.

## How it works

A content script watches the YouTube DOM with a `MutationObserver`. When the `.ytp-error` overlay becomes visible, it increments a per-video counter in `sessionStorage` and calls `location.reload()`. The observer keeps running when the tab is in the background, so it triggers even if YouTube is not the active tab.

## Install (Opera GX / Chrome / Edge)

1. Download or clone this repository.
2. Open `opera://extensions` (or `chrome://extensions`).
3. Enable Developer Mode.
4. Click "Load unpacked" and select the project folder.

To install from the packaged `.zip`, unzip it first, then follow the same steps.

## Configuration

The refresh cap is set in `content.js`:

```js
const MAX_REFRESH = 3;
```

## Build

```powershell
Compress-Archive -Path manifest.json,content.js -DestinationPath youtube-error-auto-refresh-1.0.0.zip -Force
```
