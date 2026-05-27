(() => {
  const C = self.YT_AR_REFRESH;
  const MAX_REFRESH = 3;
  let reloadTriggered = false;

  const isWatchPage = () =>
    location.pathname === '/watch' && !!new URLSearchParams(location.search).get('v');

  const sendBlock = () => {
    try { window.postMessage({ source: C.SOURCE_CONTENT, type: C.MSG_SHOW_OVERLAY }, location.origin); } catch (e) {}
  };

  const triggerReload = () => {
    if (reloadTriggered) return;
    if (!isWatchPage()) return;
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;
    const key = C.STORAGE_REFRESH_PREFIX + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) return;
    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    try { sessionStorage.setItem(C.STORAGE_RELOADED, '1'); } catch (e) {}
    sendBlock();
    chrome.runtime.sendMessage({ type: C.MSG_FLUSH_AND_RELOAD }).catch(() => location.reload());
  };

  const keepBackgroundAlive = () => {
    try {
      const port = chrome.runtime.connect({ name: C.PORT_NAME });
      port.onMessage.addListener((msg) => {
        if (msg && msg.type === C.MSG_IMMINENT_RELOAD) sendBlock();
      });
      port.onDisconnect.addListener(() => {
        setTimeout(keepBackgroundAlive, 100);
      });
    } catch (e) {
      setTimeout(keepBackgroundAlive, 1000);
    }
  };
  keepBackgroundAlive();

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data || e.data.source !== C.SOURCE_MAIN) return;
    if (e.data.type === C.MSG_PLAYER_ERROR || e.data.type === C.MSG_PLAYER_400) triggerReload();
  });

  const errorVisible = () => {
    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    return !!reason && !!(reason.textContent || '').trim();
  };

  const domTrigger = () => {
    if (errorVisible()) triggerReload();
  };

  new MutationObserver(domTrigger).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  domTrigger();
})();
