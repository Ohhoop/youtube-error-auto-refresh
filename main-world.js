(() => {
  const SIGNAL = (type) => {
    try { window.postMessage({ source: 'yt-ar-main', type }, location.origin); } catch (e) {}
  };

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

  const UNBLOCK_DELAY_MS = 1000;
  let unblockTimer = null;
  let skipUnblockDelay = false;

  try {
    if (sessionStorage.getItem('yt-ar-reloaded') === '1') {
      sessionStorage.removeItem('yt-ar-reloaded');
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
    if (el) el.classList.add('yt-ar-blocked');
  };

  const unblock = () => {
    const el = document.documentElement;
    if (el) el.classList.remove('yt-ar-blocked');
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  };

  if (isWatchPage()) block();

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (e.data && e.data.source === 'yt-ar-content' && e.data.type === 'show-overlay') {
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

    const tryUnblock = () => {
      unblock();
    };

    const scheduleUnblock = () => {
      if (unblockTimer !== null) return;
      const delay = skipUnblockDelay ? 0 : UNBLOCK_DELAY_MS;
      unblockTimer = setTimeout(() => {
        unblockTimer = null;
        tryUnblock();
      }, delay);
    };

    try {
      player.addEventListener('onError', () => {
        block();
        SIGNAL('player-error');
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
    SIGNAL('navigated');
    if (isWatchPage()) {
      block();
      hookPlayer();
    } else {
      cancelUnblockTimer();
      unblock();
    }
  };

  const origPushState = history.pushState;
  history.pushState = function () {
    const result = origPushState.apply(this, arguments);
    onNavigate();
    return result;
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function () {
    const result = origReplaceState.apply(this, arguments);
    onNavigate();
    return result;
  };
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
              SIGNAL('player-400');
            }
          } catch (e) {}
        }).catch(() => {});
      } catch (e) {}
      return promise;
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__yt_ar_url = url; } catch (e) {}
    return origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    try {
      this.addEventListener('load', () => {
        try {
          const url = this.__yt_ar_url || '';
          if (url.indexOf('/youtubei/v1/player') !== -1 && this.status === 400 && isWatchPage()) {
            block();
            SIGNAL('player-400');
          }
        } catch (e) {}
      });
    } catch (e) {}
    return origSend.apply(this, arguments);
  };
})();
