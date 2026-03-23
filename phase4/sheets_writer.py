"""
sheets_writer.py — Manages FOCUS_LOG sheet in the TrackWise spreadsheet.
Creates/migrates the sheet if absent or outdated, reads projects and
subtitles, and appends session rows.
"""

import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

FOCUS_LOG_HEADER = [
    'ID', 'Date', 'Project', 'Sub-title', 'Task',
    'Start', 'End',
    'Total (min)', 'Focus (min)', 'Rest (min)', 'Idle (min)',
    'Mode', 'Intervals', 'Focus %',
]


class SheetsWriter:
    def __init__(self, config: dict):
        creds = Credentials.from_service_account_file(
            config['credentials_file'], scopes=SCOPES
        )
        client = gspread.authorize(creds)
        self._spreadsheet = client.open_by_key(config['sheet_id'])
        self._focus_ws = self._get_or_create_focus_log()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_projects(self) -> list[str]:
        """Returns project names from column A of the PROJECTS sheet."""
        try:
            ws = self._spreadsheet.worksheet('PROJECTS')
            values = ws.col_values(1)
            return [v.strip() for v in values[1:] if v.strip()]
        except gspread.exceptions.WorksheetNotFound:
            return []

    def get_subtitles(self, project: str) -> list[str]:
        """
        Returns active task titles from MASTER where parent_project == project.
        Skips Completed and Archived rows.
        """
        try:
            ws = self._spreadsheet.worksheet('MASTER')
            rows = ws.get_all_values()
            results = []
            for row in rows[1:]:                       # skip header
                row = list(row) + [''] * 15
                title  = row[1].strip()
                parent = row[3].strip()
                status = row[7].strip()
                if (parent == project and title
                        and status not in ('Completed', 'Archived')):
                    results.append(title)
            return results
        except gspread.exceptions.WorksheetNotFound:
            return []

    def append_session(
        self,
        project: str,
        subtitle: str,
        task: str,
        start_dt: datetime,
        end_dt: datetime,
        focused_min: int,
        rest_min: int,
        idle_min: int,
        mode: str,
        intervals: int,
    ):
        """Appends one completed session row to FOCUS_LOG."""
        next_id   = self._next_id()
        total_min = focused_min + rest_min + idle_min

        row = [
            next_id,
            start_dt.strftime('%Y-%m-%d'),
            project,
            subtitle,
            task,
            start_dt.strftime('%H:%M:%S'),
            end_dt.strftime('%H:%M:%S'),
            total_min,
            focused_min,
            rest_min,
            idle_min,
            mode,
            intervals,
        ]
        self._focus_ws.append_row(row, value_input_option='USER_ENTERED')

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_or_create_focus_log(self) -> gspread.Worksheet:
        # Columns written by Python (1-13); col 14 (Focus %) is a formula managed by setup.gs
        _WRITTEN_COLS = FOCUS_LOG_HEADER[:13]
        try:
            ws = self._spreadsheet.worksheet('FOCUS_LOG')
            existing = ws.row_values(1)
            # Migrate only if the Python-owned columns differ; preserve col 14 formula header
            if existing[:13] != _WRITTEN_COLS:
                ws.update(range_name='A1', values=[FOCUS_LOG_HEADER])
            return ws
        except gspread.exceptions.WorksheetNotFound:
            ws = self._spreadsheet.add_worksheet(
                title='FOCUS_LOG',
                rows=1000,
                cols=len(FOCUS_LOG_HEADER),
            )
            ws.append_row(FOCUS_LOG_HEADER)
            return ws

    def _next_id(self) -> int:
        ids = []
        for v in self._focus_ws.col_values(1)[1:]:   # skip header
            try:
                ids.append(int(v))
            except (ValueError, TypeError):
                pass
        return max(ids, default=0) + 1
