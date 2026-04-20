# TrackWise Phase 5 — Task Completion Timing & Dashboard

**Date:** 2026-04-20  
**Status:** Approved

## Problem

Two issues with the current TrackWise setup:

1. Tasks completed via **Chrome OS Flex Focus mode** are not appearing in the MASTER sheet or any dashboard. Root cause: Phase 2 `sync.gs` only reads the default Google Tasks list; Chrome OS Focus mode completes tasks in a separate list.
2. There is no time-based analytics — no way to see *when* tasks are being completed (hour of day, day of week, month, year).

## Solution

Add a dedicated `TIME_LOG` sheet and a new Apps Script (`sync_timelog.gs`) that reads ALL Google Tasks lists, logs completion timestamps, and drives a formula-based `DASHBOARD` sheet with 4 heatmap views.

Zero infrastructure cost — runs entirely on Google Apps Script (Google's servers). Ubuntu machine does not need to be on.

## Architecture

```
Google Tasks (all lists, including Chrome OS Focus)
        ↓  every 10 min (Apps Script time trigger)
  sync_timelog.gs
        ↓
  TIME_LOG sheet  ←──── source of truth for analytics
        ↓  COUNTIFS / FILTER formulas
  DASHBOARD sheet
```

## Components

### 1. TIME_LOG Sheet

Auto-created on first run if it doesn't exist.

| Column | Header | Description |
|--------|--------|-------------|
| A | ID | Auto-increment integer |
| B | Task Name | Title from Google Tasks |
| C | Task List | Name of the list (e.g. "My Tasks", "Focus") |
| D | Completed Date | YYYY-MM-DD |
| E | Completed Time | HH:MM AM/PM |
| F | Hour | 0–23 integer (for heatmap formulas) |
| G | Day of Week | Mon/Tue/Wed... |
| H | Week No | ISO week number |
| I | Month | Jan/Feb/Mar... |
| J | Month No | 1–12 integer |
| K | Year | 2026 |

### 2. sync_timelog.gs (Apps Script)

**Behaviour:**
- On each run, fetches all task lists via `Tasks.Tasklists.list()`
- For each list, fetches tasks completed since last sync cursor (stored in `PropertiesService`)
- Appends new rows to `TIME_LOG` with full timestamp breakdown
- Updates sync cursor to `new Date().toISOString()` after each run
- Idempotent: checks for duplicate (Task Name + Completed Date) before inserting
- Registers a 10-minute time trigger on first run (`setupTimeTrigger()`)

**Key fix:** Reading all task lists (not just default) captures Chrome OS Focus mode completions.

### 3. DASHBOARD Sheet

Formula-driven — no script writes to this sheet. All cells use `COUNTIFS`, `FILTER`, `SORT` against `TIME_LOG`.

**Sections:**

**Today Stats (row 1–3)**
- Tasks today: `=COUNTIFS(TIME_LOG!D:D, TODAY())`
- Tasks this week: `=COUNTIFS(TIME_LOG!H:H, WEEKNUM(TODAY()), TIME_LOG!K:K, YEAR(TODAY()))`
- Peak hour: `=INDEX(hour_labels, MATCH(MAX(hour_counts), hour_counts, 0))`
- Day streak: count of consecutive days with ≥1 completion ending today

**Weekly Hour Heatmap (rows 5–7)**
- 14 cells across: hours 6am–7pm
- Each cell: `=COUNTIFS(TIME_LOG!F:F, hour, TIME_LOG!D:D, ">="&week_start)`
- Conditional formatting: white→light green→dark green based on count

**Monthly Day Heatmap (rows 9–15)**
- 7-column calendar grid for current month
- Each cell: `=COUNTIFS(TIME_LOG!D:D, date_value)`
- Conditional formatting: same green scale

**Yearly Month Heatmap (rows 17–19)**
- 12 cells: Jan–Dec
- Each cell: `=COUNTIFS(TIME_LOG!J:J, month_num, TIME_LOG!K:K, YEAR(TODAY()))`
- Current month highlighted with border

**Recent Completions (rows 21–31)**
- `=SORT(FILTER(TIME_LOG!B:E, TIME_LOG!D:D<>""), 3, FALSE)` — last 10 by date+time

### 4. Manual Input — Google Form

A linked Google Form for logging completions from any source (phone, Alexa, any device).

- Fields: Task Name (text), Task List (dropdown: "Manual / Other"), Completed Date (date), Completed Time (time)
- Form responses sheet auto-feeds into TIME_LOG via a `onFormSubmit` Apps Script trigger
- Accessible from any browser — no app needed
- Same deduplication logic applies

## Files to Create

```
trackwise/
└── phase5/
    ├── DEPLOY.md          — step-by-step deployment guide
    └── sync_timelog.gs    — Apps Script (paste into Sheet's Apps Script editor)
```

## Deployment Steps (summary)

1. Open TrackWise Google Sheet → Extensions → Apps Script
2. Create new file `sync_timelog` → paste `sync_timelog.gs`
3. Run `setupTimeTrigger()` once — creates 10-min trigger + TIME_LOG sheet
4. Enable Tasks API: Services → Tasks API v1
5. Run `syncCompletionTimes()` manually once to backfill
6. Create `DASHBOARD` sheet manually, paste formula blocks from DEPLOY.md
7. Verify Chrome OS Focus tasks now appear in TIME_LOG

## Success Criteria

- Tasks completed via Chrome OS Flex Focus mode appear in TIME_LOG within 10 minutes
- DASHBOARD shows correct counts for today / this week
- Hourly, monthly, and yearly heatmaps reflect real completion data
- No duplicate rows on repeated sync runs
- Script runs without the Ubuntu machine being on
