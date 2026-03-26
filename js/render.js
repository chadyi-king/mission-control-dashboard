/* ════════════════════════════════════════════════════════════════════════
   RED SUN COMMAND — Render Engine  (js/render.js)
   Renders: stats bar, daily briefing, ops cards, focus tasks,
   system health, categories/projects, ticker, and recent wins.
   ════════════════════════════════════════════════════════════════════════ */

/* ── Helpers ─────────────────────────────────────────────────────────── */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'onclick') el.onclick = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k.startsWith('data-')) el.setAttribute(k, v);
      else el.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else if (c) el.appendChild(c);
  }
  return el;
}

function safeText(s) {
  if (s == null) return '';
  return String(s);
}

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

/* ── Stats Bar ───────────────────────────────────────────────────────── */
function renderStatsBar(data) {
  const el = document.getElementById('stats-bar');
  if (!el) return;
  el.innerHTML = '';

  const s = data.stats || {};
  const pct = s.totalTasks > 0 ? Math.round((s.completedTasks / s.totalTasks) * 100) : 0;
  const remaining = s.totalTasks - (s.completedTasks || 0);
  const overdue = DashData.getOverdueTasks(data).length;

  const cards = [
    { label: 'Total Tasks', value: s.totalTasks, detail: `${remaining} remaining` },
    { label: 'Completed', value: s.completedTasks, detail: `${pct}% done` },
    { label: 'Active', value: s.activeTasks, detail: `in progress` },
    { label: 'Blocked', value: s.blockedTasks, detail: overdue ? `${overdue} overdue` : 'none overdue' },
    { label: 'Urgent', value: s.urgentTasks, detail: 'critical + high' },
    { label: 'Backlog', value: s.backlogTasks, detail: 'queued' }
  ];

  for (const c of cards) {
    el.appendChild(
      h('div', { className: 'stat-card' },
        h('div', { className: 'stat-label' }, c.label),
        h('div', { className: 'stat-value' }, String(c.value || 0)),
        h('div', { className: 'stat-detail' }, h('span', null, c.detail))
      )
    );
  }
}

/* ── Daily Briefing ──────────────────────────────────────────────────── */
function renderBriefing(data) {
  const el = document.getElementById('daily-briefing');
  if (!el) return;
  el.innerHTML = '';

  const b = data.dailyBriefing || {};
  const hasContent = b.priorities?.length || b.blockers?.length || b.wins?.length;

  const header = h('div', { className: 'briefing-header' },
    h('span', { className: 'briefing-title' }, '◉ Daily Briefing'),
    h('span', { className: 'briefing-time' }, data.lastUpdated ? timeAgo(data.lastUpdated) : '—')
  );
  el.appendChild(header);

  if (!hasContent) {
    el.appendChild(h('div', { className: 'briefing-empty' }, 'No briefing data available. Helios will update on next sync.'));
    return;
  }

  const grid = h('div', { className: 'briefing-grid' });

  // Priorities
  if (b.priorities?.length) {
    const col = h('div', null);
    col.appendChild(h('div', { className: 'briefing-section-title' }, 'Today\'s Priorities'));
    for (const p of b.priorities) {
      col.appendChild(h('div', { className: 'briefing-item' },
        h('span', { className: 'dot', style: 'background:var(--crimson-bright)' }),
        h('span', null, safeText(p))
      ));
    }
    grid.appendChild(col);
  }

  // Blockers + Wins
  const col2 = h('div', null);
  if (b.blockers?.length) {
    col2.appendChild(h('div', { className: 'briefing-section-title' }, 'Blockers'));
    for (const bl of b.blockers) {
      col2.appendChild(h('div', { className: 'briefing-item' },
        h('span', { className: 'dot', style: 'background:var(--status-blocked)' }),
        h('span', null, safeText(bl))
      ));
    }
  }
  if (b.wins?.length) {
    col2.appendChild(h('div', { className: 'briefing-section-title', style: b.blockers?.length ? 'margin-top:12px' : '' }, 'Recent Wins'));
    for (const w of b.wins) {
      col2.appendChild(h('div', { className: 'briefing-item' },
        h('span', { className: 'dot', style: 'background:var(--status-done)' }),
        h('span', null, safeText(w))
      ));
    }
  }
  if (col2.children.length) grid.appendChild(col2);
  el.appendChild(grid);
}

