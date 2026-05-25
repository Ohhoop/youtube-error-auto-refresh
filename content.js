(() => {
  const TAG = '[YT-AutoRefresh]';
  const MAX_REFRESH = 3;
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

  let reloadTriggered = false;

  const triggerReload = async () => {
    if (reloadTriggered) return;
    if (!errorVisible()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) {
      log('skip: max reached', { videoId, count });
      await flushLogs();
      return;
    }

    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    log('error detected, page reload (bypassCache)', { videoId, attempt: count + 1 });

    await flushLogs();

    try {
      await chrome.runtime.sendMessage({ type: 'flush-and-reload' });
    } catch (e) {
      location.reload();
    }
  };

  new MutationObserver(triggerReload).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  triggerReload();
})();
