(() => {
  const post = (data) => window.postMessage(
    Object.assign({ type: 'yt-autorefresh-result' }, data),
    location.origin
  );

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const captureState = (label) => {
    const player = document.getElementById('movie_player');
    if (!player) return { label, hasPlayer: false };

    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    const errorEl = document.querySelector('.ytp-error');
    const video = document.querySelector('video.html5-main-video');

    return {
      label,
      playerState: typeof player.getPlayerState === 'function' ? player.getPlayerState() : null,
      currentTime: typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : null,
      videoId: typeof player.getVideoData === 'function' ? (player.getVideoData() || {}).video_id : null,
      errorVisible: !!(reason && (reason.textContent || '').trim()),
      errorDisplay: errorEl ? getComputedStyle(errorEl).display : null,
      videoPaused: video ? video.paused : null,
      videoReadyState: video ? video.readyState : null,
      videoError: video && video.error ? { code: video.error.code, message: video.error.message } : null
    };
  };

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data || e.data.type !== 'yt-autorefresh-reload') return;

    const player = document.getElementById('movie_player');
    if (!player || typeof player.loadVideoById !== 'function') {
      post({ success: false, reason: 'no-player-api', fallback: 'page-reload' });
      location.reload();
      return;
    }

    const stateBefore = captureState('before');

    try {
      if (typeof player.stopVideo === 'function') {
        player.stopVideo();
      }
      await delay(200);
      const stateAfterStop = captureState('afterStop');

      const data = typeof player.getVideoData === 'function' ? player.getVideoData() : {};
      const videoId = (data && data.video_id) || e.data.videoId;
      player.loadVideoById({ videoId, startSeconds: 0 });

      await delay(500);
      const stateAfterLoad500 = captureState('afterLoad+500ms');

      await delay(2000);
      const stateAfterLoad2500 = captureState('afterLoad+2500ms');

      post({
        success: true,
        videoId,
        stateBefore,
        stateAfterStop,
        stateAfterLoad500,
        stateAfterLoad2500
      });
    } catch (err) {
      post({ success: false, reason: String(err), stateBefore });
    }
  });
})();