/* ── Ops Cards (Needs Attention / Input / Active Work) ───────────────── */
function renderOpsCards(data) {
  const el = document.getElementById('ops-grid');
  if (!el) return;
  el.innerHTML = '';

  const sections = [
    { title: 'Needs Attention', items: (data.needsAttention || []).slice(0, 6), icon: '⚠' },
    { title: 'Input Required', items: (data.inputsNeeded || []).slice(0, 6), icon: '?' },
    { title: 'Active Work', items: DashData.getActiveTasks(data).slice(0, 6), icon: '▶' }
  ];

  for (const sec of sections) {
    const card = h('div', { className: 'ops-card' });
    card.appendChild(h('div', { className: 'ops-card-header' },
      h('span', { className: 'ops-card-title' }, sec.icon + ' ' + sec.title),
      h('span', { className: 'ops-card-count' }, String(sec.items.length))
    ));

    if (!sec.items.length) {
      card.appendChild(h('div', { className: 'ops-card-empty' }, 'All clear'));
    } else {
      const list = h('ul', { className: 'task-list' });
      for (const item of sec.items) {
        const task = typeof item === 'string'
          ? DashData.getTaskById(data, item) || { id: item, title: item, priority: 'medium', status: 'pending', project: '—' }
          : item;
        list.appendChild(buildTaskItem(task));
      }
      card.appendChild(list);
    }
    el.appendChild(card);
  }
}

/* ── Focus Tasks (top urgent/active) ─────────────────────────────────── */
function renderFocusTasks(data) {
  const el = document.getElementById('focus-tasks');
  if (!el) return;
  el.innerHTML = '';

  const urgent = DashData.getUrgentTasks(data);
  const active = DashData.getActiveTasks(data);
  const combined = [...urgent, ...active.filter(t => !urgent.find(u => u.id === t.id))].slice(0, 10);

  if (!combined.length) {
    el.appendChild(h('div', { className: 'ops-card-empty' }, 'No urgent or active tasks'));
    return;
  }

  const list = h('ul', { className: 'task-list' });
  combined.forEach((task, i) => {
    const item = buildTaskItem(task, i + 1);
    list.appendChild(item);
  });
  el.appendChild(list);
}

/* ── System Health ───────────────────────────────────────────────────── */
function renderSystemHealth(data) {
  const el = document.getElementById('system-health');
  if (!el) return;
  el.innerHTML = '';

  const agents = data.agents || {};
  const agentNames = Object.keys(agents);
  const activeCount = agentNames.filter(n => agents[n].status === 'active').length;
  const audit = data.audit || {};

  const items = [
    { label: 'Agents Online', value: `${activeCount}/${agentNames.length}`, status: activeCount === agentNames.length ? 'ok' : activeCount > 0 ? 'warn' : 'error' },
    { label: 'Data Integrity', value: audit.integrity || 'unknown', status: audit.integrity === 'ok' ? 'ok' : 'warn' },
    { label: 'Last Sync', value: timeAgo(data.lastUpdated), status: isRecent(data.lastUpdated, 30) ? 'ok' : 'warn' },
    { label: 'Updated By', value: data.updatedBy || '—', status: 'ok' }
  ];

  const grid = h('div', { className: 'health-grid' });
  for (const item of items) {
    grid.appendChild(h('div', { className: 'health-item' },
      h('span', { className: 'health-dot ' + item.status }),
      h('span', { className: 'health-label' }, item.label),
      h('span', { className: 'health-value' }, item.value)
    ));
  }
  el.appendChild(grid);
}

function isRecent(dateStr, minutes) {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr).getTime()) < minutes * 60 * 1000;
}

/* ── Categories & Projects ───────────────────────────────────────────── */
function renderCategories(data) {
  const el = document.getElementById('categories-section');
  if (!el) return;
  el.innerHTML = '';

  const cats = data.categories || {};
  const catOrder = ['A', 'B', 'C'];

  for (const catLetter of catOrder) {
    const catInfo = cats[catLetter];
    if (!catInfo) continue;

    const group = h('div', { className: 'category-group' });
    group.appendChild(h('div', { className: 'category-header' },
      h('span', null, catLetter + ' — ' + (catInfo.name || '')),
      h('span', { className: 'category-subtitle' }, catInfo.description || '')
    ));

    const projects = DashData.getCategoryProjects(data, catLetter);
    if (!projects.length) {
      group.appendChild(h('div', { className: 'ops-card-empty' }, 'No projects in this category'));
      el.appendChild(group);
      continue;
    }

    const grid = h('div', { className: 'projects-grid' });
    for (const proj of projects) {
      const tasks = DashData.getProjectTasks(data, proj.id);
      const done = tasks.filter(t => t.status === 'done').length;
      const total = tasks.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const blocked = tasks.filter(t => t.status === 'blocked').length;
      const details = (data.projectDetails || {})[proj.id] || {};

      const progressClass = pct === 100 ? 'complete' : blocked > 0 ? 'at-risk' : '';

      const card = h('div', { className: 'project-card', onclick: () => toggleProjectTasks(proj.id) });
      card.appendChild(h('div', { className: 'project-card-header' },
        h('span', { className: 'project-name' }, details.name || proj.name || proj.id),
        h('span', { className: 'project-id' }, proj.id)
      ));
      card.appendChild(h('div', { className: 'project-stats' },
        h('span', { className: 'project-stat' }, h('strong', null, String(done)), h('span', null, '/' + total + ' done')),
        blocked > 0 ? h('span', { className: 'project-stat' }, h('strong', null, String(blocked)), h('span', null, ' blocked')) : h('span', null)
      ));
      card.appendChild(h('div', { className: 'project-progress' },
        h('div', { className: 'project-progress-fill ' + progressClass, style: 'width:' + pct + '%' })
      ));

      // Expandable task list (hidden initially)
      const taskListContainer = h('div', { className: 'project-tasks-expand', 'data-project': proj.id, style: 'display:none;margin-top:12px' });
      const taskList = h('ul', { className: 'task-list' });
      for (const t of tasks) { taskList.appendChild(buildTaskItem(t)); }
      taskListContainer.appendChild(taskList);
      card.appendChild(taskListContainer);

      grid.appendChild(card);
    }
    group.appendChild(grid);
    el.appendChild(group);
  }
}

