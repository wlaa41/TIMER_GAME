#!/usr/bin/env python3
"""Validate an AI Edu Quiz Quest question pack JSON file.

Usage:
    python validate_pack.py path/to/pack.json

Exits 0 if the pack is valid (warnings allowed), 1 if there are errors.
A pack with errors will not play correctly in the game.
"""
import json
import sys

# Must match the MEDIA_RENDERERS registry in app.js. Includes the parameterised
# interactive widgets used by lessons and playgrounds (they take parameters only
# and run no code from JSON).
MEDIA_TYPES = {
    "illustration", "chart", "image", "photo", "video",
    "slices", "grid", "percentOf", "percentLab", "percentPie", "percentCompare",
    "varBox", "functionMachine", "varExpression", "varBalance", "varCounter", "varTrick",
    "speedSprint", "numberLine", "mathArray", "crissCross",
    "volume3d", "threejs", "matterjs",
}
ILLUSTRATION_THEMES = {"balance", "triangle", "shop", "reading", "study"}

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def check_media(media, where):
    if not isinstance(media, dict):
        err(f"{where}: media must be an object")
        return
    mtype = media.get("type")
    if mtype not in MEDIA_TYPES:
        err(f"{where}: unknown media type '{mtype}' "
            f"(allowed: {', '.join(sorted(MEDIA_TYPES))})")
        return
    if mtype == "illustration":
        theme = media.get("theme")
        if theme not in ILLUSTRATION_THEMES:
            err(f"{where}: illustration theme '{theme}' is not built in "
                f"(allowed: {', '.join(sorted(ILLUSTRATION_THEMES))})")
    elif mtype == "chart":
        values = media.get("values")
        if not isinstance(values, list) or not values:
            err(f"{where}: chart needs a non-empty 'values' array")
        else:
            for k, v in enumerate(values):
                if not isinstance(v, dict) or "value" not in v:
                    err(f"{where}: chart value {k + 1} needs a numeric 'value'")
    elif mtype in ("image", "photo"):
        if not media.get("src"):
            err(f"{where}: image needs a 'src' path")
    elif mtype == "video":
        if not media.get("src") and not media.get("embed"):
            err(f"{where}: video needs a 'src' file or an 'embed' URL")
    elif mtype in ("threejs", "matterjs"):
        payload = media.get("payload")
        if not isinstance(payload, dict) or not isinstance(payload.get("setup"), str):
            err(f"{where}: {mtype} needs payload.setup as a string of code")


def check_section(sec, where):
    if not isinstance(sec, dict):
        err(f"{where}: section must be an object")
        return
    if not sec.get("heading"):
        err(f"{where}: section is missing 'heading'")
    has_content = any(sec.get(k) for k in ("body", "visual", "steps", "points", "note"))
    if not has_content:
        warn(f"{where}: section '{sec.get('heading', '?')}' has no "
             f"body/visual/steps/points/note")
    if sec.get("visual"):
        check_media(sec["visual"], where + " visual")
    for field in ("steps", "points"):
        if field in sec and not isinstance(sec[field], list):
            err(f"{where}: '{field}' must be a list of strings")


def check_question(q, i):
    where = f"question {i + 1}"
    if not isinstance(q, dict):
        err(f"{where}: must be an object")
        return
    if not q.get("question"):
        err(f"{where}: missing 'question' text")
    opts = q.get("options")
    if not isinstance(opts, list) or len(opts) < 2:
        err(f"{where}: needs an 'options' list with at least 2 entries")
        opts = []
    elif len(opts) > 4:
        warn(f"{where}: {len(opts)} options - 2 to 4 is recommended")
    ca = q.get("correctAnswer")
    if ca is None:
        err(f"{where}: missing 'correctAnswer'")
    elif opts and str(ca).lower() not in [str(o).lower() for o in opts]:
        err(f"{where}: correctAnswer '{ca}' does not match any option")
    est = q.get("estimatedSeconds")
    if est is not None and (isinstance(est, bool) or not isinstance(est, (int, float)) or est <= 0):
        err(f"{where}: estimatedSeconds must be a positive number of seconds")
    if q.get("media"):
        check_media(q["media"], where + " media")
    hint = q.get("hint")
    if not hint:
        warn(f"{where}: has no hint/lesson")
        return
    if isinstance(hint, dict) and (hint.get("format") == "lesson" or "sections" in hint):
        if not hint.get("title"):
            warn(f"{where}: lesson has no 'title'")
        secs = hint.get("sections")
        if not isinstance(secs, list) or not secs:
            err(f"{where}: lesson hint needs a non-empty 'sections' array")
        else:
            for j, sec in enumerate(secs):
                check_section(sec, f"{where} section {j + 1}")
            headings = " ".join(str(s.get("heading", "")) for s in secs if isinstance(s, dict)).lower()
            if "fun fact" not in headings:
                warn(f"{where}: lesson has no 'Fun Fact' section")


def check_playground(pg):
    """The interactive warm-up a class opens with. Two shapes are allowed:
       flat    -> { title, intro, sims:  [ media, ... ] }
       journey -> { title, intro, outro?, stops: [ { title, sim, ... } ] }
    The game prefers 'stops' (the storytelling journey) when both are present."""
    where = "playground"
    if not isinstance(pg, dict):
        err(f"{where}: must be an object")
        return
    stops = pg.get("stops")
    sims = pg.get("sims")
    has_stops = isinstance(stops, list) and len(stops) > 0
    has_sims = isinstance(sims, list) and len(sims) > 0
    if not has_stops and not has_sims:
        err(f"{where}: needs a non-empty 'stops' or 'sims' array")
        return
    if has_stops and has_sims:
        warn(f"{where}: has both 'stops' and 'sims' - the game shows 'stops' and ignores 'sims'")
    if not pg.get("title"):
        warn(f"{where}: has no 'title'")
    if not pg.get("intro"):
        warn(f"{where}: has no 'intro' line to set the scene")
    if has_sims:
        for k, sim in enumerate(sims):
            check_media(sim, f"{where} sims[{k + 1}]")
    if has_stops:
        for k, stop in enumerate(stops):
            sp = f"{where} stop {k + 1}"
            if not isinstance(stop, dict):
                err(f"{sp}: must be an object")
                continue
            if not stop.get("title"):
                warn(f"{sp}: has no 'title'")
            if stop.get("sim") is None:
                warn(f"{sp}: has no interactive 'sim' to play with")
            else:
                check_media(stop["sim"], f"{sp} sim")


def main():
    if len(sys.argv) != 2:
        print("Usage: python validate_pack.py path/to/pack.json")
        sys.exit(2)
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"FAIL: file not found: {path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"FAIL: not valid JSON - {e}")
        sys.exit(1)

    if not isinstance(data, dict):
        print("FAIL: the top level of the pack must be an object")
        sys.exit(1)
    if not data.get("quizTitle") and not data.get("title"):
        warn("pack has no 'quizTitle'")
    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        print("FAIL: 'questions' must be a non-empty array")
        sys.exit(1)

    for i, q in enumerate(questions):
        check_question(q, i)

    if data.get("playground") is not None:
        check_playground(data["playground"])

    for w in warnings:
        print(f"WARNING: {w}")
    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        print(f"\nFAIL: {len(errors)} error(s), {len(warnings)} warning(s) "
              f"across {len(questions)} question(s).")
        sys.exit(1)
    print(f"\nPASS: {len(questions)} question(s) valid. "
          f"{len(warnings)} warning(s).")
    sys.exit(0)


if __name__ == "__main__":
    main()
