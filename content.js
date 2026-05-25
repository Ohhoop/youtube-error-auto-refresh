(() => {
  const TAG = '[YT-AutoRefresh]';
  const MAX_REFRESH = 3;
  const RELOAD_COOLDOWN_MS = 12000;
  const LOG_FLUSH_INTERVAL_MS = 30000;

  let reloadTriggered = false;
  const logBuffer = [];

  const log = (msg, data) => {
    const line = data !== undefined
      ? `${new Date().toISOString()} ${msg} ${JSON.stringify(data)}`
      : `${new Date().toISOString()} ${msg}`;
    console.log(TAG, msg, data === undefined ? '' : data);
    logBuffer.push(line);
  };

  const flushLogs = async () => {
    if (logBuffer.length === 0) return;
    const text = logBuffer.join('\n') + '\n';
    logBuffer.length = 0;
    try {
      await chrome.runtime.sendMessage({ type: 'append-and-write', text });
    } catch (e) {}
  };

  setInterval(flushLogs, LOG_FLUSH_INTERVAL_MS);
  window.addEventListener('beforeunload', () => { flushLogs(); });

  log('content script loaded', { url: location.href });

  const getVideoId = () => new URLSearchParams(location.search).get('v');

  const errorVisible = () => {
    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    if (!reason) return false;
    const text = (reason.textContent || '').trim();
    if (!text) return false;
    const overlay = reason.closest('.ytp-error');
    if (overlay && getComputedStyle(overlay).display === 'none') return false;
    return true;
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data) return;
    if (e.data.type === 'yt-autorefresh-strategy') {
      log('strategy', e.data);
    } else if (e.data.type === 'yt-autorefresh-success') {
      log('reload succeeded', e.data);
      flushLogs();
    } else if (e.data.type === 'yt-autorefresh-all-failed') {
      log('all strategies failed, page reload', e.data);
      flushLogs().finally(() => location.reload());
    }
  });

  const check = async () => {
    if (reloadTriggered) return;
    if (!errorVisible()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) {
      log('skip: max reached', { videoId, count });
      flushLogs();
      return;
    }

    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    log('error detected', { videoId, attempt: count + 1 });

    try {
      const res = await chrome.runtime.sendMessage({ type: 'flush-yt-data' });
      log('storage flush', res);
    } catch (e) {
      log('storage flush failed', { error: String(e) });
    }

    window.postMessage({ type: 'yt-autorefresh-reload', videoId }, location.origin);
    setTimeout(() => { reloadTriggered = false; }, RELOAD_COOLDOWN_MS);
  };

  new MutationObserver(check).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  check();
})();
