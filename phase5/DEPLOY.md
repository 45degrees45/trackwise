# TrackWise Phase 5 — Deployment Guide

This guide walks you through deploying the Phase 5 enhancements to TrackWise. Phase 5 adds automatic task completion sync from Google Tasks and manual form-based entry, with a dashboard for analytics.

**Prerequisites:**
- Phases 1–2 of TrackWise already deployed (you have a TrackWise sheet with existing configs)
- Access to Google Apps Script (attached to the TrackWise spreadsheet)
- A Google Tasks account with task lists you want to track (e.g., "Work", "Personal", "Habit")

---

## Step 1: Add `sync_timelog.gs` Script

**What it does:** Polls all your Google Tasks lists every 10 minutes and automatically appends completed tasks to a new `TIME_LOG` sheet.

1. Open your **TrackWise spreadsheet** in Google Sheets
2. Click **Extensions** → **Apps Script**
3. In the Apps Script editor, click the **+** next to "Files" on the left
4. Select **New file** → enter the name `sync_timelog`
5. Copy the entire contents of `phase5/sync_timelog.gs` from this repository
6. Paste it into the new file (replace any placeholder code)
7. Click **Save**

**Result:** You should see `sync_timelog.gs` listed in the Files panel.

---

## Step 2: Add `form_handler.gs` Script

**What it does:** Handles submissions from a Google Form you'll create later, appending manual task entries to `TIME_LOG`.

1. Still in Apps Script, click the **+** next to "Files"
2. Select **New file** → enter the name `form_handler`
3. Copy the entire contents of `phase5/form_handler.gs` from this repository
4. Paste it into the new file
5. Click **Save**

**Result:** You now have both `sync_timelog.gs` and `form_handler.gs` listed in the Files panel.

---

## Step 3: Enable the Google Tasks API

The `sync_timelog.gs` script needs permission to read your Google Tasks lists.

1. In the Apps Script editor, click **Services** (left sidebar, below Files)
2. Click the **+** button to add a new service
3. Search for **"Tasks API"** in the dialog
4. Select **"Tasks API v1"** from the list
5. Click **Add**

**Result:** "Tasks API v1" now appears in your Services list.

---

## Step 4: Run Setup Functions

The two setup functions create the `TIME_LOG` sheet and register the automatic sync trigger.

1. In the Apps Script editor, click the function dropdown menu (next to the ▶ play button) at the top
2. Select **`setupTimeLogSheet`** from the dropdown
3. Click the **▶ play button** to run it
4. Check the **Execution Log** at the bottom (should say `TIME_LOG sheet created`)

**Second setup function:**

5. Click the function dropdown again
6. Select **`setupTimeTrigger`** from the dropdown
7. Click **▶ play** to run it
8. Check the **Execution Log** (should say `10-minute trigger registered for syncCompletionTimes`)

**Result:** Your TrackWise sheet now has a new `TIME_LOG` tab with headers (ID, Task Name, Task List, Completed Date, Completed Time, Hour, Day of Week, Week No, Month, Month No, Year).

---

## Step 5: Run Initial Backfill (Manual)

To populate `TIME_LOG` with your past completed tasks, run the sync function once manually.

1. In the Apps Script editor, click the function dropdown
2. Select **`syncCompletionTimes`**
3. Click **▶ play**
4. Check the **Execution Log** — you should see a message like:
   ```
   syncCompletionTimes: added N rows
   ```
   where N is the number of past completed tasks found.

**Expected result:** Your `TIME_LOG` sheet now contains historical completions. From now on, new completions will sync automatically every 10 minutes.

---

## Step 6: Create a Google Form

