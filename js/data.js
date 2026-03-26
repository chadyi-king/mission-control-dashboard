/* ════════════════════════════════════════════════════════════════════════
   RED SUN COMMAND — Data Layer  (js/data.js)
   Handles: loading data.json from GitHub, normalization, schema defaults,
   task lookups, filtering, and write-back via GitHub API.
   ════════════════════════════════════════════════════════════════════════ */

const DATA_URL =
  'https://raw.githubusercontent.com/chadyi-king/mission-control-dashboard/main/data.json';

const GITHUB_API =
  'https://api.github.com/repos/chadyi-king/mission-control-dashboard/contents/data.json';

/* ── Default Structures ──────────────────────────────────────────────── */
const DEFAULT_AGENT = {
  name: '', role: '', status: 'offline', lastActive: null, currentTask: null
};

const DEFAULT_STATS = {
  totalTasks: 0, completedTasks: 0, activeTasks: 0,
  blockedTasks: 0, urgentTasks: 0, backlogTasks: 0
};

const DEFAULT_DATA = {
  version: '3.0.0',
  lastUpdated: null,
  updatedBy: 'unknown',
  stats: { ...DEFAULT_STATS },
  completions: { dates: [], counts: [] },
  weeklyProgress: { sessions: 0, minutesWorked: 0, tasksCompleted: 0, avgPerDay: 0 },
  workflow: { done: 0, active: 0, blocked: 0, backlog: 0 },
  tasks: [],
  recentWins: [],
  agents: {},
  categories: {},
  projects: [],
  projectDetails: {},
  needsAttention: [],
  inputsNeeded: [],
  dailyBriefing: {},
  audit: { integrity: 'unknown', timestamp: null }
};

/* ── Normalization ───────────────────────────────────────────────────── */
function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_DATA);

  const d = {};
  for (const key of Object.keys(DEFAULT_DATA)) {
    d[key] = raw[key] !== undefined ? raw[key] : structuredClone(DEFAULT_DATA[key]);
  }

  // Ensure tasks is an array
  if (!Array.isArray(d.tasks)) d.tasks = [];

  // Filter out garbage task ids
  d.tasks = d.tasks.filter(t => t && t.id && /^[ABC]\d+-\d+$/.test(t.id));

  // Ensure agents is an object with proper shape
  if (typeof d.agents !== 'object' || Array.isArray(d.agents)) d.agents = {};
  for (const [k, v] of Object.entries(d.agents)) {
    d.agents[k] = { ...DEFAULT_AGENT, ...v, name: v.name || k };
  }

  // Ensure categories is an object
  if (typeof d.categories !== 'object' || Array.isArray(d.categories)) d.categories = {};

  // Ensure projects is an array
  if (!Array.isArray(d.projects)) d.projects = [];

  // Recompute stats from tasks (source of truth)
  d.stats = computeStats(d.tasks);
  d.workflow = {
    done: d.tasks.filter(t => t.status === 'done').length,
    active: d.tasks.filter(t => t.status === 'active').length,
    blocked: d.tasks.filter(t => t.status === 'blocked').length,
    backlog: d.tasks.filter(t => t.status === 'backlog' || t.status === 'pending').length
  };

  return d;
}

function computeStats(tasks) {
  return {
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'done').length,
    activeTasks: tasks.filter(t => t.status === 'active').length,
    blockedTasks: tasks.filter(t => t.status === 'blocked').length,
    urgentTasks: tasks.filter(t => t.priority === 'critical' || t.priority === 'high').length,
    backlogTasks: tasks.filter(t => t.status === 'backlog' || t.status === 'pending').length
  };
}

/* ── Fetch ────────────────────────────────────────────────────────────── */
async function fetchDashboardData() {
  const url = DATA_URL + '?t=' + Date.now();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const raw = await resp.json();
  return normalizeData(raw);
}

/* ── Task Helpers ────────────────────────────────────────────────────── */
function getTaskById(data, id) {
  return data.tasks.find(t => t.id === id) || null;
}

