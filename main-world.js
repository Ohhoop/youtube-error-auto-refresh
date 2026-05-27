(() => {
  const C = self.YT_AR_REFRESH;
  const UNBLOCK_DELAY_MS = 2500;

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

  const block = () => {
    cancelUnblockTimer();
    const el = document.documentElement;
    if (el) el.classList.add(C.OVERLAY_CLASS);
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
      hookVideoElement(player);
    } catch (e) {
      hookRetryId = setTimeout(hookPlayer, 1000);
    }
  };

  let videoHookRetryId = null;
  const hookVideoElement = (player) => {
    if (videoHookRetryId) {
      clearTimeout(videoHookRetryId);
      videoHookRetryId = null;
    }
    const video = player.querySelector('video');
    if (!video) {
      videoHookRetryId = setTimeout(() => hookVideoElement(player), 100);
      return;
    }
    if (video.__yt_ar_hooked) return;
    const onVideoActive = () => {
      cancelUnblockTimer();
      unblock();
    };
    video.addEventListener('playing', onVideoActive);
    video.addEventListener('timeupdate', () => {
      if (video.currentTime > 0) onVideoActive();
    });
    video.__yt_ar_hooked = true;
    if (video.readyState >= 3 && !video.paused) onVideoActive();
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

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      const promise = origFetch.apply(this, arguments);
      try {
        promise.then((response) => {
          try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('/youtubei/v1/player') !== -1 && response.status === 400 && isWatchPage()) {
              block();
              try { window.postMessage({ source: C.SOURCE_MAIN, type: C.MSG_PLAYER_400 }, location.origin); } catch (e) {}
            }
          } catch (e) {}
        }).catch(() => {});
      } catch (e) {}
      return promise;
    };
  }
})();
