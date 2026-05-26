const RELOAD_DEDUP_MS = 5000;
const MAX_RELOADS_PER_TAB = 3;
const KEEPALIVE_RECONNECT_MS = 240000;
const tabReloadState = new Map();

const maybeReloadTab = (tabId) => {
  if (!tabId || tabId < 0) return;
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
  if (changeInfo.url) tabReloadState.delete(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tabReloadState.delete(tabId);
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.statusCode === 400) maybeReloadTab(details.tabId);
  },
  { urls: ['*://*.youtube.com/youtubei/v1/player*'] }
);

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'flush-and-reload') {
    maybeReloadTab(sender.tab && sender.tab.id);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'yt-autorefresh-keepalive') return;
  const timeoutId = setTimeout(() => {
    try { port.disconnect(); } catch (e) {}
  }, KEEPALIVE_RECONNECT_MS);
  port.onDisconnect.addListener(() => clearTimeout(timeoutId));
});
