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

chrome.alarms.create('flush-logs', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flush-logs') writeFile().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'log' && typeof msg.line === 'string') {
    handleLog(msg.line)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg && msg.type === 'flush-yt-cache') {
    flushYtCache()
      .then((info) => sendResponse({ ok: true, info }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

const handleLog = async (line) => {
  const stored = await chrome.storage.local.get(LOG_KEY);
  const existing = stored[LOG_KEY] || '';
  await chrome.storage.local.set({ [LOG_KEY]: existing + line + '\n' });
  await writeFile();
};

const writeFile = async () => {
  const stored = await chrome.storage.local.get(LOG_KEY);
  const logs = stored[LOG_KEY] || '';
  if (!logs) return;
  const url = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(logs)));
  await chrome.downloads.download({
    url,
    filename: FILENAME,
    conflictAction: 'overwrite',
    saveAs: false
  });
};

const flushYtCache = async () => {
  const dataTypes = {
    cache: true,
    cacheStorage: true,
    serviceWorkers: true
  };
  await chrome.browsingData.remove({ origins: YT_ORIGINS }, dataTypes);
  return { origins: YT_ORIGINS, dataTypes: Object.keys(dataTypes) };
};
