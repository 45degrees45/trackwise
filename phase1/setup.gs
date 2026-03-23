/**
 * TRACKWISE — Phase 1: Sheet Architecture Setup  v2  (Premium UX)
 * Run setupTrackwise() once to build the full sheet structure.
 * Safe to re-run: existing data is never destroyed.
 */

// ─── COLOUR PALETTE ───────────────────────────────────────────────────────────
// Deep Ocean — layered depth, low eye-strain, high readability

const C = {
  // Backgrounds (layered depth)
  BASE:      '#17212E',   // deepest layer — body
  SURFACE:   '#1E2D3E',   // section / card background
  ELEVATED:  '#253446',   // alternate rows / raised elements
  SUBTLE:    '#2D3F52',   // dividers / borders

  // Text
  TEXT:      '#D4E2EE',   // primary   (warm off-white — not harsh pure white)
  DIM:       '#8AABB8',   // secondary / labels
  MUTED:     '#4F6475',   // metadata / annotations

  // Accent palette (soothing — not neon)
  ACCENT:    '#5DA8C9',   // steel blue   — primary headers
  SAGE:      '#68B48A',   // sage green   — success / completed
  GOLD:      '#C49758',   // warm gold    — warnings / uncategorised
  ROSE:      '#B87880',   // soft rose    — danger / overdue
  TEAL:      '#4AADAB',   // teal         — habits / focus log

  // State row backgrounds (very muted — don't compete with text)
  DONE_BG:   '#182C22',
  WARN_BG:   '#2C2110',
  DANGER_BG: '#2C1820',
  HIGH_BG:   '#1C2E1C',
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SHEET_NAMES = {
  DASHBOARD: 'DASHBOARD',
  FOCUS_LOG: 'FOCUS_LOG',
  MASTER:    'MASTER',
  PROJECTS:  'PROJECTS',
  LOG:       'LOG',          // internal Apps Script event log — kept hidden
};

// MASTER column positions (1-indexed)
const MASTER_COLS = {
  ID: 1, TITLE: 2, CATEGORY: 3, PARENT_PROJECT: 4,
  ENERGY: 5, IMPACT: 6, ESTIMATE: 7, STATUS: 8,
  CREATED_DATE: 9, DUE_DATE: 10, COMPLETED_DATE: 11,
  ACTUAL_DURATION: 12, STREAK: 13, LAST_COMPLETED: 14, SCORE_WEIGHT: 15,
};

// FOCUS_LOG column positions (must match sheets_writer.py)
const FL_COLS = {
  ID: 1, DATE: 2, PROJECT: 3, SUBTITLE: 4, TASK: 5,
  START: 6, END: 7, TOTAL_MIN: 8, FOCUSED_MIN: 9,
  REST_MIN: 10, IDLE_MIN: 11, MODE: 12, INTERVALS: 13,
  FOCUS_PCT: 14,   // formula-only — never written by Python
};

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

function setupTrackwise() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupMasterSheet(ss);
  setupProjectsSheet(ss);
  setupFocusLogSheet(ss);
  setupDashboardSheet(ss);
  setupInternalLog(ss);
  reorderSheets(ss);

  SpreadsheetApp.getUi().alert(
    'TrackWise v2 setup complete.\n\n' +
    'Sheets: DASHBOARD  ·  FOCUS_LOG  ·  MASTER  ·  PROJECTS'
  );
}

// ─── MASTER SHEET ─────────────────────────────────────────────────────────────

function setupMasterSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.MASTER);

  const headers = [
    'ID', 'Title', 'Category', 'Parent Project',
    'Energy', 'Impact', 'Estimate (min)',
    'Status', 'Created', 'Due', 'Completed',
    'Duration (min)', 'Streak', 'Last Done', 'Score',
  ];
  setHeaders(sheet, headers, C.BASE, C.ACCENT);

  // Column widths
  const widths = [50, 230, 110, 160, 80, 65, 110, 105, 120, 115, 125, 110, 65, 120, 80];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Body base style (banding overrides alternating rows)
  sheet.getRange(2, 1, 999, 15)
    .setBackground(C.SURFACE)
    .setFontColor(C.TEXT)
    .setFontSize(10)
    .setVerticalAlignment('middle');
  sheet.setRowHeightsForced(2, 999, 24);

  applyBanding(sheet, 15);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);   // freeze ID + Title

  // Dropdowns
  applyDropdown(sheet, 3, ['Task', 'Habit', 'Project Milestone', 'Uncategorized']);
  applyDropdown(sheet, 5, ['High', 'Medium', 'Low', '']);
  applyDropdown(sheet, 8, ['Pending', 'Completed', 'Uncategorized', 'Archived']);

  // Impact: numeric 1–5
  sheet.getRange(2, 6, 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireNumberBetween(1, 5)
      .setAllowInvalid(false)
      .setHelpText('Impact: 1 (minimal) – 5 (critical)')
      .build()
  );

  setMasterFormulas(sheet);
  applyMasterConditionalFormatting(sheet);

  Logger.log('MASTER sheet configured.');
}

