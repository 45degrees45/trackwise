"""
focus_tracker.py — TrackWise Phase 4: Focus Tracker system tray app.

States:
  IDLE    — no session             grey  icon, no label
  RUNNING — focus interval active  green icon, countdown or elapsed
  PAUSED  — auto-paused (idle)     yellow icon, "PAUSED HH:MM"
  RESTING — scheduled rest         blue  icon, rest countdown

Panel label format:
  Free mode   RUNNING  →  "37:42"        (total elapsed)
  Pomodoro    RUNNING  →  "▶ 18:30"      (time left in interval)
  Pomodoro    RESTING  →  "☕ 04:15"     (time left in rest)
  Any         PAUSED   →  "⏸ 12:05"     (total elapsed)
"""

import json
import os
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('AyatanaAppIndicator3', '0.1')
from gi.repository import AyatanaAppIndicator3 as AppIndicator
from gi.repository import GLib, Gtk

from idle_detector import IdleDetector
from session_dialog import MODES, MODE_LABELS, show_start_dialog, show_summary_dialog
from sheets_writer import SheetsWriter

# ---------------------------------------------------------------------------
# States + icons
# ---------------------------------------------------------------------------
IDLE    = 'IDLE'
RUNNING = 'RUNNING'
PAUSED  = 'PAUSED'
RESTING = 'RESTING'

STATE_ICONS = {
    IDLE:    'media-playback-stop',
    RUNNING: 'media-playback-start',
    PAUSED:  'media-playback-pause',
    RESTING: 'appointment-soon',
}

