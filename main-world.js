(() => {
  const SIGNAL = (type) => {
    try { window.postMessage({ source: 'yt-ar-main', type }, location.origin); } catch (e) {}
  };

  const isWatchPage = () =>
    location.pathname === '/watch' && !!new URLSearchParams(location.search).get('v');

  const markError = () => {
    const player = document.getElementById('movie_player');
    if (player) player.classList.add('yt-ar-error');
  };

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
        markError();
        SIGNAL('player-error');
      });
      player.__yt_ar_hooked = true;
    } catch (e) {
      hookRetryId = setTimeout(hookPlayer, 1000);
    }
  };
  hookPlayer();

  const onNavigate = () => {
    if (isWatchPage()) hookPlayer();
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
              markError();
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
            markError();
            SIGNAL('player-400');
          }
        } catch (e) {}
      });
    } catch (e) {}
    return origSend.apply(this, arguments);
  };
})();