function setMasterFormulas(sheet) {
  const last = 1000;
  for (let r = 2; r <= last; r++) {
    // L: Actual duration (minutes between Created and Completed)
    sheet.getRange(r, 12).setFormula(
      `=IF(AND(I${r}<>"",K${r}<>""),ROUND((K${r}-I${r})*1440,0),"")`
    );
    // N: Last completed date for this title
    sheet.getRange(r, 14).setFormula(
      `=IF(B${r}="","",IFERROR(MAXIFS(K$2:K$${last},B$2:B$${last},B${r},K$2:K$${last},"<>"&""),""))`
    );
    // O: Score weight = Impact x (Estimate / 60)
    sheet.getRange(r, 15).setFormula(
      `=IF(AND(F${r}<>"",G${r}<>""),ROUND(F${r}*(G${r}/60),2),"")`
    );
  }

  // M: Streak (habits only — completions in last 30 days)
  for (let r = 2; r <= last; r++) {
    sheet.getRange(r, 13).setFormula(
      `=IF(C${r}<>"Habit","",IFERROR(` +
      `SUMPRODUCT((B$2:B$${last}=B${r})*` +
      `(H$2:H$${last}="Completed")*` +
      `(K$2:K$${last}>=TODAY()-30)),0))`
    );
  }

  // Date column formats
  const dateFmt = 'yyyy-mm-dd hh:mm';
  [9, 10, 11, 14].forEach(col =>
    sheet.getRange(2, col, 999, 1).setNumberFormat(dateFmt)
  );

  // Protect formula columns L, M, N, O
  protectColumns(sheet, [12, 13, 14, 15], 'TrackWise auto-formula — do not edit manually');
}

function applyMasterConditionalFormatting(sheet) {
  const fullRange   = sheet.getRange('A2:O1000');
  const impactRange = sheet.getRange('F2:F1000');

  // Completed -> sage muted
  const doneRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Completed"')
    .setBackground(C.DONE_BG)
    .setFontColor(C.SAGE)
    .setRanges([fullRange])
    .build();

  // Uncategorized -> warm gold
  const uncatRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Uncategorized"')
    .setBackground(C.WARN_BG)
    .setFontColor(C.GOLD)
    .setRanges([fullRange])
    .build();

  // Overdue (past due + still Pending) -> soft rose
  const overdueRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($J2<>"", $J2<TODAY(), $H2="Pending")')
    .setBackground(C.DANGER_BG)
    .setFontColor(C.ROSE)
    .setRanges([fullRange])
    .build();

  // Impact = 5 -> sage tint on Impact cell
  const highImpactRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberEqualTo(5)
    .setBackground(C.HIGH_BG)
    .setFontColor(C.SAGE)
    .setRanges([impactRange])
    .build();

  sheet.setConditionalFormatRules([doneRule, uncatRule, overdueRule, highImpactRule]);
}

// ─── PROJECTS SHEET ───────────────────────────────────────────────────────────

function setupProjectsSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.PROJECTS);

  const headers = [
    'Project Name', 'Goal', 'Target Date',
    'Status', 'Milestones', 'Done', '% Complete',
  ];
  setHeaders(sheet, headers, C.BASE, C.TEAL);

  [210, 270, 120, 110, 105, 80, 100].forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  sheet.getRange(2, 1, 99, 7)
    .setBackground(C.SURFACE)
    .setFontColor(C.TEXT)
    .setFontSize(10)
    .setVerticalAlignment('middle');
  sheet.setRowHeightsForced(2, 99, 24);

  applyBanding(sheet, 7);
  sheet.setFrozenRows(1);

  applyDropdown(sheet, 4, ['Active', 'Completed', 'On Hold', 'Cancelled']);

  // Auto formulas: milestone counts pulled from MASTER
  for (let r = 2; r <= 100; r++) {
    sheet.getRange(r, 5).setFormula(
      `=IFERROR(COUNTIF(MASTER!D$2:D$1000,A${r}),0)`
    );
    sheet.getRange(r, 6).setFormula(
      `=IFERROR(COUNTIFS(MASTER!D$2:D$1000,A${r},MASTER!H$2:H$1000,"Completed"),0)`
    );
    sheet.getRange(r, 7).setFormula(
      `=IF(E${r}=0,"",TEXT(F${r}/E${r},"0%"))`
    );
  }

  sheet.getRange(2, 3, 99, 1).setNumberFormat('yyyy-mm-dd');
  protectColumns(sheet, [5, 6, 7], 'TrackWise auto-calculated — do not edit');

  const pctRange = sheet.getRange('A2:G100');

  // 100% complete -> sage
  const doneRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$G2="100%"')
    .setBackground(C.DONE_BG)
    .setFontColor(C.SAGE)
    .setRanges([pctRange])
    .build();

  // Active -> subtle elevation
  const activeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$D2="Active"')
    .setBackground(C.ELEVATED)
    .setFontColor(C.TEXT)
    .setRanges([pctRange])
    .build();

  sheet.setConditionalFormatRules([doneRule, activeRule]);

  Logger.log('PROJECTS sheet configured.');
}

// ─── FOCUS LOG SHEET ──────────────────────────────────────────────────────────

function setupFocusLogSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.FOCUS_LOG);
  sheet.clearConditionalFormatRules();

  // Column widths
  [45, 100, 165, 185, 205, 75, 75, 90, 90, 80, 80, 105, 75, 80]
    .forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // ── Multi-group header row ─────────────────────────────────────────────────
  // Each column group gets a distinct accent colour so the sheet has clear zones.
  //
  //  A–B   Identifiers   (ID, Date)                       → DIM
  //  C–E   Context       (Project, Sub-title, Task)        → ACCENT  steel blue
  //  F–G   Timestamps    (Start, End)                      → MUTED
  //  H–K   Time metrics  (Total, Focus, Rest, Idle)        → TEAL
  //  L–N   Session       (Mode, Intervals, Focus %)        → SAGE

  const headerLabels = [
    'ID', 'Date',
    'Project', 'Sub-title', 'Task',
    'Start', 'End',
    'Total (min)', 'Focus (min)', 'Rest (min)', 'Idle (min)',
    'Mode', 'Intervals', 'Focus %',
  ];
  const headerColors = [
    C.DIM, C.DIM,
    C.ACCENT, C.ACCENT, C.ACCENT,
    C.MUTED, C.MUTED,
    C.TEAL, C.TEAL, C.TEAL, C.TEAL,
    C.SAGE, C.SAGE, C.SAGE,
  ];

  const headerRow = sheet.getRange(1, 1, 1, 14);
  headerRow.setValues([headerLabels]);
  headerRow.setBackground(C.BASE);
  headerRow.setFontWeight('bold');
  headerRow.setFontSize(10);
  headerRow.setVerticalAlignment('middle');

  headerLabels.forEach((_, i) =>
    sheet.getRange(1, i + 1).setFontColor(headerColors[i])
  );

  // Bottom accent line under full header
  headerRow.setBorder(
    false, false, true, false, false, false,
    C.TEAL, SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );
  sheet.setRowHeight(1, 34);

  // Vertical group separators — thick right border after last col of each group
  [2, 5, 7, 11].forEach(col =>
    sheet.getRange(1, col, 1000, 1).setBorder(
      false, false, false, true, false, false,
      C.SUBTLE, SpreadsheetApp.BorderStyle.SOLID
    )
  );

  // ── Body base ─────────────────────────────────────────────────────────────
  sheet.getRange(2, 1, 999, 14)
    .setBackground(C.SURFACE)
    .setFontColor(C.TEXT)
    .setFontSize(10)
    .setVerticalAlignment('middle');
  sheet.setRowHeightsForced(2, 999, 24);

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);   // freeze ID + Date

  // ── Formulas & formats ────────────────────────────────────────────────────
  // Col N = Focus % (auto, never written by Python)
  for (let r = 2; r <= 1000; r++) {
    sheet.getRange(r, 14).setFormula(
      `=IF(H${r}>0,ROUND(I${r}/H${r}*100,0),"")`
    );
  }

  sheet.getRange(2, 2,  999, 1).setNumberFormat('yyyy-mm-dd');   // Date
  sheet.getRange(2, 6,  999, 2).setNumberFormat('hh:mm:ss');     // Start / End
  sheet.getRange(2, 14, 999, 1).setNumberFormat('0"%"');         // Focus %

  protectColumns(sheet, [14], 'Auto-calculated — do not edit');

  // ── Conditional formatting ─────────────────────────────────────────────────
  // Priority: specific-column rules first, row-level rules last.
  // First matching rule per cell wins.

  const fullRange   = sheet.getRange('A2:N1000');
  const focusPctCol = sheet.getRange('N2:N1000');
  const modeCol     = sheet.getRange('L2:L1000');

  // Focus % spectrum
  const focus85 = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThanOrEqualTo(85)
    .setBackground('#1A3028').setFontColor(C.SAGE).setBold(true)
    .setRanges([focusPctCol]).build();

  const focus70 = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(70, 84)
    .setBackground('#1A2E30').setFontColor(C.TEAL)
    .setRanges([focusPctCol]).build();

  const focus60 = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(60)
    .setBackground('#2E2210').setFontColor(C.GOLD)
    .setRanges([focusPctCol]).build();

  // Mode badge — colour only the Mode cell
  const modePomodoro = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('pomodoro')
    .setBackground('#142630').setFontColor(C.TEAL).setBold(true)
    .setRanges([modeCol]).build();

  const modeDeepwork = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('deepwork')
    .setBackground('#162414').setFontColor(C.SAGE).setBold(true)
    .setRanges([modeCol]).build();

  const modeFree = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('free')
    .setBackground(C.SURFACE).setFontColor(C.DIM)
    .setRanges([modeCol]).build();

  // Alternating row bands — applied last so specific rules above override them.
  // Using MOD(ROW()) instead of the banding API for reliable dark-theme colours.
  const rowEven = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=MOD(ROW(),2)=0')
    .setBackground('#1A2B3C')   // noticeably darker stripe
    .setRanges([fullRange]).build();

  // Rules listed highest-priority first:
  sheet.setConditionalFormatRules([
    focus85, focus70, focus60,        // Focus % column
    modePomodoro, modeDeepwork, modeFree,  // Mode column
    rowEven,                          // alternating rows (fallback for everything else)
  ]);

  Logger.log('FOCUS_LOG sheet configured.');
}

