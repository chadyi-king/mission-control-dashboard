(function (global) {
    const STATUS_ORDER = ['pending', 'active', 'review', 'done'];
    const STATUS_LABELS = {
        pending: 'Pending',
        active: 'Active',
        review: 'Review',
        done: 'Done'
    };
    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

    const defaultHelpers = {
        safeParseDate(value) {
            const date = value ? new Date(value) : new Date();
            return isNaN(date.getTime()) ? new Date() : date;
        },
        formatAbsoluteTimestamp(value) {
            if (!value) return '—';
            const date = new Date(value);
            if (isNaN(date.getTime())) return '—';
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        },
        getPriorityClass(priority) {
            if (priority === 'high') return 'high';
            if (priority === 'medium') return 'medium';
            return 'low';
        }
    };

    let overrideHelpers = {};
    let overlayEl = null;
    let elements = {};
    let projectLookup = {};
    let currentProject = null;
    let filters = createDefaultFilters();
    let keydownHandler = null;

    function createDefaultFilters(overrides = {}) {
        return Object.assign({
            status: 'all',
            priority: 'all',
            search: '',
            sort: 'created-newest'
        }, overrides);
    }

    function resolveHelper(name) {
        if (overrideHelpers[name]) return overrideHelpers[name];
        if (typeof global[name] === 'function') return global[name];
        const shared = global.MissionControlHelpers || {};
        if (typeof shared[name] === 'function') return shared[name];
        return defaultHelpers[name];
    }

    function ensureMounted() {
        if (overlayEl) return;

        overlayEl = document.createElement('div');
        overlayEl.id = 'project-tasks-modal';
        overlayEl.className = 'project-tasks-modal-overlay';
        overlayEl.setAttribute('aria-hidden', 'true');
        overlayEl.innerHTML = `
            <div class="project-tasks-modal-panel" role="dialog" aria-modal="true" aria-labelledby="project-modal-name">
                <header class="project-modal-header">
                    <div class="project-modal-title-stack">
                        <div class="project-modal-id" id="project-modal-id">A0</div>
                        <div>
                            <div class="project-modal-name" id="project-modal-name">Mission Project</div>
                            <div class="project-modal-meta">
                                <span class="project-modal-status-badge" id="project-modal-status">Status</span>
                                <span class="project-modal-count" id="project-modal-total-label">0 tasks</span>
                                <span class="project-modal-urgent" id="project-modal-urgent-label">No urgent tasks</span>
                            </div>
                        </div>
                    </div>
                    <button class="project-modal-close" data-project-modal-close aria-label="Close project tasks">×</button>
                </header>
                <div class="project-modal-progress">
                    <div class="project-modal-progress-labels">
                        <span id="project-modal-progress-value">0% complete</span>
                        <span id="project-modal-progress-subtext">0 done / 0 total</span>
                    </div>
                    <div class="project-modal-progress-bar">
                        <div class="project-modal-progress-fill" id="project-modal-progress-fill"></div>
                    </div>
                </div>
                <div class="project-modal-quick-stats" id="project-modal-quick-stats"></div>
                <div class="project-modal-filters">
                    <div>
                        <div class="modal-filter-label">Status</div>
                        <div class="modal-chip-row" id="project-modal-status-chips">
                            <button type="button" class="modal-chip" data-status="all">All</button>
                            <button type="button" class="modal-chip" data-status="pending">Pending</button>
                            <button type="button" class="modal-chip" data-status="active">Active</button>
                            <button type="button" class="modal-chip" data-status="review">Review</button>
                            <button type="button" class="modal-chip" data-status="done">Done</button>
                        </div>
                    </div>
                    <div>
                        <div class="modal-filter-label">Priority</div>
                        <div class="modal-chip-row" id="project-modal-priority-chips">
                            <button type="button" class="modal-chip" data-priority="all">All</button>
                            <button type="button" class="modal-chip" data-priority="high">High</button>
                            <button type="button" class="modal-chip" data-priority="medium">Medium</button>
                            <button type="button" class="modal-chip" data-priority="low">Low</button>
                        </div>
                    </div>
                    <div>
                        <div class="modal-filter-label">Search</div>
                        <div class="modal-search-field">
                            <input type="text" id="project-modal-search" placeholder="Search tasks or notes" />
                        </div>
                    </div>
                    <div>
                        <div class="modal-filter-label">Sort</div>
                        <select class="modal-select" id="project-modal-sort">
                            <option value="created-newest">Created · Newest</option>
                            <option value="created-oldest">Created · Oldest</option>
                            <option value="priority">Priority</option>
                            <option value="status">Status</option>
                        </select>
                    </div>
                </div>
                <div class="project-modal-body" id="project-modal-body">
                    <div class="project-modal-task-list" id="project-modal-task-list"></div>
                </div>
                <footer class="project-modal-footer">
                    <div class="project-modal-task-count" id="project-modal-task-counter">Showing 0 tasks</div>
                    <div class="project-modal-footer-actions">
                        <button class="project-modal-btn secondary" type="button" data-action="spawn-agent">Spawn Agent</button>
                        <button class="project-modal-btn" type="button" data-action="add-task">Add Task</button>
                    </div>
                </footer>
            </div>
        `;

        document.body.appendChild(overlayEl);

        elements = {
            name: overlayEl.querySelector('#project-modal-name'),
            id: overlayEl.querySelector('#project-modal-id'),
            status: overlayEl.querySelector('#project-modal-status'),
            total: overlayEl.querySelector('#project-modal-total-label'),
            urgent: overlayEl.querySelector('#project-modal-urgent-label'),
            progressFill: overlayEl.querySelector('#project-modal-progress-fill'),
            progressValue: overlayEl.querySelector('#project-modal-progress-value'),
            progressSubtext: overlayEl.querySelector('#project-modal-progress-subtext'),
            quickStats: overlayEl.querySelector('#project-modal-quick-stats'),
            statusChips: overlayEl.querySelector('#project-modal-status-chips'),
            priorityChips: overlayEl.querySelector('#project-modal-priority-chips'),
            searchInput: overlayEl.querySelector('#project-modal-search'),
            sortSelect: overlayEl.querySelector('#project-modal-sort'),
            taskList: overlayEl.querySelector('#project-modal-task-list'),
            body: overlayEl.querySelector('#project-modal-body'),
            taskCounter: overlayEl.querySelector('#project-modal-task-counter')
        };

        overlayEl.addEventListener('click', (event) => {
            if (event.target === overlayEl || event.target.closest('[data-project-modal-close]')) {
                hideModal();
            }
        });

        elements.statusChips.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-status]');
            if (!chip) return;
            filters.status = chip.dataset.status;
            updateChipSelection(elements.statusChips, 'status', filters.status);
            renderTaskList();
        });

        elements.priorityChips.addEventListener('click', (event) => {
            const chip = event.target.closest('[data-priority]');
            if (!chip) return;
            filters.priority = chip.dataset.priority;
            updateChipSelection(elements.priorityChips, 'priority', filters.priority);
            renderTaskList();
        });

        elements.searchInput.addEventListener('input', (event) => {
            filters.search = event.target.value.trim();
            renderTaskList();
        });

        elements.sortSelect.addEventListener('change', (event) => {
            filters.sort = event.target.value;
            renderTaskList();
        });

        const spawnBtn = overlayEl.querySelector('[data-action="spawn-agent"]');
        const addBtn = overlayEl.querySelector('[data-action="add-task"]');

        spawnBtn.addEventListener('click', () => {
            if (typeof global.quickAction === 'function') {
                global.quickAction('Spawn Agent');
            } else {
                alert('Spawn Agent - Feature coming soon!');
            }
        });

        addBtn.addEventListener('click', () => {
            if (currentProject && typeof global.addTask === 'function') {
                global.addTask(currentProject.id);
            } else if (currentProject) {
                alert(`Add new task to project ${currentProject.id}...`);
            }
        });
    }

    function updateChipSelection(container, attr, value) {
        container.querySelectorAll(`[data-${attr}]`).forEach((chip) => {
            chip.classList.toggle('active', chip.dataset[attr] === value);
        });
    }

    function setProjectLookup(data) {
        if (Array.isArray(data)) {
            projectLookup = data.reduce((map, proj) => {
                if (proj && proj.id) {
                    map[proj.id] = proj;
                }
                return map;
            }, {});
        } else if (data && typeof data === 'object') {
            projectLookup = { ...data };
        } else {
            projectLookup = {};
        }
    }

    function open(projectId, options = {}) {
        ensureMounted();

        const project = projectLookup[projectId];
        if (!project) {
            console.warn('[ProjectTasksModal] Project not found:', projectId);
            return;
        }

        currentProject = project;
        filters = createDefaultFilters({
            status: options.status || 'all',
            priority: options.priority || 'all',
            search: options.search || '',
            sort: options.sort || 'created-newest'
        });

        updateChipSelection(elements.statusChips, 'status', filters.status);
        updateChipSelection(elements.priorityChips, 'priority', filters.priority);
        elements.searchInput.value = filters.search;
        elements.sortSelect.value = filters.sort;

        populateHeader(project);
        renderQuickStats(project);
        renderTaskList();
        showModal();
    }

    function populateHeader(project) {
        const stats = getProjectStats(project);
        const total = stats.total;
        const done = stats.done;
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;
        const urgent = stats.urgent;

        elements.name.textContent = project.name || project.id;
        elements.id.textContent = project.id || '—';
        const statusValue = project.status || 'pending';
        elements.status.textContent = statusValue;
        elements.status.className = `project-modal-status-badge ${statusValue}`;
        elements.total.textContent = `${total} task${total === 1 ? '' : 's'}`;
        elements.urgent.textContent = urgent > 0 ? `${urgent} urgent` : 'No urgent tasks';
        elements.urgent.classList.toggle('has-urgent', urgent > 0);
        elements.progressFill.style.width = `${progress}%`;
        elements.progressValue.textContent = `${progress}% complete`;
        elements.progressSubtext.textContent = `${done} done / ${total} total`;
        elements.body.scrollTop = 0;
    }

    function renderQuickStats(project) {
        const stats = getProjectStats(project);
        const statDefs = [
            { label: 'Total', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'Review', value: stats.review },
            { label: 'Done', value: stats.done },
            { label: 'Urgent', value: stats.urgent }
        ];

        elements.quickStats.innerHTML = statDefs.map(stat => `
            <div class="project-modal-quick-stat">
                <div class="project-modal-quick-stat-label">${stat.label}</div>
                <div class="project-modal-quick-stat-value">${stat.value}</div>
            </div>
        `).join('');
    }

    function getProjectStats(project) {
        if (project && project.stats) return project.stats;
        return calculateStatsFromTasks(project.tasks || []);
    }

    function calculateStatsFromTasks(tasks) {
        const stats = {
            total: tasks.length,
            pending: 0,
            active: 0,
            review: 0,
            done: 0,
            urgent: 0
        };
        tasks.forEach(task => {
            const status = task.status || 'pending';
            if (status === 'pending' || status === 'active' || status === 'review' || status === 'done') {
                stats[status] += 1;
            }
            if (task.priority === 'high' && status !== 'done') {
                stats.urgent += 1;
            }
        });
        return stats;
    }

    function getTaskList(project) {
        const tasks = Array.isArray(project.tasks) ? project.tasks.slice() : [];
        return tasks;
    }

    function getFilteredTasks(tasks) {
        const safeParse = resolveHelper('safeParseDate');
        const searchTerm = filters.search.toLowerCase();

        return tasks.filter(task => {
            if (filters.status !== 'all' && (task.status || 'pending') !== filters.status) {
                return false;
            }
            if (filters.priority !== 'all' && (task.priority || 'medium') !== filters.priority) {
                return false;
            }
            if (searchTerm) {
                const haystack = `${task.title || ''} ${task.notes || ''} ${task.status || ''} ${task.priority || ''}`.toLowerCase();
                if (!haystack.includes(searchTerm)) {
                    return false;
                }
            }
            return true;
        }).sort((a, b) => {
            switch (filters.sort) {
                case 'created-oldest':
                    return safeParse(a.createdAt) - safeParse(b.createdAt);
                case 'priority': {
                    const aPriority = PRIORITY_ORDER[a.priority] ?? 99;
                    const bPriority = PRIORITY_ORDER[b.priority] ?? 99;
                    return aPriority - bPriority;
                }
                case 'status': {
                    const aStatus = STATUS_ORDER.indexOf(a.status || 'pending');
                    const bStatus = STATUS_ORDER.indexOf(b.status || 'pending');
                    return aStatus - bStatus;
                }
                case 'created-newest':
                default:
                    return safeParse(b.createdAt) - safeParse(a.createdAt);
            }
        });
    }

    function renderTaskList() {
        if (!currentProject) return;
        const tasks = getTaskList(currentProject);
        const filtered = getFilteredTasks(tasks);

        if (filtered.length === 0) {
            elements.taskList.innerHTML = '<div class="project-modal-empty">No tasks match the current filters.</div>';
        } else {
            const groups = buildTaskGroups(filtered);
            elements.taskList.innerHTML = groups.map(renderTaskGroup).join('');
        }

        const label = filtered.length === tasks.length
            ? `Showing ${filtered.length} task${filtered.length === 1 ? '' : 's'}`
            : `Showing ${filtered.length} of ${tasks.length} tasks`;
        elements.taskCounter.textContent = label;
    }

    function buildTaskGroups(tasks) {
        const grouped = STATUS_ORDER.map(status => ({
            status,
            tasks: []
        }));

        const fallback = { status: 'other', tasks: [] };

        tasks.forEach(task => {
            const status = task.status || 'pending';
            const idx = STATUS_ORDER.indexOf(status);
            if (idx >= 0) {
                grouped[idx].tasks.push(task);
            } else {
                fallback.tasks.push(task);
            }
        });

        const result = grouped.filter(group => group.tasks.length > 0);
        if (fallback.tasks.length > 0) {
            result.push(fallback);
        }
        return result;
    }

    function renderTaskGroup(group) {
        const label = STATUS_LABELS[group.status] || group.status;
        return `
            <div class="project-modal-task-group">
                <div class="task-group-header">
                    <span>${label}</span>
                    <span class="task-group-count">${group.tasks.length}</span>
                </div>
                ${group.tasks.map(renderTaskRow).join('')}
            </div>
        `;
    }

    function renderTaskRow(task) {
        const absoluteFormatter = resolveHelper('formatAbsoluteTimestamp');
        const created = absoluteFormatter(task.createdAt);
        const completed = task.completedAt ? absoluteFormatter(task.completedAt) : '—';
        const status = task.status || 'pending';
        const statusClass = `project-modal-pill status-${status}`;
        const priorityValue = (task.priority || 'medium').toLowerCase();
        const helperClass = resolveHelper('getPriorityClass')(priorityValue) || priorityValue;
        const normalizedPriority = /high/i.test(helperClass) ? 'high' : /medium/i.test(helperClass) ? 'medium' : /low/i.test(helperClass) ? 'low' : priorityValue;
        const priorityLabel = priorityValue.toUpperCase();

        return `
            <div class="project-modal-task-row">
                <div class="project-modal-task-priority ${normalizedPriority}">${priorityLabel}</div>
                <div class="project-modal-task-main">
                    <div class="project-modal-task-title">${task.title || 'Untitled Task'}</div>
                    ${task.notes ? `<div class="project-modal-task-notes">${task.notes}</div>` : ''}
                    <div class="project-modal-task-meta">
                        <span class="project-modal-pill priority-pill">${priorityLabel}</span>
                        <span class="${statusClass}">${STATUS_LABELS[status] || status}</span>
                    </div>
                </div>
                <div class="project-modal-task-dates">
                    <div>
                        <span>Created</span>
                        <div>${created}</div>
                    </div>
                    <div>
                        <span>Completed</span>
                        <div>${completed}</div>
                    </div>
                </div>
            </div>
        `;
    }

    function showModal() {
        overlayEl.setAttribute('aria-hidden', 'false');
        overlayEl.classList.add('visible');
        document.body.classList.add('modal-open');
        keydownHandler = (event) => {
            if (event.key === 'Escape') {
                hideModal();
            }
        };
        document.addEventListener('keydown', keydownHandler);
    }

    function hideModal() {
        if (!overlayEl) return;
        overlayEl.setAttribute('aria-hidden', 'true');
        overlayEl.classList.remove('visible');
        document.body.classList.remove('modal-open');
        if (keydownHandler) {
            document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }
    }

    function configure(customHelpers = {}) {
        overrideHelpers = { ...overrideHelpers, ...customHelpers };
    }

    global.ProjectTasksModal = {
        configure,
        setProjectLookup,
        open,
        close: hideModal
    };
})(window);
