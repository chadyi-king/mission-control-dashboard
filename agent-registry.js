/**
 * agent-registry.js — Loads agent-registry.json and provides all agent
 * lookup helpers.  Every sidebar / ticker / stats / health function reads
 * from this instead of hardcoded objects.
 *
 * Exposes on window:
 *   AgentRegistry          – the loaded JSON (or null until ready)
 *   getAgentConfig(id)     – returns { displayName, initials, colors, ... }
 *   getFleetIds()          – ordered array of fleet agent IDs
 *   getHealthPriority()    – ordered array for system-health sorting
 *   isAgentExcluded(id)    – true if the agent is hidden from UI
 *   formatAgentDisplay(id) – display name from registry
 *   normalizeAgentId(raw)  – lowercase, dash-separated
 *   getAgentSignalMeta(id, data) – online/offline/blocked signal object
 */
(function (global) {
    'use strict';

    /* ── Registry state ─────────────────────────────────────────────── */
    let _registry = null;
    let _fleetIds = [];
    let _healthPriority = [];
    let _configCache = {};

    /* ── Defaults (used before JSON loads or for unknown agents) ───── */
    const _defaultColors = {
        bg:     'rgba(100,100,100,0.18)',
        border: 'rgba(100,100,100,0.3)',
        text:   '#888'
    };

    /* ── Mission Control task contract ──────────────────────────────── */
    const DASHBOARD_TASK_CONTRACT_VERSION = '20260622-source-of-truth-v1';
    const DASHBOARD_CACHE_KEY = 'rs_dashboard_cache';
    const DASHBOARD_BUILD_KEY = 'rs_dashboard_build_id';

    global.DASHBOARD_BUILD_ID = DASHBOARD_TASK_CONTRACT_VERSION;
    global.DASHBOARD_TASK_CONTRACT = {
        version: DASHBOARD_TASK_CONTRACT_VERSION,
        sourceOfTruth: 'Hermes canonical task state via Telegram/Hermes',
        dashboardRole: 'read-only generated snapshot viewer',
        generatedSnapshot: 'data.json',
        canonicalStatuses: ['open', 'active', 'review', 'input_requested', 'blocked', 'paused', 'done'],
        normalizedAliases: {
            backlog: 'open',
            pending: 'open',
            todo: 'open',
            in_progress: 'active',
            needs_review: 'review',
            needs_input: 'input_requested'
        },
        dashboardWrites: 'disabled'
    };

    function _clearStaleDashboardCache() {
        try {
            var previous = localStorage.getItem(DASHBOARD_BUILD_KEY);
            if (previous !== DASHBOARD_TASK_CONTRACT_VERSION) {
                localStorage.removeItem(DASHBOARD_CACHE_KEY);
                localStorage.removeItem('rs_done_tasks');
                localStorage.setItem(DASHBOARD_BUILD_KEY, DASHBOARD_TASK_CONTRACT_VERSION);
            }
        } catch (e) {}
    }

    function normalizeTaskStatus(status) {
        var raw = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (!raw) return 'open';
        if (raw === 'done' || raw === 'complete' || raw === 'completed') return 'done';
        if (raw === 'active' || raw === 'agent_on_it' || raw === 'working' || raw === 'in_progress') return 'active';
        if (raw === 'review' || raw === 'needs_review' || raw === 'check_this' || raw === 'awaiting_review') return 'review';
        if (raw === 'input_requested' || raw === 'needs_input' || raw === 'waiting_on_you' || raw === 'waiting_for_caleb') return 'input_requested';
        if (raw === 'blocked' || raw === 'stuck') return 'blocked';
        if (raw === 'paused' || raw === 'pause' || raw === 'on_hold') return 'paused';
        if (raw === 'removed' || raw === 'deleted') return 'removed';
        return 'open';
    }

    function _projectIdFromTask(task, fallbackId) {
        var raw = '';
        if (task && task.project) raw = String(task.project);
        if (!raw && task && task.id) raw = String(task.id);
        if (!raw && fallbackId) raw = String(fallbackId);
        var match = raw.trim().match(/^([A-Z]+\d+)/i);
        return match ? match[1].toUpperCase() : '';
    }

    function _visibleTasks(data) {
        return Object.values(data && data.tasks ? data.tasks : {}).filter(function (task) {
            return task && normalizeTaskStatus(task.status) !== 'removed';
        });
    }

    function _priority(task) {
        var raw = String((task && task.priority) || '').toLowerCase();
        if (raw === 'critical' || raw === 'urgent' || raw === 'high') return 'high';
        if (raw === 'medium') return 'medium';
        if (raw === 'done') return 'done';
        return 'low';
    }

    function _normalizeDashboardTaskData(data) {
        if (!data || typeof data !== 'object') return data;
        data.tasks = data.tasks || {};
        data.workflow = data.workflow || {};
        data.needsAttention = Array.isArray(data.needsAttention) ? data.needsAttention : [];
        data.inputsNeeded = Array.isArray(data.inputsNeeded) ? data.inputsNeeded : Object.values(data.inputsNeeded || {});

        Object.keys(data.tasks).forEach(function (taskId) {
            var task = data.tasks[taskId];
            if (!task || typeof task !== 'object') return;
            task.id = task.id || taskId;
            var sourceStatus = String(task.status || 'open');
            var canonicalStatus = normalizeTaskStatus(sourceStatus);
            if (canonicalStatus === 'removed') {
                delete data.tasks[taskId];
                return;
            }
            if (canonicalStatus !== sourceStatus.toLowerCase()) task.sourceStatus = task.sourceStatus || sourceStatus;
            task.status = canonicalStatus;
            task.project = _projectIdFromTask(task, taskId) || task.project || '';
            task.category = task.category || (task.project ? task.project.charAt(0) : '');
            if (task.status !== 'done') task.priority = _priority(task);
        });

        var tasks = _visibleTasks(data);
        var byStatus = { open: [], active: [], review: [], input_requested: [], blocked: [], paused: [], done: [], urgent: [] };
        tasks.forEach(function (task) {
            var status = normalizeTaskStatus(task.status);
            if (!byStatus[status]) byStatus[status] = [];
            byStatus[status].push(task.id);
            if (status !== 'done' && _priority(task) === 'high') byStatus.urgent.push(task.id);
        });

        var inputIds = new Set(data.inputsNeeded.map(function (item) { return item && (item.taskId || item.id); }).filter(Boolean));
        var seenAttention = new Set();
        data.needsAttention = data.needsAttention.filter(function (item) {
            var id = item && (item.id || item.taskId);
            if (!id || !data.tasks[id] || data.tasks[id].status === 'done' || seenAttention.has(id)) return false;
            seenAttention.add(id);
            return true;
        });

        data.workflow = Object.assign({}, data.workflow, {
            open: byStatus.open.slice(),
            pending: [],
            backlog: [],
            todo: byStatus.open.slice(),
            active: byStatus.active.slice(),
            review: byStatus.review.slice(),
            input_requested: byStatus.input_requested.slice(),
            blocked: byStatus.blocked.slice(),
            paused: byStatus.paused.slice(),
            urgent: byStatus.urgent.slice(),
            done: byStatus.done.slice(),
            'waiting on you': Array.from(inputIds).filter(function (id) { return data.tasks[id] && data.tasks[id].status !== 'done'; }),
            'check this': byStatus.review.slice(),
            'agent on it': byStatus.active.slice(),
            'has deadline': tasks.filter(function (task) { return task.status !== 'done' && task.deadline; }).map(function (task) { return task.id; })
        });

        var total = tasks.length;
        var done = byStatus.done.length;
        data.stats = Object.assign({}, data.stats || {}, {
            totalTasks: total,
            tasksLeft: total - done,
            completedTasks: done,
            active: byStatus.active.length,
            blocked: byStatus.blocked.length,
            paused: byStatus.paused.length,
            review: byStatus.review.length,
            inputRequested: byStatus.input_requested.length + data.workflow['waiting on you'].length,
            urgent: byStatus.urgent.length,
            open: byStatus.open.length,
            pending: 0,
            backlog: 0,
            completionRate: Math.round((done / Math.max(1, total)) * 100),
            needsAttention: data.needsAttention.length
        });
        data.taskSummary = Object.assign({}, data.taskSummary || {}, {
            urgent: data.stats.urgent,
            active: data.stats.active,
            blocked: data.stats.blocked,
            paused: data.stats.paused,
            open: data.stats.open,
            backlog: 0,
            done: done
        });
        data.dashboardTaskContract = global.DASHBOARD_TASK_CONTRACT;
        return data;
    }

    function _isUserOwnedTask(task) {
        var raw = task && (task.agent || task.assignedTo || task.owner || '');
        var id = normalizeAgentId(raw);
        return !id || id === 'chad-yi' || id === 'chad' || id === 'caleb' || id === 'caleb-yi';
    }

    function _inputTaskIdSet(data) {
        var inputs = Array.isArray(data && data.inputsNeeded) ? data.inputsNeeded : Object.values(data && data.inputsNeeded || {});
        return new Set(inputs.map(function (item) { return item && (item.taskId || item.id); }).filter(Boolean));
    }

    function _attentionFromOthersSet(data) {
        var attention = Array.isArray(data && data.needsAttention) ? data.needsAttention : [];
        return new Set(attention.filter(function (item) {
            var owner = item && (item.owner || item.requiredBy || item.agent || '');
            return !owner || !isUserAgent(owner);
        }).map(function (item) { return item && (item.id || item.taskId); }).filter(Boolean));
    }

    function _fallbackSortTasks(tasks) {
        var rank = { high: 0, medium: 1, low: 2, done: 3 };
        return (tasks || []).slice().sort(function (a, b) { return (rank[_priority(a)] || 9) - (rank[_priority(b)] || 9); });
    }

    function _installTaskContract() {
        if (global.__missionControlEarlyTaskContractInstalled) return;
        if (typeof global.normalizeDashboardData !== 'function') return;
        global.__missionControlEarlyTaskContractInstalled = true;

        var originalNormalize = global.normalizeDashboardData;
        var wrappedNormalize = function normalizeDashboardDataWithCanonicalTasks(rawData) {
            return _normalizeDashboardTaskData(originalNormalize(rawData));
        };
        wrappedNormalize.__taskContractNormalized = true;
        global.normalizeDashboardData = wrappedNormalize;
        try { global.eval('normalizeDashboardData = window.normalizeDashboardData'); } catch (e) {}

        var laneResolver = function getTaskPrimaryLaneCanonical(task, data) {
            if (!task) return { key: 'open-work', label: 'Open Work' };
            var status = normalizeTaskStatus(task.status);
            var inputIds = _inputTaskIdSet(data || global.appData || {});
            var attentionFromOthers = _attentionFromOthersSet(data || global.appData || {});
            if (status === 'done') return { key: 'completed', label: 'Completed' };
            if (status === 'review') return { key: 'needs-review', label: 'Needs My Review' };
            if (status === 'input_requested' || inputIds.has(task.id) || attentionFromOthers.has(task.id)) return { key: 'needs-input', label: 'Needs My Input' };
            if ((status === 'active' || status === 'blocked') && _isUserOwnedTask(task)) return { key: 'needs-me', label: status === 'blocked' ? 'Needs Me To Unblock' : 'Needs Me' };
            if (status === 'active') return { key: 'active-work', label: 'Active Work' };
            return { key: 'open-work', label: status === 'paused' ? 'Paused Work' : 'Open Work' };
        };
        global.getTaskPrimaryLane = laneResolver;
        try { global.eval('getTaskPrimaryLane = window.getTaskPrimaryLane'); } catch (e) {}

        global.calculateTaskStats = function calculateTaskStatsCanonical(tasks) {
            var visible = (tasks || []).filter(function (task) { return task && normalizeTaskStatus(task.status) !== 'removed'; });
            var openTasks = visible.filter(function (task) { return task.status !== 'done'; });
            return {
                total: visible.length,
                pending: 0,
                open: visible.filter(function (task) { return task.status === 'open'; }).length,
                active: visible.filter(function (task) { return task.status === 'active'; }).length,
                blocked: visible.filter(function (task) { return task.status === 'blocked'; }).length,
                paused: visible.filter(function (task) { return task.status === 'paused'; }).length,
                review: visible.filter(function (task) { return task.status === 'review'; }).length,
                done: visible.filter(function (task) { return task.status === 'done'; }).length,
                left: openTasks.length,
                highPriority: openTasks.filter(function (task) { return _priority(task) === 'high'; }).length,
                mediumPriority: openTasks.filter(function (task) { return _priority(task) === 'medium'; }).length,
                lowPriority: openTasks.filter(function (task) { return _priority(task) === 'low'; }).length,
                urgent: openTasks.filter(function (task) { return _priority(task) === 'high'; }).length
            };
        };
        try { global.eval('calculateTaskStats = window.calculateTaskStats'); } catch (e) {}

        global.deriveProjectStatus = function deriveProjectStatusCanonical(projTasks) {
            var tasks = projTasks || [];
            if (!tasks.length) return 'open';
            if (tasks.some(function (task) { return task.status === 'blocked'; })) return 'blocked';
            if (tasks.some(function (task) { return task.status === 'active'; })) return 'active';
            if (tasks.some(function (task) { return task.status === 'review' || task.status === 'input_requested'; })) return 'review';
            if (tasks.every(function (task) { return task.status === 'done'; })) return 'done';
            if (tasks.some(function (task) { return task.status === 'paused'; })) return 'paused';
            return 'open';
        };
        try { global.eval('deriveProjectStatus = window.deriveProjectStatus'); } catch (e) {}

        global.getDashboardLens = function getDashboardLensCanonical(data) {
            var tasks = _visibleTasks(data || {});
            var today = typeof global.sgtToday === 'function' ? global.sgtToday() : new Date();
            today.setHours(0, 0, 0, 0);
            var weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - 6);
            var groups = { needsMe: [], needsReview: [], needsInput: [], activeWork: [], otherOpen: [], completed: [] };
            tasks.forEach(function (task) {
                var lane = laneResolver(task, data).key;
                if (lane === 'completed') groups.completed.push(task);
                else if (lane === 'needs-review') groups.needsReview.push(task);
                else if (lane === 'needs-input') groups.needsInput.push(task);
                else if (lane === 'needs-me') groups.needsMe.push(task);
                else if (lane === 'active-work') groups.activeWork.push(task);
                else groups.otherOpen.push(task);
            });
            Object.keys(groups).forEach(function (key) {
                groups[key] = key === 'completed'
                    ? groups[key].slice().sort(function (a, b) { return new Date(b.completedAt || 0) - new Date(a.completedAt || 0); })
                    : _fallbackSortTasks(groups[key]);
            });
            var completedToday = tasks.filter(function (task) {
                if (task.status !== 'done' || !task.completedAt) return false;
                var date = new Date(task.completedAt); date.setHours(0, 0, 0, 0);
                return date.getTime() === today.getTime();
            });
            var completedWeek = tasks.filter(function (task) { return task.status === 'done' && task.completedAt && new Date(task.completedAt) >= weekStart; });
            var overdueTasks = tasks.filter(function (task) {
                if (task.status === 'done' || !task.deadline) return false;
                var date = new Date(task.deadline); date.setHours(0, 0, 0, 0);
                return date < today;
            });
            var needsAttentionIds = new Set((Array.isArray(data && data.needsAttention) ? data.needsAttention : []).map(function (item) { return item && (item.id || item.taskId); }).filter(Boolean));
            var attentionTasks = _fallbackSortTasks([].concat(
                tasks.filter(function (task) { return task.status === 'blocked'; }),
                overdueTasks,
                tasks.filter(function (task) { return needsAttentionIds.has(task.id); })
            ));
            var seen = new Set();
            attentionTasks = attentionTasks.filter(function (task) { if (!task || seen.has(task.id)) return false; seen.add(task.id); return true; });
            var aggregate = [].concat(groups.needsMe, groups.needsReview, groups.needsInput);
            var aggregateIds = new Set(aggregate.map(function (task) { return task.id; }));
            var attentionIds = new Set(attentionTasks.map(function (task) { return task.id; }));
            var nextUpTasks = _fallbackSortTasks(tasks.filter(function (task) { return task.status !== 'done' && task.status !== 'paused' && !aggregateIds.has(task.id) && !attentionIds.has(task.id); }));
            return {
                today: today,
                tasks: tasks,
                completedToday: completedToday,
                completedWeek: completedWeek,
                attentionTasks: attentionTasks,
                needsMeTasks: groups.needsMe,
                needsMeAggregate: aggregate,
                reviewTasks: groups.needsReview,
                myInputTasks: groups.needsInput,
                activeWorkTasks: groups.activeWork,
                nextUpTasks: nextUpTasks,
                openTasks: groups.otherOpen
            };
        };
        try { global.eval('getDashboardLens = window.getDashboardLens'); } catch (e) {}

        if (typeof global.showToast !== 'function') {
            global.showToast = function (message) { console.warn('[Dashboard Write Policy]', message); };
        }
        function writeDisabled(action) {
            var msg = 'Dashboard task writes are disabled. Use Telegram/Hermes as the task source of truth.' + (action ? ' Blocked: ' + action + '.' : '');
            console.warn('[Dashboard Write Policy]', msg);
            try { global.showToast(msg, 'warn', 6500); } catch (e) {}
            return false;
        }
        global.DASHBOARD_WRITE_POLICY = { version: DASHBOARD_TASK_CONTRACT_VERSION, dashboardWrites: 'disabled' };
        ['commitTaskDoneToGitHub', 'submitInlineTask', 'toggleInlineTaskForm', 'assignFocusTask', 'assignModalTask', 'modalMarkDone', 'modalMarkActive', 'modalMarkBlocked', 'openSettingsModal', 'saveSettingsPAT'].forEach(function (name) {
            global[name] = function () { return writeDisabled(name); };
            try { global.eval(name + ' = window.' + name); } catch (e) {}
        });
        global.apiTaskAction = function (event, taskId, action) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            return writeDisabled((action || 'task action') + (taskId ? ' for ' + taskId : ''));
        };
        try { global.eval('apiTaskAction = window.apiTaskAction'); } catch (e) {}

        var style = document.getElementById('dashboard-readonly-task-contract-style') || document.createElement('style');
        style.id = 'dashboard-readonly-task-contract-style';
        style.textContent = [
            '.focus-quick-actions,.focus-add-btn,.inline-task-form{display:none!important}',
            '.focus-readonly-chip{font-size:9px;letter-spacing:.08em;color:rgba(160,170,190,.72);border:1px solid rgba(160,170,190,.18);padding:2px 6px;border-radius:4px}',
            '.dashboard-readonly-note{margin-left:8px;font-size:9px;letter-spacing:.08em;color:rgba(160,170,190,.72);font-weight:600}',
            '.task-modal-readonly strong::after{content:" · Telegram/Hermes owns task truth"}'
        ].join('\n');
        if (!style.parentNode) document.head.appendChild(style);

        var settings = document.getElementById('settings-modal');
        if (settings && settings.parentNode) settings.parentNode.removeChild(settings);
        var pendingOption = document.querySelector('#filter-status option[value="pending"]');
        if (pendingOption) { pendingOption.value = 'open'; pendingOption.textContent = 'Open'; }
        var pendingStatLabel = document.querySelector('#cat-tasks-pending + .dashboard-stat-label');
        if (pendingStatLabel) pendingStatLabel.textContent = 'Open';
        var focusLabel = document.querySelector('.focus-top5-label');
        if (focusLabel && !focusLabel.querySelector('.dashboard-readonly-note')) {
            var note = document.createElement('span');
            note.className = 'dashboard-readonly-note';
            note.textContent = 'LOCAL REORDER ONLY';
            focusLabel.appendChild(note);
        }
    }

    _clearStaleDashboardCache();
    document.addEventListener('DOMContentLoaded', _installTaskContract);
    global.setTimeout(_installTaskContract, 0);
    global.setTimeout(_installTaskContract, 1000);

    /* ── Load registry JSON ─────────────────────────────────────────── */
    function _loadRegistry() {
        // Synchronous fetch (blocking) during page load so every
        // downstream function has the data immediately.  The file is
        // tiny (<2 KB) and served from the same origin.
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'agent-registry.json?v=' + Date.now(), false);   // sync
            xhr.send(null);
            if (xhr.status === 200) {
                _registry = JSON.parse(xhr.responseText);
            } else {
                console.warn('[AgentRegistry] Failed to load agent-registry.json (' + xhr.status + '), using built-in defaults.');
                _registry = _builtinDefaults();
            }
        } catch (e) {
            console.warn('[AgentRegistry] XHR error, using built-in defaults:', e);
            _registry = _builtinDefaults();
        }

        // Build derived caches
        var agents = _registry.agents || {};
        _fleetIds = Object.keys(agents)
            .filter(function (id) { return agents[id].fleet !== false && !agents[id].excluded; })
            .sort(function (a, b) { return (agents[a].priority || 99) - (agents[b].priority || 99); });

        _healthPriority = _registry.healthPriority || ['chad-yi', 'cerebronn', 'helios'];

        _configCache = {};
        for (var id in agents) {
            if (agents.hasOwnProperty(id)) {
                _configCache[id] = agents[id];
            }
        }

        global.AgentRegistry = _registry;
    }

    /* ── Built-in fallback (mirrors registry.json) ──────────────────── */
    function _builtinDefaults() {
        return {
            agents: {
                'chad-yi':   { displayName:'Chad Yi',    initials:'CY', colors:{ bg:'rgba(255,140,0,0.18)',  border:'rgba(255,140,0,0.4)',   text:'#ff8c00' }, priority:1, fleet:true,  excluded:false, requirements:'Needs Hermes Gateway + Telegram to count as truly active; dashboard can verify local presence and recent Hermes signal.' },
                'cerebronn': { displayName:'Cerebronn',  initials:'CB', colors:{ bg:'rgba(100,100,230,0.18)',border:'rgba(100,100,230,0.35)',text:'#9090ee' }, priority:2, fleet:true,  excluded:false, type:'planned', requirements:'Planned brain and decision layer. No live runtime required until built.' },
                'helios':    { displayName:'Helios',     initials:'HE', colors:{ bg:'rgba(220,38,38,0.18)',  border:'rgba(220,38,38,0.4)',   text:'#e04040' }, priority:3, fleet:true,  excluded:false, requirements:'Needs audit/update/reporting activity to count as active; dashboard checks latest sync.' },
                'quanta':    { displayName:'Quanta',     initials:'QT', colors:{ bg:'rgba(64,145,108,0.18)', border:'rgba(64,145,108,0.35)', text:'#77d8a8' }, priority:4, fleet:true,  excluded:false, requirements:'Needs Telegram-monitoring signal to count as active; dashboard only sees recent heartbeat.' },
                'forger':    { displayName:'Forger',     initials:'FG', colors:{ bg:'rgba(160,60,180,0.18)', border:'rgba(160,60,180,0.35)', text:'#c070d0' }, priority:5, fleet:true,  excluded:false, type:'planned' },
                'escrita':   { displayName:'Escrita',    initials:'ES', colors:{ bg:'rgba(180,120,60,0.18)', border:'rgba(180,120,60,0.35)', text:'#d4a040' }, priority:6, fleet:true,  excluded:false, type:'planned', requirements:'She-agent for writing and RE:UNITE content. Canonical ID replaces legacy escritor.' },
                'autoura':   { displayName:'Autoura',    initials:'AU', colors:{ bg:'rgba(200,80,80,0.18)',  border:'rgba(200,80,80,0.35)',  text:'#e06060' }, priority:7, fleet:true,  excluded:false, type:'planned', requirements:'She-agent for content, scouting, and client acquisition. Canonical ID replaces legacy autour.' },
                'mensamusa': { displayName:'Mensamusa',  initials:'MM', colors:{ bg:'rgba(120,120,120,0.18)',border:'rgba(120,120,120,0.35)',text:'#aaa'    }, priority:8, fleet:true,  excluded:false, type:'planned' },
                'clair':     { displayName:'Clair',      initials:'CL', colors:{ bg:'rgba(80,150,200,0.12)', border:'rgba(80,150,200,0.25)', text:'#6a9cc0' }, priority:9, fleet:true,  excluded:false, type:'planned' },
                'eplusplus': { displayName:'E++',        initials:'E+', colors:{ bg:'rgba(100,100,100,0.12)',border:'rgba(100,100,100,0.25)',text:'#888'    }, priority:10,fleet:true,  excluded:false, type:'planned' },
                'kotler':    { displayName:'Kotler',     initials:'KT', colors:{ bg:'rgba(180,100,160,0.12)',border:'rgba(180,100,160,0.25)',text:'#b070a0' }, priority:11,fleet:true,  excluded:false, type:'external', requirements:'External Google Ads Manager project mapped to Hermes.' },
                'ledger':    { displayName:'Ledger',     initials:'LG', colors:{ bg:'rgba(140,140,80,0.12)', border:'rgba(140,140,80,0.25)', text:'#a0a060' }, priority:12,fleet:true,  excluded:false, type:'planned' },
                'atlas':     { displayName:'Atlas',      initials:'AT', colors:{ bg:'rgba(80,120,80,0.12)',  border:'rgba(80,120,80,0.25)',  text:'#609060' }, priority:13,fleet:true,  excluded:false, type:'planned' },
                'pulsar':    { displayName:'Pulsar',     initials:'PS', colors:{ bg:'rgba(80,80,140,0.12)',  border:'rgba(80,80,140,0.25)',  text:'#6060a0' }, priority:14,fleet:true,  excluded:false, type:'planned' },
                'abed':      { displayName:'Abed',       initials:'AB', colors:{ bg:'rgba(160,120,80,0.12)', border:'rgba(160,120,80,0.25)', text:'#a08060' }, priority:15,fleet:true,  excluded:false, type:'planned' }
            },
            healthPriority: ['chad-yi', 'cerebronn', 'helios', 'quanta', 'forger', 'escrita', 'autoura', 'mensamusa', 'clair', 'eplusplus', 'kotler', 'ledger', 'atlas', 'pulsar', 'abed']
        };
    }

    /* ── Public API ─────────────────────────────────────────────────── */

    function normalizeAgentId(agent) {
        var id = String(agent || '').trim().toLowerCase().replace(/_/g, '-');
        if (id === 'escritor') return 'escrita';
        if (id === 'autour') return 'autoura';
        if (id === 'tele') return 'chad-yi';
        return id;
    }

    function getAgentConfig(agent) {
        var id = normalizeAgentId(agent);
        if (_configCache[id]) return _configCache[id];
        // Unknown agent — build a sensible default
        return {
            displayName: id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Unknown',
            initials: id ? id.slice(0, 2).toUpperCase() : '??',
            colors: _defaultColors,
            priority: 99,
            fleet: false,
            excluded: false
        };
    }

    function formatAgentDisplay(agent) {
        return getAgentConfig(agent).displayName;
    }

    function getFleetIds() {
        return _fleetIds.slice(); // defensive copy
    }

    function getHealthPriority() {
        return _healthPriority.slice();
    }

    function isAgentExcluded(agent) {
        var id = normalizeAgentId(agent);
        var cfg = _configCache[id];
        return cfg ? !!cfg.excluded : false;
    }

    function isUserAgent(agent) {
        var id = normalizeAgentId(agent);
        return !id || id === 'chad-yi' || id === 'caleb';
    }

    /**
     * getAgentSignalMeta — determines online/offline/blocked status for
     * an agent, using the registry's requirements text.
     */
    function getAgentSignalMeta(agentId, data) {
        data = data || global.appData;
        var agents = (data && data.agents) ? data.agents : {};
        var agent = agents[agentId] || {};
        var lastActive = agent.lastActive ? new Date(agent.lastActive).getTime() : 0;
        var isRecent = lastActive && (Date.now() - lastActive) <= (30 * 60 * 1000);
        var lastSeen = agent.lastActive ? formatRelativeTimestamp(agent.lastActive) : 'No signal yet';
        var cfg = getAgentConfig(agentId);
        var req = cfg.requirements || '';
        var status = String(agent.status || '').toLowerCase();

        if (status === 'external' || cfg.type === 'external') {
            return { tone:'offline', dotClass:'offline', label:'external', detail: req || agent.currentTask || 'Mapped external project.' };
        }

        if (status === 'planned' || status === 'not_built_yet' || cfg.type === 'planned') {
            return { tone:'offline', dotClass:'offline', label:'planned', detail: req || agent.currentTask || 'Planned agent, not live yet.' };
        }

        if (agent.status === 'blocked') {
            return { tone:'blocked', dotClass:'blocked', label:'blocked', detail: agent.currentTask || 'Waiting on input' };
        }

        if (agentId === 'chad-yi') {
            var localPresence = navigator.onLine && document.visibilityState !== 'hidden';
            return localPresence
                ? { tone:'online', dotClass:'online', label:'present here', detail: req }
                : { tone:'offline', dotClass:'offline', label:'away', detail: req };
        }

        if (agentId === 'helios') {
            var syncedByHelios = String((data && data.updatedBy) || '').toLowerCase().includes('helios');
            if (syncedByHelios && isRecent) {
                return { tone:'online', dotClass:'online', label:'synced recently', detail: agent.currentTask || 'Dashboard sync seen in past 30m' };
            }
            if (lastActive) {
                return { tone:'offline', dotClass:'offline', label:'sync stale', detail: lastSeen + ' · ' + req };
            }
            return { tone:'offline', dotClass:'offline', label:'unverified', detail: req };
        }

        if (isRecent) {
            return { tone:'online', dotClass:'online', label:'seen recently', detail: lastSeen + ' · ' + (req || 'Recent activity detected.') };
        }
        if (lastActive) {
            return { tone:'offline', dotClass:'offline', label:'seen earlier', detail: lastSeen + ' · ' + (req || 'No recent verified signal.') };
        }
        return { tone:'offline', dotClass:'offline', label:'unverified', detail: req || 'No verified signal.' };
    }

    /* Helper — this delegates to whatever the page defines.  If the
       page hasn't loaded its own formatRelativeTimestamp yet we fall
       back to a simple implementation. */
    function formatRelativeTimestamp(value) {
        if (typeof global.formatRelativeTimestamp === 'function') {
            return global.formatRelativeTimestamp(value);
        }
        // Fallback
        var diff = Date.now() - new Date(value).getTime();
        var mins = Math.floor(diff / 60000);
        if (mins < 1)  return 'just now';
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24)  return hrs + 'h ago';
        return Math.floor(hrs / 24) + 'd ago';
    }

    /* ── Expose everything ──────────────────────────────────────────── */
    global.normalizeAgentId    = normalizeAgentId;
    global.getAgentConfig      = getAgentConfig;
    global.formatAgentDisplay  = formatAgentDisplay;
    global.getFleetIds         = getFleetIds;
    global.getHealthPriority   = getHealthPriority;
    global.isAgentExcluded     = isAgentExcluded;
    global.isUserAgent         = isUserAgent;
    global.getAgentSignalMeta  = getAgentSignalMeta;
    global.normalizeTaskStatus = normalizeTaskStatus;

    /* ── Boot ────────────────────────────────────────────────────────── */
    _loadRegistry();

})(window);
