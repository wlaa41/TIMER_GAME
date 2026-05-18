---
name: quiz-pack-builder
description: >-
  Generate question-pack JSON files for the AI Edu Quiz Quest web game. Use this
  skill whenever the user wants to create quiz questions, build or add a question
  pack, or turn a topic, photo, worksheet, textbook page, slideshow, or PDF into
  game questions — even when they just say things like "make questions about
  volcanoes," "add a pack on fractions," "build a quiz from this photo," or "turn
  this worksheet into a game" without naming the JSON format. Produces a validated
  .json pack whose every question carries a rich, science-communicator-style
  "Let's Learn" lesson written for young explorers — with fun facts, real-world
  expansion, and hands-on exercises.
---

# Quiz Pack Builder

This skill builds **question packs** for the AI Edu Quiz Quest game — `.json`
files the game loads and plays. Getting the questions right is the easy half.
The real job is making every **"Let's Learn"** lesson feel like a tiny, thrilling
science lesson that a curious child genuinely wants to read.

You are writing for **little explorers**. A lesson has done its job when the
explorer finishes it knowing more, *wondering* more, and itching to try something.

## What you produce

One `.json` file saved in the project's `questions/` folder, named after the
topic (lowercase, hyphens — e.g. `questions/the-moon.json`).

Before writing any JSON, **read `references/pack-format.md`** — it is the exact
schema (field names, media types, code templates). Then **read
`references/example-lesson.md`** — it is one gold-standard question + lesson to
imitate in spirit.

## Workflow

### 1. Gather the input
Ask only for what is missing:
- **Topic / subject** — what the pack teaches.
- **Age or grade** — tunes vocabulary and examples. Default: ages 9–12.
- **How many questions** — default 8–10.
- **Photos or files** — a photo, worksheet, textbook page, PDF, or slideshow.

If the user provides a **photo or file**, open it with the Read tool and use it:
- A photo (animal, plant, machine, place, artwork) → build questions about what
  is actually in it.
- A worksheet / textbook page / PDF → keep its learning goals, but rewrite each
  item into the game's format with a full lesson. Never just copy bare questions.

Copy any photo the pack will display into the project's `assets/` folder and
reference it as `assets/<filename>`.

### 2. Plan the questions
Before touching JSON, sketch the set: list each question, the one idea it tests,
and an easy-to-hard order. Aim for a gentle climb — the pack should feel like a
journey, not a wall.

### 3. Write each question and its lesson
This is the heart of the skill — see **The Lesson Craft** below.

### 4. Give most lesson sections a visual
See **Visuals** below and the schema reference.

### 5. Assemble and validate
Write the JSON, then run the bundled validator:
```
python scripts/validate_pack.py questions/<your-pack>.json
```
(Run it from this skill's folder, or give the script's full path.) Fix every
error it reports — a pack that fails the validator will break the game.

### 6. Hand it back
Tell the user they can play it immediately with the game's "Choose File" button,
and offer to add it to the built-in dropdown in `index.html` (a new `<option>`
inside `<select id="pack-select">`).

## The Lesson Craft

### Your voice
You are a warm, excited science communicator — the kind of narrator who makes a
child lean toward the screen. Curious, vivid, never dull, never talking down.

- Short sentences. One idea at a time. A lesson is a conversation, not a textbook.
- Speak to "you." Ask the explorer real questions and let them wonder.
- Wonder over jargon. When a real term earns its place, say it proudly, then
  unpack it at once: *"Scientists call this condensation — that is just water
  deciding to become a droplet again."*
- Concrete pictures beat abstract words. Compare the new thing to something the
  explorer already knows — a backpack, a swing, a slice of pizza.
- Children are clever — do not dumb things down, *light them up*. Vivid beats
  simple.
- **Every fact must be true.** A "fun fact" that is wrong is the worst possible
  outcome in a child's lesson. If you are not certain, verify it with web search
  or choose a fact you know is solid.

### The shape of a great lesson
6–8 sections in roughly this arc. It is a rhythm, not a cage — adapt freely:

1. **The hook** — open with a question or an everyday scene that makes the topic
   feel close. Not "Today we learn about X." More "Have you ever noticed…?"
