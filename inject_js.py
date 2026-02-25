#!/usr/bin/env python3
"""
Commit 1 Part 2: Insert new JS rendering functions for the command center rebuild
Replaces renderNewHomepage() and inserts new rendering functions
"""

NEW_RENDER_NEW_HOMEPAGE = '''        function renderNewHomepage(data) {
            // ── COMMAND CENTER REBUILD ──────────────────────────────────────
            renderStatsBar(data);
            updateTicker(data);
            renderDailyBriefing(data);
            renderOpsCards(data);
            renderFocusTasks(data);
            renderWeekCalendar(data);
            updateSystemHealth();
        }
'''

NEW_RENDER_FUNCTIONS = '''
        // ════════════════════════════════════════════════════════════════════
        // COMMAND CENTER RENDER FUNCTIONS — Commit 1
        // ════════════════════════════════════════════════════════════════════

        // ── STATS BAR ─────────────────────────────────────────────────────
        function renderStatsBar(data) {
            const tasks = Object.values(data.tasks || {});
            const agents = data.agents || {};
            const agentArr = Object.entries(agents);
            const today = new Date(); today.setHours(0,0,0,0);

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

            const activeTasks = tasks.filter(t => t.status !== 'done');

            // 1. DUE TODAY
            const dueToday = activeTasks.filter(t => t.deadline && isToday(t.deadline));
            const dueUrgent = dueToday.filter(t => t.priority === 'critical' || t.priority === 'high').length;
            const dueDeadline = activeTasks.filter(t => t.deadline && isOverdue(t.deadline)).length;
            const dueNormal = dueToday.filter(t => t.priority === 'medium' || t.priority === 'low').length;
            set('s-due-today', dueToday.length);
            set('s-due-urgent', dueUrgent + ' urgent');
            set('s-due-deadline', dueDeadline + ' overdue');
            set('s-due-normal', dueNormal + ' normal');

            // 2. REVIEW
            const reviewTasks = activeTasks.filter(t => t.status === 'review');
            const reviewDecisions = data.inputsNeeded ? Object.keys(data.inputsNeeded).length : 0;
            set('s-review-total', reviewTasks.length + reviewDecisions);
            set('s-review-agent', reviewTasks.length + ' agent work');
            set('s-review-decisions', reviewDecisions + ' decisions');
            set('s-review-approvals', '0 approvals');

            // 3. AGENTS (X/7)
            const totalAgents = agentArr.length;
            const workingAgents = agentArr.filter(([,a]) => a.status === 'active' || a.status === 'working').length;
            const idleAgents = agentArr.filter(([,a]) => a.status === 'idle' || a.status === 'standby').length;
            const blockedAgents = agentArr.filter(([,a]) => a.status === 'blocked' || a.status === 'offline').length;
            set('s-agents-total', workingAgents + '/' + totalAgents);
            set('s-agents-working', workingAgents + ' working');
            set('s-agents-idle', idleAgents + ' idle');
            set('s-agents-blocked', blockedAgents + ' blocked');

            // 4. BLOCKED
            const blockedTasks = tasks.filter(t => t.status === 'blocked');
            set('s-blocked-total', blockedTasks.length);
            set('s-blocked-you', blockedTasks.filter(t => t.agent === 'CHAD_YI' || !t.agent).length + ' by you');
            set('s-blocked-agents', blockedTasks.filter(t => t.agent && t.agent !== 'CHAD_YI').length + ' by agents');
            set('s-blocked-external', '0 external');

            // 5. COMPLETED
            const doneTasks = tasks.filter(t => t.status === 'done');
            const doneByYou = doneTasks.filter(t => t.agent === 'CHAD_YI' || !t.agent).length;
            const doneByAgents = doneTasks.filter(t => t.agent && t.agent !== 'CHAD_YI').length;
            const weekGoalPct = Math.round((doneTasks.length / Math.max(1, tasks.length)) * 100);
            set('s-completed-total', doneTasks.length);
            set('s-completed-you', doneByYou + ' by you');
            set('s-completed-agents', doneByAgents + ' by agents');
            set('s-completed-week', weekGoalPct + '% week goal');

            // 6. VELOCITY (tasks done today)
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
                    const ptasks = tasks.filter(t => t.project === pid);
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

            // 8. MESSAGES (using inputsNeeded as proxy)
            const inputs = data.inputsNeeded ? Object.values(data.inputsNeeded) : [];
            set('s-messages-total', inputs.length);
            set('s-messages-helios', inputs.filter(i => i.from === 'Helios' || i.requiredBy === 'Helios').length + ' Helios');
            set('s-messages-system', inputs.filter(i => i.from === 'system').length + ' system');
            set('s-messages-unread', inputs.length + ' unread');
        }

        // ── TICKER ────────────────────────────────────────────────────────
        function updateTicker(data) {
            const el = document.getElementById('ticker-content');
            if (!el) return;
            const tasks = Object.values(data.tasks || {});
            const agents = data.agents || {};
            const today = new Date(); today.setHours(0, 0, 0, 0);

            function fmt(d) {
                if (!d) return '';
                const dd = new Date(d);
                return dd.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
            }
            const parts = [];
            // Completed today
            const doneToday = tasks.filter(t => t.status === 'done' && t.completedAt && (() => {
                const d = new Date(t.completedAt); d.setHours(0,0,0,0); return d.getTime() === today.getTime();
            })());
            if (doneToday.length > 0) {
                doneToday.slice(0, 2).forEach(t => {
                    parts.push(`<span class="ticker-item-done">■ DONE · ${t.id} · ${t.title.slice(0,40)}</span>`);
                });
            }
            // Overdue alerts
            const overdue = tasks.filter(t => t.status !== 'done' && t.deadline && (() => {
                const d = new Date(t.deadline); d.setHours(0,0,0,0); return d < today;
            })()).slice(0, 3);
            overdue.forEach(t => {
                parts.push(`<span class="ticker-item-alert">▲ OVERDUE · ${t.id} · ${t.title.slice(0,35)} · was ${fmt(t.deadline)}</span>`);
            });
            // Upcoming deadlines (next 3 days)
            const threeDays = new Date(today); threeDays.setDate(threeDays.getDate() + 3);
            const upcoming = tasks.filter(t => {
                if (t.status === 'done' || !t.deadline) return false;
                const d = new Date(t.deadline); d.setHours(0,0,0,0);
                return d >= today && d <= threeDays;
            }).slice(0, 3);
            upcoming.forEach(t => {
                parts.push(`<span class="ticker-item-warn">◆ DUE ${fmt(t.deadline)} · ${t.id} · ${t.title.slice(0,35)}</span>`);
            });
            // Active agents
            Object.entries(agents).forEach(([id, a]) => {
                if (a.status === 'active' || a.status === 'working') {
                    const task = a.currentTask ? ` · ${String(a.currentTask).slice(0, 30)}` : '';
                    parts.push(`<span class="ticker-item-done">● ${id.toUpperCase()} ACTIVE${task}</span>`);
                }
            });
            // Blocked
            const blocked = tasks.filter(t => t.status === 'blocked');
            if (blocked.length > 0) {
                parts.push(`<span class="ticker-item-alert">⚑ ${blocked.length} TASK${blocked.length > 1 ? 'S' : ''} BLOCKED · ATTENTION REQUIRED</span>`);
            }

            if (parts.length === 0) {
                parts.push('<span>■ ALL SYSTEMS NOMINAL · NO ALERTS</span>');
            }

            const sep = '&nbsp;&nbsp;<span class="ticker-sep">|</span>&nbsp;&nbsp;';
            // Double the content so loop feels seamless
            const content = parts.join(sep);
            el.innerHTML = content + sep + content;
        }

        // ── DAILY BRIEFING ────────────────────────────────────────────────
        function renderDailyBriefing(data) {
            const container = document.getElementById('daily-briefing-content');
            if (!container) return;
            const el = document.getElementById('briefing-time');
            if (el) el.textContent = new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });

            const tasks = Object.values(data.tasks || {});
            const agents = data.agents || {};
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const lastLogin = localStorage.getItem('rs_last_login') ? new Date(localStorage.getItem('rs_last_login')) : today;
            // Update last login
            localStorage.setItem('rs_last_login', new Date().toISOString());

            function fmt(d) {
                if (!d) return '—';
                return new Date(d).toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
            }

            const sections = [];

            // 1. Completed since last login
            const recentDone = tasks.filter(t => t.status === 'done' && t.completedAt && new Date(t.completedAt) >= lastLogin);
            sections.push({
                title: 'COMPLETED',
                rows: recentDone.length === 0
                    ? [{ cls: '', text: 'Nothing completed since last session' }]
                    : recentDone.slice(0, 4).map(t => ({ cls: 'good', text: `${t.id} · ${t.title}` }))
            });

            // 2. Urgent attention (overdue + blocked)
            const critical = tasks.filter(t => {
                if (t.status === 'done') return false;
                if (t.status === 'blocked') return true;
                if (t.deadline) { const d = new Date(t.deadline); d.setHours(0,0,0,0); return d < today; }
                return false;
            });
            sections.push({
                title: 'URGENT ATTENTION',
                rows: critical.length === 0
                    ? [{ cls: '', text: 'No overdue or blocked tasks — clear' }]
                    : critical.slice(0, 4).map(t => ({
                        cls: 'urgent',
                        text: `${t.status === 'blocked' ? '⚑ BLOCKED' : '▲ OVERDUE'} · ${t.id} · ${t.title.slice(0, 45)}`
                    }))
            });

            // 3. Agents at work
            const activeAgents = Object.entries(agents).filter(([, a]) => a.status === 'active' || a.status === 'working');
            sections.push({
                title: 'AGENTS AT WORK',
                rows: activeAgents.length === 0
                    ? [{ cls: '', text: 'No agents currently active' }]
                    : activeAgents.map(([id, a]) => ({
                        cls: 'good',
                        text: `${id.toUpperCase()} · ${a.currentTask ? String(a.currentTask).slice(0, 40) : 'online'}`
                    }))
            });

            // 4. Suggested priorities (urgency score)
            const scored = tasks
                .filter(t => t.status !== 'done')
                .map(t => {
                    let score = 0;
                    if (t.deadline) {
                        const d = new Date(t.deadline); d.setHours(0,0,0,0);
                        const days = Math.round((d - today) / (1000 * 60 * 60 * 24));
                        if (days < 0) score += Math.abs(days) * 10;
                        else if (days === 0) score += 50;
                        else score += Math.max(0, 20 - days);
                    }
                    if (t.priority === 'critical') score += 40;
                    else if (t.priority === 'high') score += 20;
                    else if (t.priority === 'medium') score += 8;
                    if (t.status === 'blocked') score += 15;
                    return { ...t, _score: score };
                })
                .sort((a, b) => b._score - a._score)
                .slice(0, 4);
            sections.push({
                title: 'SUGGESTED PRIORITIES',
                rows: scored.map(t => ({
                    cls: t.priority === 'critical' ? 'urgent' : (t.priority === 'high' ? 'warn' : ''),
                    text: `${t.id} · ${t.title.slice(0, 45)} · score ${t._score}`
                }))
            });

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
            const today = new Date(); today.setHours(0, 0, 0, 0);

            function isOverdue(d) { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd < today; }
            function isToday(d)   { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd.getTime()===today.getTime(); }
            function dlClass(d)   { return !d ? '' : isOverdue(d) ? 'overdue' : isToday(d) ? 'today' : ''; }
            function fmtDl(d)     { return d ? new Date(d).toLocaleDateString('en-SG', {month:'short',day:'numeric'}) : ''; }

            function buildTaskList(items, limit) {
                if (!items.length) return '<li class="task-item-empty">No items</li>';
                return items.slice(0, limit).map(t => `
                    <li class="task-item priority-${t.priority||'medium'}" onclick="toggleTaskExpand(event,'${t.id}')">
                        <div class="task-item-header">
                            <span class="task-priority-dot"></span>
                            <span class="task-title">${escHtml(t.title)}</span>
                        </div>
                        <div class="task-meta">
                            <span class="task-id">${t.id}</span>
                            ${t.deadline ? `<span class="task-deadline ${dlClass(t.deadline)}">${isOverdue(t.deadline)?'▲ OVERDUE ':''}${fmtDl(t.deadline)}</span>` : ''}
                            ${t.agent ? `<span class="task-agent">${t.agent}</span>` : ''}
                        </div>
                        <div class="task-expand" id="txp-${t.id}">
                            ${t.description ? `<div class="task-expand-field"><span class="task-expand-label">Notes </span>${escHtml(t.description)}</div>` : ''}
                            ${t.notes ? `<div class="task-expand-field"><span class="task-expand-label">Details </span>${escHtml(t.notes)}</div>` : ''}
                            <div class="task-expand-field"><span class="task-expand-label">Status </span>${t.status||'—'} · ${t.priority||'—'} priority</div>
                        </div>
                    </li>
                `).join('');
            }

            // NEEDS REVIEW
            const reviewTasks = tasks.filter(t => t.status === 'review').slice(0, 8);
            const reviewList = document.getElementById('needs-review-list');
            const reviewCount = document.getElementById('review-count');
            if (reviewList) reviewList.innerHTML = buildTaskList(reviewTasks, 6);
            if (reviewCount) reviewCount.textContent = reviewTasks.length;

            // DECISIONS REQUIRED
            const inputs = data.inputsNeeded ? Object.entries(data.inputsNeeded).map(([k, v]) => ({id: k, ...v})) : [];
            const decisionsList = document.getElementById('decisions-list');
            const decisionsCount = document.getElementById('decisions-count');
            if (decisionsList) {
                if (inputs.length === 0) {
                    decisionsList.innerHTML = '<li class="task-item-empty">No pending decisions</li>';
                } else {
                    decisionsList.innerHTML = inputs.slice(0, 6).map(inp => `
                        <li class="task-item priority-high">
                            <div class="task-item-header">
                                <span class="task-priority-dot"></span>
                                <span class="task-title">${escHtml(inp.question || inp.decision || inp.id || 'Decision required')}</span>
                            </div>
                            <div class="task-meta">
                                <span class="task-id">${inp.id}</span>
                                ${inp.requiredBy ? `<span class="task-agent">${inp.requiredBy}</span>` : ''}
                            </div>
                        </li>
                    `).join('');
                }
            }
            if (decisionsCount) decisionsCount.textContent = inputs.length;

            // ACTIVE WORK
            const activeTasks = tasks.filter(t => t.status === 'active').slice(0, 8);
            const activeList = document.getElementById('active-work-list');
            const activeCount = document.getElementById('active-count');
            if (activeList) activeList.innerHTML = buildTaskList(activeTasks, 6);
            if (activeCount) activeCount.textContent = activeTasks.length;

            // RECENTLY COMPLETED (last 5 done tasks)
            const doneTasks = tasks.filter(t => t.status === 'done')
                .sort((a, b) => new Date(b.completedAt||0) - new Date(a.completedAt||0))
                .slice(0, 8);
            const doneList = document.getElementById('recently-done-list');
            const doneCount = document.getElementById('recent-count');
            if (doneList) doneList.innerHTML = buildTaskList(doneTasks, 6);
            if (doneCount) doneCount.textContent = doneTasks.length;

            // AGENT RECOMMENDATIONS (critical/high priority pending tasks not yet started)
            const recs = tasks
                .filter(t => t.status === 'pending' && (t.priority === 'critical' || t.priority === 'high') && !t.agent)
                .slice(0, 8);
            const recsList = document.getElementById('agent-recs-list');
            if (recsList) {
                if (recs.length === 0) {
                    recsList.innerHTML = '<li class="task-item-empty">No unassigned high-priority tasks</li>';
                } else {
                    recsList.innerHTML = buildTaskList(recs, 5);
                }
            }
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

        function renderFocusTasks(data) {
            const tasks = Object.values(data.tasks || {});
            const today = new Date(); today.setHours(0, 0, 0, 0);

            function isOverdue(d) { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd < today; }
            function isToday(d)   { if (!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd.getTime()===today.getTime(); }

            // Score tasks for urgency
            const scored = tasks
                .filter(t => t.status !== 'done')
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

            // Try to restore saved order from localStorage
            const savedOrder = JSON.parse(localStorage.getItem('rs_focus_order') || 'null');
            let ordered = scored;
            if (savedOrder && Array.isArray(savedOrder)) {
                const byId = {};
                scored.forEach(t => byId[t.id] = t);
                const reordered = savedOrder.map(id => byId[id]).filter(Boolean);
                const remaining = scored.filter(t => !savedOrder.includes(t.id));
                ordered = [...reordered, ...remaining];
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

            // Show/hide also-today section
            const alsoSection = document.getElementById('also-today-section');
            if (alsoSection) alsoSection.style.display = also.length > 0 ? 'block' : 'none';
        }

        function buildFocusCard(t, rank) {
            const today = new Date(); today.setHours(0,0,0,0);
            function isOverdue(d) { if(!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd < today; }
            function isToday(d)   { if(!d) return false; const dd=new Date(d); dd.setHours(0,0,0,0); return dd.getTime()===today.getTime(); }
            function fmtDl(d)     { return d ? new Date(d).toLocaleDateString('en-SG', {month:'short',day:'numeric'}) : ''; }
            const dlCls = !t.deadline ? '' : isOverdue(t.deadline) ? 'overdue' : isToday(t.deadline) ? 'today' : '';
            const dlPrefix = isOverdue(t.deadline) ? '▲ OVERDUE · ' : isToday(t.deadline) ? 'TODAY · ' : '';

            return `<div class="focus-task-card priority-${t.priority||'medium'}"
                         id="ftask-${t.id}"
                         draggable="true"
                         data-task-id="${t.id}"
                         ondragstart="focusDragStart(event)"
                         ondragover="focusDragOver(event)"
                         ondrop="focusDrop(event)"
                         onclick="toggleFocusExpand(event,'${t.id}')">
                <span class="focus-rank">#${rank}</span>
                <div class="focus-task-title">${escHtml(t.title)}</div>
                <div class="focus-task-meta">
                    <span class="focus-task-id">${t.id}</span>
                    <span class="focus-priority-tag focus-priority-${t.priority||'medium'}">${(t.priority||'med').toUpperCase()}</span>
                    ${t.deadline ? `<span class="focus-deadline ${dlCls}">${dlPrefix}${fmtDl(t.deadline)}</span>` : ''}
                </div>
                <div class="focus-task-expand" id="fexp-${t.id}">
                    ${t.description ? `<div class="focus-expand-row"><span>Notes</span>${escHtml(t.description)}</div>` : ''}
                    ${t.notes ? `<div class="focus-expand-row"><span>Details</span>${escHtml(t.notes.slice(0,120))}</div>` : ''}
                    <div class="focus-expand-row"><span>Status</span>${t.status||'pending'} · ${t.project||'—'}</div>
                    ${t.agent ? `<div class="focus-expand-row"><span>Agent</span>${t.agent}</div>` : ''}
                    <div class="focus-task-actions">
                        <button class="focus-action-btn done-btn" onclick="markFocusDoneNew(event,'${t.id}')">✓ MARK DONE</button>
                        <button class="focus-action-btn" onclick="assignFocusTask('${t.id}')">ASSIGN</button>
                    </div>
                </div>
            </div>`;
        }

        function toggleFocusExpand(event, taskId) {
            // Don't fire if clicking buttons inside
            if (event.target.closest('.focus-action-btn')) return;
            event.stopPropagation();
            const el = document.getElementById('fexp-' + taskId);
            if (el) el.classList.toggle('open');
        }

        function markFocusDoneNew(event, taskId) {
            event.stopPropagation();
            const card = document.getElementById('ftask-' + taskId);
            if (card) {
                card.style.opacity = '0.35';
                card.style.textDecoration = 'line-through';
                setTimeout(() => { if (card) card.remove(); }, 800);
            }
            console.log('[Focus] Marked done:', taskId);
            // TODO: POST to backend when API available
        }

        function toggleAlsoToday() {
            const content = document.getElementById('also-content');
            const chevron = document.getElementById('also-chevron');
            if (!content) return;
            const isOpen = content.style.display !== 'none';
            content.style.display = isOpen ? 'none' : 'flex';
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
            const today = new Date();
            const todayStr = today.toISOString().slice(0, 10);

            // Calculate Monday of current week + offset
            const dow = today.getDay(); // 0=Sun
            const diffToMon = dow === 0 ? -6 : 1 - dow;
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() + diffToMon + _weekOffset * 7);
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            // Update range label
            const rangeLbl = document.getElementById('week-range-label');
            function fmtShort(d) { return d.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' }); }
            if (rangeLbl) rangeLbl.textContent = fmtShort(weekStart) + ' – ' + fmtShort(weekEnd);

            const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
            const grid = document.getElementById('week-grid');
            if (!grid) return;

            const cols = DAYS.map((dayName, idx) => {
                const colDate = new Date(weekStart);
                colDate.setDate(weekStart.getDate() + idx);
                const colStr = colDate.toISOString().slice(0, 10);
                const isToday = colStr === todayStr;

                // Tasks due on this day
                const dayTasks = tasks.filter(t => t.deadline && t.deadline.slice(0, 10) === colStr);
                // Also tasks that are overdue and this is the first day of week
                const overdueOnFirstDay = idx === 0 ? tasks.filter(t => {
                    if (t.status === 'done' || !t.deadline) return false;
                    const d = new Date(t.deadline); d.setHours(0,0,0,0);
                    return d < weekStart;
                }) : [];

                function chipClass(t) {
                    if (t.status === 'done') return 'week-chip-done';
                    const d = new Date(t.deadline||''); d.setHours(0,0,0,0);
                    const now = new Date(); now.setHours(0,0,0,0);
                    if (d < now) return 'week-chip-overdue';
                    if (t.priority === 'critical') return 'week-chip-critical';
                    if (t.priority === 'high') return 'week-chip-high';
                    if (t.priority === 'medium') return 'week-chip-medium';
                    return 'week-chip-low';
                }
                function overdueChip(t) {
                    return `<span class="week-task-chip week-chip-overdue" title="${escHtml(t.title)}">${escHtml(t.id)} ${escHtml(t.title.slice(0,18))}</span>`;
                }

                const SHOW_LIMIT = 3;
                const allChips = [
                    ...overdueOnFirstDay.map(overdueChip),
                    ...dayTasks.map(t =>
                        `<span class="week-task-chip ${chipClass(t)}" title="${escHtml(t.title)}"
                               onclick="toggleTaskExpand(event,'${t.id}')">${escHtml(t.id)} ${escHtml(t.title.slice(0,18))}</span>`
                    )
                ];
                const visible = allChips.slice(0, SHOW_LIMIT).join('');
                const moreCount = allChips.length - SHOW_LIMIT;
                const moreBtn = moreCount > 0
                    ? `<button class="week-more-btn" onclick="expandWeekDay(this)">[+${moreCount} more]</button>
                       <div class="week-extra" style="display:none">${allChips.slice(SHOW_LIMIT).join('')}</div>`
                    : '';

                return `<div class="week-day-col${isToday ? ' today-col' : ''}">
                    <div class="week-day-header">
                        <span class="week-day-name">${dayName}</span>
                        <span class="week-day-num">${colDate.getDate()}</span>
                    </div>
                    ${visible}${moreBtn}
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
            setStatus('ws-status', wsOk ? 'CONNECTED' : 'POLLING', wsOk ? 'ok' : 'warn');
            setStatus('data-status', window.appData ? 'LIVE' : '—', window.appData ? 'ok' : '');
            setStatus('last-sync', new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            // Helios check (fire-and-forget)
            fetch('data.json?ping=1', { method: 'HEAD' })
                .then(() => setStatus('helios-status', 'REACHABLE', 'ok'))
                .catch(() => setStatus('helios-status', 'UNREACHABLE', 'error'));
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

'''

