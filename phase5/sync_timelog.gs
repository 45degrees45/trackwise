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
