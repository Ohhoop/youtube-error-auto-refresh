const FILENAME = 'yt-autorefresh.log';
const LOG_KEY = 'logs';

const WATCH_URL_PATTERNS = [
  '*://*.youtube.com/*',
  '*://*.googlevideo.com/*',
  '*://*.ytimg.com/*',
  '*://*.googleapis.com/*',
  '*://*.youtube-nocookie.com/*'
];

const RELOAD_DEDUP_MS = 5000;
const MAX_RELOADS_PER_TAB = 3;
const tabReloadState = new Map();

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

const maybeReloadTab = async (tabId, source) => {
  if (!tabId || tabId < 0) return false;
  const now = Date.now();
  const state = tabReloadState.get(tabId) || { lastReload: 0, count: 0 };

  if (now - state.lastReload < RELOAD_DEDUP_MS) {
    appendLine(`${new Date().toISOString()} SKIP-RELOAD recent source=${source} tab=${tabId}`);
    return false;
  }
  if (state.count >= MAX_RELOADS_PER_TAB) {
    appendLine(`${new Date().toISOString()} SKIP-RELOAD max source=${source} tab=${tabId} count=${state.count}`);
    return false;
  }

  state.lastReload = now;
  state.count += 1;
  tabReloadState.set(tabId, state);
  appendLine(`${new Date().toISOString()} TRIGGER-RELOAD source=${source} tab=${tabId} attempt=${state.count}`);

  try {
    await chrome.tabs.reload(tabId, { bypassCache: true });
    return true;
  } catch (e) {
    appendLine(`${new Date().toISOString()} RELOAD-FAILED source=${source} tab=${tabId} error=${String(e)}`);
    return false;
  }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    tabReloadState.delete(tabId);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tabReloadState.delete(tabId);
});

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode >= 400) {
      appendLine(formatRequest('NET-FAIL', details));
      if (details.statusCode === 400 && details.url.includes('/youtubei/v1/player')) {
        maybeReloadTab(details.tabId, 'net-400-player');
      }
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
    maybeReloadTab(sender.tab && sender.tab.id, 'dom-error')
      .then((reloaded) => sendResponse({ ok: true, reloaded }))
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
