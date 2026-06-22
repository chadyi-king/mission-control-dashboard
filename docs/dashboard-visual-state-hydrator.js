(() => {
  'use strict';

  const BUILD_ID = '20260623-backend-contract-1';
  const DATA_FILE = 'data.json';
  let visualState = null;
  let applying = false;

  function dataUrl() {
    const url = new URL(DATA_FILE, window.location.href);
    url.searchParams.set('build', BUILD_ID);
    url.searchParams.set('t', String(Date.now()));
    return url.toString();
  }

  function escapeSelector(value) {
    const raw = String(value || '');
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(raw);
    return raw.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  async function loadVisualState() {
    try {
      const response = await fetch(dataUrl(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.visualWorkflowState || null;
    } catch (error) {
      console.warn('[Mission Control] visual workflow state unavailable', error);
      return null;
    }
  }

  function taskIdOf(element) {
    return element?.dataset?.taskId || '';
  }

  function applyFocusOrder() {
    const order = Array.isArray(visualState?.priorityQueueOrder) ? visualState.priorityQueueOrder : [];
    if (!order.length) return;
    const list = document.getElementById('focus-list');
    if (!list) return;

    const byId = new Map(Array.from(list.querySelectorAll('[data-task-id]')).map((element) => [taskIdOf(element), element]));
    const ordered = order.map((taskId) => byId.get(taskId)).filter(Boolean);
    if (!ordered.length) return;

    const remaining = Array.from(list.children).filter((element) => !ordered.includes(element));
    [...ordered, ...remaining].forEach((element) => list.appendChild(element));
  }

  function applyAgentBoard() {
    const select = document.getElementById('agent-board-select');
    const agentId = select?.value || '';
    const board = agentId ? visualState?.agentBoards?.[agentId] : null;
    const lanes = board?.lanes || null;
    if (!lanes || typeof lanes !== 'object') return;

    Object.entries(lanes).forEach(([lane, taskIds]) => {
      if (!Array.isArray(taskIds)) return;
      const column = document.querySelector(`#agent-board .kanban-col[data-lane="${escapeSelector(lane)}"]`);
      if (!column) return;
      taskIds.forEach((taskId) => {
        const card = document.querySelector(`#agent-board [data-task-id="${escapeSelector(taskId)}"]`);
        if (card) column.appendChild(card);
      });
    });
  }

  function applyVisualState() {
    if (!visualState || applying) return;
    applying = true;
    try {
      applyFocusOrder();
      applyAgentBoard();
    } finally {
      applying = false;
    }
  }

  async function boot() {
    visualState = await loadVisualState();
    applyVisualState();

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(applyVisualState);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('change', (event) => {
      if (event.target && event.target.id === 'agent-board-select') {
        window.requestAnimationFrame(applyVisualState);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
