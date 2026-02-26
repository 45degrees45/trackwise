"""
sheet_reader.py — Reads MASTER sheet from Google Sheets via service account.
Returns a clean list of item dicts. Invisible to the rest of the system how data arrives.
"""

import json
import gspread
from google.oauth2.service_account import Credentials

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

# Maps sheet column index (0-based) to field name
COLUMN_MAP = {
    0:  'id',
    1:  'title',
    2:  'category',
    3:  'parent_project',
    4:  'energy',
    5:  'impact',
    6:  'estimate',
    7:  'status',
    8:  'created_date',
    9:  'due_date',
    10: 'completed_date',
    11: 'actual_duration',
    12: 'streak',
    13: 'last_completed',
    14: 'score_weight',
}


def load_config(path='config.json'):
    with open(path) as f:
        return json.load(f)


def get_pending_items(config_path='config.json'):
    """
    Reads the MASTER sheet and returns all actionable items.
    Filters out: Completed, Archived, and rows with no Title.
    Does NOT filter Uncategorized here — engine decides what to do with them.

    Returns: list of dicts, one per row.
    """
    config = load_config(config_path)

    creds  = Credentials.from_service_account_file(
        config['credentials_file'], scopes=SCOPES
    )
    client = gspread.authorize(creds)
    sheet  = client.open_by_key(config['sheet_id'])
    ws     = sheet.worksheet(config['master_sheet_name'])

    rows = ws.get_all_values()
    if len(rows) < 2:
        return []

    # Row 0 is the header — skip it
    items = []
    for row in rows[1:]:
        item = _parse_row(row)
        if not item:
            continue
        # Only pass through actionable statuses
        if item['status'] in ('Completed', 'Archived'):
            continue
        items.append(item)

    return items


def _parse_row(row):
    """Converts a raw sheet row (list) into a typed dict."""
    # Pad to 15 columns if sheet has trailing empty cells
    row = list(row) + [''] * (15 - len(row))

    title = row[1].strip()
    if not title:
        return None

    return {
        'id':             _safe_int(row[0]),
        'title':          title,
        'category':       row[2].strip() or 'Uncategorized',
        'parent_project': row[3].strip(),
        'energy':         row[4].strip(),         # High / Medium / Low / ''
        'impact':         _safe_int(row[5]),       # 1–5 or None
        'estimate':       _safe_int(row[6]),       # minutes or None
        'status':         row[7].strip() or 'Pending',
        'created_date':   row[8].strip(),
        'due_date':       row[9].strip(),
        'completed_date': row[10].strip(),
        'actual_duration':_safe_float(row[11]),
        'streak':         _safe_int(row[12]),      # formula-calculated
        'last_completed': row[13].strip(),
        'score_weight':   _safe_float(row[14]),
    }


def _safe_int(value):
    try:
        return int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None


def _safe_float(value):
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None
