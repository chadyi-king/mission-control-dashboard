# Mission Control Dashboard Backend Source Contract

This repository is only the public dashboard runtime. It is not the long-term task database.

## Canonical Source

Canonical Mission Control state lives in WSL:

```text
/home/chad-yi/.hermes/workspace/state/mission-control.json
```

That file owns projects, tasks, agents, statuses, queues, visual workflow state, and audit events.

## Generated Public Snapshot

The public dashboard reads:

```text
data.json
```

`data.json` is a generated, sanitized GitHub Pages snapshot. It must be reproducible from canonical Hermes state and must not be edited as the durable source of truth.

Required public snapshot anchors:

- 22 projects
- C4 exists
- C4 name is Website Services
- 106 visible tasks
- 29 done tasks
- no secret-like public keys
- no browser GitHub PAT write path
- no OpenClaw source path
- no legacy public workflow buckets: backlog, pending, review, todo, in_progress

## Allowed Dashboard Writes

The dashboard may only send small visual workflow intents:

- `priority_queue_reorder`
- `agent_board_move`

Those intents must go through `/api/dashboard-intents`, be validated by Hermes/Helios, written under canonical `visualWorkflowState`, audited, and then republished into `data.json`.

The dashboard must not directly add tasks, mark tasks done, assign owners, set deadlines, change credentials, touch trading, touch ads spend, or write GitHub with a browser PAT.

## Deployment Sanity Check

The live root URL is:

```text
https://red-sun-command.dashboard/
```

A healthy root load must show the current bootloader/app and must not show `GitHub Personal Access Token` or `Required for Mark Done to persist`.

Diagnostic probe file:

```text
https://red-sun-command.dashboard/backend-contract-probe-20260623.html
```

If GitHub source files show the bootloader but the live root still shows the old PAT-era dashboard, the failure is in the GitHub Pages deployment layer, not in task data. In that case, do not claim the dashboard is fixed. Force a Pages rebuild from GitHub Settings or run the Pages deployment workflow after confirming the Pages source mode.

## Local Repair Commands

Run these from the real WSL Hermes workspace, not from Windows Desktop snapshots:

```bash
cd /home/chad-yi/.hermes/workspace
python3 scripts/canonicalize_mission_control_state.py --publish
python3 scripts/check_mission_control_contract.py
python3 scripts/migrate_hermes_cron_to_canonical_dashboard.py --apply
```

Only claim success after both are true:

1. Local contract check passes in WSL.
2. Live public root no longer serves the PAT-era dashboard and shows the accepted 22/C4/106/29 data contract.