# Now write the Python replacement script
with open('/home/chad-yi/.openclaw/workspace/mission-control-dashboard/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace the old renderNewHomepage function
OLD_RENDER = '''        function renderNewHomepage(data) {
            // Call new homepage renderer
            renderRedSunStats(data);
            renderAlertQueue(data);
            renderWorkflowStatus(data);
            renderTodaysFocus(window._focusFilter || 'urgent');
            renderDecisionsRequired(data);
            renderRecentlyCompleted(data);
            renderAgentAssignments(data);
            renderBacklogSpotlight(data);
            renderSystemComms();
            renderWeekView(data);
            // legacy compat — keep old agent-activity container populated in case other code refs it
            renderAgentActivity(data);
        }'''

# Find and replace
if OLD_RENDER in html:
    html = html.replace(OLD_RENDER, NEW_RENDER_NEW_HOMEPAGE + NEW_RENDER_FUNCTIONS, 1)
    print("✓ renderNewHomepage replaced and new functions inserted")
else:
    print("ERROR: Old renderNewHomepage not found — trying fuzzy match")
    # Try a shorter match
    import re
    m = re.search(r'function renderNewHomepage\(data\) \{[^}]+\}', html, re.DOTALL)
    if m:
        print(f"  Found at pos {m.start()}-{m.end()}")
        html = html[:m.start()] + NEW_RENDER_NEW_HOMEPAGE + NEW_RENDER_FUNCTIONS + html[m.end():]
        print("✓ Replaced via fuzzy match")
    else:
        print("  Not found")

# Also expose appData globally (it's currently a local var named appData)
# Find where appData is declared and ensure it's window-accessible in loadData
if "window.appData = appData;" not in html:
    # After renderHomeSection() is called in loadData, set window.appData
    OLD_RENDER_CALL = "                renderHomeSection();"
    NEW_RENDER_CALL = "                window.appData = appData;\n                renderHomeSection();"
    if OLD_RENDER_CALL in html:
        html = html.replace(OLD_RENDER_CALL, NEW_RENDER_CALL, 1)
        print("✓ Added window.appData = appData before renderHomeSection()")
    else:
        print("WARN: Could not add window.appData assignment")

with open('/home/chad-yi/.openclaw/workspace/mission-control-dashboard/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("✓ JS functions inserted into index.html")
import subprocess
result = subprocess.run(['wc', '-l', '/home/chad-yi/.openclaw/workspace/mission-control-dashboard/index.html'], capture_output=True, text=True)
print(f"Line count: {result.stdout.strip()}")
