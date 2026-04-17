        // Global data store
        let appData = null;
        let allProjects = [];
        let projectLookup = {};
        const HELIOS_API_BASE = (
            window.HELIOS_API_BASE ||
            localStorage.getItem('HELIOS_API_BASE') ||
            'http://localhost:8000'
        ).replace(/\/+$/, '');
        const HELIOS_WS_URL = (() => {
            const configured = window.HELIOS_WS_URL || localStorage.getItem('HELIOS_WS_URL');
            if (configured) return configured.replace(/\/+$/, '');
            if (HELIOS_API_BASE.startsWith('https://')) return HELIOS_API_BASE.replace(/^https:\/\//, 'wss://');
            if (HELIOS_API_BASE.startsWith('http://')) return HELIOS_API_BASE.replace(/^http:\/\//, 'ws://');
            return 'ws://localhost:8000';
        })();
        let heliosSocket = null;

        // ── TIMEZONE HELPER ──────────────────────────────────────────────────
        function sgtToday() {
            const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' });
            const d = new Date(s);
            d.setHours(0, 0, 0, 0);
            return d;
        }
        let heliosSocketRetryTimer = null;
        let heliosSocketHeartbeatTimer = null;
        let lastRealtimeRefreshMs = 0;

        // Sidebar Toggle
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const toggleArrow = document.querySelector('.sidebar-toggle-arrow');
            const toggleText = document.querySelector('.sidebar-toggle-text');
            sidebar.classList.toggle('expanded');
            const isExpanded = sidebar.classList.contains('expanded');
            if (toggleArrow) toggleArrow.textContent = isExpanded ? '◀' : '▶';
            if (toggleText)  toggleText.textContent  = isExpanded ? 'Collapse' : 'Expand';
            document.body.classList.toggle('sidebar-expanded', isExpanded);
            if (!isExpanded) closeMobileMenu();
            // Re-render sidebar agents in new layout
            if (window.appData) updateSidebarAgents(window.appData);
        }

        function updateSidebarAgents(data) {
            const footer = document.getElementById('sidebar-footer');
            if (!footer || !data) return;
            // Agent config now comes from agent-registry.js
            const agents = data.agents || {};
            const _fleetIds = getFleetIds();
            // Priority order: CHAD_YI → Cerebronn → Helios → Others
            const _priorityOrder = ['chad-yi', 'cerebronn', 'helios'];
            const agentKeys = Object.keys(agents).filter(k => !isAgentExcluded(k)).sort((a, b) => {
                const aLower = a.toLowerCase();
                const bLower = b.toLowerCase();
                const ai = _priorityOrder.indexOf(aLower);
                const bi = _priorityOrder.indexOf(bLower);
                // If both are in priority list, sort by priority
                if (ai !== -1 && bi !== -1) return ai - bi;
                // Priority agents come first
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                // Then sort by fleet order
                const af = _fleetIds.indexOf(aLower);
                const bf = _fleetIds.indexOf(bLower);
                if (af !== -1 && bf !== -1) return af - bf;
                if (af !== -1) return -1;
                if (bf !== -1) return 1;
                return a.localeCompare(b);
            });
            // Also add configured fleet agents not in data
            _fleetIds.forEach(id => { if (!agentKeys.includes(id)) agentKeys.push(id); });

            const isExpanded = document.getElementById('sidebar')?.classList.contains('expanded');

            // Header
            const onlineCount = agentKeys.filter(id => {
                const meta = getAgentSignalMeta(id, data);
                return meta.tone === 'online';
            }).length;
            let headerHtml = `<div style="font-size:8px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(220,38,38,0.6);margin-bottom:6px;text-align:center;font-weight:700;">FLEET ${onlineCount}/${agentKeys.length}</div>`;

            footer.innerHTML = headerHtml + agentKeys.map(function(id) {
                const meta = getAgentSignalMeta(id, data);
                const _ac = getAgentConfig(id);
                const c = { init: _ac.initials, bg: _ac.colors.bg, bd: _ac.colors.border, col: _ac.colors.text };
                const ag = agents[id] || {};

                // For expanded view: show role and last active
                const lastActive = ag.lastActive ? formatRelativeTimestamp(ag.lastActive) : 'no signal';
                const task = ag.currentTask ? String(ag.currentTask).slice(0, 40) : '';

                if (isExpanded) {
                    const statusCls = meta.tone === 'online' ? 'online' : meta.tone === 'blocked' ? 'blocked' : 'offline';
                    const taskDisplay = task ? escHtml(task.replace(/^TASK-|\.md$/gi, '').slice(0, 38)) : '';
                    return `<div class="sidebar-agent-dot" style="background:${c.bg};border:1px solid ${c.bd};">
                        <div class="sidebar-agent-row1">
                            <span class="agent-init" style="color:${c.col};">${c.init}</span>
                            <span class="agent-name">${escHtml(formatAgentDisplay(id))}</span>
                            <span class="dot-status ${statusCls}"></span>
                        </div>
                        <div class="sidebar-agent-row2">
                            <span class="sidebar-agent-status-line">${escHtml(meta.label)} · ${escHtml(lastActive)}</span>
                            ${taskDisplay ? `<span class="sidebar-agent-task-line">${taskDisplay}</span>` : ''}
                        </div>
                    </div>`;
                }

                // Collapsed: original dot view
                const tip = escHtml(formatAgentDisplay(id)) + ' · ' + escHtml(meta.label.toUpperCase()) + ' · ' + escHtml((meta.detail || '').slice(0, 110));
                return '<div class="sidebar-agent-dot" style="background:' + (c.bg||'') + ';border:1px solid ' + (c.bd||'') + '">'
                     + '<span style="color:' + (c.col||'#aaa') + ';font-size:9px;font-weight:700">' + (c.init||id.slice(0,2).toUpperCase()) + '</span>'
                     + '<span class="dot-status ' + meta.dotClass + '"></span>'
                     + '<span class="dot-tip">' + tip + '</span>'
                     + '</div>';
            }).join('');
        }

        // Section Navigation removed (multi-page navigation uses normal links)

        // Project Card Toggle
        function toggleProject(header) {
            const card = header.closest('.project-card');
            card.classList.toggle('expanded');
        }

        // Quick Actions
        function quickAction(action) {
            alert(`${action} - Feature coming soon!`);
        }

        function syncProjectLookup() {
            projectLookup = allProjects.reduce((map, proj) => {
                map[proj.id] = proj;
                return map;
            }, {});
            if (window.ProjectTasksModal && typeof window.ProjectTasksModal.setProjectLookup === 'function') {
                window.ProjectTasksModal.setProjectLookup(projectLookup);
            }
        }

        function normalizePriority(priority) {
            const normalized = String(priority || '').toLowerCase();
            if (normalized === 'critical' || normalized === 'urgent' || normalized === 'high') return 'high';
            if (normalized === 'medium') return 'medium';
            return 'low';
        }

        function normalizeProjectResources(resources = []) {
            if (!Array.isArray(resources)) return [];
            return resources
                .map((resource, index) => {
                    if (typeof resource === 'string') {
                        return {
                            id: `resource-${index}`,
                            title: resource,
                            type: 'doc',
                            url: resource
                        };
                    }
                    if (!resource || !resource.url) return null;
                    return {
                        id: resource.id || `resource-${index}`,
                        title: resource.title || resource.label || 'Resource',
                        type: resource.type || 'doc',
                        url: resource.url
                    };
                })
                .filter(Boolean);
        }

        function projectIdFromTask(task) {
            return String(task?.project || task?.id || '').replace(/-\d+$/, '');
        }

        function getDefaultProjectDetails() {
            return {
                A1: { name: 'Personal', description: 'Personal admin, travel, certifications' },
                A2: { name: 'RE:UNITE', description: 'Isekai novel writing project' },
                A3: { name: 'KOE', description: 'YouTube / TikTok content channel' },
                A4: { name: 'Streaming', description: 'VTuber streaming setup' },
                A5: { name: 'Trading', description: 'Forex / Gold automated trading (Quanta)' },
                A6: { name: 'Mission Control', description: 'AI agent dashboard and operations stack' },
                A7: { name: 'Wedding', description: 'Wedding planning for Dec 12–13' },
                B1: { name: 'Exstatic', description: 'Business project' },
                B2: { name: 'Energize', description: 'Business project' },
                B3: { name: 'Team Elevate', description: 'Corporate training platform' },
                B4: { name: 'Pesta Fiesta', description: 'Business project' },
                B5: { name: 'Enticipate', description: 'Business project' },
                B6: { name: 'Elluminate', description: 'Events and corporate activations' },
                B7: { name: 'Encompasse', description: 'Business project' },
                B8: { name: 'Empyrean', description: 'Video production project' },
                B9: { name: 'Ethereal', description: '3D printing venture' },
                B10: { name: 'Epitaph', description: 'Data tracking project' },
                C1: { name: 'Real Estate', description: 'RES exam preparation, June 2026' },
                C2: { name: 'Side Sales', description: 'Side sales operations' },
                C3: { name: 'Vibe Coding', description: 'Games and apps — vibe coding side projects' }
            };
        }

        // normalizeAgentId() — provided by agent-registry.js
        // formatAgentDisplay() — provided by agent-registry.js

        function getProjectNameById(projectId, data = window.appData) {
            if (!projectId) return 'Unknown project';
            const details = data && data.projectDetails ? data.projectDetails[projectId] : null;
            return details && details.name ? details.name : projectId;
        }

        function getTaskProjectLabel(task, data = window.appData) {
            const projectId = projectIdFromTask(task);
            return projectId ? `${projectId} · ${getProjectNameById(projectId, data)}` : 'No project';
        }

        // isUserAgent() — provided by agent-registry.js

        function getNeedsAttentionEntries(data = window.appData) {
            return Array.isArray(data?.needsAttention) ? data.needsAttention : [];
        }

        function getInputRequestEntries(data = window.appData) {
            return Array.isArray(data?.inputsNeeded)
                ? data.inputsNeeded
                : Object.values(data?.inputsNeeded || {});
        }

        function getInputRequestTaskIds(data = window.appData) {
            return new Set(getInputRequestEntries(data).map(item => item?.taskId || item?.id).filter(Boolean));
        }

        function getAttentionFromOthersTaskIds(data = window.appData) {
            return new Set(
                getNeedsAttentionEntries(data)
                    .filter(item => !isUserAgent(item?.owner || item?.requiredBy || item?.agent || ''))
                    .map(item => item?.id || item?.taskId)
                    .filter(Boolean)
            );
        }

        function isTaskVerifiedActive(task, data = window.appData) {
            if (!task || task.status !== 'active') return false;
            const responsible = normalizeAgentId(task.agent || task.assignedTo || 'chad-yi') || 'chad-yi';
            const signalMeta = getAgentSignalMeta(responsible, data);
            return signalMeta.tone === 'online';
        }

        function getTaskPrimaryLane(task, data = window.appData) {
            if (!task) return { key: 'open-work', label: 'Open Work' };
            const status = task.status || 'pending';
            const inputIds = getInputRequestTaskIds(data);
            const attentionFromOthersIds = getAttentionFromOthersTaskIds(data);

            if (status === 'done') return { key: 'completed', label: 'Completed' };
            if (status === 'review') return { key: 'needs-review', label: 'Needs My Review' };
            if (inputIds.has(task.id) || attentionFromOthersIds.has(task.id)) {
                return { key: 'needs-input', label: 'Needs My Input' };
            }
            if (isUserAgent(task.agent || task.assignedTo || '')) {
                return { key: 'needs-me', label: 'Needs Me' };
            }
            if (isTaskVerifiedActive(task, data)) {
                return { key: 'active-work', label: 'Active Work' };
            }
            return { key: 'open-work', label: 'Open Work' };
        }

        function getTaskAboutText(task, data = window.appData) {
            if (task?.description) return task.description;
            if (task?.notes && task.notes.length > 18) return task.notes;
            const projectLabel = getTaskProjectLabel(task, data);
            const statusHints = {
                blocked: 'Currently blocked — add a Notes entry in ACTIVE.md to describe what needs to be unblocked.',
                paused:  'Currently paused — add a Notes entry in ACTIVE.md to describe why this is on hold.',
                review:  'Awaiting review. Add a Notes entry in ACTIVE.md to provide context for the reviewer.',
                active:  'Actively being worked on. Add a Notes entry in ACTIVE.md to log progress.',
                done:    'Task completed.'
            };
            const hint = statusHints[task?.status];
            if (hint) return `${task?.title || 'This task'} · ${projectLabel}. ${hint}`;
            return `${task?.title || 'This task'} · ${projectLabel}. Add a Notes column in ACTIVE.md to see the full brief here.`;
        }

        function getTaskProgressText(task) {
            if (task?.notes) return task.notes;
            if (task?.status === 'done') {
                return task?.completedAt
                    ? `Marked complete ${formatAbsoluteTimestamp(task.completedAt)}.`
                    : 'Marked complete, but no completion note was logged.';
            }
            if (task?.status === 'active')  return 'Actively in progress. No progress note logged yet — add one in ACTIVE.md.';
            if (task?.status === 'review')  return 'Waiting for review. No review note logged yet — add one in ACTIVE.md.';
            if (task?.status === 'blocked') return task?.blockReason  ? `Blocked: ${task.blockReason}` : 'Blocked. Add a reason in ACTIVE.md (e.g. "BLOCKED - Waiting for X").';
            if (task?.status === 'paused')  return task?.pauseReason || task?.blockReason ? `Paused: ${task.pauseReason || task.blockReason}` : 'Paused. Add a reason in ACTIVE.md (e.g. "PAUSED - Waiting for X").';
            return 'No progress update has been logged yet.';
        }

        function getTaskDetailModel(task, data = window.appData) {
            const lane = getTaskPrimaryLane(task, data);
            return {
                lane,
                projectLabel: getTaskProjectLabel(task, data),
                personAgent: formatAgentDisplay(task?.agent || task?.assignedTo || 'chad-yi'),
                about: getTaskAboutText(task, data),
                progress: getTaskProgressText(task)
            };
        }

        function groupTasksByDecisionState(tasks, data = window.appData) {
            const groups = {
                needsMe: [],
                needsReview: [],
                needsInput: [],
                activeWork: [],
                otherOpen: [],
                completed: []
            };

            (tasks || []).forEach(task => {
                const lane = getTaskPrimaryLane(task, data).key;
                if (lane === 'completed') groups.completed.push(task);
                else if (lane === 'needs-review') groups.needsReview.push(task);
                else if (lane === 'needs-input') groups.needsInput.push(task);
                else if (lane === 'needs-me') groups.needsMe.push(task);
                else if (lane === 'active-work') groups.activeWork.push(task);
                else groups.otherOpen.push(task);
            });

            Object.keys(groups).forEach(key => {
                groups[key] = key === 'completed'
                    ? [...groups[key]].sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
                    : sortTasksForAttention(groups[key], sgtToday());
            });

            return groups;
        }

        function dedupeTasksById(tasks) {
            const seen = new Set();
            return (tasks || []).filter(task => {
                if (!task || !task.id || seen.has(task.id)) return false;
                seen.add(task.id);
                return true;
            });
        }

        function sortTasksForAttention(tasks, today = sgtToday()) {
            return [...(tasks || [])].sort((a, b) => {
                function score(task) {
                    let total = 0;
                    const priority = normalizePriority(task.priority);
                    if (task.status === 'blocked') total += 90;
                    if (task.status === 'review') total += 65;
                    if (task.status === 'active') total += 45;
                    if (priority === 'high') total += 35;
                    else if (priority === 'medium') total += 15;
                    if (task.deadline) {
                        const dl = new Date(task.deadline);
                        dl.setHours(0, 0, 0, 0);
                        const days = Math.round((dl - today) / 86400000);
                        if (days < 0) total += 60 + Math.abs(days) * 5;
                        else if (days === 0) total += 40;
                        else total += Math.max(0, 12 - days);
                    }
                    return total;
                }
                return score(b) - score(a);
            });
        }

        function getDashboardLens(data) {
            const tasks = Object.values(data?.tasks || {});
            const today = sgtToday();
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - 6);
            const needsAttentionIds = new Set((Array.isArray(data?.needsAttention) ? data.needsAttention : []).map(item => item?.id).filter(Boolean));
            const groups = groupTasksByDecisionState(tasks, data);

            const completedToday = tasks.filter(task => task.status === 'done' && task.completedAt && (() => {
                const date = new Date(task.completedAt);
                date.setHours(0, 0, 0, 0);
                return date.getTime() === today.getTime();
            })());

            const completedWeek = tasks.filter(task => task.status === 'done' && task.completedAt && new Date(task.completedAt) >= weekStart)
                .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

            const overdueTasks = tasks.filter(task => task.status !== 'done' && task.deadline && (() => {
                const date = new Date(task.deadline);
                date.setHours(0, 0, 0, 0);
                return date < today;
            })());

            const attentionTasks = dedupeTasksById(sortTasksForAttention([
                ...tasks.filter(task => task.status === 'blocked'),
                ...overdueTasks,
                ...tasks.filter(task => needsAttentionIds.has(task.id))
            ], today));

            const reviewTasks = sortTasksForAttention(tasks.filter(task => task.status === 'review'), today);
            const myInputTasks = groups.needsInput;
            const needsMeTasks = groups.needsMe;
            const needsMeAggregate = dedupeTasksById([
                ...groups.needsMe,
                ...groups.needsReview,
                ...groups.needsInput
            ]);
            const activeWorkTasks = groups.activeWork;
            const nextUpTasks = sortTasksForAttention(tasks.filter(task => task.status !== 'done' && task.status !== 'backlog'), today)
                .filter(task => !attentionTasks.some(item => item.id === task.id))
                .filter(task => !needsMeAggregate.some(item => item.id === task.id));

            return {
                today,
                tasks,
                completedToday,
                completedWeek,
                attentionTasks,
                needsMeTasks,
                needsMeAggregate,
                reviewTasks,
                myInputTasks,
                activeWorkTasks,
                nextUpTasks
            };
        }

        // getAgentSignalMeta() — provided by agent-registry.js

        function normalizeDashboardData(rawData) {
            const data = JSON.parse(JSON.stringify(rawData || {}));

            // Bridge helios-v3 format: if projects has flat IDs (A1, A2...) instead of categories (A, B, C), rebuild
            if (data.projects && !data.projects.A && Object.keys(data.projects).some(k => /^[ABC]\d+$/.test(k))) {
                const cats = data.categories || {};
                const flatProjects = data.projects;
                data.projects = {};
                for (const [catLetter, catInfo] of Object.entries(cats)) {
                    data.projects[catLetter] = {
                        name: catLetter + ' - ' + (catInfo.name || catLetter),
                        projects: (catInfo.projects || []).filter(p => flatProjects[p])
                    };
                }
                // Merge flat project details into projectDetails
                data.projectDetails = { ...getDefaultProjectDetails(), ...(data.projectDetails || {}), ...flatProjects };
            }

            data.projects = data.projects || {};
            data.projects.A = data.projects.A || { name: 'A - Ambition', projects: [] };
            data.projects.B = data.projects.B || { name: 'B - Business', projects: [] };
            data.projects.C = data.projects.C || { name: 'C - Callings', projects: [] };

            if (!Array.isArray(data.projects.A.projects)) data.projects.A.projects = [];

            data.projectDetails = {
                ...getDefaultProjectDetails(),
                ...(data.projectDetails || {})
            };

            data.tasks = data.tasks || {};
            Object.values(data.tasks).forEach(task => {
                task.project = projectIdFromTask(task);
                if (task.status !== 'done') {
                    task.priority = normalizePriority(task.priority);
                }
            });

            data.workflow = data.workflow || {};
            ['pending', 'active', 'review', 'done', 'urgent', 'blocked', 'paused'].forEach(key => {
                if (!Array.isArray(data.workflow[key])) data.workflow[key] = [];
            });

            const completedTaskSet = new Set(data.workflow.done);
            const uniqueAttention = [];
            const seenAttention = new Set();
            (Array.isArray(data.needsAttention) ? data.needsAttention : []).forEach(item => {
                const id = item?.id || item?.taskId;
                if (!id || completedTaskSet.has(id) || !data.tasks[id] || seenAttention.has(id)) return;
                seenAttention.add(id);
                uniqueAttention.push(item);
            });
            data.needsAttention = uniqueAttention;

            const allTasks = Object.values(data.tasks);
            const doneTasks = allTasks.filter(task => task.status === 'done');
            const activeTasks = allTasks.filter(task => task.status === 'active');
            const blockedTasks = allTasks.filter(task => task.status === 'blocked');
            const backlogTasks = allTasks.filter(task => task.status === 'backlog' || task.status === 'pending');
            const urgentTasks = allTasks.filter(task => task.status !== 'done' && normalizePriority(task.priority) === 'high');
            const reviewTasks = allTasks.filter(task => task.status === 'review');

            // Trust helios stats, only fill in dashboard-specific extras
            const heliosStats = data.stats || {};
            data.stats = {
                totalTasks: heliosStats.totalTasks ?? allTasks.length,
                tasksLeft: heliosStats.tasksLeft ?? (allTasks.length - doneTasks.length),
                completedTasks: heliosStats.completedTasks ?? doneTasks.length,
                completedToday: heliosStats.completedToday ?? 0,
                completedThisWeek: heliosStats.completedThisWeek ?? 0,
                critical: heliosStats.critical ?? 0,
                urgent: heliosStats.urgent ?? urgentTasks.length,
                active: heliosStats.active ?? activeTasks.length,
                blocked: heliosStats.blocked ?? blockedTasks.length,
                review: heliosStats.review ?? reviewTasks.length,
                backlog: heliosStats.backlog ?? backlogTasks.length,
                completionRate: Math.round((doneTasks.length / Math.max(1, allTasks.length)) * 100),
                needsAttention: data.needsAttention.length
            };

            data.taskSummary = {
                critical: data.stats.critical,
                urgent: data.stats.urgent,
                active: data.stats.active,
                blocked: data.stats.blocked,
                backlog: data.stats.backlog,
                done: doneTasks.length
            };

            // Trust helios dailyBriefing, only add dashboard-computed extras if missing
            const heliosBriefing = data.dailyBriefing || {};
            const topPriorities = heliosBriefing.topPriorities && heliosBriefing.topPriorities.length
                ? heliosBriefing.topPriorities.slice(0, 5)
                : (data.needsAttention.length
                    ? data.needsAttention.slice(0, 5).map(item => ({ id: item.id, title: item.title, owner: item.owner }))
                    : urgentTasks.slice(0, 5).map(task => ({ id: task.id, title: task.title, owner: task.agent || '—' })));

            data.dailyBriefing = {
                ...heliosBriefing,
                summary: heliosBriefing.summary || {
                    total_tasks: allTasks.length,
                    critical: data.stats.critical,
                    urgent: urgentTasks.length,
                    active: activeTasks.length,
                    blocked: blockedTasks.length,
                    review: reviewTasks.length,
                    done: doneTasks.length
                },
                top_priorities: topPriorities,
                agent_health: heliosBriefing.agentHealth || Object.fromEntries(Object.entries(data.agents || {}).map(([id, agent]) => [id, agent.health || agent.status || 'unknown']))
            };

            return data;
        }

        function deriveProjectStatus(projTasks = []) {
            if (!projTasks.length) return 'pending';
            if (projTasks.some(task => task.status === 'blocked')) return 'blocked';
            if (projTasks.some(task => task.status === 'active')) return 'active';
            if (projTasks.some(task => task.status === 'review')) return 'review';
            if (projTasks.every(task => task.status === 'done')) return 'done';
            return 'pending';
        }

        function buildProjectsFromData(data) {
            const projects = [];
            if (!data || !data.projects) return projects;

            Object.keys(data.projects).forEach(catKey => {
                const cat = data.projects[catKey];
                if (!cat.projects) return;

                cat.projects.forEach(projId => {
                    const tasks = data.tasks || {};
                    const projTasks = Object.values(tasks).filter(t => (t.id || '').replace(/-\d+$/, '') === projId);
                    const taskStats = calculateTaskStats(projTasks);
                    const projDetails = data.projectDetails && data.projectDetails[projId] ? data.projectDetails[projId] : {};

                    projects.push({
                        id: projId,
                        category: catKey,
                        categoryName: cat.name,
                        name: projDetails.name || projId,
                        description: projDetails.description || '',
                        resources: normalizeProjectResources(projDetails.resources),
                        tasks: projTasks,
                        stats: taskStats,
                        status: deriveProjectStatus(projTasks),
                        priorityBreakdown: getPriorityBreakdown(projTasks),
                        timeTracking: calculateTimeTracking(projTasks),
                        nextDeadline: getNextDeadline(projTasks),
                        milestones: generateMilestones({id: projId}, projTasks),
                        timeline: buildProjectTimeline(projTasks)
                    });
                });
            });

            return projects;
        }

        function setActiveSectionLink(name) {
            document.querySelectorAll('[data-section]').forEach(link => {
                link.classList.toggle('active', link.dataset.section === name);
            });
        }

        async function loadHeliosSyncBootstrap() {
            const url = `${HELIOS_API_BASE}/api/sync?t=${Date.now()}`;
            try {
                const response = await fetch(url, { method: 'GET', cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Helios sync failed (${response.status})`);
                }
                const sync = await response.json();
                console.log('[Helios] sync bootstrap ok:', {
                    apiBase: HELIOS_API_BASE,
                    wsBase: HELIOS_WS_URL,
                    agents: Array.isArray(sync?.agents) ? sync.agents.length : 'n/a',
                    events: Array.isArray(sync?.recent_events) ? sync.recent_events.length : 'n/a'
                });
                // Populate agent rail + fleet
                if (Array.isArray(sync.agents) && sync.agents.length) {
                    renderAgentRail(sync.agents);
                    renderAgentFleet(sync.agents);
                    if (typeof updateFleetPanel === 'function') updateFleetPanel(sync);
                }
                appendLiveFeedLine('HELIOS', 'heartbeat', 'sync bootstrap ok — ' + (sync.agents?.length || 0) + ' agents online');
            } catch (error) {
                console.warn('[Helios] sync bootstrap unavailable, using polling fallback:', error.message || error);
            }
        }

        function renderAgentRail(agents) {
            const rail = document.getElementById('agent-rail');
            if (!rail) return;
            rail.innerHTML = agents.map(a => {
                const status = (a.status || 'offline').toLowerCase();
                const seen = a.last_seen ? relTime(a.last_seen) : '';
                return `<div class="agent-pill" title="${a.name} — ${a.role || ''}">` +
                    `<span class="pill-dot ${status}"></span>` +
                    `<span>${(a.name || 'AGENT').toUpperCase()}</span>` +
                    (seen ? `<span class="pill-seen">${seen}</span>` : '') +
                    `</div>`;
            }).join('');
        }

        function relTime(iso) {
            try {
                const diff = Date.now() - new Date(iso).getTime();
                if (diff < 60000)  return 'just now';
                if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
                if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
                return Math.floor(diff / 86400000) + 'd';
            } catch(e) { return ''; }
        }

        function triggerImmediateRefresh(reason = 'realtime') {
            const now = Date.now();
            if (now - lastRealtimeRefreshMs < 1000) {
                return;
            }
            lastRealtimeRefreshMs = now;
            console.log(`[Helios WS] trigger refresh: ${reason}`);
            if (window.smartPoll && typeof window.smartPoll.checkNow === 'function') {
                window.smartPoll.checkNow();
                return;
            }
            loadData();
        }

        function connectHeliosDashboardSocket() {
            if (heliosSocket && (heliosSocket.readyState === WebSocket.OPEN || heliosSocket.readyState === WebSocket.CONNECTING)) {
                return;
            }

            const wsUrl = `${HELIOS_WS_URL}/ws/dashboard`;
            try {
                heliosSocket = new WebSocket(wsUrl);
            } catch (error) {
                console.warn('[Helios WS] failed to create websocket:', error.message || error);
                scheduleHeliosSocketReconnect();
                return;
            }

            heliosSocket.onopen = () => {
                                _resetWsRetryDelay();
console.log('[Helios WS] connected:', wsUrl);
                setFeedStatus(true);
                appendLiveFeedLine('HELIOS', 'heartbeat', 'WebSocket connected');
                if (heliosSocketRetryTimer) {
                    clearTimeout(heliosSocketRetryTimer);
                    heliosSocketRetryTimer = null;
                }
                if (heliosSocketHeartbeatTimer) clearInterval(heliosSocketHeartbeatTimer);
                heliosSocketHeartbeatTimer = setInterval(() => {
                    if (heliosSocket && heliosSocket.readyState === WebSocket.OPEN) {
                        heliosSocket.send('ping');
                    }
                }, 25000);
            };

            heliosSocket.onmessage = (evt) => {
                try {
                    const payload = JSON.parse(evt.data);
                    const type = payload?.type;
                    const agent = payload?.agent || payload?.source || '';
                    const text  = payload?.message || payload?.event || payload?.data || type || 'event';
                    if (type !== 'heartbeat') {
                        const evtClass = (type === 'error') ? 'error' : (type === 'task_done' || type === 'complete') ? 'done' : 'heartbeat';
                        appendLiveFeedLine(agent, evtClass, String(text).slice(0, 80));
                    }
                    if (type === 'event' || type === 'heartbeat' || type === 'task_done' || type === 'complete' || type === 'data_updated') {
                        triggerImmediateRefresh(type);
                    }
                    if (typeof handleRealtimeEvent === 'function') handleRealtimeEvent(payload);
                } catch (_) {
                    // ignore non-JSON
                }
            };

            heliosSocket.onerror = (error) => {
                console.warn('[Helios WS] socket error:', error);
                appendLiveFeedLine('HELIOS', 'error', 'WS error — reconnecting…');
                scheduleHeliosSocketReconnect();
            };

            heliosSocket.onclose = () => {
                console.warn('[Helios WS] disconnected, fallback polling remains active');
                setFeedStatus(false);
                appendLiveFeedLine('HELIOS', 'error', 'WebSocket disconnected — polling fallback active');
                if (heliosSocketHeartbeatTimer) {
                    clearInterval(heliosSocketHeartbeatTimer);
                    heliosSocketHeartbeatTimer = null;
                }
                scheduleHeliosSocketReconnect();
            };
        }

        let _wsRetryDelay = 3000;
        function scheduleHeliosSocketReconnect() {
            if (heliosSocketRetryTimer) return;
            heliosSocketRetryTimer = setTimeout(() => {
                heliosSocketRetryTimer = null;
                connectHeliosDashboardSocket();
            }, _wsRetryDelay);
            _wsRetryDelay = Math.min(_wsRetryDelay * 2, 60000); // cap at 60s
        }
        function _resetWsRetryDelay() { _wsRetryDelay = 3000; }


        // Load Data


        async function loadData() {
            try {
                console.log('Loading data...');
                const response = await fetch('data.json?t=' + Date.now()); // local data — always fresh
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                appData = normalizeDashboardData(await response.json());
                console.log('Data loaded:', Object.keys(appData));
                console.log('Stats:', appData.stats);
                console.log('Tasks count:', Object.keys(appData.tasks || {}).length);

                // Cache for offline fallback
                try { localStorage.setItem('rs_dashboard_cache', JSON.stringify(appData)); } catch(e) {}

                allProjects = buildProjectsFromData(appData);

                syncProjectLookup();

                // Render both sections
                window.appData = appData;
                renderHomeSection();
                renderCategoriesSection();
                renderResourcesSection();
                updateSidebarAgents(appData);
                if (typeof updateFleetPanel === 'function') updateFleetPanel(appData);
                console.log('Rendering complete. allProjects:', allProjects.length);

            } catch (error) {
                console.error('Failed to load data:', error);
                console.error('Error stack:', error.stack);

                // Try localStorage fallback
                try {
                    const cached = localStorage.getItem('rs_dashboard_cache');
                    if (cached) {
                        console.log('Using cached data (offline fallback)');
                        appData = JSON.parse(cached);
                        allProjects = buildProjectsFromData(appData);
                        syncProjectLookup();
                        window.appData = appData;
                        renderHomeSection();
                        renderCategoriesSection();
                        renderResourcesSection();
                        updateSidebarAgents(appData);
                        if (typeof updateFleetPanel === 'function') updateFleetPanel(appData);
                        return;
                    }
                } catch(e) { console.warn('Cache fallback failed:', e); }
                
                const errorMessage = `
                    <div style="text-align: center; color: #ff6b6b; padding: 40px;">
                        <div style="font-weight: 600; margin-bottom: 8px;">⚠️ Error loading data</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${error.message}</div>
                        <div style="font-size: 10px; margin-top: 12px; color: var(--text-secondary);">Check browser console (F12) for details</div>
                    </div>
                `;
                
                // Safe element updates with null checks
                const urgentQueue = document.getElementById('urgent-queue');
                const agentActivity = document.getElementById('agent-activity');
                const inputNeeded = document.getElementById('input-needed');
                const catLoading = document.getElementById('cat-loading-state');
                const catError = document.getElementById('cat-error-state');
                
                if (urgentQueue) urgentQueue.innerHTML = errorMessage;
                if (agentActivity) agentActivity.innerHTML = errorMessage;
                if (inputNeeded) inputNeeded.innerHTML = errorMessage;
                if (catLoading) catLoading.style.display = 'none';
                if (catError) catError.style.display = 'block';
            }
        }

        // Calculate comprehensive task statistics
        function calculateTaskStats(tasks) {
            const openTasks = tasks.filter(t => t.status !== 'done');
            return {
                total: tasks.length,
                pending: tasks.filter(t => t.status === 'pending').length,
                active: tasks.filter(t => t.status === 'active').length,
                blocked: tasks.filter(t => t.status === 'blocked').length,
                review: tasks.filter(t => t.status === 'review').length,
                done: tasks.filter(t => t.status === 'done').length,
                left: openTasks.length,
                highPriority: openTasks.filter(t => normalizePriority(t.priority) === 'high').length,
                mediumPriority: openTasks.filter(t => normalizePriority(t.priority) === 'medium').length,
                lowPriority: openTasks.filter(t => normalizePriority(t.priority) === 'low').length,
                urgent: openTasks.filter(t => normalizePriority(t.priority) === 'high').length
            };
        }

        // Get priority breakdown
        function getPriorityBreakdown(tasks) {
            return {
                high: tasks.filter(t => normalizePriority(t.priority) === 'high').length,
                medium: tasks.filter(t => normalizePriority(t.priority) === 'medium').length,
                low: tasks.filter(t => normalizePriority(t.priority) === 'low').length
            };
        }

        // Calculate time tracking (simulated based on task data)
        function calculateTimeTracking(tasks) {
            const estimatedHours = tasks.reduce((sum, t) => {
                if (t.notes && t.notes.includes('hr')) {
                    const match = t.notes.match(/(\d+)[\s-]*(\d*)\s*hr/i);
                    if (match) {
                        const hours = match[2] ? (parseInt(match[1]) + parseInt(match[2])) / 2 : parseInt(match[1]);
                        return sum + hours;
                    }
                }
                return sum + 2; // Default 2 hours per task
            }, 0);

            const completedTasks = tasks.filter(t => t.status === 'done').length;
            const totalTasks = tasks.length;
            const spentHours = totalTasks > 0 ? (completedTasks / totalTasks) * estimatedHours * 0.8 : 0;

            return {
                estimated: Math.round(estimatedHours),
                spent: Math.round(spentHours),
                remaining: Math.max(0, Math.round(estimatedHours - spentHours))
            };
        }

        // Get next deadline
        function getNextDeadline(tasks) {
            const pendingTasks = tasks.filter(t => t.status !== 'done');
            if (pendingTasks.length === 0) return null;

            const sorted = pendingTasks.sort((a, b) => {
                if (a.priority === 'high' && b.priority !== 'high') return -1;
                if (b.priority === 'high' && a.priority !== 'high') return 1;
                return new Date(a.createdAt) - new Date(b.createdAt);
            });

            const task = sorted[0];
            const created = new Date(task.createdAt);
            const daysToAdd = task.priority === 'high' ? 3 : (task.priority === 'medium' ? 7 : 14);
            const deadline = new Date(created);
            deadline.setDate(deadline.getDate() + daysToAdd);

            return {
                task: task,
                date: deadline,
                priority: task.priority
            };
        }

        // Generate milestones
        function generateMilestones(project, tasks) {
            const milestones = [];
            const totalTasks = tasks.length;
            const completedTasks = tasks.filter(t => t.status === 'done').length;

            for (let i = 1; i <= 4; i++) {
                const threshold = i * 0.25;
                const milestoneTasks = Math.floor(totalTasks * threshold);
                const isCompleted = completedTasks >= milestoneTasks && milestoneTasks > 0;
                const isActive = !isCompleted && completedTasks >= milestoneTasks - Math.ceil(totalTasks * 0.1);

                milestones.push({
                    number: i,
                    label: `${i * 25}%`,
                    completed: isCompleted,
                    active: isActive,
                    tasksRequired: milestoneTasks
                });
            }

            return milestones;
        }

        function safeParseDate(value) {
            const date = value ? new Date(value) : new Date();
            return isNaN(date.getTime()) ? new Date() : date;
        }

        function estimateTaskDuration(task) {
            if (task.completedAt) {
                const start = safeParseDate(task.createdAt);
                const end = safeParseDate(task.completedAt);
                const diff = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
                return diff;
            }

            if (task.status === 'review') return 2;
            if (task.status === 'active') return 3;
            if (task.status === 'done') return 2;

            if (task.priority === 'high') return 5;
            if (task.priority === 'medium') return 4;
            return 3;
        }

        function buildProjectTimeline(tasks) {
            if (!tasks || tasks.length === 0) {
                return { items: [], start: null, end: null, duration: 0 };
            }

            const items = tasks.map(task => {
                const start = safeParseDate(task.createdAt);
                let end = task.completedAt ? safeParseDate(task.completedAt) : new Date(start);

                if (!task.completedAt) {
                    end.setDate(end.getDate() + estimateTaskDuration(task));
                }

                if (end < start) {
                    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                }

                return {
                    id: task.id,
                    title: task.title,
                    status: task.status || 'pending',
                    priority: task.priority || 'medium',
                    start,
                    end
                };
            }).sort((a, b) => a.start - b.start);

            const startDate = items.reduce((min, item) => item.start < min ? item.start : min, items[0].start);
            const endDate = items.reduce((max, item) => item.end > max ? item.end : max, items[0].end);
            const duration = Math.max(1, endDate - startDate);

            return { items, start: startDate, end: endDate, duration };
        }

        function formatTimelineDate(date) {
            if (!date || isNaN(date.getTime())) return 'TBD';
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        function formatRelativeTimestamp(value) {
            if (!value) return '—';
            const date = new Date(value);
            if (isNaN(date.getTime())) return '—';
            const diffMs = Date.now() - date.getTime();
            if (diffMs <= 0) return 'Just now';
            const minutes = Math.floor(diffMs / 60000);
            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) {
                const remMinutes = minutes % 60;
                return `${hours}h${remMinutes ? ' ' + remMinutes + 'm' : ''} ago`;
            }
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;
            return `${days}d${remHours ? ' ' + remHours + 'h' : ''} ago`;
        }

        function formatAbsoluteTimestamp(value) {
            if (!value) return '—';
            const date = new Date(value);
            if (isNaN(date.getTime())) return '—';
            return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        }

        // Format countdown
        function formatCountdown(targetDate) {
            const now = new Date();
            const diff = targetDate - now;

            if (diff < 0) return 'OVERDUE';

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            if (days > 0) return `${days}d ${hours}h`;
            return `${hours}h`;
        }

        // Get priority class
        function getPriorityClass(priority) {
            const normalized = normalizePriority(priority);
            if (normalized === 'high') return 'high-priority';
            if (normalized === 'medium') return 'medium-priority';
            return 'low-priority';
        }

        // ===== REDESIGNED HOME SECTION RENDERING =====
        function renderHomeSection() {
            // Call new homepage renderer
            renderNewHomepage(appData);

            // Keep old rendering for backwards compatibility
            const stats = appData.stats || {};
            // Convert agents object to array (fix infrastructure bug)
            const agents = appData.agents ? Object.entries(appData.agents).map(([id, data]) => ({id, ...data})) : [];
            // Convert tasks object to array for iteration
            const allTasks = Object.values(appData.tasks || {});
            const workflow = appData.workflow || {};

            const urgentCount = stats.urgentTasks ?? allTasks.filter(t => t.priority === 'high' && t.status !== 'done').length;

            const focusProject = stats.focusProject || '—';
            const systemHealth = stats.systemHealth || 'Nominal';
            const eventsToday = stats.eventsToday != null ? stats.eventsToday : 0;
            const lastUpdated = appData.lastUpdated;

            // Old rendering continues...
        }

        function renderActiveTasksBoard(allTasks) {
            // allTasks is now passed as an array from Object.values()
            // Get active tasks (status = active, or pending high priority, or review)
            const activeTasks = allTasks.filter(t => 
                t.status === 'active' || 
                (t.status === 'pending' && t.priority === 'high') ||
                t.status === 'review'
            ).slice(0, 6);

            document.getElementById('active-tasks-count').textContent = activeTasks.length;

            const board = document.getElementById('active-tasks-board');

            if (activeTasks.length === 0) {
                board.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                        <div style="font-size: 32px; margin-bottom: 12px;">Done</div>
                        <div>No active tasks</div>
                        <div style="font-size: 11px; margin-top: 8px;">All caught up!</div>
                    </div>
                `;
                return;
            }

            board.innerHTML = activeTasks.map(task => {
                const priorityClass = getPriorityClass(task.priority);
                const assigneeClass = task.assignedTo === 'CHAD_YI' ? 'chad' : 'agent';
                const assigneeInitial = task.assignedTo === 'CHAD_YI' ? 'C' : 'A';
                const project = allProjects.find(p => p.id === task.project);
                const projectName = project ? project.name : task.project;
                
                // Real progress calculation based on task status
                const progress = task.status === 'done' ? 100 : (task.status === 'active' ? 60 : 20);
                const timeSpent = task.status === 'done' ? 4 : (task.status === 'active' ? 2 : 0);
                const timeEstimated = 4; // Default estimate

                return `
                    <div class="task-card ${priorityClass}">
                        <div class="task-assignee ${assigneeClass}">${assigneeInitial}</div>
                        <div class="task-info">
                            <div class="task-title">${task.title}</div>
                            <div class="task-meta">
                                <div class="task-meta-item">
                                    <div class="task-meta-dot ${task.priority}"></div>
                                    <span>${task.priority} priority</span>
                                </div>
                                <div class="task-meta-item">●</div>
                                <div class="task-meta-item">${task.status}</div>
                                <div class="task-meta-item">●</div>
                                <div class="task-project-tag">${projectName}</div>
                            </div>
                        </div>
                        <div class="task-time">
                            <div class="task-time-value">${timeSpent}h/${timeEstimated}h</div>
                            <div class="task-time-label">time spent</div>
                        </div>
                        <div class="task-progress-ring">
                            <svg width="44" height="44" viewBox="0 0 44 44">
                                <circle class="task-progress-ring-bg" cx="22" cy="22" r="18"/>
                                <circle class="task-progress-ring-fill" cx="22" cy="22" r="18"
                                    stroke-dasharray="113.1" 
                                    stroke-dashoffset="${113.1 - (113.1 * progress / 100)}"/>
                            </svg>
                            <div class="task-progress-text">${progress}%</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderCalendarView(allTasks) {
            // Get tasks with upcoming deadlines (next 7 days)
            const now = new Date();
            const next7Days = [];
            
            for (let i = 0; i < 7; i++) {
                const date = new Date(now);
                date.setDate(date.getDate() + i);
                next7Days.push(date);
            }

            const pendingTasks = allTasks.filter(t => t.status !== 'done');
            
            // Only use REAL deadlines from data.json (not generated ones)
            const tasksWithDeadlines = pendingTasks.filter(t => {
                if (!t.deadline) return false;
                const dueDate = new Date(t.deadline);
                const daysUntil = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
                return daysUntil >= 0 && daysUntil < 7; // Within next 7 days
            }).map(t => ({
                ...t,
                dueDate: new Date(t.deadline)
            }));

            const calendar = document.getElementById('calendar-view');
            
            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            
            calendar.innerHTML = `
                <div class="calendar-header">
                    <span class="calendar-range">Next 7 Days</span>
                    <div class="calendar-nav">
                        <button class="calendar-nav-btn">◀</button>
                        <button class="calendar-nav-btn">▶</button>
                    </div>
                </div>
                <div class="calendar-timeline">
                    ${next7Days.map((date, i) => {
                        const isToday = i === 0;
                        const dayTasks = tasksWithDeadlines.filter(t => {
                            const taskDay = Math.floor((t.dueDate - now) / (1000 * 60 * 60 * 24));
                            return taskDay === i;
                        });
                        
                        const hasDeadlines = dayTasks.length > 0;
                        const urgencyClass = hasDeadlines && dayTasks[0].priority === 'high' ? '' : 
                                            (hasDeadlines && dayTasks[0].priority === 'medium' ? 'medium' : 'low');
                        
                        return `
                            <div class="calendar-day ${isToday ? 'today' : ''}">
                                <div class="calendar-day-date">
                                    <span class="calendar-day-weekday">${weekdays[date.getDay()]}</span>
                                    <span class="calendar-day-number">${date.getDate()}</span>
                                </div>
                                <div class="calendar-day-content">
                                    ${dayTasks.length > 0 ? dayTasks.map(task => `
                                        <div class="calendar-deadline">
                                            <div class="calendar-deadline-dot ${urgencyClass}"></div>
                                            <span>${task.title.substring(0, 35)}${task.title.length > 35 ? '...' : ''}</span>
                                        </div>
                                    `).join('') : `
                                        <div style="font-size: 11px; color: var(--text-muted); padding: 4px 0;">No deadlines</div>
                                    `}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        function renderPendingDecisions(pending) {
            // High priority pending tasks that need user input
            const highPriorityPending = pending.filter(t => t.priority === 'high').slice(0, 3);
            
            document.getElementById('pending-decisions-count').textContent = highPriorityPending.length;
            const list = document.getElementById('pending-decisions-list');

            if (highPriorityPending.length === 0) {
                list.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                        <div style="font-size: 32px; margin-bottom: 12px;">Done</div>
                        <div>All clear!</div>
                        <div style="font-size: 11px; margin-top: 8px;">No decisions pending</div>
                    </div>
                `;
                return;
            }

            list.innerHTML = highPriorityPending.map(task => `
                <div class="decision-card">
                    <div class="decision-card-header">
                        <div class="decision-type">
                            <span>⚠️</span>
                            <span>Decision Required</span>
                        </div>
                        <span class="decision-urgency">High Priority</span>
                    </div>
                    <div class="decision-title">${task.title}</div>
                    <div class="decision-reason">${task.notes || 'This task requires your input before proceeding. Please review and provide guidance.'}</div>
                    <div class="decision-actions">
                        <button class="decision-btn primary" onclick="showSection('categories')">Review</button>
                        <button class="decision-btn" onclick="quickAction('Delegate')">Delegate</button>
                    </div>
                </div>
            `).join('');
        }

        function renderRecentActivity() {
            // Real activity from workflow data
            const activities = [];
            
            // Add recently done tasks
            const doneTasks = allTasks.filter(t => t.status === 'done').slice(0, 3);
            doneTasks.forEach(task => {
                activities.push({
                    type: 'chad',
                    text: `Completed task <strong>${task.title}</strong>`,
                    time: task.completedAt ? new Date(task.completedAt).toLocaleDateString() : 'Recently',
                    project: task.project
                });
            });
            
            // Add pending high priority tasks
            const pendingHigh = allTasks.filter(t => t.status === 'pending' && t.priority === 'high').slice(0, 2);
            pendingHigh.forEach(task => {
                activities.push({
                    type: 'system',
                    text: `Task pending: <strong>${task.title}</strong>`,
                    time: 'Pending',
                    project: task.project
                });
            });
            
            if (activities.length === 0) {
                activities.push({
                    type: 'system',
                    text: 'No recent activity',
                    time: '-',
                    project: 'System'
                });
            }

            const activityList = document.getElementById('recent-activity');
            
            activityList.innerHTML = activities.map(act => {
                const avatarClass = act.type === 'chad' ? 'chad' : (act.type === 'agent' ? 'agent' : 'system');
                const avatarText = act.type === 'chad' ? 'C' : (act.type === 'agent' ? 'A' : '⚙');
                
                return `
                    <div class="activity-item">
                        <div class="activity-avatar ${avatarClass}">${avatarText}</div>
                        <div class="activity-content">
                            <div class="activity-text">${act.text}</div>
                            <div class="activity-meta">
                                <span>${act.project}</span>
                                <span>●</span>
                                <span class="activity-time">${act.time}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ===== CATEGORIES SECTION RENDERING (UNCHANGED) =====
        function renderCategoriesSection() {
            // Check if we're on the categories page by looking for categories elements
            const catTotalProjects = document.getElementById('cat-total-projects');
            if (!catTotalProjects) return; // Not on categories page, skip
            
            // Convert tasks object to array for iteration
            const allTasks = Object.values(appData.tasks || {});
            const totalProjects = allProjects.length;
            const totalTasks = allTasks.length;
            const tasksDone = allTasks.filter(t => t.status === 'done').length;
            const tasksPending = allTasks.filter(t => t.status !== 'done').length;
            const urgentTasks = allTasks.filter(t => normalizePriority(t.priority) === 'high' && t.status !== 'done').length;
            const completionRate = totalTasks > 0 ? Math.round((tasksDone / totalTasks) * 100) : 0;

            catTotalProjects.textContent = totalProjects;
            
            const catTotalTasks = document.getElementById('cat-total-tasks');
            const catTasksDone = document.getElementById('cat-tasks-done');
            const catTasksPending = document.getElementById('cat-tasks-pending');
            const catCompletionRate = document.getElementById('cat-completion-rate');
            const catUrgentTasks = document.getElementById('cat-urgent-tasks');
            const catLoading = document.getElementById('cat-loading-state');
            const catStatsBar = document.getElementById('dashboard-stats-bar');
            const catFilterBar = document.getElementById('filter-bar');
            
            if (catTotalTasks) catTotalTasks.textContent = totalTasks;
            if (catTasksDone) catTasksDone.textContent = tasksDone;
            if (catTasksPending) catTasksPending.textContent = tasksPending;
            if (catCompletionRate) catCompletionRate.textContent = completionRate + '%';
            if (catUrgentTasks) catUrgentTasks.textContent = urgentTasks;

            populateAgentFilter();
            renderCategoriesList();

            if (catLoading) catLoading.style.display = 'none';
            if (catStatsBar) catStatsBar.style.display = 'none';
            if (catFilterBar) catFilterBar.style.display = 'none';
        }

        function populateAgentFilter() {
            const sel = document.getElementById('filter-agent');
            if (!sel) return;
            const agents = window.appData && window.appData.agents ? Object.keys(window.appData.agents) : [];
            // Build options (preserve current selection)
            const cur = sel.value;
            sel.innerHTML = '<option value="">All Agents</option>' +
                agents.map(a => `<option value="${a}"${a === cur ? ' selected' : ''}>${a.toUpperCase()}</option>`).join('');
        }

                function renderCategoriesList() {
            const container = document.getElementById('categories-container');

            const catIcons = {
                A: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
                B: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`,
                C: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
            };
            const categories = {
                A: { icon: catIcons.A, name: 'Ambition', subtitle: 'Personal Projects', projects: [] },
                B: { icon: catIcons.B, name: 'Business', subtitle: 'Active Ventures', projects: [] },
                C: { icon: catIcons.C, name: 'Callings', subtitle: 'Side Projects', projects: [] }
            };

            allProjects.forEach(proj => {
                if (categories[proj.category]) {
                    categories[proj.category].projects.push(proj);
                }
            });

            container.innerHTML = Object.keys(categories).map(catKey => {
                const cat = categories[catKey];
                const totalTasks = cat.projects.reduce((sum, p) => sum + p.stats.total, 0);
                const completedTasks = cat.projects.reduce((sum, p) => sum + p.stats.done, 0);
                const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const blockedCount = cat.projects.reduce((sum, p) => sum + (p.tasks || []).filter(t => t.status === 'blocked').length, 0);
                const openCount = cat.projects.reduce((sum, p) => sum + p.stats.left, 0);
                const urgentCount = cat.projects.reduce((sum, p) => sum + p.stats.urgent, 0);

                return `
                    <div class="category-section" data-category="${catKey}">
                        <div class="category-header-bar">
                        <div class="category-icon" style="color:var(--crimson-bright);display:flex;align-items:center;">${cat.icon}</div>
                            <div class="category-title-group">
                                <h2><span>${catKey}</span>${cat.name.toUpperCase().slice(1)}</h2>
                                <p>${cat.subtitle}</p>
                            </div>
                            <div class="category-summary">
                                <span class="category-summary-pill">${cat.projects.length} projects</span>
                                <span class="category-summary-pill">${openCount} open</span>
                                <span class="category-summary-pill">${completionRate}% complete</span>
                                ${urgentCount > 0 ? `<span class="category-summary-pill alert">${urgentCount} urgent</span>` : ''}
                                ${blockedCount > 0 ? `<span class="category-summary-pill alert">${blockedCount} blocked</span>` : '<span class="category-summary-pill muted">No blocked work</span>'}
                            </div>
                        </div>
                        <div class="projects-grid">
                            ${cat.projects.map(proj => renderProjectCard(proj)).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderProjectResourcesStrip(proj) {
            const resources = Array.isArray(proj.resources) ? proj.resources : [];
            if (!resources.length) return '';

            return `
                <div class="project-resources-strip">
                    <div class="project-resources-title">📎 Master Docs / Resources</div>
                    <div class="project-resources-list">
                        ${resources.map(resource => `
                            <a class="project-resource-pill" href="${escHtml(resource.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">
                                <span>${escHtml(resource.title)}</span>
                                <span class="project-resource-type">${escHtml(resource.type)}</span>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function renderResourcesSection() {
            const container = document.getElementById('resources-container');
            if (!container) return;

            const projectsWithResources = allProjects.filter(proj => Array.isArray(proj.resources) && proj.resources.length > 0);

            if (!projectsWithResources.length) {
                container.innerHTML = `
                    <div class="placeholder-content" style="grid-column: 1 / -1; padding: 44px 30px;">
                        <div class="placeholder-icon">📎</div>
                        <div class="placeholder-title">No Project Docs Added Yet</div>
                        <div class="placeholder-text">When you add links like Google Docs or Drive folders under a project’s details, they’ll appear here and inside the project card itself.</div>
                    </div>
                `;
                return;
            }

            container.innerHTML = projectsWithResources.map(proj => `
                <div class="resource-project-card">
                    <div class="resource-project-header">
                        <div>
                            <div class="resource-project-id">${escHtml(proj.id)}</div>
                            <div class="resource-project-name">${escHtml(proj.name)}</div>
                        </div>
                        <span class="project-resource-summary">${proj.resources.length} docs</span>
                    </div>
                    <div class="resource-project-meta">${escHtml(proj.categoryName || proj.category)} · ${proj.stats.left} tasks left</div>
                    <div class="resource-project-links">
                        ${proj.resources.map(resource => `
                            <a class="resource-link-item" href="${escHtml(resource.url)}" target="_blank" rel="noopener noreferrer">
                                <div>
                                    <div class="resource-link-label">${escHtml(resource.title)}</div>
                                    <div class="resource-link-meta">${escHtml(resource.type)}</div>
                                </div>
                                <span>↗</span>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }

        function renderProjectCard(proj) {
            const progress = proj.stats.total > 0 ? Math.round((proj.stats.done / proj.stats.total) * 100) : 0;
            const statusClass = proj.status === 'active' ? 'active' : (proj.status === 'pending' ? 'pending' : '');
            const resourcesCount = Array.isArray(proj.resources) ? proj.resources.length : 0;
            const grouped = groupTasksByDecisionState(proj.tasks, window.appData);
            const needsMeAggregate = grouped.needsMe.length + grouped.needsReview.length + grouped.needsInput.length;
            const summaryLine = proj.stats.left > 0
                ? `${grouped.needsMe.length} need Chad Yi, ${grouped.needsReview.length} need review, ${grouped.needsInput.length} need input.`
                : 'All tracked tasks are done.';

            return `
                <div class="project-card expanded" data-project="${proj.id}" data-status="${proj.status}"
                     data-priority="${proj.stats.urgent > 0 ? 'high' : (proj.stats.mediumPriority > 0 ? 'medium' : 'low')}"
                     data-agent="CHAD_YI" data-due="9999999999999"
                     data-progress="${progress}" data-tasks="${proj.stats.total}">
                    <div class="project-card-header" onclick="toggleProject(this)">
                        <div class="project-info-main">
                            <div class="project-title-row">
                                <h3>${proj.id} · ${proj.name}</h3>
                                <div class="project-badges">
                                    <span class="agent-badge ${statusClass}">${proj.status}</span>
                                    ${proj.stats.urgent > 0 ? '<span class="agent-badge" style="background: rgba(255,68,68,0.3); color: #ff4444;">URGENT</span>' : ''}
                                    ${resourcesCount > 0 ? `<span class="project-resource-summary">${resourcesCount} docs</span>` : ''}
                                </div>
                            </div>
                            <div class="project-id">${proj.stats.total} tasks · ${proj.stats.left} left · ${proj.stats.done} completed</div>
                            ${proj.description ? `<div style="margin-top: 6px; color: var(--text-muted); font-size: 12px;">${escHtml(proj.description)}</div>` : ''}
                            <div class="project-summary-line">${summaryLine} ${proj.stats.urgent > 0 ? `${proj.stats.urgent} still need immediate attention.` : 'No urgent tasks right now.'}</div>
                        </div>
                        <span class="expand-icon">▼</span>
                    </div>

                    <div class="task-stats">
                        <div class="task-stat">
                            <div class="task-stat-value">${proj.stats.left}</div>
                            <div class="task-stat-label">Open</div>
                        </div>
                        <div class="task-stat high-priority">
                            <div class="task-stat-value">${proj.stats.urgent}</div>
                            <div class="task-stat-label">Urgent</div>
                        </div>
                        <div class="task-stat medium-priority">
                            <div class="task-stat-value">${needsMeAggregate}</div>
                            <div class="task-stat-label">Needs me</div>
                        </div>
                        <div class="task-stat">
                            <div class="task-stat-value">${proj.stats.done}</div>
                            <div class="task-stat-label">Done</div>
                        </div>
                    </div>

                    <div class="progress-section">
                        <div class="progress-header">
                            <span class="progress-label">Overall Progress</span>
                            <span class="progress-value">${progress}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>

                    <div class="project-card-content">
                        ${renderTasksSection(proj)}
                    </div>
                </div>
            `;
        }

        function renderProjectTimeline(proj) {
            const timeline = proj.timeline;

            if (!timeline || !timeline.items || timeline.items.length === 0) {
                return `
                    <div class="project-timeline-section">
                        <div class="timeline-header">
                            <span class="timeline-title">🗂 Project Timeline</span>
                            <span class="timeline-range">Awaiting tasks</span>
                        </div>
                        <div class="timeline-empty">Add tasks to generate a timeline view.</div>
                    </div>
                `;
            }

            const rangeLabel = (timeline.start && timeline.end)
                ? `${formatTimelineDate(timeline.start)} – ${formatTimelineDate(timeline.end)}`
                : 'Schedule pending';
            const checkpoints = [0, 25, 50, 75, 100];

            const itemsHtml = timeline.items.map(item => {
                const left = timeline.duration ? Math.min(96, Math.max(0, ((item.start - timeline.start) / timeline.duration) * 100)) : 0;
                const width = timeline.duration ? Math.max(4, Math.min(100 - left, ((item.end - item.start) / timeline.duration) * 100)) : 100;
                return `
                    <div class="timeline-item ${item.status}" style="left: ${left}%; width: ${width}%">
                        <div class="timeline-item-title">${item.title}</div>
                        <div class="timeline-item-meta">${formatTimelineDate(item.start)} → ${formatTimelineDate(item.end)}</div>
                    </div>
                `;
            }).join('');

            return `
                <div class="project-timeline-section">
                    <div class="timeline-header">
                        <span class="timeline-title">🗂 Project Timeline</span>
                        <span class="timeline-range">${rangeLabel}</span>
                    </div>
                    <div class="timeline-track">
                        ${checkpoints.map(point => `
                            <div class="timeline-grid-line" style="left: ${point}%"></div>
                            <div class="timeline-grid-label" style="left: ${point}%"><span>${point}%</span></div>
                        `).join('')}
                        <div class="timeline-items">
                            ${itemsHtml}
                        </div>
                    </div>
                    <div class="timeline-legend">
                        <div class="timeline-legend-item"><span class="timeline-legend-dot pending"></span>Pending</div>
                        <div class="timeline-legend-item"><span class="timeline-legend-dot active"></span>Active</div>
                        <div class="timeline-legend-item"><span class="timeline-legend-dot review"></span>Review</div>
                        <div class="timeline-legend-item"><span class="timeline-legend-dot done"></span>Done</div>
                    </div>
                </div>
            `;
        }

        function renderTasksSection(proj) {
            const grouped = groupTasksByDecisionState(proj.tasks, window.appData);
            const pendingTasks = [
                ...grouped.needsMe,
                ...grouped.needsReview,
                ...grouped.needsInput,
                ...grouped.activeWork,
                ...grouped.otherOpen
            ];
            const doneTasks = grouped.completed;

            if (pendingTasks.length === 0 && doneTasks.length === 0) {
                return `
                    <div class="tasks-section" style="text-align: center; color: var(--success);">
                        Done No tasks yet. Ready to start!
                    </div>
                `;
            }

            const sections = [];

            [
                { title: 'Needs Me', tasks: grouped.needsMe },
                { title: 'Needs My Review', tasks: grouped.needsReview },
                { title: 'Needs My Input', tasks: grouped.needsInput },
                { title: 'Active Work', tasks: grouped.activeWork },
                { title: 'Open Work',   tasks: grouped.otherOpen }
            ].filter(section => section.tasks.length > 0).forEach(section => {
                sections.push(`
                    <div class="tasks-section">
                        <div class="tasks-section-title">📋 ${section.title} (${section.tasks.length})</div>
                        <div class="task-list">
                            ${section.tasks.slice(0, 5).map(task => renderCategoryTaskItem(task)).join('')}
                            ${section.tasks.length > 5 ? `
                                <div class="category-task-item" style="justify-content: center; color: var(--text-muted); font-size: 11px; cursor: pointer;" onclick="event.stopPropagation(); openProject('${proj.id}', { status: 'pending' })">
                                    +${section.tasks.length - 5} more tasks
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `);
            });

            if (doneTasks.length > 0) {
                sections.push(`
                    <div class="tasks-section">
                        <div class="tasks-section-title">Done Completed Tasks (${doneTasks.length})</div>
                        <div class="task-list">
                            ${doneTasks.slice(0, 3).map(task => renderCategoryTaskItem(task)).join('')}
                            ${doneTasks.length > 3 ? `
                                <div class="category-task-item" style="justify-content: center; color: var(--success); font-size: 11px; cursor: pointer;" onclick="event.stopPropagation(); openProject('${proj.id}', { status: 'done' })">
                                    +${doneTasks.length - 3} more completed
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `);
            }

            sections.push(`
                <div class="tasks-view-all-link" style="text-align: right; margin-top: 6px;">
                    <button type="button" style="background: none; border: none; color: var(--crimson-bright); font-size: 11px; letter-spacing: 0.5px; cursor: pointer; text-transform: uppercase;" onclick="event.stopPropagation(); openProject('${proj.id}')">
                        View full task list →
                    </button>
                </div>
            `);

            return sections.join('');
        }

        function renderCategoryTaskItem(task) {
            const normalizedPriority = normalizePriority(task.priority);
            const priorityClass = normalizedPriority === 'high' ? 'high-priority' : (normalizedPriority === 'medium' ? 'medium-priority' : 'low-priority');
            const statusIcon = task.status === 'active' ? '\u25ba' : task.status === 'review' ? '\ud83d\udc41' : task.status === 'done' ? '\u2713' : task.status === 'paused' ? '\u23f8' : task.status === 'blocked' ? '\u26a0' : '\u25cb';

            return `
                <div class="category-task-item ${priorityClass}" data-task-id="${task.id}" onclick="event.stopPropagation(); openTask('${task.id}')">
                    <div class="task-status ${task.status}">${statusIcon}</div>
                    <div class="task-details">
                        <div class="category-task-title">${task.title}</div>
                        ${task.notes ? `<div class="task-notes">${task.notes}</div>` : ''}
                        <div class="task-meta-row">
                            <span class="priority-badge ${normalizedPriority}">${normalizedPriority}</span>
                            <span>${task.status}</span>
                            <span>${escHtml(formatAgentDisplay(task.agent || task.assignedTo))}</span>
                            ${task.deadline ? `<span>due ${new Date(task.deadline).toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        function quickAssignTask(taskId, agentName) {
            if (!agentName) return;
            showToast(taskId + ' \u2192 ' + agentName.toUpperCase(), 'info', 3000);
            // Persist to data.json via backend when available
            // For now: update local appData so re-renders reflect change
            if (window.appData && window.appData.tasks && window.appData.tasks[taskId]) {
                window.appData.tasks[taskId].assignedTo = agentName;
            }
        }

        // Apply Filters
        function applyFilters() {
            const priorityFilter = document.getElementById('filter-priority').value;
            const statusFilter = document.getElementById('filter-status').value;
            const agentFilter = document.getElementById('filter-agent').value;
            const sortBy = document.getElementById('sort-by').value;

            const cards = document.querySelectorAll('.project-card');
            let visibleCount = 0;

            cards.forEach(card => {
                const cardPriority = card.dataset.priority;
                const cardStatus = card.dataset.status;
                const cardAgent = card.dataset.agent;

                let visible = true;
                if (priorityFilter && cardPriority !== priorityFilter) visible = false;
                if (statusFilter && cardStatus !== statusFilter) visible = false;
                if (agentFilter && cardAgent !== agentFilter) visible = false;

                if (visible) {
                    card.classList.remove('filtered-out');
                    visibleCount++;
                } else {
                    card.classList.add('filtered-out');
                }
            });

            // Sort visible cards
            const sections = document.querySelectorAll('.category-section');
            sections.forEach(section => {
                const grid = section.querySelector('.projects-grid');
                const sectionCards = Array.from(grid.querySelectorAll('.project-card:not(.filtered-out)'));

                sectionCards.sort((a, b) => {
                    switch(sortBy) {
                        case 'name': return a.dataset.project.localeCompare(b.dataset.project);
                        case 'due': return parseInt(a.dataset.due) - parseInt(b.dataset.due);
                        case 'progress': return parseInt(b.dataset.progress) - parseInt(a.dataset.progress);
                        case 'tasks': return parseInt(b.dataset.tasks) - parseInt(a.dataset.tasks);
                        default: return 0;
                    }
                });

                sectionCards.forEach(card => grid.appendChild(card));
            });

            document.getElementById('cat-no-results').style.display = visibleCount === 0 ? 'block' : 'none';
        }

        // Clear Filters
        function clearFilters() {
            document.getElementById('filter-priority').value = '';
            document.getElementById('filter-status').value = '';
            document.getElementById('filter-agent').value = '';
            document.getElementById('sort-by').value = 'name';
            applyFilters();
        }

        // Open Project
        function openProject(projectId, options = {}) {
            if (window.ProjectTasksModal) {
                window.ProjectTasksModal.open(projectId, options);
            } else {
                alert(`Opening project ${projectId}...`);
            }
        }

        // Add Task
        function addTask(projectId) {
            alert(`Add new task to project ${projectId}...`);
        }

        // NEW HOMEPAGE FUNCTIONS
        let currentWeekOffset = 0;
        let selectedDay = null;

                function renderNewHomepage(data) {
            // ── COMMAND CENTER REBUILD ──────────────────────────────────────
            renderStatsBar(data);
            updateTicker(data);
            renderDailyBriefing(data);
            renderOpsCards(data);
            renderFocusTasks(data);
            renderWeekCalendar(data);
            updateSystemHealth();
            // Pulse stats bar on every data refresh
            if (typeof pulseStatsBar === 'function') pulseStatsBar();
        }

        // ════════════════════════════════════════════════════════════════════
        // COMMAND CENTER RENDER FUNCTIONS — Commit 1
        // ════════════════════════════════════════════════════════════════════

        // ── STATS BAR ─────────────────────────────────────────────────────
        function renderStatsBar(data) {
            const tasks = Object.values(data.tasks || {});
            const agents = data.agents || {};
            const agentArr = Object.entries(agents);
            const lens = getDashboardLens(data);
            // Use SGT (Singapore Time, UTC+8) for all date calculations
            const sgtNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
            const today = new Date(sgtNow); today.setHours(0,0,0,0);

            function isToday(d) {
                if (!d) return false;
                const dd = new Date(d); dd.setHours(0,0,0,0);
                return dd.getTime() === today.getTime();
            }
            function isOverdue(d) {
                if (!d) return false;
                const dd = new Date(d); dd.setHours(0,0,0,0);
                return dd < today;
            }
            function set(id, val) {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            }
            function setHTML(id, val) {
                const el = document.getElementById(id);
                if (el) el.innerHTML = val;
            }

            const openTasks = tasks.filter(t => t.status !== 'done');

            // 1. DUE TODAY — today count is primary; sub-breakdown shows urgency + overdue carried + tomorrow
            const dueToday = openTasks.filter(t => t.deadline && isToday(t.deadline));
            const dueTodayHigh = dueToday.filter(t => normalizePriority(t.priority) === 'high').length;
            const dueDeadline = openTasks.filter(t => t.deadline && isOverdue(t.deadline)).length;
            const dueTomorrow = (() => {
                const tom = new Date(today); tom.setDate(tom.getDate() + 1);
                return openTasks.filter(t => {
                    if (!t.deadline) return false;
                    const dd = new Date(t.deadline); dd.setHours(0,0,0,0);
                    return dd.getTime() === tom.getTime();
                }).length;
            })();
            set('s-due-today', dueToday.length);
            set('s-due-urgent', dueTodayHigh + ' urgent');
            set('s-due-normal', dueTomorrow + ' tomorrow');

            // 2. ACTION ITEMS — single aggregate: needsMe + review + input (deduplicated via lens)
            set('s-review-total', lens.needsMeAggregate.length);
            set('s-review-todo', lens.needsMeTasks.length + ' to do');
            set('s-review-decisions', lens.reviewTasks.length + ' review');
            set('s-review-input', lens.myInputTasks.length + ' input');

            // 3. AGENTS — count all fleet agents (from registry)
            const fleetAgents = getFleetIds();
            const agentSignals = fleetAgents.map(id => getAgentSignalMeta(id, data));
            const onlineSignals = agentSignals.filter(signal => signal.tone === 'online').length;
            const staleSignals = agentSignals.filter(signal => signal.label.includes('stale')).length;
            const offlineSignals = fleetAgents.length - onlineSignals - staleSignals;

            set('s-agents-total', onlineSignals + '/' + fleetAgents.length);
            set('s-agents-online', onlineSignals + ' online');
            set('s-agents-stale', staleSignals + ' stale');
            set('s-agents-offline', offlineSignals + ' offline');

            // 4. THIS WEEK — tasks due within the current Mon–Sun week
            const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + (7 - today.getDay()) % 7 || 7);
            const weekStart7 = new Date(today); weekStart7.setDate(weekStart7.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
            const thisWeekTasks = openTasks.filter(t => {
                if (!t.deadline) return false;
                const d = new Date(t.deadline); d.setHours(0,0,0,0);
                return d >= weekStart7 && d <= weekEnd;
            });
            const doneThisWeekCount = tasks.filter(t => {
                if (t.status !== 'done' || !t.completedAt) return false;
                const d = new Date(t.completedAt); d.setHours(0,0,0,0);
                return d >= weekStart7;
            }).length;
            const overdueThisWeekCount = openTasks.filter(t => t.deadline && isOverdue(t.deadline)).length;
            set('s-week-total', thisWeekTasks.length + doneThisWeekCount);
            set('s-week-done', doneThisWeekCount + ' done');
            set('s-week-left', thisWeekTasks.length + ' left');

            // 5. BLOCKED / PAUSED
            const blockedTasks = openTasks.filter(t => t.status === 'blocked');
            const pausedTasks = openTasks.filter(t => t.status === 'paused');
            set('s-blocked-total', blockedTasks.length + pausedTasks.length);
            set('s-blocked-stuck', blockedTasks.length + ' blocked');
            set('s-blocked-paused', pausedTasks.length + ' paused');

            // 6. VELOCITY (tasks done today)
            const doneTasks = tasks.filter(t => t.status === 'done');
            const completionPct = Math.round((doneTasks.length / Math.max(1, tasks.length)) * 100);
            const lastLogin = localStorage.getItem('rs_last_login');
            const todayDone = doneTasks.filter(t => t.completedAt && isToday(t.completedAt)).length;
            const weekDone = doneTasks.filter(t => {
                if (!t.completedAt) return false;
                const d = new Date(t.completedAt);
                const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
                return d >= weekAgo;
            }).length;
            set('s-velocity-today', todayDone);
            set('s-velocity-week', weekDone + ' this wk');
            set('s-velocity-trend', weekDone > 0 ? '+' + weekDone : '—');

            // 7. PROJECTS
            const projects = data.projects || {};
            let totalProj = 0, projOnTrack = 0, projRisk = 0, projDelayed = 0;
            Object.values(projects).forEach(cat => {
                (cat.projects || []).forEach(pid => {
                    totalProj++;
                    const ptasks = tasks.filter(t => projectIdFromTask(t) === pid);
                    const hasOverdue = ptasks.some(t => t.status !== 'done' && t.deadline && isOverdue(t.deadline));
                    const hasBlocked = ptasks.some(t => t.status === 'blocked');
                    if (hasBlocked) projDelayed++;
                    else if (hasOverdue) projRisk++;
                    else projOnTrack++;
                });
            });
            set('s-projects-total', totalProj);
            set('s-projects-ok', projOnTrack + ' on track');
            set('s-projects-risk', projRisk + ' at risk');
            set('s-projects-delayed', projDelayed + ' delayed');

            // 8. OVERDUE — tasks past their deadline
            const allOverdue = openTasks.filter(t => t.deadline && isOverdue(t.deadline));
            const overdueThisWeek = allOverdue.filter(t => {
                const d = new Date(t.deadline); d.setHours(0,0,0,0);
                const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
                return d >= weekAgo;
            });
            // Find oldest overdue
            let oldestOverdue = '— clear';
            if (allOverdue.length > 0) {
                const sorted = allOverdue.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
                const oldest = new Date(sorted[0].deadline);
                const daysOld = Math.round((today - oldest) / (1000*60*60*24));
                oldestOverdue = daysOld + 'd ago';
            }
            set('s-overdue-total', allOverdue.length);
            set('s-overdue-week', overdueThisWeek.length + ' this week');
            set('s-overdue-oldest', oldestOverdue);

            // 9. COMPLETION — overall progress percentage
            set('s-completion-pct', completionPct + '%');
            set('s-completion-done', doneTasks.length + ' done');
            set('s-completion-total', tasks.length + ' total');
            set('s-completion-left', openTasks.length + ' open');

            // Fallback: update last-audit-time from data.lastUpdated if helios hasn't set it
            const _lae = document.getElementById('last-audit-time');
            if (_lae && (_lae.textContent === '—' || _lae.textContent === '') && data.lastUpdated) {
                _lae.textContent = formatRelativeTimestamp(data.lastUpdated);
            }
        }

        // ── TICKER (Bloomberg-style feed) ──────────────────────────────
        function updateTicker(data) {
            const el = document.getElementById('ticker-content');
            if (!el) return;
            const tasks = Object.values(data.tasks || {});
            const agents = data.agents || {};
            const today = sgtToday();
            const stats = data.stats || {};
            const projects = data.projects || {};

            function fmt(d) {
                if (!d) return '';
                const dd = new Date(d);
                return dd.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
            }

            const parts = [];

            // Per-project health indicators (like stock tickers)
            const projectDetails = getDefaultProjectDetails();
            const projIds = ['A1','A2','A3','A4','A5','A6','A7','B1','B3','B6','C1','C3'];
            projIds.forEach(pid => {
                const ptasks = tasks.filter(t => projectIdFromTask(t) === pid && t.status !== 'done');
                if (ptasks.length === 0) return;
                const pDone = tasks.filter(t => projectIdFromTask(t) === pid && t.status === 'done').length;
                const pTotal = ptasks.length + pDone;
                const name = (projectDetails[pid] || {}).name || pid;
                const hasBlocked = ptasks.some(t => t.status === 'blocked');
                const hasOverdue = ptasks.some(t => t.deadline && (() => { const d = new Date(t.deadline); d.setHours(0,0,0,0); return d < today; })());
                const arrow = hasBlocked ? '▼' : hasOverdue ? '▼' : pDone > 0 ? '▲' : '─';
                const cls = hasBlocked ? 'ticker-item-alert' : hasOverdue ? 'ticker-item-warn' : 'ticker-item-done';
                parts.push(`<span class="${cls}">${pid} ${name.toUpperCase()} ${arrow} ${ptasks.length} open</span>`);
            });

            // Agent status pips
            const agentEntries = Object.entries(agents).filter(([id]) => !isAgentExcluded(id));
            if (agentEntries.length > 0) {
                const agentPips = agentEntries.map(([id, a]) => {
                    const s = a.status || 'unknown';
                    const pip = s === 'active' || s === 'working' ? '●' : s === 'stale' ? '◐' : '○';
                    return `${pip} ${id.toUpperCase()}`;
                }).join(' ');
                parts.push(`<span class="ticker-item-done">FLEET: ${agentPips}</span>`);
            }

            // Overdue tasks — individual items
            const overdue = tasks.filter(t => t.status !== 'done' && t.deadline && (() => {
                const d = new Date(t.deadline); d.setHours(0,0,0,0); return d < today;
            })());
            overdue.forEach(t => {
                parts.push(`<span class="ticker-item-alert">⚑ OVERDUE ${t.id} · ${t.title.slice(0,35)}</span>`);
            });

            // Blocked tasks — individual items
            const blocked = tasks.filter(t => t.status === 'blocked' || t.status === 'paused');
            blocked.forEach(t => {
                const icon = t.status === 'paused' ? '⏸' : '⚠';
                const label = t.status === 'paused' ? 'PAUSED' : 'BLOCKED';
                parts.push(`<span class="ticker-item-alert">${icon} ${label} ${t.id} · ${t.title.slice(0,35)}</span>`);
            });

            // Upcoming deadlines (next 3 days)
            const threeDays = new Date(today); threeDays.setDate(threeDays.getDate() + 3);
            const upcoming = tasks.filter(t => {
                if (t.status === 'done' || !t.deadline) return false;
                const d = new Date(t.deadline); d.setHours(0,0,0,0);
                return d >= today && d <= threeDays;
            }).slice(0, 3);
            upcoming.forEach(t => {
                parts.push(`<span class="ticker-item-warn">◆ DUE ${fmt(t.deadline)} · ${t.id} · ${t.title.slice(0,30)}</span>`);
            });

            if (parts.length === 0) {
                parts.push('<span>■ ALL SYSTEMS NOMINAL · NO ALERTS</span>');
            }

            const sep = '&nbsp;&nbsp;<span class="ticker-sep">|</span>&nbsp;&nbsp;';
            const content = parts.join(sep);
            el.innerHTML = content + sep + content;
        }

        // ── DAILY BRIEFING (action-first) ──────────────────────────────
        function renderDailyBriefing(data) {
            const container = document.getElementById('daily-briefing-content');
            if (!container) return;
            const el = document.getElementById('briefing-time');
            if (el) {
                const now = new Date();
                const dayStr = now.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
                const timeStr = now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
                el.textContent = dayStr + ' · ' + timeStr + ' SGT';
            }

            const lens = getDashboardLens(data);
            const agents = data.agents || {};

            const sections = [];

            // 1. WHAT I NEED TO DO — blocked + review + input-needed (action items first)
            const actionItems = dedupeTasksById([
                ...lens.myInputTasks,
                ...lens.reviewTasks,
                ...(lens.needsMeTasks || [])
            ]);
            sections.push({
                title: '⚡ ACTION REQUIRED',
                rows: actionItems.length === 0
                    ? [{ cls: '', text: 'No items waiting for you — all clear.' }]
                    : actionItems.slice(0, 6).map(t => ({
                        cls: t.status === 'blocked' ? 'urgent' : 'warn',
                        text: `${t.status === 'blocked' ? '⚑ BLOCKED' : t.status === 'review' ? '👁 REVIEW' : '→ NEEDS YOU'} · ${t.id} · ${t.title.slice(0, 48)} · ${getTaskProjectLabel(t, data)}`
                    }))
            });

            // 2. AGENT ACTIVITY — what agents have been working on recently
            const agentActivity = Object.entries(agents)
                .filter(([id, a]) => id !== 'chad-yi' && !isAgentExcluded(id) && (a.currentTask || a.status === 'active' || a.status === 'working'))
                .map(([id, a]) => {
                    const statusEmoji = a.status === 'active' || a.status === 'working' ? '🟢' : a.status === 'stale' ? '🟡' : '⚫';
                    const task = a.currentTask ? String(a.currentTask).slice(0, 45) : 'idle';
                    return { cls: '', text: `${statusEmoji} ${formatAgentDisplay(id)} · ${task}` };
                });
            if (agentActivity.length > 0) {
                sections.push({
                    title: '🤖 AGENT ACTIVITY',
                    rows: agentActivity.slice(0, 4)
                });
            }

            // 3. OVERDUE / ALERTS
            sections.push({
                title: '⚠️ OVERDUE & BLOCKED',
                rows: lens.attentionTasks.length === 0
                    ? [{ cls: '', text: 'No overdue or blocked tasks — clear' }]
                    : lens.attentionTasks.slice(0, 5).map(t => ({
                        cls: 'urgent',
                        text: `${t.status === 'blocked' ? '⚑ BLOCKED' : '▲ OVERDUE'} · ${t.id} · ${t.title.slice(0, 48)} · ${getTaskProjectLabel(t, data)}`
                    }))
            });

            // 4. NEXT UP — actionable tasks (not attention, not needs-me)
            sections.push({
                title: '📋 NEXT UP',
                rows: lens.nextUpTasks.length === 0
                    ? [{ cls: '', text: 'Everything actionable is either done or parked.' }]
                    : lens.nextUpTasks.slice(0, 4).map(t => ({
                        cls: normalizePriority(t.priority) === 'high' ? 'warn' : '',
                        text: `${t.id} · ${t.title.slice(0, 52)} · ${getTaskProjectLabel(t, data)}`
                    }))
            });

            // 5. COMPLETED (at the bottom, not the top)
            const allCompleted = [...lens.completedToday, ...lens.completedWeek.filter(t => !lens.completedToday.some(ct => ct.id === t.id))];
            if (allCompleted.length > 0) {
                sections.push({
                    title: '✅ COMPLETED',
                    rows: allCompleted.slice(0, 4).map(t => ({
                        cls: 'good',
                        text: `${t.id} · ${t.title} · ${formatAbsoluteTimestamp(t.completedAt)}`
                    }))
                });
            }

            container.innerHTML = sections.map(s => `
                <div class="briefing-section">
                    <div class="briefing-section-title">${s.title}</div>
                    ${s.rows.map(r => `<div class="briefing-row ${r.cls}">${escHtml(r.text)}</div>`).join('')}
                </div>
            `).join('');
        }
        // ── OPS CARDS ─────────────────────────────────────────────────────
        function renderOpsCards(data) {
            const tasks = Object.values(data.tasks || {});
            const today = sgtToday();
            const lens = getDashboardLens(data);

            function isOverdue(d) { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd < today; }
            function isToday(d)   { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd.getTime()===today.getTime(); }
            function dlClass(d)   { return !d ? '' : isOverdue(d) ? 'overdue' : isToday(d) ? 'today' : ''; }
            function fmtDl(d)     { return d ? new Date(d).toLocaleDateString('en-SG', {month:'short',day:'numeric'}) : ''; }

            function buildTaskList(items, limit, emptyLabel) {
                if (!items.length) return '<li class="task-item-empty">' + (emptyLabel || 'No items') + '</li>';
                return items.slice(0, limit).map(t => `
                    <li class="task-item priority-${t.priority||'medium'}" onclick="openTask('${t.id}')">
                        <div class="task-item-header">
                            <span class="task-priority-dot"></span>
                            <span class="task-title">${escHtml(t.title)}</span>
                        </div>
                        <div class="task-context">${escHtml(getTaskProjectLabel(t, data))}${t.notes ? ' · ' + escHtml(t.notes.slice(0, 72)) : ''}</div>
                        <div class="task-meta">
                            <span class="task-id">${t.id}</span>
                            ${t.deadline ? `<span class="task-deadline ${dlClass(t.deadline)}">${isOverdue(t.deadline)?'▲ OVERDUE ':''}${fmtDl(t.deadline)}</span>` : ''}
                            ${t.agent ? `<span class="task-agent">${escHtml(formatAgentDisplay(t.agent))}</span>` : ''}
                            <span class="task-open-hint">→ view</span>
                        </div>
                    </li>
                `).join('');
            }

            // NEEDS REVIEW
            const reviewTasks = lens.reviewTasks.slice(0, 8);
            const reviewList = document.getElementById('needs-review-list');
            const reviewCount = document.getElementById('review-count');
            if (reviewList) reviewList.innerHTML = buildTaskList(reviewTasks, 6, 'No tasks awaiting review');
            if (reviewCount) reviewCount.textContent = reviewTasks.length;

            // NEEDS MY INPUT
            const inputs = lens.myInputTasks;
            const decisionsList = document.getElementById('decisions-list');
            const decisionsCount = document.getElementById('decisions-count');
            if (decisionsList) decisionsList.innerHTML = buildTaskList(inputs, 6, 'No input requested from you');
            if (decisionsCount) decisionsCount.textContent = inputs.length;

            // NEEDS ME
            const needsMeTasks = lens.needsMeTasks.slice(0, 10);
            const needsMeList = document.getElementById('recently-done-list');
            const needsMeCount = document.getElementById('recent-count');
            if (needsMeList) needsMeList.innerHTML = buildTaskList(needsMeTasks, 6, 'No tasks queued directly for Chad Yi');
            if (needsMeCount) needsMeCount.textContent = needsMeTasks.length;

            // ACTIVE WORK — only tasks explicitly marked active with verified live signals
            const activeTasks = lens.activeWorkTasks.slice(0, 10);
            const activeList = document.getElementById('active-work-list');
            const activeCount = document.getElementById('active-count');
            if (activeList) activeList.innerHTML = buildTaskList(activeTasks, 6, 'No verified active work right now');
            if (activeCount) activeCount.textContent = activeTasks.length;

            // Agent Recs removed (Commit 16)
        }

        function toggleTaskExpand(event, taskId) {
            event.stopPropagation();
            const el = document.getElementById('txp-' + taskId);
            if (el) el.classList.toggle('open');
        }

        function escHtml(s) {
            if (!s) return '';
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        // ── TODAY'S FOCUS ─────────────────────────────────────────────────
        let _focusTaskOrder = [];
        let _focusFilter = localStorage.getItem('rs_focus_filter') || 'urgency';
        let _focusProjectFilter = localStorage.getItem('rs_focus_project') || '';

        function setFocusFilter(val) {
            _focusFilter = val;
            localStorage.setItem('rs_focus_filter', val);
            if (val !== 'custom') localStorage.removeItem('rs_focus_order');
            if (window.appData) renderFocusTasks(window.appData);
        }

        function setFocusProjectFilter(val) {
            _focusProjectFilter = val;
            localStorage.setItem('rs_focus_project', val);
            if (window.appData) renderFocusTasks(window.appData);
        }

        function renderFocusTasks(data) {
            const tasks = Object.values(data.tasks || {});
            const today = sgtToday();
            const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

            function isOverdue(d) { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd < today; }
            function isToday(d)   { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd.getTime()===today.getTime(); }

            // Apply project category filter
            const projFilter = _focusProjectFilter || localStorage.getItem('rs_focus_project') || '';
            const projFilterEl = document.getElementById('focus-project-filter');
            if (projFilterEl && projFilterEl.value !== projFilter) projFilterEl.value = projFilter;

            let filteredTasks = tasks.filter(t => t.status !== 'done');
            if (projFilter) {
                filteredTasks = filteredTasks.filter(t => {
                    const pid = projectIdFromTask(t);
                    return pid && pid.startsWith(projFilter);
                });
            }

            // Score tasks for urgency
            const scored = filteredTasks
                .map(t => {
                    let score = 0;
                    if (t.deadline) {
                        const d = new Date(t.deadline); d.setHours(0,0,0,0);
                        const days = Math.round((d - today) / (1000*60*60*24));
                        if (days < 0) score += Math.abs(days) * 10 + 30;
                        else if (days === 0) score += 50;
                        else score += Math.max(0, 25 - days * 2);
                    }
                    if (t.priority === 'critical') score += 40;
                    else if (t.priority === 'high') score += 20;
                    else if (t.priority === 'medium') score += 8;
                    if (t.status === 'active') score += 15;
                    if (t.status === 'blocked') score += 10;
                    return { ...t, _score: score };
                })
                .sort((a, b) => b._score - a._score);

            const activeFilter = _focusFilter || localStorage.getItem('rs_focus_filter') || 'urgency';
            const filterEl = document.getElementById('focus-filter-select');
            if (filterEl && filterEl.value !== activeFilter) filterEl.value = activeFilter;

            let ordered;
            if (activeFilter === 'due-today') {
                ordered = [...scored].sort((a, b) => {
                    const aT = a.deadline && a.deadline.slice(0,10) === todayStr;
                    const bT = b.deadline && b.deadline.slice(0,10) === todayStr;
                    if (aT && !bT) return -1;
                    if (!aT && bT) return 1;
                    return b._score - a._score;
                });
            } else if (activeFilter === 'high-priority') {
                const pOrd = { critical: 0, high: 1, medium: 2, low: 3 };
                ordered = [...scored].sort((a, b) => (pOrd[a.priority] ?? 4) - (pOrd[b.priority] ?? 4));
            } else if (activeFilter === 'blocked') {
                ordered = scored.filter(t => t.status === 'blocked');
            } else if (activeFilter === 'my-tasks') {
                ordered = scored.filter(t => {
                    const agent = normalizeAgentId(t.agent || t.owner || '');
                    return agent === 'chad-yi' || agent === 'chad_yi' || !t.agent;
                });
            } else if (activeFilter === 'custom') {
                const savedOrder = JSON.parse(localStorage.getItem('rs_focus_order') || 'null');
                if (savedOrder && Array.isArray(savedOrder)) {
                    const byId = {};
                    scored.forEach(t => byId[t.id] = t);
                    const reordered = savedOrder.map(id => byId[id]).filter(Boolean);
                    const remaining = scored.filter(t => !savedOrder.includes(t.id));
                    ordered = [...reordered, ...remaining];
                } else { ordered = scored; }
            } else {
                ordered = scored; // 'urgency' default
            }
            _focusTaskOrder = ordered.map(t => t.id);

            const top5 = ordered.slice(0, 5);
            const also = ordered.slice(5);

            // Update total count
            const totalEl = document.getElementById('focus-total-count');
            if (totalEl) totalEl.textContent = ordered.length + ' task' + (ordered.length !== 1 ? 's' : '');

            // Render top 5
            const top5El = document.getElementById('focus-top5');
            if (top5El) {
                top5El.innerHTML = top5.map((t, i) => buildFocusCard(t, i + 1)).join('');
                initDragDrop();
            }

            // Render also-today
            const alsoEl = document.getElementById('also-content');
            const alsoCount = document.getElementById('also-count');
            if (alsoEl) alsoEl.innerHTML = also.map((t, i) => buildFocusCard(t, i + 6)).join('');
            if (alsoCount) alsoCount.textContent = also.length + ' more';
            // Update the also-today label text
            const alsoLabelEl = document.getElementById('also-label-text');
            if (alsoLabelEl) alsoLabelEl.textContent = also.length + ' MORE TASKS';

            // Show/hide also-today section
            const alsoSection = document.getElementById('also-today-section');
            if (alsoSection) alsoSection.style.display = also.length > 0 ? 'block' : 'none';
        }

        function buildFocusCard(t, rank) {
            const today = sgtToday();
            const detail = getTaskDetailModel(t, window.appData);
            function isOverdue(d) { if(!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd < today; }
            function isToday(d)   { if(!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd.getTime()===today.getTime(); }
            function fmtDl(d)     { return d ? new Date(d).toLocaleDateString('en-SG', {month:'short',day:'numeric'}) : ''; }
            const dlCls = !t.deadline ? '' : isOverdue(t.deadline) ? 'overdue' : isToday(t.deadline) ? 'today' : '';
            const dlPrefix = isOverdue(t.deadline) ? '▲ OVERDUE · ' : isToday(t.deadline) ? 'TODAY · ' : '';

            const _projId = (t.id || '').replace(/-\d+$/, '');
            const _projDetails = (window.appData && window.appData.projectDetails && window.appData.projectDetails[_projId]) || {};
            const _projName = _projDetails.name || _projId;
            const _normPriority = normalizePriority(t.priority || 'medium');
            return `<div class="focus-task-card priority-${_normPriority}"
                         id="ftask-${t.id}"
                         draggable="true"
                         data-task-id="${t.id}"
                         ondragstart="focusDragStart(event)"
                         ondragover="focusDragOver(event)"
                         ondrop="focusDrop(event)"
                         onclick="openTask('${t.id}')">
                <span class="focus-rank">#${rank}</span>
                <div class="focus-quick-actions">
                    <button class="focus-quick-btn fqb-done" onclick="apiTaskAction(event,'${t.id}','done')" title="Mark done">✓</button>
                    <button class="focus-quick-btn fqb-block" onclick="apiTaskAction(event,'${t.id}','blocked')" title="Flag blocked">⚑</button>
                </div>
                <div class="focus-task-contextline">${escHtml(detail.projectLabel)} · ${escHtml(t.id)}</div>
                <div class="focus-task-title">${escHtml(t.title)}</div>
                <div class="focus-task-meta">
                    <span class="focus-task-id">${escHtml(detail.lane.label)}</span>
                    <span class="focus-priority-tag focus-priority-${_normPriority}">${(_normPriority).toUpperCase()}</span>
                    ${t.deadline ? `<span class="focus-deadline ${dlCls}">${dlPrefix}${fmtDl(t.deadline)}</span>` : ''}
                </div>
                <div class="focus-task-summaryline">${escHtml(detail.about.slice(0, 150))}</div>
            </div>`;
        }

        // ── GitHub PAT Settings ──────────────────────────────────────────
        function openSettingsModal() {
            const modal = document.getElementById('settings-modal');
            if (!modal) return;
            modal.style.display = 'flex';
            const input = document.getElementById('gh-pat-input');
            if (input) input.value = localStorage.getItem('gh_pat') || '';
            const status = document.getElementById('settings-status');
            if (status) status.textContent = '';
        }
        function closeSettingsModal() {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.style.display = 'none';
        }
        function saveSettingsPAT() {
            const input = document.getElementById('gh-pat-input');
            const status = document.getElementById('settings-status');
            if (!input) return;
            const pat = input.value.trim();
            if (pat) {
                localStorage.setItem('gh_pat', pat);
                if (status) { status.textContent = '✓ PAT saved. Mark Done will now commit to GitHub.'; status.style.color = 'rgba(80,200,120,0.8)'; }
            } else {
                localStorage.removeItem('gh_pat');
                if (status) { status.textContent = 'PAT cleared. Mark Done will be session-only.'; status.style.color = 'rgba(160,160,180,0.6)'; }
            }
            setTimeout(closeSettingsModal, 1600);
        }

        // ── GitHub commit helper ─────────────────────────────────────────
        async function commitTaskDoneToGitHub(taskId, pat) {
            const apiUrl = 'https://api.github.com/repos/chadyi-king/mission-control-dashboard/contents/data.json';
            const headers = {
                'Authorization': 'token ' + pat,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            };
            try {
                // Get current file + SHA
                const res = await fetch(apiUrl, { headers });
                if (!res.ok) throw new Error('GET failed: ' + res.status);
                const meta = await res.json();
                const sha = meta.sha;
                // Decode content
                const raw = atob(meta.content.replace(/\n/g, ''));
                const json = normalizeDashboardData(JSON.parse(raw));
                // Apply change
                if (json.tasks && json.tasks[taskId]) {
                    json.tasks[taskId].status = 'done';
                    json.tasks[taskId].priority = 'done';
                    json.tasks[taskId].completedAt = new Date().toISOString();
                }
                // Remove from workflow active/urgent/blocked/pending lists
                ['active','urgent','blocked','pending','review'].forEach(k => {
                    if (Array.isArray(json.workflow[k])) {
                        json.workflow[k] = json.workflow[k].filter(id => id !== taskId);
                    }
                });
                if (Array.isArray(json.workflow.done) && !json.workflow.done.includes(taskId)) {
                    json.workflow.done.push(taskId);
                }
                // Remove from needsAttention
                if (Array.isArray(json.needsAttention)) {
                    json.needsAttention = json.needsAttention.filter(n => n.id !== taskId);
                }
                // PUT back
                const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(json, null, 2))));
                const putRes = await fetch(apiUrl, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        message: `Mark done: ${taskId}`,
                        content: newContent,
                        sha: sha
                    })
                });
                if (!putRes.ok) throw new Error('PUT failed: ' + putRes.status);
                console.log('[GitHub] Committed task done:', taskId);
                return true;
            } catch (err) {
                console.warn('[GitHub] Commit failed:', err);
                return false;
            }
        }

        // ── Quick-action API helper ──────────────────────────────────────
        async function apiTaskAction(event, taskId, action) {
            event.stopPropagation();
            const card = document.getElementById('ftask-' + taskId);
            const statusMap = { done: 'done', blocked: 'blocked' };
            const newStatus = statusMap[action] || action;
            try {
                const res = await fetch(`${HELIOS_API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ field: 'status', value: newStatus })
                });
                if (!res.ok) throw new Error('API ' + res.status);
                // Optimistic UI update
                if (action === 'done') {
                    if (card) { card.style.transition = 'opacity 0.4s'; card.style.opacity = '0.3'; card.style.textDecoration = 'line-through'; }
                    if (window.appData?.tasks?.[taskId]) {
                        window.appData.tasks[taskId].status = 'done';
                        window.appData.tasks[taskId].completedAt = new Date().toISOString();
                    }
                    showToast(`✓ ${taskId} marked done`, 'success');
                } else if (action === 'blocked') {
                    if (card) card.style.borderLeftColor = 'rgba(220,160,60,0.8)';
                    if (window.appData?.tasks?.[taskId]) {
                        window.appData.tasks[taskId].status = 'blocked';
                    }
                    showToast(`⚑ ${taskId} flagged blocked`, 'warn');
                }
                // Trigger refresh from backend data
                if (typeof triggerImmediateRefresh === 'function') triggerImmediateRefresh();
            } catch (err) {
                console.warn('[apiTaskAction]', err);
                // Fallback: use existing markFocusDoneNew for done action
                if (action === 'done') {
                    markFocusDoneNew(event, taskId);
                } else {
                    showToast(`⚠ Action failed: ${err.message}`, 'error');
                }
            }
        }

        // ── Inline Task Creation ─────────────────────────────────────────
        function toggleInlineTaskForm() {
            const form = document.getElementById('inline-task-form');
            if (!form) return;
            const isVis = form.classList.toggle('visible');
            if (isVis) {
                // Populate project dropdown from appData
                const sel = document.getElementById('itf-project');
                if (sel && window.appData?.projectDetails) {
                    const opts = ['<option value="">Project…</option>'];
                    Object.entries(window.appData.projectDetails).forEach(([k, v]) => {
                        opts.push(`<option value="${k}">${v.name || k}</option>`);
                    });
                    sel.innerHTML = opts.join('');
                }
                const titleInput = document.getElementById('itf-title');
                if (titleInput) { titleInput.value = ''; titleInput.focus(); }
            }
        }

        async function submitInlineTask() {
            const title = (document.getElementById('itf-title')?.value || '').trim();
            if (!title) { showToast('Enter a task title', 'warn'); return; }
            const project = document.getElementById('itf-project')?.value || '';
            const priority = document.getElementById('itf-priority')?.value || 'medium';
            const deadline = document.getElementById('itf-deadline')?.value || '';
            try {
                const res = await fetch(`${HELIOS_API_BASE}/api/tasks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, project, priority, deadline: deadline || undefined })
                });
                if (!res.ok) throw new Error('API ' + res.status);
                const data = await res.json();
                showToast(`+ Created ${data.task_id || 'task'}`, 'success');
                toggleInlineTaskForm();
                if (typeof triggerImmediateRefresh === 'function') triggerImmediateRefresh();
            } catch (err) {
                console.warn('[submitInlineTask]', err);
                showToast(`⚠ Create failed: ${err.message}`, 'error');
            }
        }

        function markFocusDoneNew(event, taskId) {
            event.stopPropagation();
            const card = document.getElementById('ftask-' + taskId);
            if (!card) return;

            // Persist to app state
            const now = new Date().toISOString();
            if (window.appData && window.appData.tasks && window.appData.tasks[taskId]) {
                window.appData.tasks[taskId].status = 'done';
                window.appData.tasks[taskId].completedAt = now;
                // Immediately refresh Recently Done panel
                renderOpsCards(window.appData);
            }
            try {
                const doneTasks = JSON.parse(localStorage.getItem('rs_done_tasks') || '{}');
                doneTasks[taskId] = now;
                localStorage.setItem('rs_done_tasks', JSON.stringify(doneTasks));
            } catch(_) {}

            // Attempt GitHub commit if PAT available
            const pat = localStorage.getItem('gh_pat');
            let ghPromise = null;
            if (pat) {
                ghPromise = commitTaskDoneToGitHub(taskId, pat);
            }

            // Visual: fade card
            card.style.transition = 'opacity 0.4s';
            card.style.opacity = '0.3';
            card.style.textDecoration = 'line-through';

            // Undo toast
            let undone = false;
            const toast = document.createElement('div');
            toast.style.cssText = [
                'position:fixed','bottom:28px','left:50%','transform:translateX(-50%)',
                'background:rgba(10,10,14,0.96)','border:1px solid rgba(220,38,38,0.4)',
                'border-radius:6px','padding:10px 20px','display:flex','align-items:center','gap:14px',
                "font-family:'Rajdhani',sans-serif",'font-size:13px','font-weight:600',
                'color:rgba(200,200,210,0.9)','letter-spacing:0.06em',
                'z-index:9999','box-shadow:0 4px 24px rgba(0,0,0,0.7)'
            ].join(';');
            const syncLabel = pat ? ' <span style="font-size:10px;color:rgba(80,200,120,0.7);">↑ syncing</span>' : '';
            toast.innerHTML = `<span>\u2713 ${taskId} marked done${syncLabel}</span>`
                + `<button style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.4);border-radius:4px;padding:3px 10px;color:rgba(220,38,38,0.9);cursor:pointer;font-family:'Rajdhani',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;" id="undo-btn-${taskId}">UNDO</button>`;
            document.body.appendChild(toast);

            if (ghPromise) {
                ghPromise.then(ok => {
                    if (!undone && document.body.contains(toast)) {
                        const syncEl = toast.querySelector('span span');
                        if (syncEl) syncEl.textContent = ok ? ' ✓ saved' : ' ⚠ local only';
                        if (syncEl) syncEl.style.color = ok ? 'rgba(80,200,120,0.7)' : 'rgba(220,160,60,0.7)';
                    }
                });
            }

            document.getElementById('undo-btn-' + taskId).onclick = function() {
                undone = true;
                if (window.appData && window.appData.tasks && window.appData.tasks[taskId]) {
                    window.appData.tasks[taskId].status = 'active';
                    window.appData.tasks[taskId].completedAt = null;
                }
                try {
                    const doneTasks = JSON.parse(localStorage.getItem('rs_done_tasks') || '{}');
                    delete doneTasks[taskId];
                    localStorage.setItem('rs_done_tasks', JSON.stringify(doneTasks));
                } catch(_) {}
                if (card) { card.style.opacity = '1'; card.style.textDecoration = 'none'; }
                if (document.body.contains(toast)) document.body.removeChild(toast);
                // Restore: re-render both panels
                if (window.appData) { renderOpsCards(window.appData); renderFocusTasks(window.appData); }
            };

            // Auto-dismiss after 5s
            setTimeout(() => {
                if (!undone) {
                    if (card && card.parentNode) card.remove();
                    if (document.body.contains(toast)) document.body.removeChild(toast);
                    // Re-render focus panel now that task is confirmed done
                    if (window.appData) renderFocusTasks(window.appData);
                }
            }, 5000);
            console.log('[Focus] Marked done:', taskId);
        }

        function toggleAlsoToday() {
            const content = document.getElementById('also-content');
            const chevron = document.getElementById('also-chevron');
            if (!content) return;
            const isOpen = content.classList.contains('expanded');
            content.classList.toggle('expanded', !isOpen);
            if (chevron) chevron.classList.toggle('open', !isOpen);
        }

        function shuffleFocusOrder() {
            localStorage.removeItem('rs_focus_order');
            if (window.appData) renderFocusTasks(window.appData);
        }

        // Drag-and-drop for focus tasks
        let _dragSrcId = null;
        function focusDragStart(event) {
            _dragSrcId = event.currentTarget.dataset.taskId;
            event.currentTarget.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
        }
        function focusDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            event.currentTarget.classList.add('drag-over');
        }
        function focusDrop(event) {
            event.preventDefault();
            const targetId = event.currentTarget.dataset.taskId;
            event.currentTarget.classList.remove('drag-over');
            if (!_dragSrcId || _dragSrcId === targetId) { _dragSrcId = null; return; }

            // Reorder _focusTaskOrder
            const srcIdx = _focusTaskOrder.indexOf(_dragSrcId);
            const tgtIdx = _focusTaskOrder.indexOf(targetId);
            if (srcIdx === -1 || tgtIdx === -1) { _dragSrcId = null; return; }
            _focusTaskOrder.splice(srcIdx, 1);
            _focusTaskOrder.splice(tgtIdx, 0, _dragSrcId);
            localStorage.setItem('rs_focus_order', JSON.stringify(_focusTaskOrder));
            // Auto-switch to custom filter when user drags to reorder
            _focusFilter = 'custom';
            localStorage.setItem('rs_focus_filter', 'custom');
            _dragSrcId = null;
            if (window.appData) renderFocusTasks(window.appData);
        }
        function initDragDrop() {
            document.querySelectorAll('.focus-task-card').forEach(el => {
                el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
                el.addEventListener('dragend', () => { el.classList.remove('dragging'); el.classList.remove('drag-over'); });
            });
        }

        // ── WEEK CALENDAR ─────────────────────────────────────────────────
        let _weekOffset = 0; // 0 = current week

        function renderWeekCalendar(data) {
            const tasks = Object.values(data.tasks || {});
            const sgtNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
            const today = sgtNow;
            today.setHours(0, 0, 0, 0);
            const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

            const dow = today.getDay();
            const diffToMon = dow === 0 ? -6 : 1 - dow;
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() + diffToMon + _weekOffset * 7);
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            const rangeLbl = document.getElementById('week-range-label');
            function fmtShort(d) { return d.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' }); }
            if (rangeLbl) rangeLbl.textContent = fmtShort(weekStart) + ' – ' + fmtShort(weekEnd);

            const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
            const grid = document.getElementById('week-grid');
            if (!grid) return;

            const cols = DAYS.map((dayName, idx) => {
                const colDate = new Date(weekStart);
                colDate.setDate(weekStart.getDate() + idx);
                colDate.setHours(0, 0, 0, 0);
                const colStr = colDate.getFullYear() + '-' + String(colDate.getMonth()+1).padStart(2,'0') + '-' + String(colDate.getDate()).padStart(2,'0');
                const isToday = colStr === todayStr;
                const isPast = colDate < today;
                const isFuture = colDate > today;

                // ── DONE tasks: show on deadline day (or completedAt if available) ──
                const doneTasks = tasks.filter(t => {
                    if (t.status !== 'done') return false;
                    const doneDate = (t.completedAt || t.deadline || '').slice(0, 10);
                    return doneDate === colStr;
                });

                // ── Active tasks with deadline on this day ──
                const scheduledTasks = sortTasksForAttention(
                    tasks.filter(t => t.status !== 'done' && t.deadline && t.deadline.slice(0, 10) === colStr),
                    today
                );

                // ── Today: also show overdue (deadline before this week) + high-priority no-deadline ──
                const overdueOnToday = isToday ? sortTasksForAttention(tasks.filter(t => {
                    if (t.status === 'done' || !t.deadline) return false;
                    const d = new Date(t.deadline); d.setHours(0,0,0,0);
                    return d < weekStart;
                }), today) : [];

                const noDeadlineOnToday = isToday ? sortTasksForAttention(tasks.filter(t => {
                    if (t.status === 'done' || t.deadline) return false;
                    return t.status === 'blocked' || normalizePriority(t.priority) === 'high';
                }), today).slice(0, 5) : [];

                function chipClass(t) {
                    if (t.status === 'done')    return 'week-chip-done';
                    if (t.status === 'blocked') return 'week-chip-blocked';
                    if (t.status === 'paused')  return 'week-chip-paused';
                    if (t.status === 'review')  return 'week-chip-review';
                    const normalized = normalizePriority(t.priority);
                    if (t.deadline) {
                        const d = new Date(t.deadline); d.setHours(0,0,0,0);
                        if (d < today) return 'week-chip-overdue';
                    }
                    if (normalized === 'high') return 'week-chip-critical';
                    if (normalized === 'medium') return 'week-chip-medium';
                    return 'week-chip-low';
                }

                // Build chips: done first (on past days), then overdue, then scheduled
                const allChips = [];

                // Done chips (green, shown on any day)
                doneTasks.forEach(t => {
                    allChips.push(`<span class="week-task-chip week-chip-done" title="✓ ${escHtml(t.title)}" onclick="openTask('${t.id}')">✓ ${escHtml(t.id)} ${escHtml(t.title.slice(0,15))}</span>`);
                });

                // Overdue chips (today only)
                overdueOnToday.forEach(t => {
                    allChips.push(`<span class="week-task-chip week-chip-overdue" title="▲ OVERDUE: ${escHtml(t.title)}" onclick="openTask('${t.id}')">▲ ${escHtml(t.id)} ${escHtml(t.title.slice(0,15))}</span>`);
                });

                // No-deadline chips (today only)
                noDeadlineOnToday.forEach(t => {
                    const cls = chipClass(t);
                    const label = t.status === 'blocked' ? '⚠' : '▶';
                    allChips.push(`<span class="week-task-chip ${cls}" title="${escHtml(t.title)} [no deadline]" onclick="openTask('${t.id}')">${label} ${escHtml(t.id)} ${escHtml(t.title.slice(0,15))}</span>`);
                });

                // Scheduled chips
                scheduledTasks.forEach(t => {
                    allChips.push(`<span class="week-task-chip ${chipClass(t)}" title="${escHtml(t.title)}" onclick="openTask('${t.id}')">${escHtml(t.id)} ${escHtml(t.title.slice(0,18))}</span>`);
                });

                const SHOW_LIMIT = 12;
                const visible = allChips.slice(0, SHOW_LIMIT).join('');
                const moreCount = allChips.length - SHOW_LIMIT;
                const dayCount = allChips.length;
                const doneCount = doneTasks.length;
                const moreBtn = moreCount > 0
                    ? `<button class="week-more-btn" onclick="expandWeekDay(this)">[+${moreCount} more]</button>
                       <div class="week-extra" style="display:none">${allChips.slice(SHOW_LIMIT).join('')}</div>`
                    : '';

                // Day summary: past days show done/total, future shows planned count
                let countLabel;
                const overdueCarried = isToday ? overdueOnToday.length : 0;
                if (isPast && doneCount > 0) {
                    countLabel = `<span style="color:var(--accent-green)">${doneCount} done</span>` + (scheduledTasks.length ? ` · ${scheduledTasks.length} missed` : '');
                } else if (isToday) {
                    const schedLabel = scheduledTasks.length ? scheduledTasks.length + ' due' : '';
                    const ovdLabel = overdueCarried ? `+${overdueCarried} overdue` : '';
                    const parts = [schedLabel, ovdLabel].filter(Boolean);
                    countLabel = parts.length ? parts.join(' · ') : 'clear';
                } else if (isFuture) {
                    countLabel = scheduledTasks.length ? `${scheduledTasks.length} planned` : 'open';
                } else {
                    countLabel = dayCount ? `${dayCount} items` : 'clear';
                }

                // Empty past day placeholder
                const emptyMsg = (isPast && dayCount === 0) ? '<div style="color:var(--text-muted);font-size:9px;padding:4px 0;text-align:center;">—</div>' : '';

                return `<div class="week-day-col${isToday ? ' today-col' : ''}${isPast ? ' past-col' : ''}">
                    <div class="week-day-header">
                        <span class="week-day-name">${dayName}</span>
                        <span class="week-day-num">${colDate.getDate()}</span>
                        <span class="week-day-count">${countLabel}</span>
                    </div>
                    ${emptyMsg}${visible}${moreBtn}
                </div>`;
            });

            grid.innerHTML = cols.join('');
        }

        function expandWeekDay(btn) {
            const extraEl = btn.nextElementSibling;
            if (!extraEl) return;
            const isOpen = extraEl.style.display !== 'none';
            extraEl.style.display = isOpen ? 'none' : 'block';
            btn.textContent = isOpen ? btn.textContent.replace('[−', '[+') : btn.textContent.replace('[+', '[−');
        }

        function changeWeek(direction) {
            if (direction === 0) _weekOffset = 0;
            else _weekOffset += direction;
            if (window.appData) renderWeekCalendar(window.appData);
        }

        // ── SYSTEM HEALTH ─────────────────────────────────────────────────
        function updateSystemHealth() {
            function setStatus(id, text, cls) {
                const el = document.getElementById(id);
                if (el) { el.textContent = text; el.className = 'health-status ' + (cls || ''); }
            }
            const wsOk = window.heliosSocket && window.heliosSocket.readyState === WebSocket.OPEN;
            setStatus('ws-status', wsOk ? 'live feed' : 'polling fallback', wsOk ? 'ok' : 'warn');
            const lastUpdated = window.appData?.lastUpdated ? new Date(window.appData.lastUpdated) : null;
            const ageMinutes = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 60000) : null;
            setStatus('helios-status', (window.appData?.updatedBy || 'data.json').toUpperCase(), '');
            setStatus('data-status', ageMinutes == null ? 'unknown' : ageMinutes <= 30 ? 'fresh' : `${ageMinutes}m old`, ageMinutes != null && ageMinutes <= 30 ? 'ok' : 'warn');
            setStatus('last-sync', lastUpdated ? formatAbsoluteTimestamp(window.appData.lastUpdated) : '—', '');

            // Agent fleet health rows
            const fleetEl = document.getElementById('agent-fleet-health');
            if (!fleetEl) return;

            const agents = window.appData && window.appData.agents
                ? window.appData.agents
                : {};

            function relativeTime(iso) {
                if (!iso) return '';
                const diff = Date.now() - new Date(iso).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 1)  return 'just now';
                if (mins < 60) return `${mins}m ago`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24)  return `${hrs}h ago`;
                return `${Math.floor(hrs / 24)}d ago`;
            }

            // Sort agents: priority from registry; exclude hidden agents
            const _priorityOrder = getHealthPriority();
            const agentKeys = Object.keys(agents).filter(k => !isAgentExcluded(k)).sort((a, b) => {
                const ai = _priorityOrder.indexOf(a.toLowerCase());
                const bi = _priorityOrder.indexOf(b.toLowerCase());
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.localeCompare(b);
            });
            let worstLevel = 0; // 0=good 1=warn 2=error

            if (!agentKeys.length) {
                fleetEl.innerHTML = '<div class="health-row" style="color:var(--text-muted);font-size:9px;">No agent data</div>';
                return;
            }

            fleetEl.innerHTML = agentKeys.map(key => {
                const ag = agents[key] || {};
                const meta = getAgentSignalMeta(key, window.appData);
                let dotCls = meta.dotClass === 'online' ? 'agent-dot-active' : meta.dotClass === 'blocked' ? 'agent-dot-blocked' : 'agent-dot-offline';
                let statusLabel = meta.label.toUpperCase();
                let rowLevel = meta.tone === 'blocked' ? 2 : meta.tone === 'offline' ? 1 : 0;
                if (rowLevel > worstLevel) worstLevel = rowLevel;

                const taskLabel = ag.currentTaskTitle || ag.currentTask || '';
                const taskSnippet = taskLabel
                    ? taskLabel.slice(0, 32) + (taskLabel.length > 32 ? '…' : '')
                    : '';
                const lastSeen = ag.lastActive ? relativeTime(ag.lastActive) : '—';
                const roleLine = ag.role_tagline ? ` <span class="agent-health-role">${ag.role_tagline}</span>` : '';

                return `<div class="health-row agent-health-row ${meta.tone === 'offline' ? 'agent-offline' : ''}">
                    <span class="agent-pulse-dot ${dotCls}"></span>
                    <span class="agent-health-name">${escHtml(formatAgentDisplay(key))}</span>${roleLine}
                    <div class="agent-health-right">
                        <span class="agent-health-status-label ${dotCls}">${statusLabel}</span>
                        <span class="agent-health-task" title="${escHtml(meta.detail || taskLabel)}">${escHtml(taskSnippet || meta.detail || '').slice(0, 64)}</span>
                        <span class="agent-health-timestamp">${lastSeen}</span>
                    </div>
                </div>`;
            }).join('');

            // Update overall health indicator dot
            const indEl = document.getElementById('health-indicator');
            if (indEl) {
                const dot = indEl.querySelector('.health-dot');
                if (dot) {
                    dot.className = 'health-dot ' + (worstLevel >= 2 ? 'error' : worstLevel >= 1 ? 'warn' : 'good');
                }
            }
        }

        // Set up 60-second health refresh interval (idempotent guard)
        if (!window._healthIntervalSet) {
            window._healthIntervalSet = true;
            setInterval(() => { updateSystemHealth(); }, 60000);
        }

        // ── CARD TOGGLE ───────────────────────────────────────────────────
        function toggleCard(bodyId) {
            const el = document.getElementById(bodyId);
            if (!el) return;
            const btn = el.closest('.cmd-card')?.querySelector('.card-toggle-btn svg');
            const isHidden = el.style.display === 'none';
            el.style.display = isHidden ? '' : 'none';
            if (btn) btn.style.transform = isHidden ? '' : 'rotate(180deg)';
        }

        // ── Keep appData globally accessible for ticker/calendar re-renders
        const _origLoadData_v2 = loadData;



        // ─── ALERT QUEUE ─────────────────────────────────────────────────────
        function renderAlertQueue(data) {
            const container = document.getElementById('alert-queue');
            const countBadge = document.getElementById('alert-count');
            if (!container) return;

            const allTasks = Object.entries(data.tasks || {}).map(([id, t]) => ({...t, id}));
            const today = new Date(); today.setHours(0, 0, 0, 0);

            const alerts = allTasks.filter(t => {
                if (t.status === 'done') return false;
                if (t.status === 'blocked') return true;
                if (t.deadline) {
                    const dl = new Date(t.deadline); dl.setHours(0,0,0,0);
                    return dl < today;
                }
                return false;
            }).slice(0, 4);

            if (countBadge) countBadge.textContent = alerts.length;

            const panel = document.getElementById('alert-queue-panel');
            if (panel && alerts.length > 0) {
                panel.style.borderLeft = '3px solid #ff4444';
                panel.classList.add('alert-pulse');
            }

            if (alerts.length === 0) {
                container.innerHTML = '<div style="text-align:center;color:var(--success);padding:20px;font-size:10px;">✓ No overdue or blocked tasks</div>';
                return;
            }

            container.innerHTML = alerts.map(t => {
                const kind = t.status === 'blocked' ? 'blocked' : 'overdue';
                const dl = t.deadline ? new Date(t.deadline).toLocaleDateString('en-SG', {month:'short', day:'numeric'}) : '';
                const assignee = t.assignedTo || '—';
                return `<div class="alert-item ${kind}">
                    <div>
                        <span class="alert-task-id">${t.id}</span>
                        <div class="alert-task-title" style="margin-top:4px;">${t.title}</div>
                        ${dl ? `<div class="alert-task-deadline">⚠ ${kind.toUpperCase()} · ${dl}</div>` : `<div class="alert-task-deadline">⚑ BLOCKED</div>`}
                        <div class="alert-task-assignee">${assignee}</div>
                    </div>
                </div>`;
            }).join('');
        }

        // ─── AGENT FLEET ─────────────────────────────────────────────────────
        // AGENT_DISPLAY_NAMES — now reads from agent-registry.js
        function getAgentDisplayName(a) {
            const id = a.id || a.slug || '';
            return formatAgentDisplay(id).toUpperCase() || (a.name ? a.name.toUpperCase() : null) || 'AGENT';
        }
        function renderAgentFleet(agents) {
            const container = document.getElementById('agent-fleet');
            const countBadge = document.getElementById('fleet-count');
            if (!container) return;

            const arr = Array.isArray(agents) ? agents : Object.entries(agents || {}).map(([id, d]) => ({id, ...d}));
            if (countBadge) countBadge.textContent = arr.length;

            const order = {active: 0, idle: 1, blocked: 2, offline: 3};
            const sorted = [...arr].sort((a, b) => (order[(a.status||'offline').toLowerCase()] ?? 4) - (order[(b.status||'offline').toLowerCase()] ?? 4));

            const groups = {active: [], idle: [], 'blocked/offline': [], 'not spawned': []};
            sorted.forEach(a => {
                const s = (a.status || 'offline').toLowerCase();
                if (s === 'active') groups.active.push(a);
                else if (s === 'idle') groups.idle.push(a);
                else if (s === 'not_spawned') groups['not spawned'].push(a);
                else groups['blocked/offline'].push(a);
            });

            let html = '';
            for (const [label, list] of Object.entries(groups)) {
                if (!list.length) continue;
                html += `<div class="fleet-section-label">${label}</div>`;
                html += list.map(a => {
                    const s = (a.status || 'offline').toLowerCase();
                    const seen = a.last_seen ? relTime(a.last_seen) : (a.lastActive ? relTime(a.lastActive) : '');
                    const taskCount = a.taskCount ?? a.activeTasks ?? 0;
                    const role = a.role || '';
                    const blocked = s === 'blocked';
                    return `<div class="fleet-row${blocked ? ' blocked' : ''}">
                        <div class="fleet-status-dot ${s}"></div>
                        <div>
                            <div class="fleet-agent-name">${getAgentDisplayName(a)}</div>
                            ${role ? `<div class="fleet-agent-role">${role}</div>` : ''}
                        </div>
                        ${seen ? `<div class="fleet-seen">${seen} ago</div>` : ''}
                        ${taskCount ? `<div class="fleet-task-count">${taskCount}</div>` : ''}
                    </div>`;
                }).join('');
            }

            container.innerHTML = html || '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:10px;">No agent data</div>';
        }

        // ─── WORKFLOW STATUS ──────────────────────────────────────────────────
        function renderWorkflowStatus(data) {
            const wf = data.workflow || {};
            const tasks = data.tasks || {};

            const cols = {pending: 'wf-pending', active: 'wf-active', review: 'wf-review', done: 'wf-done'};
            for (const [status, elId] of Object.entries(cols)) {
                const ids = wf[status] || [];
                const countEl = document.getElementById(elId);
                const pillsEl = document.getElementById(elId + '-pills');
                if (countEl) countEl.textContent = ids.length;
                if (pillsEl) {
                    const first3 = ids.slice(0, 3);
                    const rest = ids.length - 3;
                    pillsEl.innerHTML = first3.map(id => {
                        const t = tasks[id];
                        const label = t ? t.title.slice(0, 14) + (t.title.length > 14 ? '…' : '') : id;
                        return `<div class="wf-pill" title="${t ? t.title : id}">${label}</div>`;
                    }).join('') + (rest > 0 ? `<div class="wf-overflow">+${rest} more</div>` : '');
                }
            }

            const total = Object.values(wf).reduce((s, arr) => s + (arr?.length || 0), 0);
            const done  = wf.done?.length || 0;
            const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
            const pctEl = document.getElementById('wf-pct');
            const fillEl = document.getElementById('wf-progress-fill');
            if (pctEl)  pctEl.textContent  = pct + '%';
            if (fillEl) fillEl.style.width = pct + '%';
        }

        // ─── DECISIONS REQUIRED ───────────────────────────────────────────────
        function renderDecisionsRequired(data) {
            const container = document.getElementById('decisions-list');
            const countEl   = document.getElementById('decisions-count');
            if (!container) return;

            const allTasks = Object.entries(data.tasks || {}).map(([id, t]) => ({...t, id}));
            const review = allTasks.filter(t => t.status === 'review');

            if (countEl) countEl.textContent = review.length;

            if (!review.length) {
                container.innerHTML = '<div style="text-align:center;color:var(--success);padding:16px;font-size:10px;">✓ No pending decisions</div>';
                return;
            }

            container.innerHTML = review.slice(0, 6).map(t => `
                <div class="decision-item">
                    <div class="decision-item-id">${t.id}</div>
                    <div class="decision-item-title">${t.title}</div>
                    ${t.description ? `<div class="decision-item-hint">${t.description.slice(0,80)}${t.description.length>80?'…':''}</div>` : ''}
                </div>`).join('');
        }

        // ─── RECENTLY COMPLETED ───────────────────────────────────────────────
        function renderRecentlyCompleted(data) {
            const container = document.getElementById('completed-list');
            if (!container) return;

            const allTasks = Object.entries(data.tasks || {}).map(([id, t]) => ({...t, id}));
            const done = allTasks
                .filter(t => t.status === 'done')
                .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0))
                .slice(0, 5);

            if (!done.length) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:10px;">No completed tasks yet</div>';
                return;
            }

            container.innerHTML = done.map(t => {
                const when = t.completedAt || t.updatedAt ? relTime(t.completedAt || t.updatedAt) + ' ago' : '';
                return `<div class="completed-item">
                    <span class="completed-checkmark">✓</span>
                    <span class="completed-title">${t.title}</span>
                    <span class="completed-time">${when}</span>
                </div>`;
            }).join('');
        }

        // ─── AGENT ASSIGNMENTS OVERVIEW ───────────────────────────────────────
        function renderAgentAssignments(data) {
            const container = document.getElementById('assignments-table');
            if (!container) return;

            const allTasks = Object.values(data.tasks || {});
            const agentMap = {};

            allTasks.forEach(t => {
                const ag = t.assignedTo || 'UNASSIGNED';
                if (!agentMap[ag]) agentMap[ag] = { total: 0, done: 0, blocked: 0, active: 0 };
                agentMap[ag].total++;
                if (t.status === 'done') agentMap[ag].done++;
                if (t.status === 'blocked') agentMap[ag].blocked++;
                if (t.status === 'active') agentMap[ag].active++;
            });

            const rows = Object.entries(agentMap)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 8);

            container.innerHTML = `<table class="assignments-table">
                <thead><tr>
                    <th>Agent</th><th>Total</th><th>Active</th><th>Done</th><th>Blocked</th>
                </tr></thead>
                <tbody>${rows.map(([name, st]) => `<tr>
                    <td>${name}</td>
                    <td>${st.total}</td>
                    <td>${st.active}</td>
                    <td style="color:var(--success)">${st.done}</td>
                    <td class="${st.blocked ? 'assignments-blocked' : ''}">${st.blocked || '—'}</td>
                </tr>`).join('')}</tbody>
            </table>`;
        }

        // ─── BACKLOG SPOTLIGHT ────────────────────────────────────────────────
        function renderBacklogSpotlight(data) {
            const container = document.getElementById('backlog-spotlight');
            if (!container) return;

            const allTasks = Object.entries(data.tasks || {}).map(([id, t]) => ({...t, id}));
            const backlog = allTasks.filter(t => t.status === 'backlog' || t.status === 'pending');

            if (!backlog.length) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:10px;">No backlog tasks</div>';
                return;
            }

            // Shuffle and pick 3
            const shuffled = [...backlog].sort(() => Math.random() - 0.5).slice(0, 3);
            container.innerHTML = shuffled.map(t => `
                <div class="backlog-card">
                    <div class="backlog-card-id">${t.id} · ${t.project || ''}</div>
                    <div class="backlog-card-title">${t.title}</div>
                    ${t.description ? `<div class="backlog-card-hint">${t.description.slice(0,70)}${t.description.length>70?'…':''}</div>` : ''}
                </div>`).join('');
        }

        // ─── SYSTEM COMMS ─────────────────────────────────────────────────────
        async function renderSystemComms() {
            const container = document.getElementById('system-comms');
            if (!container) return;

            container.innerHTML = `
                <div class="comms-row"><span class="comms-label">Source status</span><span class="comms-value" id="comms-helios">Checking…</span></div>
                <div class="comms-row"><span class="comms-label">WebSocket</span><span class="comms-value" id="comms-ws">—</span></div>
                <div class="comms-row"><span class="comms-label">data.json</span><span class="comms-value" id="comms-data">—</span></div>
                <div class="comms-row"><span class="comms-label">Redis</span><span class="comms-value" id="comms-redis">—</span></div>
                <div class="comms-row"><span class="comms-label">Telegram</span><span class="comms-value" id="comms-tg">—</span></div>
                <div class="comms-row"><span class="comms-label">API Latency</span><span class="comms-value" id="comms-latency">—</span></div>`;

            try {
                const t0 = Date.now();
                const r = await fetch(`${HELIOS_API_BASE}/api/health?t=${t0}`, { cache: 'no-store' });
                const latency = Date.now() - t0;
                const set = (id, txt, cls) => { const el = document.getElementById(id); if (el) { el.textContent = txt; if (cls) el.className = 'comms-value ' + cls; } };

                if (r.ok) {
                    const h = await r.json();
                    const la = h.last_audit ? relTime(h.last_audit) + ' ago' : '—';
                    const lae = document.getElementById('last-audit-time');
                    if (lae) lae.textContent = la;

                    set('comms-helios', 'ONLINE', 'ok');
                    set('comms-latency', latency + 'ms', latency < 500 ? 'ok' : latency < 1500 ? 'warn' : 'error');
                    set('comms-ws', heliosSocket && heliosSocket.readyState === WebSocket.OPEN ? 'CONNECTED' : 'POLLING', 'ok');
                    set('comms-data', appData ? 'LOADED' : 'MISSING', appData ? 'ok' : 'error');
                    set('comms-redis', h.redis === 'ok' || h.services?.redis === 'ok' ? 'OK' : 'UNKNOWN', 'warn');
                    set('comms-tg', h.telegram === 'ok' || h.services?.telegram === 'ok' ? 'OK' : 'UNKNOWN', 'warn');
                } else {
                    set('comms-helios', 'ERROR ' + r.status, 'error');
                }
            } catch(e) {
                const el = document.getElementById('comms-helios');
                if (el) { el.textContent = 'OFFLINE'; el.className = 'comms-value error'; }
                // Fallback: show data.json lastUpdated when the remote source is offline
                const lae = document.getElementById('last-audit-time');
                if (lae && (lae.textContent === '—' || lae.textContent === '') && window.appData && window.appData.lastUpdated) {
                    const diff = Date.now() - new Date(window.appData.lastUpdated).getTime();
                    const hrs = Math.floor(diff / 3600000);
                    const fallbackTxt = hrs < 1 ? 'just now' : hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs/24)}d ago`;
                    lae.textContent = fallbackTxt + ' (data.json)';
                }
            }
        }

        // ─── LIVE FEED ────────────────────────────────────────────────────────
        let _liveFeedCount = 0;
        let _feedCountdown = null;
        const _MAX_FEED_LINES = 10;

        function appendLiveFeedLine(agent, eventType, text) {
            const feed = document.getElementById('live-feed');
            if (!feed) return;

            const now = new Date();
            const ts = now.toTimeString().slice(0,8);
            const cls = eventType === 'error' ? 'error' : eventType === 'done' || eventType === 'complete' ? 'completion' : 'heartbeat';
            const agentLabel = agent || 'HELIOS';

            _liveFeedCount++;
            const cntEl = document.getElementById('feed-event-count');
            if (cntEl) cntEl.textContent = _liveFeedCount;

            const line = document.createElement('div');
            line.className = 'feed-line';
            line.innerHTML = `<span class="feed-time">${ts}</span><span class="feed-agent">${agentLabel.toUpperCase()}</span><span class="feed-text ${cls}">${text}</span>`;

            // Prepend (newest at top) — feed uses column-reverse
            feed.insertBefore(line, feed.firstChild);

            // Trim to max lines
            const lines = feed.querySelectorAll('.feed-line');
            if (lines.length > _MAX_FEED_LINES) {
                feed.removeChild(lines[lines.length - 1]);
            }
        }

        function setFeedStatus(connected) {
            const dot = document.getElementById('feed-dot');
            const txt = document.getElementById('feed-status-text');
            if (!dot || !txt) return;

            // Update topbar live indicator
            const wsInd = document.getElementById('ws-live-indicator');
            if (wsInd) {
                wsInd.className = 'ws-live-indicator ' + (connected ? 'ws-live' : 'ws-polling');
                const lbl = wsInd.querySelector('.ws-label');
                if (lbl) lbl.textContent = connected ? 'LIVE' : 'POLLING';
            }

            if (connected) {
                dot.className = 'feed-dot';
                txt.textContent = '● LIVE';
                if (_feedCountdown) { clearInterval(_feedCountdown); _feedCountdown = null; }
            } else {
                dot.className = 'feed-dot offline';
                let secs = 30;
                txt.textContent = `POLLING — next refresh in ${secs}s`;
                if (_feedCountdown) clearInterval(_feedCountdown);
                _feedCountdown = setInterval(() => {
                    secs--;
                    if (secs <= 0) {
                        clearInterval(_feedCountdown);
                        _feedCountdown = null;
                        txt.textContent = 'POLLING — refreshing...';
                    } else {
                        txt.textContent = `POLLING — next refresh in ${secs}s`;
                    }
                }, 1000);
            }
        }

        function renderAgentActivity(data) {
            const container = document.getElementById('agent-activity');
            const countBadge = document.getElementById('agent-activity-count');
            
            if (!container) return;
            
            const agents = data.agents || [];
            const agentDetails = data.agentDetails || {};
            
            // Convert agents object to array if needed
            const agentsArray = Array.isArray(agents) ? agents : Object.entries(agents).map(([id, data]) => ({
                id,
                name: id.charAt(0).toUpperCase() + id.slice(1).replace('_', ' '),
                ...data
            }));
            
            if (countBadge) countBadge.textContent = agentsArray.length;
            
            container.innerHTML = agentsArray.map(agent => {
                const details = agentDetails[agent.id] || {};
                const isExpanded = window.expandedState && window.expandedState['agent-' + agent.id];
                const statusColor = agent.status === 'active' ? 'var(--success)' : 'var(--text-muted)';
                const timeDisplay = agent.lastActive ? formatRelativeTimestamp(agent.lastActive) : (agent.status === 'active' ? 'Now' : 'Idle');
                
                return `
                <div class="agent-activity-item expandable-item ${isExpanded ? 'expanded' : ''}" 
                     onclick="toggleExpand('agent-${agent.id}')"
                     style="padding: 12px; border-bottom: 1px solid var(--crystal-border);">
                    <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; ${agent.status === 'active' ? 'animation: pulse 2s infinite;' : ''}"></div>
                        <span style="font-weight: 600; color: #4dabf7;">${agent.name}</span>
                        <span style="font-size: 11px; color: var(--text-muted); margin-left: auto;">${timeDisplay}</span>
                        <span class="expandable-arrow">▼</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); padding-left: 18px; margin-top: 4px;">
                        ${agent.currentTask}
                    </div>
                    <div class="expandable-content ${isExpanded ? 'expanded' : ''}" id="agent-${agent.id}-content">
                        <div class="expandable-details" style="margin-left: 18px;">
                            ${details.last5Min ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">LAST 5 MIN:</div>
                                <div class="expandable-details-value">${details.last5Min}</div>
                            </div>
                            ` : ''}
                            ${details.currently ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">CURRENTLY:</div>
                                <div class="expandable-details-value">${details.currently}</div>
                            </div>
                            ` : ''}
                            ${details.youShouldKnow ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">YOU SHOULD KNOW:</div>
                                <div class="expandable-details-value" style="color: var(--success);">${details.youShouldKnow}</div>
                            </div>
                            ` : ''}
                            ${details.actionNeeded ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">ACTION NEEDED:</div>
                                <div class="expandable-details-value" style="color: ${details.actionNeeded.includes('None') ? 'var(--text-secondary)' : '#ff6b6b'};">${details.actionNeeded}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        }

        function renderMiniStats(data) {
            const stats = data.stats || {};
            
            const miniWins = document.getElementById('mini-wins');
            const miniVelocity = document.getElementById('mini-velocity');
            
            if (miniWins) miniWins.textContent = stats.tasksDone || 0;
            
            // Calculate velocity properly from workflow data
            const workflow = data.workflow || {};
            const pending = workflow.pending?.length || 0;
            const active = workflow.active?.length || 0;
            const review = workflow.review?.length || 0;
            const done = workflow.done?.length || 0;
            const total = pending + active + review + done;
            
            let velocity = total > 0 ? Math.round((done / total) * 100) : 0;
            // Cap at 100% for sanity
            velocity = Math.min(velocity, 100);
            if (miniVelocity) miniVelocity.textContent = velocity + '%';
        }

        // ─── COMMAND STRIP (18 stats) ──────────────────────────────────────────
        function renderRedSunStats(data) { renderCmdStrip(data); }  // alias
        function renderCmdStrip(data) {
            const s   = data.stats    || {};
            const wf  = data.workflow || {};
            const allTasks = Object.values(data.tasks || {});
            const agentObj = data.agents || {};
            const agentArr = Array.isArray(agentObj) ? agentObj : Object.values(agentObj);

            // Correct keys from data.json
            const totalTasks  = s.totalTasks  ?? allTasks.length;
            const urgentTasks = s.urgent      ?? allTasks.filter(t => t.priority === 'high' && t.status !== 'done').length;
            const highPri     = s.highPriority ?? allTasks.filter(t => t.priority === 'high').length;
            const activeTasks = wf.active?.length  ?? allTasks.filter(t => t.status === 'active').length;
            const pendTasks   = wf.pending?.length ?? allTasks.filter(t => t.status === 'pending').length;
            const reviewTasks = wf.review?.length  ?? allTasks.filter(t => t.status === 'review').length;
            const doneTasks   = wf.done?.length    ?? allTasks.filter(t => t.status === 'done').length;
            const backlog     = s.backlog ?? allTasks.filter(t => t.status === 'backlog').length;

            const totalAgents  = agentArr.length;
            const onlineAgents = agentArr.filter(a => {
                const st = (a.status || '').toLowerCase();
                return st === 'active' || st === 'idle';
            }).length;

            const total = Object.values(wf).reduce((acc, arr) => acc + (arr?.length || 0), 0);
            const pct   = total > 0 ? Math.round((doneTasks / total) * 100) : 0;

            const today = new Date();
            const overdue = allTasks.filter(t => {
                if (t.status === 'done') return false;
                const d = t.deadline || t.due;
                return d && new Date(d) < today;
            }).length;

            const lastSync  = data.lastUpdated ? relTime(data.lastUpdated) : '—';
            const dataAge   = data.lastUpdated ? relTime(data.lastUpdated) : '—';

            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('rs-total',    totalTasks);
            set('rs-urgent',   urgentTasks);
            set('rs-highpri',  highPri);
            set('rs-active',   activeTasks);
            set('rs-pending',  pendTasks);
            set('rs-review',   reviewTasks || '0');
            set('rs-done',     doneTasks);
            set('rs-backlog',  backlog);
            set('rs-agents',   totalAgents);
            set('rs-online',   onlineAgents);
            set('rs-pct',      pct + '%');
            set('rs-overdue',  overdue);
            set('rs-last-sync', lastSync);
            set('rs-data-age', dataAge);

            // Health chips in agent rail
            const heliosOk = typeof heliosSocket !== 'undefined' && heliosSocket?.readyState === 1;
            const wsOk     = typeof heliosSocket !== 'undefined' && heliosSocket?.readyState === 1;
            const updateDot = (dotId, lblId, cls, lbl) => {
                const d = document.getElementById(dotId), l = document.getElementById(lblId);
                if (d) { d.className = 'rail-chip-dot ' + cls; }
                if (l) l.textContent = lbl;
            };
            updateDot('rc-helios-dot', 'rc-helios-lbl', heliosOk ? 'ok' : 'error', 'HELIOS');
            updateDot('rc-ws-dot',     'rc-ws-lbl',     wsOk ? 'ok' : 'warn', 'WS');
            updateDot('rc-data-dot',   'rc-data-lbl',   'dim', dataAge);

            // CmdStrip status tiles
            const setStatus = (id, txt, cls) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.textContent = txt;
                el.parentElement.className = 'cmd-stat ' + cls;
            };
            setStatus('rs-helios-status', heliosOk ? 'ON' : 'OFF', heliosOk ? 'done' : 'alert');
            setStatus('rs-ws-status',     wsOk ? 'LIVE' : 'POLL', wsOk ? 'done' : 'warn');
        }


        // ─── TODAY'S FOCUS (legacy — superseded by renderFocusTasks) ──────────────
        // ─── _legacyRenderTodaysFocus: legacy render (superseded by renderFocusTasks) ───
        function _legacySetFocusFilter(filter, btn) {
            document.querySelectorAll('.focus-filter-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            _legacyRenderTodaysFocus(filter);
        }

        function _legacyRenderTodaysFocus(filter) {
            let filtered;
            if (filter === 'none') {
                filtered = allTasks.filter(t => t.status !== 'done' && t.priority === 'high');
            } else if (filter === 'high') {
                filtered = allTasks.filter(t => t.status !== 'done' && (t.priority === 'high' || t.priority === 'medium'));
            } else if (filter === 'active') {
                filtered = allTasks.filter(t => t.status === 'active' || t.status === 'review');
            } else {
                filtered = allTasks.filter(t => t.status !== 'done').slice(0, 40);
            }

            // Apply user-persisted order from localStorage
            const storageKey = 'focus_order_' + filter;
            try {
                const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
                if (saved && Array.isArray(saved)) {
                    const orderMap = {};
                    saved.forEach((id, i) => orderMap[id] = i);
                    filtered.sort((a, b) => {
                        const aIdx = orderMap[a.id] ?? 999;
                        const bIdx = orderMap[b.id] ?? 999;
                        if (aIdx !== bIdx) return aIdx - bIdx;
                        const pOrder = { high: 0, medium: 1, low: 2 };
                        return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
                    });
                } else {
                    filtered.sort((a, b) => {
                        const pOrder = { high: 0, medium: 1, low: 2 };
                        return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
                    });
                }
            } catch(_) {
                filtered.sort((a, b) => {
                    const pOrder = { high: 0, medium: 1, low: 2 };
                    return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
                });
            }

            if (countBadge) countBadge.textContent = filtered.length;

            if (!filtered.length) {
                container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px;font-size:10px;">No tasks match this filter</div>';
                return;
            }

            container.innerHTML = filtered.map(task => {
                const isOverdue = task.deadline && new Date(task.deadline) < today && task.status !== 'done';
                const badgeCls  = isOverdue ? 'overdue' : (task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'medium' : 'low');
                const badgeTxt  = isOverdue ? 'OVERDUE' : (task.priority === 'high' ? 'HIGH' : task.priority === 'medium' ? 'MED' : 'LOW');
                const desc = task.description ? task.description.slice(0, 60) + (task.description.length > 60 ? '…' : '') : '';
                const assignee = task.assignedTo || '';
                return `<div class="focus-task-item" draggable="true" data-task-id="${task.id}" data-filter="${filter}">
                    <div class="focus-task-row1">
                        <span class="focus-priority-badge ${badgeCls}">${badgeTxt}</span>
                        <span class="focus-task-id">${task.project || ''}</span>
                        <span class="focus-task-title">${task.title || task.id}</span>
                    </div>
                    ${desc ? `<div class="focus-task-desc">${desc}</div>` : ''}
                    <div class="focus-task-row2">
                        ${assignee ? `<span class="focus-assignee-badge">${assignee}</span>` : ''}
                        <div class="focus-task-actions">
                            <button class="focus-action-btn done-btn" onclick="markFocusDone('${task.id}')">Mark Done</button>
                        </div>
                    </div>
                </div>`;
            }).join('');

            // Wire up drag-and-drop for ordering
            let dragSrcId = null;
            container.querySelectorAll('.focus-task-item').forEach(item => {
                item.addEventListener('dragstart', e => { dragSrcId = item.dataset.taskId; item.style.opacity = '0.5'; });
                item.addEventListener('dragend', e => { item.style.opacity = '1'; });
                item.addEventListener('dragover', e => { e.preventDefault(); item.style.borderTop = '2px solid var(--crimson-bright)'; });
                item.addEventListener('dragleave', e => { item.style.borderTop = ''; });
                item.addEventListener('drop', e => {
                    e.preventDefault(); item.style.borderTop = '';
                    if (dragSrcId && dragSrcId !== item.dataset.taskId) {
                        const items = [...container.querySelectorAll('.focus-task-item')];
                        const newOrder = items.map(el => el.dataset.taskId);
                        const si = newOrder.indexOf(dragSrcId);
                        const ti = newOrder.indexOf(item.dataset.taskId);
                        newOrder.splice(si, 1); newOrder.splice(ti, 0, dragSrcId);
                        try { localStorage.setItem(storageKey, JSON.stringify(newOrder)); } catch(_) {}
                        renderTodaysFocus(filter);
                    }
                    dragSrcId = null;
                });
            });
        }

        function markFocusDone(taskId) {
            // Just visual feedback until real API is available
            const item = document.querySelector(`.focus-task-item[data-task-id="${taskId}"]`);
            if (item) { item.style.opacity = '0.3'; item.style.textDecoration = 'line-through'; }
            appendLiveFeedLine('CHAD YI', 'done', `Task ${taskId} marked done`);
        }
        function assignFocusTask(taskId) {
            const ag = prompt('Assign to agent (e.g. CEREBRONN, HELIOS):', '');
            if (ag) appendLiveFeedLine('CHAD YI', 'heartbeat', `Task ${taskId} → ${ag.toUpperCase()}`);
        }

        function renderUrgentQueue(data) {
            const container = document.getElementById('urgent-queue');
            const countBadge = document.getElementById('urgent-count');
            
            // Exit if element doesn't exist on this page
            if (!container) return;
            
            const workflow = data.workflow || {};
            const tasks = data.tasks || {};
            const urgentDetails = data.urgentTaskDetails || {};
            
            // Get ALL task IDs from all workflow statuses (not just pending)
            const allTaskIds = [
                ...(workflow.pending || []),
                ...(workflow.active || []),
                ...(workflow.review || [])
            ];
            
            // Look up actual task objects from IDs
            const allTasks = allTaskIds.map(id => tasks[id]).filter(t => t);
            
            // Filter urgent tasks (high priority or overdue)
            const urgentTasks = allTasks.filter(t => {
                if (t.priority === 'high') return true;
                // Check if due within 48 hours
                if (t.deadline) {
                    const due = new Date(t.deadline);
                    const now = new Date();
                    const hoursUntilDue = (due - now) / (1000 * 60 * 60);
                    return hoursUntilDue <= 48 && hoursUntilDue > 0;
                }
                return false;
            }).slice(0, 8);

            if (countBadge) countBadge.textContent = urgentTasks.length;

            if (urgentTasks.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    ✓ No urgent tasks right now
                </div>`;
                return;
            }

            container.innerHTML = urgentTasks.map(task => {
                const projectInfo = appData.projectDetails && appData.projectDetails[task.project] ? appData.projectDetails[task.project] : { name: task.project };
                const deadline = task.deadline ? `Due: ${new Date(task.deadline).toLocaleDateString()}` : '';
                const details = urgentDetails[task.id] || {};
                const isExpanded = window.expandedState && window.expandedState['urgent-' + task.id];
                
                return `
                <div class="column-task-item urgent expandable-item ${isExpanded ? 'expanded' : ''}" onclick="toggleExpand('urgent-${task.id}')">
                    <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                        <div style="flex: 1;">
                            <div class="column-task-title">${details.title || task.title}</div>
                            <div class="column-task-meta">
                                <span class="column-task-project">${task.project} · ${projectInfo.name}</span>
                                <span class="column-task-due ${task.priority === 'high' ? 'overdue' : ''}">
                                    ${details.deadline || deadline || (task.priority === 'high' ? 'HIGH' : 'MEDIUM')}
                                </span>
                            </div>
                            <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">${details.brief || task.notes || ''}</div>
                        </div>
                        <span class="expandable-arrow">▼</span>
                    </div>
                    <div class="expandable-content ${isExpanded ? 'expanded' : ''}" id="urgent-${task.id}-content">
                        <div class="expandable-details">
                            ${details.specificSteps ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">SPECIFIC STEPS:</div>
                                <div class="expandable-details-value">
                                    <ol>
                                        ${details.specificSteps.map(step => `<li>${step}</li>`).join('')}
                                    </ol>
                                </div>
                            </div>
                            ` : ''}
                            ${details.deadlineText ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">DEADLINE:</div>
                                <div class="expandable-details-value" style="color: #ff6b6b;">${details.deadlineText}</div>
                            </div>
                            ` : ''}
                            ${details.priorityReason ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">PRIORITY:</div>
                                <div class="expandable-details-value">${details.priorityReason}</div>
                            </div>
                            ` : ''}
                            ${details.ifNotDone ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">IF NOT DONE:</div>
                                <div class="expandable-details-value" style="color: #ff6b6b;">${details.ifNotDone}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        }

        function renderInputNeeded(data) {
            const container = document.getElementById('input-needed');
            const countBadge = document.getElementById('input-count');
            
            // Exit if element doesn't exist on this page
            if (!container) return;
            
            // Get inputs from the new inputsNeeded array
            const inputsNeeded = data.inputsNeeded || [];
            const inputDetails = data.inputDetails || {};
            
            // Also check review tasks
            const workflow = data.workflow || {};
            const tasks = data.tasks || {};
            const reviewIds = workflow.review || [];
            const reviewTasks = reviewIds.map(id => tasks[id]).filter(t => t);
            
            // Combine both sources
            const allInputs = [
                ...inputsNeeded.map(item => ({
                    type: 'INPUT',
                    ...item,
                    ...inputDetails[item.taskId]
                })),
                ...reviewTasks.map(task => ({
                    type: 'REVIEW',
                    title: task.title,
                    taskId: task.id,
                    brief: `${task.project || 'General'} • From: ${task.from || 'Agent'}`,
                    whatINeed: 'Review and approve this task',
                    why: 'Task is waiting for your approval to proceed',
                    steps: ['Open the task details', 'Review the work done', 'Approve or request changes'],
                    currentStatus: 'Waiting for your review'
                }))
            ];
            
            if (countBadge) countBadge.textContent = allInputs.length;

            if (allInputs.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    ✓ Nothing waiting for your input
                </div>`;
                return;
            }

            container.innerHTML = allInputs.map(item => {
                const isExpanded = window.expandedState && window.expandedState['input-' + item.taskId];
                return `
                <div class="input-item expandable-item ${isExpanded ? 'expanded' : ''}" 
                     onclick="toggleExpand('input-${item.taskId}')"
                     style="padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid ${item.type === 'INPUT' ? '#ff6b6b' : '#c9a962'}; cursor: pointer;">
                    <div style="display: flex; align-items: center; width: 100%;">
                        <div style="flex: 1;">
                            <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: ${item.type === 'INPUT' ? '#ff6b6b' : '#c9a962'};">${item.type}</span>
                            <div style="font-weight: 600; margin: 4px 0;">${item.title}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">${item.brief}</div>
                        </div>
                        <span class="expandable-arrow">▼</span>
                    </div>
                    <div class="expandable-content ${isExpanded ? 'expanded' : ''}" id="input-${item.taskId}-content">
                        <div class="expandable-details">
                            ${item.whatINeed ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">WHAT I NEED:</div>
                                <div class="expandable-details-value">${item.whatINeed}</div>
                            </div>
                            ` : ''}
                            ${item.why ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">WHY:</div>
                                <div class="expandable-details-value">${item.why}</div>
                            </div>
                            ` : ''}
                            ${item.steps ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">STEPS:</div>
                                <div class="expandable-details-value">
                                    <ol>
                                        ${item.steps.map(step => `<li>${step}</li>`).join('')}
                                    </ol>
                                </div>
                            </div>
                            ` : ''}
                            ${item.currentStatus ? `
                            <div class="expandable-details-row">
                                <div class="expandable-details-label">CURRENT STATUS:</div>
                                <div class="expandable-details-value" style="color: var(--info);">${item.currentStatus}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        }

        function renderWeekView(data) {
            const container = document.getElementById('week-days');
            if (!container) return;

            const calendarTasks = data.calendarTasks || {};
            const tasks = data.tasks || {};
            const workflow = data.workflow || {};
            const previousSelected = selectedDay ? new Date(selectedDay) : null;

            const pendingIds = workflow.pending || [];
            const highPriorityPending = pendingIds
                .map(id => tasks[id])
                .filter(t => t && t.priority === 'high');

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const dayOfWeek = today.getDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const baseMonday = new Date(today);
            baseMonday.setDate(today.getDate() + diffToMonday + (currentWeekOffset * 7));
            const weekStart = new Date(baseMonday);
            const weekEnd = new Date(baseMonday);
            weekEnd.setDate(weekEnd.getDate() + 6);

            const todayInCurrentWeek = today >= weekStart && today <= weekEnd;
            let newSelected = todayInCurrentWeek ? new Date(today) : new Date(weekStart);
            if (previousSelected && previousSelected >= weekStart && previousSelected <= weekEnd) {
                newSelected = previousSelected;
            }
            selectedDay = newSelected;

            const days = [];
            for (let i = 0; i < 7; i++) {
                const date = new Date(weekStart);
                date.setDate(weekStart.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];

                const taskIdsForDay = calendarTasks[dateStr] || [];
                const deadlineTasks = taskIdsForDay
                    .map(id => tasks[id])
                    .filter(t => t);

                const extraUrgentTasks = highPriorityPending.filter(task => !taskIdsForDay.includes(task.id));
                const urgentCount = deadlineTasks.filter(t => t && t.priority === 'high').length + extraUrgentTasks.length;
                const mediumCount = deadlineTasks.filter(t => t && t.priority === 'medium').length;

                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = date.getDate();
                const isToday = date.toDateString() === today.toDateString();
                const isSelected = selectedDay && selectedDay.toDateString() === date.toDateString();
                const hasDeadline = deadlineTasks.length > 0;

                const isPast = date < today;
                days.push({
                    date,
                    dateStr,
                    dayName,
                    dayNum,
                    deadlineCount: deadlineTasks.length,
                    urgentCount,
                    mediumCount,
                    isToday,
                    isSelected,
                    hasDeadline,
                    isPast
                });
            }

            container.innerHTML = days.map((day, idx) => {
                let badgeText = '';
                if (day.hasDeadline && day.isToday) {
                    badgeText = 'DEADLINE TODAY';
                } else if (day.hasDeadline) {
                    badgeText = `DUE ${day.dayName.toUpperCase()}`;
                } else if (day.urgentCount > 0) {
                    badgeText = `${day.urgentCount} URGENT`;
                }

                return `
                <div class="week-day ${day.isSelected ? 'active' : ''} ${day.isToday ? 'today' : ''}"
                     onclick="selectDay(${idx}, '${day.dateStr}')"
                     data-day-idx="${idx}"
                     style="${badgeText ? 'border: 1px solid var(--danger);' : ''}">
                    <div class="week-day-name">${day.dayName}</div>
                    <div class="week-day-number" style="${day.isPast && day.hasDeadline ? 'color: #ff4444; text-shadow: 0 0 8px rgba(255,68,68,0.5);' : day.isToday ? 'color: var(--warning); text-shadow: 0 0 12px rgba(201,169,98,0.7);' : 'color: white;'} ${day.hasDeadline || day.urgentCount > 0 ? 'font-weight: 700;' : ''}">${day.dayNum}</div>
                    <div class="week-day-stats">
                        ${day.urgentCount > 0 ? `<span class="week-day-count urgent">${day.urgentCount}</span>` : ''}
                        ${day.mediumCount > 0 ? `<span class="week-day-count warning">${day.mediumCount}</span>` : ''}
                        ${day.deadlineCount > 0 && day.urgentCount === 0 && day.mediumCount === 0 ? `<span class="week-day-count">${day.deadlineCount}</span>` : ''}
                    </div>
                    ${badgeText ? `<div style="position: absolute; bottom: 2px; font-size: 8px; color: var(--danger); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${badgeText}</div>` : ''}
                </div>
            `;
            }).join('');

            renderDayTasks(selectedDay.toISOString().split('T')[0]);
        }

        function selectDay(idx, dateStr) {
            selectedDay = new Date(dateStr);
            
            // Update visual selection
            document.querySelectorAll('.week-day').forEach((el, i) => {
                el.classList.toggle('active', i === idx);
            });

            // Render tasks for selected day
            renderDayTasks(dateStr);
        }

        function renderDayTasks(dateStr) {
            const container = document.getElementById('day-tasks');
            const data = appData;
            const calendarTasks = data.calendarTasks || {};
            const tasks = data.tasks || {};
            const workflow = data.workflow || {};

            const date = new Date(dateStr);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

            const taskIdsForDay = calendarTasks[dateStr] || [];
            const deadlineTasks = taskIdsForDay
                .map(id => tasks[id])
                .filter(t => t);

            const pendingIds = workflow.pending || [];
            const highPriorityPending = pendingIds
                .map(id => tasks[id])
                .filter(t => t && t.priority === 'high');

            const combinedTasks = [...deadlineTasks];
            const addedIds = new Set(deadlineTasks.map(t => t.id));

            highPriorityPending.forEach(task => {
                if (!addedIds.has(task.id)) {
                    combinedTasks.push({ ...task, __urgentOverlay: true });
                    addedIds.add(task.id);
                }
            });

            if (combinedTasks.length === 0) {
                container.innerHTML = `
                    <div class="day-tasks-header">${dayName}</div>
                    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                        No tasks scheduled for this day
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="day-tasks-header">${dayName}</div>
                <div class="day-tasks-list">
                    ${combinedTasks.map(task => {
                        const isUrgentOverlay = task.__urgentOverlay === true;
                        let deadlineLabel = 'TBD';
                        if (task.deadline) {
                            const due = new Date(task.deadline);
                            deadlineLabel = isNaN(due) ? 'Deadline TBC' : due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        } else if (isUrgentOverlay) {
                            deadlineLabel = 'URGENT';
                        }
                        const priorityClass = isUrgentOverlay ? 'high' : (task.priority || 'medium');
                        const priorityLabel = isUrgentOverlay ? 'URGENT' : (task.priority ? task.priority.toUpperCase() : 'NORMAL');
                        const projectLabel = task.project || 'General';
                        return `
                            <div class="day-task-item ${isUrgentOverlay ? 'urgent-task' : ''}">
                                <span class="day-task-time">${deadlineLabel}</span>
                                <div class="day-task-content">
                                    <div class="day-task-title">${task.title}</div>
                                    <div class="day-task-project">${projectLabel}${isUrgentOverlay ? ' • High priority pending' : ''}</div>
                                </div>
                                <span class="day-task-priority ${priorityClass}">${priorityLabel}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // changeWeek() is now defined above in the command center rebuild section
        // _legacyChangeWeek kept for reference only
        function _legacyChangeWeek(direction) {
            currentWeekOffset += direction;
            loadData();
        }

        function searchTasks(query) {
            if (!query || query.length < 2) {
                // Reset to default view
                renderNewHomepage(appData);
                return;
            }
            
            // Search across ALL tasks in data (tasks is now an object, not array)
            const allTasks = Object.values(appData.tasks || {});
            
            const lowerQuery = query.toLowerCase();
            const matches = allTasks.filter(t => 
                t.title?.toLowerCase().includes(lowerQuery) ||
                t.project?.toLowerCase().includes(lowerQuery) ||
                t.notes?.toLowerCase().includes(lowerQuery)
            );
            
            // Show search results in urgent queue column with highlight
            const container = document.getElementById('urgent-queue');
            const countBadge = document.getElementById('urgent-count');
            
            if (matches.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">No tasks found matching "' + query + '"</div>';
                countBadge.textContent = '0 found';
                return;
            }
            
            container.innerHTML = `
                <div style="padding: 10px; background: rgba(220,20,60,0.1); border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: var(--text-muted);">
                    🔍 Search: "${query}" - ${matches.length} results
                    <button onclick="resetSearch()" style="float: right; background: none; border: none; color: var(--crimson-bright); cursor: pointer;">Clear</button>
                </div>
                ${matches.slice(0, 10).map(task => `
                <div class="column-task-item" onclick="openTask('${task.id}')" style="cursor: pointer;">
                    <div class="column-task-title">${task.title}</div>
                    <div class="column-task-meta">
                        <span class="column-task-project">${task.project || 'General'}</span>
                        <span class="column-task-due" style="color: ${task.priority === 'high' ? '#ff6b6b' : 'var(--text-muted)'};">${task.priority?.toUpperCase()}</span>
                    </div>
                </div>
            `).join('')}`;
            
            countBadge.textContent = matches.length + ' found';
        }
        
        function resetSearch() {
            document.getElementById('task-search').value = '';
            renderNewHomepage(appData);
        }

        function checkAgent(agentId) {
            alert(`Checking ${agentId}...`);
        }

        function doTask(taskId) {
            alert(`Starting task ${taskId}...`);
        }

        function reviewItem(itemId) {
            alert(`Reviewing item ${itemId}...`);
        }

        let _modalTaskId = null;

        function openTask(taskId) {
            if (!window.appData || !window.appData.tasks) return;
            const t = window.appData.tasks[taskId];
            if (!t) { console.warn('Task not found:', taskId); return; }
            _modalTaskId = taskId;
            const detail = getTaskDetailModel(t, window.appData);
            const formatStamp = typeof formatAbsoluteTimestamp === 'function'
                ? formatAbsoluteTimestamp
                : (value) => value ? new Date(value).toLocaleString('en-SG', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

            document.getElementById('tmodal-id').textContent = t.id || taskId;
            document.getElementById('tmodal-title').textContent = t.title || '—';

            const statusEl = document.getElementById('tmodal-status');
            const statusMap = { done:'DONE', active:'ACTIVE', review:'REVIEW', blocked:'BLOCKED', paused:'PAUSED', pending:'PENDING', backlog:'BACKLOG' };
            statusEl.textContent = statusMap[t.status] || (t.status||'—').toUpperCase();
            statusEl.className = 'task-modal-status status-' + (t.status||'pending');

            const priorityEl = document.getElementById('tmodal-priority');
            priorityEl.textContent = (t.priority||'—').toUpperCase();
            priorityEl.className = 'task-modal-priority prio-' + (t.priority||'medium');

            const sgtNow = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Singapore'}));
            const today = new Date(sgtNow); today.setHours(0,0,0,0);
            if (t.deadline) {
                const dl = new Date(t.deadline); dl.setHours(0,0,0,0);
                const isOvD = dl < today && t.status !== 'done';
                const isTdy = dl.getTime() === today.getTime();
                const dlEl = document.getElementById('tmodal-deadline');
                dlEl.textContent = (isOvD ? '▲ OVERDUE — ' : isTdy ? 'TODAY — ' : '') +
                    dl.toLocaleDateString('en-SG', {weekday:'short', year:'numeric', month:'short', day:'numeric'});
                dlEl.className = 'task-modal-meta-value' + (isOvD ? ' text-overdue' : isTdy ? ' text-today' : '');
                document.getElementById('tmodal-deadline-row').style.display = 'flex';
            } else {
                document.getElementById('tmodal-deadline-row').style.display = 'none';
            }

            document.getElementById('tmodal-agent').textContent = formatAgentDisplay(t.agent || t.assignedTo || 'Unassigned');
            document.getElementById('tmodal-project').textContent = getTaskProjectLabel(t, window.appData);
            document.getElementById('tmodal-lane').textContent = detail.lane.label;
            document.getElementById('tmodal-created').textContent = formatStamp(t.createdAt);
            document.getElementById('tmodal-completed').textContent = t.completedAt ? formatStamp(t.completedAt) : '—';

            const blockRow = document.getElementById('tmodal-block-row');
            if (blockRow) {
                const reason = t.blockReason || t.pauseReason;
                if (reason || t.status === 'blocked' || t.status === 'paused') {
                    const label = t.status === 'paused' ? 'PAUSED BECAUSE' : 'BLOCKED BECAUSE';
                    const text  = reason || (t.status === 'paused' ? 'No pause reason logged yet.' : 'No unblock note logged yet.');
                    blockRow.querySelector('.task-modal-meta-label').textContent = label;
                    document.getElementById('tmodal-block-reason').textContent = text;
                    blockRow.style.display = 'flex';
                } else {
                    blockRow.style.display = 'none';
                }
            }

            const descSection = document.getElementById('tmodal-desc-section');
            document.getElementById('tmodal-desc').textContent = detail.about;
            descSection.style.display = 'block';

            const notesSection = document.getElementById('tmodal-notes-section');
            document.getElementById('tmodal-notes').textContent = detail.progress;
            notesSection.style.display = 'block';

            document.getElementById('task-modal-overlay').classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeTaskModal() {
            document.getElementById('task-modal-overlay').classList.remove('open');
            document.body.style.overflow = '';
            _modalTaskId = null;
        }

        function modalMarkDone() {
            if (!_modalTaskId) return;
            if (window.appData?.tasks?.[_modalTaskId]) {
                window.appData.tasks[_modalTaskId].status = 'done';
                window.appData.tasks[_modalTaskId].completedAt = new Date().toISOString();
            }
            showToast(_modalTaskId + ' marked done', 'done');
            closeTaskModal();
            if (window.appData) renderNewHomepage(window.appData);
        }

        function modalMarkActive() {
            if (!_modalTaskId) return;
            if (window.appData?.tasks?.[_modalTaskId]) window.appData.tasks[_modalTaskId].status = 'active';
            showToast(_modalTaskId + ' started', 'info');
            closeTaskModal();
            if (window.appData) renderNewHomepage(window.appData);
        }

        function modalMarkBlocked() {
            if (!_modalTaskId) return;
            if (window.appData?.tasks?.[_modalTaskId]) window.appData.tasks[_modalTaskId].status = 'blocked';
            showToast(_modalTaskId + ' blocked', 'warn');
            closeTaskModal();
            if (window.appData) renderNewHomepage(window.appData);
        }

        function modalAssign() {
            if (!_modalTaskId || !window.appData) return;
            const agents = Object.keys(window.appData.agents || {}).filter(a => a !== 'chad-yi');
            if (!agents.length) { showToast('No agents available', 'warn'); return; }
            const agent = prompt('Assign to agent:\n' + agents.map(a => a.toUpperCase()).join(', '), agents[0].toUpperCase());
            if (!agent) return;
            const agentKey = agent.toLowerCase();
            if (window.appData?.tasks?.[_modalTaskId]) window.appData.tasks[_modalTaskId].agent = agentKey;
            showToast(_modalTaskId + ' assigned to ' + agent.toUpperCase(), 'info');
            closeTaskModal();
            if (window.appData) renderNewHomepage(window.appData);
        }

        // Keyboard shortcuts
        (function initKeyboardShortcuts() {
            let focusIdx = -1;
            function getFocusCards() { return Array.from(document.querySelectorAll('#focus-top5 .focus-task-card')); }
            function highlightCard(idx) {
                getFocusCards().forEach((c, i) => {
                    c.style.outline = i === idx ? '1px solid rgba(99,102,241,0.6)' : '';
                    c.style.outlineOffset = i === idx ? '-1px' : '';
                });
            }
            document.addEventListener('keydown', e => {
                // Don't intercept when typing in inputs
                const tag = (e.target.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
                    if (e.key === 'Escape') { e.target.blur(); closeTaskModal(); }
                    return;
                }
                const cards = getFocusCards();
                switch (e.key) {
                    case 'Escape':
                        closeTaskModal();
                        focusIdx = -1;
                        highlightCard(-1);
                        break;
                    case 'j':
                    case 'ArrowDown':
                        if (cards.length) {
                            focusIdx = Math.min(focusIdx + 1, cards.length - 1);
                            highlightCard(focusIdx);
                            cards[focusIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                        e.preventDefault();
                        break;
                    case 'k':
                    case 'ArrowUp':
                        if (cards.length) {
                            focusIdx = Math.max(focusIdx - 1, 0);
                            highlightCard(focusIdx);
                            cards[focusIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                        e.preventDefault();
                        break;
                    case 'Enter':
                        if (focusIdx >= 0 && cards[focusIdx]) {
                            const tid = cards[focusIdx].dataset.taskId;
                            if (tid) openTask(tid);
                        }
                        break;
                    case 'd':
                        if (focusIdx >= 0 && cards[focusIdx]) {
                            const tid = cards[focusIdx].dataset.taskId;
                            if (tid) apiTaskAction(new Event('click'), tid, 'done');
                        }
                        break;
                    case 'n':
                        toggleInlineTaskForm();
                        e.preventDefault();
                        break;
                    case '?':
                        showToast('Keys: j/k navigate · Enter open · d done · n new · ? help', 'info', 5000);
                        break;
                }
            });
        })();

        // Toggle Agent Dropdown
        function toggleAgentDropdown() {
            const menu = document.getElementById('agent-dropdown-menu');
            if (menu.style.display === 'none' || menu.style.display === '') {
                menu.style.display = 'block';
                renderAgentDropdown();
            } else {
                menu.style.display = 'none';
            }
        }

        // Render Agent Dropdown Content
        function renderAgentDropdown() {
            const container = document.getElementById('agent-dropdown-content');
            if (!appData || !appData.agents) {
                container.innerHTML = '<div style="color: var(--text-muted); padding: 8px;">No agent data</div>';
                return;
            }
            
            // Convert agents object to array
            const agents = Object.entries(appData.agents).map(([id, data]) => ({
                id,
                name: data.name || id.charAt(0).toUpperCase() + id.slice(1).replace('_', ' '),
                ...data
            }));
            
            const activeAgents = agents.filter(a => a.status === 'active');
            document.getElementById('active-agent-count').textContent = activeAgents.length;
            
            if (activeAgents.length === 0) {
                container.innerHTML = '<div style="color: var(--text-muted); padding: 8px;">No active agents</div>';
                return;
            }
            
            container.innerHTML = activeAgents.map(agent => `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--crystal-border);">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></div>
                    <div style="flex: 1;">
                        <div style="font-size: 12px; font-weight: 600; color: white;">${agent.name}</div>
                        <div style="font-size: 10px; color: var(--text-muted);">${agent.currentTask || 'Idle'}</div>
                    </div>
                </div>
            `).join('');
        }

        // Initialize

        // ════════════════════════════════════════════════════════════════════
        // TOAST NOTIFICATION SYSTEM
        // ════════════════════════════════════════════════════════════════════
        function showToast(msg, type = 'info', duration = 4000) {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const icons = { done: '✓', alert: '▲', info: '●', warn: '◆' };
            const div = document.createElement('div');
            div.className = `toast toast-${type}`;
            div.innerHTML = `
                <span class="toast-icon">${icons[type] || '●'}</span>
                <span class="toast-text">${String(msg).slice(0, 80)}</span>
                <button class="toast-dismiss" onclick="this.closest('.toast').remove()">✕</button>
            `;
            container.appendChild(div);
            setTimeout(() => {
                div.style.animation = 'toast-out 0.25s ease forwards';
                setTimeout(() => div.remove(), 280);
            }, duration);
        }

        function pulseStatsBar() {
            const bar = document.getElementById('stats-bar');
            if (!bar) return;
            bar.classList.remove('refreshing');
            void bar.offsetWidth; // reflow
            bar.classList.add('refreshing');
            setTimeout(() => bar.classList.remove('refreshing'), 1000);
        }

        // Hook toast into WS task events
        const _origHandleWsMsg = window.__rsWsMsgHook || null;
        function handleRealtimeEvent(payload) {
            const type = payload?.type;
            const agent = payload?.agent || payload?.source || 'SYSTEM';
            const task = payload?.task || payload?.taskId || '';
            const msg = payload?.message || payload?.event || '';

            if (type === 'task_done' || type === 'complete' || type === 'task_completed') {
                showToast(`${agent}: ${task || msg || 'task completed'}`, 'done');
                pulseStatsBar();
            } else if (type === 'task_updated' || type === 'data_updated') {
                showToast('Dashboard updated', 'info', 2000);
                pulseStatsBar();
            } else if (type === 'agent_status_changed') {
                showToast(`Agent ${agent}: ${msg || 'status changed'}`, 'info');
            } else if (type === 'alert' || type === 'error') {
                showToast(msg || `Alert from ${agent}`, 'alert');
            } else if (type === 'blocked') {
                showToast(`BLOCKED: ${task || msg}`, 'warn');
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            // Initialize expanded state tracking
            window.expandedState = {};
            setActiveSectionLink('home');
            loadData();
            loadHeliosSyncBootstrap();
            connectHeliosDashboardSocket();
            // Smart polling (30s) is handled by the IIFE below — no separate interval needed
        });

        function showSection(name) {
            const el = document.getElementById(name + '-section');
            if (el) {
                setActiveSectionLink(name);
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            closeMobileMenu();
        }

        // Toggle expand/collapse for dashboard items
        function toggleExpand(key) {
            // Prevent event bubbling
            event.stopPropagation();
            
            // Toggle state
            window.expandedState[key] = !window.expandedState[key];
            
            // Find the content element
            const content = document.getElementById(key + '-content');
            const item = content ? content.closest('.expandable-item') : null;
            
            if (content && item) {
                if (window.expandedState[key]) {
                    content.classList.add('expanded');
                    item.classList.add('expanded');
                } else {
                    content.classList.remove('expanded');
                    item.classList.remove('expanded');
                }
            }
        }

        // ===== SMART POLLING FOR REAL-TIME UPDATES =====
        (function() {
            const POLL_INTERVAL = 30000; // 30 seconds
            let lastKnownUpdate = null;
            let pollingActive = true;
            let pollTimer = null;

            // Create subtle updating indicator
            function createUpdatingIndicator() {
                const indicator = document.createElement('div');
                indicator.id = 'updating-indicator';
                indicator.innerHTML = `
                    <span class="update-dot"></span>
                    <span class="update-text">checking...</span>
                `;
                indicator.style.cssText = `
                    position: fixed;
                    bottom: 16px;
                    right: 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 14px;
                    background: rgba(10, 10, 15, 0.9);
                    border: 1px solid rgba(220, 20, 60, 0.3);
                    border-radius: 20px;
                    font-size: 11px;
                    color: var(--text-muted);
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    opacity: 0;
                    transform: translateY(10px);
                    transition: all 0.3s ease;
                    z-index: 1000;
                    backdrop-filter: blur(10px);
                `;

                // Add styles for the dot animation
                const style = document.createElement('style');
                style.textContent = `
                    .update-dot {
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        background: var(--crimson-bright);
                        animation: updatePulse 1s ease-in-out infinite;
                    }
                    @keyframes updatePulse {
                        0%, 100% { opacity: 0.4; transform: scale(1); }
                        50% { opacity: 1; transform: scale(1.2); }
                    }
                    #updating-indicator.visible {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    #updating-indicator.updated {
                        border-color: var(--success);
                        color: var(--success);
                    }
                    #updating-indicator.updated .update-dot {
                        background: var(--success);
                        animation: none;
                    }
                `;
                document.head.appendChild(style);
                document.body.appendChild(indicator);
                return indicator;
            }

            const indicator = createUpdatingIndicator();

            // Show updating indicator
            function showUpdating() {
                indicator.classList.add('visible');
                indicator.classList.remove('updated');
                indicator.querySelector('.update-text').textContent = 'checking...';
            }

            // Show updated indicator briefly
            function showUpdated() {
                indicator.classList.add('visible', 'updated');
                indicator.querySelector('.update-text').textContent = 'updated';
                setTimeout(() => {
                    indicator.classList.remove('visible');
                }, 2000);
            }

            // Generate simple hash of data for comparison
            function generateDataHash(data) {
                // Use lastUpdated timestamp as primary comparison
                if (data && data.lastUpdated) {
                    return data.lastUpdated;
                }
                // Fallback: hash of JSON string (simplified)
                return JSON.stringify(data).length.toString();
            }

            // Fetch only headers to check if data changed (using cache-busting)
            async function checkForUpdates() {
                if (!pollingActive) return;

                try {
                    showUpdating();

                    // Fetch with cache-busting to get fresh data
                    const cacheBuster = `?t=${Date.now()}`;
                    const response = await fetch('data.json' + cacheBuster, {
                        method: 'GET',
                        cache: 'no-store'
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const newData = await response.json();
                    const newHash = generateDataHash(newData);

                    // Compare with last known update
                    if (lastKnownUpdate === null) {
                        // First poll, just store the hash
                        lastKnownUpdate = newHash;
                    } else if (newHash !== lastKnownUpdate) {
                        // Data has changed!
                        console.log('[Smart Poll] Data changed, updating dashboard...', {
                            old: lastKnownUpdate,
                            new: newHash
                        });

                        // Update stored hash
                        lastKnownUpdate = newHash;

                        // Update global app data
                        appData = normalizeDashboardData(newData);
                        window.appData = appData;

                        // Rebuild project data
                        allProjects = buildProjectsFromData(appData);

                        syncProjectLookup();

                        // Re-render all sections
                        renderHomeSection();
                        renderCategoriesSection();
                        renderResourcesSection();

                        showUpdated();
                    } else {
                        // No change
                        console.log('[Smart Poll] No changes detected');
                        indicator.classList.remove('visible');
                    }

                } catch (error) {
                    console.error('[Smart Poll] Error checking for updates:', error);
                    indicator.classList.remove('visible');
                }
            }

            // Start polling after initial load
            function startPolling() {
                if (pollTimer) clearInterval(pollTimer);

                // Set initial hash from loaded data
                if (appData) {
                    lastKnownUpdate = generateDataHash(appData);
                }

                // Poll every 30 seconds
                pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
                console.log('[Smart Poll] Started polling every', POLL_INTERVAL, 'ms');
            }

            // Stop polling (for cleanup)
            function stopPolling() {
                pollingActive = false;
                if (pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
            }

            // Start polling after a short delay to ensure initial load is complete
            setTimeout(startPolling, 5000);

            // Expose controls for debugging
            window.smartPoll = {
                start: startPolling,
                stop: stopPolling,
                checkNow: checkForUpdates,
                getStatus: () => ({
                    active: pollingActive,
                    interval: POLL_INTERVAL,
                    lastKnownUpdate: lastKnownUpdate
                })
            };
        })();
