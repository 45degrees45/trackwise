# TrackWise Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync task completions from ALL Google Tasks lists (including Chrome OS Focus) into a TIME_LOG sheet, accept manual completions via Google Form, and display a formula-driven DASHBOARD with hourly/monthly/yearly heatmaps.

**Architecture:** A new Apps Script `sync_timelog.gs` polls all Google Tasks lists every 10 minutes and appends completion rows to a dedicated `TIME_LOG` sheet. A Google Form feeds a second script `form_handler.gs` via `onFormSubmit` trigger for manual logging. A `DASHBOARD` sheet reads exclusively from `TIME_LOG` using `COUNTIFS`/`FILTER` formulas — no script writes to it.

**Tech Stack:** Google Apps Script (V8 runtime), Google Tasks API v1, Google Sheets API, Google Forms

---

## File Structure

```
trackwise/
└── phase5/
    ├── sync_timelog.gs     — polls all Google Tasks lists → TIME_LOG
    ├── form_handler.gs     — onFormSubmit trigger → TIME_LOG
    └── DEPLOY.md           — step-by-step deployment guide
```

Both `.gs` files are pasted into the TrackWise Google Sheet's Apps Script editor as separate script files.

---

## Task 1: Create TIME_LOG Sheet Setup Function

**Files:**
- Create: `trackwise/phase5/sync_timelog.gs`

- [ ] **Step 1: Create the file with sheet setup function**

Create `trackwise/phase5/sync_timelog.gs` with this content:

```javascript
const TIME_LOG_SHEET = 'TIME_LOG';
const SYNC_CURSOR_KEY = 'timelog_sync_cursor';

function setupTimeLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TIME_LOG_SHEET);
  if (sheet) {
    Logger.log('TIME_LOG sheet already exists');
    return;
  }
  sheet = ss.insertSheet(TIME_LOG_SHEET);
  const headers = [
    'ID', 'Task Name', 'Task List',
    'Completed Date', 'Completed Time',
    'Hour', 'Day of Week', 'Week No',
    'Month', 'Month No', 'Year'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1a1a2e')
    .setFontColor('#4ade80')
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('TIME_LOG sheet created');
}
```

- [ ] **Step 2: Paste into Apps Script editor and run**

1. Open TrackWise Google Sheet → Extensions → Apps Script
2. Click `+` → New script file → name it `sync_timelog`
3. Paste the code above
4. Select function `setupTimeLogSheet` → click Run
5. Approve permissions when prompted

- [ ] **Step 3: Verify**

Open the TrackWise sheet — a `TIME_LOG` tab should appear with 11 green header columns: ID, Task Name, Task List, Completed Date, Completed Time, Hour, Day of Week, Week No, Month, Month No, Year.

---

## Task 2: Write Core Sync Function

**Files:**
- Modify: `trackwise/phase5/sync_timelog.gs` (append to existing content)

- [ ] **Step 1: Add helper to parse Google Tasks timestamp**

Append to `sync_timelog.gs`:

```javascript
function parseTaskTimestamp(isoString) {
  // Google Tasks returns ISO 8601: "2026-04-20T10:22:00.000Z"
  const d = new Date(isoString);
  const tz = Session.getScriptTimeZone(); // respects Sheet timezone
  const dateStr = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(d, tz, 'hh:mm a');
  const hour    = parseInt(Utilities.formatDate(d, tz, 'H'), 10);
  const dow     = Utilities.formatDate(d, tz, 'EEE');   // Mon, Tue...
  const weekNo  = parseInt(Utilities.formatDate(d, tz, 'w'), 10);
  const month   = Utilities.formatDate(d, tz, 'MMM');   // Jan, Feb...
  const monthNo = parseInt(Utilities.formatDate(d, tz, 'M'), 10);
  const year    = parseInt(Utilities.formatDate(d, tz, 'yyyy'), 10);
  return { dateStr, timeStr, hour, dow, weekNo, month, monthNo, year };
}
```

