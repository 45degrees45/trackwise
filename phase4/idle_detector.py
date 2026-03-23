"""
idle_detector.py — Polls idle time every N seconds via D-Bus Mutter IdleMonitor.
Works on both Wayland and X11 (GNOME). Falls back to 0 ms if unavailable.

Fires on_idle(seconds) when idle time exceeds threshold.
Fires on_resume() when activity is detected after an idle period.
"""

import subprocess
import threading


def _get_idle_ms() -> int:
    """
    Returns idle time in milliseconds via org.gnome.Mutter.IdleMonitor.
    Output format from gdbus: '(uint64 12345,)\n'
    Falls back to 0 on any error (disables idle detection gracefully).
    """
    try:
        result = subprocess.run(
            [
                'gdbus', 'call', '--session',
                '--dest', 'org.gnome.Mutter.IdleMonitor',
                '--object-path', '/org/gnome/Mutter/IdleMonitor/Core',
                '--method', 'org.gnome.Mutter.IdleMonitor.GetIdletime',
            ],
            capture_output=True, text=True, timeout=2,
        )
        # e.g. "(uint64 86,)"
        token = result.stdout.strip().split()[1].rstrip(',)')
        return int(token)
    except (subprocess.TimeoutExpired, ValueError, FileNotFoundError,
            IndexError, OSError):
        return 0


class IdleDetector:
    def __init__(self, threshold_seconds: int, poll_interval_seconds: int,
                 on_idle, on_resume):
        self.threshold_ms = threshold_seconds * 1000
        self.poll_interval = poll_interval_seconds
        self.on_idle = on_idle
        self.on_resume = on_resume

        self._running = False
        self._was_idle = False
        self._thread: threading.Thread | None = None

    def start(self):
        self._running = True
        self._was_idle = False
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def _loop(self):
        while self._running:
            idle_ms = _get_idle_ms()
            is_idle = idle_ms >= self.threshold_ms

            if is_idle and not self._was_idle:
                self._was_idle = True
                self.on_idle(idle_ms // 1000)
            elif not is_idle and self._was_idle:
                self._was_idle = False
                self.on_resume()

            # Sleep in 0.5 s increments so stop() wakes quickly
            for _ in range(self.poll_interval * 2):
                if not self._running:
                    return
                threading.Event().wait(0.5)
