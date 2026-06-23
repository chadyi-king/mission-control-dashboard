(() => {
  'use strict';

  const DATA_SOURCE_BUILD_ID = '20260624-github-api-data-2';
  const API_URL = 'https://api.github.com/repos/chadyi-king/mission-control-dashboard/contents/data.json?ref=main';
  const originalFetch = window.fetch.bind(window);

  function isDashboardDataRequest(input) {
    try {
      const raw = typeof input === 'string' ? input : input.url;
      const url = new URL(raw, window.location.href);
      return url.pathname.endsWith('/data.json') || url.pathname.endsWith('data.json');
    } catch {
      return false;
    }
  }

  function decodeBase64Utf8(content) {
    const compact = String(content || '').replace(/\s/g, '');
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function fetchGitHubData() {
    const url = new URL(API_URL);
    url.searchParams.set('t', String(Date.now()));

    // Keep this as a simple browser CORS request. Custom request headers such as
    // Cache-Control trigger preflight and can make api.github.com fail as
    // "Failed to fetch" in browsers, which silently falls back to stale Pages data.
    const response = await originalFetch(url.toString(), {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' }
    });

    if (!response.ok) throw new Error(`GitHub data API returned HTTP ${response.status}`);
    const payload = await response.json();
    const text = decodeBase64Utf8(payload.content);
    JSON.parse(text);
    window.__MISSION_CONTROL_DATA_SOURCE__ = {
      buildId: DATA_SOURCE_BUILD_ID,
      mode: 'github-api-main',
      sha: payload.sha || '',
      updatedAt: new Date().toISOString(),
      lastError: ''
    };
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Mission-Control-Data-Source': 'github-api-main',
        'X-Mission-Control-Data-Sha': payload.sha || ''
      }
    });
  }

  window.__MISSION_CONTROL_DATA_SOURCE__ = {
    buildId: DATA_SOURCE_BUILD_ID,
    mode: 'initializing',
    sha: '',
    updatedAt: '',
    lastError: ''
  };

  window.fetch = async (input, init) => {
    if (isDashboardDataRequest(input)) {
      try {
        return await fetchGitHubData();
      } catch (error) {
        window.__MISSION_CONTROL_DATA_SOURCE__ = {
          buildId: DATA_SOURCE_BUILD_ID,
          mode: 'pages-fallback',
          sha: '',
          updatedAt: new Date().toISOString(),
          lastError: error?.message || String(error)
        };
        console.warn('[Mission Control] GitHub API data source failed; falling back to Pages data.json', error);
        return originalFetch(input, { ...init, cache: 'no-store' });
      }
    }
    return originalFetch(input, init);
  };
})();
