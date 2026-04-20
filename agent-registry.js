/**
 * agent-registry.js — Loads agent-registry.json and provides all agent
 * lookup helpers.  Every sidebar / ticker / stats / health function reads
 * from this instead of hardcoded objects.
 *
 * Exposes on window:
 *   AgentRegistry          – the loaded JSON (or null until ready)
 *   getAgentConfig(id)     – returns { displayName, initials, colors, ... }
 *   getFleetIds()          – ordered array of fleet agent IDs
 *   getHealthPriority()    – ordered array for system-health sorting
 *   isAgentExcluded(id)    – true if the agent is hidden from UI
 *   formatAgentDisplay(id) – display name from registry
 *   normalizeAgentId(raw)  – lowercase, dash-separated
 *   getAgentSignalMeta(id, data) – online/offline/blocked signal object
 */
(function (global) {
    'use strict';

    /* ── Registry state ─────────────────────────────────────────────── */
    let _registry = null;
    let _fleetIds = [];
    let _healthPriority = [];
    let _configCache = {};

    /* ── Defaults (used before JSON loads or for unknown agents) ───── */
    const _defaultColors = {
        bg:     'rgba(100,100,100,0.18)',
        border: 'rgba(100,100,100,0.3)',
        text:   '#888'
    };

    /* ── Load registry JSON ─────────────────────────────────────────── */
    function _loadRegistry() {
        // Synchronous fetch (blocking) during page load so every
        // downstream function has the data immediately.  The file is
        // tiny (<2 KB) and served from the same origin.
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'agent-registry.json?v=' + Date.now(), false);   // sync
            xhr.send(null);
            if (xhr.status === 200) {
                _registry = JSON.parse(xhr.responseText);
            } else {
                console.warn('[AgentRegistry] Failed to load agent-registry.json (' + xhr.status + '), using built-in defaults.');
                _registry = _builtinDefaults();
            }
        } catch (e) {
            console.warn('[AgentRegistry] XHR error, using built-in defaults:', e);
            _registry = _builtinDefaults();
        }

        // Build derived caches
        var agents = _registry.agents || {};
        _fleetIds = Object.keys(agents)
            .filter(function (id) { return agents[id].fleet !== false && !agents[id].excluded; })
            .sort(function (a, b) { return (agents[a].priority || 99) - (agents[b].priority || 99); });

        _healthPriority = _registry.healthPriority || ['chad-yi', 'cerebronn', 'helios'];

        _configCache = {};
        for (var id in agents) {
            if (agents.hasOwnProperty(id)) {
                _configCache[id] = agents[id];
            }
        }

        global.AgentRegistry = _registry;
    }

    /* ── Built-in fallback (mirrors registry.json) ──────────────────── */
    function _builtinDefaults() {
        return {
            agents: {
                'chad-yi':   { displayName:'Chad Yi',    initials:'CY', colors:{ bg:'rgba(255,140,0,0.18)',  border:'rgba(255,140,0,0.4)',   text:'#ff8c00' }, priority:1, fleet:true,  excluded:false, requirements:'Needs OpenClaw + Telegram to count as truly active; dashboard can only verify local presence.' },
                'helios':    { displayName:'Helios',     initials:'HE', colors:{ bg:'rgba(220,38,38,0.18)',  border:'rgba(220,38,38,0.4)',   text:'#e04040' }, priority:2, fleet:true,  excluded:false, requirements:'Needs audit/update/reporting activity to count as active; dashboard checks latest sync.' },
                'cerebronn': { displayName:'Cerebronn',  initials:'CB', colors:{ bg:'rgba(100,100,230,0.18)',border:'rgba(100,100,230,0.35)',text:'#9090ee' }, priority:3, fleet:true,  excluded:false, requirements:'Needs live planning/infrastructure use to count as active; dashboard only sees recent heartbeat.' },
                'quanta':    { displayName:'Quanta',     initials:'QT', colors:{ bg:'rgba(64,145,108,0.18)', border:'rgba(64,145,108,0.35)', text:'#77d8a8' }, priority:4, fleet:true,  excluded:false, requirements:'Needs Telegram-monitoring signal to count as active; dashboard only sees recent heartbeat.' },
                'escritor':  { displayName:'Escritor',   initials:'ES', colors:{ bg:'rgba(180,120,60,0.18)', border:'rgba(180,120,60,0.35)', text:'#d4a040' }, priority:5, fleet:true,  excluded:false },
                'forger':    { displayName:'Forger',     initials:'FG', colors:{ bg:'rgba(160,60,180,0.18)', border:'rgba(160,60,180,0.35)', text:'#c070d0' }, priority:6, fleet:true,  excluded:false },
                'autour':    { displayName:'Autour',     initials:'AU', colors:{ bg:'rgba(200,80,80,0.18)',  border:'rgba(200,80,80,0.35)',  text:'#e06060' }, priority:7, fleet:true,  excluded:false },
                'mensamusa': { displayName:'Mensamusa',  initials:'MM', colors:{ bg:'rgba(120,120,120,0.18)',border:'rgba(120,120,120,0.35)',text:'#aaa'    }, priority:8, fleet:true,  excluded:false },
                'tele':      { displayName:'Tele',       initials:'TL', colors:{ bg:'rgba(80,80,80,0.18)',   border:'rgba(80,80,80,0.35)',   text:'#666'    }, priority:99,fleet:false, excluded:true  },
                'clair':     { displayName:'Clair',      initials:'CL', colors:{ bg:'rgba(80,150,200,0.12)', border:'rgba(80,150,200,0.25)', text:'#6a9cc0' }, priority:9, fleet:true,  excluded:false },
                'eplusplus': { displayName:'E++',        initials:'E+', colors:{ bg:'rgba(100,100,100,0.12)',border:'rgba(100,100,100,0.25)',text:'#888'    }, priority:10,fleet:true,  excluded:false },
                'kotler':    { displayName:'Kotler',     initials:'KT', colors:{ bg:'rgba(180,100,160,0.12)',border:'rgba(180,100,160,0.25)',text:'#b070a0' }, priority:11,fleet:true,  excluded:false },
                'ledger':    { displayName:'Ledger',     initials:'LG', colors:{ bg:'rgba(140,140,80,0.12)', border:'rgba(140,140,80,0.25)', text:'#a0a060' }, priority:12,fleet:true,  excluded:false },
                'atlas':     { displayName:'Atlas',      initials:'AT', colors:{ bg:'rgba(80,120,80,0.12)',  border:'rgba(80,120,80,0.25)',  text:'#609060' }, priority:13,fleet:true,  excluded:false },
                'pulsar':    { displayName:'Pulsar',     initials:'PS', colors:{ bg:'rgba(80,80,140,0.12)',  border:'rgba(80,80,140,0.25)',  text:'#6060a0' }, priority:14,fleet:true,  excluded:false },
                'abed':      { displayName:'Abed',       initials:'AB', colors:{ bg:'rgba(160,120,80,0.12)', border:'rgba(160,120,80,0.25)', text:'#a08060' }, priority:15,fleet:true,  excluded:false }
            },
            healthPriority: ['chad-yi', 'cerebronn', 'helios']
        };
    }

    /* ── Public API ─────────────────────────────────────────────────── */

    function normalizeAgentId(agent) {
        return String(agent || '').trim().toLowerCase().replace(/_/g, '-');
    }

    function getAgentConfig(agent) {
        var id = normalizeAgentId(agent);
        if (_configCache[id]) return _configCache[id];
        // Unknown agent — build a sensible default
        return {
            displayName: id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Unknown',
            initials: id ? id.slice(0, 2).toUpperCase() : '??',
            colors: _defaultColors,
            priority: 99,
            fleet: false,
            excluded: false
        };
    }

    function formatAgentDisplay(agent) {
        return getAgentConfig(agent).displayName;
    }

    function getFleetIds() {
        return _fleetIds.slice(); // defensive copy
    }

    function getHealthPriority() {
        return _healthPriority.slice();
    }

    function isAgentExcluded(agent) {
        var id = normalizeAgentId(agent);
        var cfg = _configCache[id];
        return cfg ? !!cfg.excluded : false;
    }

    function isUserAgent(agent) {
        var id = normalizeAgentId(agent);
        return !id || id === 'chad-yi' || id === 'caleb';
    }

    /**
     * getAgentSignalMeta — determines online/offline/blocked status for
     * an agent, using the registry's requirements text.
     */
    function getAgentSignalMeta(agentId, data) {
        data = data || global.appData;
        var agents = (data && data.agents) ? data.agents : {};
        var agent = agents[agentId] || {};
        var lastActive = agent.lastActive ? new Date(agent.lastActive).getTime() : 0;
        var isRecent = lastActive && (Date.now() - lastActive) <= (30 * 60 * 1000);
        var lastSeen = agent.lastActive ? formatRelativeTimestamp(agent.lastActive) : 'No signal yet';
        var cfg = getAgentConfig(agentId);
        var req = cfg.requirements || '';

        if (agent.status === 'blocked') {
            return { tone:'blocked', dotClass:'blocked', label:'blocked', detail: agent.currentTask || 'Waiting on input' };
        }

        if (agentId === 'chad-yi') {
            var localPresence = navigator.onLine && document.visibilityState !== 'hidden';
            return localPresence
                ? { tone:'online', dotClass:'online', label:'present here', detail: req }
                : { tone:'offline', dotClass:'offline', label:'away', detail: req };
        }

        if (agentId === 'helios') {
            var syncedByHelios = String((data && data.updatedBy) || '').toLowerCase().includes('helios');
            if (syncedByHelios && isRecent) {
                return { tone:'online', dotClass:'online', label:'synced recently', detail: agent.currentTask || 'Dashboard sync seen in past 30m' };
            }
            if (lastActive) {
                return { tone:'offline', dotClass:'offline', label:'sync stale', detail: lastSeen + ' · ' + req };
            }
            return { tone:'offline', dotClass:'offline', label:'unverified', detail: req };
        }

        if (isRecent) {
            return { tone:'online', dotClass:'online', label:'seen recently', detail: lastSeen + ' · ' + (req || 'Recent activity detected.') };
        }
        if (lastActive) {
            return { tone:'offline', dotClass:'offline', label:'seen earlier', detail: lastSeen + ' · ' + (req || 'No recent verified signal.') };
        }
        return { tone:'offline', dotClass:'offline', label:'unverified', detail: req || 'No verified signal.' };
    }

    /* Helper — this delegates to whatever the page defines.  If the
       page hasn't loaded its own formatRelativeTimestamp yet we fall
       back to a simple implementation. */
    function formatRelativeTimestamp(value) {
        if (typeof global.formatRelativeTimestamp === 'function') {
            return global.formatRelativeTimestamp(value);
        }
        // Fallback
        var diff = Date.now() - new Date(value).getTime();
        var mins = Math.floor(diff / 60000);
        if (mins < 1)  return 'just now';
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24)  return hrs + 'h ago';
        return Math.floor(hrs / 24) + 'd ago';
    }

    /* ── Expose everything ──────────────────────────────────────────── */
    global.normalizeAgentId    = normalizeAgentId;
    global.getAgentConfig      = getAgentConfig;
    global.formatAgentDisplay  = formatAgentDisplay;
    global.getFleetIds         = getFleetIds;
    global.getHealthPriority   = getHealthPriority;
    global.isAgentExcluded     = isAgentExcluded;
    global.isUserAgent         = isUserAgent;
    global.getAgentSignalMeta  = getAgentSignalMeta;

    /* ── Boot ────────────────────────────────────────────────────────── */
    _loadRegistry();

})(window);
