(() => {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data || e.data.type !== 'yt-autorefresh-reload') return;

    const player = document.getElementById('movie_player');
    if (!player || typeof player.loadVideoById !== 'function') {
      window.postMessage(
        { type: 'yt-autorefresh-result', success: false, reason: 'no-player-api', fallback: 'page-reload' },
        location.origin
      );
      location.reload();
      return;
    }

    try {
      const data = typeof player.getVideoData === 'function' ? player.getVideoData() : null;
      const videoId = (data && data.video_id) || e.data.videoId;
      const startSeconds = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
      player.loadVideoById({ videoId, startSeconds });
      window.postMessage(
        { type: 'yt-autorefresh-result', success: true, videoId, startSeconds },
        location.origin
      );
    } catch (err) {
      window.postMessage(
        { type: 'yt-autorefresh-result', success: false, reason: String(err), fallback: 'page-reload' },
        location.origin
      );
      location.reload();
    }
  });
})();
