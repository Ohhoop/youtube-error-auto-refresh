(() => {
  const TAG = '[YT-AutoRefresh]';
  const MAX_REFRESH = 3;
  const RELOAD_COOLDOWN_MS = 3000;

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

  const check = () => {
    if (reloadTriggered) return;

    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    if (!reason) return;

    const text = (reason.textContent || '').trim();
    if (!text) return;

    const overlay = reason.closest('.ytp-error');
    if (overlay && getComputedStyle(overlay).display === 'none') return;

    log('error detected', { text: text.substring(0, 200) });

    const videoId = getVideoId();
    if (!videoId) { log('skip: no video id'); return; }

    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) { log('skip: max reached', { videoId, count }); return; }

    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    log('reloading video', { videoId, attempt: count + 1 });
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