// ─── DASHBOARD SHEET ──────────────────────────────────────────────────────────

function setupDashboardSheet(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.DASHBOARD);
  sheet.clear();
  sheet.clearConditionalFormatRules();

  sheet.setColumnWidth(1, 255);   // label
  sheet.setColumnWidth(2, 165);   // value
  sheet.setColumnWidth(3, 325);   // note
  sheet.setColumnWidth(4, 14);    // right padding

  // Base background
  sheet.getRange('A1:D200').setBackground(C.BASE).setFontColor(C.TEXT);

  // Title bar
  sheet.getRange('A1')
    .setValue('  TRACKWISE')
    .setBackground(C.BASE)
    .setFontColor(C.ACCENT)
    .setFontSize(20)
    .setFontWeight('bold');

  sheet.getRange('B1')
    .setFormula('=TODAY()')
    .setNumberFormat('dddd, d mmmm yyyy')
    .setBackground(C.BASE)
    .setFontColor(C.DIM)
    .setFontSize(11)
    .setHorizontalAlignment('right');

  sheet.getRange('C1').setBackground(C.BASE);

  sheet.getRange('A1:C1').setBorder(
    false, false, true, false, false, false,
    C.ACCENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );
  sheet.setRowHeight(1, 52);

  // Sections
  let row = 3;

  row = dashSection(sheet, row, 'FOCUS  \u00b7  TODAY', C.TEAL, [
    ['Focused hours',
      '=IFERROR(ROUND(SUMIF(FOCUS_LOG!B$2:B$1000,TODAY(),FOCUS_LOG!I$2:I$1000)/60,1),0)',
      ''],
    ['Sessions completed',
      '=IFERROR(COUNTIF(FOCUS_LOG!B$2:B$1000,TODAY()),0)',
      ''],
    ['Focus ratio',
      '=IFERROR(ROUND(SUMIF(FOCUS_LOG!B$2:B$1000,TODAY(),FOCUS_LOG!I$2:I$1000)/SUMIF(FOCUS_LOG!B$2:B$1000,TODAY(),FOCUS_LOG!H$2:H$1000)*100,0)&"%","\\u2014")',
      'Focused \u00f7 Total time'],
    ['Idle time (min)',
      '=IFERROR(SUMIF(FOCUS_LOG!B$2:B$1000,TODAY(),FOCUS_LOG!K$2:K$1000),0)',
      ''],
  ]);
  gapRow(sheet, row++);

  row = dashSection(sheet, row, 'DEEP WORK  \u00b7  LAST 7 DAYS', C.ACCENT, [
    ['Total focus hours',
      '=ROUND(SUMPRODUCT((FOCUS_LOG!B$2:B$1000>=TODAY()-6)*(FOCUS_LOG!B$2:B$1000<=TODAY())*IFERROR(FOCUS_LOG!I$2:I$1000,0))/60,1)',
      ''],
    ['Peak session (min)',
      '=IFERROR(MAXIFS(FOCUS_LOG!I$2:I$1000,FOCUS_LOG!B$2:B$1000,">="&TODAY()-6,FOCUS_LOG!B$2:B$1000,"<="&TODAY()),0)',
      ''],
    ['Total sessions',
      '=SUMPRODUCT((FOCUS_LOG!B$2:B$1000>=TODAY()-6)*(FOCUS_LOG!B$2:B$1000<=TODAY())*1)',
      ''],
    ['High-impact tasks done',
      '=COUNTIFS(MASTER!H$2:H$1000,"Completed",MASTER!F$2:F$1000,5,MASTER!K$2:K$1000,">="&TODAY()-7)',
      'Impact = 5'],
  ]);
  gapRow(sheet, row++);

  row = dashSection(sheet, row, 'HABITS', C.TEAL, [
    ['Active habits',
      '=COUNTIFS(MASTER!C$2:C$1000,"Habit",MASTER!H$2:H$1000,"Pending")',
      ''],
    ['Done today',
      '=COUNTIFS(MASTER!C$2:C$1000,"Habit",MASTER!H$2:H$1000,"Completed",MASTER!K$2:K$1000,">="&TODAY())',
      ''],
    ['7-day adherence',
      '=IFERROR(TEXT(COUNTIFS(MASTER!C$2:C$1000,"Habit",MASTER!H$2:H$1000,"Completed",MASTER!K$2:K$1000,">="&TODAY()-7)/(COUNTIF(MASTER!C$2:C$1000,"Habit")*7),"0%"),"\\u2014")',
      ''],
  ]);
  gapRow(sheet, row++);

  row = dashSection(sheet, row, 'PROJECTS', C.SAGE, [
    ['Active',
      '=COUNTIF(PROJECTS!D$2:D$100,"Active")',
      ''],
    ['Fully complete',
      '=COUNTIF(PROJECTS!G$2:G$100,"100%")',
      ''],
    ['Milestone progress',
      '=IFERROR(TEXT(COUNTIFS(MASTER!C$2:C$1000,"Project Milestone",MASTER!H$2:H$1000,"Completed")/COUNTIF(MASTER!C$2:C$1000,"Project Milestone"),"0%"),"\\u2014")',
      ''],
  ]);
  gapRow(sheet, row++);

  row = dashSection(sheet, row, 'TRIAGE  \u00b7  ACTION NEEDED', C.ROSE, [
    ['Uncategorized items',
      '=COUNTIF(MASTER!H$2:H$1000,"Uncategorized")',
      'Invisible to OpenClaw \u2014 enrich now'],
    ['Overdue & pending',
      '=COUNTIFS(MASTER!J$2:J$1000,"<"&TODAY(),MASTER!H$2:H$1000,"Pending",MASTER!J$2:J$1000,"<>"&"")',
      'Past due date, still open'],
  ]);
  gapRow(sheet, row++);

  dashSection(sheet, row, 'DAILY SCORE', C.GOLD, [
    ['Score weight (today)',
      '=SUMPRODUCT((MASTER!H$2:H$1000="Completed")*(MASTER!K$2:K$1000>=TODAY())*IFERROR(MASTER!O$2:O$1000,0))',
      'Impact \u00d7 (Estimate \u00f7 60)'],
    ['Tasks completed today',
      '=COUNTIFS(MASTER!H$2:H$1000,"Completed",MASTER!K$2:K$1000,">="&TODAY())',
      ''],
  ]);

  sheet.setFrozenRows(1);
  Logger.log('DASHBOARD sheet configured.');
}

