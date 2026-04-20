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
