"""
session_dialog.py — Zenity dialogs for TrackWise focus session start and summary.

Start flow (4 steps):
  1. Mode       — Free / Pomodoro 25+5 / Deep Work 90+30
  2. Project    — dropdown from PROJECTS sheet
  3. Sub-title  — filterable list from MASTER sheet (or type your own)
  4. Notes      — optional free-text (Escape to skip)
"""

import subprocess
from typing import Callable, Optional

# ---------------------------------------------------------------------------
# Mode definitions (imported by focus_tracker and sheets_writer too)
# ---------------------------------------------------------------------------

MODES: dict[str, tuple[int | None, int | None]] = {
    'free':     (None, None),   # (work_min, rest_min)
    'pomodoro': (25, 5),
    'deepwork': (90, 30),
}

MODE_LABELS: dict[str, str] = {
    'free':     'Free Session',
    'pomodoro': 'Pomodoro',
    'deepwork': 'Deep Work',
}

_MODE_ENTRIES = [
    ('free',     'Free Session       no timer'),
    ('pomodoro', 'Pomodoro           25 min focus / 5 min rest'),
    ('deepwork', 'Deep Work          90 min focus / 30 min rest'),
]
_LABEL_TO_MODE = {label: key for key, label in _MODE_ENTRIES}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def show_start_dialog(
    projects: list[str],
    get_subtitles_fn: Callable[[str], list[str]],
) -> Optional[tuple[str, str, str, str]]:
    """
    Runs the 4-step start dialog.
    Returns (project, subtitle, notes, mode_key) or None if cancelled.
    """
    mode = _pick_mode()
    if mode is None:
        return None

    # Skip project dialog when there is only one option
    if len(projects) == 1:
        project = projects[0]
    elif len(projects) == 0:
        project = _zenity_entry('Project', 'No projects in sheet.\nEnter project name:')
        if project is None:
            return None
    else:
        project = _pick_project(projects)
        if project is None:
            return None

    subtitles = get_subtitles_fn(project)
    subtitle = _pick_subtitle(subtitles)
    if subtitle is None:
        return None

    # Notes are optional: OK with blank text = skip, Cancel = abort session
    notes = _zenity_entry('Notes (optional)',
                          'Leave blank and click OK to skip, or Cancel to abort:')
    if notes is None:
        return None  # user explicitly cancelled — abort

    return project, subtitle, notes.strip(), mode


def show_summary_dialog(
    project: str,
    subtitle: str,
    notes: str,
    focused_min: int,
    rest_min: int,
    idle_min: int,
    mode: str,
    intervals: int,
) -> bool:
    total_min = focused_min + rest_min + idle_min

    lines = [
        f'Project:      {project}',
        f'Sub-title:    {subtitle}',
    ]
    if notes:
        lines.append(f'Notes:        {notes}')
    lines += ['', f'Mode:         {MODE_LABELS[mode]}']
    if mode != 'free':
        lines.append(f'Intervals:    {intervals} completed')
    lines += ['', f'Focused time: {focused_min} min']
    if mode != 'free':
        lines.append(f'Rest time:    {rest_min} min')
    if idle_min:
        lines.append(f'Idle time:    {idle_min} min')
    lines += [f'Total time:   {total_min} min', '', 'Save to FOCUS_LOG?']

    result = subprocess.run(
        [
            'zenity', '--question',
            '--title=Session Summary',
            f'--text={chr(10).join(lines)}',
            '--ok-label=Save to Sheet',
            '--cancel-label=Discard',
            '--width=460', '--height=360',
        ],
        capture_output=True,
    )
    return result.returncode == 0


# ---------------------------------------------------------------------------
# Step 1 — Mode picker
# ---------------------------------------------------------------------------

def _pick_mode() -> Optional[str]:
    cmd = [
        'zenity', '--list', '--radiolist',
        '--title=TrackWise — Focus Mode',
        '--text=Choose your session mode:',
        '--column=', '--column=Mode',
        '--width=580', '--height=320',
    ]
    for i, (_, label) in enumerate(_MODE_ENTRIES):
        cmd += ['TRUE' if i == 0 else 'FALSE', label]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return _LABEL_TO_MODE.get(result.stdout.strip())


# ---------------------------------------------------------------------------
# Step 2 — Project picker
# ---------------------------------------------------------------------------

def _pick_project(projects: list[str]) -> Optional[str]:
    if not projects:
        return _zenity_entry('Project',
                             'No projects in sheet.\nEnter project name:')

    cmd = [
        'zenity', '--list', '--radiolist',
        '--title=TrackWise — Select Project',
        '--text=Choose the project for this session:',
        '--column=', '--column=Project',
        '--width=580', '--height=480',
    ]
    for i, p in enumerate(projects):
        cmd += ['TRUE' if i == 0 else 'FALSE', p]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


# ---------------------------------------------------------------------------
# Step 3 — Sub-title picker
# ---------------------------------------------------------------------------

_MANUAL = '[Type my own...]'


def _pick_subtitle(subtitles: list[str]) -> Optional[str]:
    if not subtitles:
        return _zenity_entry('Sub-title',
                             'Enter a sub-title for this session:') or ''

    all_items = [_MANUAL] + subtitles
    cmd = [
        'zenity', '--list',
        '--title=TrackWise — Sub-title',
        '--text=Select a task, or choose to type your own:',
        '--column=Task',
        '--width=580', '--height=540',
    ] + all_items

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None

    selected = result.stdout.strip()
    if not selected or selected == _MANUAL:
        return _zenity_entry('Sub-title', 'Enter a sub-title:')  # None = cancelled

    return selected


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _zenity_entry(title: str, prompt: str) -> Optional[str]:
    result = subprocess.run(
        ['zenity', '--entry',
         f'--title={title}',
         f'--text={prompt}',
         '--width=520'],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()
