(function(global) {
    function safeParseDate(value) {
        const date = value ? new Date(value) : new Date();
        return isNaN(date.getTime()) ? new Date() : date;
    }

    function estimateTaskDuration(task) {
        if (task.completedAt) {
            const start = safeParseDate(task.createdAt);
            const end = safeParseDate(task.completedAt);
            const diff = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
            return diff;
        }

        if (task.status === 'review') return 2;
        if (task.status === 'active') return 3;
        if (task.status === 'done') return 2;

        if (task.priority === 'high') return 5;
        if (task.priority === 'medium') return 4;
        return 3;
    }

    function calculateTaskStats(tasks) {
        return {
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            active: tasks.filter(t => t.status === 'active').length,
            review: tasks.filter(t => t.status === 'review').length,
            done: tasks.filter(t => t.status === 'done').length,
            highPriority: tasks.filter(t => t.priority === 'high' && t.status !== 'done').length,
            mediumPriority: tasks.filter(t => t.priority === 'medium' && t.status !== 'done').length,
            lowPriority: tasks.filter(t => t.priority === 'low' && t.status !== 'done').length,
            urgent: tasks.filter(t => t.priority === 'high' && t.status !== 'done').length
        };
    }

    function getPriorityBreakdown(tasks) {
        return {
            high: tasks.filter(t => t.priority === 'high').length,
            medium: tasks.filter(t => t.priority === 'medium').length,
            low: tasks.filter(t => t.priority === 'low').length
        };
    }

    function calculateTimeTracking(tasks) {
        const estimatedHours = tasks.reduce((sum, t) => {
            if (t.notes && t.notes.includes('hr')) {
                const match = t.notes.match(/(\d+)[\s-]*(\d*)\s*hr/i);
                if (match) {
                    const hours = match[2] ? (parseInt(match[1], 10) + parseInt(match[2], 10)) / 2 : parseInt(match[1], 10);
                    return sum + hours;
                }
            }
            return sum + 2;
        }, 0);

        const completedTasks = tasks.filter(t => t.status === 'done').length;
        const totalTasks = tasks.length;
        const spentHours = totalTasks > 0 ? (completedTasks / totalTasks) * estimatedHours * 0.8 : 0;

        return {
            estimated: Math.round(estimatedHours),
            spent: Math.round(spentHours),
            remaining: Math.max(0, Math.round(estimatedHours - spentHours))
        };
    }

    function getNextDeadline(tasks) {
        // Only use REAL deadlines from task.deadline field (not generated ones)
        const pendingTasksWithDeadlines = tasks.filter(t => {
            if (t.status === 'done') return false;
            return t.deadline && t.deadline.trim() !== '';
        });
        
        if (pendingTasksWithDeadlines.length === 0) return null;

        // Sort by deadline date (soonest first)
        const sorted = pendingTasksWithDeadlines.sort((a, b) => {
            return new Date(a.deadline) - new Date(b.deadline);
        });

        const task = sorted[0];

        return {
            task: task,
            date: new Date(task.deadline),
            priority: task.priority
        };
    }

    function generateMilestones(project, tasks) {
        const milestones = [];
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'done').length;

        for (let i = 1; i <= 4; i++) {
            const threshold = i * 0.25;
            const milestoneTasks = Math.floor(totalTasks * threshold);
            const isCompleted = completedTasks >= milestoneTasks && milestoneTasks > 0;
            const isActive = !isCompleted && completedTasks >= milestoneTasks - Math.ceil(totalTasks * 0.1);

            milestones.push({
                number: i,
                label: `${i * 25}%`,
                completed: isCompleted,
                active: isActive,
                tasksRequired: milestoneTasks
            });
        }

        return milestones;
    }

    function buildProjectTimeline(tasks) {
        if (!tasks || tasks.length === 0) {
            return { items: [], start: null, end: null, duration: 0 };
        }

        const items = tasks.map(task => {
            const start = safeParseDate(task.createdAt);
            let end = task.completedAt ? safeParseDate(task.completedAt) : new Date(start);

            if (!task.completedAt) {
                end.setDate(end.getDate() + estimateTaskDuration(task));
            }

            if (end < start) {
                end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
            }

            return {
                id: task.id,
                title: task.title,
                status: task.status || 'pending',
                priority: task.priority || 'medium',
                start,
                end
            };
        }).sort((a, b) => a.start - b.start);

        const startDate = items.reduce((min, item) => item.start < min ? item.start : min, items[0].start);
        const endDate = items.reduce((max, item) => item.end > max ? item.end : max, items[0].end);
        const duration = Math.max(1, endDate - startDate);

        return { items, start: startDate, end: endDate, duration };
    }

    function formatTimelineDate(date) {
        if (!date || isNaN(date.getTime())) return 'TBD';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatCountdown(targetDate) {
        const now = new Date();
        const diff = targetDate - now;

        if (diff < 0) return 'OVERDUE';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) return `${days}d ${hours}h`;
        return `${hours}h`;
    }

    function getPriorityClass(priority) {
        if (priority === 'high') return 'high-priority';
        if (priority === 'medium') return 'medium-priority';
        return 'low-priority';
    }

    global.MissionControlHelpers = {
        safeParseDate,
        estimateTaskDuration,
        calculateTaskStats,
        getPriorityBreakdown,
        calculateTimeTracking,
        getNextDeadline,
        generateMilestones,
        buildProjectTimeline,
        formatTimelineDate,
        formatCountdown,
        getPriorityClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