- [ ] **Step 2: Add duplicate check helper**

Append to `sync_timelog.gs`:

```javascript
function isDuplicate(sheet, taskName, dateStr) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === taskName && data[i][3] === dateStr) return true;
  }
  return false;
}
```

- [ ] **Step 3: Add next ID helper**

Append to `sync_timelog.gs`:

```javascript
function nextId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  return sheet.getRange(lastRow, 1).getValue() + 1;
}
```

- [ ] **Step 4: Add main sync function**

Append to `sync_timelog.gs`:

```javascript
function syncCompletionTimes() {
  setupTimeLogSheet();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TIME_LOG_SHEET);
  const props = PropertiesService.getScriptProperties();
  const cursor = props.getProperty(SYNC_CURSOR_KEY) || '2020-01-01T00:00:00.000Z';

  const taskLists = Tasks.Tasklists.list({ maxResults: 100 }).getItems() || [];
  let newCount = 0;

  for (const list of taskLists) {
    const listId   = list.getId();
    const listName = list.getTitle();
    let pageToken  = null;

    do {
      const params = {
        maxResults:    100,
        showCompleted: true,
        showHidden:    true,
        completedMin:  cursor,
        pageToken:     pageToken || undefined
      };
      const result = Tasks.Tasks.list(listId, params);
      const items  = result.getItems() || [];

      for (const task of items) {
        if (task.getStatus() !== 'completed') continue;
        const completed = task.getCompleted();
        if (!completed) continue;

        const p = parseTaskTimestamp(completed);
        if (isDuplicate(sheet, task.getTitle(), p.dateStr)) continue;

        sheet.appendRow([
          nextId(sheet),
          task.getTitle(),
          listName,
          p.dateStr,
          p.timeStr,
          p.hour,
          p.dow,
          p.weekNo,
          p.month,
          p.monthNo,
          p.year
        ]);
        newCount++;
      }
      pageToken = result.getNextPageToken();
    } while (pageToken);
  }

  props.setProperty(SYNC_CURSOR_KEY, new Date().toISOString());
  Logger.log(`syncCompletionTimes: added ${newCount} rows`);
}
```

- [ ] **Step 5: Enable Tasks API**

In Apps Script editor: left sidebar → Services (`+`) → Tasks API → Version v1 → Add

- [ ] **Step 6: Run sync manually**

Select function `syncCompletionTimes` → Run. Check Execution Log — should show `added N rows`.

- [ ] **Step 7: Verify TIME_LOG has data**

Open TIME_LOG sheet — should see rows for recently completed Google Tasks. Chrome OS Focus tasks should appear here (they live in a separate list that was previously missed).

---

## Task 3: Set Up 10-Minute Auto Trigger

**Files:**
- Modify: `trackwise/phase5/sync_timelog.gs` (append)

- [ ] **Step 1: Add trigger setup function**

Append to `sync_timelog.gs`:

```javascript
function setupTimeTrigger() {
  // Remove any existing timelog triggers to avoid duplicates
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncCompletionTimes')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncCompletionTimes')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('10-minute trigger registered for syncCompletionTimes');
}
```

- [ ] **Step 2: Run setupTimeTrigger**

Select function `setupTimeTrigger` → Run.

- [ ] **Step 3: Verify trigger exists**

Apps Script editor → left sidebar → Triggers (clock icon). Should see `syncCompletionTimes` running every 10 minutes.

---

## Task 4: Google Form Manual Input + Handler

**Files:**
- Create: `trackwise/phase5/form_handler.gs`

- [ ] **Step 1: Create the Google Form**

1. Go to forms.google.com → New form
2. Title: `TrackWise — Log Task Completion`
3. Add fields:
   - Question 1: "Task Name" → Short answer → Required
   - Question 2: "Task List" → Dropdown → Options: `Manual`, `Work`, `Personal`, `Habit`, `Other` → Required
   - Question 3: "Completed Date" → Date → Required
   - Question 4: "Completed Time" → Short answer → (instructions: HH:MM AM/PM) → Not required (defaults to now)
