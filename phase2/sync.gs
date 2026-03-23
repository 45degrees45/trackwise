/**
 * TRACKWISE — Phase 2: Google Tasks Sync
 *
 * Runs every 10 minutes via time-driven trigger.
 * Detects completed Google Tasks → writes to MASTER sheet.
 *
 * REQUIRES: Tasks API enabled under Extensions → Apps Script → Services → Tasks API v1
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PROPS        = PropertiesService.getScriptProperties();
const LAST_SYNC_KEY = 'TRACKWISE_LAST_SYNC';
const MASTER_DATETIME_FORMAT = 'yyyy-mm-dd hh:mm:ss am/pm';

const COL = {
  ID:              1,
  TITLE:           2,
  CATEGORY:        3,
  PARENT_PROJECT:  4,
  ENERGY:          5,
  IMPACT:          6,
  ESTIMATE:        7,
  STATUS:          8,
  CREATED_DATE:    9,
  DUE_DATE:        10,
  COMPLETED_DATE:  11,
  // L, M, N, O are formula columns — never write to them directly
};

const STATUS = {
  PENDING:        'Pending',
  COMPLETED:      'Completed',
  UNCATEGORIZED:  'Uncategorized',
  ARCHIVED:       'Archived',
};

const CATEGORY = {
  TASK:       'Task',
  HABIT:      'Habit',
  MILESTONE:  'Project Milestone',
  UNCAT:      'Uncategorized',
};

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

/**
 * Called by time-driven trigger every 10 minutes.
 * Safe to run manually for testing.
 */
function syncCompletedTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName('MASTER');

  if (!master) {
    logEvent(ss, 'ERROR', 'SYSTEM', 'MASTER sheet not found. Run Phase 1 setup first.', 0);
    return;
  }

  // Ensure Created/Due/Completed columns always show full timestamp.
  // This keeps completion time visible even on older sheets with date-only formats.
  ensureMasterDateTimeFormats(master);

  // Determine sync window
  const rawLastSync = PROPS.getProperty(LAST_SYNC_KEY);
  const sinceDate   = rawLastSync
    ? new Date(rawLastSync)
    : new Date(Date.now() - 24 * 60 * 60 * 1000); // first run: look back 24h

  logEvent(ss, 'SYNC_START', 'SYSTEM', `Syncing tasks completed since ${sinceDate.toISOString()}`, 0);

  // Fetch completed tasks from all Google Task lists
  let completedTasks = [];
  try {
    completedTasks = fetchCompletedTasks(sinceDate);
  } catch (e) {
    logEvent(ss, 'ERROR', 'TASKS_API', `Failed to fetch: ${e.message}`, 0);
    return;
  }

  if (completedTasks.length === 0) {
    logEvent(ss, 'SYNC_DONE', 'SYSTEM', 'No new completions.', 0);
    PROPS.setProperty(LAST_SYNC_KEY, new Date().toISOString());
    return;
  }

  // Load MASTER data once — avoid repeated sheet reads in a loop
  const masterData = getMasterData(master);

  let processed = 0;
  completedTasks.forEach(task => {
    try {
      const result = processTask(ss, master, masterData, task);
      if (result) processed++;
    } catch (e) {
      logEvent(ss, 'ERROR', task.title || 'UNKNOWN', e.message, 0);
    }
  });

  PROPS.setProperty(LAST_SYNC_KEY, new Date().toISOString());
  logEvent(ss, 'SYNC_DONE', 'SYSTEM', `Processed ${processed} / ${completedTasks.length} task(s).`, 0);
}

// ─── GOOGLE TASKS API ─────────────────────────────────────────────────────────

/**
 * Returns all tasks completed after sinceDate across all task lists.
 * @param {Date} sinceDate
 * @returns {Array<{title, completedAt, dueDate, tasklistName, googleTaskId}>}
 */
function fetchCompletedTasks(sinceDate) {
  const completedMin = sinceDate.toISOString();
  const results      = [];

  // Get all task lists
  const lists = Tasks.Tasklists.list({ maxResults: 100 });
  if (!lists.items || lists.items.length === 0) return results;

  lists.items.forEach(list => {
    try {
      const response = Tasks.Tasks.list(list.id, {
        showCompleted:  true,
        showHidden:     true,    // completed tasks are hidden by default
        completedMin:   completedMin,
        maxResults:     100,
      });

      if (!response.items) return;

      response.items.forEach(task => {
        // Only process truly completed tasks in the window
        if (task.status !== 'completed' || !task.completed) return;

        const completedAt = new Date(task.completed);
        if (completedAt <= sinceDate) return;

        results.push({
          title:          (task.title || '').trim(),
          completedAt:    completedAt,
          dueDate:        task.due ? new Date(task.due) : null,
          tasklistName:   list.title,
          googleTaskId:   task.id,
        });
      });
    } catch (e) {
      // Don't abort all lists if one fails — log and continue
      Logger.log(`Error reading list "${list.title}": ${e.message}`);
    }
  });

  return results;
}