/**
 * Renders one dashboard section with a left accent bar.
 * Returns the first row after the last metric row.
 */
function dashSection(sheet, startRow, title, accentColor, metrics) {
  // Label row
  const lbl = sheet.getRange(startRow, 1);
  lbl.setValue(title)
    .setBackground(C.SURFACE)
    .setFontColor(accentColor)
    .setFontWeight('bold')
    .setFontSize(9);
  sheet.getRange(startRow, 2).setBackground(C.SURFACE);
  sheet.getRange(startRow, 3).setBackground(C.SURFACE);

  // Left accent bar on label
  lbl.setBorder(
    false, true, false, false, false, false,
    accentColor, SpreadsheetApp.BorderStyle.SOLID_THICK
  );
  sheet.setRowHeight(startRow, 30);

  // Metric rows
  metrics.forEach((metric, i) => {
    const r = startRow + 1 + i;

    sheet.getRange(r, 1)
      .setValue(metric[0])
      .setBackground(C.ELEVATED)
      .setFontColor(C.DIM)
      .setFontSize(10);

    sheet.getRange(r, 2)
      .setFormula(metric[1])
      .setBackground(C.ELEVATED)
      .setFontColor(C.TEXT)
      .setFontWeight('bold')
      .setFontSize(11);

    sheet.getRange(r, 3)
      .setValue(metric[2] || '')
      .setBackground(C.ELEVATED)
      .setFontColor(C.MUTED)
      .setFontStyle('italic')
      .setFontSize(9);

    // Faint left bar on each metric row
    sheet.getRange(r, 1).setBorder(
      false, true, false, false, false, false,
      C.SUBTLE, SpreadsheetApp.BorderStyle.SOLID
    );
    sheet.setRowHeight(r, 27);
  });

  // Bottom separator on last metric row
  const lastRow = startRow + metrics.length;
  sheet.getRange(lastRow, 1, 1, 3).setBorder(
    false, false, true, false, false, false,
    C.SUBTLE, SpreadsheetApp.BorderStyle.SOLID
  );

  return lastRow + 1;   // first row after section (gap row caller increments)
}

