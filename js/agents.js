/* ════════════════════════════════════════════════════════════════════════
   RED SUN COMMAND — Agents Panel  (js/agents.js)
   Renders agent dots in sidebar + agent detail tooltips.
   ════════════════════════════════════════════════════════════════════════ */

const AgentsPanel = (function () {

  function render(data) {
    const container = document.getElementById('sidebar-agents');
    if (!container) return;
    container.innerHTML = '';

    const agents = data.agents || {};
    for (const [name, agent] of Object.entries(agents)) {
      const dot = document.createElement('div');
      dot.className = 'agent-dot';
      dot.setAttribute('data-status', agent.status || 'offline');
      dot.title = name;

      const tooltip = document.createElement('div');
      tooltip.className = 'agent-tooltip';

      const tasks = DashData.getAgentTasks(data, name);
      const activeTasks = tasks.filter(t => t.status === 'active').length;
      const lastActive = agent.lastActive ? Renderer.timeAgo(agent.lastActive) : 'unknown';

      tooltip.innerHTML =
        `<strong>${esc(name)}</strong><br>` +
        `<span style="color:var(--text-muted)">${esc(agent.role || '—')}</span><br>` +
        `Status: <span style="color:${statusColor(agent.status)}">${agent.status || 'offline'}</span><br>` +
        `Last active: ${lastActive}<br>` +
        `Tasks: ${tasks.length} total, ${activeTasks} active`;

      if (agent.currentTask) {
        tooltip.innerHTML += `<br>Working on: ${esc(agent.currentTask)}`;
      }

      dot.appendChild(tooltip);
      container.appendChild(dot);
    }
  }

  function statusColor(status) {
    return ({
      active: 'var(--status-active)',
      offline: 'var(--text-muted)',
      blocked: 'var(--status-review)'
    })[status] || 'var(--text-muted)';
  }

  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  return { render };
})();

window.AgentsPanel = AgentsPanel;
