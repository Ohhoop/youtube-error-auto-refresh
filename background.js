importScripts('shared.js');
const C = self.YT_AR_REFRESH;

const RELOAD_DEDUP_MS = 5000;
const MAX_RELOADS_PER_TAB = 3;
const KEEPALIVE_RECONNECT_MS = 240000;
const MULTI_403_WINDOW_MS = 500;
const MULTI_403_THRESHOLD = 3;

const tabReloadState = new Map();
const activePortsByTab = new Map();
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

const sendOverlaySignal = (tabId) => {
  const port = activePortsByTab.get(tabId);
  if (!port) return;
  try { port.postMessage({ type: C.MSG_IMMINENT_RELOAD }); } catch (e) {}
};

const maybeReloadTab = async (tabId) => {
  if (!tabId || tabId < 0) return;
  if (!isWatchUrl(tabUrls.get(tabId))) return;
  const now = Date.now();
  const state = tabReloadState.get(tabId) || { lastReload: 0, count: 0 };
  if (now - state.lastReload < RELOAD_DEDUP_MS) return;
  if (state.count >= MAX_RELOADS_PER_TAB) return;
  state.lastReload = now;
  state.count += 1;
  tabReloadState.set(tabId, state);
  sendOverlaySignal(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (key) => { try { sessionStorage.setItem(key, '1'); } catch (e) {} },
      args: [C.STORAGE_RELOADED],
      world: 'MAIN'
    });
  } catch (e) {}
  chrome.tabs.reload(tabId, { bypassCache: true });
};

const handleVideoplayback403 = (tabId) => {
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
  activePortsByTab.delete(tabId);
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
    if (details.statusCode === 403) handleVideoplayback403(details.tabId);
  },
  { urls: ['*://*.googlevideo.com/videoplayback*'] }
);

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab || !msg) return;
  if (msg.type === C.MSG_FLUSH_AND_RELOAD) {
    maybeReloadTab(sender.tab.id);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== C.PORT_NAME) return;
  const tabId = port.sender && port.sender.tab && port.sender.tab.id;
  if (tabId) activePortsByTab.set(tabId, port);
  const timeoutId = setTimeout(() => {
    try { port.disconnect(); } catch (e) {}
  }, KEEPALIVE_RECONNECT_MS);
  port.onDisconnect.addListener(() => {
    clearTimeout(timeoutId);
    if (tabId && activePortsByTab.get(tabId) === port) {
      activePortsByTab.delete(tabId);
    }
  });
});
