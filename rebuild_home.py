#!/usr/bin/env python3
"""
Rebuild: Home section HTML — Commit 1
Replaces: topbar (add ticker) + remove agent-rail + replace home-section content
with: hierarchical stats bar + 4-col command grid + redesigned week calendar
"""
import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# ──────────────────────────────────────────────────────────────────────────
# 1. ADD TICKER TO TOPBAR — replace topbar-center with RED SUN COMMAND + ticker
# ──────────────────────────────────────────────────────────────────────────
OLD_TOPBAR_CENTER = '''        <div class="topbar-center">
            <div class="mission-control-badge">
                <span class="mission-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
                    </svg>
                </span>
                <span class="mission-title">Mission Control</span>
            </div>
            <div class="mission-subtitle">Orchestrate. Execute. Dominate.</div>
            <div class="mission-divider"></div>
        </div>'''

NEW_TOPBAR_CENTER = '''        <div class="topbar-center">
            <div class="topbar-brand">
                <span class="topbar-brand-icon">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                </span>
                <span class="topbar-brand-name">RED SUN COMMAND</span>
            </div>
            <div class="topbar-ticker-wrap" aria-live="off">
                <div class="topbar-ticker" id="topbar-ticker">
                    <span class="ticker-content" id="ticker-content">
                        &nbsp;&nbsp;■ LOADING INTELLIGENCE FEED...&nbsp;&nbsp;
                    </span>
                </div>
            </div>
        </div>'''

html = html.replace(OLD_TOPBAR_CENTER, NEW_TOPBAR_CENTER, 1)

# ──────────────────────────────────────────────────────────────────────────
# 2. REMOVE AGENT-RAIL
# ──────────────────────────────────────────────────────────────────────────
html = re.sub(
    r'\n\s*<!-- AGENT STATUS RAIL -->\n\s*<div class="agent-rail"[^>]*>.*?</div>\n',
    '\n',
    html,
    flags=re.DOTALL
)

