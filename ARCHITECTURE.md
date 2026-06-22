# Mission Control Dashboard Architecture

## Purpose

Mission Control is the visual/status surface for Hermes. It is not the command authority and it is not the long-term task database.

Public URL: https://chadyi-king.github.io/mission-control-dashboard/

## Data Ownership

Canonical control-plane state:

`/home/chad-yi/.hermes/workspace/state/mission-control.json`

Public dashboard snapshot:

`mission-control-dashboard/data.json`

Rules:

- Hermes/Telegram owns task creation, task completion, deadlines, assignment, and sensitive actions.
- Helios reads canonical Hermes state and publishes generated dashboard snapshots.
- The dashboard reads generated snapshot data and renders it through one normalized model.
- The dashboard may express visual workflow intent, such as queue reorder or agent-board movement, only through Hermes/local API when available.
- The dashboard must not store GitHub tokens, write directly to GitHub, or treat localStorage/browser state as source of truth.
- Public snapshots must strip broker account identifiers, tokens, API keys, credentials, secrets, and passwords.

## Active Runtime Files

- `index.html` - root app shell at the GitHub Pages URL.
- `main-styles.css` - Red Sun / Mission Control visual system.
- `dashboard-hermes-bridge.js` - optional local Hermes API bridge for fresher reads and approved visual write-intents.
- `dashboard-app.js` - snapshot loader, normalizer, derived dashboard model, rendering, read-only task modal, visual queue/board behavior.
- `data.json` - public generated snapshot.

## Optional Hermes API Bridge

`dashboard-hermes-bridge.js` is inactive by default on the public GitHub Pages URL.

Enable it only for local Hermes/API testing with:

- `?hermes=local`
- `?hermesApi=http://127.0.0.1:8000`

When enabled, it:

- tries `GET /api/sync` before falling back to public `data.json`
- sends approved visual workflow intent to `POST /api/dashboard-intents`
- keeps `data.json` as fallback, not truth
- does not use localStorage
- does not hold GitHub tokens or PATs
- does not add tasks, mark done, set deadlines, assign owners, touch trading, touch ads spend, change credentials, or post publicly

## Removed Runtime Patterns

The rebuild intentionally removed these old patterns:

- raw GitHub HTML bootloader
- dashboard-current manifest indirection
- browser PAT settings modal
- direct dashboard task writes
- localStorage task source of truth
- old patch files and app-v2 fragments
- OpenClaw dashboard path assumptions
- standalone dashboard agent-registry runtime

## Required Snapshot Invariants

A valid public snapshot must preserve:

- 22 projects
- C4 / Website Services
- 106 visible tasks
- 29 done tasks
- canonical fleet IDs: `chad-yi`, `cerebronn`, `helios`, `quanta`, `forger`, `escrita`, `autoura`, `mensamusa`, `clair`, `eplusplus`, `kotler`, `ledger`, `atlas`, `pulsar`, `abed`
- no active `tele` fleet member

## Dashboard Sections

All sections derive from the same normalized model in `dashboard-app.js`:

- top bar and ticker
- stats cluster
- daily briefing
- awaiting review
- input requested
- Caleb queue
- today's focus / priority queue
- week calendar
- agent workflow boards
- agent fleet
- project categories
- task detail modal

Old snapshot statuses are normalized for display:

- `backlog`, `pending`, `todo` -> `open`
- `review`, `needs_review`, `check_this` -> `needs_review`
- `waiting_on_you`, `needs_input` -> `input_requested`
- `active`, `blocked`, `paused`, and `done` remain distinct

## Deployment

GitHub Pages must publish this dashboard at:

`https://chadyi-king.github.io/mission-control-dashboard/`

Preferred Pages setting:

- Source: `GitHub Actions`
- Workflow: `.github/workflows/pages.yml`

The Actions workflow deploys the same static dashboard, but sanitizes the public `data.json` artifact before publishing.

Branch publishing fallback:

- Source: Deploy from a branch
- Branch: `gh-pages`
- Folder: `/ (root)`
- Only use this after the checked-in `data.json` has been regenerated/sanitized from Hermes canonical state.

The `main`, `master`, `sidebar-redesign`, and `gh-pages` branches are kept aligned to the rebuilt dashboard source to avoid branch-source confusion.

Do not add Render, a second dashboard URL, or an in-repo dashboard archive unless Caleb explicitly approves it.
