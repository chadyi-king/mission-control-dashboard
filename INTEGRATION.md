# Mission Control Dashboard - OpenClaw Integration

## Current Architecture

### Task 1 ✅ Real-Time Data Polling
- Dashboard fetches `data.json` every 30 seconds
- I update `data.json` → Dashboard auto-refreshes
- No page reload needed

### Task 2 ✅ Project Detail Pages
- Click any project (A1-A6, B1-B10, C1-C2)
- See tasks with progress bars
- See subtasks (checkboxes)
- "Spawn Agent" button on each task

### Task 3 ⚠️ OpenClaw Integration (Partial)

**Limitation:** GitHub Pages = static hosting only
Cannot run server-side code to spawn agents directly.

**Current Workflow:**
1. You click "Spawn Agent" on a task
2. Dashboard alerts: "Contact Chad Yi to spawn"
3. You message me: "Spawn agent for A2-1"
4. I run: `sessions_spawn` with task context
5. I update `data.json` with new agent
6. Dashboard shows new agent in 30s

**Future Options:**

**Option A: Keep Manual (Current)**
- Simple, free, works
- I act as the bridge

**Option B: Serverless Backend**
- Deploy Vercel/Netlify function
- Dashboard calls webhook
- Webhook spawns OpenClaw agent
- Costs $ at scale

**Option C: OpenClaw WebSocket**
- If OpenClaw adds real-time API
- Dashboard connects directly
- No intermediate server needed

## Files

- `index.html` - Dashboard UI with polling
- `data.json` - Live data (agents, tasks, stats)
- `openclaw-bridge.js` - Conceptual server code
- `README.md` - Documentation

## Updating Data

To update dashboard data, I modify `data.json`:

```bash
# Edit data.json
git add data.json
git commit -m "Update: Agent progress"
git push
```

Dashboard auto-refreshes within 30 seconds.

## Next Steps

1. Add more project task data (currently only A2 has tasks)
2. Build agent status polling (track actual OpenClaw sessions)
3. Consider serverless backend for true automation
