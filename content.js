(() => {
  const MAX_REFRESH = 3;

  const getVideoId = () => new URLSearchParams(location.search).get('v');

  const isShown = (el) => {
    let current = el;
    while (current && current.nodeType === 1) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      current = current.parentElement;
    }
    return true;
  };

  const check = () => {
    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    if (!reason) return;

    const text = (reason.textContent || '').trim();
    if (!text) return;

    if (!isShown(reason)) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) return;

    sessionStorage.setItem(key, String(count + 1));
    location.reload();
  };

  new MutationObserver(check).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  check();
})();
