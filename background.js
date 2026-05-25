const FILENAME = 'yt-autorefresh.log';
const LOG_KEY = 'logs';
const WRITE_DEBOUNCE_MS = 2000;

const YT_ORIGINS = [
  'https://www.youtube.com',
  'https://m.youtube.com',
  'https://youtube.com'
];

let writeTimer = null;

const clearLogs = () => chrome.storage.local.set({ [LOG_KEY]: '' });
chrome.runtime.onInstalled.addListener(clearLogs);
chrome.runtime.onStartup.addListener(clearLogs);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'log' && typeof msg.line === 'string') {
    appendLog(msg.line);
    return false;
  }
  if (msg && msg.type === 'flush-yt-cache') {
    flushYtCache()
      .then((info) => sendResponse({ ok: true, info }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

const flushYtCache = async () => {
  const dataTypes = {
    cache: true,
    cacheStorage: true,
    serviceWorkers: true
  };
  await chrome.browsingData.remove({ origins: YT_ORIGINS }, dataTypes);
  return { origins: YT_ORIGINS, dataTypes: Object.keys(dataTypes) };
};

const appendLog = async (line) => {
  const stored = await chrome.storage.local.get(LOG_KEY);
  const existing = stored[LOG_KEY] || '';
  await chrome.storage.local.set({ [LOG_KEY]: existing + line + '\n' });
  scheduleWrite();
};

const scheduleWrite = () => {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(writeFile, WRITE_DEBOUNCE_MS);
};

const writeFile = async () => {
  const stored = await chrome.storage.local.get(LOG_KEY);
  const logs = stored[LOG_KEY] || '';
  if (!logs) return;
  const url = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(logs)));
  try {
    await chrome.downloads.download({
      url,
      filename: FILENAME,
      conflictAction: 'overwrite',
      saveAs: false
    });
  } catch (e) {
    console.error('[YT-AutoRefresh:bg] download failed', e);
  }
};
