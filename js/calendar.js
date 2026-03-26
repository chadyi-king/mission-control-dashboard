/* ════════════════════════════════════════════════════════════════════════
   RED SUN COMMAND — Calendar View  (js/calendar.js)
   Week-at-a-glance with task chips, deadline tracking, week navigation.
   ════════════════════════════════════════════════════════════════════════ */

const CalendarView = (function () {
  let weekOffset = 0;
  let currentData = null;

  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MAX_CHIPS = 4;

  function getWeekDays(offset) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (offset * 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function isToday(d) {
    return isSameDay(d, new Date());
  }

  function getTasksForDay(data, day) {
    const dateStr = day.toISOString().slice(0, 10);
    return (data.tasks || []).filter(t => {
      if (!t.deadline) return false;
      return t.deadline.slice(0, 10) === dateStr;
    });
  }

  function chipClass(task) {
    if (task.status === 'done') return 'done';
    if (task.status === 'blocked') return 'blocked';

    const now = new Date();
    if (task.deadline && new Date(task.deadline) < now && task.status !== 'done') return 'overdue';

    return DashData.priorityClass(task.priority);
  }

  function render(data) {
    currentData = data;
    const container = document.getElementById('calendar-grid');
    const rangeLabel = document.getElementById('calendar-range');
    if (!container) return;

    container.innerHTML = '';

    const days = getWeekDays(weekOffset);
    const startDate = days[0];
    const endDate = days[6];

    if (rangeLabel) {
      rangeLabel.textContent =
        `${MONTH_NAMES[startDate.getMonth()]} ${startDate.getDate()} – ${MONTH_NAMES[endDate.getMonth()]} ${endDate.getDate()}, ${endDate.getFullYear()}`;
    }

    for (const day of days) {
      const tasks = getTasksForDay(data, day);
      const today = isToday(day);

      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day' + (today ? ' is-today' : '');

      const header = document.createElement('div');
      header.className = 'calendar-day-header';
      header.innerHTML =
        `<span class="calendar-day-name">${DAY_NAMES[day.getDay()]}</span>` +
        `<span class="calendar-day-num">${day.getDate()}</span>`;
      dayEl.appendChild(header);

      // Task chips
      const shown = tasks.slice(0, MAX_CHIPS);
      for (const task of shown) {
        const chip = document.createElement('div');
        chip.className = 'calendar-chip ' + chipClass(task);
        chip.textContent = task.id + ' ' + (task.title || '').slice(0, 20);
        chip.title = task.title || task.id;
        chip.onclick = () => window.TaskModal?.open(task.id);
        dayEl.appendChild(chip);
      }

      if (tasks.length > MAX_CHIPS) {
        const more = document.createElement('div');
        more.className = 'calendar-more';
        more.textContent = `+${tasks.length - MAX_CHIPS} more`;
        dayEl.appendChild(more);
      }

      container.appendChild(dayEl);
    }
  }

  function prevWeek() {
    weekOffset--;
    if (currentData) render(currentData);
  }

  function nextWeek() {
    weekOffset++;
    if (currentData) render(currentData);
  }

  function goToday() {
    weekOffset = 0;
    if (currentData) render(currentData);
  }

  return { render, prevWeek, nextWeek, goToday };
})();

window.CalendarView = CalendarView;
