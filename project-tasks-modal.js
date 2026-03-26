(function (global) {
    const GROUP_ORDER = ['needs-me', 'needs-review', 'needs-input', 'active-work', 'open-work', 'completed'];
    const GROUP_LABELS = {
        'needs-me': 'Needs Me',
        'needs-review': 'Needs My Review',
        'needs-input': 'Needs My Input',
        'active-work': 'Verified Active Work',
        'open-work': 'Other Open Work',
        'completed': 'Completed'
    };
    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

    const defaultHelpers = {
        safeParseDate(value) {
            const date = value ? new Date(value) : new Date();
            return isNaN(date.getTime()) ? new Date() : date;
        },
        getPriorityClass(priority) {
            if (priority === 'high') return 'high';
            if (priority === 'medium') return 'medium';
            return 'low';
        },
        getTaskPrimaryLane(task) {
            return { key: task?.status === 'done' ? 'completed' : 'open-work', label: 'Open Work' };
        },
        getTaskDetailModel(task) {
            return {
                lane: this.getTaskPrimaryLane(task),
                projectLabel: 'Project',
                personAgent: task?.agent || task?.assignedTo || 'Unassigned',
                about: task?.description || task?.title || 'No description logged.',
                progress: task?.notes || 'No progress logged.'
            };
        }
    };

    let overrideHelpers = {};
    let overlayEl = null;
    let elements = {};
    let projectLookup = {};
    let currentProject = null;
    let filters = { search: '', sort: 'attention' };
    let keydownHandler = null;

    function resolveHelper(name) {
        if (overrideHelpers[name]) return overrideHelpers[name];
        if (typeof global[name] === 'function') return global[name];
        const shared = global.MissionControlHelpers || {};
        if (typeof shared[name] === 'function') return shared[name];
        return defaultHelpers[name].bind(defaultHelpers);
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
                <div class="project-modal-filters slim">
                    <div class="project-modal-filter-block grow">
                        <div class="modal-filter-label">Search</div>
                        <div class="modal-search-field">
                            <input type="text" id="project-modal-search" placeholder="Search titles, notes, or context" />
                        </div>
                    </div>
                    <div class="project-modal-filter-block compact">
                        <div class="modal-filter-label">Sort</div>
                        <select class="modal-select" id="project-modal-sort">
                            <option value="attention">Needs attention first</option>
                            <option value="priority">Priority</option>
                            <option value="recent">Newest first</option>
                            <option value="completed">Recently completed first</option>
                        </select>
                    </div>
                </div>
                <div class="project-modal-body" id="project-modal-body">
                    <div class="project-modal-task-list" id="project-modal-task-list"></div>
                </div>
                <footer class="project-modal-footer">
                    <div class="project-modal-task-count" id="project-modal-task-counter">Showing 0 tasks</div>
                    <div class="project-modal-task-count">Same task detail view as the main dashboard</div>
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
            searchInput: overlayEl.querySelector('#project-modal-search'),
            sortSelect: overlayEl.querySelector('#project-modal-sort'),
            taskList: overlayEl.querySelector('#project-modal-task-list'),
            body: overlayEl.querySelector('#project-modal-body'),
            taskCounter: overlayEl.querySelector('#project-modal-task-counter')
        };

        overlayEl.addEventListener('click', (event) => {
            if (event.target === overlayEl || event.target.closest('[data-project-modal-close]')) {
                hideModal();
                return;
            }
            const taskRow = event.target.closest('[data-open-task]');
            if (taskRow) {
                const taskId = taskRow.getAttribute('data-open-task');
                hideModal();
                if (typeof global.openTask === 'function') {
                    global.openTask(taskId);
                }
            }
        });

        elements.searchInput.addEventListener('input', (event) => {
            filters.search = event.target.value.trim();
            renderTaskList();
        });

        elements.sortSelect.addEventListener('change', (event) => {
            filters.sort = event.target.value;
            renderTaskList();
        });
    }

    function setProjectLookup(data) {
        if (Array.isArray(data)) {
            projectLookup = data.reduce((map, proj) => {
                if (proj && proj.id) map[proj.id] = proj;
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
        filters = {
            search: options.search || '',
            sort: options.sort || 'attention'
        };

        elements.searchInput.value = filters.search;
        elements.sortSelect.value = filters.sort;

        populateHeader(project);
        renderQuickStats(project);
        renderTaskList();
        showModal();
    }

    function getProjectStats(project) {
        if (project && project.stats) return project.stats;
        const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
        return {
            total: tasks.length,
            done: tasks.filter(task => task.status === 'done').length,
            left: tasks.filter(task => task.status !== 'done').length,
            urgent: tasks.filter(task => task.status !== 'done' && task.priority === 'high').length
        };
    }

    function populateHeader(project) {
        const stats = getProjectStats(project);
        const total = stats.total || 0;
        const done = stats.done || 0;
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;
        const urgent = stats.urgent || 0;

        elements.name.textContent = project.name || project.id;
        elements.id.textContent = project.id || '—';
        elements.status.textContent = project.status || 'pending';
        elements.status.className = `project-modal-status-badge ${project.status || 'pending'}`;
        elements.total.textContent = `${total} task${total === 1 ? '' : 's'}`;
        elements.urgent.textContent = urgent > 0 ? `${urgent} urgent` : 'No urgent tasks';
        elements.urgent.classList.toggle('has-urgent', urgent > 0);
        elements.progressFill.style.width = `${progress}%`;
        elements.progressValue.textContent = `${progress}% complete`;
        elements.progressSubtext.textContent = `${done} done / ${total} total`;
        elements.body.scrollTop = 0;
    }

    function renderQuickStats(project) {
        const tasks = getTaskList(project);
        const groups = buildTaskGroups(tasks);
        const stats = [
            { label: 'Needs me', value: groups['needs-me']?.length || 0 },
            { label: 'Review', value: groups['needs-review']?.length || 0 },
            { label: 'Input', value: groups['needs-input']?.length || 0 },
            { label: 'Open elsewhere', value: (groups['active-work']?.length || 0) + (groups['open-work']?.length || 0) },
            { label: 'Done', value: groups.completed?.length || 0 }
        ];

        elements.quickStats.innerHTML = stats.map(stat => `
            <div class="project-modal-quick-stat">
                <div class="project-modal-quick-stat-label">${stat.label}</div>
                <div class="project-modal-quick-stat-value">${stat.value}</div>
            </div>
        `).join('');
    }

    function getTaskList(project) {
        return Array.isArray(project?.tasks) ? project.tasks.slice() : [];
    }

    function getFilteredTasks(tasks) {
        const safeParse = resolveHelper('safeParseDate');
        const laneResolver = resolveHelper('getTaskPrimaryLane');
        const searchTerm = filters.search.toLowerCase();

        return tasks.filter(task => {
            if (!searchTerm) return true;
            const detail = resolveHelper('getTaskDetailModel')(task, global.appData);
            const haystack = [
                task.title,
                task.notes,
                task.description,
                detail.about,
                detail.progress,
                detail.personAgent,
                detail.projectLabel,
                laneResolver(task, global.appData).label
            ].join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        }).sort((a, b) => {
            if (filters.sort === 'priority') {
                return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
            }
            if (filters.sort === 'recent') {
                return safeParse(b.createdAt) - safeParse(a.createdAt);
            }
            if (filters.sort === 'completed') {
                return safeParse(b.completedAt || b.createdAt) - safeParse(a.completedAt || a.createdAt);
            }

            const laneOrder = GROUP_ORDER.indexOf(laneResolver(a, global.appData).key) - GROUP_ORDER.indexOf(laneResolver(b, global.appData).key);
            if (laneOrder !== 0) return laneOrder;
            const priorityDelta = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
            if (priorityDelta !== 0) return priorityDelta;
            return safeParse(b.createdAt) - safeParse(a.createdAt);
        });
    }

    function buildTaskGroups(tasks) {
        const laneResolver = resolveHelper('getTaskPrimaryLane');
        const grouped = {};
        GROUP_ORDER.forEach(key => { grouped[key] = []; });

        tasks.forEach(task => {
            const lane = laneResolver(task, global.appData);
            const key = grouped[lane.key] ? lane.key : 'open-work';
            grouped[key].push(task);
        });

        return grouped;
    }

    function renderTaskList() {
        if (!currentProject) return;
        const tasks = getTaskList(currentProject);
        const filtered = getFilteredTasks(tasks);
        const groups = buildTaskGroups(filtered);

        const content = GROUP_ORDER
            .filter(key => groups[key] && groups[key].length > 0)
            .map(key => renderTaskGroup(key, groups[key]))
            .join('');

        elements.taskList.innerHTML = content || '<div class="project-modal-empty">No tasks match the current search.</div>';
        elements.taskCounter.textContent = filtered.length === tasks.length
            ? `Showing ${filtered.length} task${filtered.length === 1 ? '' : 's'}`
            : `Showing ${filtered.length} of ${tasks.length} tasks`;
    }

    function renderTaskGroup(key, tasks) {
        return `
            <div class="project-modal-task-group">
                <div class="task-group-header">
                    <span>${GROUP_LABELS[key] || key}</span>
                    <span class="task-group-count">${tasks.length}</span>
                </div>
                ${tasks.map(renderTaskRow).join('')}
            </div>
        `;
    }

    function renderTaskRow(task) {
        const detail = resolveHelper('getTaskDetailModel')(task, global.appData);
        const getPriorityClass = resolveHelper('getPriorityClass');
        const priorityValue = (task.priority || 'medium').toLowerCase();
        const priorityClass = getPriorityClass(priorityValue) || priorityValue;
        const priorityLabel = priorityValue.toUpperCase();
        const created = resolveHelper('safeParseDate')(task.createdAt);
        const createdText = isNaN(created.getTime()) ? '—' : created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const deadlineText = task.deadline
            ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'No deadline';

        return `
            <div class="project-modal-task-row clickable" data-open-task="${task.id}" tabindex="0" role="button" aria-label="Open ${task.title || task.id}">
                <div class="project-modal-task-priority ${priorityClass}">${priorityLabel}</div>
                <div class="project-modal-task-main">
                    <div class="project-modal-task-kicker">${detail.projectLabel} · ${task.id}</div>
                    <div class="project-modal-task-title">${task.title || 'Untitled Task'}</div>
                    <div class="project-modal-task-summary">${detail.about}</div>
                    <div class="project-modal-task-progress">${detail.progress}</div>
                    <div class="project-modal-task-meta">
                        <span class="project-modal-pill status-${detail.lane.key.replace(/[^a-z-]/g, '')}">${detail.lane.label}</span>
                        <span class="project-modal-pill priority-pill">Person / Agent · ${detail.personAgent}</span>
                        <span class="project-modal-pill priority-pill">Created · ${createdText}</span>
                        <span class="project-modal-pill priority-pill">${deadlineText === 'No deadline' ? deadlineText : `Due · ${deadlineText}`}</span>
                    </div>
                </div>
                <div class="project-modal-task-open">→ detail</div>
            </div>
        `;
    }

    function showModal() {
        overlayEl.setAttribute('aria-hidden', 'false');
        overlayEl.classList.add('visible');
        document.body.classList.add('modal-open');
        keydownHandler = (event) => {
            if (event.key === 'Escape') hideModal();
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
