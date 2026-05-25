(() => {
  const TAG = '[YT-AutoRefresh]';
  const MAX_REFRESH = 3;
  const RELOAD_COOLDOWN_MS = 20000;
  const LOG_FLUSH_INTERVAL_MS = 30000;

  let reloadTriggered = false;
  const logBuffer = [];

  const log = (msg, data) => {
    const line = data !== undefined
      ? `${new Date().toISOString()} ${msg} ${JSON.stringify(data)}`
      : `${new Date().toISOString()} ${msg}`;
    console.log(TAG, msg, data === undefined ? '' : data);
    logBuffer.push(line);
  };

  const flushLogs = async () => {
    const text = logBuffer.length > 0 ? logBuffer.join('\n') + '\n' : '';
    logBuffer.length = 0;
    try {
      await chrome.runtime.sendMessage({ type: 'append-and-write', text });
    } catch (e) {}
  };

  setInterval(flushLogs, LOG_FLUSH_INTERVAL_MS);
  window.addEventListener('beforeunload', () => { flushLogs(); });

  log('content script loaded', { url: location.href });

  const getVideoId = () => new URLSearchParams(location.search).get('v');

  const errorVisible = () => {
    const reason = document.querySelector('.ytp-error-content-wrap-reason');
    if (!reason) return false;
    const text = (reason.textContent || '').trim();
    if (!text) return false;
    const overlay = reason.closest('.ytp-error');
    if (overlay && getComputedStyle(overlay).display === 'none') return false;
    return true;
  };

  const extractJsonObject = (text, marker) => {
    const idx = text.indexOf(marker);
    if (idx === -1) return null;
    const start = text.indexOf('{', idx);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return text.substring(start, i + 1);
      }
    }
    return null;
  };

  const fetchFreshPlayerResponse = async (videoId) => {
    const url = `/watch?v=${encodeURIComponent(videoId)}`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      log('prefetch failed', { status: response.status, statusText: response.statusText });
      return null;
    }
    const html = await response.text();
    const jsonStr = extractJsonObject(html, 'ytInitialPlayerResponse');
    if (!jsonStr) { log('prefetch: no ytInitialPlayerResponse marker found'); return null; }
    try {
      const parsed = JSON.parse(jsonStr);
      const status = parsed.playabilityStatus && parsed.playabilityStatus.status;
      log('prefetch ok', { status, hasStreaming: !!parsed.streamingData });
      return parsed;
    } catch (e) {
      log('prefetch parse failed', { error: String(e) });
      return null;
    }
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (!e.data) return;
    if (e.data.type === 'yt-autorefresh-strategy') {
      log('strategy', e.data);
    } else if (e.data.type === 'yt-autorefresh-success') {
      log('reload succeeded', e.data);
      flushLogs();
    } else if (e.data.type === 'yt-autorefresh-all-failed') {
      log('all strategies failed, page reload', e.data);
      flushLogs().finally(() => location.reload());
    }
  });

  const check = async () => {
    if (reloadTriggered) return;
    if (!errorVisible()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const key = 'yt-refresh-' + videoId;
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= MAX_REFRESH) {
      log('skip: max reached', { videoId, count });
      flushLogs();
      return;
    }

    reloadTriggered = true;
    sessionStorage.setItem(key, String(count + 1));
    log('error detected', { videoId, attempt: count + 1 });
    await flushLogs();

    let freshConfig = null;
    try {
      freshConfig = await fetchFreshPlayerResponse(videoId);
    } catch (e) {
      log('prefetch threw', { error: String(e) });
    }

    try {
      const res = await chrome.runtime.sendMessage({ type: 'flush-yt-data' });
      log('storage flush', res);
    } catch (e) {
      log('storage flush failed', { error: String(e) });
    }

    window.postMessage({
      type: 'yt-autorefresh-reload',
      videoId,
      freshConfig
    }, location.origin);
    setTimeout(() => { reloadTriggered = false; }, RELOAD_COOLDOWN_MS);
  };

  new MutationObserver(check).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  check();
})();
