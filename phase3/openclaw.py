#!/usr/bin/env python3
"""
openclaw.py — Daily focus engine. Run this each morning.

Usage:
  python openclaw.py                        # interactive mode
  python openclaw.py --sleep 7 --energy 7 --time 180
  python openclaw.py --no-llm               # rule-based only, no Ollama
  python openclaw.py --config myconfig.json
"""

import argparse
import json
import sys

from sheet_reader    import get_pending_items, load_config
from engine          import build_focus_plan, format_plan_text
from prompt_builder  import build_prompt
from ollama_client   import query_ollama, check_ollama_running


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description='OpenClaw — Daily focus engine powered by local Ollama'
    )
    parser.add_argument('--sleep',  type=float, help='Hours slept last night (e.g. 7.5)')
    parser.add_argument('--energy', type=int,   help='Energy level 1–10')
    parser.add_argument('--time',   type=int,   help='Available work time in minutes')
    parser.add_argument('--no-llm', action='store_true', help='Skip Ollama, use rule engine only')
    parser.add_argument('--config', default='config.json', help='Path to config.json')
    return parser.parse_args()


def prompt_input(label, cast_fn, validate_fn, error_msg):
    """Interactive input with validation."""
    while True:
        raw = input(label).strip()
        try:
            value = cast_fn(raw)
            if validate_fn(value):
                return value
            print(f"  ✗ {error_msg}")
        except (ValueError, TypeError):
            print(f"  ✗ {error_msg}")


def get_context(args):
    """Returns (sleep, energy, available_time) from args or interactive prompt."""
    if args.sleep and args.energy and args.time:
        return args.sleep, args.energy, args.time

    print("\n── OpenClaw Context ─────────────────────────────")

    sleep = args.sleep or prompt_input(
        "Sleep last night (hours, e.g. 7.5): ",
        float,
        lambda v: 0 < v <= 24,
        "Enter a number between 0 and 24"
    )

    energy = args.energy or prompt_input(
        "Energy level today (1–10): ",
        int,
        lambda v: 1 <= v <= 10,
        "Enter a number between 1 and 10"
    )

    time = args.time or prompt_input(
        "Available time (minutes, e.g. 180): ",
        int,
        lambda v: 5 <= v <= 1440,
        "Enter minutes between 5 and 1440"
    )

    return sleep, energy, time


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # Load config
    try:
        config = load_config(args.config)
    except FileNotFoundError:
        print(f"✗ Config file not found: {args.config}")
        print("  Copy config.json.example to config.json and fill in your Sheet ID.")
        sys.exit(1)

    # Get context
    sleep, energy, available_time = get_context(args)

    # Read sheet
    print("\n── Loading tasks from Google Sheets…", end=' ', flush=True)
    try:
        items = get_pending_items(args.config)
        print(f"✓ {len(items)} item(s) loaded.")
    except FileNotFoundError as e:
        print(f"\n✗ Credentials not found: {e}")
        print("  See DEPLOY.md for service account setup.")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Sheet read failed: {e}")
        sys.exit(1)

    if not items:
        print("\nNo pending items in MASTER sheet. Add some tasks first.")
        sys.exit(0)

    # Build focus plan (deterministic rules)
    plan = build_focus_plan(items, sleep, energy, available_time)

    # Decide whether to use Ollama
    use_llm = not args.no_llm and config.get('fallback_to_rules', True)

    if use_llm:
        print("── Querying Ollama…", end=' ', flush=True)

        if not check_ollama_running(config['ollama_url']):
            print("✗ Ollama not running. Showing rule-based output.")
            use_llm = False
        else:
            prompt   = build_prompt(plan, items)
            response, error = query_ollama(
                prompt,
                model      = config['model'],
                ollama_url = config['ollama_url']
            )

            if error:
                print(f"✗\n  {error}")
                use_llm = False
            else:
                print("✓")

    # Output
    print()
    if use_llm and response:
        print(_format_llm_output(response, plan))
    else:
        print(format_plan_text(plan))

    print()


def _format_llm_output(response, plan):
    """Wraps the raw Ollama response in the display frame."""
    ctx = plan.context
    lines = [
        "=" * 52,
        "  OPENCLAW — DAILY FOCUS",
        f"  Sleep: {ctx['sleep']}h  |  Energy: {ctx['energy']}/10  |  Time: {ctx['available_time']}min",
        "=" * 52,
        "",
    ]

    # Parse Ollama response into structured fields
    parsed = _parse_llm_response(response)

    if parsed:
        lines.append(f"MAIN TASK:    {parsed.get('MAIN TASK', '—')}")
        lines.append(f"MAINTENANCE:  {parsed.get('MAINTENANCE', '—')}")
        lines.append(f"HABIT:        {parsed.get('HABIT', '—')}")
        lines.append("")
        lines.append(f"REASONING:")
        reasoning = parsed.get('REASONING', response)
        # Word-wrap reasoning at 50 chars
        for chunk in _wrap(reasoning, 50):
            lines.append(f"  {chunk}")
    else:
        # LLM response didn't match expected format — print as-is
        lines.append(response)

    if plan.warnings:
        lines.append("")
        lines.append("ALERTS:")
        for w in plan.warnings:
            lines.append(f"  ⚠ {w}")

    lines.append("")
    lines.append("=" * 52)
    return "\n".join(lines)


def _parse_llm_response(text):
    """
    Parses the structured LLM output into a dict.
    Expected format:
        MAIN TASK: ...
        MAINTENANCE: ...
        HABIT: ...
        REASONING: ...
    """
    result = {}
    current_key = None
    current_val = []

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        matched = False
        for key in ('MAIN TASK', 'MAINTENANCE', 'HABIT', 'REASONING'):
            if line.upper().startswith(key + ':'):
                if current_key:
                    result[current_key] = ' '.join(current_val).strip()
                current_key = key
                current_val = [line[len(key) + 1:].strip()]
                matched = True
                break

        if not matched and current_key:
            current_val.append(line)

    if current_key:
        result[current_key] = ' '.join(current_val).strip()

    return result if len(result) >= 2 else None


def _wrap(text, width):
    """Simple word-wrap."""
    words  = text.split()
    lines  = []
    current = []
    length  = 0
    for word in words:
        if length + len(word) + 1 > width:
            lines.append(' '.join(current))
            current = [word]
            length  = len(word)
        else:
            current.append(word)
            length += len(word) + 1
    if current:
        lines.append(' '.join(current))
    return lines


if __name__ == '__main__':
    main()
