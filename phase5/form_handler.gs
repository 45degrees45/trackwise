/**
 * TrackWise Phase 5 — Manual task completion input via Google Form.
 * Handles onFormSubmit trigger: reads form response and appends to TIME_LOG sheet.
 */

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

  // Build seen set from existing data (same pattern as syncCompletionTimes)
  const existingData = sheet.getDataRange().getValues();
  const seen = new Set(existingData.slice(1).map(r => `${r[1]}|${r[3]}`));
  let currentId = existingData.length <= 1 ? 0 : existingData[existingData.length - 1][0];

  const key = `${taskName}|${dateStr}`;
  if (seen.has(key)) {
    Logger.log(`onFormSubmit: duplicate skipped — ${taskName} on ${dateStr}`);
    return;
  }

  const p = parseTaskTimestamp(d.toISOString());
  sheet.appendRow([
    ++currentId,
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