function getProjectTasks(data, projectId) {
  return data.tasks.filter(t => t.project === projectId);
}

function getAgentTasks(data, agentName) {
  return data.tasks.filter(t => t.agent === agentName);
}

function getUrgentTasks(data) {
  return data.tasks.filter(t =>
    (t.priority === 'critical' || t.priority === 'high') && t.status !== 'done'
  );
}

function getActiveTasks(data) {
  return data.tasks.filter(t => t.status === 'active');
}

function getBlockedTasks(data) {
  return data.tasks.filter(t => t.status === 'blocked');
}

function getRecentlyDone(data, limit = 5) {
  return data.tasks
    .filter(t => t.status === 'done')
    .sort((a, b) => new Date(b.completedDate || 0) - new Date(a.completedDate || 0))
    .slice(0, limit);
}

function getOverdueTasks(data) {
  const now = new Date();
  return data.tasks.filter(t => {
    if (t.status === 'done' || !t.deadline) return false;
    return new Date(t.deadline) < now;
  });
}

function getTasksDueThisWeek(data) {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);
  return data.tasks.filter(t => {
    if (!t.deadline || t.status === 'done') return false;
    const d = new Date(t.deadline);
    return d >= now && d <= endOfWeek;
  });
}

function getCategoryProjects(data, catLetter) {
  return data.projects.filter(p => p.id && p.id.startsWith(catLetter));
}

/* ── Priority / Status Display ───────────────────────────────────────── */
const PRIORITY_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_LABELS = { active: 'Active', blocked: 'Blocked', backlog: 'Backlog', pending: 'Pending', done: 'Done', review: 'Review' };

function priorityClass(priority) {
  return ({ critical: 'critical', high: 'high', medium: 'medium', low: 'low' })[priority] || 'low';
}

function statusClass(status) {
  return ({ active: 'active', blocked: 'blocked', done: 'done', backlog: 'backlog', pending: 'pending', review: 'review' })[status] || 'pending';
}

/* ── Write-back: Mark Task Done via GitHub API ───────────────────────── */
async function commitTaskDone(taskId) {
  const pat = localStorage.getItem('gh_pat');
  if (!pat) throw new Error('No GitHub PAT in localStorage. Set with: localStorage.setItem("gh_pat","ghp_...")');

  // Fetch current file
  const getResp = await fetch(GITHUB_API, {
    headers: { Authorization: 'token ' + pat, Accept: 'application/vnd.github.v3+json' }
  });
  if (!getResp.ok) throw new Error('Failed to fetch data.json from API');
  const fileInfo = await getResp.json();

  const content = JSON.parse(atob(fileInfo.content));
  const task = content.tasks?.find(t => t.id === taskId);
  if (!task) throw new Error('Task not found: ' + taskId);

  task.status = 'done';
  task.completedDate = new Date().toISOString().slice(0, 10);

  // Recompute stats
  if (content.stats) {
    content.stats = computeStats(content.tasks);
  }

  const updated = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  const putResp = await fetch(GITHUB_API, {
    method: 'PUT',
    headers: { Authorization: 'token ' + pat, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `[dashboard] Mark ${taskId} done`,
      content: updated,
      sha: fileInfo.sha
    })
  });

  if (!putResp.ok) throw new Error('Failed to commit: ' + (await putResp.text()));
  return true;
}

/* ── Export ───────────────────────────────────────────────────────────── */
window.DashData = {
  fetch: fetchDashboardData,
  normalize: normalizeData,
  getTaskById, getProjectTasks, getAgentTasks,
  getUrgentTasks, getActiveTasks, getBlockedTasks,
  getRecentlyDone, getOverdueTasks, getTasksDueThisWeek,
  getCategoryProjects, computeStats,
  priorityClass, statusClass,
  PRIORITY_LABELS, STATUS_LABELS,
  commitTaskDone
};
