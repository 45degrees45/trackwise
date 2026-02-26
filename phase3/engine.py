"""
engine.py — Deterministic decision engine.
Applies rules to the raw item list and returns a structured FocusPlan.
Runs before Ollama. Works even without Ollama (fallback mode).
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FocusPlan:
    main_task:    Optional[dict] = None
    maintenance:  Optional[dict] = None
    habits:       list           = field(default_factory=list)
    warnings:     list           = field(default_factory=list)   # e.g. overdue, triage needed
    context:      dict           = field(default_factory=dict)   # sleep, energy, time
    filtered_out: list           = field(default_factory=list)   # items excluded + reason


ENERGY_RANK = {'High': 3, 'Medium': 2, 'Low': 1, '': 0}


def build_focus_plan(items, sleep, energy, available_time):
    """
    Applies decision rules and returns a FocusPlan.

    Args:
        items:          list of dicts from sheet_reader
        sleep:          float, hours slept last night
        energy:         int, 1–10 self-reported energy level
        available_time: int, minutes available today

    Returns:
        FocusPlan
    """
    plan = FocusPlan(context={
        'sleep':          sleep,
        'energy':         energy,
        'available_time': available_time,
    })

    # Separate habits from work items
    habits = [i for i in items if i['category'] == 'Habit']
    work   = [i for i in items if i['category'] != 'Habit']

    # ── Rule 1: Remove Uncategorized from work decisions ──────────────────────
    actionable   = []
    uncategorized = []
    for item in work:
        if item['status'] == 'Uncategorized' or item['impact'] is None:
            uncategorized.append(item)
            plan.filtered_out.append({**item, '_reason': 'Uncategorized — enrich Impact/Energy'})
        else:
            actionable.append(item)

    if uncategorized:
        plan.warnings.append(
            f"{len(uncategorized)} item(s) in triage queue — invisible to OpenClaw."
        )

    # ── Rule 2: Sleep gate — block High energy if sleep < 6h ──────────────────
    max_energy = 'High' if sleep >= 6 else 'Medium'
    max_rank   = ENERGY_RANK[max_energy]

    gated = []
    for item in actionable:
        item_rank = ENERGY_RANK.get(item['energy'], 0)
        if item_rank > max_rank:
            plan.filtered_out.append({**item, '_reason': f'Sleep < 6h — {item["energy"]} energy blocked'})
            gated.append(item)
        else:
            pass  # kept in actionable

    actionable = [i for i in actionable if i not in gated]

    if gated and sleep < 6:
        plan.warnings.append(
            f"Sleep {sleep}h — {len(gated)} High-energy task(s) suppressed. Rest first."
        )

    # ── Rule 3: Score each item ────────────────────────────────────────────────
    # Base score = Impact (1–5)
    # Boost +1 if tied to an Active project that isn't yet 100% complete
    # (project completion % isn't in the item row, so we approximate:
    #  if parent_project is set and item is a Milestone, apply boost)
    for item in actionable:
        score = item['impact'] or 0
        if item['category'] == 'Project Milestone' and item['parent_project']:
            score += 1  # project-linked milestone boost
        item['_score'] = score

    # ── Rule 4: Sort by score DESC, then estimate ASC (shorter first on tie) ──
    actionable.sort(key=lambda i: (-i['_score'], i['estimate'] or 999))

    # ── Rule 5: Select MAIN TASK ───────────────────────────────────────────────
    # Highest score task that fits in available_time (or closest if none fit)
    time_remaining = available_time
    main = None

    for item in actionable:
        est = item['estimate'] or 0
        if est <= time_remaining or main is None:
            main = item
            break

    if main:
        plan.main_task    = main
        time_remaining   -= main.get('estimate') or 0
        actionable        = [i for i in actionable if i is not main]

    # ── Rule 6: Select MAINTENANCE ────────────────────────────────────────────
    # Highest score LOW energy task from what remains
    low_energy = [i for i in actionable if i['energy'] == 'Low']
    if low_energy:
        maint = low_energy[0]
        plan.maintenance  = maint
        time_remaining   -= maint.get('estimate') or 0

    # ── Rule 7: Habits ────────────────────────────────────────────────────────
    # Prioritize habits with active streaks, then any pending habit
    streaking  = [h for h in habits if (h['streak'] or 0) > 0]
    non_streak = [h for h in habits if (h['streak'] or 0) == 0]
    plan.habits = streaking + non_streak

    # Warn if a streak habit is at risk (last completed > 1 day ago)
    for h in streaking:
        if h['streak'] and h['streak'] > 3:
            plan.warnings.append(
                f"Protect streak: {h['title']} — {h['streak']} day run."
            )

    # ── Rule 8: Overdue warning ───────────────────────────────────────────────
    from datetime import datetime, timezone
    today = datetime.now().date()
    for item in actionable:
        if item['due_date']:
            try:
                due = datetime.strptime(item['due_date'][:10], '%Y-%m-%d').date()
                if due < today:
                    plan.warnings.append(f"OVERDUE: {item['title']} (due {item['due_date'][:10]})")
            except ValueError:
                pass

    return plan


def format_plan_text(plan):
    """
    Returns a plain-text summary of the FocusPlan.
    Used as fallback output when Ollama is unavailable.
    """
    lines = []
    ctx = plan.context

    lines.append("=" * 52)
    lines.append("  OPENCLAW — DAILY FOCUS")
    lines.append(f"  Sleep: {ctx['sleep']}h  |  Energy: {ctx['energy']}/10  |  Time: {ctx['available_time']}min")
    lines.append("=" * 52)

    if plan.main_task:
        t = plan.main_task
        lines.append(f"\nMAIN TASK:    {t['title']}")
        lines.append(f"              Impact {t['impact']} | {t['energy']} energy | ~{t['estimate']}min")
        if t['parent_project']:
            lines.append(f"              Project: {t['parent_project']}")
    else:
        lines.append("\nMAIN TASK:    — nothing eligible")

    if plan.maintenance:
        m = plan.maintenance
        lines.append(f"\nMAINTENANCE:  {m['title']}")
        lines.append(f"              Impact {m['impact']} | Low energy | ~{m['estimate']}min")
    else:
        lines.append("\nMAINTENANCE:  — nothing eligible")

    if plan.habits:
        lines.append(f"\nHABIT(S):")
        for h in plan.habits[:3]:  # show max 3
            streak = h['streak']
            streak_str = f" — {streak}d streak" if streak and streak > 0 else ""
            lines.append(f"  • {h['title']}{streak_str}")
    else:
        lines.append("\nHABIT(S):     — none defined")

    if plan.warnings:
        lines.append("\n⚠  ALERTS:")
        for w in plan.warnings:
            lines.append(f"   {w}")

    lines.append("\n" + "=" * 52)
    return "\n".join(lines)
