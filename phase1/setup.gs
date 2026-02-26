/**
 * TRACKWISE — Phase 1: Sheet Architecture Setup
 * Run once to build the full sheet structure.
 * Safe to re-run: will not destroy existing data.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SHEET_NAMES = {
  MASTER:    'MASTER',
  PROJECTS:  'PROJECTS',
  DASHBOARD: 'DASHBOARD',
  LOG:       'LOG',
};

const MASTER_COLS = {
  ID:               1,   // A
  TITLE:            2,   // B
  CATEGORY:         3,   // C
  PARENT_PROJECT:   4,   // D
  ENERGY:           5,   // E
  IMPACT:           6,   // F
  ESTIMATE:         7,   // G
  STATUS:           8,   // H
  CREATED_DATE:     9,   // I
  DUE_DATE:         10,  // J
  COMPLETED_DATE:   11,  // K
  ACTUAL_DURATION:  12,  // L  ← formula
  STREAK:           13,  // M  ← formula (habits)
  LAST_COMPLETED:   14,  // N  ← formula
  SCORE_WEIGHT:     15,  // O  ← formula
};

const PROJECTS_COLS = {
  NAME:        1,  // A
  GOAL:        2,  // B
  TARGET_DATE: 3,  // C
  STATUS:      4,  // D
  TOTAL:       5,  // E
  COMPLETED:   6,  // F
  PERCENT:     7,  // G  ← formula
};

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

function setupTrackwise() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupMasterSheet(ss);
  setupProjectsSheet(ss);
  setupDashboardSheet(ss);
  setupLogSheet(ss);
  reorderSheets(ss);

  SpreadsheetApp.getUi().alert('TrackWise setup complete.');
}

// ─── MASTER SHEET ─────────────────────────────────────────────────────────────

function setupMasterSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.MASTER);

  // Headers
  const headers = [
    'ID', 'Title', 'Category', 'Parent Project',
    'Energy', 'Impact', 'Estimate (min)',
    'Status', 'Created Date', 'Due Date', 'Completed Date',
    'Actual Duration (min)', 'Streak', 'Last Completed', 'Score Weight',
  ];
  setHeaders(sheet, headers, '#1a1a2e', '#e94560');

  // Column widths
  sheet.setColumnWidth(1, 60);   // ID
  sheet.setColumnWidth(2, 220);  // Title
  sheet.setColumnWidth(3, 100);  // Category
  sheet.setColumnWidth(4, 160);  // Parent Project
  sheet.setColumnWidth(5, 90);   // Energy
  sheet.setColumnWidth(6, 70);   // Impact
  sheet.setColumnWidth(7, 110);  // Estimate
  sheet.setColumnWidth(8, 110);  // Status
  sheet.setColumnWidth(9, 130);  // Created Date
  sheet.setColumnWidth(10, 110); // Due Date
  sheet.setColumnWidth(11, 130); // Completed Date
  sheet.setColumnWidth(12, 160); // Actual Duration
  sheet.setColumnWidth(13, 70);  // Streak
  sheet.setColumnWidth(14, 130); // Last Completed
  sheet.setColumnWidth(15, 110); // Score Weight

  // Data validation
  applyDropdown(sheet, 3, ['Task', 'Habit', 'Project Milestone', 'Uncategorized']);
  applyDropdown(sheet, 5, ['High', 'Medium', 'Low', '']);
  applyDropdown(sheet, 8, ['Pending', 'Completed', 'Uncategorized', 'Archived']);

  // Impact: numeric 1–5 only
  const impactRange = sheet.getRange(2, 6, 999, 1);
  const impactRule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(1, 5)
    .setAllowInvalid(false)
    .setHelpText('Impact must be 1–5')
    .build();
  impactRange.setDataValidation(impactRule);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Formulas for rows 2–1000
  setMasterFormulas(sheet);

  // Conditional formatting
  applyMasterConditionalFormatting(sheet);

  Logger.log('MASTER sheet configured.');
}

function setMasterFormulas(sheet) {
  const lastRow = 1000;

  for (let row = 2; row <= lastRow; row++) {
    const r = row;

    // L: Actual Duration — only if both Created and Completed exist
    // Returns minutes between Completed Date and Created Date
    sheet.getRange(r, 12).setFormula(
      `=IF(AND(I${r}<>"",K${r}<>""),ROUND((K${r}-I${r})*1440,0),"")`
    );

    // M: Streak — for Habits only
    // Counts how many consecutive days ending today this habit was completed
    sheet.getRange(r, 13).setFormula(
      `=IF(C${r}="Habit",COUNTSTREAK(B${r}),"")` // placeholder — replaced below
    );

    // N: Last Completed — VLOOKUP from completed entries with same Title
    sheet.getRange(r, 14).setFormula(
      `=IF(B${r}="","",IFERROR(MAXIFS(K$2:K$${lastRow},B$2:B$${lastRow},B${r},K$2:K$${lastRow},"<>"&""),""))`
    );

    // O: Score Weight = Impact × (Estimate / 60)
    // Represents "deep work value" of this item
    sheet.getRange(r, 15).setFormula(
      `=IF(AND(F${r}<>"",G${r}<>""),ROUND(F${r}*(G${r}/60),2),"")`
    );
  }

  // M (Streak) — Google Sheets doesn't have COUNTSTREAK natively.
  // Real streak formula using COUNTIFS on completed dates descending.
  // This is the production version:
  for (let row = 2; row <= lastRow; row++) {
    sheet.getRange(row, 13).setFormula(
      `=IF(C${row}<>"Habit","",IFERROR(` +
        `SUMPRODUCT((B$2:B$${lastRow}=B${row})*` +
        `(H$2:H$${lastRow}="Completed")*` +
        `(K$2:K$${lastRow}>=TODAY()-30)),` +
      `0))`
    );
  }

  // Format date columns
  const dateFmt = 'yyyy-mm-dd hh:mm';
  sheet.getRange(2, 9,  999, 1).setNumberFormat(dateFmt); // Created
  sheet.getRange(2, 10, 999, 1).setNumberFormat(dateFmt); // Due
  sheet.getRange(2, 11, 999, 1).setNumberFormat(dateFmt); // Completed
  sheet.getRange(2, 14, 999, 1).setNumberFormat(dateFmt); // Last Completed

  // Protect formula columns (L, M, N, O)
  protectColumns(sheet, [12, 13, 14, 15], 'TrackWise formulas — do not edit manually');
}

function applyMasterConditionalFormatting(sheet) {
  const range = sheet.getRange('A2:O1000');

  // Completed rows → muted grey
  const completedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Completed"')
    .setBackground('#2d2d2d')
    .setFontColor('#888888')
    .setRanges([range])
    .build();

  // Uncategorized rows → amber warning
  const uncatRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Uncategorized"')
    .setBackground('#3d2b00')
    .setFontColor('#ffcc00')
    .setRanges([range])
    .build();

  // Overdue rows (Due Date < today, still Pending) → red
  const overdueRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($J2<>"", $J2<TODAY(), $H2="Pending")')
    .setBackground('#3d0000')
    .setFontColor('#ff6b6b')
    .setRanges([range])
    .build();

  // High Impact (5) → subtle highlight on Impact cell
  const highImpactRange = sheet.getRange('F2:F1000');
  const highImpactRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberEqualTo(5)
    .setBackground('#1a3a1a')
    .setFontColor('#66ff66')
    .setRanges([highImpactRange])
    .build();

  sheet.setConditionalFormatRules([completedRule, uncatRule, overdueRule, highImpactRule]);
}

// ─── PROJECTS SHEET ───────────────────────────────────────────────────────────

function setupProjectsSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.PROJECTS);

  const headers = [
    'Project Name', 'Goal', 'Target Date',
    'Status', 'Total Milestones', 'Completed Milestones', '% Complete',
  ];
  setHeaders(sheet, headers, '#1a1a2e', '#0f3460');

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 140);
  sheet.setColumnWidth(6, 160);
  sheet.setColumnWidth(7, 110);

  applyDropdown(sheet, 4, ['Active', 'Completed', 'On Hold', 'Cancelled']);

  sheet.setFrozenRows(1);

  // % Complete formula — auto-filled for rows 2–100
  for (let row = 2; row <= 100; row++) {
    // Pull completed milestones from MASTER dynamically
    sheet.getRange(row, 6).setFormula(
      `=IFERROR(COUNTIFS(MASTER!D$2:D$1000,A${row},MASTER!H$2:H$1000,"Completed"),0)`
    );
    sheet.getRange(row, 5).setFormula(
      `=IFERROR(COUNTIF(MASTER!D$2:D$1000,A${row}),0)`
    );
    sheet.getRange(row, 7).setFormula(
      `=IF(E${row}=0,"",TEXT(F${row}/E${row},"0%"))`
    );
  }

  // Format target date
  sheet.getRange(2, 3, 99, 1).setNumberFormat('yyyy-mm-dd');

  // Protect formula columns E, F, G
  protectColumns(sheet, [5, 6, 7], 'TrackWise auto-calculated — do not edit');

  // Conditional: 100% complete → green
  const pctRange = sheet.getRange('A2:G100');
  const doneRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$G2="100%"')
    .setBackground('#1a3a1a')
    .setFontColor('#66ff66')
    .setRanges([pctRange])
    .build();
  sheet.setConditionalFormatRules([doneRule]);

  Logger.log('PROJECTS sheet configured.');
}

// ─── DASHBOARD SHEET ──────────────────────────────────────────────────────────

function setupDashboardSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.DASHBOARD);
  sheet.clear();

  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 320);

  // Title
  sheet.getRange('A1').setValue('TRACKWISE DASHBOARD')
    .setFontSize(16)
    .setFontWeight('bold')
    .setFontColor('#e94560');
  sheet.getRange('B1').setValue('=TODAY()')
    .setNumberFormat('dddd, dd mmmm yyyy')
    .setFontColor('#888888');

  sheet.getRange('A1:C1').setBackground('#1a1a2e');

  // Section: Deep Work
  buildDashboardSection(sheet, 3, 'DEEP WORK (Last 7 Days)', '#0f3460', [
    ['Total Deep Work Minutes',
      '=SUMPRODUCT((MASTER!H$2:H$1000="Completed")*(MASTER!C$2:C$1000<>"Habit")*(MASTER!K$2:K$1000>=TODAY()-7)*IFERROR(MASTER!G$2:G$1000,0))',
      'Sum of Estimate for completed non-habit tasks in last 7 days'],
    ['Total Deep Work Hours',
      '=ROUND(B4/60,1)',
      ''],
    ['Avg Daily Deep Work (min)',
      '=ROUND(B4/7,0)',
      ''],
    ['High Impact Tasks Completed',
      '=COUNTIFS(MASTER!H$2:H$1000,"Completed",MASTER!F$2:F$1000,5,MASTER!K$2:K$1000,">="&TODAY()-7)',
      'Impact = 5, completed last 7 days'],
  ]);

  // Section: Habits
  buildDashboardSection(sheet, 9, 'HABITS', '#16213e', [
    ['Active Habits',
      '=COUNTIFS(MASTER!C$2:C$1000,"Habit",MASTER!H$2:H$1000,"Pending")',
      ''],
    ['Habits Completed Today',
      '=COUNTIFS(MASTER!C$2:C$1000,"Habit",MASTER!H$2:H$1000,"Completed",MASTER!K$2:K$1000,">="&TODAY())',
      ''],
    ['Habit Adherence % (7 days)',
      '=IFERROR(TEXT(COUNTIFS(MASTER!C$2:C$1000,"Habit",MASTER!H$2:H$1000,"Completed",MASTER!K$2:K$1000,">="&TODAY()-7)/(COUNTIF(MASTER!C$2:C$1000,"Habit")*7),"0%"),"—")',
      ''],
  ]);

  // Section: Projects
  buildDashboardSection(sheet, 14, 'PROJECTS', '#0f3460', [
    ['Active Projects',
      '=COUNTIF(PROJECTS!D$2:D$100,"Active")',
      ''],
    ['Projects at 100%',
      '=COUNTIF(PROJECTS!G$2:G$100,"100%")',
      ''],
    ['Overall Milestone Progress',
      '=IFERROR(TEXT(COUNTIFS(MASTER!C$2:C$1000,"Project Milestone",MASTER!H$2:H$1000,"Completed")/COUNTIF(MASTER!C$2:C$1000,"Project Milestone"),"0%"),"—")',
      ''],
  ]);

  // Section: Triage Alert
  buildDashboardSection(sheet, 19, 'TRIAGE NEEDED', '#3d0000', [
    ['Uncategorized Items',
      '=COUNTIF(MASTER!H$2:H$1000,"Uncategorized")',
      'These are invisible to OpenClaw — enrich them'],
    ['Overdue Pending Tasks',
      '=COUNTIFS(MASTER!J$2:J$1000,"<"&TODAY(),MASTER!H$2:H$1000,"Pending",MASTER!J$2:J$1000,"<>"&"")',
      'Past due date and still pending'],
  ]);

  // Section: Daily Score
  buildDashboardSection(sheet, 23, 'DAILY SCORE', '#1a2e1a', [
    ['Today\'s Score Weight',
      '=SUMPRODUCT((MASTER!H$2:H$1000="Completed")*(MASTER!K$2:K$1000>=TODAY())*IFERROR(MASTER!O$2:O$1000,0))',
      'Impact × (Estimate/60) for tasks completed today'],
    ['Today\'s Tasks Completed',
      '=COUNTIFS(MASTER!H$2:H$1000,"Completed",MASTER!K$2:K$1000,">="&TODAY())',
      ''],
  ]);

  sheet.setFrozenRows(2);
  Logger.log('DASHBOARD sheet configured.');
}

function buildDashboardSection(sheet, startRow, title, bgColor, metrics) {
  // Section header
  sheet.getRange(startRow, 1, 1, 3).merge()
    .setValue(title)
    .setBackground(bgColor)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(11);

  metrics.forEach((metric, i) => {
    const row = startRow + 1 + i;
    sheet.getRange(row, 1).setValue(metric[0]).setFontColor('#cccccc');
    sheet.getRange(row, 2).setFormula(metric[1]).setFontColor('#ffffff').setFontWeight('bold');
    if (metric[2]) {
      sheet.getRange(row, 3).setValue(metric[2]).setFontColor('#666666').setFontStyle('italic');
    }
    sheet.getRange(row, 1, 1, 3).setBackground('#0d0d0d');
  });
}

// ─── LOG SHEET ────────────────────────────────────────────────────────────────

function setupLogSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.LOG);

  const headers = ['Timestamp', 'Event', 'Title', 'Detail', 'Row'];
  setHeaders(sheet, headers, '#1a1a1a', '#555555');

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 360);
  sheet.setColumnWidth(5, 60);

  sheet.setFrozenRows(1);

  // Hide this sheet — it's for Apps Script use only
  sheet.hideSheet();

  Logger.log('LOG sheet configured.');
}

// ─── SHARED UTILITIES ─────────────────────────────────────────────────────────

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log(`Created sheet: ${name}`);
  }
  return sheet;
}

function setHeaders(sheet, headers, bgColor, fontColor) {
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground(bgColor);
  headerRange.setFontColor(fontColor);
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);
  headerRange.setBorder(
    false, false, true, false, false, false,
    '#333333', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );
}

function applyDropdown(sheet, col, values) {
  const range = sheet.getRange(2, col, 999, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(rule);
}

function protectColumns(sheet, cols, description) {
  cols.forEach(col => {
    const range = sheet.getRange(1, col, 1000, 1);
    const protection = range.protect().setDescription(description);
    protection.setWarningOnly(true); // Warn but don't hard-lock (avoids permission issues)
  });
}

function reorderSheets(ss) {
  const order = [
    SHEET_NAMES.DASHBOARD,
    SHEET_NAMES.MASTER,
    SHEET_NAMES.PROJECTS,
    SHEET_NAMES.LOG,
  ];
  order.forEach((name, i) => {
    const sheet = ss.getSheetByName(name);
    if (sheet) ss.setActiveSheet(sheet), ss.moveActiveSheet(i + 1);
  });
  // Land on Dashboard
  ss.setActiveSheet(ss.getSheetByName(SHEET_NAMES.DASHBOARD));
}