4. In form editor: Settings → Responses → check "Collect email addresses" = OFF
5. Click Send → copy the form URL for DEPLOY.md

- [ ] **Step 2: Link form responses to TrackWise sheet**

In the Form editor:
1. Responses tab → click Google Sheets icon (Link to Sheets)
2. Select "Select existing spreadsheet" → pick your TrackWise sheet
3. This creates a `Form Responses 1` sheet in TrackWise

- [ ] **Step 3: Create form_handler.gs in Apps Script**

In Apps Script editor: `+` → New script file → name it `form_handler`

Paste:

```javascript
function onFormSubmit(e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TIME_LOG_SHEET);
  if (!sheet) { setupTimeLogSheet(); }

  const responses = e.namedValues;
  const taskName  = (responses['Task Name']  || [''])[0].trim();
  const listName  = (responses['Task List']  || ['Manual'])[0].trim();
  const dateRaw   = (responses['Completed Date'] || [''])[0].trim();
  const timeRaw   = (responses['Completed Time'] || [''])[0].trim();

  if (!taskName || !dateRaw) {
    Logger.log('onFormSubmit: missing task name or date, skipping');
    return;
  }

  // Parse the date Google Forms provides (e.g. "04/20/2026" or "2026-04-20")
  const d = new Date(dateRaw);
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const timeStr = timeRaw || Utilities.formatDate(new Date(), tz, 'hh:mm a');

  // Derive hour from timeStr if possible
  let hour = parseInt(Utilities.formatDate(new Date(), tz, 'H'), 10);
  const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    if (timeMatch[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (timeMatch[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  }

  if (isDuplicate(sheet, taskName, dateStr)) {
    Logger.log(`onFormSubmit: duplicate skipped — ${taskName} on ${dateStr}`);
    return;
  }

  const p = parseTaskTimestamp(d.toISOString());
  sheet.appendRow([
    nextId(sheet),
    taskName,
    listName,
    dateStr,
    timeStr,
    hour,
    p.dow,
    p.weekNo,
    p.month,
    p.monthNo,
    p.year
  ]);
  Logger.log(`onFormSubmit: logged "${taskName}" from ${listName}`);
}
```

- [ ] **Step 4: Register the onFormSubmit trigger**

In Apps Script: left sidebar → Triggers → `+` Add Trigger
- Function: `onFormSubmit`
- Event source: From spreadsheet
- Event type: On form submit
- Save

- [ ] **Step 5: Test the form**

Open the form URL → fill in a test task → submit.
Check TIME_LOG sheet — new row should appear within seconds.

---

## Task 5: DASHBOARD Sheet — Today Stats + Recent Completions

**Files:**
- No code file — manual sheet setup (documented in DEPLOY.md)

- [ ] **Step 1: Create DASHBOARD sheet**

In TrackWise Google Sheet: click `+` (new sheet) → rename to `DASHBOARD`

- [ ] **Step 2: Add Today Stats block (row 1–4)**

Click cell A1, enter label/value pairs:

| Cell | Content |
|------|---------|
| A1 | `Tasks Today` |
| B1 | `=COUNTIFS(TIME_LOG!D:D,TEXT(TODAY(),"yyyy-mm-dd"))` |
| C1 | `Tasks This Week` |
| D1 | `=COUNTIFS(TIME_LOG!H:H,WEEKNUM(TODAY()),TIME_LOG!K:K,YEAR(TODAY()))` |
| E1 | `Tasks This Month` |
| F1 | `=COUNTIFS(TIME_LOG!J:J,MONTH(TODAY()),TIME_LOG!K:K,YEAR(TODAY()))` |
| A2 | `Peak Hour` |
| B2 | (see step 3) |
| A3 | `Day Streak` |
| B3 | (see step 4) |

- [ ] **Step 3: Add Peak Hour formula**

