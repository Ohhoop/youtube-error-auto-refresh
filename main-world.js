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

  let originalRate = null;
  let weMuted = false;

  const handleAdState = () => {
    const playerEl = document.querySelector('.html5-video-player');
    const video = document.querySelector('video.html5-main-video');
    if (!playerEl || !video) return;

    const adShowing = playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting');

    if (adShowing) {
      const skipBtn = document.querySelector(
        '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button'
      );
      if (skipBtn) {
        try { skipBtn.click(); } catch (e) {}
      }

      if (!isNaN(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.5) {
        try { video.currentTime = video.duration - 0.05; } catch (e) {}
      }

      if (originalRate === null) originalRate = video.playbackRate || 1;
      try { video.playbackRate = 16; } catch (e) {}

      if (!video.muted) {
        try {
          video.muted = true;
          weMuted = true;
        } catch (e) {}
      }
    } else {
      if (originalRate !== null) {
        try { video.playbackRate = originalRate; } catch (e) {}
        originalRate = null;
      }
      if (weMuted && video.muted) {
        try {
          video.muted = false;
          weMuted = false;
        } catch (e) {}
      }
    }
  };

  const startAdSkipper = () => {
    const observer = new MutationObserver(handleAdState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    setInterval(handleAdState, 250);
    handleAdState();
  };

  if (document.body) {
    startAdSkipper();
  } else {
    document.addEventListener('DOMContentLoaded', startAdSkipper);
  }

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

  const buildStrategies = (freshConfig) => [
    {
      name: 'inject-fresh-config+loadVideoByPlayerVars',
      available: () => !!freshConfig,
      run: () => {
        const player = getPlayer();
        const videoId = getVideoId();
        if (typeof player.loadVideoByPlayerVars === 'function') {
          player.loadVideoByPlayerVars({
            video_id: videoId,
            raw_player_response: freshConfig
          });
        } else {
          throw new Error('loadVideoByPlayerVars not available');
        }
      }
    },
    {
      name: 'inject-fresh-config+window+loadVideoById',
      available: () => !!freshConfig,
      run: () => {
        const player = getPlayer();
        const videoId = getVideoId();
        try { window.ytInitialPlayerResponse = freshConfig; } catch (e) {}
        if (typeof player.stopVideo === 'function') player.stopVideo();
        if (typeof player.loadVideoById === 'function') {
          player.loadVideoById({ videoId, startSeconds: 0 });
        }
      }
    },
    {
      name: 'stopVideo+loadVideoByUrl',
      available: () => true,
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

    const freshConfig = e.data.freshConfig || null;
    const strategies = buildStrategies(freshConfig);

    for (const s of strategies) {
      if (!s.available()) {
        post('yt-autorefresh-strategy', { name: s.name, phase: 'skipped' });
        continue;
      }
      post('yt-autorefresh-strategy', { name: s.name, phase: 'try', stateBefore: playerState() });
      try {
        await s.run();
      } catch (err) {
        post('yt-autorefresh-strategy', { name: s.name, phase: 'threw', error: String(err) });
        continue;
      }
      const monitor = await monitorTransitions(3500, 200);
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