The Google Form provides a UI for manually logging task completions (useful when tasks aren't in Google Tasks).

1. Go to **Google Forms** (https://forms.google.com/)
2. Click **+ Create** → **Blank form**
3. Enter the title: **TrackWise Task Logger**
4. Click **Untitled form** and add a description (optional):
   ```
   Log completed tasks manually for quick entry.
   ```

**Now add 4 questions:**

**Question 1: Task Name**
- Click **+ Add question**
- Title: `Task Name`
- Type: **Short answer**
- Check: **Required**

**Question 2: Task List**
- Click **+ Add question**
- Title: `Task List`
- Type: **Dropdown**
- Options (paste each on a new line):
  ```
  Manual
  Work
  Personal
  Habit
  Other
  ```
- Check: **Required**

**Question 3: Completed Date**
- Click **+ Add question**
- Title: `Completed Date`
- Type: **Date**
- Check: **Required**

**Question 4: Completed Time**
- Click **+ Add question**
- Title: `Completed Time`
- Type: **Short answer**
- Description: `HH:MM AM/PM (e.g., 2:30 PM) — optional, defaults to current time`
- Check: **Optional** (do not check required)

---

## Step 7: Link Google Form to TrackWise Sheet

1. In the Google Form editor, click the **three dots menu** (⋯) at the top-right
2. Select **Responses** (or click the **Responses** tab)
3. Click **Link to Sheets** (or the **Google Sheets icon**)
4. A dialog opens:
   - Select **Select existing spreadsheet**
   - Find and click your **TrackWise** sheet
   - Click **Select**

**Result:** Form responses now write to a hidden response sheet in your TrackWise workbook. The `onFormSubmit` trigger will catch these and copy them to `TIME_LOG`.

---

## Step 8: Register the onFormSubmit Trigger

This trigger automatically runs the `form_handler.gs` code whenever someone submits the form.

1. Go back to **Apps Script** (from your TrackWise sheet)
2. In the left sidebar, click **Triggers** (below Services)
3. Click **+ Add Trigger** at the bottom
4. A dialog opens. Fill it in:
   - **Choose the function to run:** `onFormSubmit`
   - **Which deployment should be used:** `Head`
   - **Select event source:** `From spreadsheet`
   - **Select event type:** `On form submit`
   - Click **Save**

**Result:** Future form submissions will automatically append to `TIME_LOG`.

---

## Step 9: Create the DASHBOARD Sheet

The dashboard provides at-a-glance stats and heatmaps of your task completion.

1. Go back to your **TrackWise spreadsheet**
2. Click the **+** at the bottom to add a new sheet
3. Rename it to **`DASHBOARD`** (right-click the tab → Rename)

Now you'll populate this sheet with formulas. Refer to **`phase5/DASHBOARD_FORMULAS.md`** for detailed formulas and their locations.

**Quick summary of dashboard sections:**

- **Today Stats (Rows 1–4):** Task counts and peak hour
- **Recent Completions (Rows 6–16):** Last 10 tasks, newest first
- **Weekly Hour Heatmap (Rows 18–21):** How many tasks per hour this week
- **Monthly Day Heatmap (Rows 23–30):** Calendar view with task counts per day
- **Yearly Month Heatmap (Rows 33–35):** Monthly summary for the year

### Fastest setup:
Use the spreadsheet UI to copy-paste formulas from `DASHBOARD_FORMULAS.md` cell by cell. For exact cell locations and complete formulas, see that document.

---

## Step 10: Verification Checklist

Before considering Phase 5 complete, verify these 5 items:

- [ ] **TIME_LOG sheet exists** with headers (ID, Task Name, Task List, Completed Date, etc.)
- [ ] **Manual backfill worked** — TIME_LOG contains at least 1 row of historical data after running `syncCompletionTimes()`
- [ ] **Google Form works** — submit a test entry and confirm it appears in TIME_LOG within a few seconds
- [ ] **Automatic sync is active** — check Apps Script → Triggers to confirm `syncCompletionTimes` has a 10-minute trigger
- [ ] **DASHBOARD sheet displays data** — at least one cell on DASHBOARD shows a number (e.g., "Tasks Today" counts from TIME_LOG)

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| **`setupTimeLogSheet()` fails** | TIME_LOG sheet already exists or spreadsheet is read-only | Check if TIME_LOG tab is already in your sheet; if yes, you can skip this step. If spreadsheet is read-only, ask for edit access. |
| **`syncCompletionTimes()` returns 0 rows** | No completed tasks in Google Tasks, or Tasks API not enabled | Verify you have completed tasks in Google Tasks. Go to Apps Script → Services and confirm "Tasks API v1" is listed. |
| **Google Form won't submit** | Form is not linked to TrackWise sheet | Go to Form Responses → Link to Sheets → select your TrackWise spreadsheet. |
| **onFormSubmit trigger doesn't fire** | Trigger not registered, or event source set wrong | Go to Apps Script → Triggers. You should see one trigger with function `onFormSubmit`, event source `From spreadsheet`, event type `On form submit`. If missing, re-add it following Step 8. |
| **DASHBOARD shows `#NAME?` or `#REF!` errors** | Formula references wrong sheet name or syntax error | Check that all formulas reference `TIME_LOG` (not `Timelog` or other variants). Verify exact cell references match `DASHBOARD_FORMULAS.md`. |
| **TIME_LOG grows but DASHBOARD counts are 0** | Formulas not reading TIME_LOG correctly | Ensure TIME_LOG data starts in row 2 (row 1 is headers). Verify DASHBOARD formulas use `TIME_LOG!D:D` (not other sheet names). |
| **Duplicate entries in TIME_LOG after syncing** | `isDuplicate()` function not working correctly | Re-run `syncCompletionTimes()` — the sync cursor prevents re-syncing the same time window. If still stuck, manually delete duplicates from TIME_LOG. |

---

## What's Next?

**Phase 6** (future) could add:
- Detailed time-tracking per task (break down the 1-minute tasks vs. 1-hour tasks)
- Weekly summaries emailed to you
- Mobile app form shortcut
- Advanced filtering by date range or task list

For now, enjoy your automatic task completion tracking! Check the DASHBOARD daily to see your trends.

---

## Rollback / Uninstall

If something goes wrong and you want to remove Phase 5:

1. **Delete the TIME_LOG sheet** — right-click the tab → Delete sheet
2. **Delete the two scripts** — in Apps Script, right-click `sync_timelog.gs` and `form_handler.gs` → Delete file
3. **Remove the triggers** — in Apps Script → Triggers → click the trash icon next to each trigger
4. **Delete the Google Form** (optional) — go to Google Forms, click the form, click ⋯ → Delete
5. **Delete the DASHBOARD sheet** (optional) — right-click the tab → Delete sheet

Your original TrackWise data and configurations remain untouched.
