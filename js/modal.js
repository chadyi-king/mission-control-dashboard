/* ════════════════════════════════════════════════════════════════════════
   RED SUN COMMAND — Task Modal  (js/modal.js)
   Unified task detail modal — opens from any task click anywhere.
   Shows: title, project, category, status, priority, agent, deadline,
   description, subtasks.
   ════════════════════════════════════════════════════════════════════════ */

const TaskModal = (function () {
  let overlayEl = null;
  let currentData = null;

  function init() {
    overlayEl = document.getElementById('task-modal-overlay');
    if (!overlayEl) return;

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    const closeBtn = overlayEl.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
  }

  function setData(data) {
    currentData = data;
  }

  function open(taskId) {
    if (!overlayEl || !currentData) return;
    const task = DashData.getTaskById(currentData, taskId);
    if (!task) return;

    const modal = overlayEl.querySelector('.modal');
    if (!modal) return;

    // Build content
    const details = (currentData.projectDetails || {})[task.project] || {};
    const catLetter = task.project ? task.project.charAt(0) : '?';
    const catInfo = (currentData.categories || {})[catLetter] || {};

    modal.innerHTML = `
      <button class="modal-close" aria-label="Close">✕</button>
      <div class="modal-header">
        <div class="modal-task-id">${esc(task.id)}</div>
        <div class="modal-task-title">${esc(task.title)}</div>
      </div>
      <div class="modal-meta-grid">
        <div class="modal-meta-item">
          <span class="modal-meta-label">Project</span>
          <span class="modal-meta-value">${esc(details.name || task.project || '—')}</span>
        </div>
        <div class="modal-meta-item">
          <span class="modal-meta-label">Category</span>
          <span class="modal-meta-value">${esc(catInfo.name || catLetter)}</span>
        </div>
        <div class="modal-meta-item">
          <span class="modal-meta-label">Status</span>
          <span class="modal-meta-value"><span class="task-status-badge ${DashData.statusClass(task.status)}">${(DashData.STATUS_LABELS[task.status] || task.status || '—').toUpperCase()}</span></span>
        </div>
        <div class="modal-meta-item">
          <span class="modal-meta-label">Priority</span>
          <span class="modal-meta-value"><span class="task-priority-dot ${DashData.priorityClass(task.priority)}" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>${DashData.PRIORITY_LABELS[task.priority] || task.priority || '—'}</span>
        </div>
        <div class="modal-meta-item">
          <span class="modal-meta-label">Assigned Agent</span>
          <span class="modal-meta-value">${esc(task.agent || '—')}</span>
        </div>
        <div class="modal-meta-item">
          <span class="modal-meta-label">Deadline</span>
          <span class="modal-meta-value">${task.deadline ? formatDate(task.deadline) : '—'}</span>
        </div>
        ${task.completedDate ? `
        <div class="modal-meta-item">
          <span class="modal-meta-label">Completed</span>
          <span class="modal-meta-value">${formatDate(task.completedDate)}</span>
        </div>` : ''}
      </div>
      ${task.description ? `
      <div class="modal-section">
        <div class="modal-section-title">Description</div>
        <div class="modal-description">${esc(task.description)}</div>
      </div>` : ''}
      ${task.subtasks?.length ? `
      <div class="modal-section">
        <div class="modal-section-title">Subtasks</div>
        <ul class="task-list">
          ${task.subtasks.map(st => `
            <li class="task-item" style="cursor:default">
              <span class="task-priority-dot ${st.done ? 'done' : 'medium'}"></span>
              <div class="task-info">
                <div class="task-title" style="${st.done ? 'text-decoration:line-through;opacity:0.6' : ''}">${esc(st.title || st)}</div>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>` : ''}
      ${task.status !== 'done' ? `
      <div style="margin-top:20px;text-align:right">
        <button id="modal-mark-done-btn" style="
          background:var(--status-done);color:#000;border:none;padding:8px 20px;
          border-radius:var(--radius-sm);font-weight:600;font-size:12px;cursor:pointer;
          text-transform:uppercase;letter-spacing:1px;
        ">Mark Done</button>
      </div>` : ''}
    `;

    // Re-attach close handler
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Mark done handler
    const doneBtn = modal.querySelector('#modal-mark-done-btn');
    if (doneBtn) {
      doneBtn.addEventListener('click', async () => {
        doneBtn.disabled = true;
        doneBtn.textContent = 'Saving...';
        try {
          await DashData.commitTaskDone(task.id);
          doneBtn.textContent = 'Done ✓';
          doneBtn.style.opacity = '0.6';
          // Refresh data after a short delay
          setTimeout(() => window.App?.refresh(), 1500);
        } catch (err) {
          doneBtn.textContent = 'Error: ' + err.message;
          doneBtn.style.background = 'var(--status-blocked)';
          doneBtn.style.color = '#fff';
          setTimeout(() => {
            doneBtn.textContent = 'Mark Done';
            doneBtn.style.background = 'var(--status-done)';
            doneBtn.style.color = '#000';
            doneBtn.disabled = false;
          }, 3000);
        }
      });
    }

    overlayEl.classList.add('open');
  }

  function close() {
    if (overlayEl) overlayEl.classList.remove('open');
  }

  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return { init, setData, open, close };
})();

window.TaskModal = TaskModal;
