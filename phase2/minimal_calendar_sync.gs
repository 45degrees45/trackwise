/**
 * TRACKWISE — Minimal Calendar → Sheet Logger
 * Paste this inside your Google Sheet via Extensions → Apps Script
 * No duplicate rows. No extra setup. Just works.
 */

const CALENDAR_NAME  = "Trackwise";
const SHEET_NAME     = "Sheet1";      // Change if your sheet tab has a different name
const LAST_RUN_KEY   = "TW_LAST_RUN";

// ─── MAIN SYNC ────────────────────────────────────────────────────────────────

function logCalendarEvents() {
  const props = PropertiesService.getScriptProperties();

  // Use stored cursor, not a fixed 15-min window — prevents duplicates
  const lastRun = props.getProperty(LAST_RUN_KEY);
  const from    = lastRun
    ? new Date(lastRun)
    : new Date(Date.now() - 15 * 60 * 1000);  // first run only: 15-min lookback
  const to      = new Date();

  const calendar = CalendarApp.getCalendarsByName(CALENDAR_NAME)[0];
  if (!calendar) {
    Logger.log(`Calendar "${CALENDAR_NAME}" not found. Create it in Google Calendar first.`);
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log(`Sheet tab "${SHEET_NAME}" not found.`);
    return;
  }

  const events = calendar.getEvents(from, to);

  events.forEach(event => {
    const title = event.getTitle().trim();
    const date  = event.getStartTime();

    const deepWork = title.toLowerCase().includes('deep work') ? extractNumber(title) : '';
    const sleep    = title.toLowerCase().includes('sleep')     ? extractNumber(title) : '';
    const walk     = title.toLowerCase().includes('walk')      ? extractNumber(title) : '';
    const diet     = title.toLowerCase().includes('diet')      ? 'Yes' : '';

    sheet.appendRow([date, deepWork, sleep, walk, diet, title]);
  });

  // Advance the cursor — next run starts exactly where this one ended
  props.setProperty(LAST_RUN_KEY, to.toISOString());
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function extractNumber(str) {
  const match = str.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : '';
}

// ─── MENU + TRIGGER SETUP ─────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Trackwise')
    .addItem('Sync Now',        'logCalendarEvents')
    .addItem('Setup Trigger',   'setupTrigger')
    .addItem('Reset Cursor',    'resetCursor')
    .addToUi();
}

function setupTrigger() {
  // Remove existing to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('logCalendarEvents')
    .timeBased()
    .everyMinutes(15)
    .create();

  SpreadsheetApp.getUi().alert('Done. Syncing every 15 minutes automatically.');
}

function resetCursor() {
  PropertiesService.getScriptProperties().deleteProperty(LAST_RUN_KEY);
  SpreadsheetApp.getUi().alert('Cursor reset. Next sync will look back 15 minutes.');
}
