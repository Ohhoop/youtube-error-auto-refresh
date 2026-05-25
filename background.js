const FILENAME = 'yt-autorefresh.log';
const LOG_KEY = 'logs';

const WATCH_URL_PATTERNS = [
  '*://*.youtube.com/*',
  '*://*.googlevideo.com/*',
  '*://*.ytimg.com/*',
  '*://*.googleapis.com/*',
  '*://*.youtube-nocookie.com/*'
];

const clearLogs = () => chrome.storage.local.set({ [LOG_KEY]: '' });
chrome.runtime.onInstalled.addListener(clearLogs);
chrome.runtime.onStartup.addListener(clearLogs);

let storageQueue = Promise.resolve();
const appendLine = (line) => {
  storageQueue = storageQueue.then(async () => {
    const stored = await chrome.storage.local.get(LOG_KEY);
    const existing = stored[LOG_KEY] || '';
    await chrome.storage.local.set({ [LOG_KEY]: existing + line + '\n' });
  }).catch(() => {});
  return storageQueue;
};

const formatRequest = (label, details) => {
  const time = new Date().toISOString();
  const truncatedUrl = details.url.length > 250 ? details.url.substring(0, 250) + '...' : details.url;
  const status = details.statusCode !== undefined ? `HTTP-${details.statusCode}` : (details.error || 'unknown');
  return `${time} ${label} ${details.method || ''} ${status} ${details.type || ''} ${truncatedUrl}`;
};

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400) {
      appendLine(formatRequest('NET-FAIL', details));
    }
  },
  { urls: WATCH_URL_PATTERNS }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    appendLine(formatRequest('NET-ERROR', details));
  },
  { urls: WATCH_URL_PATTERNS }
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'append-and-write') {
    appendAndWrite(typeof msg.text === 'string' ? msg.text : '')
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg && msg.type === 'flush-and-reload') {
    const tabId = sender.tab && sender.tab.id;
    reloadTab(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

const appendAndWrite = async (text) => {
  storageQueue = storageQueue.then(async () => {
    const stored = await chrome.storage.local.get(LOG_KEY);
    const existing = stored[LOG_KEY] || '';
    const updated = existing + text;
    await chrome.storage.local.set({ [LOG_KEY]: updated });
    await writeFile(updated);
  });
  return storageQueue;
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

const reloadTab = async (tabId) => {
  if (!tabId) throw new Error('no tab id');
  await chrome.tabs.reload(tabId, { bypassCache: true });
};
