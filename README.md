# Mission Control Dashboard

Static GitHub Pages dashboard for Hermes Mission Control.

Live URL: https://red-sun-command.dashboard/

## Current Contract

- This repo serves the public dashboard UI and the generated public snapshot `data.json`.
- The long-term canonical state belongs to Hermes at `/home/chad-yi/.hermes/workspace/state/mission-control.json`.
- `data.json` is treated as a generated/sanitized dashboard snapshot, not as the durable control-plane truth.
- Telegram/Hermes is the primary command surface for adding tasks, marking done, assigning owners, setting deadlines, or changing task content.
- Dashboard writes are limited to visual workflow intent such as priority queue reorder or agent-board movement, and those must go through Hermes/local API when available.

## Rebuild Notes

The active dashboard was rebuilt from scratch on 2026-06-22 to remove the old split-brain dashboard runtime.

Removed from active runtime:

- raw-GitHub HTML bootloader
- dashboard-current manifest
- browser GitHub PAT workflow
- localStorage task-cache source of truth
- old modal/task mutation scripts
- old patch stylesheets and app-v2 fragments
- old standalone agent-registry runtime

The active public app is intentionally small:

- `index.html` - static shell
- `main-styles.css` - Red Sun visual system
- `dashboard-hermes-bridge.js` - optional local Hermes API bridge for fresher reads and approved visual write-intents
- `dashboard-app.js` - one normalized read model used by all dashboard sections
- `data.json` - generated public snapshot

`docs/` exists only as a GitHub Pages source fallback mirror for repos accidentally configured to publish from `main / docs`. It is not a legacy dashboard, not an archive, and not a second data truth. Root files remain the source to edit; `docs/` must mirror the same rebuilt files.

## Optional Hermes API Bridge

By default, the public GitHub Pages dashboard reads only the generated `data.json` snapshot. It does not auto-probe local services from the public URL.

For local Hermes testing, open the dashboard with one of these query parameters:

- `?hermes=local`
- `?hermesApi=http://127.0.0.1:8000`

When enabled, `dashboard-hermes-bridge.js` tries `GET /api/sync` before falling back to `data.json`, and sends approved visual workflow intents to `POST /api/dashboard-intents`. It does not store tokens, write to GitHub, use localStorage, add tasks, mark tasks done, assign owners, set deadlines, or change canonical statuses directly.

## Acceptance Anchors

The snapshot used for this rebuild must preserve:

- 22 projects
- C4 / Website Services
- 106 visible tasks
- 29 completed tasks
- 15 visible fleet agents

## Public Snapshot Sanitization

The public dashboard must not expose broker account identifiers, tokens, credentials, or secrets.

The GitHub Actions Pages workflow sanitizes the deployment artifact copy of `data.json` before publishing. Hermes local publishers also strip sensitive-looking keys from generated snapshots.

## Deployment

GitHub Pages remains the only deployment target. Do not create Render or another hosting target for this dashboard unless Caleb explicitly asks.

Preferred Pages setting:

- Source: `GitHub Actions`
- Workflow: `.github/workflows/pages.yml`

Why: the workflow publishes the same static dashboard at the same URL, but sanitizes the public `data.json` artifact first.

Branch publishing fallback:

- Source: Deploy from a branch
- Branch: `gh-pages`
- Folder: `/ (root)`

Emergency fallback if GitHub Pages is already configured this way and cannot be changed immediately:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/docs`

Only use branch fallback after the checked-in `data.json` has been regenerated/sanitized from Hermes canonical state.

`main`, `master`, `sidebar-redesign`, and `gh-pages` should all mirror the rebuilt dashboard source. If the live root URL serves the old PAT/settings dashboard while branch contents show the rebuilt source, the failure is in GitHub Pages source/deployment state, not in `data.json` or the dashboard JavaScript.