2. **The big idea** — the core concept, explained plainly, with a visual.
3. **See it work** — a clear walk-through or worked example. For maths, use
   *different numbers* than the question, so you teach the method without handing
   over the answer. Use `steps`.
4. **Fun Fact** — its own section. One genuinely surprising, true, delightful
   fact. This is the part the explorer repeats at the dinner table.
5. **Where it lives in the world** — expand the topic. Show this idea out in
   nature, space, technology, the kitchen, the explorer's own body. The world
   should look a little different after this section.
6. **Try it yourself** — 2–4 hands-on activities or practice tasks the explorer
   can really do: safe, cheap, no rare equipment. Use `points`.
7. **Watch out** — common mistakes, kindly framed. Use `points`.
8. **Back to your question** — point them at the actual question with
   encouragement, in a `note`. Never state the answer.

**Every lesson must include at least these three:** a Fun Fact section, a
"where it lives in the world" expansion section, and a "Try it yourself"
section. Those three are what make the lesson sing — they are the whole point.

### Golden rules
- **Never reveal the question's own answer in the lesson.** Teach the method or
  the idea; leave the explorer the last, satisfying step. For maths, always
  demonstrate on different numbers.
- Keep each `body` to 1–3 short paragraphs. Walls of text lose explorers.
- Make headings inviting, not labels: "Why does ice float?" beats "Properties of
  Ice."
- Accuracy is non-negotiable, including in fun facts and real-world claims.

### Strong vs weak writing
Weak: "Surface area is the sum of the areas of all the faces of a solid."
Strong: "Imagine wrapping a present. Every bit of paper that touches the box is
its *surface area*. A cube is an easy gift to wrap — all six sides match."

Weak: "The Moon orbits the Earth."
Strong: "The Moon is on a slow, steady lap around us — and it has been running
that same circle for over four billion years, long before the first dinosaur."

## Question rules
- 2–4 `options`. The `correctAnswer` must match one option **exactly** (the
  validator checks this).
- Keep the question's own `media` **spoiler-free** — it shows before the explorer
  even tries. If a visual would give away the method or the answer, leave `media`
  off the question and put that visual inside a lesson section instead. The
  lesson only opens when the explorer presses "Let's Learn."
- Keep `media` on a question only when the visual *is* the question — e.g. "name
  the 3D shape on screen," "count the falling blocks."

## Visuals
Give most lesson sections a visual, but only when it genuinely helps — text,
`steps`, and `points` carry plenty on their own. Pick the simplest type that
works. Full options and code templates are in `references/pack-format.md`.

- `image` — a photo or SVG. The go-to for real-world topics (animals, places,
  history, art). Use the user's provided photos here.
- `chart` — a bar chart. Great for numbers, comparisons, before/after.
- `illustration` — built-in themed scenes; **only 5 themes exist**: `balance`,
  `triangle`, `shop`, `reading`, `study`. Do not invent new theme names.
- `threejs` — interactive 3D; for shapes, planets, molecules. Keep the code
  simple — use the templates in the reference.
- `matterjs` — interactive 2D physics; for gravity, motion, collisions.
- `video` — a local file or a YouTube/Vimeo embed URL.

For most non-maths topics, `image` and `chart` are the workhorses; the `study`
theme is the safe generic illustration.

## Section field cheat-sheet
A lesson `hint` is `{ "format": "lesson", "title", "subtitle", "sections": [...] }`.
Each section (everything optional except `heading`) renders in this fixed order:

`heading` → `body` → `visual` → `steps` → `points` → `note`

- `heading` — inviting section title (required).
- `body` — a string, or an array of strings (one paragraph each).
- `visual` — a media object (any type above).
- `steps` — array of strings → numbered list (for processes / worked examples).
- `points` — array of strings → bullet list (for tips, facts, exercises).
- `note` — a string → one highlighted takeaway box.

## Reference files
- `references/pack-format.md` — the exact JSON schema and code templates. Read
  this before writing JSON.
- `references/example-lesson.md` — a complete gold-standard question + lesson.
  Read this to calibrate quality and tone.
- `scripts/validate_pack.py` — run this on every finished pack.
