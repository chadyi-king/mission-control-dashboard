(() => {
  'use strict';

  const BRIDGE_BUILD_ID = '20260622-root-rebuild-5';
  const params = new URLSearchParams(window.location.search);
  const requestedApi = params.get('hermesApi') || params.get('hermes') || '';
  const isLocalPage = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  function normalizeApiBase(value) {
    const raw = String(value || '').trim();
    if (!raw && isLocalPage) return 'http://127.0.0.1:8000';
    if (!raw || ['0', 'false', 'off', 'none'].includes(raw.toLowerCase())) return '';
    if (['1', 'true', 'local', 'auto'].includes(raw.toLowerCase())) return 'http://127.0.0.1:8000';
    return raw.replace(/\/+$/, '').replace(/\/api\/sync$/i, '');
  }

  const apiBase = normalizeApiBase(requestedApi);
  const bridge = {
    buildId: BRIDGE_BUILD_ID,
    enabled: Boolean(apiBase),
    apiBase,
    lastSource: 'public-snapshot',
    lastError: '',
    postIntent
  };
  window.__MISSION_CONTROL_HERMES__ = bridge;

  if (!apiBase) return;

  const originalFetch = window.fetch.bind(window);

  function timeoutSignal(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
  }

  async function fetchHermesSnapshot() {
    const timer = timeoutSignal(1400);
    try {
      const url = `${apiBase}/api/sync?source=mission-control-dashboard&build=${encodeURIComponent(BRIDGE_BUILD_ID)}&t=${Date.now()}`;
      const response = await originalFetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache'
        },
        signal: timer.signal
      });
      if (!response.ok) throw new Error(`Hermes API returned HTTP ${response.status}`);
      const text = await response.text();
      JSON.parse(text);
      bridge.lastSource = 'hermes-api';
      bridge.lastError = '';
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Mission-Control-Source': 'hermes-api'
        }
      });
    } catch (error) {
      bridge.lastSource = 'public-snapshot';
      bridge.lastError = error?.message || String(error);
      return null;
    } finally {
      timer.clear();
    }
  }

  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const isDashboardSnapshot = url.pathname.endsWith('/data.json') || url.pathname.endsWith('data.json');
    if (isDashboardSnapshot) {
      const hermesResponse = await fetchHermesSnapshot();
      if (hermesResponse) return hermesResponse;
    }
    return originalFetch(input, init);
  };

  async function postIntent(type, payload) {
    if (!apiBase) return false;
    const timer = timeoutSignal(1200);
    try {
      const response = await originalFetch(`${apiBase}/api/dashboard-intents`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          type,
          payload,
          source: 'mission-control-dashboard',
          buildId: BRIDGE_BUILD_ID,
          createdAt: new Date().toISOString()
        }),
        signal: timer.signal
      });
      if (!response.ok) throw new Error(`Hermes intent returned HTTP ${response.status}`);
      bridge.lastError = '';
      return true;
    } catch (error) {
      bridge.lastError = error?.message || String(error);
      return false;
    } finally {
      timer.clear();
    }
  }

  function readFocusOrder() {
    return Array.from(document.querySelectorAll('#focus-list [data-task-id]')).map((element) => element.dataset.taskId).filter(Boolean);
  }

  function readBoardState() {
    const agentId = document.getElementById('agent-board-select')?.value || '';
    const lanes = {};
    document.querySelectorAll('#agent-board .kanban-col').forEach((column) => {
      const lane = column.dataset.lane;
      if (!lane) return;
      lanes[lane] = Array.from(column.querySelectorAll('[data-task-id]')).map((element) => element.dataset.taskId).filter(Boolean);
    });
    return { agentId, lanes };
  }

  document.addEventListener('drop', (event) => {
    window.setTimeout(() => {
      if (event.target.closest('#focus-list')) {
        postIntent('priority_queue_reorder', { order: readFocusOrder() });
        return;
      }
      if (event.target.closest('#agent-board')) {
        postIntent('agent_board_move', readBoardState());
      }
    }, 0);
  }, true);
})();
