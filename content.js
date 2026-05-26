(() => {
  const MAX_REFRESH = 3;
  let reloadTriggered = false;
  let overlay = null;

  const ensureOverlay = () => {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'yt-autorefresh-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'background:#000;z-index:2147483647;display:none;pointer-events:none;';
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  };

  const showOverlay = () => {
    const o = ensureOverlay();
    o.style.display = 'block';
  };

  const keepBackgroundAlive = () => {
    try {
      const port = chrome.runtime.connect({ name: 'yt-autorefresh-keepalive' });
      port.onMessage.addListener((msg) => {
        if (msg && msg.type === 'imminent-reload') showOverlay();
      });
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
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;
    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) return;
    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    showOverlay();
    chrome.runtime.sendMessage({ type: 'flush-and-reload' }).catch(() => location.reload());
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data || e.data.source !== 'yt-ar-main') return;
    triggerReload();
  });

  const domTrigger = () => {
    if (errorVisible()) triggerReload();
  };

  new MutationObserver(domTrigger).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  domTrigger();
})();
