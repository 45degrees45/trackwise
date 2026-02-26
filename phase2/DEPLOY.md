# Phase 2 Deployment — Apps Script Sync

## Prerequisites
- Phase 1 deployed and Sheet working
- Google Tasks API enabled (step 2 below)

---

## Steps

### 1. Open Apps Script
In your TrackWise Sheet:
Extensions → Apps Script

### 2. Enable the Tasks API
Left sidebar → Services (+ icon) → Tasks API → Version v1 → Add

Without this step, the script cannot read Google Tasks.

### 3. Add sync.gs
In Apps Script editor:
- You already have Code.gs with Phase 1 setup
- Click "+" → New script file → name it `sync`
- Paste the contents of sync.gs into it
- Click Save

### 4. Run onOpen (registers the menu)
- Select function: `onOpen`
- Click Run
- Approve permissions

After this, your Sheet will have a "TrackWise" menu in the top bar.

### 5. Test first
TrackWise menu → Test Sync (7 days)

This forces a 7-day look-back and processes any tasks completed in the last week.

Check:
- LOG sheet (unhide: right-click sheet tab → Show)
- MASTER sheet for new rows

### 6. Activate the trigger
TrackWise menu → Setup Trigger

This registers the 10-minute automatic sync. Done.

---

## How the Sync Works

### Matched tasks (Task / Project Milestone)
Finds the row in MASTER with matching Title + Status=Pending
→ Updates Status to Completed
→ Sets Completed Date

### Matched habits
Finds the Habit definition row (stays Pending — it's the recurring definition)
→ Creates a NEW Completed row with same metadata
→ Streak formula counts all such rows automatically

### Unmatched tasks (no row in MASTER)
Creates a new Uncategorized row with:
- Title from Google Tasks
- Status = Uncategorized
- Completed Date logged
- Energy/Impact left blank → invisible to OpenClaw

These appear in the Dashboard "TRIAGE NEEDED" count.

---

## Idempotency (duplicate protection)

The script will NOT create duplicate rows if:
- A habit was already logged today (checked by title + date + category)
- An Uncategorized row already exists for same title + same day
- A task row is already marked Completed (won't match findPendingRow)

---

## Manual Operations

All operations available via TrackWise menu in the Sheet:

| Menu Item              | Function              |
|------------------------|-----------------------|
| Run Sync Now           | syncCompletedTasks()  |
| Test Sync (7 days)     | testSync()            |
| Setup Trigger          | setupTrigger()        |
| Remove Triggers        | removeTriggers()      |
| Reset Sync Cursor      | resetSyncCursor()     |
| Run Phase 1 Setup      | setupTrackwise()      |

---

## Troubleshooting

**No tasks appearing**
→ Make sure Tasks API is enabled (step 2)
→ Run testSync and check LOG sheet for errors

**Duplicate rows appearing**
→ Check if task was completed multiple times in Google Tasks
→ Run resetSyncCursor then re-test

**MASTER sheet not found error**
→ Run Phase 1 setup first (TrackWise menu → Run Phase 1 Setup)

**Permission error on first run**
→ Apps Script needs permission to access Google Tasks and Sheets
→ Click through the OAuth prompts when running any function for the first time

---

## Sheet ID for Phase 3

Phase 3 (OpenClaw) reads the Sheet via the Sheets API.
Save your Sheet ID now:

URL format: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`

You'll pass this to OpenClaw in Phase 3 config.
