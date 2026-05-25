(() => {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const post = (type, data) => window.postMessage(
    Object.assign({ type }, data || {}),
    location.origin
  );

  const errorVisible = () => {
    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    if (!reason) return false;
    const text = (reason.textContent || '').trim();
    if (!text) return false;
    const overlay = reason.closest('.ytp-error');
    if (overlay && getComputedStyle(overlay).display === 'none') return false;
    return true;
  };

  const getPlayer = () => document.getElementById('movie_player');
  const getVideoId = () => new URLSearchParams(location.search).get('v');

  const playerState = () => {
    const p = getPlayer();
    if (!p) return null;
    return {
      state: typeof p.getPlayerState === 'function' ? p.getPlayerState() : null,
      readyState: (document.querySelector('video.html5-main-video') || {}).readyState
    };
  };

  const monitorTransitions = async (durationMs, intervalMs) => {
    const start = Date.now();
    let last = errorVisible();
    const transitions = [{ t: 0, errorVisible: last, state: playerState() }];
    while (Date.now() - start < durationMs) {
      await delay(intervalMs);
      const current = errorVisible();
      if (current !== last) {
        transitions.push({ t: Date.now() - start, errorVisible: current, state: playerState() });
        last = current;
      }
    }
    return { transitions, finalErrorVisible: last };
  };

  const strategies = [
    {
      name: 'yt-navigate',
      run: () => {
        const videoId = getVideoId();
        const detail = { endpoint: { watchEndpoint: { videoId } } };
        document.dispatchEvent(new CustomEvent('yt-navigate', { detail, bubbles: true, composed: true }));
      }
    },
    {
      name: 'stopVideo+loadVideoByUrl',
      run: () => {
        const player = getPlayer();
        const videoId = getVideoId();
        if (typeof player.stopVideo === 'function') player.stopVideo();
        if (typeof player.loadVideoByUrl === 'function') {
          player.loadVideoByUrl({
            mediaContentUrl: `https://www.youtube.com/v/${videoId}`,
            startSeconds: 0
          });
        }
      }
    },
    {
      name: 'stopVideo+cueVideoById+playVideo',
      run: async () => {
        const player = getPlayer();
        const videoId = getVideoId();
        if (typeof player.stopVideo === 'function') player.stopVideo();
        await delay(200);
        if (typeof player.cueVideoById === 'function') player.cueVideoById(videoId);
        await delay(300);
        if (typeof player.playVideo === 'function') player.playVideo();
      }
    },
    {
      name: 'stopVideo+longWait+playVideo',
      run: async () => {
        const player = getPlayer();
        if (typeof player.stopVideo === 'function') player.stopVideo();
        await delay(3000);
        if (typeof player.playVideo === 'function') player.playVideo();
      }
    }
  ];

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data || e.data.type !== 'yt-autorefresh-reload') return;

    const player = getPlayer();
    if (!player) {
      post('yt-autorefresh-all-failed', { reason: 'no-player' });
      return;
    }

    for (const s of strategies) {
      post('yt-autorefresh-strategy', { name: s.name, phase: 'try', stateBefore: playerState() });
      try {
        await s.run();
      } catch (err) {
        post('yt-autorefresh-strategy', { name: s.name, phase: 'threw', error: String(err) });
        continue;
      }
      const monitor = await monitorTransitions(3000, 200);
      post('yt-autorefresh-strategy', {
        name: s.name,
        phase: 'result',
        transitions: monitor.transitions,
        finalErrorVisible: monitor.finalErrorVisible
      });
      if (!monitor.finalErrorVisible) {
        post('yt-autorefresh-success', { strategy: s.name });
        return;
      }
    }

    post('yt-autorefresh-all-failed', { reason: 'all-strategies-failed' });
  });
})();
