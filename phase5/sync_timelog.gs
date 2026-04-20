/**
 * TrackWise Phase 5 — Task completion sync
 * Polls all Google Tasks lists every 10 min and appends completions to TIME_LOG sheet.
 */

const TIME_LOG_SHEET = 'TIME_LOG';
// Persists the last sync timestamp via PropertiesService across executions
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
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground('#1a1a2e').setFontColor('#4ade80').setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('TIME_LOG sheet created');
}

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

function isDuplicate(sheet, taskName, dateStr) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === taskName && data[i][3] === dateStr) return true;
  }
  return false;
}

function nextId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  return sheet.getRange(lastRow, 1).getValue() + 1;
}

function syncCompletionTimes() {
  setupTimeLogSheet();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TIME_LOG_SHEET);
  const props = PropertiesService.getScriptProperties();
  const cursor = props.getProperty(SYNC_CURSOR_KEY) || '2020-01-01T00:00:00.000Z';

  const existingData = sheet.getDataRange().getValues();
  const seen = new Set(existingData.slice(1).map(r => `${r[1]}|${r[3]}`));
  let currentId = existingData.length <= 1 ? 0 : existingData[existingData.length - 1][0];

  let newCount = 0;

  try {
    const taskLists = Tasks.Tasklists.list({ maxResults: 100 }).getItems() || [];

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
          const key = `${task.getTitle()}|${p.dateStr}`;
          if (seen.has(key)) continue;
          seen.add(key);

          sheet.appendRow([
            ++currentId,
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
  } catch (e) {
    Logger.log(`syncCompletionTimes error: ${e.message}`);
  }
}

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
