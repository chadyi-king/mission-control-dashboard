(() => {
  'use strict';

  const BUILD_ID = '20260622-root-rebuild-4';
  const DATA_FILE = 'data.json';
  const FLEET_ORDER = [
    'chad-yi', 'cerebronn', 'helios', 'quanta', 'forger', 'escrita', 'autoura',
    'mensamusa', 'clair', 'eplusplus', 'kotler', 'ledger', 'atlas', 'pulsar', 'abed'
  ];
  const BOARD_LANES = ['open', 'active', 'needs_review', 'blocked', 'paused'];
  const state = {
    raw: {},
    tasks: [],
    taskMap: new Map(),
    projects: [],
    categories: [],
    agents: [],
    queues: {},
    stats: {},
    boardAgentId: 'chad-yi',
    visualFocusOrder: [],
    visualBoardMoves: new Map()
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const titleCase = (value) => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  function dataUrl() {
    const url = new URL(DATA_FILE, window.location.href);
    url.searchParams.set('build', BUILD_ID);
    url.searchParams.set('t', String(Date.now()));
    return url.toString();
  }

  async function loadData() {
    setSync('LOADING');
    try {
      const response = await fetch(dataUrl(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error(`${DATA_FILE} returned HTTP ${response.status}`);
      const raw = await response.json();
      buildModel(raw);
      renderAll();
      const valid = state.stats.total === 106 && state.stats.done === 29 && state.stats.projects === 22 && state.stats.hasC4;
      setSync(valid ? 'SNAPSHOT LIVE' : 'SNAPSHOT AUDIT', valid ? '' : 'warn');
    } catch (error) {
      console.error('[Mission Control] data load failed', error);
      setSync('DATA ERROR', 'error');
      const briefing = $('daily-briefing');
      if (briefing) briefing.innerHTML = `<div class="empty-state">Dashboard data failed to load: ${esc(error.message)}</div>`;
    }
  }

  function buildModel(raw) {
    state.raw = raw || {};
    state.tasks = buildTasks(state.raw);
    state.taskMap = new Map(state.tasks.map((task) => [task.id, task]));
    state.projects = buildProjects(state.raw, state.tasks);
    state.categories = buildCategories(state.raw, state.projects);
    state.agents = buildAgents(state.raw);
    state.queues = buildQueues(state.tasks, state.raw);
    state.stats = buildStats();
  }

  function buildTasks(raw) {
    const source = raw.tasks || {};
    const entries = Array.isArray(source)
      ? source.map((task, index) => [task?.id || `task-${index + 1}`, task])
      : Object.entries(source);

    return entries
      .map(([id, task]) => normalizeTask(id, task || {}))
      .filter((task) => task && task.status !== 'removed')
      .sort((a, b) => compareIds(a.id, b.id));
  }

  function normalizeTask(id, task) {
    const status = normalizeStatus(task.status);
    const project = normalizeProjectId(task.project || id);
    const agentId = normalizeAgentId(task.agent || task.assignedTo || task.owner || 'chad-yi');
    return {
      ...task,
      id: task.id || id,
      project,
      category: task.category || project.charAt(0),
      agentId,
      agentLabel: task.agent || agentName(agentId),
      sourceStatus: task.status || 'open',
      status,
      priority: normalizePriority(task.priority, status),
      searchText: `${task.id || id} ${task.title || ''} ${task.description || ''} ${project} ${task.agent || ''}`.toLowerCase()
    };
  }

  function normalizeStatus(value) {
    const raw = String(value || 'open').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['done', 'complete', 'completed'].includes(raw)) return 'done';
    if (['active', 'in_progress', 'working', 'agent_on_it'].includes(raw)) return 'active';
    if (['review', 'needs_review', 'awaiting_review', 'check_this'].includes(raw)) return 'needs_review';
    if (['input_requested', 'needs_input', 'waiting_on_you', 'waiting_for_caleb'].includes(raw)) return 'input_requested';
    if (['blocked', 'stuck'].includes(raw)) return 'blocked';
    if (['paused', 'pause', 'on_hold'].includes(raw)) return 'paused';
    if (['removed', 'deleted', 'archived'].includes(raw)) return 'removed';
    return 'open';
  }

  function normalizePriority(value, status) {
    if (status === 'done') return 'done';
    const raw = String(value || '').trim().toLowerCase();
    if (['critical', 'urgent', 'high'].includes(raw)) return 'high';
    if (raw === 'medium') return 'medium';
    return 'low';
  }

  function normalizeProjectId(value) {
    const match = String(value || '').match(/^([A-Z]+\d+)/i);
    return match ? match[1].toUpperCase() : '';
  }

  function normalizeAgentId(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
    if (!raw || ['caleb', 'chad', 'chad-yi', 'caleb-yi'].includes(raw)) return 'chad-yi';
    if (raw === 'autour') return 'autoura';
    if (raw === 'escritor') return 'escrita';
    return raw;
  }

  function buildProjects(raw, tasks) {
    const ids = new Set();
    Object.values(raw.categories || {}).forEach((category) => (category.projects || []).forEach((id) => ids.add(String(id).toUpperCase())));
    Object.keys(raw.projects || {}).forEach((id) => ids.add(String(id).toUpperCase()));
    Object.keys(raw.projectDetails || {}).forEach((id) => ids.add(String(id).toUpperCase()));
    tasks.forEach((task) => { if (task.project) ids.add(task.project); });

    return Array.from(ids)
      .filter(Boolean)
      .sort(compareIds)
      .map((id) => {
        const projectData = raw.projects?.[id] || {};
        const detailData = raw.projectDetails?.[id] || {};
        const projectTasks = tasks.filter((task) => task.project === id);
        const done = projectTasks.filter((task) => task.status === 'done').length;
        return {
          ...projectData,
          ...detailData,
          id,
          name: projectData.name || detailData.name || id,
          description: projectData.description || detailData.description || '',
          category: projectData.category || detailData.category || id.charAt(0),
          status: deriveProjectStatus(projectTasks, projectData.status),
          tasks: projectTasks,
          totalTasks: projectTasks.length,
          completedTasks: done,
          completionPct: projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0,
          searchText: `${id} ${projectData.name || ''} ${detailData.name || ''} ${projectData.description || ''} ${detailData.description || ''} ${projectTasks.map((task) => task.searchText).join(' ')}`.toLowerCase()
        };
      });
  }

  function deriveProjectStatus(tasks, fallback) {
    if (!tasks.length) return normalizeStatus(fallback || 'open');
    if (tasks.every((task) => task.status === 'done')) return 'done';
    if (tasks.some((task) => task.status === 'blocked')) return 'blocked';
    if (tasks.some((task) => task.status === 'active')) return 'active';
    if (tasks.some((task) => task.status === 'needs_review')) return 'needs_review';
    if (tasks.some((task) => task.status === 'input_requested')) return 'input_requested';
    if (tasks.some((task) => task.status === 'paused')) return 'paused';
    return 'open';
  }

  function buildCategories(raw, projects) {
    const configured = raw.categories || {};
    const categoryIds = Array.from(new Set([...Object.keys(configured), ...projects.map((project) => project.category)])).sort();
    return categoryIds.map((id) => ({
      id,
      name: configured[id]?.name || id,
      description: configured[id]?.description || '',
      projects: projects.filter((project) => project.category === id)
    }));
  }

  function buildAgents(raw) {
    const rawAgents = raw.agents || {};
    const rawIds = Object.keys(rawAgents).map(normalizeAgentId);
    const ids = Array.from(new Set([...FLEET_ORDER, ...rawIds]))
      .filter((id) => id && !['tele', 'telegram'].includes(id))
      .sort((a, b) => fleetIndex(a) - fleetIndex(b) || a.localeCompare(b));

    return ids.map((id) => {
      const record = rawAgents[id] || rawAgents[id.replace(/-/g, '_')] || rawAgents[id.toUpperCase()] || {};
      return {
        id,
        name: record.name || agentName(id),
        initials: agentInitials(record.name || agentName(id), id),
        role: record.role || record.role_tagline || fallbackRole(id),
        status: normalizeAgentStatus(record.status || fallbackAgentStatus(id)),
        platform: record.platform || '',
        currentTask: record.currentTask || '',
        lastActive: record.lastActive || ''
      };
    });
  }

  function buildQueues(tasks, raw) {
    const inputIds = new Set(asArray(raw.inputsNeeded).map((item) => item.taskId || item.id).filter(Boolean));
    const review = tasks.filter((task) => task.status === 'needs_review');
    const input = tasks.filter((task) => task.status === 'input_requested' || task.status === 'blocked' || inputIds.has(task.id));
    const active = tasks.filter((task) => task.status === 'active');
    const high = tasks.filter((task) => task.priority === 'high');
    const caleb = tasks.filter((task) => task.status !== 'done' && task.agentId === 'chad-yi');
    const focus = uniqueTasks([...input, ...review, ...active, ...high, ...caleb]).slice(0, 12);
    const priority = uniqueTasks([...high, ...input, ...review, ...active, ...tasks.filter((task) => task.status === 'open')]);
    return { review, input, active, high, caleb, focus, priority };
  }

  function buildStats() {
    const count = (status) => state.tasks.filter((task) => task.status === status).length;
    const done = count('done');
    return {
      total: state.tasks.length,
      done,
      open: state.tasks.length - done,
      active: count('active'),
      blocked: count('blocked'),
      input: state.queues.input.length,
      needsReview: count('needs_review'),
      paused: count('paused'),
      projects: state.projects.length,
      agents: state.agents.length,
      liveAgents: state.agents.filter((agent) => ['active', 'active_on_demand', 'external'].includes(agent.status)).length,
      hasC4: state.projects.some((project) => project.id === 'C4'),
      completionRate: Math.round((done / Math.max(1, state.tasks.length)) * 100)
    };
  }

  function renderAll() {
    renderStarfield();
    renderStats();
    renderTicker();
    renderBriefing();
    renderQueues();
    renderFocus();
    renderWeek();
    renderAgentBoardSelector();
    renderAgentBoard();
    renderFleet();
    renderProjects();
  }

  function renderStats() {
    setText('stat-total', state.stats.total);
    setText('stat-open', `${state.stats.open} open`);
    setText('stat-done', state.stats.done);
    setText('stat-rate', `${state.stats.completionRate}% complete`);
    setText('stat-projects', state.stats.projects);
    setText('stat-c4', state.stats.hasC4 ? 'C4 visible' : 'C4 missing');
    setText('stat-caleb', state.queues.caleb.length);
    setText('stat-input', `${state.stats.input} input`);
    setText('stat-active', state.stats.active);
    setText('stat-blocked', `${state.stats.blocked} blocked`);
    setText('stat-agents', state.stats.agents);
    setText('stat-live-agents', `${state.stats.liveAgents} live/ext`);
  }

  function renderTicker() {
    const c4 = state.projects.find((project) => project.id === 'C4');
    const active = state.queues.active.map((task) => task.id).join(', ') || 'none';
    setText('ticker', `BUILD ${BUILD_ID} | ${state.stats.projects} projects | ${state.stats.total} tasks | ${state.stats.done} done | C4 ${c4 ? c4.name : 'missing'} | active ${active}`);
  }

  function renderBriefing() {
    const briefing = state.raw.dailyBriefing || {};
    const summary = briefing.summary || `${state.stats.open} open tasks across ${state.stats.projects} projects.`;
    $('daily-briefing').innerHTML = `
      <div>${esc(summary)}</div>
      <div class="briefing-metrics">
        ${metric('Open', state.stats.open)}
        ${metric('Active', state.stats.active)}
        ${metric('Blocked', state.stats.blocked)}
        ${metric('Done', state.stats.done)}
      </div>
    `;
  }

  function renderQueues() {
    setText('review-count', state.queues.review.length);
    setText('input-count', state.queues.input.length);
    setText('caleb-count', state.queues.caleb.length);
    $('review-list').innerHTML = taskRows(state.queues.review, 'No tasks awaiting review.');
    $('input-list').innerHTML = taskRows(state.queues.input, 'No input requests right now.');
    $('caleb-list').innerHTML = taskRows(state.queues.caleb.slice(0, 10), 'Caleb queue is clear.');
  }

  function renderFocus() {
    const ordered = state.visualFocusOrder.length
      ? state.visualFocusOrder.map((id) => state.taskMap.get(id)).filter(Boolean)
      : state.queues.focus;
    $('focus-list').innerHTML = ordered.length
      ? ordered.map((task, index) => `
        <div class="focus-card" draggable="true" data-task-id="${esc(task.id)}">
          <div class="task-title">${index + 1}. ${esc(task.title)}</div>
          <div class="task-meta"><span>${esc(task.id)}</span><span>${esc(task.project)}</span><span class="badge ${esc(task.status)}">${esc(statusLabel(task.status))}</span><span>${esc(agentName(task.agentId))}</span></div>
        </div>
      `).join('')
      : '<div class="empty-state">No focus tasks available.</div>';
    wireDragList('focus-list', (ids) => {
      state.visualFocusOrder = ids;
      showToast('Priority order changed visually. Canonical persistence requires Hermes API.');
      renderFocus();
    });
  }

  function renderWeek() {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      return date;
    });
    setText('week-window', `${formatDay(days[0])} - ${formatDay(days[6])}`);
    $('week-calendar').innerHTML = days.map((date, index) => {
      const iso = isoDate(date);
      const due = state.tasks.filter((task) => task.status !== 'done' && task.deadline === iso).slice(0, 6);
      const activeToday = index === 0 ? state.queues.active.filter((task) => !task.deadline).slice(0, 4) : [];
      const items = uniqueTasks([...due, ...activeToday]);
      return `<div class="day-col ${index === 0 ? 'today' : ''}">
        <div class="day-name"><span>${date.toLocaleDateString('en-US', { weekday: 'short' })}</span><span>${date.getDate()}</span></div>
        ${items.length ? items.map((task) => `<span class="day-chip" data-task-id="${esc(task.id)}">${esc(task.id)} ${esc(task.title.slice(0, 32))}</span>`).join('') : '<div class="empty-state">clear</div>'}
      </div>`;
    }).join('');
  }

  function renderAgentBoardSelector() {
    const select = $('agent-board-select');
    const current = state.boardAgentId || select.value || 'chad-yi';
    select.innerHTML = state.agents.map((agent) => `<option value="${esc(agent.id)}">${esc(agent.name)}</option>`).join('');
    select.value = state.agents.some((agent) => agent.id === current) ? current : 'chad-yi';
    state.boardAgentId = select.value;
  }

  function renderAgentBoard() {
    const agentId = state.boardAgentId || 'chad-yi';
    const laneTasks = Object.fromEntries(BOARD_LANES.map((lane) => [lane, []]));
    state.tasks
      .filter((task) => task.agentId === agentId && task.status !== 'done')
      .forEach((task) => {
        const lane = state.visualBoardMoves.get(task.id) || (BOARD_LANES.includes(task.status) ? task.status : 'open');
        laneTasks[lane].push(task);
      });

    $('agent-board').innerHTML = BOARD_LANES.map((lane) => `<div class="kanban-col" data-lane="${esc(lane)}">
      <div class="kanban-title"><span>${esc(statusLabel(lane))}</span><b>${laneTasks[lane].length}</b></div>
      ${laneTasks[lane].map((task) => `<div class="kanban-card" draggable="true" data-task-id="${esc(task.id)}"><b>${esc(task.id)}</b><br>${esc(task.title)}</div>`).join('') || '<div class="empty-state">empty</div>'}
    </div>`).join('');
    wireKanban();
  }

  function renderFleet() {
    setText('fleet-count', `${state.agents.length} agents`);
    $('fleet-grid').innerHTML = state.agents.map((agent) => `<article class="agent-card">
      <div class="agent-top"><div class="agent-avatar">${esc(agent.initials)}</div><div><div class="agent-name">${esc(agent.name)}</div><div class="agent-status">${esc(agent.status)}</div></div></div>
      <div class="agent-role">${esc(agent.role)}</div>
      ${agent.currentTask ? `<div class="agent-status">${esc(agent.currentTask)}</div>` : ''}
    </article>`).join('');
  }

  function renderProjects() {
    const query = $('project-search').value.trim().toLowerCase();
    const status = $('status-filter').value;
    const html = state.categories.map((category) => {
      const projects = category.projects.filter((project) => {
        const matchesQuery = !query || project.searchText.includes(query);
        const matchesStatus = !status || project.status === status;
        return matchesQuery && matchesStatus;
      });
      if (!projects.length) return '';
      return `<section class="category-section">
        <div class="category-title"><span>${esc(category.id)} - ${esc(category.name)}</span><small>${projects.length} projects</small></div>
        <div class="project-grid">${projects.map(projectCard).join('')}</div>
      </section>`;
    }).join('');
    $('project-categories').innerHTML = html || '<div class="empty-state">No projects match this filter.</div>';
  }

  function projectCard(project) {
    return `<article class="project-card" data-project-id="${esc(project.id)}">
      <div class="project-head"><div><div class="project-id">${esc(project.id)}</div><div class="project-name">${esc(project.name)}</div></div><span class="badge ${esc(project.status)}">${esc(statusLabel(project.status))}</span></div>
      <div class="project-desc">${esc(project.description || 'No description logged.')}</div>
      <div class="progress"><span style="width:${Math.max(0, Math.min(100, project.completionPct))}%"></span></div>
      <div class="project-foot">${project.completedTasks}/${project.totalTasks} done | ${project.tasks.length} tasks</div>
    </article>`;
  }

  function taskRows(tasks, emptyText) {
    if (!tasks.length) return `<div class="empty-state">${esc(emptyText)}</div>`;
    return tasks.map(taskRow).join('');
  }

  function taskRow(task) {
    return `<div class="task-row" data-task-id="${esc(task.id)}" tabindex="0">
      <div class="task-title">${esc(task.title)}</div>
      <div class="task-meta"><span>${esc(task.id)}</span><span>${esc(task.project)}</span><span>${esc(agentName(task.agentId))}</span><span class="badge ${esc(task.status)}">${esc(statusLabel(task.status))}</span></div>
    </div>`;
  }

  function openTask(taskId) {
    const task = state.taskMap.get(taskId);
    if (!task) return;
    setText('modal-id', `${task.id} | ${task.project}`);
    setText('modal-title', task.title || task.id);
    $('modal-meta').innerHTML = [
      badge(statusLabel(task.status), task.status),
      badge(task.priority, task.priority),
      badge(agentName(task.agentId), ''),
      task.deadline ? badge(`Due ${task.deadline}`, '') : ''
    ].join('');
    setText('modal-description', task.description || task.notes || task.blockReason || task.pauseReason || `Project ${task.project}. Source status: ${task.sourceStatus || task.status}.`);
    $('task-modal').hidden = false;
  }

  function metric(label, value) {
    return `<div class="metric-pill"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  }

  function badge(text, cls) {
    return `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
  }

  function statusLabel(status) {
    return status === 'needs_review' ? 'Needs Review' : status === 'input_requested' ? 'Input Requested' : titleCase(status);
  }

  function agentName(id) {
    const names = {
      'chad-yi': 'Chad Yi',
      cerebronn: 'Cerebronn',
      helios: 'Helios',
      quanta: 'Quanta',
      forger: 'Forger',
      escrita: 'Escrita',
      autoura: 'Autoura',
      mensamusa: 'Mensamusa',
      clair: 'Clair',
      eplusplus: 'E++',
      kotler: 'Kotler',
      ledger: 'Ledger',
      atlas: 'Atlas',
      pulsar: 'Pulsar',
      abed: 'Abed'
    };
    return names[id] || titleCase(id);
  }

  function fallbackRole(id) {
    const roles = {
      'chad-yi': 'The Face - primary command identity',
      cerebronn: 'The Brain - strategy layer',
      helios: 'The Spine - audit and sync',
      quanta: 'Trading status and analytics',
      forger: 'Build and web implementation',
      escrita: 'Story and RE:UNITE writing',
      autoura: 'Growth, scouting, and story-first ads',
      kotler: 'External Google Ads manager'
    };
    return roles[id] || 'Planned specialist agent';
  }

  function fallbackAgentStatus(id) {
    if (id === 'helios' || id === 'quanta') return 'active';
    if (id === 'autoura') return 'active_on_demand';
    if (id === 'kotler') return 'external';
    return 'planned';
  }

  function normalizeAgentStatus(value) {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('active_on_demand')) return 'active_on_demand';
    if (raw.includes('external')) return 'external';
    if (raw.includes('blocked')) return 'blocked';
    if (raw.includes('paused')) return 'paused';
    if (raw.includes('stale')) return 'stale';
    if (raw.includes('active') || raw.includes('live')) return 'active';
    if (raw.includes('planned') || raw.includes('not_built')) return 'planned';
    return raw || 'planned';
  }

  function agentInitials(name, id) {
    if (id === 'eplusplus') return 'E+';
    return String(name || id).split(/[\s-]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  function uniqueTasks(tasks) {
    const seen = new Set();
    return tasks.filter((task) => {
      if (!task || seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    });
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  }

  function compareIds(a, b) {
    const parse = (value) => String(value).match(/^([A-Z]+)(\d+)(?:-(\d+))?$/i);
    const ma = parse(a);
    const mb = parse(b);
    if (ma && mb && ma[1] === mb[1]) {
      return Number(ma[2]) - Number(mb[2]) || Number(ma[3] || 0) - Number(mb[3] || 0);
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  function fleetIndex(id) {
    const index = FLEET_ORDER.indexOf(id);
    return index === -1 ? 999 : index;
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function setSync(text, mode = '') {
    const chip = $('sync-chip');
    if (!chip) return;
    chip.textContent = text;
    chip.className = `sync-chip${mode ? ` ${mode}` : ''}`;
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function wireDragList(containerId, onOrder) {
    const container = $(containerId);
    if (!container) return;
    let dragged = null;
    container.querySelectorAll('[draggable="true"]').forEach((item) => {
      item.addEventListener('dragstart', () => { dragged = item; item.style.opacity = '.45'; });
      item.addEventListener('dragend', () => { item.style.opacity = ''; dragged = null; });
      item.addEventListener('dragover', (event) => event.preventDefault());
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        if (!dragged || dragged === item) return;
        const rect = item.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        item.parentNode.insertBefore(dragged, after ? item.nextSibling : item);
        onOrder(Array.from(container.querySelectorAll('[data-task-id]')).map((element) => element.dataset.taskId));
      });
    });
  }

  function wireKanban() {
    let dragged = null;
    document.querySelectorAll('.kanban-card').forEach((card) => {
      card.addEventListener('dragstart', () => { dragged = card; card.style.opacity = '.45'; });
      card.addEventListener('dragend', () => { card.style.opacity = ''; dragged = null; });
    });
    document.querySelectorAll('.kanban-col').forEach((column) => {
      column.addEventListener('dragover', (event) => event.preventDefault());
      column.addEventListener('drop', (event) => {
        event.preventDefault();
        if (!dragged) return;
        state.visualBoardMoves.set(dragged.dataset.taskId, column.dataset.lane);
        showToast('Agent board move changed visually. Canonical persistence requires Hermes API.');
        renderAgentBoard();
      });
    });
  }

  function startOfDay(date) {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function formatDay(date) {
    return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
  }

  function renderStarfield() {
    const canvas = $('starfield');
    if (!canvas || canvas.dataset.ready) return;
    canvas.dataset.ready = '1';
    const ctx = canvas.getContext('2d');
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.2, a: Math.random() * 0.75 + 0.2
    }));
    function resize() {
      canvas.width = Math.floor(window.innerWidth * window.devicePixelRatio);
      canvas.height = Math.floor(window.innerHeight * window.devicePixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((star) => {
        ctx.globalAlpha = star.a;
        ctx.fillStyle = '#fff4dd';
        ctx.beginPath();
        ctx.arc(star.x * canvas.width, star.y * canvas.height, star.r * window.devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    resize();
    draw();
    window.addEventListener('resize', () => { resize(); draw(); });
  }

  document.addEventListener('click', (event) => {
    const taskElement = event.target.closest('[data-task-id]');
    if (taskElement && !event.target.closest('.kanban-col')) openTask(taskElement.dataset.taskId);

    const projectElement = event.target.closest('[data-project-id]');
    if (projectElement) {
      const project = state.projects.find((item) => item.id === projectElement.dataset.projectId);
      if (project && project.tasks[0]) openTask(project.tasks[0].id);
    }

    if (event.target.id === 'modal-close' || event.target.id === 'task-modal') $('task-modal').hidden = true;
    if (event.target.matches('[data-refresh]')) loadData();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $('task-modal').hidden = true;
    if (event.key === 'Enter') {
      const taskElement = event.target.closest('[data-task-id]');
      if (taskElement) openTask(taskElement.dataset.taskId);
    }
  });

  $('project-search').addEventListener('input', renderProjects);
  $('status-filter').addEventListener('change', renderProjects);
  $('agent-board-select').addEventListener('change', (event) => {
    state.boardAgentId = event.target.value;
    renderAgentBoard();
  });

  loadData();
})();