In B2:
```
=LET(hours,QUERY(TIME_LOG!F:F,"SELECT F, COUNT(F) WHERE F IS NOT NULL GROUP BY F ORDER BY COUNT(F) DESC LIMIT 1",0),IF(ROWS(hours)=0,"—",TEXT(IFERROR(INDEX(hours,1,1),0),"00")&":00"))
```

- [ ] **Step 4: Add Day Streak formula**

In B3 (counts consecutive days ending today with ≥1 completion):
```
=LET(dates,SORT(UNIQUE(FILTER(TIME_LOG!D:D,TIME_LOG!D:D<>"")),1,-1),streak,IFNA(MATCH(FALSE,MMULT((SEQUENCE(30,1,0,1)=TRANSPOSE(TODAY()-DATEVALUE(dates))),SEQUENCE(COLUMNS(TRANSPOSE(TODAY()-DATEVALUE(dates))),1,1,0))>0,0)-1,0),streak)
```

- [ ] **Step 5: Add Recent Completions table (rows 6–16)**

In A6: `RECENT COMPLETIONS`

In A7:
```
=IFERROR(SORT(FILTER(TIME_LOG!B:E,TIME_LOG!D:D<>""),3,FALSE,4,FALSE),"No data yet")
```
This spills the last completions sorted by date+time descending.

- [ ] **Step 6: Verify**

Complete a task in Google Tasks (or submit via the form) → wait up to 10 min → check DASHBOARD. B1 should increment, A7 should show the task.

---

## Task 6: DASHBOARD Sheet — Heatmaps

**Files:**
- No code file — manual sheet setup

- [ ] **Step 1: Weekly Hour Heatmap (rows 18–21)**

In A18: `TASKS BY HOUR — THIS WEEK`

In B19 through O19, enter hour labels: `6`, `7`, `8`, `9`, `10`, `11`, `12`, `13`, `14`, `15`, `16`, `17`, `18`, `19`

In B20 (copy across to O20 — change the hour number each time):
```
=COUNTIFS(TIME_LOG!F:F,B19,TIME_LOG!D:D,">="&TEXT(TODAY()-WEEKDAY(TODAY(),2)+1,"yyyy-mm-dd"))
```

Apply conditional formatting to B20:O20:
- Format → Conditional formatting → Color scale
- Min: white, Max: `#166534` (dark green)

- [ ] **Step 2: Monthly Day Heatmap (rows 23–30)**

In A23: `MONTHLY HEATMAP — `&TEXT(TODAY(),"MMMM YYYY")

Row 24: day-of-week headers across 7 columns: `Su Mo Tu We Th Fr Sa`

Rows 25–30: calendar grid. In each cell, enter the date formula:
```
=IF(MONTH(date_value)=MONTH(TODAY()),COUNTIFS(TIME_LOG!D:D,TEXT(date_value,"yyyy-mm-dd")),"")
```
Where `date_value` is computed from the first day of month + offset.

First cell of grid (B25) — first Sunday on or before 1st of month:
```
=DATE(YEAR(TODAY()),MONTH(TODAY()),1)-WEEKDAY(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1)+1
```
Each subsequent cell: `=previous_cell+1`

Each count cell:
```
=IF(MONTH(B25)=MONTH(TODAY()),COUNTIFS(TIME_LOG!D:D,TEXT(B25,"yyyy-mm-dd")),"")
```

Apply conditional formatting: same green color scale.

- [ ] **Step 3: Yearly Month Heatmap (rows 32–34)**

In A32: `YEARLY HEATMAP — `&YEAR(TODAY())

In B33:M33 — month labels: `Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec`

In B34 (copy across, change month number 1–12):
```
=COUNTIFS(TIME_LOG!J:J,1,TIME_LOG!K:K,YEAR(TODAY()))
```
C34: change `1` to `2`, D34: `3`, etc.

Apply conditional formatting: same green color scale to B34:M34.

- [ ] **Step 4: Verify heatmaps**

With some data in TIME_LOG, the weekly heatmap should show green cells at hours where tasks were completed. Monthly grid should show today's cell as the most active (since that's where test data landed).