// ─── TASK PROCESSING ──────────────────────────────────────────────────────────

/**
 * Routes a completed task to the correct handler.
 * Returns true if successfully processed.
 */
function processTask(ss, master, masterData, task) {
  if (!task.title) {
    logEvent(ss, 'SKIP', 'UNKNOWN', 'Task has no title — skipped.', 0);
    return false;
  }

  // Find matching row in MASTER by title
  const matchIndex = findPendingRow(masterData, task.title);

  if (matchIndex === -1) {
    // No match — create Uncategorized capture row
    createUncategorizedRow(ss, master, masterData, task);
    logEvent(ss, 'UNMATCHED', task.title, `No Pending row found. Created Uncategorized.`, 0);
    return true;
  }

  const rowData    = masterData[matchIndex];
  const sheetRow   = matchIndex + 2; // +2 because masterData is 0-indexed, row 1 is header
  const category   = rowData[COL.CATEGORY - 1] || CATEGORY.UNCAT;

  if (category === CATEGORY.HABIT) {
    // Habits: keep Pending definition, log a new Completed row
    logHabitCompletion(ss, master, masterData, rowData, task);
    logEvent(ss, 'HABIT', task.title, `Habit completion logged.`, sheetRow);
  } else {
    // Tasks and Project Milestones: mark the existing row as Completed
    markRowCompleted(master, sheetRow, task.completedAt);
    logEvent(ss, 'COMPLETED', task.title, `Row ${sheetRow} marked Completed.`, sheetRow);
  }

  // Refresh masterData entry to reflect the change (prevents double-processing
  // if same title appears twice in the same sync batch)
  masterData[matchIndex][COL.STATUS - 1] = STATUS.COMPLETED;

  return true;
}

/**
 * Finds the first row in MASTER where:
 * - Title matches (case-insensitive)
 * - Status is Pending or Uncategorized (not already Completed)
 *
 * @returns {number} 0-based index into masterData, or -1 if not found
 */
