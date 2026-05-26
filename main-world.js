(() => {
  const SIGNAL = (type) => {
    try { window.postMessage({ source: 'yt-ar-main', type }, location.origin); } catch (e) {}
  };

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      const promise = origFetch.apply(this, arguments);
      try {
        promise.then((response) => {
          try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('/youtubei/v1/player') !== -1 && response.status === 400) {
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
          if (url.indexOf('/youtubei/v1/player') !== -1 && this.status === 400) {
            SIGNAL('player-400');
          }
        } catch (e) {}
      });
    } catch (e) {}
    return origSend.apply(this, arguments);
  };

  const hookPlayer = () => {
    const player = document.getElementById('movie_player');
    if (!player || typeof player.addEventListener !== 'function') {
      setTimeout(hookPlayer, 200);
      return;
    }
    try {
      player.addEventListener('onError', () => SIGNAL('player-error'));
    } catch (e) {
      setTimeout(hookPlayer, 1000);
    }
  };
  hookPlayer();
})();
