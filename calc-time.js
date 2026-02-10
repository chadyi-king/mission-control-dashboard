const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

// Find earliest task date
const allTasks = [
  ...(data.tasks || []),
  ...(data.workflow?.pending || []),
  ...(data.workflow?.active || []),
  ...(data.workflow?.review || []),
  ...(data.workflow?.done || [])
];

if (allTasks.length > 0) {
  const dates = allTasks
    .map(t => new Date(t.createdAt || t.updatedAt || Date.now()))
    .filter(d => !isNaN(d));
  
  if (dates.length > 0) {
    const earliest = new Date(Math.min(...dates));
    const now = new Date();
    const diffMs = now - earliest;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHrs / 24);
    const remainingHrs = diffHrs % 24;
    
    data.stats.timeActive = `${diffDays}d ${remainingHrs}h`;
    console.log(`Uptime: ${data.stats.timeActive}`);
  }
}

fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
