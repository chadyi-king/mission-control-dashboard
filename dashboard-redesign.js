/**
 * Dashboard Redesign - Combined Agent Fleet + System Health
 * Order: CHAD_YI → Cerebronn → Helios → Others
 */

// Priority order for agents
const AGENT_PRIORITY = [
    'chad-yi',      // The Face - Interface
    'cerebronn',    // The Brain - Planning
    'helios',       // The Spine - Auditing
    'forger',       // The Builder
    'quanta',       // Trading
    'autour',       // Content
    'escritor',     // Writing
    'mensamusa'     // Research
];

function getAgentPriority(agentId) {
    const idx = AGENT_PRIORITY.indexOf(agentId.toLowerCase());
    return idx === -1 ? 999 : idx;
}

function renderAgentFleet(data) {
    const agents = data.agents || {};
    
    // Sort by priority
    const sortedAgents = Object.entries(agents)
        .filter(([id]) => !isAgentExcluded(id))
        .sort((a, b) => getAgentPriority(a[0]) - getAgentPriority(b[0]));
    
    const onlineCount = sortedAgents.filter(([id, agent]) => {
        const meta = getAgentSignalMeta(id, data);
        return meta.tone === 'online';
    }).length;
    
    let html = `
        <div class="agent-fleet-header">
            <span class="fleet-title">AGENT FLEET <span class="fleet-count">${onlineCount}/${sortedAgents.length} ONLINE</span></span>
        </div>
        <div class="agent-fleet-list">
    `;
    
    for (const [agentId, agent] of sortedAgents) {
        const meta = getAgentSignalMeta(agentId, data);
        const config = getAgentConfig(agentId);
        const isOnline = meta.tone === 'online';
        const isBlocked = agent.status === 'blocked';
        
        // Rich status text
        let statusText = meta.label;
        let detailText = '';
        
        if (agentId === 'quanta' && agent.account) {
            detailText = `$${agent.account.balance?.toFixed(0) || 'N/A'} · ${agent.open_trades?.length || 0} trades`;
        } else if (agent.currentTask) {
            detailText = agent.currentTask;
        } else if (agent.lastActivity) {
            detailText = agent.lastActivity;
        }
        
        html += `
            <div class="agent-card ${isOnline ? 'online' : 'offline'} ${isBlocked ? 'blocked' : ''}">
                <div class="agent-card-header">
                    <div class="agent-avatar" style="background:${config.colors.bg};border-color:${config.colors.border}">
                        <span style="color:${config.colors.text}">${config.initials}</span>
                    </div>
                    <div class="agent-info">
                        <div class="agent-name">${formatAgentDisplay(agentId)}</div>
                        <div class="agent-role">${getAgentRole(agentId)}</div>
                    </div>
                    <div class="agent-status-dot ${meta.dotClass}"></div>
                </div>
                <div class="agent-card-body">
                    <div class="agent-status-text">${statusText}</div>
                    ${detailText ? `<div class="agent-detail">${detailText}</div>` : ''}
                    ${agent.tasks_waiting ? `<div class="agent-waiting">${agent.tasks_waiting} tasks waiting</div>` : ''}
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

function getAgentRole(agentId) {
    const roles = {
        'chad-yi': 'The Face · Interface',
        'cerebronn': 'The Brain · Planning',
        'helios': 'The Spine · Audit',
        'forger': 'The Builder · Websites',
        'quanta': 'The Trader · Execution',
        'autour': 'The Voice · Content',
        'escritor': 'The Scribe · Writing',
        'mensamusa': 'The Scholar · Research'
    };
    return roles[agentId.toLowerCase()] || 'Agent';
}

// CSS for new design
const REDESIGN_CSS = `
.agent-fleet-header {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(220,20,60,0.2);
}

.fleet-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 11px;
    letter-spacing: 0.15em;
    color: rgba(220,20,60,0.9);
}

.fleet-count {
    font-size: 9px;
    color: rgba(160,160,180,0.7);
    margin-left: 8px;
}

.agent-fleet-list {
    padding: 8px;
}

.agent-card {
    background: rgba(10,10,12,0.6);
    border: 1px solid rgba(220,20,60,0.15);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
    transition: all 0.2s ease;
}

.agent-card:hover {
    background: rgba(20,20,24,0.8);
    border-color: rgba(220,20,60,0.3);
}

.agent-card.online {
    border-left: 2px solid rgba(100,200,100,0.6);
}

.agent-card.offline {
    border-left: 2px solid rgba(100,100,100,0.3);
    opacity: 0.7;
}

.agent-card.blocked {
    border-left: 2px solid rgba(220,100,100,0.8);
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { border-left-color: rgba(220,100,100,0.8); }
    50% { border-left-color: rgba(220,100,100,0.4); }
}

.agent-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
}

.agent-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid;
    font-size: 10px;
    font-weight: 700;
    font-family: 'Orbitron', sans-serif;
}

.agent-info {
    flex: 1;
}

.agent-name {
    font-family: 'Orbitron', sans-serif;
    font-size: 10px;
    color: rgba(220,220,240,0.9);
    letter-spacing: 0.05em;
}

.agent-role {
    font-family: 'Rajdhani', sans-serif;
    font-size: 9px;
    color: rgba(160,160,180,0.7);
}

.agent-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.agent-status-dot.online {
    background: rgba(100,200,100,0.9);
    box-shadow: 0 0 4px rgba(100,200,100,0.5);
}

.agent-status-dot.offline {
    background: rgba(100,100,100,0.5);
}

.agent-status-dot.blocked {
    background: rgba(220,100,100,0.9);
    box-shadow: 0 0 4px rgba(220,100,100,0.5);
}

.agent-card-body {
    padding-left: 38px;
}

.agent-status-text {
    font-family: 'Rajdhani', sans-serif;
    font-size: 10px;
    color: rgba(140,140,160,0.9);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.agent-detail {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: rgba(180,180,200,0.8);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.agent-waiting {
    font-family: 'Rajdhani', sans-serif;
    font-size: 9px;
    color: rgba(220,180,100,0.8);
    margin-top: 4px;
    padding: 2px 6px;
    background: rgba(220,180,100,0.1);
    border-radius: 3px;
    display: inline-block;
}
`;
