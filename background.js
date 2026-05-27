const RELOAD_DEDUP_MS = 5000;
const MAX_RELOADS_PER_TAB = 3;
const MULTI_403_WINDOW_MS = 500;
const MULTI_403_THRESHOLD = 3;

const tabReloadState = new Map();
const videoplayback403History = new Map();
const tabUrls = new Map();

const isWatchUrl = (url) => {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (u.hostname === 'www.youtube.com' || u.hostname === 'm.youtube.com') &&
           u.pathname === '/watch' && u.searchParams.has('v');
  } catch (e) {
    return false;
  }
};

chrome.tabs.query({}, (tabs) => {
  if (chrome.runtime.lastError) return;
  for (const t of tabs) {
    if (t.id !== undefined && t.url) tabUrls.set(t.id, t.url);
  }
});

const maybeReloadTab = (tabId) => {
  if (!tabId || tabId < 0) return;
  if (!isWatchUrl(tabUrls.get(tabId))) return;
  const now = Date.now();
  const state = tabReloadState.get(tabId) || { lastReload: 0, count: 0 };
  if (now - state.lastReload < RELOAD_DEDUP_MS) return;
  if (state.count >= MAX_RELOADS_PER_TAB) return;
  state.lastReload = now;
  state.count += 1;
  tabReloadState.set(tabId, state);
  chrome.tabs.reload(tabId, { bypassCache: true });
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    tabUrls.set(tabId, changeInfo.url);
    tabReloadState.delete(tabId);
    videoplayback403History.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabReloadState.delete(tabId);
  videoplayback403History.delete(tabId);
  tabUrls.delete(tabId);
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.statusCode === 400) maybeReloadTab(details.tabId);
  },
  { urls: ['*://*.youtube.com/youtubei/v1/player*'] }
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.statusCode !== 403) return;
    const tabId = details.tabId;
    if (!tabId || tabId < 0) return;
    if (!isWatchUrl(tabUrls.get(tabId))) return;
    const now = Date.now();
    let history = videoplayback403History.get(tabId) || [];
    history = history.filter((t) => now - t < MULTI_403_WINDOW_MS);
    history.push(now);
    if (history.length >= MULTI_403_THRESHOLD) {
      videoplayback403History.delete(tabId);
      maybeReloadTab(tabId);
    } else {
      videoplayback403History.set(tabId, history);
    }
  },
  { urls: ['*://*.googlevideo.com/videoplayback*'] }
);

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  if (msg && msg.type === 'flush-and-reload') {
    maybeReloadTab(sender.tab.id);
  }
});
