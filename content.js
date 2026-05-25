(() => {
  const TAG = '[YT-AutoRefresh]';
  const MAX_REFRESH = 3;
  const RELOAD_COOLDOWN_MS = 5000;

  let mutationCount = 0;
  let loggedFirstMutation = false;
  let reloadTriggered = false;

  const log = (msg, data) => {
    const time = new Date().toISOString();
    const line = data !== undefined
      ? `${time} ${msg} ${JSON.stringify(data)}`
      : `${time} ${msg}`;
    console.log(TAG, msg, data === undefined ? '' : data);
    try { chrome.runtime.sendMessage({ type: 'log', line }); } catch (e) {}
  };

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

  const snapshot = (label) => {
    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    const errorEl = document.querySelector('.ytp-error');
    log(label, {
      url: location.href,
      mutationCount,
      hasReason: !!reason,
      reasonText: reason ? (reason.textContent || '').trim().substring(0, 150) : null,
      hasErrorEl: !!errorEl,
      errorElDisplay: errorEl ? getComputedStyle(errorEl).display : null
    });
  };

  const check = async () => {
    if (reloadTriggered) return;
    if (!errorVisible()) return;

    const videoId = getVideoId();
    if (!videoId) { log('skip: no video id'); return; }

    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) { log('skip: max reached', { videoId, count }); return; }

    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    log('error detected, starting reload sequence', { videoId, attempt: count + 1 });

    try {
      const res = await chrome.runtime.sendMessage({ type: 'flush-yt-cache' });
      log('cache flush result', res);
    } catch (e) {
      log('cache flush failed', { error: String(e) });
    }

    log('posting video reload to main world', { videoId });
    window.postMessage({ type: 'yt-autorefresh-reload', videoId }, location.origin);
    setTimeout(() => { reloadTriggered = false; }, RELOAD_COOLDOWN_MS);
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data || e.data.type !== 'yt-autorefresh-result') return;
    log('reload result', e.data);
  });

  const observer = new MutationObserver(() => {
    mutationCount++;
    if (!loggedFirstMutation) {
      loggedFirstMutation = true;
      log('first mutation observed');
    }
    check();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  log('observer attached');

  setTimeout(() => snapshot('snapshot 5s'), 5000);
  setTimeout(() => snapshot('snapshot 15s'), 15000);
  setTimeout(() => snapshot('snapshot 30s'), 30000);

  check();
})();
