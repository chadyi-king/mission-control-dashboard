(function() {
    'use strict';

    var DASHBOARD_BUILD_ID = '20260622-core-task-contract-v1';
    var DASHBOARD_CACHE_KEY = 'rs_dashboard_cache';
    var DASHBOARD_BUILD_KEY = 'rs_dashboard_build_id';
    var RAW_DATA_URL = 'https://raw.githubusercontent.com/chadyi-king/mission-control-dashboard/main/data.json';

    window.DASHBOARD_BUILD_ID = DASHBOARD_BUILD_ID;
    window.DASHBOARD_TASK_CONTRACT = {
        version: DASHBOARD_BUILD_ID,
        sourceOfTruth: 'Telegram/Hermes canonical task state',
        dashboardRole: 'read-mostly snapshot viewer',
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

    function resetDashboardCacheIfNeeded() {
        try {
            var previousBuild = localStorage.getItem(DASHBOARD_BUILD_KEY);
            if (previousBuild !== DASHBOARD_BUILD_ID) {
                localStorage.removeItem(DASHBOARD_CACHE_KEY);
                localStorage.setItem(DASHBOARD_BUILD_KEY, DASHBOARD_BUILD_ID);
            }
        } catch (error) {
            console.warn('[Dashboard] Local cache version check skipped:', error);
        }
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

    function isTaskDone(task) {
        return normalizeTaskStatus(task && task.status) === 'done';
    }

    function visibleTaskList(data) {
        return Object.values(data && data.tasks ? data.tasks : {}).filter(function(task) {
            return task && normalizeTaskStatus(task.status) !== 'removed';
        });
    }

    function taskProjectId(task, fallbackId) {
        var raw = '';
        if (task && task.project) raw = String(task.project);
        if (!raw && task && task.id) raw = String(task.id);
        if (!raw && fallbackId) raw = String(fallbackId);
        var match = raw.trim().match(/^([A-Z]+\d+)/i);
        return match ? match[1].toUpperCase() : '';
    }

    function projectIdFromTask(task, fallbackId) {
        return taskProjectId(task, fallbackId);
    }

    function compareProjectIds(left, right) {
        var leftMatch = String(left).match(/^([A-Z]+)(\d+)$/);
        var rightMatch = String(right).match(/^([A-Z]+)(\d+)$/);
        if (!leftMatch || !rightMatch) return String(left).localeCompare(String(right));
        if (leftMatch[1] !== rightMatch[1]) return leftMatch[1].localeCompare(rightMatch[1]);
        return Number(leftMatch[2]) - Number(rightMatch[2]);
    }

    function defaultProjectDetails(projectId) {
        var defaults = {
            C4: {
                name: 'Website Services',
                description: 'Client website builds, portfolio work, lead capture, and service packaging.'
            }
        };

        return defaults[projectId] || {
            name: projectId,
            description: 'Auto-discovered from tracked dashboard tasks.'
        };
    }

    function ensureCategory(data, categoryId, categoryName, categoryDescription) {
        if (!data.projects || typeof data.projects !== 'object') data.projects = {};
        if (!data.projects[categoryId] || !Array.isArray(data.projects[categoryId].projects)) {
            data.projects[categoryId] = {
                name: categoryName,
                description: categoryDescription,
                projects: []
            };
        }
        if (!data.projects[categoryId].name) data.projects[categoryId].name = categoryName;
        if (!data.projects[categoryId].description) data.projects[categoryId].description = categoryDescription;

        if (!data.categories || typeof data.categories !== 'object') data.categories = {};
        if (!data.categories[categoryId] || !Array.isArray(data.categories[categoryId].projects)) {
            data.categories[categoryId] = {
                name: data.projects[categoryId].name,
                description: data.projects[categoryId].description,
                projects: data.projects[categoryId].projects.slice()
            };
        }
    }

    function addProjectToCategory(data, projectId) {
        var categoryId = projectId.charAt(0);
        if (!data.projects[categoryId]) return;
        if (!data.projects[categoryId].projects.includes(projectId)) {
            data.projects[categoryId].projects.push(projectId);
        }
        if (data.categories && data.categories[categoryId] && Array.isArray(data.categories[categoryId].projects)) {
            if (!data.categories[categoryId].projects.includes(projectId)) {
                data.categories[categoryId].projects.push(projectId);
            }
        }
        if (!data.projectDetails[projectId]) {
            data.projectDetails[projectId] = defaultProjectDetails(projectId);
        }
    }

    function ensureProjectRoster(data) {
        if (!data || typeof data !== 'object') return data;

        data.tasks = data.tasks || {};
        data.projectDetails = data.projectDetails || {};

        ensureCategory(data, 'A', 'Ambition', 'Personal Projects');
        ensureCategory(data, 'B', 'Business', 'Active Ventures');
        ensureCategory(data, 'C', 'Callings', 'Side Projects');

        if (data.categories && typeof data.categories === 'object') {
            Object.keys(data.categories).forEach(function(categoryId) {
                var source = data.categories[categoryId];
                if (!source || !Array.isArray(source.projects)) return;
                ensureCategory(
                    data,
                    categoryId,
                    source.name || (data.projects[categoryId] && data.projects[categoryId].name) || categoryId,
                    source.description || (data.projects[categoryId] && data.projects[categoryId].description) || ''
                );
                source.projects.forEach(function(projectId) {
                    if (/^[ABC]\d+$/i.test(String(projectId))) {
                        addProjectToCategory(data, String(projectId).toUpperCase());
                    }
                });
            });
        }

        Object.keys(data.tasks).forEach(function(taskId) {
            var task = data.tasks[taskId];
            if (!task || normalizeTaskStatus(task.status) === 'removed') return;
            var projectId = taskProjectId(task, taskId);
            if (/^[ABC]\d+$/.test(projectId)) addProjectToCategory(data, projectId);
        });

        ['A', 'B', 'C'].forEach(function(categoryId) {
            if (data.projects[categoryId]) {
                data.projects[categoryId].projects = Array.from(new Set(data.projects[categoryId].projects)).sort(compareProjectIds);
            }
            if (data.categories && data.categories[categoryId]) {
                data.categories[categoryId].projects = Array.from(new Set(data.categories[categoryId].projects)).sort(compareProjectIds);
            }
        });

        return data;
    }

    function taskPriority(task) {
        if (!task || isTaskDone(task)) return task && task.priority ? task.priority : 'done';
        if (typeof normalizePriority === 'function') return normalizePriority(task.priority);
        var raw = String(task.priority || '').toLowerCase();
        if (raw === 'critical' || raw === 'urgent' || raw === 'high') return 'high';
        if (raw === 'medium') return 'medium';
        return 'low';
    }

    function normalizeDashboardTaskContract(data) {
        if (!data || typeof data !== 'object') return data;
        data.tasks = data.tasks || {};
        data.workflow = data.workflow || {};
        data.needsAttention = Array.isArray(data.needsAttention) ? data.needsAttention : [];
        data.inputsNeeded = Array.isArray(data.inputsNeeded) ? data.inputsNeeded : Object.values(data.inputsNeeded || {});

        Object.keys(data.tasks).forEach(function(taskId) {
            var task = data.tasks[taskId];
            if (!task || typeof task !== 'object') return;
            task.id = task.id || taskId;
            var sourceStatus = String(task.status || 'open');
            var canonicalStatus = normalizeTaskStatus(sourceStatus);
            if (canonicalStatus === 'removed') {
                delete data.tasks[taskId];
                return;
            }
            if (canonicalStatus !== sourceStatus.toLowerCase()) {
                task.sourceStatus = task.sourceStatus || sourceStatus;
            }
            task.status = canonicalStatus;
            task.project = taskProjectId(task, taskId) || task.project || '';
            task.category = task.category || (task.project ? task.project.charAt(0) : '');
            if (task.status !== 'done') task.priority = taskPriority(task);
        });

        var tasks = visibleTaskList(data);
        var byStatus = {
            open: [],
            active: [],
            review: [],
            input_requested: [],
            blocked: [],
            paused: [],
            done: [],
            urgent: []
        };
        tasks.forEach(function(task) {
            var status = normalizeTaskStatus(task.status);
            if (!byStatus[status]) byStatus[status] = [];
            byStatus[status].push(task.id);
            if (status !== 'done' && taskPriority(task) === 'high') byStatus.urgent.push(task.id);
        });

        var inputIds = new Set(data.inputsNeeded.map(function(item) {
            return item && (item.taskId || item.id);
        }).filter(Boolean));
        var needsAttention = [];
        var seenAttention = new Set();
        data.needsAttention.forEach(function(item) {
            var id = item && (item.id || item.taskId);
            if (!id || !data.tasks[id] || isTaskDone(data.tasks[id]) || seenAttention.has(id)) return;
            seenAttention.add(id);
            needsAttention.push(item);
        });
        data.needsAttention = needsAttention;

        var previousWorkflow = data.workflow || {};
        data.workflow = Object.assign({}, previousWorkflow, {
            open: byStatus.open.slice(),
            pending: [],
            backlog: [],
            todo: byStatus.open.slice(),
            active: byStatus.active.slice(),
            review: byStatus.review.slice(),
            input_requested: byStatus.input_requested.slice(),
            done: byStatus.done.slice(),
            urgent: byStatus.urgent.slice(),
            blocked: byStatus.blocked.slice(),
            paused: byStatus.paused.slice(),
            'waiting on you': Array.from(inputIds).filter(function(id) { return data.tasks[id] && !isTaskDone(data.tasks[id]); }),
            'check this': byStatus.review.slice(),
            'agent on it': byStatus.active.slice(),
            'has deadline': tasks.filter(function(task) { return task.status !== 'done' && task.deadline; }).map(function(task) { return task.id; })
        });

        var total = tasks.length;
        var done = byStatus.done.length;
        var openCount = total - done;
        var stats = data.stats || {};
        data.stats = Object.assign({}, stats, {
            totalTasks: total,
            tasksLeft: openCount,
            completedTasks: done,
            active: byStatus.active.length,
            blocked: byStatus.blocked.length,
            paused: byStatus.paused.length,
            review: byStatus.review.length,
            inputRequested: data.workflow['waiting on you'].length + byStatus.input_requested.length,
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

        data.dashboardTaskContract = window.DASHBOARD_TASK_CONTRACT;
        return data;
    }

    function installTaskContractNormalizer() {
        if (typeof normalizeDashboardData !== 'function') return false;
        if (normalizeDashboardData.__taskContractNormalized) return true;

        var originalNormalize = normalizeDashboardData;
        var wrappedNormalize = function normalizeDashboardDataWithTaskContract(rawData) {
            return normalizeDashboardTaskContract(originalNormalize(rawData));
        };
        wrappedNormalize.__taskContractNormalized = true;

        window.normalizeDashboardData = wrappedNormalize;
        try {
            normalizeDashboardData = wrappedNormalize;
        } catch (error) {
            console.warn('[Dashboard] Task contract normalizer warning:', error);
        }
        return true;
    }

    function isUserOwnedTask(task) {
        var raw = task && (task.agent || task.assignedTo || task.owner || '');
        if (!raw) return false;
        if (typeof isUserAgent === 'function') return isUserAgent(raw);
        var id = String(raw).toLowerCase().replace(/_/g, '-');
        return id === 'chad-yi' || id === 'chad' || id === 'caleb' || id === 'caleb-yi';
    }

    function getInputTaskIdSet(data) {
        var inputs = Array.isArray(data && data.inputsNeeded) ? data.inputsNeeded : Object.values(data && data.inputsNeeded || {});
        return new Set(inputs.map(function(item) { return item && (item.taskId || item.id); }).filter(Boolean));
    }

    function getAttentionFromOthersSet(data) {
        var attention = Array.isArray(data && data.needsAttention) ? data.needsAttention : [];
        return new Set(attention.filter(function(item) {
            var owner = item && (item.owner || item.requiredBy || item.agent || '');
            if (!owner) return true;
            if (typeof isUserAgent === 'function') return !isUserAgent(owner);
            return !String(owner).toLowerCase().includes('chad') && !String(owner).toLowerCase().includes('caleb');
        }).map(function(item) { return item && (item.id || item.taskId); }).filter(Boolean));
    }

    function fallbackSortTasks(tasks, today) {
        if (typeof sortTasksForAttention === 'function') return sortTasksForAttention(tasks, today);
        return (tasks || []).slice().sort(function(a, b) {
            var priority = { high: 0, medium: 1, low: 2, done: 3 };
            return (priority[taskPriority(a)] || 9) - (priority[taskPriority(b)] || 9);
        });
    }

    function installTaskContractRenderOverrides() {
        if (window.__missionControlTaskContractOverridesInstalled) return;
        window.__missionControlTaskContractOverridesInstalled = true;

        var readonlyLaneResolver = function getTaskPrimaryLaneReadOnly(task, data) {
            if (!task) return { key: 'open-work', label: 'Open Work' };
            var status = normalizeTaskStatus(task.status);
            var inputIds = getInputTaskIdSet(data || window.appData || {});
            var attentionFromOthers = getAttentionFromOthersSet(data || window.appData || {});

            if (status === 'done') return { key: 'completed', label: 'Completed' };
            if (status === 'review') return { key: 'needs-review', label: 'Needs My Review' };
            if (status === 'input_requested' || inputIds.has(task.id) || attentionFromOthers.has(task.id)) {
                return { key: 'needs-input', label: 'Needs My Input' };
            }
            if ((status === 'active' || status === 'blocked') && isUserOwnedTask(task)) {
                return { key: 'needs-me', label: status === 'blocked' ? 'Needs Me To Unblock' : 'Needs Me' };
            }
            if (status === 'active') return { key: 'active-work', label: 'Active Work' };
            return { key: 'open-work', label: status === 'paused' ? 'Paused Work' : 'Open Work' };
        };
        window.getTaskPrimaryLane = readonlyLaneResolver;
        try { getTaskPrimaryLane = readonlyLaneResolver; } catch (error) {}

        var readonlyLens = function getDashboardLensReadOnly(data) {
            var tasks = visibleTaskList(data || {});
            var today = typeof sgtToday === 'function' ? sgtToday() : new Date();
            today.setHours(0, 0, 0, 0);
            var weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - 6);
            var needsAttentionIds = new Set((Array.isArray(data && data.needsAttention) ? data.needsAttention : []).map(function(item) {
                return item && (item.id || item.taskId);
            }).filter(Boolean));

            var groups = { needsMe: [], needsReview: [], needsInput: [], activeWork: [], otherOpen: [], completed: [] };
            tasks.forEach(function(task) {
                var lane = readonlyLaneResolver(task, data).key;
                if (lane === 'completed') groups.completed.push(task);
                else if (lane === 'needs-review') groups.needsReview.push(task);
                else if (lane === 'needs-input') groups.needsInput.push(task);
                else if (lane === 'needs-me') groups.needsMe.push(task);
                else if (lane === 'active-work') groups.activeWork.push(task);
                else groups.otherOpen.push(task);
            });
            Object.keys(groups).forEach(function(key) {
                groups[key] = key === 'completed'
                    ? groups[key].slice().sort(function(a, b) { return new Date(b.completedAt || 0) - new Date(a.completedAt || 0); })
                    : fallbackSortTasks(groups[key], today);
            });

            var completedToday = tasks.filter(function(task) {
                if (task.status !== 'done' || !task.completedAt) return false;
                var date = new Date(task.completedAt);
                date.setHours(0, 0, 0, 0);
                return date.getTime() === today.getTime();
            });
            var completedWeek = tasks.filter(function(task) {
                return task.status === 'done' && task.completedAt && new Date(task.completedAt) >= weekStart;
            }).sort(function(a, b) { return new Date(b.completedAt || 0) - new Date(a.completedAt || 0); });
            var overdueTasks = tasks.filter(function(task) {
                if (task.status === 'done' || !task.deadline) return false;
                var date = new Date(task.deadline);
                date.setHours(0, 0, 0, 0);
                return date < today;
            });
            var attentionTasks = (typeof dedupeTasksById === 'function' ? dedupeTasksById : function(items) {
                var seen = new Set();
                return items.filter(function(item) { if (!item || seen.has(item.id)) return false; seen.add(item.id); return true; });
            })(fallbackSortTasks([
                ].concat(
                    tasks.filter(function(task) { return task.status === 'blocked'; }),
                    overdueTasks,
                    tasks.filter(function(task) { return needsAttentionIds.has(task.id); })
                ), today));
            var needsMeAggregate = (typeof dedupeTasksById === 'function' ? dedupeTasksById : function(items) { return items; })([
                ].concat(groups.needsMe, groups.needsReview, groups.needsInput));
            var excluded = new Set([].concat(attentionTasks, needsMeAggregate).map(function(task) { return task.id; }));
            var nextUpTasks = fallbackSortTasks(tasks.filter(function(task) {
                return task.status !== 'done' && !excluded.has(task.id) && task.status !== 'paused';
            }), today);

            return {
                today: today,
                tasks: tasks,
                completedToday: completedToday,
                completedWeek: completedWeek,
                attentionTasks: attentionTasks,
                needsMeTasks: groups.needsMe,
                needsMeAggregate: needsMeAggregate,
                reviewTasks: groups.needsReview,
                myInputTasks: groups.needsInput,
                activeWorkTasks: groups.activeWork,
                nextUpTasks: nextUpTasks,
                openTasks: groups.otherOpen
            };
        };
        window.getDashboardLens = readonlyLens;
        try { getDashboardLens = readonlyLens; } catch (error) {}

        var readonlyTaskStats = function calculateTaskStatsReadOnly(tasks) {
            var visible = (tasks || []).filter(function(task) { return task && normalizeTaskStatus(task.status) !== 'removed'; });
            var openTasks = visible.filter(function(task) { return task.status !== 'done'; });
            return {
                total: visible.length,
                pending: 0,
                open: visible.filter(function(task) { return task.status === 'open'; }).length,
                active: visible.filter(function(task) { return task.status === 'active'; }).length,
                blocked: visible.filter(function(task) { return task.status === 'blocked'; }).length,
                paused: visible.filter(function(task) { return task.status === 'paused'; }).length,
                review: visible.filter(function(task) { return task.status === 'review'; }).length,
                done: visible.filter(function(task) { return task.status === 'done'; }).length,
                left: openTasks.length,
                highPriority: openTasks.filter(function(task) { return taskPriority(task) === 'high'; }).length,
                mediumPriority: openTasks.filter(function(task) { return taskPriority(task) === 'medium'; }).length,
                lowPriority: openTasks.filter(function(task) { return taskPriority(task) === 'low'; }).length,
                urgent: openTasks.filter(function(task) { return taskPriority(task) === 'high'; }).length
            };
        };
        window.calculateTaskStats = readonlyTaskStats;
        try { calculateTaskStats = readonlyTaskStats; } catch (error) {}

        var readonlyProjectStatus = function deriveProjectStatusReadOnly(projTasks) {
            var tasks = projTasks || [];
            if (!tasks.length) return 'open';
            if (tasks.some(function(task) { return task.status === 'blocked'; })) return 'blocked';
            if (tasks.some(function(task) { return task.status === 'active'; })) return 'active';
            if (tasks.some(function(task) { return task.status === 'review' || task.status === 'input_requested'; })) return 'review';
            if (tasks.every(function(task) { return task.status === 'done'; })) return 'done';
            if (tasks.some(function(task) { return task.status === 'paused'; })) return 'paused';
            return 'open';
        };
        window.deriveProjectStatus = readonlyProjectStatus;
        try { deriveProjectStatus = readonlyProjectStatus; } catch (error) {}

        var readonlyFocusCard = function buildFocusCardReadOnly(task, rank) {
            var today = typeof sgtToday === 'function' ? sgtToday() : new Date();
            var detail = typeof getTaskDetailModel === 'function'
                ? getTaskDetailModel(task, window.appData)
                : { lane: readonlyLaneResolver(task, window.appData), projectLabel: task.project || 'Project', about: task.title || '' };
            var escape = typeof escHtml === 'function' ? escHtml : function(value) {
                return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            };
            function isOverdue(value) { if (!value) return false; var date = new Date(value); date.setHours(0,0,0,0); return date < today; }
            function isToday(value) { if (!value) return false; var date = new Date(value); date.setHours(0,0,0,0); return date.getTime() === today.getTime(); }
            function fmtDate(value) { return value ? new Date(value).toLocaleDateString('en-SG', {month:'short', day:'numeric'}) : ''; }
            var deadlineClass = !task.deadline ? '' : isOverdue(task.deadline) ? 'overdue' : isToday(task.deadline) ? 'today' : '';
            var deadlinePrefix = isOverdue(task.deadline) ? 'OVERDUE - ' : isToday(task.deadline) ? 'TODAY - ' : '';
            var normalizedPriority = taskPriority(task);
            return '<div class="focus-task-card priority-' + normalizedPriority + '"'
                + ' id="ftask-' + escape(task.id) + '"'
                + ' draggable="true"'
                + ' data-task-id="' + escape(task.id) + '"'
                + ' ondragstart="focusDragStart(event)"'
                + ' ondragover="focusDragOver(event)"'
                + ' ondrop="focusDrop(event)"'
                + ' onclick="openTask(\'' + escape(task.id) + '\')">'
                + '<span class="focus-rank">#' + rank + '</span>'
                + '<div class="focus-task-contextline">' + escape(detail.projectLabel) + ' · ' + escape(task.id) + '</div>'
                + '<div class="focus-task-title">' + escape(task.title) + '</div>'
                + '<div class="focus-task-meta">'
                + '<span class="focus-task-id">' + escape(detail.lane.label) + '</span>'
                + '<span class="focus-priority-tag focus-priority-' + normalizedPriority + '">' + String(normalizedPriority).toUpperCase() + '</span>'
                + (task.deadline ? '<span class="focus-deadline ' + deadlineClass + '">' + deadlinePrefix + fmtDate(task.deadline) + '</span>' : '')
                + '<span class="focus-readonly-chip">VIEW / REORDER ONLY</span>'
                + '</div>'
                + '<div class="focus-task-summaryline">' + escape((detail.about || '').slice(0, 150)) + '</div>'
                + '</div>';
        };
        window.buildFocusCard = readonlyFocusCard;
        try { buildFocusCard = readonlyFocusCard; } catch (error) {}

        if (typeof updateTicker === 'function' && !updateTicker.__taskContractWrapped) {
            var originalTicker = updateTicker;
            var wrappedTicker = function updateTickerWithTaskContract(data) {
                originalTicker(data);
                var el = document.getElementById('ticker-content');
                if (!el || !data) return;
                var tasks = visibleTaskList(data);
                var doneCount = tasks.filter(function(task) { return task.status === 'done'; }).length;
                var source = (data.updatedBy || 'Hermes snapshot').toString().toUpperCase();
                var age = data.lastUpdated && typeof formatRelativeTimestamp === 'function'
                    ? formatRelativeTimestamp(data.lastUpdated)
                    : 'snapshot loaded';
                var prefix = '<span class="ticker-item-done">SOURCE: TELEGRAM/HERMES -> DASHBOARD SNAPSHOT · ' + source + ' · ' + tasks.length + ' tasks · ' + doneCount + ' done · ' + age + '</span>';
                if (el.innerHTML.indexOf('SOURCE: TELEGRAM/HERMES') === -1) {
                    var sep = '&nbsp;&nbsp;<span class="ticker-sep">|</span>&nbsp;&nbsp;';
                    el.innerHTML = prefix + sep + el.innerHTML;
                }
            };
            wrappedTicker.__taskContractWrapped = true;
            window.updateTicker = wrappedTicker;
            try { updateTicker = wrappedTicker; } catch (error) {}
        }
    }

    async function fetchFreshDashboardData() {
        var timestamp = Date.now();
        var localUrl = new URL('data.json', window.location.href);
        localUrl.searchParams.set('v', DASHBOARD_BUILD_ID);
        localUrl.searchParams.set('t', String(timestamp));

        var rawUrl = RAW_DATA_URL + '?v=' + encodeURIComponent(DASHBOARD_BUILD_ID) + '&t=' + encodeURIComponent(String(timestamp));
        var urls = [localUrl.toString(), rawUrl];
        var failures = [];

        for (var i = 0; i < urls.length; i += 1) {
            try {
                var response = await fetch(urls[i], {
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return await response.json();
            } catch (error) {
                failures.push(urls[i] + ' -> ' + error.message);
            }
        }

        throw new Error('All dashboard data fetches failed: ' + failures.join(' | '));
    }

    function readVersionedCache() {
        try {
            if (localStorage.getItem(DASHBOARD_BUILD_KEY) !== DASHBOARD_BUILD_ID) return null;
            var cached = localStorage.getItem(DASHBOARD_CACHE_KEY);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('[Dashboard] Cached dashboard data could not be used:', error);
            return null;
        }
    }

    function writeVersionedCache(data) {
        try {
            localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(DASHBOARD_BUILD_KEY, DASHBOARD_BUILD_ID);
        } catch (error) {
            console.warn('[Dashboard] Dashboard data cache write skipped:', error);
        }
    }

    function setLoadingState(isLoading, hasError) {
        var loading = document.getElementById('cat-loading-state');
        var error = document.getElementById('cat-error-state');
        if (loading) loading.style.display = isLoading ? '' : 'none';
        if (error) error.style.display = hasError ? '' : 'none';
    }

    function renderDashboardData(data) {
        appData = ensureProjectRoster(normalizeDashboardTaskContract(data));
        allProjects = buildProjectsFromData(appData);
        syncProjectLookup();
        window.appData = appData;

        renderHomeSection();
        renderCategoriesSection();
        renderResourcesSection();
        updateSidebarAgents(appData);
        if (typeof updateFleetPanel === 'function') updateFleetPanel(appData);
        setLoadingState(false, false);
        applyReadOnlyUiHints();
    }

    function installProjectRosterRepair() {
        if (typeof normalizeDashboardData !== 'function') return false;
        if (normalizeDashboardData.__projectRosterRepaired) return true;

        var originalNormalize = normalizeDashboardData;
        var wrappedNormalize = function normalizeDashboardDataWithProjectRoster(rawData) {
            return ensureProjectRoster(originalNormalize(rawData));
        };
        wrappedNormalize.__projectRosterRepaired = true;

        window.normalizeDashboardData = wrappedNormalize;
        try {
            normalizeDashboardData = wrappedNormalize;
        } catch (error) {
            console.warn('[Dashboard] Normalizer replacement warning:', error);
        }
        return true;
    }

    function showDashboardWriteDisabled(action) {
        var message = 'Dashboard task writes are disabled. Use Telegram/Hermes to add, assign, mark done, set deadlines, or change task truth.';
        if (action) message += ' Blocked action: ' + action + '.';
        console.warn('[Dashboard Write Policy]', message);
        if (typeof showToast === 'function') {
            showToast(message, 'warn', 6500);
        } else if (typeof alert === 'function') {
            alert(message);
        }
    }

    function installDashboardWriteGuards() {
        window.DASHBOARD_WRITE_POLICY = {
            version: DASHBOARD_BUILD_ID,
            sourceOfTruth: 'Hermes canonical state via Telegram/Hermes',
            dashboardWrites: 'disabled',
            allowedLocally: ['view', 'filter', 'expand', 'drag-reorder-local-priority']
        };

        window.commitTaskDoneToGitHub = async function commitTaskDoneToGitHubDisabled(taskId) {
            showDashboardWriteDisabled('GitHub data.json commit for ' + (taskId || 'task'));
            return false;
        };
        try { commitTaskDoneToGitHub = window.commitTaskDoneToGitHub; } catch (error) {}

        window.apiTaskAction = async function apiTaskActionDisabled(event, taskId, action) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            showDashboardWriteDisabled((action || 'task action') + ' for ' + (taskId || 'task'));
            return false;
        };
        try { apiTaskAction = window.apiTaskAction; } catch (error) {}

        window.markFocusDone = function markFocusDoneDisabled(taskId) {
            showDashboardWriteDisabled('mark done for ' + (taskId || 'task'));
            return false;
        };
        try { markFocusDone = window.markFocusDone; } catch (error) {}

        window.markFocusDoneNew = function markFocusDoneNewDisabled(event, taskId) {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            showDashboardWriteDisabled('mark done for ' + (taskId || 'task'));
            return false;
        };
        try { markFocusDoneNew = window.markFocusDoneNew; } catch (error) {}

        window.submitInlineTask = function submitInlineTaskDisabled() {
            showDashboardWriteDisabled('new task creation');
            return false;
        };
        try { submitInlineTask = window.submitInlineTask; } catch (error) {}

        window.toggleInlineTaskForm = function toggleInlineTaskFormDisabled() {
            showDashboardWriteDisabled('inline task creation');
            return false;
        };
        try { toggleInlineTaskForm = window.toggleInlineTaskForm; } catch (error) {}

        window.assignFocusTask = function assignFocusTaskDisabled(taskId) {
            showDashboardWriteDisabled('assignment for ' + (taskId || 'task'));
            return false;
        };
        try { assignFocusTask = window.assignFocusTask; } catch (error) {}

        window.assignModalTask = function assignModalTaskDisabled() {
            showDashboardWriteDisabled('task assignment');
            return false;
        };
        try { assignModalTask = window.assignModalTask; } catch (error) {}

        window.modalMarkDone = function modalMarkDoneDisabled() {
            showDashboardWriteDisabled('modal mark done');
            return false;
        };
        try { modalMarkDone = window.modalMarkDone; } catch (error) {}

        window.modalMarkActive = function modalMarkActiveDisabled() {
            showDashboardWriteDisabled('modal mark active');
            return false;
        };
        try { modalMarkActive = window.modalMarkActive; } catch (error) {}

        window.modalMarkBlocked = function modalMarkBlockedDisabled() {
            showDashboardWriteDisabled('modal mark blocked');
            return false;
        };
        try { modalMarkBlocked = window.modalMarkBlocked; } catch (error) {}

        window.openSettingsModal = function openSettingsModalDisabled() {
            showDashboardWriteDisabled('GitHub PAT settings');
            return false;
        };
        try { openSettingsModal = window.openSettingsModal; } catch (error) {}

        window.saveSettingsPAT = function saveSettingsPATDisabled() {
            showDashboardWriteDisabled('saving GitHub PAT');
            return false;
        };
        try { saveSettingsPAT = window.saveSettingsPAT; } catch (error) {}
    }

    function injectReadOnlyStyles() {
        if (document.getElementById('dashboard-readonly-task-contract-style')) return;
        var style = document.createElement('style');
        style.id = 'dashboard-readonly-task-contract-style';
        style.textContent = [
            '.focus-quick-actions,.focus-add-btn,.inline-task-form{display:none!important}',
            '.focus-readonly-chip{font-size:9px;letter-spacing:.08em;color:rgba(160,170,190,.72);border:1px solid rgba(160,170,190,.18);padding:2px 6px;border-radius:4px}',
            '.dashboard-readonly-note{margin-left:8px;font-size:9px;letter-spacing:.08em;color:rgba(160,170,190,.72);font-weight:600}',
            '.task-modal-readonly strong::after{content:" · Telegram/Hermes owns task truth"}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function applyReadOnlyUiHints() {
        if (!document || !document.body) return;
        injectReadOnlyStyles();
        var settings = document.getElementById('settings-modal');
        if (settings && settings.parentNode) settings.parentNode.removeChild(settings);

        var focusLabel = document.querySelector('.focus-top5-label');
        if (focusLabel && !focusLabel.querySelector('.dashboard-readonly-note')) {
            var note = document.createElement('span');
            note.className = 'dashboard-readonly-note';
            note.textContent = 'LOCAL REORDER ONLY';
            focusLabel.appendChild(note);
        }

        var customOption = document.querySelector('#focus-filter-select option[value="custom"]');
        if (customOption) customOption.textContent = 'Custom Order (local)';
        var pendingOption = document.querySelector('#filter-status option[value="pending"]');
        if (pendingOption) {
            pendingOption.value = 'open';
            pendingOption.textContent = 'Open';
        }
        var pendingStatLabel = document.querySelector('#cat-tasks-pending + .dashboard-stat-label');
        if (pendingStatLabel) pendingStatLabel.textContent = 'Open';
    }

    function installReadOnlyUiHints() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applyReadOnlyUiHints);
        } else {
            applyReadOnlyUiHints();
        }
        window.setTimeout(applyReadOnlyUiHints, 1200);
        window.setTimeout(applyReadOnlyUiHints, 3200);
    }

    function installFreshDataLoader() {
        if (typeof normalizeDashboardData !== 'function' || typeof buildProjectsFromData !== 'function') {
            console.warn('[Dashboard] Cache/data patch loaded before dashboard-app.js; using existing loader.');
            return;
        }

        installProjectRosterRepair();
        installTaskContractNormalizer();
        installTaskContractRenderOverrides();

        window.loadData = async function loadDataWithFreshCache() {
            try {
                setLoadingState(true, false);
                var rawData = await fetchFreshDashboardData();
                var normalized = normalizeDashboardData(rawData);
                writeVersionedCache(normalized);
                renderDashboardData(normalized);
            } catch (error) {
                console.error('[Dashboard] Fresh data load failed:', error);
                var cached = readVersionedCache();
                if (cached) {
                    renderDashboardData(cached);
                    return;
                }
                setLoadingState(false, true);
            }
        };

        try {
            loadData = window.loadData;
        } catch (error) {
            console.warn('[Dashboard] Global loader replacement warning:', error);
        }
    }

    resetDashboardCacheIfNeeded();
    installTaskContractRenderOverrides();
    installFreshDataLoader();
    installDashboardWriteGuards();
    installReadOnlyUiHints();
})();

(function() {
    const canvas = document.getElementById('starfield-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];
    const STAR_COUNT = 280;
    const SPEED = 0.4;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function initStars() {
        stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 1.8 + 0.3,
                speed: Math.random() * SPEED + 0.1,
                opacity: Math.random() * 0.7 + 0.2,
                twinkleSpeed: Math.random() * 0.02 + 0.005,
                twinklePhase: Math.random() * Math.PI * 2
            });
        }
    }

    let frame = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frame++;

        for (const s of stars) {
            s.y -= s.speed;
            if (s.y < -5) {
                s.y = canvas.height + 5;
                s.x = Math.random() * canvas.width;
            }

            const twinkle = Math.sin(frame * s.twinkleSpeed + s.twinklePhase) * 0.3 + 0.7;
            const alpha = s.opacity * twinkle;

            const r = 255;
            const g = 200 + Math.floor(Math.random() * 55);
            const b = 200 + Math.floor(Math.random() * 55);

            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fill();

            if (s.size > 1.2) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size * 2.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(180,0,0,${alpha * 0.15})`;
                ctx.fill();
            }
        }

        requestAnimationFrame(draw);
    }

    resize();
    initStars();
    draw();
    window.addEventListener('resize', () => { resize(); initStars(); });
})();