# ──────────────────────────────────────────────────────────────────────────
# 3. REPLACE HOME SECTION CONTENT
# ──────────────────────────────────────────────────────────────────────────
NEW_HOME_SECTION_INNER = '''        <!-- HOME SECTION — COMMAND CENTER REBUILD -->
        <div id="home-section" class="section active">

            <!-- ═══════════════════════════════════════════
                 STATS BAR — 8 Hierarchical Stat Cards
            ═══════════════════════════════════════════ -->
            <div class="stats-bar" id="stats-bar">

                <!-- 1. DUE TODAY -->
                <div class="stat-card" id="stat-due-today">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span class="stat-label">DUE TODAY</span>
                    </div>
                    <div class="stat-value" id="s-due-today">—</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-alert" id="s-due-urgent">— urgent</span>
                        <span class="sub-stat sub-deadline" id="s-due-deadline">— deadline</span>
                        <span class="sub-stat sub-normal" id="s-due-normal">— normal</span>
                    </div>
                </div>

                <!-- 2. REVIEW -->
                <div class="stat-card" id="stat-review">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        <span class="stat-label">REVIEW</span>
                    </div>
                    <div class="stat-value" id="s-review-total">—</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-agent" id="s-review-agent">— agent work</span>
                        <span class="sub-stat sub-decision" id="s-review-decisions">— decisions</span>
                        <span class="sub-stat sub-approval" id="s-review-approvals">— approvals</span>
                    </div>
                </div>

                <!-- 3. AGENTS -->
                <div class="stat-card" id="stat-agents">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="12" cy="8" r="4"/>
                            <path d="M20 21a8 8 0 1 0-16 0"/>
                            <circle cx="19" cy="9" r="2"/>
                            <circle cx="5" cy="9" r="2"/>
                        </svg>
                        <span class="stat-label">AGENTS</span>
                    </div>
                    <div class="stat-value" id="s-agents-total">—/7</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-good" id="s-agents-working">— working</span>
                        <span class="sub-stat sub-idle" id="s-agents-idle">— idle</span>
                        <span class="sub-stat sub-alert" id="s-agents-blocked">— blocked</span>
                    </div>
                </div>

                <!-- 4. BLOCKED -->
                <div class="stat-card" id="stat-blocked">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span class="stat-label">BLOCKED</span>
                    </div>
                    <div class="stat-value stat-val-warn" id="s-blocked-total">—</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-alert" id="s-blocked-you">— by you</span>
                        <span class="sub-stat sub-warn" id="s-blocked-agents">— by agents</span>
                        <span class="sub-stat sub-muted" id="s-blocked-external">— external</span>
                    </div>
                </div>

                <!-- 5. COMPLETED -->
                <div class="stat-card" id="stat-completed">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span class="stat-label">COMPLETED</span>
                    </div>
                    <div class="stat-value stat-val-good" id="s-completed-total">—</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-good" id="s-completed-you">— by you</span>
                        <span class="sub-stat sub-agent" id="s-completed-agents">— by agents</span>
                        <span class="sub-stat sub-muted" id="s-completed-week">—% week goal</span>
                    </div>
                </div>

                <!-- 6. VELOCITY -->
                <div class="stat-card" id="stat-velocity">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                        </svg>
                        <span class="stat-label">VELOCITY</span>
                    </div>
                    <div class="stat-value" id="s-velocity-today">—</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-muted">today</span>
                        <span class="sub-stat sub-agent" id="s-velocity-week">— this wk</span>
                        <span class="sub-stat sub-trend" id="s-velocity-trend">vs last wk</span>
                    </div>
                </div>

                <!-- 7. PROJECTS -->
                <div class="stat-card" id="stat-projects">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span class="stat-label">PROJECTS</span>
                    </div>
                    <div class="stat-value" id="s-projects-total">—</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-good" id="s-projects-ok">— on track</span>
                        <span class="sub-stat sub-warn" id="s-projects-risk">— at risk</span>
                        <span class="sub-stat sub-alert" id="s-projects-delayed">— delayed</span>
                    </div>
                </div>

                <!-- 8. MESSAGES -->
                <div class="stat-card" id="stat-messages">
                    <div class="stat-header">
                        <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span class="stat-label">MESSAGES</span>
                    </div>
                    <div class="stat-value" id="s-messages-total">—</div>
                    <div class="stat-breakdown">
                        <span class="sub-stat sub-agent" id="s-messages-helios">— Helios</span>
                        <span class="sub-stat sub-muted" id="s-messages-system">— system</span>
                        <span class="sub-stat sub-alert" id="s-messages-unread">— unread</span>
                    </div>
                </div>

            </div><!-- /stats-bar -->

            <!-- ═══════════════════════════════════════════
                 COMMAND GRID — Agent Ops (left) + Today's Focus (right)
            ═══════════════════════════════════════════ -->
            <div class="command-grid" id="command-grid">

                <!-- ─────────────────────────────────────
                     LEFT: AGENT OPERATIONS (cols 1-2)
                ───────────────────────────────────────── -->
                <div class="agent-ops" id="agent-ops">

                    <!-- ROW 1: Daily Briefing (spans full width of agent-ops) -->
                    <div class="cmd-card daily-briefing-card" id="card-briefing">
                        <div class="cmd-card-header">
                            <div class="cmd-card-title">
                                <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                    <line x1="10" y1="9" x2="8" y2="9"/>
                                </svg>
                                DAILY BRIEFING
                            </div>
                            <div class="cmd-card-actions">
                                <span class="card-timestamp" id="briefing-time">Loading...</span>
                                <button class="card-toggle-btn" onclick="toggleCard('briefing-body')" title="Collapse">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="18 15 12 9 6 15"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="cmd-card-body" id="briefing-body">
                            <div class="briefing-sections" id="daily-briefing-content">
                                <!-- Populated by JS: generateDailyBriefing() -->
                                <div class="briefing-loading">
                                    <span class="blink-dot"></span> Compiling intelligence...
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ROW 2 PAIR -->
                    <div class="ops-row">

                        <!-- NEEDS REVIEW -->
                        <div class="cmd-card" id="card-review">
                            <div class="cmd-card-header">
                                <div class="cmd-card-title">
                                    <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                    </svg>
                                    NEEDS REVIEW
                                </div>
                                <span class="card-badge badge-warn" id="review-count">0</span>
                            </div>
                            <div class="cmd-card-body">
                                <ul class="task-list" id="needs-review-list">
                                    <li class="task-item-empty">No items awaiting review</li>
                                </ul>
                            </div>
                        </div>

                        <!-- DECISIONS REQUIRED -->
                        <div class="cmd-card" id="card-decisions">
                            <div class="cmd-card-header">
                                <div class="cmd-card-title">
                                    <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    DECISIONS
                                </div>
                                <span class="card-badge badge-alert" id="decisions-count">0</span>
                            </div>
                            <div class="cmd-card-body">
                                <ul class="task-list" id="decisions-list">
                                    <li class="task-item-empty">No pending decisions</li>
                                </ul>
                            </div>
                        </div>

                    </div><!-- /ops-row ROW 2 -->

                    <!-- ROW 3 PAIR -->
                    <div class="ops-row">

                        <!-- ACTIVE WORK -->
                        <div class="cmd-card" id="card-active">
                            <div class="cmd-card-header">
                                <div class="cmd-card-title">
                                    <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                    </svg>
                                    ACTIVE WORK
                                </div>
                                <span class="card-badge badge-good" id="active-count">0</span>
                            </div>
                            <div class="cmd-card-body">
                                <ul class="task-list" id="active-work-list">
                                    <li class="task-item-empty">No active tasks</li>
                                </ul>
                            </div>
                        </div>

                        <!-- RECENTLY COMPLETED -->
                        <div class="cmd-card" id="card-recent">
                            <div class="cmd-card-header">
                                <div class="cmd-card-title">
                                    <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                    RECENTLY DONE
                                </div>
                                <span class="card-badge badge-done" id="recent-count">0</span>
                            </div>
                            <div class="cmd-card-body">
                                <ul class="task-list" id="recently-done-list">
                                    <li class="task-item-empty">Nothing completed yet today</li>
                                </ul>
                            </div>
                        </div>

                    </div><!-- /ops-row ROW 3 -->

                    <!-- ROW 4 PAIR -->
                    <div class="ops-row">

                        <!-- AGENT RECOMMENDATIONS -->
                        <div class="cmd-card" id="card-recs">
                            <div class="cmd-card-header">
                                <div class="cmd-card-title">
                                    <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <circle cx="12" cy="8" r="4"/>
                                        <path d="M20 21a8 8 0 1 0-16 0"/>
                                    </svg>
                                    AGENT RECS
                                </div>
                            </div>
                            <div class="cmd-card-body">
                                <ul class="task-list" id="agent-recs-list">
                                    <li class="task-item-empty">No recommendations queued</li>
                                </ul>
                            </div>
                        </div>

                        <!-- SYSTEM HEALTH -->
                        <div class="cmd-card" id="card-health">
                            <div class="cmd-card-header">
                                <div class="cmd-card-title">
                                    <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                                    </svg>
                                    SYSTEM HEALTH
                                </div>
                                <span class="health-indicator" id="health-indicator">
                                    <span class="health-dot good"></span>
                                </span>
                            </div>
                            <div class="cmd-card-body">
                                <div id="system-health-content">
                                    <div class="health-row">
                                        <span class="health-label">WebSocket</span>
                                        <span class="health-status" id="ws-status">—</span>
                                    </div>
                                    <div class="health-row">
                                        <span class="health-label">Helios API</span>
                                        <span class="health-status" id="helios-status">—</span>
                                    </div>
                                    <div class="health-row">
                                        <span class="health-label">Data Feed</span>
                                        <span class="health-status" id="data-status">—</span>
                                    </div>
                                    <div class="health-row">
                                        <span class="health-label">Last Sync</span>
                                        <span class="health-status" id="last-sync">—</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div><!-- /ops-row ROW 4 -->

                </div><!-- /agent-ops -->

                <!-- ─────────────────────────────────────
                     RIGHT: TODAY'S FOCUS (cols 3-4, full height)
                ───────────────────────────────────────── -->
                <div class="todays-focus-panel" id="todays-focus">
                    <div class="cmd-card focus-card">
                        <div class="cmd-card-header focus-card-header">
                            <div class="cmd-card-title">
                                <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <circle cx="12" cy="12" r="10"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                                TODAY'S FOCUS
                            </div>
                            <div class="cmd-card-actions">
                                <span class="card-badge badge-total" id="focus-total-count">0 tasks</span>
                                <button class="card-btn" onclick="shuffleFocusOrder()" title="Re-sort by urgency">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="17 1 21 5 17 9"/>
                                        <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                        <polyline points="7 23 3 19 7 15"/>
                                        <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div class="focus-body">

                            <!-- TOP 5 (draggable) -->
                            <div class="focus-top5-label">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                                PRIORITY QUEUE
                            </div>
                            <div class="focus-top5" id="focus-top5" ondragover="event.preventDefault()">
                                <!-- Populated by JS: renderFocusTasks() -->
                                <div class="focus-loading">
                                    <span class="blink-dot"></span> Loading tasks...
                                </div>
                            </div>

                            <!-- ALSO TODAY (collapsible) -->
                            <div class="also-today-section" id="also-today-section">
                                <button class="also-today-header" id="also-today-btn" onclick="toggleAlsoToday()">
                                    <span class="also-divider-line"></span>
                                    <span class="also-label">ALSO TODAY</span>
                                    <span class="also-count" id="also-count">0 more</span>
                                    <span class="also-divider-line"></span>
                                    <svg class="also-chevron" id="also-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                </button>
                                <div class="also-content" id="also-content" style="display:none;">
                                    <!-- Populated by JS -->
                                </div>
                            </div>

                        </div><!-- /focus-body -->
                    </div><!-- /focus-card -->
                </div><!-- /todays-focus-panel -->

            </div><!-- /command-grid -->

            <!-- ═══════════════════════════════════════════
                 WEEK CALENDAR — Mon-Sun, color-coded
            ═══════════════════════════════════════════ -->
            <div class="week-calendar-section" id="week-calendar-section">
                <div class="week-cal-header">
                    <div class="week-cal-title">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        WEEK AT A GLANCE
                    </div>
                    <div class="week-nav">
                        <button class="week-nav-btn" onclick="changeWeek(-1)" title="Previous week">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="15 18 9 12 15 6"/>
                            </svg>
                        </button>
                        <button class="week-nav-btn week-today-btn" onclick="changeWeek(0)" title="This week">TODAY</button>
                        <button class="week-nav-btn" onclick="changeWeek(1)" title="Next week">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </button>
                    </div>
                    <div class="week-range-label" id="week-range-label">Loading...</div>
                </div>

                <div class="week-grid" id="week-grid">
                    <!-- 7 day columns injected by JS: renderWeekCalendar() -->
                    <div class="week-loading">
                        <span class="blink-dot"></span> Mapping week...
                    </div>
                </div>
            </div><!-- /week-calendar-section -->

        </div><!-- /home-section -->
'''

# Find and replace the home section
# Match from <div id="home-section" class="section active"> to </div>\n\n        <!-- CATEGORIES SECTION
pattern = r'        <!-- HOME SECTION.*?        </div>\n\n        <!-- CATEGORIES SECTION'
replacement = NEW_HOME_SECTION_INNER + '\n        <!-- CATEGORIES SECTION'

new_html = re.sub(pattern, replacement, html, flags=re.DOTALL)

if new_html == html:
    print("ERROR: Home section pattern not matched — check pattern")
else:
    print("✓ Home section replaced successfully")

# ──────────────────────────────────────────────────────────────────────────
# 4. UPDATE TOPBAR TITLE in topbar-left (CHAD_YI → simple sun name stays but add subtitle)
# ──────────────────────────────────────────────────────────────────────────
# Keep topbar-left as is for now

# ──────────────────────────────────────────────────────────────────────────
# WRITE OUTPUT
# ──────────────────────────────────────────────────────────────────────────
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_html)

print("✓ index.html updated — ready for CSS injection")

# Verify line counts
import subprocess
result = subprocess.run(['wc', '-l', 'index.html'], capture_output=True, text=True)
print(f"Line count: {result.stdout.strip()}")