_REST_TIPS = [
    'Do 10 push-ups!',
    'Stretch neck and shoulders — 30 sec each side.',
    'Stand up and take a short walk.',
    'Do 20 squats.',
    'Drink a glass of water.',
    'Eye care: look 20 m away for 20 sec.',
    'Do 10 jumping jacks.',
    'Deep breathing: 4 in / 4 hold / 6 out — repeat x5.',
    'Stretch your wrists and hands.',
    'Do 10 chair dips.',
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt(seconds: int) -> str:
    """Format seconds as M:SS or H:MM:SS."""
    s = max(0, seconds)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    if h:
        return f'{h}:{m:02d}:{s:02d}'
    return f'{m:02d}:{s:02d}'


def _notify(title: str, body: str):
    try:
        subprocess.run(
            ['notify-send', '--app-name=TrackWise', title, body],
            timeout=3,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass


# ---------------------------------------------------------------------------
# Main app
# ---------------------------------------------------------------------------

class FocusTracker:
    def __init__(self, config: dict):
        self._config = config
        self._lock   = threading.Lock()

        # Session state
        self._state    = IDLE
        self._project  = ''
        self._subtitle = ''
        self._notes    = ''
        self._mode     = 'free'
        self._start_dt: datetime | None = None

        # Time accumulators
        self._idle_seconds_total = 0
        self._rest_seconds_total = 0
        self._idle_start:  datetime | None = None
        self._rest_start:  datetime | None = None
        self._interval_count = 0

        # Interval tracking for timer display
        self._interval_started_at:   datetime | None = None
        self._interval_duration_sec: int | None      = None

        # Pomodoro timer + GTK ticker
        self._interval_timer: threading.Timer | None = None
        self._ticker_id: int | None = None

        self._sheets: SheetsWriter | None = None

        self._detector = IdleDetector(
            threshold_seconds=config['idle_threshold_seconds'],
            poll_interval_seconds=config['poll_interval_seconds'],
            on_idle=self._on_idle,
            on_resume=self._on_resume,
        )

        self._build_indicator()

    # ------------------------------------------------------------------
    # GTK indicator
    # ------------------------------------------------------------------

    def _build_indicator(self):
        self._indicator = AppIndicator.Indicator.new(
            'trackwise-focus',
            STATE_ICONS[IDLE],
            AppIndicator.IndicatorCategory.APPLICATION_STATUS,
        )
        self._indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)
        self._indicator.set_title('TrackWise')
        self._indicator.set_label('', '')

        menu = Gtk.Menu()

        self._start_item = Gtk.MenuItem(label='Start Focus')
        self._start_item.connect('activate', lambda _: self._bg(self._start_session))
        menu.append(self._start_item)

        self._stop_item = Gtk.MenuItem(label='Stop Session')
        self._stop_item.connect('activate', lambda _: self._bg(self._stop_session))
        self._stop_item.set_sensitive(False)
        menu.append(self._stop_item)

        self._skip_item = Gtk.MenuItem(label='Skip Rest')
        self._skip_item.connect('activate', lambda _: self._bg(self._skip_rest))
        self._skip_item.set_sensitive(False)
        menu.append(self._skip_item)

        menu.append(Gtk.SeparatorMenuItem())

        status_item = Gtk.MenuItem(label='Status')
        status_item.connect('activate', lambda _: self._show_status())
        menu.append(status_item)

        menu.append(Gtk.SeparatorMenuItem())

        quit_item = Gtk.MenuItem(label='Quit')
        quit_item.connect('activate', lambda _: self._quit())
        menu.append(quit_item)

        menu.show_all()
        self._indicator.set_menu(menu)

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def run(self):
        Gtk.main()

    # ------------------------------------------------------------------
    # Live timer tick  (runs on GTK main thread via GLib.timeout_add)
    # ------------------------------------------------------------------

    def _tick(self) -> bool:
        with self._lock:
            state               = self._state
            start_dt            = self._start_dt
            interval_started    = self._interval_started_at
            interval_duration   = self._interval_duration_sec

        if state == IDLE:
            self._indicator.set_label('', '')
            self._ticker_id = None
            return False        # stop repeating

        now = datetime.now()
        elapsed_total = int((now - start_dt).total_seconds()) if start_dt else 0

        if state == PAUSED:
            label = f'\u23f8 {_fmt(elapsed_total)}'

        elif interval_started and interval_duration is not None:
            # Pomodoro countdown
            remaining = interval_duration - int((now - interval_started).total_seconds())
            if state == RUNNING:
                label = f'\u25b6 {_fmt(remaining)}'
            else:  # RESTING
                label = f'\u2615 {_fmt(remaining)}'

        else:
            # Free mode — show elapsed
            label = _fmt(elapsed_total)

        self._indicator.set_label(label, '\u25b6 00:00:00')
        return True             # keep repeating every second

    def _ensure_ticker(self):
        """Start ticker if not already running. Must be called on GTK thread."""
        if self._ticker_id is None:
            self._ticker_id = GLib.timeout_add(1000, self._tick)

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def _start_session(self):
        with self._lock:
            if self._state != IDLE:
                return

        sw       = self._get_sheets()
        projects = self._load_projects()
        result   = show_start_dialog(projects, sw.get_subtitles)
        if result is None:
            return

        project, subtitle, notes, mode = result
        work_min, _ = MODES[mode]

        with self._lock:
            self._project  = project
            self._subtitle = subtitle
            self._notes    = notes
            self._mode     = mode
            self._start_dt = datetime.now()
            self._idle_seconds_total = 0
            self._rest_seconds_total = 0
            self._idle_start  = None
            self._rest_start  = None
            self._interval_count = 0
            self._interval_started_at   = datetime.now()
            self._interval_duration_sec = work_min * 60 if work_min else None

        self._set_state(RUNNING)
        self._detector.start()

        if work_min:
            _notify('Focus started',
                    f'{project} — {subtitle}\n'
                    f'{MODE_LABELS[mode]}: {work_min} min intervals')
            self._schedule_work_timer(work_min)
        else:
            _notify('Focus started', f'{project} — {subtitle}')

    def _stop_session(self):
        with self._lock:
            if self._state == IDLE:
                return
            state = self._state

            if state == PAUSED and self._idle_start:
                self._idle_seconds_total += int(
                    (datetime.now() - self._idle_start).total_seconds())
                self._idle_start = None

            if state == RESTING and self._rest_start:
                self._rest_seconds_total += int(
                    (datetime.now() - self._rest_start).total_seconds())
                self._rest_start = None

            if self._interval_timer:
                self._interval_timer.cancel()
                self._interval_timer = None

            project   = self._project
            subtitle  = self._subtitle
            notes     = self._notes
            mode      = self._mode
            start_dt  = self._start_dt
            idle_sec  = self._idle_seconds_total
            rest_sec  = self._rest_seconds_total
            intervals = self._interval_count

        self._detector.stop()

        end_dt    = datetime.now()
        total_sec = int((end_dt - start_dt).total_seconds())
        idle_min    = idle_sec // 60
        rest_min    = rest_sec // 60
        focused_min = max(0, total_sec // 60 - idle_min - rest_min)

        confirmed = show_summary_dialog(
            project, subtitle, notes,
            focused_min, rest_min, idle_min,
            mode, intervals,
        )

        if confirmed:
            self._write_session(project, subtitle, notes, start_dt, end_dt,
                                focused_min, rest_min, idle_min, mode, intervals)

        self._set_state(IDLE)

    def _write_session(self, project, subtitle, notes, start_dt, end_dt,
                       focused_min, rest_min, idle_min, mode, intervals):
        try:
            self._get_sheets().append_session(
                project, subtitle, notes, start_dt, end_dt,
                focused_min, rest_min, idle_min, mode, intervals,
            )
            _notify('Session saved', f'Logged {focused_min} focused minutes.')
        except Exception as exc:
            _notify('Save failed', str(exc))

    # ------------------------------------------------------------------
    # Pomodoro interval management
    # ------------------------------------------------------------------

    def _schedule_work_timer(self, work_min: int):
        t = threading.Timer(work_min * 60, self._on_work_done)
        t.daemon = True
        with self._lock:
            self._interval_timer = t
        t.start()

    def _schedule_rest_timer(self, rest_min: int):
        t = threading.Timer(rest_min * 60, self._on_rest_done)
        t.daemon = True
        with self._lock:
            self._interval_timer = t
        t.start()

    def _on_work_done(self):
        with self._lock:
            if self._state != RUNNING:
                return
            self._interval_count += 1
            interval = self._interval_count

        _, rest_min = MODES[self._mode]
        tip = _REST_TIPS[(interval - 1) % len(_REST_TIPS)]

        self._detector.stop()

        with self._lock:
            self._rest_start            = datetime.now()
            self._interval_started_at   = datetime.now()
            self._interval_duration_sec = rest_min * 60

        self._set_state(RESTING)
        _notify(f'Interval {interval} done! Rest {rest_min} min', tip)
        self._schedule_rest_timer(rest_min)

    def _on_rest_done(self):
        with self._lock:
            if self._state != RESTING:
                return
            if self._rest_start:
                self._rest_seconds_total += int(
                    (datetime.now() - self._rest_start).total_seconds())
                self._rest_start = None
            work_min, _ = MODES[self._mode]
            self._interval_started_at   = datetime.now()
            self._interval_duration_sec = work_min * 60 if work_min else None

        self._set_state(RUNNING)
        self._detector.start()
        _notify('Rest over!', 'Back to focus mode. Keep going!')
        work_min, _ = MODES[self._mode]
        if work_min:
            self._schedule_work_timer(work_min)

    def _skip_rest(self):
        with self._lock:
            if self._state != RESTING:
                return
            if self._interval_timer:
                self._interval_timer.cancel()
                self._interval_timer = None
            if self._rest_start:
                self._rest_seconds_total += int(
                    (datetime.now() - self._rest_start).total_seconds())
                self._rest_start = None
            work_min, _ = MODES[self._mode]
            self._interval_started_at   = datetime.now()
            self._interval_duration_sec = work_min * 60 if work_min else None

        self._set_state(RUNNING)
        self._detector.start()
        _notify('Rest skipped', 'Back to focus mode.')
        work_min, _ = MODES[self._mode]
        if work_min:
            self._schedule_work_timer(work_min)

    # ------------------------------------------------------------------
    # Idle callbacks
    # ------------------------------------------------------------------

    def _on_idle(self, idle_seconds: int):
        with self._lock:
            if self._state != RUNNING:
                return
            self._idle_start = datetime.now()
        self._set_state(PAUSED)
        _notify('Focus paused', 'Idle detected — timer paused.')

    def _on_resume(self):
        with self._lock:
            if self._state != PAUSED:
                return
            if self._idle_start:
                self._idle_seconds_total += int(
                    (datetime.now() - self._idle_start).total_seconds())
                self._idle_start = None
        self._set_state(RUNNING)
        _notify('Focus resumed', 'Activity detected — timer running.')

    # ------------------------------------------------------------------
    # Status + quit
    # ------------------------------------------------------------------

    def _show_status(self):
        with self._lock:
            state     = self._state
            project   = self._project
            subtitle  = self._subtitle
            mode      = self._mode
            start_dt  = self._start_dt
            intervals = self._interval_count

        if state == IDLE:
            _notify('TrackWise', 'No active session.')
            return

        elapsed = int((datetime.now() - start_dt).total_seconds() // 60)
        work_min, _ = MODES.get(mode, (None, None))
        lines = [f'{project} — {subtitle}', f'Mode: {MODE_LABELS[mode]}']
        if work_min:
            lines.append(f'Intervals completed: {intervals}')
        lines += [f'Elapsed: {elapsed} min', f'State: {state}']
        _notify('TrackWise Status', '\n'.join(lines))

    def _quit(self):
        with self._lock:
            state = self._state
        if state != IDLE:
            self._stop_session()
        self._detector.stop()
        GLib.idle_add(Gtk.main_quit)

    # ------------------------------------------------------------------
    # State management
    # ------------------------------------------------------------------

    def _set_state(self, state: str):
        with self._lock:
            self._state = state
        GLib.idle_add(self._apply_state_ui, state)

    def _apply_state_ui(self, state: str):
        """Runs on GTK main thread."""
        self._indicator.set_icon_full(STATE_ICONS[state], state)
        self._start_item.set_sensitive(state == IDLE)
        self._stop_item.set_sensitive(state in (RUNNING, PAUSED, RESTING))
        self._skip_item.set_sensitive(state == RESTING)

        if state == IDLE:
            self._indicator.set_label('', '')
            self._ticker_id = None   # ticker will have already returned False
        else:
            self._ensure_ticker()

        return False

    def _bg(self, fn):
        threading.Thread(target=fn, daemon=True).start()

    def _load_projects(self) -> list[str]:
        try:
            return self._get_sheets().get_projects()
        except Exception:
            return []

    def _get_sheets(self) -> SheetsWriter:
        with self._lock:
            if self._sheets is None:
                self._sheets = SheetsWriter(self._config)
            return self._sheets


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def load_config(path: str = 'config.json') -> dict:
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Single-instance lock (PID file)
# ---------------------------------------------------------------------------

_PID_FILE = Path('/tmp/trackwise_focus.pid')


def _acquire_lock() -> bool:
    """
    Returns True if this is the only running instance.
    Writes our PID to _PID_FILE; returns False if a live process already owns it.
    """
    if _PID_FILE.exists():
        try:
            existing_pid = int(_PID_FILE.read_text().strip())
            # Check if that process is still alive
            os.kill(existing_pid, 0)   # signal 0 = existence check
            return False               # process exists → another instance running
        except (ValueError, ProcessLookupError, PermissionError):
            pass                       # stale PID file — safe to overwrite

    _PID_FILE.write_text(str(os.getpid()))
    return True


def _release_lock():
    try:
        _PID_FILE.unlink(missing_ok=True)
    except OSError:
        pass


if __name__ == '__main__':
    if not _acquire_lock():
        _notify('TrackWise already running',
                'Only one instance is allowed. Check your system tray.')
        sys.exit(0)

    try:
        FocusTracker(load_config()).run()
    finally:
        _release_lock()