function toggleProjectTasks(projectId) {
  const el = document.querySelector(`.project-tasks-expand[data-project="${projectId}"]`);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/* ── Ticker ──────────────────────────────────────────────────────────── */
function renderTicker(data) {
  const el = document.getElementById('ticker-track');
  if (!el) return;
  el.innerHTML = '';

  const items = [];

  // Recent wins
  const wins = data.recentWins || [];
  for (const w of wins.slice(0, 3)) {
    items.push({ text: '✓ ' + (w.title || w.id || w), cls: 'ticker-done' });
  }

  // Needs attention
  const attn = data.needsAttention || [];
  for (const a of attn.slice(0, 3)) {
    const task = typeof a === 'string' ? DashData.getTaskById(data, a) : a;
    items.push({ text: '⚠ ' + (task?.title || a), cls: 'ticker-alert' });
  }

  // Blocked
  const blocked = DashData.getBlockedTasks(data);
  for (const b of blocked.slice(0, 2)) {
    items.push({ text: '✕ BLOCKED: ' + b.title, cls: 'ticker-warn' });
  }

  // Stats
  items.push({ text: `${data.stats.totalTasks} TASKS · ${data.stats.completedTasks} DONE · ${data.stats.blockedTasks} BLOCKED`, cls: 'ticker-info' });

  // Agent status
  const agents = data.agents || {};
  const agentStatus = Object.entries(agents).map(([n, a]) => `${n.toUpperCase()}: ${a.status}`).join(' · ');
  if (agentStatus) items.push({ text: agentStatus, cls: 'ticker-info' });

  // Duplicate for seamless scroll
  const allItems = [...items, ...items];
  for (const item of allItems) {
    el.appendChild(h('span', { className: 'ticker-item ' + item.cls }, item.text));
    el.appendChild(h('span', { className: 'ticker-sep' }, '◆'));
  }
}

/* ── Reusable Task Item ──────────────────────────────────────────────── */
function buildTaskItem(task, rank) {
  const li = h('li', {
    className: 'task-item',
    'data-task-id': task.id,
    onclick: (e) => { e.stopPropagation(); window.TaskModal?.open(task.id); }
  });

  if (rank) {
    li.appendChild(h('span', { className: 'task-rank' }, String(rank)));
  }

  li.appendChild(h('span', { className: 'task-priority-dot ' + DashData.priorityClass(task.priority) }));

  const info = h('div', { className: 'task-info' });
  info.appendChild(h('div', { className: 'task-title' }, safeText(task.title)));

  const meta = h('div', { className: 'task-meta' });
  meta.appendChild(h('span', { className: 'task-meta-tag' }, task.id));
  if (task.project) meta.appendChild(h('span', { className: 'task-meta-tag' }, task.project));
  if (task.agent) meta.appendChild(h('span', null, task.agent));
  info.appendChild(meta);

  li.appendChild(info);
  li.appendChild(h('span', { className: 'task-status-badge ' + DashData.statusClass(task.status) },
    (DashData.STATUS_LABELS[task.status] || task.status || '').toUpperCase()
  ));
  li.appendChild(h('span', { className: 'task-arrow' }, '›'));

  return li;
}

/* ── Master Render ───────────────────────────────────────────────────── */
function renderAll(data) {
  renderStatsBar(data);
  renderBriefing(data);
  renderOpsCards(data);
  renderFocusTasks(data);
  renderSystemHealth(data);
  renderCategories(data);
  renderTicker(data);
  window.CalendarView?.render(data);
  window.AgentsPanel?.render(data);
}

/* ── Export ───────────────────────────────────────────────────────────── */
window.Renderer = {
  renderAll,
  renderStatsBar, renderBriefing, renderOpsCards, renderFocusTasks,
  renderSystemHealth, renderCategories, renderTicker,
  buildTaskItem, timeAgo, isRecent
};
