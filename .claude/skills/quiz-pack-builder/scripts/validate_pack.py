#!/usr/bin/env python3
"""Validate an AI Edu Quiz Quest question pack JSON file.

Usage:
    python validate_pack.py path/to/pack.json

Exits 0 if the pack is valid (warnings allowed), 1 if there are errors.
A pack with errors will not play correctly in the game.
"""
import json
import sys

MEDIA_TYPES = {"illustration", "chart", "image", "photo", "video", "threejs", "matterjs"}
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