/**
 * Styles a gap row between sections.
 */
function gapRow(sheet, row) {
  sheet.getRange(row, 1, 1, 3).setBackground(C.BASE);
  sheet.setRowHeight(row, 14);
}

// ─── INTERNAL LOG (HIDDEN) ────────────────────────────────────────────────────

function setupInternalLog(ss) {
  const sheet = getOrCreateSheet(ss, SHEET_NAMES.LOG);
  setHeaders(sheet, ['Timestamp', 'Event', 'Title', 'Detail', 'Row'], C.BASE, C.MUTED);
  [160, 120, 200, 360, 60].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.setFrozenRows(1);
  sheet.hideSheet();
  Logger.log('Internal LOG sheet configured.');
}

// ─── SHEET ORDERING ───────────────────────────────────────────────────────────

function reorderSheets(ss) {
  [
    SHEET_NAMES.DASHBOARD,
    SHEET_NAMES.FOCUS_LOG,
    SHEET_NAMES.MASTER,
    SHEET_NAMES.PROJECTS,
    SHEET_NAMES.LOG,
  ].forEach((name, i) => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(i + 1);
    }
  });
  ss.setActiveSheet(ss.getSheetByName(SHEET_NAMES.DASHBOARD));
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

/**
 * Styles a header row with an accent-coloured bottom border.
 */
function setHeaders(sheet, headers, bgColor, accentColor) {
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setBackground(bgColor);
  range.setFontColor(accentColor);
  range.setFontWeight('bold');
  range.setFontSize(10);
  range.setVerticalAlignment('middle');
  range.setBorder(
    false, false, true, false, false, false,
    accentColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );
  sheet.setRowHeight(1, 34);
}

/**
 * Applies alternating row banding using the Deep Ocean palette.
 * Removes any existing banding first so re-runs stay clean.
 */
function applyBanding(sheet, numCols) {
  try {
    sheet.getBandings().forEach(b => b.remove());
  } catch (_) {}

  sheet.getRange(2, 1, 998, numCols)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
    .setFirstRowColor(C.SURFACE)
    .setSecondRowColor(C.ELEVATED);
}

function applyDropdown(sheet, col, values) {
  sheet.getRange(2, col, 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(values, true)
      .setAllowInvalid(false)
      .build()
  );
}

/**
 * Warning-only protection on formula columns (warns but doesn't hard-lock).
 */
function protectColumns(sheet, cols, description) {
  cols.forEach(col => {
    sheet.getRange(1, col, 1000, 1)
      .protect()
      .setDescription(description)
      .setWarningOnly(true);
  });
}
