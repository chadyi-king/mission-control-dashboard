(() => {
  'use strict';

  const DATA_SOURCE_BUILD_ID = '20260625-here-now-1';
  const DATA_URL = 'data.json';

  window.__DASHBOARD_DATA_SOURCE__ = {
    buildId: DATA_SOURCE_BUILD_ID,
    mode: 'direct-local',
    url: DATA_URL
  };

  async function loadDashboardData() {
    try {
      const url = new URL(DATA_URL, window.location.href);
      url.searchParams.set('t', String(Date.now()));
      
      const response = await fetch(url.toString(), {
        cache: 'no-store'
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      window.__DASHBOARD_DATA__ = data;
      window.dispatchEvent(new CustomEvent('dashboardDataLoaded', { detail: data }));
      
      return data;
    } catch (error) {
      console.error('[Dashboard Data] Failed to load:', error);
      window.dispatchEvent(new CustomEvent('dashboardDataError', { detail: error }));
      throw error;
    }
  }

  // Auto-load when script runs
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDashboardData);
  } else {
    loadDashboardData();
  }

  // Expose for manual refresh
  window.refreshDashboardData = loadDashboardData;
})();
