# DATA ARCHITECTURE - Mission Control Dashboard

## ⚠️ CRITICAL RULES (READ THIS)

### **NEVER DO THIS:**
1. ❌ Edit data.json to fix JavaScript/CSS issues
2. ❌ Commit data.json without checking task count first
3. ❌ Run "fix data integrity" without backing up first
4. ❌ Assume 72 tasks = working dashboard

### **ALWAYS DO THIS:**
1. ✅ Check `len(data['tasks']) == 72` before any commit
2. ✅ Backup data.json before structural changes
3. ✅ Test dashboard renders after ANY change
4. ✅ Separate DATA fixes from UI fixes

---

## **FILE RESPONSIBILITIES**

| File | Purpose | Edit When |
|------|---------|-----------|
| `data.json` | **YOUR TASKS ONLY** | Adding/removing tasks |
| `index.html` | Home page UI | Design changes |
| `categories.html` | Categories UI | Design changes |
| `project-tasks-modal.css` | Modal styling | Design changes |
| `_headers` | CDN cache control | Cache issues |

**NEVER MIX THESE.** If you edit data.json, ONLY change task data. If you edit HTML/CSS, NEVER touch data.json.

---

## **TASK STORAGE FORMAT**

```json
{
  "tasks": {
    "A1-1": {
      "id": "A1-1",
      "title": "Task title here",
      "project": "A1",
      "category": "A",
      "priority": "high",
      "status": "pending",
      "deadline": "2026-02-13",
      "agent": "CHAD_YI"
    }
  }
}
```

**Required fields for every task:**
- `id` - Unique identifier (A1-1, B6-4, etc.)
- `title` - What needs to be done
- `project` - Project code (A1, B6, etc.)
- `category` - A, B, or C
- `priority` - high, medium, low
- `status` - pending, active, review, done
- `agent` - Who owns it

---

## **STRUCTURE REQUIREMENTS**

The dashboard JavaScript expects these EXACT structures:

### 1. Projects (for Categories page)
```json
"projects": {
  "A": {
    "name": "Ambition (Personal)",
    "subtitle": "By Calbee (Personal)",
    "icon": "🎯",
    "projects": ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]
  }
}
```

### 2. Workflow (for status tracking)
```json
"workflow": {
  "pending": ["B6-4"],
  "active": ["A1-1", "A2-13"],
  "review": [],
  "done": ["A2-12"]
}
```

### 3. InputDetails (for Input Needed section)
```json
"inputDetails": {
  "A5-1": {
    "taskId": "A5-1",
    "title": "Trading Bot: Forex/Commodities",
    "brief": "A5 • From: Quanta",
    "whatINeed": "OANDA API credentials",
    "agent": "Quanta"
  }
}
```

### 4. UrgentTaskDetails (for Urgent Queue)
```json
"urgentTaskDetails": {
  "A1-1": {
    "id": "A1-1",
    "title": "Change Taiwan flights",
    "deadline": "2026-02-13",
    "hoursRemaining": 17,
    "agent": "CHAD_YI",
    "severity": "critical"
  }
}
```

---

## **BACKUP PROTOCOL**

Before ANY data.json change:

```bash
# 1. Check task count
python3 -c "import json; d=json.load(open('data.json')); print(f'Tasks: {len(d[\"tasks\"])}')"

# 2. Backup if 72 tasks
python3 -c "
import json
from datetime import datetime
d = json.load(open('data.json'))
backup_file = f'data-backup-{datetime.now().strftime(\"%Y%m%d-%H%M%S\")}.json'
json.dump(d, open(backup_file, 'w'), indent=2)
print(f'Backup: {backup_file}')
"

# 3. Make your changes
# ... edit data.json ...

# 4. Verify still 72 tasks
python3 -c "import json; d=json.load(open('data.json')); print(f'Tasks: {len(d[\"tasks\"])}')"

# 5. Only commit if count is correct
git add data.json
git commit -m "Your message"
```

---

## **VERIFICATION CHECKLIST**

After any deploy, check:

- [ ] `data.json` has 72 tasks
- [ ] `projects.A.projects` has 7 items
- [ ] `projects.B.projects` has 10 items  
- [ ] `projects.C.projects` has 2 items
- [ ] `workflow.pending` includes urgent tasks
- [ ] `inputDetails` has titles (not undefined)
- [ ] `urgentTaskDetails` is a dict (not list)

---

## **WHAT WENT WRONG (Feb 12)**

1. **20:06** - "Data integrity fix" removed 64 tasks
   - Thought: "Removing ghost tasks"
   - Reality: Removed real tasks

2. **Multiple restores** - Kept breaking structure
   - Merged 72 tasks but lost `projects` array
   - Fixed structure but lost `inputDetails` fields
   - Fixed fields but lost `urgentTaskDetails` format

3. **Root cause:** Editing data.json for both data AND structure fixes

---

## **PREVENTION FOR FUTURE**

**When adding a new task:**
1. ONLY add to `data.json['tasks']`
2. Add task ID to appropriate `workflow` array
3. If urgent, add to `urgentTaskDetails`
4. If needs input, add to `inputsNeeded` and `inputDetails`
5. Commit ONLY data.json changes

**When fixing UI:**
1. Edit ONLY HTML/CSS files
2. NEVER touch data.json
3. Test with existing data

**Emergency restore:**
```bash
# If data is corrupted, restore from git
git show 031a700:data.json > data.json
git add data.json
git commit -m "Restore 72 tasks from backup"
```
