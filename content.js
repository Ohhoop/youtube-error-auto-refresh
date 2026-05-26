(() => {
  const MAX_REFRESH = 3;
  let reloadTriggered = false;

  const sendBlock = () => {
    try { window.postMessage({ source: 'yt-ar-content', type: 'show-overlay' }, location.origin); } catch (e) {}
  };

  const keepBackgroundAlive = () => {
    try {
      const port = chrome.runtime.connect({ name: 'yt-autorefresh-keepalive' });
      port.onMessage.addListener((msg) => {
        if (msg && msg.type === 'imminent-reload') sendBlock();
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
    try { sessionStorage.setItem('yt-ar-reloaded', '1'); } catch (e) {}
    sendBlock();
    chrome.runtime.sendMessage({ type: 'flush-and-reload' }).catch(() => location.reload());
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data || e.data.source !== 'yt-ar-main') return;
    if (e.data.type === 'player-400' || e.data.type === 'player-error') {
      triggerReload();
    }
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
