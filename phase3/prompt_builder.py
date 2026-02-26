"""
prompt_builder.py — Builds the structured prompt for Ollama from a FocusPlan.
Model-agnostic. Deterministic rules run first; Ollama adds reasoning on top.
"""

from engine import ENERGY_RANK


def build_prompt(plan, all_items):
    """
    Builds the full prompt sent to Ollama.

    The engine has already:
    - Filtered ineligible items
    - Ranked by score
    - Selected main task, maintenance, habits

    Ollama's job:
    - Validate or gently adjust the selection
    - Write the REASONING block in plain language
    - Flag anything the rules may have missed
    """
    ctx = plan.context

    # Top candidates (what the engine considered, not just what it picked)
    eligible = [i for i in all_items
                if i.get('status') not in ('Completed', 'Archived', 'Uncategorized')
                and i.get('impact') is not None
                and i.get('category') != 'Habit']
    eligible.sort(key=lambda i: (-(i.get('impact') or 0), i.get('estimate') or 999))
    top_candidates = eligible[:6]

    candidates_block = _format_candidates(top_candidates)
    habits_block     = _format_habits(plan.habits)
    warnings_block   = _format_warnings(plan.warnings)
    selection_block  = _format_selection(plan)

    prompt = f"""You are OpenClaw, a focused personal productivity assistant.
Your job is to confirm or refine the daily focus plan below, then write a brief reasoning.

━━ CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sleep last night : {ctx['sleep']} hours
Energy level     : {ctx['energy']} / 10
Available time   : {ctx['available_time']} minutes

━━ TOP PENDING TASKS (ranked by priority) ━━━
{candidates_block}
━━ HABITS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{habits_block}
━━ RULE ENGINE SELECTED ━━━━━━━━━━━━━━━━━━━━━
{selection_block}
━━ ALERTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{warnings_block if warnings_block else "None."}

━━ YOUR TASK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Respond ONLY in this exact format. Do not add extra sections.
If you agree with the selection, repeat it. If you think a different task is better, change it and explain why.

MAIN TASK: [task name]
MAINTENANCE: [task name or "none"]
HABIT: [habit name or "none"]
REASONING: [2–3 sentences. Be direct. No filler words.]
"""

    return prompt.strip()


def _format_candidates(items):
    if not items:
        return "  (no eligible tasks)"
    lines = []
    for i, item in enumerate(items, 1):
        project = f" | Project: {item['parent_project']}" if item['parent_project'] else ""
        lines.append(
            f"  {i}. {item['title']}"
            f" | Impact: {item['impact']}"
            f" | Energy: {item['energy'] or '?'}"
            f" | Est: {item['estimate'] or '?'}min"
            f"{project}"
        )
    return "\n".join(lines)


def _format_habits(habits):
    if not habits:
        return "  (none defined)"
    lines = []
    for h in habits[:5]:
        streak = h.get('streak') or 0
        streak_str = f" — {streak}d streak" if streak > 0 else ""
        lines.append(f"  • {h['title']}{streak_str}")
    return "\n".join(lines)


def _format_warnings(warnings):
    if not warnings:
        return ""
    return "\n".join(f"  ⚠ {w}" for w in warnings)


def _format_selection(plan):
    main  = plan.main_task['title']    if plan.main_task    else "none"
    maint = plan.maintenance['title']  if plan.maintenance  else "none"
    habit = plan.habits[0]['title']    if plan.habits       else "none"
    return (
        f"  MAIN TASK:   {main}\n"
        f"  MAINTENANCE: {maint}\n"
        f"  HABIT:       {habit}"
    )
