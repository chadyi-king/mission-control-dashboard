// OpenClaw Integration for Mission Control Dashboard
// This script runs server-side to handle agent spawning

const { sessions_spawn } = require('./openclaw-api');

// Agent spawning endpoint
async function handleSpawnAgent(req, res) {
    const { task, projectCode, subtasks } = req.body;
    
    // Build task context
    const taskContext = `
You are working on task: ${task}
Project: ${projectCode}

Subtasks to complete:
${subtasks.map((s, i) => `${i+1}. ${s.title} ${s.done ? '✅' : '⬜'}`).join('\n')}

Focus on the first incomplete subtask. Update progress as you work.
Report back when complete or if you need clarification.
`;

    try {
        // Spawn the agent using OpenClaw
        const result = await sessions_spawn({
            task: taskContext,
            agentId: 'main', // or specific agent based on task type
            label: `${projectCode}-${Date.now()}`,
            runTimeoutSeconds: 3600 // 1 hour timeout
        });
        
        // Update data.json with new agent
        await updateDataJson({
            agentId: result.sessionKey,
            name: generateAgentName(),
            task: task,
            projectCode: projectCode,
            status: 'active',
            progress: 0,
            started_at: new Date().toISOString()
        });
        
        res.json({
            success: true,
            agentId: result.sessionKey,
            message: 'Agent spawned successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

function generateAgentName() {
    const models = ['K2.5', 'GPT-4', 'Claude'];
    const roles = ['Writer', 'Coder', 'Researcher', 'Designer', 'Analyst'];
    const model = models[Math.floor(Math.random() * models.length)];
    const role = roles[Math.floor(Math.random() * roles.length)];
    return `${model}-${role}`;
}

async function updateDataJson(agentData) {
    // Read current data.json
    // Add new agent to agents array
    // Write back
    // This updates the dashboard in real-time (30s polling)
}

// Poll agent status and update data.json
async function pollAgentStatus() {
    // Get all active agents from OpenClaw
    // Update their progress in data.json
    // Mark completed agents as done
}

// Run polling every 30 seconds
setInterval(pollAgentStatus, 30000);

module.exports = { handleSpawnAgent };