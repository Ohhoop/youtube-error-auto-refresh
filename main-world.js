(() => {
  try {
    Object.defineProperty(Event.prototype, 'isTrusted', {
      configurable: true,
      enumerable: true,
      get() { return true; }
    });
  } catch (e) {}

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

  const seenButtonHtml = new Set();
  let prevAdShowing = false;

  const dumpSkipCandidates = () => {
    const playerEl = document.querySelector('.html5-video-player');
    if (!playerEl) return;
    const adShowing = playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting');

    if (!adShowing && prevAdShowing) {
      seenButtonHtml.clear();
    }
    prevAdShowing = adShowing;
    if (!adShowing) return;

    const playerRect = playerEl.getBoundingClientRect();
    const allClickable = document.querySelectorAll('button, a, [role="button"], [tabindex="0"], [onclick]');
    const newCandidates = [];

    for (const el of allClickable) {
      if (!isElementVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.right < playerRect.left || rect.left > playerRect.right) continue;
      if (rect.bottom < playerRect.top || rect.top > playerRect.bottom) continue;

      const html = el.outerHTML.substring(0, 400);
      if (seenButtonHtml.has(html)) continue;
      seenButtonHtml.add(html);

      newCandidates.push({
        tag: el.tagName,
        label: (el.getAttribute('aria-label') || '').substring(0, 60),
        title: (el.getAttribute('title') || '').substring(0, 60),
        text: (el.textContent || '').trim().substring(0, 60),
        pos: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        html
      });
    }

    if (newCandidates.length > 0) {
      window.postMessage({ type: 'yt-autorefresh-skip-debug', count: newCandidates.length, candidates: newCandidates }, location.origin);
    }
  };

  const realisticClick = (el) => {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = (down) => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: down ? 1 : 0,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y
    });
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', Object.assign(opts(true), { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
      el.dispatchEvent(new MouseEvent('mousedown', opts(true)));
      el.dispatchEvent(new PointerEvent('pointerup', Object.assign(opts(false), { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
      el.dispatchEvent(new MouseEvent('mouseup', opts(false)));
      el.dispatchEvent(new MouseEvent('click', opts(false)));
    } catch (e) {}
    try { el.click(); } catch (e) {}
  };

  const extraSkipSelectors = [
    '[id^="skip-button"]',
    '[id^="skip-button:"]',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button'
  ];

  let lastSkipClickAt = 0;
  const SKIP_CLICK_COOLDOWN_MS = 800;

  const clickAnySkipButton = () => {
    const now = Date.now();
    if (now - lastSkipClickAt < SKIP_CLICK_COOLDOWN_MS) return false;

    const allSelectors = skipSelectors.concat(extraSkipSelectors);
    for (const sel of allSelectors) {
      let matches;
      try { matches = document.querySelectorAll(sel); } catch (e) { continue; }
      if (matches.length === 0) continue;
      const btn = matches[0];
      lastSkipClickAt = now;
      realisticClick(btn);
      return true;
    }

    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const btn of candidates) {
      if (!isElementVisible(btn)) continue;
      const label = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
      const text = (btn.textContent || '').trim().toLowerCase();
      if (label === 'skip' || text === 'skip' || label.startsWith('skip ad') || text.startsWith('skip ad') || label.startsWith('skip ')) {
        lastSkipClickAt = now;
        realisticClick(btn);
        return true;
      }
    }

    return false;
  };

  const injectAdHidingCSS = () => {
    if (document.querySelector('style[data-yt-autorefresh-styles]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-yt-autorefresh-styles', '');
    style.textContent = `
      .ytp-video-interstitial-buttoned-centered-layout,
      .ytp-ad-overlay-image,
      .ytp-ad-image-overlay,
      .ytp-ad-player-overlay-layout,
      .ytp-ad-player-overlay {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
      video.html5-main-video.yt-ar-ad-hide {
        visibility: hidden !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  const dismissPostAdInterstitial = () => {
    injectAdHidingCSS();
    const interstitial = document.querySelector(
      '.ytp-video-interstitial-buttoned-centered-layout, .video-ads.ytp-ad-module > div'
    );
    if (!interstitial) return false;
    try { interstitial.remove(); } catch (e) {}
    const video = document.querySelector('video.html5-main-video');
    if (video && video.paused && video.readyState >= 2) {
      try { video.play().catch(() => {}); } catch (e) {}
    }
    return true;
  };

  let interstitialFirstSeenAt = 0;
  let lastInterstitialReloadAt = 0;
  const INTERSTITIAL_STUCK_MS = 1500;
  const INTERSTITIAL_RELOAD_COOLDOWN_MS = 5000;

  const handlePostAdInterstitial = () => {
    const playerEl = document.querySelector('.html5-video-player');
    const video = document.querySelector('video.html5-main-video');
    if (!playerEl || !video) return;

    const adShowing = playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting');
    if (adShowing) {
      interstitialFirstSeenAt = 0;
      return;
    }

    const interstitial = document.querySelector('.ytp-video-interstitial-buttoned-centered-layout');
    if (!interstitial) {
      interstitialFirstSeenAt = 0;
      return;
    }

    const now = Date.now();
    if (interstitialFirstSeenAt === 0) interstitialFirstSeenAt = now;

    try { interstitial.remove(); } catch (e) {}

    const player = getPlayer();
    if (player && typeof player.playVideo === 'function') {
      try { player.playVideo(); } catch (e) {}
    }
    if (video.paused && video.readyState >= 2) {
      try { video.play().catch(() => {}); } catch (e) {}
    }

    const stuckMs = now - interstitialFirstSeenAt;
    if (stuckMs > INTERSTITIAL_STUCK_MS && now - lastInterstitialReloadAt > INTERSTITIAL_RELOAD_COOLDOWN_MS) {
      lastInterstitialReloadAt = now;
      post('yt-autorefresh-need-reload', { reason: 'post-ad-interstitial-stuck', stuckMs });
    }
  };

  const AD_DURATION_MAX = 90;

  const isAdDuration = (video) => {
    return !isNaN(video.duration) && video.duration > 0 && video.duration < AD_DURATION_MAX;
  };

  const isContentDuration = (video) => {
    return !isNaN(video.duration) && video.duration >= AD_DURATION_MAX;
  };

  let lastForceEndAt = 0;
  const forceEndAd = (video) => {
    const now = Date.now();
    if (now - lastForceEndAt < 1000) {
      dismissPostAdInterstitial();
      return;
    }
    lastForceEndAt = now;
    dismissPostAdInterstitial();
    const player = getPlayer();
    if (player) {
      const methods = ['cancelAdvertisement', 'skipAd', 'skipAdvertisement'];
      for (const m of methods) {
        if (typeof player[m] === 'function') {
          try { player[m](); } catch (e) {}
        }
      }
    }
    if (isAdDuration(video)) {
      try { video.currentTime = video.duration; } catch (e) {}
      try { video.dispatchEvent(new Event('ended', { bubbles: true })); } catch (e) {}
    }
  };

  const handleAdState = () => {
    const playerEl = document.querySelector('.html5-video-player');
    const video = document.querySelector('video.html5-main-video');
    if (!playerEl || !video) return;

    clickAnySkipButton();

    const adShowing = playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting');
    const shouldFastForward = adShowing && !isContentDuration(video);

    if (shouldFastForward) {
      video.classList.add('yt-ar-ad-hide');

      if (isAdDuration(video)) {
        if (video.currentTime < video.duration - 0.5) {
          try { video.currentTime = video.duration - 0.05; } catch (e) {}
        } else {
          forceEndAd(video);
        }
      }

      if (originalRate === null) originalRate = video.playbackRate || 1;
      try { video.playbackRate = 16; } catch (e) {}

      if (video.paused && video.readyState >= 2) {
        try { video.play().catch(() => {}); } catch (e) {}
      }

      if (!video.muted) {
        try {
          video.muted = true;
          weMuted = true;
        } catch (e) {}
      }
    } else {
      video.classList.remove('yt-ar-ad-hide');
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

  let lastAdShowingForFlush = false;
  let flushedForVideoId = null;

  const detectContentStart = () => {
    const playerEl = document.querySelector('.html5-video-player');
    const video = document.querySelector('video.html5-main-video');
    if (!playerEl || !video) return;

    const adShowing = playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting');
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;

    const adJustEnded = lastAdShowingForFlush && !adShowing;
    const directPlay = !adShowing && !video.paused && video.currentTime > 0.5;

    if ((adJustEnded || directPlay) && flushedForVideoId !== videoId) {
      flushedForVideoId = videoId;
      window.postMessage({ type: 'yt-autorefresh-content-started' }, location.origin);
    }

    lastAdShowingForFlush = adShowing;
  };

  const handle = () => {
    dismissAntiAdblock();
    dumpSkipCandidates();
    handleAdState();
    handlePostAdInterstitial();
    patchPause();
    forcePlay();
    unstickVideo();
    detectContentStart();
  };

  const start = () => {
    injectAdHidingCSS();
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

  document.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (!target || !target.getBoundingClientRect) return;
    const playerEl = document.querySelector('.html5-video-player');
    if (!playerEl) return;
    const playerRect = playerEl.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (rect.left < playerRect.left - 50 || rect.right > playerRect.right + 50) return;
    if (rect.top < playerRect.top - 50 || rect.bottom > playerRect.bottom + 100) return;

    const chain = [];
    let el = target;
    for (let i = 0; i < 5 && el; i++) {
      chain.push({
        tag: el.tagName,
        cls: (typeof el.className === 'string' ? el.className : ((el.getAttribute && el.getAttribute('class')) || '')).substring(0, 150),
        id: el.id || '',
        label: (el.getAttribute && el.getAttribute('aria-label')) || '',
        text: (el.textContent || '').trim().substring(0, 60)
      });
      el = el.parentElement;
    }
    window.postMessage({
      type: 'yt-autorefresh-click-debug',
      targetHtml: target.outerHTML.substring(0, 600),
      chain
    }, location.origin);
  }, true);

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
