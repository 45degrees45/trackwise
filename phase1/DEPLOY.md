# Phase 1 Deployment — Sheet Architecture

## Steps

1. Open a new Google Sheet
   - Name it: `TrackWise`

2. Open Apps Script
   - Extensions → Apps Script
   - Delete the default `Code.gs` content

3. Paste `setup.gs` content into `Code.gs`

4. Click Save (Ctrl+S)

5. Run `setupTrackwise`
   - Select function: `setupTrackwise`
   - Click Run
   - Approve permissions when prompted

6. Verify four sheets were created:
   - DASHBOARD (active)
   - MASTER
   - PROJECTS
   - LOG (hidden)

---

## What Gets Built

### MASTER sheet
- 15 columns with headers, dropdowns, formulas
- Columns L, M, N, O are formula-protected (warning only)
- Conditional formatting:
  - Completed rows → grey
  - Uncategorized rows → amber
  - Overdue rows → red
  - Impact 5 → green highlight

### PROJECTS sheet
- 7 columns
- Columns E, F, G auto-calculate from MASTER
- % Complete pulls live from MASTER milestone counts

### DASHBOARD sheet
- 5 metric sections:
  - Deep Work (last 7 days)
  - Habits
  - Projects
  - Triage Needed ← critical alert
  - Daily Score

### LOG sheet
- Hidden
- Used by Phase 2 Apps Script for sync logging

---

## First Data Entry

After setup, add your first row to MASTER manually:

| Field          | Value           |
|----------------|-----------------|
| ID             | 1               |
| Title          | Walk 5k         |
| Category       | Habit           |
| Energy         | Low             |
| Impact         | 3               |
| Estimate       | 45              |
| Status         | Pending         |
| Created Date   | today           |

Formulas in L, M, N, O will auto-populate.

---

## Sheet ID (needed for Phase 2 + 3)

After creating the sheet, copy the Sheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
```

Save this. Phase 2 Apps Script and Phase 3 OpenClaw both need it.
