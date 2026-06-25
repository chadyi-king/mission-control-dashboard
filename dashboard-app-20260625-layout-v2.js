(() => {
  'use strict';

  const BUILD_ID = "20260625-layout-v2";
  const DATA_FILE = 'data.json';
  const FLEET_ORDER = [
    'chad-yi', 'cerebronn', 'helios', 'quanta', 'forger', 'escrita', 'autoura',
    'mensamusa', 'clair', 'eplusplus', 'kotler', 'ledger', 'atlas', 'pulsar', 'abed'
  ];
  const BOARD_LANES = ['open', 'active', 'needs_review', 'blocked', 'paused'];
  const AGENT_VISUALS = {
    'chad-yi': { display: 'CHAD_YI', role: 'The Face', image: 'assets/chad-yi-avatar.jpg' },
    cerebronn: { display: 'CEREBRONN', role: 'The Brain', image: 'assets/cerebronn-avatar.jpg?v=1' },
    helios: { display: 'HELIOS', role: 'The Spine', image: 'assets/helios-avatar.jpg', position: 'center 20%' },
    quanta: { display: 'QUANTA', role: 'Trading', image: 'assets/quanta-avatar.jpg', position: 'center 20%' },
    forger: { display: 'FORGER', role: 'Builder', image: 'assets/forger-avatar.jpg?v=1' },
    escrita: { display: 'ESCRITA', role: 'Writing', image: 'assets/escrita-avatar.jpg?v=1' },
    autoura: { display: 'AUTOURA', role: 'Content Creation & Client Acquisition', image: 'assets/autour-avatar.jpg' },
    mensamusa: { display: 'MENSAMUSA', role: 'Research', initials: 'MM' },
    clair: { display: 'CLAIR', role: 'Streaming Scout', initials: 'CL' },
    eplusplus: { display: 'E++', role: 'Core Dev', initials: 'E+' },
    kotler: { display: 'KOTLER', role: 'Google Ads Manager', image: 'assets/kotler-avatar.jpg', position: 'center 10%' },
    ledger: { display: 'LEDGER', role: 'Finance / CRM', initials: 'LG' },
    atlas: { display: 'ATLAS', role: 'Researcher', initials: 'AT' },
    pulsar: { display: 'PULSAR', role: 'Data Sentinel', initials: 'PS' },
    abed: { display: 'ABED', role: 'Community Manager', initials: 'AB' }
  };

  // Public GitHub Pages is read-only by default.
  // Intent persistence is enabled only when a Hermes API URL is explicitly injected.
  const HERMES_API_URL = window.__HERMES_API_URL__ || null;
  const HERMES_API_CONFIGURED = !!HERMES_API_URL;

  const state = {
    raw: {},
    tasks: [],
    taskMap: new Map(),
    projects: [],
    categories: [],
    agents: [],
    futureAgents: [],
    queues: {},
    stats: {},
    boardAgentId: 'chad-yi',
    visualFocusOrder: [],
    visualBoardMoves: new Map(),
    hermesApiAvailable: false,
    hermesApiChecked: false
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
      await detectHermesApi();
      renderAll();
      const valid = state.stats.hasC4 && state.stats.projects >= 22 && state.stats.total >= 100;
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
    state.futureAgents = state.raw.futureAgents || [];
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
      const visual = AGENT_VISUALS[id] || {};
      return {
        id,
        name: record.name || visual.display || agentName(id),
        initials: record.initials || visual.initials || agentInitials(record.name || visual.display || agentName(id), id),
        role: record.role || record.role_tagline || visual.role || fallbackRole(id),
        status: normalizeAgentStatus(record.status || fallbackAgentStatus(id)),
        platform: record.platform || '',
        currentTask: record.currentTask || '',
        lastActive: record.lastActive || '',
        image: visual.image || '',
        imagePosition: visual.position || 'center'
      };
    });
  }

  function buildQueues(tasks, raw) {
    const inputIds = new Set(asArray(raw.inputsNeeded).map((item) => item.taskId || item.id).filter(Boolean));
    
    // 1. Review: strictly needs_review status
    const review = tasks.filter((task) => task.status === 'needs_review');
    
    // 2. Input Requested: strictly input_requested OR explicitly in inputsNeeded
    const input = tasks.filter((task) => task.status === 'input_requested' || inputIds.has(task.id));
    
    // 3. Blocked: strictly blocked status
    const blocked = tasks.filter((task) => task.status === 'blocked');
    
    // 4. Active: strictly active status
    const active = tasks.filter((task) => task.status === 'active');
    
    // 5. High priority (for focus sorting)
    const high = tasks.filter((task) => task.priority === 'high' && task.status !== 'done');
    
    // 6. Caleb's Queue: tasks that ACTUALLY need Caleb's attention
    const today = isoDate(new Date());
    const caleb = tasks.filter((task) => {
      if (task.status === 'done' || task.status === 'removed') return false;
      if (task.agentId !== 'chad-yi') return false;
      return task.status === 'input_requested' || 
             task.status === 'blocked' || 
             task.status === 'needs_review' ||
             task.status === 'active' ||
             (task.deadline && task.deadline <= today);
    });
    
    // 7. Today's Focus: sorted by urgency signals
    const focusTasks = uniqueTasks([...blocked, ...input, ...review, ...active, ...high, ...caleb]);
    const focus = sortByUrgency(focusTasks).slice(0, 12);
    
    // 8. Priority queue (for agent boards)
    const priority = uniqueTasks([...high, ...blocked, ...input, ...review, ...active, ...tasks.filter((task) => task.status === 'open')]);
    
    return { review, input, blocked, active, high, caleb, focus, priority };
  }

  function sortByUrgency(tasks) {
    const today = isoDate(new Date());
    const tomorrow = isoDate(new Date(Date.now() + 86400000));
    
    return tasks.sort((a, b) => {
      const score = (task) => {
        let s = 0;
        if (task.status === 'blocked' || task.status === 'input_requested') s += 100;
        if (task.status === 'needs_review') s += 80;
        if (task.status === 'active') s += 60;
        if (task.deadline && task.deadline <= today) s += 90;
        if (task.deadline && task.deadline === tomorrow) s += 70;
        if (task.deadline && task.deadline > tomorrow) {
          const daysUntil = Math.ceil((new Date(task.deadline) - new Date(today)) / 86400000);
          if (daysUntil <= 7) s += 50;
        }
        if (task.priority === 'high') s += 40;
        if (task.priority === 'medium') s += 20;
        return s;
      };
      return score(b) - score(a);
    });
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
      input: state.queues.input ? state.queues.input.length : 0,
      needsReview: count('needs_review'),
      paused: count('paused'),
      projects: state.projects.length,
      agents: state.agents.length,
      liveAgents: state.agents.filter((agent) => ['active', 'active_on_demand', 'external'].includes(agent.status)).length,
      hasC4: state.projects.some((project) => project.id === 'C4'),
      completionRate: Math.round((done / Math.max(1, state.tasks.length)) * 100)
    };
  }

  // ===== RENDER ALL =====
  function renderAll() {
    renderStarfield();
    renderCommandStrip();
    renderTicker();
    renderClusters();
    renderBriefing();
    renderQueues();
    renderFocus();
    renderWeek();
    renderAgentBoardSelector();
    renderAgentBoard();
    renderFleet();
    renderProjects();
  }

  // ===== COMMAND STRIP (sticky bar below header) =====
  function renderCommandStrip() {
    const c4 = state.projects.find((project) => project.id === 'C4');
    const metrics = [
      ['Projects', state.stats.projects, 'info'],
      ['Tasks', state.stats.total, ''],
      ['Done', state.stats.done, 'good'],
      ['Left', state.stats.open, 'warn'],
      ['Active', state.stats.active, 'info'],
      ['Review', state.stats.needsReview, 'warn'],
      ['Input', state.stats.input, state.stats.input ? 'alert' : ''],
      ['Blocked', state.stats.blocked, state.stats.blocked ? 'alert' : ''],
      ['Paused', state.stats.paused, 'warn'],
      ['C4', c4 ? 'OK' : 'MISS', c4 ? 'good' : 'alert']
    ];
    const strip = $('cmd-strip');
    if (!strip) return;
    strip.innerHTML = metrics.map(([label, value, tone]) => `
      <div class="cmd-stat ${esc(tone)}"><div class="cmd-stat-value">${esc(value)}</div><div class="cmd-stat-label">${esc(label)}</div></div>
    `).join('');
  }

  // ===== TICKER (scrolling top bar) =====
  function renderTicker() {
    const today = isoDate(new Date());
    const overdue = state.tasks.filter((t) => t.deadline && t.deadline < today && t.status !== 'done');
    const dueToday = state.tasks.filter((t) => t.deadline === today && t.status !== 'done');
    const completedToday = state.tasks.filter((t) => t.completedAt && t.completedAt === today).length;
    const liveCount = state.agents.filter((a) => ['active', 'active_on_demand', 'external'].includes(a.status)).length;
    
    const tickerText = [
      `URGENT: ${dueToday.length} due today · ${overdue.length} overdue`,
      `AGENTS: ${completedToday} completed today`,
      `PRIORITY: ${state.queues.focus ? state.queues.focus.length : 0} tasks need attention`,
      `FLEET: ${liveCount}/${state.agents.length} agents live (you're #17)`,
      `LAST AUDIT: ${state.stats.lastAudit || 'Just now'}`
    ].join('  ///  ');
    
    const tickerContent = $('ticker-content');
    if (tickerContent) {
      tickerContent.textContent = tickerText;
    }
  }

  // ===== 3 CLUSTERS =====
  function renderClusters() {
    const today = isoDate(new Date());
    const tomorrow = isoDate(new Date(Date.now() + 86400000));
    const weekEnd = isoDate(new Date(Date.now() + 7 * 86400000));
    
    // Schedule cluster
    const dueToday = state.tasks.filter((t) => t.deadline === today && t.status !== 'done');
    const dueTomorrow = state.tasks.filter((t) => t.deadline === tomorrow && t.status !== 'done');
    const overdue = state.tasks.filter((t) => t.deadline && t.deadline < today && t.status !== 'done');
    const overdueThisWeek = overdue.filter((t) => t.deadline >= isoDate(new Date(Date.now() - 7 * 86400000)));
    const weekDone = state.tasks.filter((t) => t.status === 'done').length;
    const weekLeft = state.tasks.filter((t) => t.status !== 'done').length;
    const weekUpcoming = state.tasks.filter((t) => t.deadline && t.deadline > today && t.deadline <= weekEnd && t.status !== 'done');
    
    setText('schedule-due-today', dueToday.length);
    setText('schedule-due-tomorrow', `${dueTomorrow.length} tomorrow`);
    setText('schedule-overdue', overdue.length);
    setText('schedule-overdue-breakdown', `${overdueThisWeek.length} this week`);
    setText('schedule-this-week', `${weekDone} done`);
    setText('schedule-week-breakdown', `${weekLeft} left · ${weekUpcoming.length} upcoming`);
    
    // Progress + Operations cluster
    const onTrack = state.projects.filter((p) => p.status === 'active' || p.completionPct >= 50).length;
    const atRisk = state.projects.filter((p) => p.status === 'blocked' || (p.completionPct < 50 && p.completionPct > 0)).length;
    const delayed = state.projects.filter((p) => p.status === 'paused' || overdue.some((t) => t.project === p.id)).length;
    const onlineAgents = state.agents.filter((a) => ['active', 'active_on_demand'].includes(a.status)).length;
    const offlineAgents = state.agents.filter((a) => a.status === 'planned').length;
    const staleAgents = state.agents.filter((a) => a.status === 'stale').length;
    const needsYou = state.queues.caleb ? state.queues.caleb.length : 0;
    const needsReview = state.queues.review ? state.queues.review.length : 0;
    const needsInput = state.queues.input ? state.queues.input.length : 0;
    
    setText('progress-projects', state.stats.projects);
    setText('progress-project-breakdown', `${onTrack} on track · ${atRisk} at risk · ${delayed} delayed`);
    setText('progress-completion', `${state.stats.completionRate}%`);
    setText('progress-completion-breakdown', `${state.stats.done} done · ${state.stats.total} total · ${state.stats.open} open`);
    setText('progress-blocked', state.stats.blocked);
    setText('progress-paused', `${state.stats.paused} paused`);
    setText('progress-fleet', `${onlineAgents}/${state.agents.length}`);
    setText('progress-fleet-breakdown', `${offlineAgents} offline · ${staleAgents} stale`);
    setText('progress-needs-you', needsYou);
    setText('progress-needs-breakdown', `${needsReview} review · ${needsInput} input`);
    
    // P&L cluster (placeholder - will use revenue-ledger.json when available)
    setText('pnl-weekly', 'TBD');
    setText('pnl-best', 'TBD');
    setText('pnl-worst', 'TBD');
    setText('pnl-profit', 'TBD');
    setText('pnl-loss', 'TBD');
    setText('pnl-net', 'TBD');
  }

  // ===== BRIEFING =====
  function renderBriefing() {
    const today = isoDate(new Date());
    const blocked = state.queues.blocked || [];
    const input = state.queues.input || [];
    const review = state.queues.review || [];
    const caleb = state.queues.caleb || [];
    const active = state.queues.active || [];
    
    const parts = [];
    
    if (blocked.length > 0) {
      parts.push(`🚫 ${blocked.length} blocked — needs action to unblock`);
    }
    if (input.length > 0) {
      parts.push(`❓ ${input.length} waiting for your input`);
    }
    if (review.length > 0) {
      parts.push(`👀 ${review.length} ready for review`);
    }
    if (caleb.length > 0 && blocked.length === 0 && input.length === 0) {
      parts.push(`📋 ${caleb.length} tasks need your attention`);
    }
    if (active.length > 0) {
      parts.push(`⚡ ${active.length} active`);
    }
    if (parts.length === 0) {
      parts.push('✅ All clear — no urgent items');
    }
    
    const overdue = state.tasks.filter((t) => t.deadline && t.deadline < today && t.status !== 'done');
    const dueToday = state.tasks.filter((t) => t.deadline === today && t.status !== 'done');
    if (overdue.length > 0) {
      parts.push(`⏰ ${overdue.length} overdue`);
    }
    if (dueToday.length > 0) {
      parts.push(`📅 ${dueToday.length} due today`);
    }
    
    const summary = parts.join(' · ');
    
    const target = $('daily-briefing');
    if (!target) return;
    target.innerHTML = `
      <div class="briefing-summary">${esc(summary)}</div>
      <div class="briefing-metrics">
        ${metric('Blocked', blocked.length)}
        ${metric('Input', input.length)}
        ${metric('Review', review.length)}
        ${metric('Active', active.length)}
      </div>
      <div class="briefing-note">Update tasks through Telegram/Hermes</div>
    `;
  }

  // ===== QUEUES =====
  function renderQueues() {
    const blocked = state.queues.blocked || [];
    const input = state.queues.input || [];
    const review = state.queues.review || [];
    const caleb = state.queues.caleb || [];
    
    setText('review-count', review.length);
    setText('input-count', input.length);
    setText('caleb-count', caleb.length);
    
    const reviewList = $('review-list');
    const inputList = $('input-list');
    const calebList = $('caleb-list');
    
    if (reviewList) {
      reviewList.innerHTML = review.length 
        ? taskRows(review.slice(0, 5), '') 
        : '<div class="empty-state">No tasks awaiting review. Mark a task "needs review" to see it here.</div>';
    }
    
    if (inputList) {
      inputList.innerHTML = input.length
        ? taskRows(input.slice(0, 5), '')
        : '<div class="empty-state">No input requests. Ask Hermes to mark a task "input requested" when you need Caleb to answer.</div>';
    }
    
    if (calebList) {
      if (caleb.length === 0) {
        calebList.innerHTML = '<div class="empty-state">Caleb\'s queue is clear. No urgent items need your attention.</div>';
      } else {
        const sorted = sortByUrgency([...caleb]).slice(0, 8);
        calebList.innerHTML = taskRows(sorted, '');
      }
    }
  }

  // ===== FOCUS =====
  function renderFocus() {
    const ordered = state.queues.focus || [];
    setText('focus-total-count', `${ordered.length} tasks`);
    const list = $('focus-list');
    if (!list) return;
    list.innerHTML = ordered.length
      ? ordered.map((task, index) => `
        <div class="focus-card" draggable="true" data-task-id="${esc(task.id)}">
          <div class="task-title">${index + 1}. ${esc(task.title)}</div>
          <div class="task-meta"><span>${esc(task.id)}</span><span>${esc(task.project)}</span><span class="badge ${esc(task.status)}">${esc(statusLabel(task.status))}</span><span>${esc(agentName(task.agentId))}</span>${task.deadline ? `<span>📅 ${esc(task.deadline)}</span>` : ''}</div>
        </div>
      `).join('')
      : '<div class="empty-state">No focus tasks. Mark tasks as blocked, input requested, or active to see them here.</div>';
    wireDragList('focus-list', async (ids) => {
      const ok = await persistPriorityOrder(ids);
      if (!ok) renderFocus();
    });
  }

  // ===== WEEK CALENDAR =====
  function renderWeek() {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      return date;
    });
    setText('week-window', `${formatDay(days[0])} - ${formatDay(days[6])}`);
    const target = $('week-calendar');
    if (!target) return;
    
    const tasksWithDeadlines = state.tasks.filter((t) => t.deadline && t.status !== 'done').length;
    
    target.innerHTML = days.map((date, index) => {
      const iso = isoDate(date);
      const due = state.tasks.filter((task) => task.status !== 'done' && task.deadline === iso).slice(0, 6);
      const activeToday = index === 0 ? state.queues.active.filter((task) => !task.deadline).slice(0, 4) : [];
      const items = uniqueTasks([...due, ...activeToday]);
      
      const dueCount = due.length;
      const dueBadge = dueCount > 0 ? `<span class="due-badge">${dueCount}</span>` : '';
      
      return `<div class="day-col ${index === 0 ? 'today' : ''}">
        <div class="day-name"><span>${date.toLocaleDateString('en-US', { weekday: 'short' })}</span><span>${date.getDate()}</span>${dueBadge}</div>
        ${items.length ? items.map((task) => `<span class="day-chip ${task.status}" data-task-id="${esc(task.id)}">${esc(task.id)} ${esc(task.title.slice(0, 34))}</span>`).join('') : '<div class="empty-state">—</div>'}
      </div>`;
    }).join('');
    
    if (tasksWithDeadlines < 5) {
      const note = document.createElement('div');
      note.className = 'week-note';
      note.innerHTML = `📅 ${tasksWithDeadlines} tasks have deadlines. Say "Set deadline for TASK-ID to YYYY-MM-DD" in Telegram to add more.`;
      target.appendChild(note);
    }
  }

  // ===== AGENT BOARD =====
  function renderAgentBoardSelector() {
    const select = $('agent-board-select');
    if (!select) return;
    const current = state.boardAgentId || select.value || 'chad-yi';
    select.innerHTML = state.agents.map((agent) => `<option value="${esc(agent.id)}">${esc(displayAgentName(agent))}</option>`).join('');
    select.value = state.agents.some((agent) => agent.id === current) ? current : 'chad-yi';
    state.boardAgentId = select.value;
  }

  function renderAgentBoard() {
    const board = $('agent-board');
    if (!board) return;
    const agentId = state.boardAgentId || 'chad-yi';
    const laneTasks = Object.fromEntries(BOARD_LANES.map((lane) => [lane, []]));
    state.tasks
      .filter((task) => task.agentId === agentId && task.status !== 'done')
      .forEach((task) => {
        const lane = state.visualBoardMoves.get(task.id) || (BOARD_LANES.includes(task.status) ? task.status : 'open');
        laneTasks[lane].push(task);
      });

    board.innerHTML = BOARD_LANES.map((lane) => `<div class="kanban-col" data-lane="${esc(lane)}">
      <div class="kanban-title"><span>${esc(statusLabel(lane))}</span><b>${laneTasks[lane].length}</b></div>
      ${laneTasks[lane].map((task) => `<div class="kanban-card" draggable="true" data-task-id="${esc(task.id)}"><b>${esc(task.id)}</b><br>${esc(task.title)}</div>`).join('') || '<div class="empty-state">empty</div>'}
    </div>`).join('');
    wireKanban();
  }

  // ===== FLEET =====
  function renderFleet() {
    setText('fleet-count', `${state.stats.liveAgents} live/ext — ${state.agents.length} mapped`);
    const grid = $('fleet-grid');
    if (grid) {
      grid.innerHTML = state.agents.map((agent) => {
        const image = agent.image ? `<div class="card-bg-img" style="background-image:url('${esc(assetUrl(agent.image))}');background-position:${esc(agent.imagePosition)};"></div>` : '';
        const avatar = agent.image
          ? `<div class="agent-avatar photo"><img src="${esc(assetUrl(agent.image))}" alt="${esc(displayAgentName(agent))}"></div>`
          : `<div class="agent-avatar">${esc(agent.initials)}</div>`;
        return `<article class="agent-card ${agent.image ? 'has-photo-bg' : 'ghost-agent'}" data-agent-card="${esc(agent.id)}">
          ${image}
          <div class="agent-card-header"><span class="agent-status-dot ${esc(agent.status)}"></span><span class="agent-badge ${isLiveAgent(agent.status) ? 'live' : 'not-built'}">${esc(statusBadge(agent.status))}</span></div>
          <div class="agent-card-body">${avatar}<div class="agent-name">${esc(displayAgentName(agent))}</div><div class="agent-role">${esc(agent.role)}</div></div>
          <div class="agent-card-footer">${esc(agent.currentTask || statusLabel(agent.status))}</div>
        </article>`;
      }).join('');
    }
    // Render future agents
    const futureGrid = $('fleet-future-grid');
    if (futureGrid && state.futureAgents && state.futureAgents.length) {
      futureGrid.innerHTML = state.futureAgents.map((agent) => {
        const avatar = `<div class="agent-avatar">${esc(agent.emoji || '🔮')}</div>`;
        return `<article class="agent-card ghost-agent future-agent" data-agent-card="${esc(agent.id)}" style="opacity:0.6;">
          <div class="agent-card-header"><span class="agent-status-dot planned"></span><span class="agent-badge not-built">PLANNED</span></div>
          <div class="agent-card-body">${avatar}<div class="agent-name">${esc(agent.name)}</div><div class="agent-role">${esc(agent.role)}</div></div>
          <div class="agent-card-footer">Future agent</div>
        </article>`;
      }).join('');
    } else if (futureGrid) {
      futureGrid.innerHTML = '<div class="empty-state" style="opacity:0.5;">No future agents planned</div>';
    }
  }

  // ===== PROJECTS =====
  function renderProjects() {
    const search = $('project-search');
    const filter = $('status-filter');
    const query = search ? search.value.trim().toLowerCase() : '';
    const status = filter ? filter.value : '';
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
    const target = $('project-categories');
    if (target) target.innerHTML = html || '<div class="empty-state">No projects match this filter.</div>';
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
    const meta = $('modal-meta');
    if (meta) meta.innerHTML = [
      badge(statusLabel(task.status), task.status),
      badge(task.priority, task.priority),
      badge(agentName(task.agentId), ''),
      task.deadline ? badge(`Due ${task.deadline}`, '') : ''
    ].join('');
    setText('modal-description', task.description || task.notes || task.blockReason || task.pauseReason || `Project ${task.project}. Source status: ${task.sourceStatus || task.status}.`);
    const modal = $('task-modal');
    if (modal) modal.hidden = false;
  }

  function metric(label, value) {
    return `<div class="metric-pill"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  }

  function badge(text, cls) {
    return `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
  }

  function statusLabel(status) {
    return status === 'needs_review' ? 'Needs Review' : status === 'input_requested' ? 'Input Requested' : status === 'active_on_demand' ? 'Building' : titleCase(status);
  }

  function statusShort(status) {
    if (status === 'active') return 'live';
    if (status === 'active_on_demand') return 'build';
    if (status === 'external') return 'ext';
    if (status === 'planned') return 'plan';
    return String(status || 'plan').slice(0, 5);
  }

  function statusBadge(status) {
    if (status === 'active') return 'LIVE';
    if (status === 'active_on_demand') return 'BUILDING';
    if (status === 'external') return 'EXTERNAL';
    if (status === 'blocked') return 'BLOCKED';
    if (status === 'paused') return 'PAUSED';
    return 'NOT BUILT';
  }

  function isLiveAgent(status) {
    return ['active', 'active_on_demand', 'external'].includes(status);
  }

  function displayAgentName(agent) {
    return (AGENT_VISUALS[agent.id]?.display || agent.name || agentName(agent.id)).toUpperCase();
  }

  function agentName(id) {
    const names = Object.fromEntries(Object.entries(AGENT_VISUALS).map(([key, value]) => [key, value.display || titleCase(key)]));
    return names[id] || titleCase(id);
  }

  function fallbackRole(id) {
    return AGENT_VISUALS[id]?.role || 'Planned specialist agent';
  }

  function fallbackAgentStatus(id) {
    if (id === 'chad-yi' || id === 'helios' || id === 'quanta') return 'active';
    if (id === 'autoura') return 'active_on_demand';
    if (id === 'kotler') return 'external';
    return 'planned';
  }

  function normalizeAgentStatus(value) {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('active_on_demand') || raw.includes('building')) return 'active_on_demand';
    if (raw.includes('external')) return 'external';
    if (raw.includes('blocked')) return 'blocked';
    if (raw.includes('paused')) return 'paused';
    if (raw.includes('stale')) return 'stale';
    if (raw.includes('active') || raw.includes('live')) return 'active';
    if (raw.includes('planned') || raw.includes('not_built') || raw.includes('pending')) return 'planned';
    return raw || 'planned';
  }

  function agentInitials(name, id) {
    if (id === 'eplusplus') return 'E+';
    return String(name || id).split(/[\s-]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

  function assetUrl(path) {
    const joiner = path.includes('?') ? '&' : '?';
    return `${path}${joiner}build=${encodeURIComponent(BUILD_ID)}`;
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

  function isDashboardReadOnly() {
    return !state.hermesApiAvailable;
  }

  async function detectHermesApi() {
    state.hermesApiChecked = true;
    state.hermesApiAvailable = false;
    if (!HERMES_API_CONFIGURED) return false;
    try {
      const response = await fetch(`${HERMES_API_URL.replace(/\/$/, '')}/health`, {
        method: 'GET',
        cache: 'no-store'
      });
      state.hermesApiAvailable = response.ok;
      return state.hermesApiAvailable;
    } catch (error) {
      console.info('[Mission Control] Hermes API unavailable; dashboard remains read-only.');
      state.hermesApiAvailable = false;
      return false;
    }
  }

  async function submitDashboardIntent(intentType, payload) {
    if (isDashboardReadOnly()) {
      showToast('Dashboard is read-only. Update through Telegram/Hermes.');
      return false;
    }
    try {
      const response = await fetch(`${HERMES_API_URL.replace(/\/$/, '')}/mission-control/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentType, payload, buildId: BUILD_ID })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json().catch(() => ({}));
      if (result && result.ok === false) throw new Error(result.error || 'Intent rejected');
      return true;
    } catch (error) {
      console.warn('[Mission Control] intent failed', intentType, error);
      showToast('Move was not saved. Update through Telegram/Hermes.');
      return false;
    }
  }

  async function persistPriorityOrder(ids) {
    if (isDashboardReadOnly()) {
      showToast('Dashboard is read-only. Update through Telegram/Hermes.');
      return false;
    }
    const ok = await submitDashboardIntent('priority_queue_reorder', { taskIds: ids });
    if (ok) {
      state.visualFocusOrder = ids;
      showToast('Priority order saved.');
      renderFocus();
      return true;
    }
    return false;
  }

  async function persistAgentBoardMove(taskId, lane) {
    if (isDashboardReadOnly()) {
      showToast('Dashboard is read-only. Update through Telegram/Hermes.');
      return false;
    }
    const ok = await submitDashboardIntent('agent_board_move', { taskId, lane, agentId: state.boardAgentId });
    if (ok) {
      state.visualBoardMoves.set(taskId, lane);
      showToast('Agent board move saved.');
      renderAgentBoard();
      return true;
    }
    return false;
  }

  function wireDragList(containerId, onOrder) {
    const container = $(containerId);
    if (!container) return;

    if (isDashboardReadOnly()) {
      container.querySelectorAll('[draggable="true"]').forEach((item) => {
        item.setAttribute('draggable', 'false');
        item.style.cursor = 'default';
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          showToast('Dashboard is read-only. Update through Telegram/Hermes.');
        });
      });
      return;
    }

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
    if (isDashboardReadOnly()) {
      document.querySelectorAll('#agent-board .kanban-card').forEach((card) => {
        card.setAttribute('draggable', 'false');
        card.style.cursor = 'default';
        card.addEventListener('mousedown', (e) => {
          e.preventDefault();
          showToast('Dashboard is read-only. Update through Telegram/Hermes.');
        });
      });
      return;
    }

    let dragged = null;
    document.querySelectorAll('#agent-board .kanban-card').forEach((card) => {
      card.addEventListener('dragstart', () => { dragged = card; card.style.opacity = '.45'; });
      card.addEventListener('dragend', () => { card.style.opacity = ''; dragged = null; });
    });
    document.querySelectorAll('#agent-board .kanban-col').forEach((column) => {
      column.addEventListener('dragover', (event) => event.preventDefault());
      column.addEventListener('drop', async (event) => {
        event.preventDefault();
        if (!dragged) return;
        const ok = await persistAgentBoardMove(dragged.dataset.taskId, column.dataset.lane);
        if (!ok) renderAgentBoard();
      });
    });
  }

  function startOfDay(date) {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDay(date) {
    return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
  }

  function renderStarfield() {
    const canvas = $('starfield');
    if (!canvas || canvas.dataset.ready) return;
    canvas.dataset.ready = '1';
    const ctx = canvas.getContext('2d');
    const stars = Array.from({ length: 130 }, () => ({
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
    const agentCard = event.target.closest('[data-agent-card]');
    if (agentCard) {
      const select = $('agent-board-select');
      state.boardAgentId = agentCard.dataset.agentCard;
      if (select) select.value = state.boardAgentId;
      renderAgentBoard();
      showToast(`${agentName(state.boardAgentId)} board selected.`);
      return;
    }

    const taskElement = event.target.closest('[data-task-id]');
    if (taskElement) openTask(taskElement.dataset.taskId);

    const projectElement = event.target.closest('[data-project-id]');
    if (projectElement) {
      const project = state.projects.find((item) => item.id === projectElement.dataset.projectId);
      if (project && project.tasks[0]) openTask(project.tasks[0].id);
    }

    const modal = $('task-modal');
    if ((event.target.id === 'modal-close' || event.target.id === 'task-modal') && modal) modal.hidden = true;
    if (event.target.matches('[data-refresh]')) loadData();
  });

  document.addEventListener('keydown', (event) => {
    const modal = $('task-modal');
    if (event.key === 'Escape' && modal) modal.hidden = true;
    if (event.key === 'Enter') {
      const taskElement = event.target.closest('[data-task-id]');
      if (taskElement) openTask(taskElement.dataset.taskId);
    }
  });

  const projectSearch = $('project-search');
  const statusFilter = $('status-filter');
  const boardSelect = $('agent-board-select');
  if (projectSearch) projectSearch.addEventListener('input', renderProjects);
  if (statusFilter) statusFilter.addEventListener('change', renderProjects);
  if (boardSelect) boardSelect.addEventListener('change', (event) => {
    state.boardAgentId = event.target.value;
    renderAgentBoard();
  });

  loadData();
})();
