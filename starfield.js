(function() {
    'use strict';

    var DASHBOARD_BUILD_ID = '20260621-0200-cache-data-fix';
    var DASHBOARD_CACHE_KEY = 'rs_dashboard_cache';
    var DASHBOARD_BUILD_KEY = 'rs_dashboard_build_id';
    var RAW_DATA_URL = 'https://raw.githubusercontent.com/chadyi-king/mission-control-dashboard/main/data.json';

    window.DASHBOARD_BUILD_ID = DASHBOARD_BUILD_ID;

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

    function projectIdFromTask(task, fallbackId) {
        var raw = '';
        if (task && task.project) raw = String(task.project);
        if (!raw && fallbackId) raw = String(fallbackId);
        var match = raw.trim().match(/^([ABC]\d+)/i);
        return match ? match[1].toUpperCase() : '';
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
            if (!task || task.status === 'removed') return;
            var projectId = projectIdFromTask(task, taskId);
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
        appData = ensureProjectRoster(data);
        allProjects = buildProjectsFromData(appData);
        syncProjectLookup();
        window.appData = appData;

        renderHomeSection();
        renderCategoriesSection();
        renderResourcesSection();
        updateSidebarAgents(appData);
        if (typeof updateFleetPanel === 'function') updateFleetPanel(appData);
        setLoadingState(false, false);
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

    function installFreshDataLoader() {
        if (typeof normalizeDashboardData !== 'function' || typeof buildProjectsFromData !== 'function') {
            console.warn('[Dashboard] Cache/data patch loaded before dashboard-app.js; using existing loader.');
            return;
        }

        installProjectRosterRepair();

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
    installFreshDataLoader();
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
            // Slow drift upward (hyperspace feel)
            s.y -= s.speed;
            if (s.y < -5) {
                s.y = canvas.height + 5;
                s.x = Math.random() * canvas.width;
            }

            // Twinkle
            const twinkle = Math.sin(frame * s.twinkleSpeed + s.twinklePhase) * 0.3 + 0.7;
            const alpha = s.opacity * twinkle;

            // Red-tinted stars (some white, some reddish)
            const r = 255;
            const g = 200 + Math.floor(Math.random() * 55);
            const b = 200 + Math.floor(Math.random() * 55);

            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fill();

            // Glow for larger stars
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
