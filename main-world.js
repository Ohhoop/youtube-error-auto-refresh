(() => {
  const C = self.YT_AR_REFRESH;
  const UNBLOCK_DELAY_MS = 1000;

  const isWatchPage = () =>
    location.pathname === '/watch' && !!new URLSearchParams(location.search).get('v');

  const isWatchUrl = (url) => {
    try {
      const u = new URL(url, location.href);
      return (u.hostname === 'www.youtube.com' || u.hostname === 'm.youtube.com') &&
             u.pathname === '/watch' && u.searchParams.has('v');
    } catch (e) {
      return false;
    }
  };

  let unblockTimer = null;
  let skipUnblockDelay = false;

  try {
    if (sessionStorage.getItem(C.STORAGE_RELOADED) === '1') {
      sessionStorage.removeItem(C.STORAGE_RELOADED);
      skipUnblockDelay = true;
    }
  } catch (e) {}

  const cancelUnblockTimer = () => {
    if (unblockTimer) {
      clearTimeout(unblockTimer);
      unblockTimer = null;
    }
  };

  const block = () => {
    cancelUnblockTimer();
    const el = document.documentElement;
    if (el) el.classList.add(C.OVERLAY_CLASS);
  };

  const unblock = () => {
    const el = document.documentElement;
    if (el) el.classList.remove(C.OVERLAY_CLASS);
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  };

  const scheduleUnblock = () => {
    if (unblockTimer !== null) return;
    const delay = skipUnblockDelay ? 0 : UNBLOCK_DELAY_MS;
    unblockTimer = setTimeout(() => {
      unblockTimer = null;
      unblock();
    }, delay);
  };

  if (isWatchPage()) block();

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (e.data && e.data.source === C.SOURCE_CONTENT && e.data.type === C.MSG_SHOW_OVERLAY) {
      block();
    }
  });

  document.addEventListener('click', (e) => {
    try {
      const link = e.target.closest && e.target.closest('a[href]');
      if (link && isWatchUrl(link.href)) block();
    } catch (err) {}
  }, true);

  let hookRetryId = null;
  const hookPlayer = () => {
    if (hookRetryId) {
      clearTimeout(hookRetryId);
      hookRetryId = null;
    }
    if (!isWatchPage()) {
      hookRetryId = setTimeout(hookPlayer, 500);
      return;
    }
    const player = document.getElementById('movie_player');
    if (!player || typeof player.addEventListener !== 'function') {
      hookRetryId = setTimeout(hookPlayer, 100);
      return;
    }
    if (player.__yt_ar_hooked) return;

    try {
      player.addEventListener('onError', () => {
        block();
        try { window.postMessage({ source: C.SOURCE_MAIN, type: C.MSG_PLAYER_ERROR }, location.origin); } catch (e) {}
      });
      player.addEventListener('onStateChange', (state) => {
        if (state !== -1) {
          scheduleUnblock();
        } else {
          cancelUnblockTimer();
        }
      });
      player.__yt_ar_hooked = true;
      scheduleUnblock();
    } catch (e) {
      hookRetryId = setTimeout(hookPlayer, 1000);
    }
  };
  hookPlayer();

  const onNavigate = () => {
    if (isWatchPage()) {
      block();
      hookPlayer();
    } else {
      cancelUnblockTimer();
      unblock();
    }
  };

  const wrapHistoryMethod = (name) => {
    const orig = history[name];
    history[name] = function () {
      const result = orig.apply(this, arguments);
      onNavigate();
      return result;
    };
  };
  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
  window.addEventListener('popstate', onNavigate);
})();
