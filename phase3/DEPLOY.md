# Phase 3 Deployment — OpenClaw Local Engine

## Prerequisites
- Python 3.9+
- Ollama installed and running locally
- Phases 1 + 2 deployed (MASTER sheet populated with data)

---

## Step 1 — Install dependencies

```bash
cd phase3
pip install -r requirements.txt
```

---

## Step 2 — Google Service Account (one-time)

OpenClaw reads your Sheet via a service account.
This is a read-only key you create once.

1. Go to: https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable the Google Sheets API:
   - APIs & Services → Enable APIs → search "Google Sheets API" → Enable
4. Create a service account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name: `trackwise-reader`
   - Role: Viewer
5. Download the key:
   - Click the service account → Keys tab → Add Key → JSON
   - Save the file as `credentials.json` in the `phase3/` folder
6. Share your Sheet with the service account:
   - Open your TrackWise Google Sheet
   - Share → paste the service account email (looks like `trackwise-reader@project.iam.gserviceaccount.com`)
   - Role: Viewer

---

## Step 3 — Configure

Edit `config.json`:

```json
{
  "sheet_id":           "YOUR_SHEET_ID_HERE",
  "master_sheet_name":  "MASTER",
  "credentials_file":   "credentials.json",
  "ollama_url":         "http://localhost:11434",
  "model":              "llama3",
  "fallback_to_rules":  true,
  "time_zone":          "Asia/Kolkata"
}
```

Get your Sheet ID from the URL:
`https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit`

---

## Step 4 — Pull your Ollama model

```bash
ollama pull llama3
```

Other good options (smaller/faster):
```bash
ollama pull mistral       # fast, good reasoning
ollama pull phi3          # very small, still useful
ollama pull llama3:8b     # lighter llama3 variant
```

Change `"model"` in config.json to match.

---

## Step 5 — Run OpenClaw

### Interactive mode (recommended daily use)
```bash
python openclaw.py
```

You'll be prompted for sleep, energy, available time.

### One-liner mode
```bash
python openclaw.py --sleep 7 --energy 7 --time 180
```

### Rule-based only (no Ollama needed)
```bash
python openclaw.py --sleep 7 --energy 7 --time 180 --no-llm
```

---

## Example Output

```
== OPENCLAW — DAILY FOCUS ===========================
   Sleep: 7h  |  Energy: 7/10  |  Time: 180min
=====================================================

MAIN TASK:    Airbnb Pricing Review
MAINTENANCE:  Call plumber
HABIT:        Walk 5k — 7d streak

REASONING:
  With 7h sleep and solid energy, you can handle
  the high-impact Airbnb work first. The plumber
  call is quick and clears a pending item. Protect
  the walk streak — 7 days is momentum worth keeping.

⚠ ALERTS:
   Protect streak: Walk 5k — 7d streak.

=====================================================
```

---

## Daily Workflow

1. Morning: `python openclaw.py`
2. Enter sleep / energy / time
3. OpenClaw outputs your focus block
4. Work → complete tasks in Google Tasks
5. Apps Script logs completions to Sheet automatically
6. Repeat

---

## Troubleshooting

**"credentials.json not found"**
→ Re-download from Google Cloud Console, place in phase3/ folder

**"Sheet not found" or "403 Forbidden"**
→ Make sure you shared the Sheet with the service account email

**"Model not found"**
→ Run `ollama pull llama3` (or whatever model is in config.json)

**"Ollama not running"**
→ Run `ollama serve` in a separate terminal
→ Or use `--no-llm` flag — rule engine works without Ollama

**No tasks appearing**
→ Check MASTER sheet has rows with Status=Pending and Impact filled in
→ Uncategorized rows (missing Impact) are intentionally hidden from OpenClaw
