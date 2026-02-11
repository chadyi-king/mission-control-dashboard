        // Global data store
        let appData = null;
        let allProjects = [];
        let projectLookup = {};

        // Sidebar Toggle
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const toggleArrow = document.querySelector('.sidebar-toggle-arrow');
            const toggleText = document.querySelector('.sidebar-toggle-text');

            sidebar.classList.toggle('expanded');
            const isExpanded = sidebar.classList.contains('expanded');

            toggleArrow.textContent = isExpanded ? '◀' : '▶';
            toggleText.textContent = isExpanded ? 'Collapse' : 'Expand';
            document.body.classList.toggle('sidebar-expanded', isExpanded);
            if (!isExpanded) {
                closeMobileMenu();
            }
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


        // Load Data


        async function loadData() {
            try {
                const response = await fetch('data.json');
                appData = await response.json();
                allProjects = [];

                // Process all projects
                if (appData.projects) {
                    Object.keys(appData.projects).forEach(catKey => {
                        const cat = appData.projects[catKey];
                        if (cat.projects) {
                            cat.projects.forEach(projId => {
                                // projId is a string (e.g., "A1"), not an object
                                const allTasks = appData.tasks ? Object.values(appData.tasks) : [];
                                const projTasks = allTasks.filter(t => t.project === projId);
                                const taskStats = calculateTaskStats(projTasks);

                                allProjects.push({
                                    id: projId,
                                    category: catKey,
                                    categoryName: cat.name,
                                    name: projId,
                                    tasks: projTasks,
                                    stats: taskStats,
                                    priorityBreakdown: getPriorityBreakdown(projTasks),
                                    timeTracking: calculateTimeTracking(projTasks),
                                    nextDeadline: getNextDeadline(projTasks),
                                    milestones: generateMilestones({id: projId}, projTasks),
                                    timeline: buildProjectTimeline(projTasks)
                                });
                            });
                        }
                    });
                }

                syncProjectLookup();

                // Render both sections
                console.log('Rendering sections...');
                renderHomeSection();
                renderCategoriesSection();
                console.log('Calling renderInsights...');
                renderInsights();
                console.log('Render complete');

            } catch (error) {
                console.error('Failed to load data:', error);
                document.getElementById('cat-loading-state').style.display = 'none';
                document.getElementById('cat-error-state').style.display = 'block';
            }
        }

        // Calculate comprehensive task statistics
        function calculateTaskStats(tasks) {
            return {
                total: tasks.length,
                pending: tasks.filter(t => t.status === 'pending').length,
                active: tasks.filter(t => t.status === 'active').length,
                review: tasks.filter(t => t.status === 'review').length,
                done: tasks.filter(t => t.status === 'done').length,
                highPriority: tasks.filter(t => t.priority === 'high' && t.status !== 'done').length,
                mediumPriority: tasks.filter(t => t.priority === 'medium' && t.status !== 'done').length,
                lowPriority: tasks.filter(t => t.priority === 'low' && t.status !== 'done').length,
                urgent: tasks.filter(t => t.priority === 'high' && t.status !== 'done').length
            };
        }

        // Get priority breakdown
        function getPriorityBreakdown(tasks) {
            return {
                high: tasks.filter(t => t.priority === 'high').length,
                medium: tasks.filter(t => t.priority === 'medium').length,
                low: tasks.filter(t => t.priority === 'low').length
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
            if (priority === 'high') return 'high-priority';
            if (priority === 'medium') return 'medium-priority';
            return 'low-priority';
        }

        // ===== REDESIGNED HOME SECTION RENDERING =====
        function renderHomeSection() {
            const stats = appData.stats || {};
            const agents = appData.agents || [];
            const allTasks = appData.tasks ? Object.values(appData.tasks) : [];
            const workflow = appData.workflow || {};

            // Compact Widgets
            document.getElementById('compact-total-tasks').textContent = allTasks.length;
            document.getElementById('compact-active-agents').textContent = stats.activeAgents || agents.length || 0;

            // Active Tasks Board
            renderActiveTasksBoard(allTasks);

            // Calendar View
            renderCalendarView(allTasks);

            // Pending Decisions - map IDs to task objects
            const tasksObj = appData.tasks || {};
            const pendingIds = workflow.pending || [];
            const pendingTasks = pendingIds.map(id => tasksObj[id]).filter(t => t);
            renderPendingDecisions(pendingTasks);

            // Recent Activity
            renderRecentActivity();
        }

        function renderActiveTasksBoard(allTasks) {
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
                
                // Calculate simulated time spent/progress
                const progress = Math.floor(Math.random() * 40) + 30; // 30-70% for demo
                const timeSpent = Math.floor(Math.random() * 3) + 1;
                const timeEstimated = Math.floor(Math.random() * 2) + 3;

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
            
            // Assign fake deadlines to tasks for demo (in real app, tasks would have due dates)
            const tasksWithDeadlines = pendingTasks.slice(0, 5).map((task, i) => {
                const dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + i + 1);
                return { ...task, dueDate };
            });

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
            const activities = [
                { type: 'chad', text: 'Completed task <strong>Update Documentation</strong>', time: '2 min ago', project: 'Project A' },
                { type: 'agent', text: 'Started working on <strong>Code Review</strong>', time: '15 min ago', project: 'Project B' },
                { type: 'system', text: 'Auto-saved progress for <strong>3 tasks</strong>', time: '1 hour ago', project: 'System' },
                { type: 'chad', text: 'Created new task <strong>Design Review</strong>', time: '2 hours ago', project: 'Project C' },
                { type: 'agent', text: 'Completed milestone <strong>Phase 1</strong>', time: '3 hours ago', project: 'Project A' }
            ];

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
            const allTasks = appData.tasks ? Object.values(appData.tasks) : [];
            const totalProjects = allProjects.length;
            const totalTasks = allTasks.length;
            const tasksDone = allTasks.filter(t => t.status === 'done').length;
            const tasksPending = allTasks.filter(t => t.status === 'pending').length;
            const urgentTasks = allTasks.filter(t => t.priority === 'high' && t.status !== 'done').length;
            const completionRate = totalTasks > 0 ? Math.round((tasksDone / totalTasks) * 100) : 0;

            document.getElementById('cat-total-projects').textContent = totalProjects;
            document.getElementById('cat-total-tasks').textContent = totalTasks;
            document.getElementById('cat-tasks-done').textContent = tasksDone;
            document.getElementById('cat-tasks-pending').textContent = tasksPending;
            document.getElementById('cat-completion-rate').textContent = completionRate + '%';
            document.getElementById('cat-urgent-tasks').textContent = urgentTasks;

            renderCategoriesList();

            document.getElementById('cat-loading-state').style.display = 'none';
            document.getElementById('dashboard-stats-bar').style.display = 'grid';
            document.getElementById('filter-bar').style.display = 'flex';
        }

        function renderCategoriesList() {
            const container = document.getElementById('categories-container');

            const categories = {
                A: { icon: '☀️', name: 'Ambition', subtitle: 'By Calbee (Personal)', projects: [] },
                B: { icon: '🌅', name: 'Business', subtitle: 'Empire (Main Work)', projects: [] },
                C: { icon: '🌞', name: 'Callings', subtitle: 'On The Side (Other Jobs)', projects: [] }
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

                return `
                    <div class="category-section" data-category="${catKey}">
                        <div class="category-header-bar">
                            <div class="category-icon">${cat.icon}</div>
                            <div class="category-title-group">
                                <h2><span>${catKey}</span>${cat.name.toUpperCase().slice(1)}</h2>
                                <p>${cat.subtitle}</p>
                            </div>
                            <div class="category-stats">
                                <div class="category-stat">
                                    <div class="category-stat-value">${cat.projects.length}</div>
                                    <div class="category-stat-label">Projects</div>
                                </div>
                                <div class="category-stat">
                                    <div class="category-stat-value">${totalTasks}</div>
                                    <div class="category-stat-label">Tasks</div>
                                </div>
                                <div class="category-stat">
                                    <div class="category-stat-value">${completionRate}%</div>
                                    <div class="category-stat-label">Complete</div>
                                </div>
                            </div>
                        </div>
                        <div class="projects-grid">
                            ${cat.projects.map(proj => renderProjectCard(proj)).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function renderProjectCard(proj) {
            const progress = proj.stats.total > 0 ? Math.round((proj.stats.done / proj.stats.total) * 100) : 0;
            const statusClass = proj.status === 'active' ? 'active' : (proj.status === 'pending' ? 'pending' : '');
            const timePercent = proj.timeTracking.estimated > 0
                ? Math.min(100, Math.round((proj.timeTracking.spent / proj.timeTracking.estimated) * 100))
                : 0;
            const timeClass = timePercent > 100 ? 'danger' : (timePercent > 80 ? 'warning' : '');

            const deadline = proj.nextDeadline;
            let dueDisplay = 'No pending tasks';
            let dueClass = 'success';
            let countdown = '';

            if (deadline) {
                countdown = formatCountdown(deadline.date);
                dueDisplay = deadline.task.title.substring(0, 30) + (deadline.task.title.length > 30 ? '...' : '');
                dueClass = deadline.priority === 'high' || countdown === 'OVERDUE' ? 'urgent' :
                          (countdown.includes('d') && parseInt(countdown) <= 2 ? 'warning' : 'success');
            }

            return `
                <div class="project-card" data-project="${proj.id}" data-status="${proj.status}"
                     data-priority="${proj.stats.urgent > 0 ? 'high' : (proj.stats.mediumPriority > 0 ? 'medium' : 'low')}"
                     data-agent="CHAD_YI" data-due="${deadline ? deadline.date.getTime() : 9999999999999}"
                     data-progress="${progress}" data-tasks="${proj.stats.total}">
                    <div class="project-card-header" onclick="toggleProject(this)">
                        <div class="project-info-main">
                            <div class="project-title-row">
                                <h3>${proj.id} · ${proj.name}</h3>
                                <div class="project-badges">
                                    <span class="agent-badge ${statusClass}">${proj.status}</span>
                                    ${proj.stats.urgent > 0 ? '<span class="agent-badge" style="background: rgba(255,68,68,0.3); color: #ff4444;">URGENT</span>' : ''}
                                </div>
                            </div>
                            <div class="project-id">${proj.stats.total} tasks · ${proj.stats.done} completed · ${proj.stats.active} active</div>
                        </div>
                        <span class="expand-icon">▼</span>
                    </div>

                    <div class="task-stats">
                        <div class="task-stat">
                            <div class="task-stat-value">${proj.stats.total}</div>
                            <div class="task-stat-label">Total</div>
                        </div>
                        <div class="task-stat high-priority">
                            <div class="task-stat-value">${proj.priorityBreakdown.high}</div>
                            <div class="task-stat-label">High</div>
                        </div>
                        <div class="task-stat medium-priority">
                            <div class="task-stat-value">${proj.priorityBreakdown.medium}</div>
                            <div class="task-stat-label">Med</div>
                        </div>
                        <div class="task-stat low-priority">
                            <div class="task-stat-value">${proj.priorityBreakdown.low}</div>
                            <div class="task-stat-label">Low</div>
                        </div>
                        <div class="task-stat urgent">
                            <div class="task-stat-value">${proj.stats.active}</div>
                            <div class="task-stat-label">Active</div>
                        </div>
                        <div class="task-stat">
                            <div class="task-stat-value">${proj.stats.done}</div>
                            <div class="task-stat-label">Done</div>
                        </div>
                    </div>

                    <div class="time-tracking-bar">
                        <div class="time-stat">
                            <span class="time-label">Time Spent</span>
                            <span class="time-value ${timeClass}">${proj.timeTracking.spent}h / ${proj.timeTracking.estimated}h</span>
                        </div>
                        <div class="time-progress-bar">
                            <div class="time-progress-fill ${timeClass}" style="width: ${Math.min(100, timePercent)}%"></div>
                        </div>
                        <div class="time-stat">
                            <span class="time-label">Remaining</span>
                            <span class="time-value">${proj.timeTracking.remaining}h</span>
                        </div>
                    </div>

                    <div class="due-countdown">
                        <span class="due-label">🕐 Next Due:</span>
                        <div class="due-value ${dueClass}">
                            ${dueDisplay}
                            ${countdown ? `<span class="countdown-timer">${countdown}</span>` : ''}
                        </div>
                    </div>

                    <div class="milestones-section">
                        <div class="milestones-title">📍 Milestones</div>
                        <div class="milestones-track">
                            ${proj.milestones.map(m => `
                                <div class="milestone ${m.completed ? 'completed' : (m.active ? 'active' : 'upcoming')}">
                                    <div class="milestone-tooltip">${m.label} (${m.tasksRequired} tasks)</div>
                                </div>
                            `).join('')}
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

                    ${renderProjectTimeline(proj)}

                    <div class="project-card-content">
                        ${renderTasksSection(proj)}

                        <div class="project-actions">
                            <button class="action-btn" onclick="event.stopPropagation(); openProject('${proj.id}')">Open Project</button>
                            <button class="action-btn secondary" onclick="event.stopPropagation(); addTask('${proj.id}')">Add Task</button>
                        </div>
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
            const pendingTasks = proj.tasks.filter(t => t.status !== 'done');
            const doneTasks = proj.tasks.filter(t => t.status === 'done');

            if (pendingTasks.length === 0 && doneTasks.length === 0) {
                return `
                    <div class="tasks-section" style="text-align: center; color: var(--success);">
                        Done No tasks yet. Ready to start!
                    </div>
                `;
            }

            const sections = [];

            if (pendingTasks.length > 0) {
                sections.push(`
                    <div class="tasks-section">
                        <div class="tasks-section-title">📋 Pending Tasks (${pendingTasks.length})</div>
                        <div class="task-list">
                            ${pendingTasks.slice(0, 5).map(task => renderCategoryTaskItem(task)).join('')}
                            ${pendingTasks.length > 5 ? `
                                <div class="category-task-item" style="justify-content: center; color: var(--text-muted); font-size: 11px; cursor: pointer;" onclick="event.stopPropagation(); openProject('${proj.id}', { status: 'pending' })">
                                    +${pendingTasks.length - 5} more tasks
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `);
            }

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
            const priorityClass = task.priority === 'high' ? 'high-priority' : (task.priority === 'medium' ? 'medium-priority' : 'low-priority');
            const statusIcon = task.status === 'active' ? '▶' : (task.status === 'review' ? '👁' : (task.status === 'done' ? 'Done' : '○'));

            return `
                <div class="category-task-item ${priorityClass}">
                    <div class="task-status ${task.status}">${statusIcon}</div>
                    <div class="task-details">
                        <div class="category-task-title">${task.title}</div>
                        ${task.notes ? `<div class="task-notes">${task.notes}</div>` : ''}
                        <div class="task-meta-row">
                            <span class="priority-badge ${task.priority}">${task.priority}</span>
                            <span>${task.status}</span>
                            <span>👤 CHAD_YI</span>
                        </div>
                    </div>
                </div>
            `;
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

        // Render Insights Section
        function renderInsights() {
            console.log('renderInsights called, appData:', !!appData);
            if (!appData) return;
            
            const tasks = appData.tasks ? Object.values(appData.tasks) : [];
            const workflow = appData.workflow || {};
            const tasksById = appData.tasks || {};
            
            console.log('Tasks count:', tasks.length);
            console.log('Workflow:', workflow);
            
            // Combine all tasks (look up workflow IDs from tasks dictionary)
            const allTaskIds = [
                ...(workflow.pending || []),
                ...(workflow.active || []),
                ...(workflow.review || []),
                ...(workflow.done || [])
            ];
            console.log('All task IDs:', allTaskIds.length);
            
            const allTasks = allTaskIds.map(id => tasksById[id]).filter(t => t);
            console.log('Found tasks:', allTasks.length);
            
            // Stats
            const total = allTasks.length;
            const done = allTasks.filter(t => t.status === 'done').length;
            const active = allTasks.filter(t => t.status === 'active').length;
            const pending = allTasks.filter(t => t.status === 'pending').length;
            const review = allTasks.filter(t => t.status === 'review').length;
            const high = allTasks.filter(t => t.priority === 'high').length;
            const medium = allTasks.filter(t => t.priority === 'medium').length;
            const low = allTasks.filter(t => t.priority === 'low').length;
            const urgent = allTasks.filter(t => t.priority === 'high' && t.status !== 'done').length;
            
            const completion = total > 0 ? Math.round((done / total) * 100) : 0;
            
            // Update DOM
            document.getElementById('insight-total-tasks').textContent = total;
            document.getElementById('insight-completion').textContent = completion + '%';
            document.getElementById('insight-high-priority').textContent = high;
            document.getElementById('insight-urgent').textContent = urgent;
            
            // Status bars
            document.getElementById('count-done').textContent = done;
            document.getElementById('count-active').textContent = active;
            document.getElementById('count-pending').textContent = pending;
            document.getElementById('count-review').textContent = review;
            
            document.getElementById('bar-done').style.width = total > 0 ? (done / total * 100) + '%' : '0%';
            document.getElementById('bar-active').style.width = total > 0 ? (active / total * 100) + '%' : '0%';
            document.getElementById('bar-pending').style.width = total > 0 ? (pending / total * 100) + '%' : '0%';
            document.getElementById('bar-review').style.width = total > 0 ? (review / total * 100) + '%' : '0%';
            
            // Priority
            document.getElementById('priority-high').textContent = high;
            document.getElementById('priority-medium').textContent = medium;
            document.getElementById('priority-low').textContent = low;
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', loadData);
