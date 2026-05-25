const FILENAME = 'yt-autorefresh.log';
const LOG_KEY = 'logs';

const YT_ORIGINS = [
  'https://www.youtube.com',
  'https://m.youtube.com',
  'https://youtube.com'
];

const clearLogs = () => chrome.storage.local.set({ [LOG_KEY]: '' });
chrome.runtime.onInstalled.addListener(clearLogs);
chrome.runtime.onStartup.addListener(clearLogs);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'append-and-write' && typeof msg.text === 'string') {
    appendAndWrite(msg.text)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg && msg.type === 'flush-yt-data') {
    flushYtData()
      .then((info) => sendResponse({ ok: true, info }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

const appendAndWrite = async (text) => {
  const stored = await chrome.storage.local.get(LOG_KEY);
  const existing = stored[LOG_KEY] || '';
  const updated = existing + text;
  await chrome.storage.local.set({ [LOG_KEY]: updated });
  await writeFile(updated);
};

const writeFile = async (logs) => {
  if (!logs) return;
  const url = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(logs)));
  await chrome.downloads.download({
    url,
    filename: FILENAME,
    conflictAction: 'overwrite',
    saveAs: false
  });
};

const flushYtData = async () => {
  const dataTypes = {
    cache: true,
    cacheStorage: true,
    serviceWorkers: true,
    localStorage: true,
    indexedDB: true
  };
  await chrome.browsingData.remove({ origins: YT_ORIGINS }, dataTypes);
  return { origins: YT_ORIGINS, dataTypes: Object.keys(dataTypes) };
};
