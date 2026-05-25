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

  const antiAdblockSelectors = [
    'ytd-enforcement-message-view-model',
    'ytd-popup-container ytd-modal-with-title-and-button-renderer',
    'tp-yt-paper-dialog[role="dialog"]'
  ];

  const antiAdblockKeywords = ['ad block', 'adblock', 'adblocker', 'bloqueur de pub', 'bloqueur'];

  const isAntiAdblockElement = (el) => {
    const text = (el.textContent || '').toLowerCase();
    return antiAdblockKeywords.some((kw) => text.includes(kw));
  };

  const antiAdblockPresent = () => {
    for (const sel of antiAdblockSelectors) {
      const matches = document.querySelectorAll(sel);
      for (const el of matches) {
        if (isAntiAdblockElement(el)) return true;
      }
    }
    return false;
  };

  const dismissAntiAdblock = () => {
    for (const sel of antiAdblockSelectors) {
      const matches = document.querySelectorAll(sel);
      matches.forEach((el) => {
        if (isAntiAdblockElement(el)) {
          try { el.remove(); } catch (e) {}
        }
      });
    }
  };

  let originalRate = null;
  let weMuted = false;

  const skipSelectors = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-modernized',
    '.ytp-ad-skip-button-clean',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
    '.ytp-ad-overlay-skip-button',
    '.ytp-ad-overlay-close-button',
    '.ytp-image-companion-ad button',
    '.ytp-action-companion-display button'
  ];

  const isElementVisible = (el) => {
    if (!el) return false;
    if (el.offsetParent === null) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const clickAnySkipButton = () => {
    for (const sel of skipSelectors) {
      const matches = document.querySelectorAll(sel);
      for (const btn of matches) {
        if (isElementVisible(btn)) {
          try { btn.click(); return true; } catch (e) {}
        }
      }
    }

    const playerEl = document.querySelector('.html5-video-player, #movie_player');
    if (playerEl) {
      const candidates = playerEl.querySelectorAll('button, [role="button"]');
      for (const btn of candidates) {
        const label = (btn.getAttribute('aria-label') || '').trim();
        const text = (btn.textContent || '').trim();
        if (!isElementVisible(btn)) continue;
        if (/^skip(\s|$)/i.test(label) || /^skip(\s|$)/i.test(text)) {
          try { btn.click(); return true; } catch (e) {}
        }
      }
    }

    return false;
  };

  const handleAdState = () => {
    const playerEl = document.querySelector('.html5-video-player');
    const video = document.querySelector('video.html5-main-video');
    if (!playerEl || !video) return;

    clickAnySkipButton();

    const adShowing = playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting');

    if (adShowing) {
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

  const forcePlay = () => {
    const video = document.querySelector('video.html5-main-video');
    if (!video) return;
    if (video.paused && antiAdblockPresent() && video.readyState >= 2) {
      try { video.play().catch(() => {}); } catch (e) {}
    }
  };

  let lastVideoTime = 0;
  let lastStuckCheck = 0;

  const unstickVideo = () => {
    const video = document.querySelector('video.html5-main-video');
    const playerEl = document.querySelector('.html5-video-player');
    if (!video || !playerEl) return;

    if (playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting')) {
      lastVideoTime = video.currentTime;
      lastStuckCheck = Date.now();
      return;
    }

    if (antiAdblockPresent()) {
      lastVideoTime = video.currentTime;
      lastStuckCheck = Date.now();
      return;
    }

    if (video.paused || video.readyState < 3) {
      lastVideoTime = video.currentTime;
      lastStuckCheck = Date.now();
      return;
    }

    const now = Date.now();
    const elapsed = now - lastStuckCheck;
    if (elapsed < 600) return;

    const advance = Math.abs(video.currentTime - lastVideoTime);
    if (advance < 0.05) {
      try { video.currentTime = video.currentTime + 0.5; } catch (e) {}
    }

    lastVideoTime = video.currentTime;
    lastStuckCheck = now;
  };

  let pausePatched = false;
  const patchPause = () => {
    if (pausePatched) return;
    const video = document.querySelector('video.html5-main-video');
    if (!video) return;
    const origPause = video.pause.bind(video);
    video.pause = function () {
      if (antiAdblockPresent()) return;
      return origPause();
    };
    pausePatched = true;
  };

  const handle = () => {
    dismissAntiAdblock();
    handleAdState();
    patchPause();
    forcePlay();
    unstickVideo();
  };

  const start = () => {
    const observer = new MutationObserver(handle);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    setInterval(handle, 250);
    handle();
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
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
