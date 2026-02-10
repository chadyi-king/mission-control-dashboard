// Calculate real stats from tasks array
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

// Fix project stats
if (data.projects) {
    Object.keys(data.projects).forEach(catKey => {
        const cat = data.projects[catKey];
        if (cat.projects) {
            cat.projects.forEach(proj => {
                if (proj.tasks) {
                    const total = proj.tasks.length;
                    const done = proj.tasks.filter(t => t.status === 'done').length;
                    const active = proj.tasks.filter(t => t.status === 'active').length;
                    const pending = proj.tasks.filter(t => t.status === 'pending').length;
                    const urgent = proj.tasks.filter(t => t.priority === 'high' && t.status !== 'done').length;
                    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
                    
                    // Update with real stats
                    proj.progress = progress;
                    proj.totalTasks = total;
                    proj.activeTasks = active;
                    proj.completedTasks = done;
                    proj.stats = { total, done, active, pending, urgent };
                    
                    console.log(`${proj.id}: ${total} tasks, ${done} done, ${progress}% progress`);
                }
            });
        }
    });
}

fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
console.log('Stats updated!');
