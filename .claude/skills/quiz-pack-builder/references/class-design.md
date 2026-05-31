# Class Design Doctrine

*How to build a "class" for AI Edu Quiz Quest — and the bar it must clear.*

A **class** is one question pack (`questions/<topic>.json`). This document is the
*why* and the *standard*; the exact JSON schema is in `QUESTION_FORMAT.md`, and
the step-by-step workflow is in this skill's `SKILL.md`. Read this before you
build anything.

---

## The one rule above all rules

**Connect the learning to real life. Never leave it abstract.**

It is written twice because it matters twice. A class earns its place only when
it ties every idea to something a child already lives: riding the bus, saving
pocket money, a motor spinning, sharing a pizza, a phone battery draining, a game
score climbing. Symbols and definitions are the *last* step, never the first. If a
section could have been lifted from a dry textbook, rewrite it.

> **Weak:** "A variable is a symbol representing an unknown quantity."
> **Strong:** "Picture a lunchbox with a secret number of grapes inside. You
> can't see in, so you just call it x. That is a variable — a box with a mystery
> number."

And again, because you will be tempted to forget it under deadline:
**connect the learning to real life rather than being only abstract.**

---

## Who you are writing for

Clever kids. **Genius kids.** Never dumb it down — *light it up*. Use vivid,
concrete pictures, short sentences, and real questions that make them lean toward
the screen. Assume they can handle a big idea, as long as you hand it to them
through something they already know.

---

## What every class contains, in order

1. **A playground** — an interactive, story-driven warm-up, played *before* any
   question, with the timer paused. (This is the part people skip. Do not skip
   it.)
2. **~20 questions**, ordered easy → hard, each carrying a full "Let's Learn"
   lesson.

---

## The playground: interactive as hell

This is the heart of a class and the thing that must shine. The playground is
where a child **plays with the idea before being asked a single thing about it** —
pokes it, drags it, runs it, breaks it, and discovers how it behaves. By the time
the questions begin, the idea is already an old friend.

Non-negotiables for a great playground:

- **It must be genuinely interactive.** Sliders to drag, boxes to peek inside,
  machines to run, shapes to spin, pizzas to cut. *Reading is not playing.* If the
  child can't **do** something on every screen, it is not finished.
- **Tell a story.** Wrap it as a tiny adventure: a catchy title ("The Smart
  Path", "The Percentage Playground"), an `intro` that sets the scene, and an
  `outro` that sends the child off proud. Never "Topic 1: Warm-up."
- **Prefer a journey (`stops`)** over a flat grid — it carries the story. Each
  stop:
  - opens with a **real-life hook** (a bus, a coin jar, a seesaw, a pizza),
  - has **exactly one** interactive widget to play with,
  - names the **"smart shortcut"** — why this idea makes a hard thing easy,
  - ends with a **self-check question** whose answer reveals on a tap.
- **Climb from dead-simple to grade level** across the stops. Stop 1 should feel
  like a game a five-year-old would enjoy; the final stop reaches the real
  concept.
- **Never spoil the questions.** Set each widget's starting values so the default
  state does not hand over any question's answer — let the child *arrive* there by
  playing.

Lean on these parameterised interactive widgets (all safe, all documented in
`QUESTION_FORMAT.md` section 3):
`varBox`, `functionMachine`, `varExpression`, `varBalance`, `varCounter`,
`varTrick`, `slices`, `grid`, `percentOf`, `percentLab`, `percentPie`,
`percentCompare`, `volume3d`. (`threejs` / `matterjs` work too but execute code
from the JSON — prefer the parameterised widgets.)

The playground ships **inside the pack** as the top-level `playground` field
(`QUESTION_FORMAT.md` section 6), so it travels with the class — no code edits
needed.

---

## The delivery workflow (every time)

When someone asks for a class, **do not dump twenty questions on them.** Earn the
go-ahead on a small sample first:

1. **Build the full playground** plus **3 sample questions** (each with a complete
   lesson).
2. **Show those, then stop and ask:** Does the feel land? Right voice, right
   level, fun enough, real-life enough?
3. **Only after a clear thumbs-up,** write the remaining questions (~20 total),
   holding the same bar.

This makes the requester a partner — they shape the feel on a cheap sample before
you invest in the whole set.

---

## Real-life hook bank (reach for these constantly)

Money & shopping · bus / train / car journeys · cooking & sharing food (pizza,
cake, pancakes) · pocket money & saving jars · phone & game-console battery ·
game scores, levels & lives · sports (goals, laps, points) · the child's own body
(heartbeats, steps, height, age) · motors, gears & wheels · music & beats ·
weather, clocks & time · nature (animals, plants, the Moon, tides).

Every abstract idea has a home in one of these. Find it before you write the
section, not after.

---

## The lessons (pointer)

Each question carries a "Let's Learn" lesson. The full craft — the 6–8 section
arc, the mandatory **Fun Fact**, **where-it-lives-in-the-world**, and
**try-it-yourself** sections, plus the golden rules — lives in `SKILL.md` and is
exemplified in `references/example-lesson.md`. The one thing to carry from *this*
page into every lesson: **lead with real life.**

---

## Before you hand it over — checklist

- [ ] The class **opens with an interactive `playground`** shipped in the pack JSON.
- [ ] The playground **tells a story** and **every screen lets the child do something**.
- [ ] You **previewed the playground + 3 questions** and got a thumbs-up first.
- [ ] **~20 questions**, ordered easy → hard.
- [ ] **Every lesson connects to real life** — no abstract-only sections.
- [ ] Nothing in a playground or question `media` **spoils its own answer**.
- [ ] `python scripts/validate_pack.py questions/<pack>.json` **passes**.
