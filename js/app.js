/* ════════════════════════════════════════════════════════════════════════
   RED SUN COMMAND — App Controller  (js/app.js)
   Main init, smart polling, starfield, update indicator.
   ════════════════════════════════════════════════════════════════════════ */

const App = (function () {

  let appData = null;
  let pollTimer = null;
  let dataHash = '';
  const POLL_INTERVAL = 30000; // 30 seconds

  /* ── Init ──────────────────────────────────────────────────────────── */
  async function init() {
    initStarfield();
    TaskModal.init();
    showUpdate('loading');

    try {
      appData = await DashData.fetch();
      dataHash = hashData(appData);
      TaskModal.setData(appData);
      Renderer.renderAll(appData);
      showUpdate('success');
    } catch (err) {
      console.error('[App] Initial load failed:', err);
      showUpdate('error');
    }

    startPolling();
  }

  /* ── Polling ───────────────────────────────────────────────────────── */
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(poll, POLL_INTERVAL);
  }

  async function poll() {
    try {
      const newData = await DashData.fetch();
      const newHash = hashData(newData);
      if (newHash !== dataHash) {
        appData = newData;
        dataHash = newHash;
        TaskModal.setData(appData);
        Renderer.renderAll(appData);
        showUpdate('success');
      }
    } catch (err) {
      console.error('[App] Poll failed:', err);
    }
  }

  async function refresh() {
    try {
      appData = await DashData.fetch();
      dataHash = hashData(appData);
      TaskModal.setData(appData);
      Renderer.renderAll(appData);
      showUpdate('success');
    } catch (err) {
      console.error('[App] Refresh failed:', err);
    }
  }

  function hashData(data) {
    // Quick hash: use lastUpdated + task count + completion count
    const s = (data.lastUpdated || '') + ':' +
              (data.tasks?.length || 0) + ':' +
              (data.stats?.completedTasks || 0) + ':' +
              (data.audit?.integrity || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  /* ── Update Indicator ──────────────────────────────────────────────── */
  function showUpdate(type) {
    const el = document.getElementById('update-indicator');
    if (!el) return;

    el.classList.remove('visible', 'success');

    if (type === 'loading') {
      el.querySelector('.update-text').textContent = 'LOADING';
      el.classList.add('visible');
    } else if (type === 'success') {
      el.querySelector('.update-text').textContent = 'SYNCED';
      el.classList.add('visible', 'success');
      setTimeout(() => el.classList.remove('visible'), 3000);
    } else if (type === 'error') {
      el.querySelector('.update-text').textContent = 'OFFLINE';
      el.classList.add('visible');
    }
  }

  /* ── Starfield ─────────────────────────────────────────────────────── */
  function initStarfield() {
    const canvas = document.getElementById('starfield-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let stars = [];
    const STAR_COUNT = 200;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      createStars();
    }

    function createStars() {
      stars = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.2 + 0.3,
          a: Math.random() * 0.6 + 0.2,
          speed: Math.random() * 0.3 + 0.05
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Red sun glow (top-right)
      const grd = ctx.createRadialGradient(
        canvas.width * 0.85, canvas.height * 0.15, 0,
        canvas.width * 0.85, canvas.height * 0.15, canvas.width * 0.5
      );
      grd.addColorStop(0, 'rgba(220,20,60,0.08)');
      grd.addColorStop(0.5, 'rgba(220,20,60,0.02)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars
      for (const s of stars) {
        s.a += Math.sin(Date.now() * 0.001 * s.speed) * 0.005;
        const alpha = Math.max(0.1, Math.min(0.8, s.a));

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }

      requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    resize();
    draw();
  }

  return { init, refresh, poll };
})();

window.App = App;

/* ── Bootstrap ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.init());