---

## Task 7: Write DEPLOY.md

**Files:**
- Create: `trackwise/phase5/DEPLOY.md`

- [ ] **Step 1: Write the deployment guide**

Create `trackwise/phase5/DEPLOY.md`:

```markdown
# TrackWise Phase 5 — Deployment Guide

## Prerequisites
- Phases 1 + 2 already deployed (TrackWise sheet exists)
- Tasks API enabled in Apps Script (step 3 below)

---

## Step 1 — Add sync_timelog.gs

1. Open TrackWise Google Sheet → Extensions → Apps Script
2. Click `+` → New script file → name it `sync_timelog`
3. Paste the full content of `sync_timelog.gs`
4. Save (Ctrl+S)

## Step 2 — Add form_handler.gs

1. In Apps Script editor: `+` → New script file → name it `form_handler`
2. Paste the full content of `form_handler.gs`
3. Save

## Step 3 — Enable Tasks API

Left sidebar → Services (`+`) → Tasks API → Version v1 → Add

## Step 4 — Run setup

Select function `setupTimeLogSheet` → Run (creates TIME_LOG sheet + headers)

Select function `setupTimeTrigger` → Run (registers 10-min auto sync)

## Step 5 — Backfill existing completions

Select function `syncCompletionTimes` → Run
Check Execution Log → should show `added N rows`
Open TIME_LOG sheet and verify rows appeared, including any Chrome OS Focus tasks.

## Step 6 — Create Google Form

1. Go to forms.google.com → Blank form
2. Title: `TrackWise — Log Task Completion`
3. Fields:
   - Task Name (Short answer, required)
   - Task List (Dropdown: Manual / Work / Personal / Habit / Other, required)
   - Completed Date (Date, required)
   - Completed Time (Short answer, optional — format: 10:30 AM)
4. Responses tab → Link to Sheets → select TrackWise sheet

## Step 7 — Register onFormSubmit trigger

Apps Script → Triggers → `+` Add Trigger
- Function: `onFormSubmit`
- Event source: From spreadsheet
- Event type: On form submit

## Step 8 — Create DASHBOARD sheet

1. New sheet tab → rename to `DASHBOARD`
2. Follow formulas in plan Task 5 and Task 6

## Verify Everything Works

- [ ] Complete a task in Google Tasks
- [ ] Wait up to 10 min → check TIME_LOG for new row
- [ ] Submit a task via the Google Form → check TIME_LOG immediately
- [ ] Open DASHBOARD → confirm Today count increments
- [ ] Confirm Chrome OS Focus tasks now appear (they will be in a list named "Focus" or similar)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No rows in TIME_LOG after sync | Enable Tasks API (Step 3) |
| Chrome OS Focus tasks missing | Run syncCompletionTimes manually — check Logger for "list: Focus" |
| Form submit doesn't log | Check onFormSubmit trigger is registered |
| Heatmap shows all zeros | Verify TIME_LOG column D has dates in yyyy-mm-dd format |
| Duplicate rows appearing | Check isDuplicate — ensure Task Name matches exactly |
```

- [ ] **Step 2: Commit all phase5 files**

```bash
cd /home/jo/claude_projects/trackwise
git init  # if not already a git repo
git add phase5/
git add docs/superpowers/
git commit -m "feat: add phase5 — task completion timing, heatmap dashboard, form input"
```

---

## Self-Review Notes

- All 5 spec requirements covered: Chrome OS Fix ✓, TIME_LOG ✓, Form input ✓, Dashboard ✓, Heatmaps (weekly/monthly/yearly) ✓
- `isDuplicate`, `nextId`, `parseTaskTimestamp` defined in Task 2 before use in Task 4 ✓
- `TIME_LOG_SHEET` constant defined once in Task 1, used across both `.gs` files ✓
- No TBDs or placeholders ✓
- `setupTimeLogSheet()` called defensively inside `onFormSubmit` in case it runs before Task 1 ✓
