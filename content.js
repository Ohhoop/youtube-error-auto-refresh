(() => {
  const MAX_REFRESH = 3;

  const getVideoId = () => new URLSearchParams(location.search).get('v');

  const isVisible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const check = () => {
    const errorEl = document.querySelector('.ytp-error');
    if (!isVisible(errorEl)) return;

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
    subtree: true
  });

  check();
})();
