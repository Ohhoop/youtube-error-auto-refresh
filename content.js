(() => {
  const MAX_REFRESH = 3;
  let reloadTriggered = false;

  const keepBackgroundAlive = () => {
    try {
      const port = chrome.runtime.connect({ name: 'yt-autorefresh-keepalive' });
      port.onDisconnect.addListener(() => {
        setTimeout(keepBackgroundAlive, 100);
      });
    } catch (e) {
      setTimeout(keepBackgroundAlive, 1000);
    }
  };
  keepBackgroundAlive();

  const errorVisible = () => {
    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    return !!reason && !!(reason.textContent || '').trim();
  };

  const triggerReload = () => {
    if (reloadTriggered) return;
    if (!errorVisible()) return;
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;
    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) return;
    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    chrome.runtime.sendMessage({ type: 'flush-and-reload' }).catch(() => location.reload());
  };

  new MutationObserver(triggerReload).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  triggerReload();
})();
