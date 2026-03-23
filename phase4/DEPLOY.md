# TrackWise Phase 4 — Deployment Guide

## Prerequisites

| Tool | Install |
|------|---------|
| Python 3.12+ | `sudo apt install python3` |
| xprintidle | `sudo apt install xprintidle` |
| libnotify-bin | `sudo apt install libnotify-bin` |
| X11 session | Wayland: see note below |

> **Wayland note**: `xprintidle` requires X11. On Ubuntu 22.04+ with Wayland,
> log out and select **"Ubuntu on Xorg"** at the login screen, or install
> `xprintidle-wayland` if available for your distro.

---

## Step 1 — One-time: Upgrade sheet sharing

Phase 3 set up a service account with **Viewer** access. Phase 4 needs to
**write** rows to FOCUS_LOG.

1. Open your TrackWise Google Sheet.
2. Click **Share**.
3. Find the service account email (inside `phase3/credentials.json` → `client_email`).
4. Change its role from **Viewer → Editor**.
5. Click **Save**.

---

## Step 2 — Configure

Edit `phase4/config.json`:

```json
{
  "sheet_id": "YOUR_SHEET_ID_HERE",
  "credentials_file": "../phase3/credentials.json",
  "idle_threshold_seconds": 300,
  "poll_interval_seconds": 30
}
```

Find your sheet ID in the URL:
`https://docs.google.com/spreadsheets/d/**SHEET_ID**/edit`

---

## Step 3 — Create virtualenv and install deps

```bash
cd trackwise/phase4
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Step 4 — Run

```bash
source .venv/bin/activate
python focus_tracker.py
```

A grey circle icon appears in the system notification area (top-right).

---

## Step 5 — Verify

1. **Right-click** the tray icon → **Start Focus**.
2. Select a project from the dropdown (loaded live from your PROJECTS sheet).
3. Enter a task name → click **Start**.
4. Icon turns **green** — session is running.
5. Leave your computer for 5+ minutes → icon turns **yellow** (idle auto-pause).
6. Move the mouse → icon turns **green** + desktop notification appears.
7. Right-click → **Stop Session**.
8. Summary dialog shows focused / idle minutes split.
9. Click **Save to Sheet** → open Google Sheets and confirm a new row in `FOCUS_LOG`.

---

## FOCUS_LOG sheet columns

| Col | Name | Example |
|-----|------|---------|
| A | ID | 1 |
| B | Date | 2026-03-01 |
| C | Project | Deep Work |
| D | Task | Write phase 4 deploy guide |
| E | Start Time | 09:15:00 |
| F | End Time | 10:45:00 |
| G | Total Time (min) | 90 |
| H | Focused Time (min) | 82 |
| I | Idle Time (min) | 8 |

The `FOCUS_LOG` sheet is **auto-created** on first run if it doesn't exist.

---

## Run on login (optional)

Create `~/.config/autostart/trackwise-focus.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=TrackWise Focus Tracker
Exec=/home/YOUR_USER/claude_projects/trackwise/phase4/.venv/bin/python \
     /home/YOUR_USER/claude_projects/trackwise/phase4/focus_tracker.py
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
```

Replace `YOUR_USER` with your actual username.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Icon doesn't appear | Check pystray is installed; try `python -c "import pystray"` |
| `xprintidle: not found` | `sudo apt install xprintidle` |
| Idle never triggers | Run `xprintidle` in terminal — should return ms value |
| Projects dropdown empty | Check PROJECTS sheet exists and service account has Editor access |
| Save fails with 403 | Re-do Step 1 (upgrade to Editor) |
| Wayland: idle never detected | Switch to Xorg session at login |
