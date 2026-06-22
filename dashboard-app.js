(() => {
  'use strict';

  const BUILD_ID = '20260622-root-rebuild-1';
  const DATA_URL = `data.json?build=${encodeURIComponent(BUILD_ID)}&t=${Date.now()}`;
  const FLEET_ORDER = ['chad-yi','cerebronn','helios','quanta','forger','escrita','autoura','mensamusa','clair','eplusplus','kotler','ledger','atlas','pulsar','abed'];
  const STATUS_ORDER = ['open', 'active', 'input_requested', 'needs_review', 'blocked', 'paused', 'done'];
  const model = { raw: null, tasks: [], taskMap: new Map(), projects: [], categories: [], agents: [], stats: {}, queues: {}, board: { agentId: 'chad-yi', moves: new Map() } };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const titleCase = (value) => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

  function normalizeStatus(status) {
    const raw = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['done', 'complete', 'completed'].includes(raw)) return 'done';
    if (['active', 'in_progress', 'working', 'agent_on_it'].includes(raw)) return 'active';
    if (['review', 'needs_review', 'awaiting_review', 'check_this'].includes(raw)) return 'needs_review';
    if (['input_requested', 'needs_input', 'waiting_on_you', 'waiting_for_caleb'].includes(raw)) return 'input_requested';
    if (['blocked', 'stuck'].includes(raw)) return 'blocked';
    if (['paused', 'pause', 'on_hold'].includes(raw)) return 'paused';
    if (['removed', 'deleted'].includes(raw)) return 'removed';
    return 'open';
  }

  function normalizeAgentId(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    if (!raw || raw === 'chad' || raw === 'caleb' || raw === 'caleb-yi') return 'chad-yi';
    if (raw === 'chad-yi' || raw === 'chad yi' || raw === 'chad_yi') return 'chad-yi';
    if (raw === 'escritor') return 'escrita';
    if (raw === 'autour') return 'autoura';
    return raw.replace(/\s+/g, '-');
  }

  function agentDisplay(id, rawAgent = {}) {
    const names = { 'chad-yi': 'Chad Yi', eplusplus: 'E++' };
    return rawAgent.name || rawAgent.displayName || names[id] || titleCase(id);
  }

  function initials(name, id) {
    if (id === 'eplusplus') return 'E+';
    return String(name || id).split(/\s|-/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  function projectIdFromTask(task, fallbackId = '') {
    const raw = String(task.project || task.id || fallbackId || '');
    const match = raw.match(/^([A-Z]+\d+)/i);
    return match ? match[1].toUpperCase() : '';
  }

  function normalizeTask(taskId, task) {
    const canonicalStatus = normalizeStatus(task.status);
    if (canonicalStatus === 'removed') return null;
    const projectId = projectIdFromTask(task, taskId);
    const agentId = normalizeAgentId(task.agent || task.assignedTo || task.owner || 'chad-yi');
    return {
      ...task,
      id: task.id || taskId,
      project: projectId,
      category: task.category || projectId.charAt(0),
      agentId,
      agentLabel: task.agent || agentDisplay(agentId),
      sourceStatus: task.status,
      status: canonicalStatus,
      priority: normalizePriority(task.priority, canonicalStatus),
      searchText: `${task.id || taskId} ${task.title || ''} ${projectId} ${task.agent || ''}`.toLowerCase()
    };
  }

  function normalizePriority(priority, status) {
    if (status === 'done') return 'done';
    const raw = String(priority || '').toLowerCase();
    if (['critical', 'urgent', 'high'].includes(raw)) return 'high';
    if (raw === 'medium') return 'medium';
    return 'low';
  }

  function visibleTasks(raw) {
    return Object.entries(raw.tasks || {})
      .map(([id, task]) => normalizeTask(id, task || {}))
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  function getProjectDetails(raw, projectId) {
    const project = raw.projects?.[projectId] || {};
    const details = raw.projectDetails?.[projectId] || {};
    return { ...project, ...details, id: projectId, category: project.category || details.category || projectId.charAt(0) };
  }

  function deriveProjectStatus(tasks) {
    if (!tasks.length) return 'open';
    if (tasks.every((task) => task.status === 'done')) return 'done';
    if (tasks.some((task) => task.status === 'blocked')) return 'blocked';
    if (tasks.some((task) => task.status === 'active')) return 'active';
    if (tasks.some((task) => task.status === 'needs_review' || task.status === 'input_requested')) return 'needs_review';
    if (tasks.some((task) => task.status === 'paused')) return 'paused';
    return 'open';
  }

  function buildProjects(raw, tasks) {
    const ids = new Set();
    Object.values(raw.categories || {}).forEach((cat) => (cat.projects || []).forEach((id) => ids.add(id)));
    Object.keys(raw.projectDetails || {}).forEach((id) => ids.add(id));
    Object.keys(raw.projects || {}).forEach((id) => { if (/^[A-Z]+\d+$/i.test(id)) ids.add(id.toUpperCase()); });
    tasks.forEach((task) => ids.add(task.project));

    return Array.from(ids).filter(Boolean).sort(compareProjectIds).map((projectId) => {
      const details = getProjectDetails(raw, projectId);
      const projectTasks = tasks.filter((task) => task.project === projectId);
      const done = projectTasks.filter((task) => task.status === 'done').length;
      return {
        id: projectId,
        category: details.category || projectId.charAt(0),
        name: details.name || projectId,
        description: details.description || '',
        tasks: projectTasks,
        totalTasks: projectTasks.length,
        completedTasks: done,
        completionPct: projectTasks.length ? Math.round(done / projectTasks.length * 100) : 0,
        status: deriveProjectStatus(projectTasks),
        searchText: `${projectId} ${details.name || ''} ${details.description || ''} ${projectTasks.map((t) => t.title).join(' ')}`.toLowerCase()
      };
    });
  }

  function compareProjectIds(a, b) {
    const ma = String(a).match(/^([A-Z]+)(\d+)$/i);
    const mb = String(b).match(/^([A-Z]+)(\d+)$/i);
    if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
    return String(a).localeCompare(String(b), undefined, { numeric: true });
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
    const ids = Array.from(new Set([...FLEET_ORDER, ...Object.keys(rawAgents).map(normalizeAgentId)]))
      .filter((id) => id && id !== 'tele' && id !== 'telegram')
      .sort((a, b) => (FLEET_ORDER.indexOf(a) === -1 ? 99 : FLEET_ORDER.indexOf(a)) - (FLEET_ORDER.indexOf(b) === -1 ? 99 : FLEET_ORDER.indexOf(b)) || a.localeCompare(b));
    return ids.map((id) => {
      const rawAgent = rawAgents[id] || rawAgents[id.replace(/-/g, '_')] || {};
      const name = agentDisplay(id, rawAgent);
      return {
        id,
        name,
        initials: initials(name, id),
        role: rawAgent.role || rawAgent.role_tagline || agentFallbackRole(id),
        status: normalizeAgentStatus(rawAgent.status || agentFallbackStatus(id)),
        platform: rawAgent.platform || '',
        currentTask: rawAgent.currentTask || '',
        lastActive: rawAgent.lastActive || ''
      };
    });
  }

  function agentFallbackRole(id) {
    const roles = {
      'chad-yi': 'The Face - primary command identity', cerebronn: 'The Brain - planned strategy layer', helios: 'The Spine - audit and sync', quanta: 'Trading status and analytics', forger: 'Build and web implementation', escrita: 'Story and RE:UNITE writing', autoura: 'Growth, scouting, and story-first ads', kotler: 'External Google Ads manager'
    };
    return roles[id] || 'Planned specialist agent';
  }

  function agentFallbackStatus(id) {
    if (id === 'helios') return 'active';
    if (id === 'quanta') return 'active';
    if (id === 'autoura') return 'active_on_demand';
    if (id === 'kotler') return 'external';
    return 'planned';
  }

  function normalizeAgentStatus(status) {
    const raw = String(status || '').toLowerCase();
    if (raw.includes('active_on_demand')) return 'active_on_demand';
    if (raw.includes('active') || raw.includes('live')) return 'active';
    if (raw.includes('external')) return 'external';
    if (raw.includes('stale')) return 'stale';
    if (raw.includes('blocked')) return 'blocked';
    if (raw.includes('paused')) return 'paused';
    if (raw.includes('planned') || raw.includes('not_built')) return 'planned';
    return raw || 'planned';
  }

  function buildQueues(raw, tasks) {
    const inputIds = new Set((Array.isArray(raw.inputsNeeded) ? raw.inputsNeeded : Object.values(raw.inputsNeeded || {})).map((item) => item.taskId || item.id).filter(Boolean));
    const review = tasks.filter((task) => task.status === 'needs_review');
    const input = tasks.filter((task) => task.status === 'input_requested' || task.status === 'blocked' || inputIds.has(task.id));
    const caleb = tasks.filter((task) => task.status !== 'done' && task.agentId === 'chad-yi');
    const focus = uniqueTasks([...input, ...review, ...tasks.filter((task) => task.status === 'active'), ...tasks.filter((task) => task.priority === 'high'), ...caleb]).slice(0, 12);
    const priority = uniqueTasks([...tasks.filter((task) => task.priority === 'high'), ...tasks.filter((task) => task.status === 'blocked'), ...tasks.filter((task) => task.status === 'active'), ...tasks.filter((task) => task.status === 'open')]);
    return { review, input, caleb, focus, priority };
  }

  function uniqueTasks(tasks) {
    const seen = new Set();
    return tasks.filter((task) => { if (!task || seen.has(task.id)) return false; seen.add(task.id); return true; });
  }

  function buildModel(raw) {
    const tasks = visibleTasks(raw);
    const projects = buildProjects(raw, tasks);
    const agents = buildAgents(raw);
    const done = tasks.filter((task) => task.status === 'done').length;
    const active = tasks.filter((task) => task.status === 'active').length;
    const blocked = tasks.filter((task) => task.status === 'blocked').length;
    const input = tasks.filter((task) => task.status === 'input_requested').length;
    const open = tasks.filter((task) => task.status !== 'done').length;
    Object.assign(model, {
      raw,
      tasks,
      taskMap: new Map(tasks.map((task) => [task.id, task])),
      projects,
      categories: buildCategories(raw, projects),
      agents,
      queues: buildQueues(raw, tasks),
      stats: {
        total: tasks.length,
        done,
        open,
        active,
        blocked,
        input,
        projects: projects.length,
        agents: agents.length,
        liveAgents: agents.filter((agent) => ['active', 'active_on_demand', 'external'].includes(agent.status)).length,
        hasC4: projects.some((project) => project.id === 'C4'),
        completionRate: Math.round(done / Math.max(1, tasks.length) * 100)
      }
    });
  }

  async function loadData() {
    $('sync-chip').textContent = 'LOADING';
    try {
      const response = await fetch(DATA_URL.replace(/t=\d+$/, `t=${Date.now()}`), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error(`data.json returned HTTP ${response.status}`);
      const raw = await response.json();
      buildModel(raw);
      renderAll();
      $('sync-chip').textContent = 'SNAPSHOT LIVE';
      $('sync-chip').className = 'sync-chip';
    } catch (error) {
      $('sync-chip').textContent = 'DATA ERROR';
      $('sync-chip').className = 'sync-chip error';
      $('daily-briefing').innerHTML = `<div class="empty-state">Dashboard data failed to load: ${esc(error.message)}</div>`;
      console.error('[Mission Control] data load failed', error);
    }
  }

  function renderAll() {
    renderStarfield();
    renderStats();
    renderTicker();
    renderBriefing();
    renderTaskLists();
    renderFocus();
    renderWeek();
    renderAgentBoardSelector();
    renderAgentBoard();
    renderFleet();
    renderProjects();
  }

  function renderStats() {
    $('stat-total').textContent = model.stats.total;
    $('stat-open').textContent = `${model.stats.open} open`;
    $('stat-done').textContent = model.stats.done;
    $('stat-rate').textContent = `${model.stats.completionRate}% complete`;
    $('stat-projects').textContent = model.stats.projects;
    $('stat-c4').textContent = model.stats.hasC4 ? 'C4 visible' : 'C4 missing';
    $('stat-caleb').textContent = model.queues.caleb.length;
    $('stat-input').textContent = `${model.queues.input.length} input`;
    $('stat-active').textContent = model.stats.active;
    $('stat-blocked').textContent = `${model.stats.blocked} blocked`;
    $('stat-agents').textContent = model.stats.agents;
    $('stat-live-agents').textContent = `${model.stats.liveAgents} live/ext`;
  }

  function renderTicker() {
    const c4 = model.projects.find((project) => project.id === 'C4');
    const active = model.tasks.filter((task) => task.status === 'active').map((task) => task.id).join(', ') || 'none';
    $('ticker').textContent = `BUILD ${BUILD_ID} | ${model.stats.projects} projects | ${model.stats.total} tasks | ${model.stats.done} done | C4 ${c4 ? c4.name : 'missing'} | active ${active}`;
  }

  function renderBriefing() {
    const briefing = model.raw.dailyBriefing || {};
    const summary = briefing.summary || `${model.stats.open} tasks open across ${model.stats.projects} projects.`;
    $('daily-briefing').innerHTML = `
      <div>${esc(summary)}</div>
      <div class="briefing-metrics">
        ${metric('Open', model.stats.open)}
        ${metric('Active', model.stats.active)}
        ${metric('Blocked', model.stats.blocked)}
        ${metric('Done', model.stats.done)}
      </div>
    `;
  }

  function metric(label, value) {
    return `<div class="metric-pill"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  }

  function renderTaskLists() {
    $('review-count').textContent = model.queues.review.length;
    $('input-count').textContent = model.queues.input.length;
    $('caleb-count').textContent = model.queues.caleb.length;
    $('review-list').innerHTML = taskRows(model.queues.review, 'No tasks awaiting review.');
    $('input-list').innerHTML = taskRows(model.queues.input, 'No input requests right now.');
    $('caleb-list').innerHTML = taskRows(model.queues.caleb.slice(0, 8), 'Caleb queue is clear.');
  }

  function taskRows(tasks, emptyText) {
    if (!tasks.length) return `<div class="empty-state">${esc(emptyText)}</div>`;
    return tasks.map(taskRow).join('');
  }

  function taskRow(task) {
    return `<div class="task-row" data-task-id="${esc(task.id)}" tabindex="0">
      <div class="task-title">${esc(task.title)}</div>
      <div class="task-meta"><span>${esc(task.id)}</span><span>${esc(task.project)}</span><span>${esc(agentDisplay(task.agentId))}</span><span class="badge ${esc(task.status)}">${esc(statusLabel(task.status))}</span></div>
    </div>`;
  }

  function statusLabel(status) {
    return status === 'needs_review' ? 'Needs Review' : status === 'input_requested' ? 'Input Requested' : titleCase(status);
  }

  function renderFocus() {
    const order = model.focusOrder || [];
    const focus = order.length ? order.map((id) => model.taskMap.get(id)).filter(Boolean) : model.queues.focus;
    $('focus-list').innerHTML = focus.length ? focus.map((task, index) => `
      <div class="focus-card" draggable="true" data-task-id="${esc(task.id)}">
        <div class="task-title">${index + 1}. ${esc(task.title)}</div>
        <div class="task-meta"><span>${esc(task.id)}</span><span>${esc(task.project)}</span><span class="badge ${esc(task.status)}">${esc(statusLabel(task.status))}</span><span>${esc(agentDisplay(task.agentId))}</span></div>
      </div>
    `).join('') : '<div class="empty-state">No focus tasks available.</div>';
    wireDragList('focus-list', (ids) => {
      model.focusOrder = ids;
      showToast('Priority queue reordered visually. Hermes API is required to persist this as canonical state.');
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
    $('week-window').textContent = `${formatDay(days[0])} - ${formatDay(days[6])}`;
    $('week-calendar').innerHTML = days.map((date, index) => {
      const iso = isoDate(date);
      const due = model.tasks.filter((task) => task.status !== 'done' && task.deadline === iso).slice(0, 6);
      const todayExtra = index === 0 ? model.tasks.filter((task) => task.status === 'active' && !task.deadline).slice(0, 5) : [];
      const items = uniqueTasks([...due, ...todayExtra]);
      return `<div class="day-col ${index === 0 ? 'today' : ''}">
        <div class="day-name"><span>${date.toLocaleDateString('en-US', { weekday: 'short' })}</span><span>${date.getDate()}</span></div>
        ${items.length ? items.map((task) => `<span class="day-chip" data-task-id="${esc(task.id)}">${esc(task.id)} ${esc(task.title.slice(0, 32))}</span>`).join('') : '<div class="empty-state">clear</div>'}
      </div>`;
    }).join('');
  }

  function renderAgentBoardSelector() {
    const select = $('agent-board-select');
    const current = select.value || model.board.agentId || 'chad-yi';
    select.innerHTML = model.agents.map((agent) => `<option value="${esc(agent.id)}">${esc(agent.name)}</option>`).join('');
    select.value = model.agents.some((agent) => agent.id === current) ? current : 'chad-yi';
    model.board.agentId = select.value;
  }

  function renderAgentBoard() {
    const agentId = model.board.agentId || $('agent-board-select').value || 'chad-yi';
    const baseTasks = model.tasks.filter((task) => task.agentId === agentId && task.status !== 'done');
    const lanes = ['open', 'active', 'needs_review', 'blocked', 'paused'];
    const moved = model.board.moves;
    const laneTasks = Object.fromEntries(lanes.map((lane) => [lane, []]));
    baseTasks.forEach((task) => {
      const lane = moved.get(task.id) || (lanes.includes(task.status) ? task.status : 'open');
      laneTasks[lane]?.push(task);
    });
    $('agent-board').innerHTML = lanes.map((lane) => `<div class="kanban-col" data-lane="${lane}">
      <div class="kanban-title"><span>${esc(statusLabel(lane))}</span><b>${laneTasks[lane].length}</b></div>
      ${laneTasks[lane].map((task) => `<div class="kanban-card" draggable="true" data-task-id="${esc(task.id)}"><b>${esc(task.id)}</b><br>${esc(task.title)}</div>`).join('') || '<div class="empty-state">empty</div>'}
    </div>`).join('');
    wireKanban();
  }

  function renderFleet() {
    $('fleet-count').textContent = `${model.agents.length} agents`;
    $('fleet-grid').innerHTML = model.agents.map((agent) => `<article class="agent-card">
      <div class="agent-top"><div class="agent-avatar">${esc(agent.initials)}</div><div><div class="agent-name">${esc(agent.name)}</div><div class="agent-status">${esc(agent.status)}</div></div></div>
      <div class="agent-role">${esc(agent.role)}</div>
      ${agent.currentTask ? `<div class="agent-status">${esc(agent.currentTask)}</div>` : ''}
    </article>`).join('');
  }

  function renderProjects() {
    const query = $('project-search').value.trim().toLowerCase();
    const status = $('status-filter').value;
    $('project-categories').innerHTML = model.categories.map((category) => {
      const projects = category.projects.filter((project) => (!query || project.searchText.includes(query)) && (!status || project.status === status));
      if (!projects.length) return '';
      return `<section class="category-section">
        <div class="category-title"><span>${esc(category.id)} - ${esc(category.name)}</span><small>${projects.length} projects</small></div>
        <div class="project-grid">${projects.map(projectCard).join('')}</div>
      </section>`;
    }).join('') || '<div class="empty-state">No projects match this filter.</div>';
  }

  function projectCard(project) {
    return `<article class="project-card" data-project-id="${esc(project.id)}">
      <div class="project-head"><div><div class="project-id">${esc(project.id)}</div><div class="project-name">${esc(project.name)}</div></div><span class="badge ${esc(project.status)}">${esc(statusLabel(project.status))}</span></div>
      <div class="project-desc">${esc(project.description || 'No description logged.')}</div>
      <div class="progress"><span style="width:${project.completionPct}%"></span></div>
      <div class="project-foot">${project.completedTasks}/${project.totalTasks} done | ${project.tasks.length} tasks</div>
    </article>`;
  }

  function openTask(taskId) {
    const task = model.taskMap.get(taskId);
    if (!task) return;
    $('modal-id').textContent = `${task.id} | ${task.project}`;
    $('modal-title').textContent = task.title;
    $('modal-meta').innerHTML = [
      badge(statusLabel(task.status), task.status),
      badge(task.priority, task.priority),
      badge(agentDisplay(task.agentId), ''),
      task.deadline ? badge(`Due ${task.deadline}`, '') : ''
    ].join('');
    $('modal-description').textContent = task.description || task.notes || task.blockReason || task.pauseReason || `Project ${task.project}. Source status: ${task.sourceStatus || task.status}.`;
    $('task-modal').hidden = false;
  }

  function badge(text, cls) {
    return `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
  }

  function wireDragList(containerId, onOrder) {
    const container = $(containerId);
    let dragged = null;
    container.querySelectorAll('[draggable="true"]').forEach((item) => {
      item.addEventListener('dragstart', () => { dragged = item; item.style.opacity = '.45'; });
      item.addEventListener('dragend', () => { if (dragged) dragged.style.opacity = ''; dragged = null; });
      item.addEventListener('dragover', (event) => event.preventDefault());
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        if (!dragged || dragged === item) return;
        const rect = item.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        item.parentNode.insertBefore(dragged, after ? item.nextSibling : item);
        onOrder(Array.from(container.querySelectorAll('[data-task-id]')).map((el) => el.dataset.taskId));
      });
    });
  }

  function wireKanban() {
    let dragged = null;
    document.querySelectorAll('.kanban-card').forEach((card) => {
      card.addEventListener('dragstart', () => { dragged = card; card.style.opacity = '.45'; });
      card.addEventListener('dragend', () => { if (dragged) dragged.style.opacity = ''; dragged = null; });
    });
    document.querySelectorAll('.kanban-col').forEach((col) => {
      col.addEventListener('dragover', (event) => event.preventDefault());
      col.addEventListener('drop', (event) => {
        event.preventDefault();
        if (!dragged) return;
        model.board.moves.set(dragged.dataset.taskId, col.dataset.lane);
        showToast('Agent board move is visual until Hermes API persists it to canonical state.');
        renderAgentBoard();
      });
    });
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function isoDate(date) { return date.toISOString().slice(0, 10); }
  function formatDay(date) { return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' }); }

  function renderStarfield() {
    const canvas = $('starfield');
    if (!canvas || canvas.dataset.ready) return;
    canvas.dataset.ready = '1';
    const ctx = canvas.getContext('2d');
    const stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + .2, a: Math.random() * .75 + .2 }));
    function resize() {
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
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
    const taskEl = event.target.closest('[data-task-id]');
    if (taskEl && !event.target.closest('.kanban-col')) openTask(taskEl.dataset.taskId);
    const projectEl = event.target.closest('[data-project-id]');
    if (projectEl) {
      const project = model.projects.find((item) => item.id === projectEl.dataset.projectId);
      if (project && project.tasks[0]) openTask(project.tasks[0].id);
    }
    if (event.target.id === 'modal-close' || event.target.id === 'task-modal') $('task-modal').hidden = true;
    if (event.target.matches('[data-refresh]')) loadData();
  });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') $('task-modal').hidden = true; });
  $('project-search').addEventListener('input', renderProjects);
  $('status-filter').addEventListener('change', renderProjects);
  $('agent-board-select').addEventListener('change', (event) => { model.board.agentId = event.target.value; renderAgentBoard(); });

  loadData();
})();