function findPendingRow(masterData, title) {
  const normalizedTitle = title.toLowerCase().trim();

  for (let i = 0; i < masterData.length; i++) {
    const rowTitle  = (masterData[i][COL.TITLE - 1] || '').toString().toLowerCase().trim();
    const rowStatus = (masterData[i][COL.STATUS - 1] || '').toString();

    if (
      rowTitle === normalizedTitle &&
      (rowStatus === STATUS.PENDING || rowStatus === STATUS.UNCATEGORIZED)
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Updates an existing MASTER row to Completed status.
 */
function markRowCompleted(master, sheetRow, completedAt) {
  master.getRange(sheetRow, COL.STATUS).setValue(STATUS.COMPLETED);
  master.getRange(sheetRow, COL.COMPLETED_DATE)
    .setValue(completedAt)
    .setNumberFormat(MASTER_DATETIME_FORMAT);
}

/**
 * For Habits: the Pending definition row stays untouched.
 * Creates a NEW Completed row copying metadata from the definition.
 */
function logHabitCompletion(ss, master, masterData, definitionRow, task) {
  // Check if this habit was already logged today (idempotency guard)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const alreadyLoggedToday = masterData.some(row => {
    const rowTitle     = (row[COL.TITLE - 1] || '').toString().toLowerCase().trim();
    const rowStatus    = (row[COL.STATUS - 1] || '').toString();
    const rowCompleted = row[COL.COMPLETED_DATE - 1];
    const rowCategory  = (row[COL.CATEGORY - 1] || '').toString();

    return (
      rowTitle    === task.title.toLowerCase().trim() &&
      rowStatus   === STATUS.COMPLETED &&
      rowCategory === CATEGORY.HABIT &&
      rowCompleted instanceof Date &&
      rowCompleted >= todayStart
    );
  });

  if (alreadyLoggedToday) {
    logEvent(ss, 'SKIP', task.title, 'Habit already logged today — skipped.', 0);
    return;
  }

  const nextId    = getNextId(masterData);
  const now       = new Date();
  const newRow    = new Array(15).fill('');

  newRow[COL.ID             - 1] = nextId;
  newRow[COL.TITLE          - 1] = definitionRow[COL.TITLE          - 1];
  newRow[COL.CATEGORY       - 1] = CATEGORY.HABIT;
  newRow[COL.PARENT_PROJECT - 1] = definitionRow[COL.PARENT_PROJECT - 1];
  newRow[COL.ENERGY         - 1] = definitionRow[COL.ENERGY         - 1];
  newRow[COL.IMPACT         - 1] = definitionRow[COL.IMPACT         - 1];
  newRow[COL.ESTIMATE       - 1] = definitionRow[COL.ESTIMATE       - 1];
  newRow[COL.STATUS         - 1] = STATUS.COMPLETED;
  newRow[COL.CREATED_DATE   - 1] = now;
  newRow[COL.DUE_DATE       - 1] = task.dueDate || '';
  newRow[COL.COMPLETED_DATE - 1] = task.completedAt;
  // Cols 12–15 (L-O) are formula columns — leave blank, Sheet calculates them

  appendRow(master, newRow);

  // Add the new row to masterData in-memory so idempotency works
  // within the same sync batch
  masterData.push(newRow);
}

/**
 * Creates a new Uncategorized row for tasks with no matching MASTER entry.
 * These are visible in the Dashboard triage section but ignored by OpenClaw.
 */
function createUncategorizedRow(ss, master, masterData, task) {
  // Idempotency: don't create duplicates if same task appears in two sync runs
  // Check for existing Uncategorized row with same title completed same day
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const alreadyExists = masterData.some(row => {
    const rowTitle     = (row[COL.TITLE  - 1] || '').toString().toLowerCase().trim();
    const rowStatus    = (row[COL.STATUS - 1] || '').toString();
    const rowCompleted = row[COL.COMPLETED_DATE - 1];

    return (
      rowTitle  === task.title.toLowerCase().trim() &&
      rowStatus === STATUS.UNCATEGORIZED &&
      rowCompleted instanceof Date &&
      rowCompleted >= todayStart
    );
  });

  if (alreadyExists) return;

  const nextId = getNextId(masterData);
  const now    = new Date();
  const newRow = new Array(15).fill('');

  newRow[COL.ID             - 1] = nextId;
  newRow[COL.TITLE          - 1] = task.title;
  newRow[COL.CATEGORY       - 1] = CATEGORY.UNCAT;
  newRow[COL.STATUS         - 1] = STATUS.UNCATEGORIZED;
  newRow[COL.CREATED_DATE   - 1] = now;
  newRow[COL.DUE_DATE       - 1] = task.dueDate || '';
  newRow[COL.COMPLETED_DATE - 1] = task.completedAt;

  appendRow(master, newRow);
  masterData.push(newRow);
}

// ─── SHEET UTILITIES ──────────────────────────────────────────────────────────

/**
 * Reads all MASTER data rows into memory (excludes header).
 * Returns array of arrays, 0-indexed.
 */
function getMasterData(master) {
  const lastRow = master.getLastRow();
  if (lastRow < 2) return [];

  return master.getRange(2, 1, lastRow - 1, 15).getValues();
}

/**
 * Appends a row to MASTER after the last used row.
 * Also writes the formula columns (L, M, N, O) for the new row.
 */
function appendRow(master, rowData) {
  const newRow = master.getLastRow() + 1;
  master.getRange(newRow, 1, 1, 15).setValues([rowData]);

  // Re-apply formulas to the new row (formula columns L-O)
  const r = newRow;
  master.getRange(r, 12).setFormula(
    `=IF(AND(I${r}<>"",K${r}<>""),ROUND((K${r}-I${r})*1440,0),"")`
  );
  master.getRange(r, 13).setFormula(
    `=IF(C${r}<>"Habit","",IFERROR(` +
      `SUMPRODUCT((B$2:B$1000=B${r})*` +
      `(H$2:H$1000="Completed")*` +
      `(C$2:C$1000="Habit")*` +
      `(K$2:K$1000>=TODAY()-30)),` +
    `0))`
  );
  master.getRange(r, 14).setFormula(
    `=IF(B${r}="","",IFERROR(MAXIFS(K$2:K$1000,B$2:B$1000,B${r},K$2:K$1000,"<>"&""),""))`
  );
  master.getRange(r, 15).setFormula(
    `=IF(AND(F${r}<>"",G${r}<>""),ROUND(F${r}*(G${r}/60),2),"")`
  );

  // Format date cells in the new row
  master.getRange(r, COL.CREATED_DATE).setNumberFormat(MASTER_DATETIME_FORMAT);
  master.getRange(r, COL.DUE_DATE).setNumberFormat(MASTER_DATETIME_FORMAT);
  master.getRange(r, COL.COMPLETED_DATE).setNumberFormat(MASTER_DATETIME_FORMAT);
}

/**
 * Applies a consistent datetime display for MASTER date columns:
 * I (Created), J (Due), K (Completed).
 */
function ensureMasterDateTimeFormats(master) {
  master.getRange(2, COL.CREATED_DATE,   999, 1).setNumberFormat(MASTER_DATETIME_FORMAT);
  master.getRange(2, COL.DUE_DATE,       999, 1).setNumberFormat(MASTER_DATETIME_FORMAT);
  master.getRange(2, COL.COMPLETED_DATE, 999, 1).setNumberFormat(MASTER_DATETIME_FORMAT);
}

/**
 * Returns the next available integer ID.
 */
function getNextId(masterData) {
  if (masterData.length === 0) return 1;
  const ids = masterData
    .map(row => parseInt(row[COL.ID - 1], 10))
    .filter(n => !isNaN(n));
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

// ─── LOG SHEET ────────────────────────────────────────────────────────────────

/**
 * Appends an entry to the LOG sheet.
 * @param {string} event  — SYNC_START | SYNC_DONE | COMPLETED | HABIT | UNMATCHED | SKIP | ERROR
 */
function logEvent(ss, event, title, detail, row) {
  let logSheet = ss.getSheetByName('LOG');
  if (!logSheet) {
    logSheet = ss.insertSheet('LOG');
    logSheet.appendRow(['Timestamp', 'Event', 'Title', 'Detail', 'Row']);
    logSheet.hideSheet();
  }
  logSheet.appendRow([new Date(), event, title, detail, row || '']);

  // Keep LOG sheet under 2000 rows — trim oldest entries
  const maxRows = 2000;
  const lastRow = logSheet.getLastRow();
  if (lastRow > maxRows + 1) {
    logSheet.deleteRows(2, lastRow - maxRows);
  }
}

// ─── TRIGGER MANAGEMENT ───────────────────────────────────────────────────────

/**
 * Creates a time-driven trigger: syncCompletedTasks every 10 minutes.
 * Run this ONCE after deploying. Safe to re-run — removes duplicate triggers first.
 */
function setupTrigger() {
  removeTriggers(); // Clean up before creating

  ScriptApp.newTrigger('syncCompletedTasks')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('Trigger created: syncCompletedTasks every 10 minutes.');
  SpreadsheetApp.getUi().alert(
    'Trigger created.\nsyncCompletedTasks will run every 10 minutes automatically.'
  );
}

/**
 * Removes all existing triggers for this script.
 * Useful for cleanup or resetting.
 */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log(`Removed ${triggers.length} trigger(s).`);
}

/**
 * Manual test: run a single sync right now and show results.
 * Use this to verify the integration before relying on the trigger.
 */
function testSync() {
  // Force look-back to 7 days for testing
  PROPS.setProperty(LAST_SYNC_KEY, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  syncCompletedTasks();

  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet  = ss.getSheetByName('LOG');
  const lastRow   = logSheet ? logSheet.getLastRow() : 0;

  SpreadsheetApp.getUi().alert(
    `Test sync complete.\nCheck LOG sheet (unhide it) for details.\nLast log row: ${lastRow}`
  );
}

/**
 * Resets the last sync timestamp. Forces next sync to re-process last 24h.
 * Useful after schema changes.
 */
function resetSyncCursor() {
  PROPS.deleteProperty(LAST_SYNC_KEY);
  SpreadsheetApp.getUi().alert('Sync cursor reset. Next run will look back 24 hours.');
}

// ─── MANUAL ENTRY HELPER ──────────────────────────────────────────────────────

/**
 * Adds a menu item to the Sheet UI for manual operations.
 * Triggered automatically when the Sheet is opened.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TrackWise')
    .addItem('Run Sync Now',        'syncCompletedTasks')
    .addItem('Test Sync (7 days)',  'testSync')
    .addSeparator()
    .addItem('Setup Trigger',       'setupTrigger')
    .addItem('Remove Triggers',     'removeTriggers')
    .addItem('Reset Sync Cursor',   'resetSyncCursor')
    .addSeparator()
    .addItem('Run Phase 1 Setup',   'setupTrackwise')
    .addToUi();
}
