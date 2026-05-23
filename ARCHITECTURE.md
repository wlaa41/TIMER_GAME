# Architecture & Porting Guide

This document describes **the whole game** — what it does, how it is built, and
the contracts that hold it together — so that the technology underneath can be
swapped (a framework rewrite, a different 3D engine, a native port) **without
losing the content or the behaviour**.

Read it in two layers:

- **Portable layer** — the question packs (`questions/*.json`), the pack format
  ([QUESTION_FORMAT.md](QUESTION_FORMAT.md)), and the game's *behaviour*. This is
  the valuable part and is technology-agnostic. A rewrite must preserve it.
- **Implementation layer** — the current HTML/CSS/vanilla-JS code and the
  libraries it leans on. This is the replaceable part.

The [Migration Guide](#10-migration-guide-changing-the-technology) at the end
maps exactly what to keep and what to replace.

---

## 1. What the game is

**AI Edu Quiz Quest** is a kid-friendly, timed multiple-choice quiz that plays
entirely in the browser. A "question pack" (a JSON file) drives everything: each
question has answer options, an optional **visual** (image, chart, 3D scene,
2D physics, or an interactive widget), and a **hint** that can expand into a full
multi-section **mini-lesson** with its own visuals. While a lesson is open the
timer freezes. The player gets a total countdown plus a per-question pace meter,
a score, and a count of hints used.

There is **no backend, no accounts, no database**. Packs are static JSON, either
bundled in `questions/` or uploaded from disk.

---

## 2. Technology stack (current implementation)

| Concern        | Choice                                                              |
|----------------|---------------------------------------------------------------------|
| Markup         | One static `index.html` (three "screens" in one document)           |
| Styling        | One `style.css`, themed with CSS custom properties                  |
| Logic          | One `app.js`, **vanilla ES2015+**, no framework                     |
| Build step     | **None.** No bundler, transpiler, or package manager                |
| Package manager| **None.** Libraries load from CDNs via `<script>`                   |
| 3D             | Three.js **r128** + OrbitControls (WebGL)                           |
| 2D physics     | Matter.js **0.19.0**                                                |
| Fonts          | Google Fonts "Inter"                                                |
| Hosting        | Static site (Netlify): <https://aiedu41.netlify.app/>               |

**Browser APIs used:** DOM, `fetch`, `FileReader`, `localStorage`, `matchMedia`,
Web Audio (`AudioContext`), WebGL (through Three.js), Canvas, `requestAnimationFrame`,
and SVG (built via the DOM). Any target platform must provide equivalents.

---

## 3. Files and responsibilities

```text
web_game/
├── index.html          # Single page: 3 screens, loads libs + app.js + style.css
├── app.js              # ALL game logic (see section 5 for its internal modules)
├── style.css           # All styling + light/dark theming via CSS variables
├── favicon.svg         # Icon
├── site.webmanifest    # PWA-style metadata (name, colors, icon)
├── README.md           # User-facing intro
├── QUESTION_FORMAT.md  # Authoritative question-pack JSON spec
├── ARCHITECTURE.md     # This document
├── assets/             # Static SVGs referenced by `image` media
│   └── *.svg
├── questions/          # Bundled question packs (static JSON)
│   ├── 1.json              # "Quest Lab: Maths, Shapes, and Motion"
│   ├── percentages.json    # "Percentage Power" (interactive, full-lesson pack)
│   ├── 2.json              # "Word Explorer and Shape Studio"
│   └── percentage_5apr.json# retired/unused (kept on disk, not in the menu)
└── .claude/launch.json # Local dev-server config for tooling (not part of the app)
```

There is intentionally **no `package.json`, `netlify.toml`, or build config** —
deployment is "serve these files".

---

## 4. Screens and user flow

The whole UI lives in `index.html` as four `<section>` "screens" toggled by a
`.hidden` CSS class (only one is visible at a time):

1. **Setup** (`#setup-screen`) — shown first on load. Pick a built-in pack
   (`#pack-select`) **or** upload a JSON file (`#json-upload`), set minutes
   (`#time-input`), press **Start** (`#start-btn`).
2. **Playground** (`#playground-screen`) — an **optional, per-pack warm-up**
   shown after Start, **before** the questions, with the **timer paused**. The
   `#playground-grid` is filled by `renderPlaygroundFor()` with the tools that
   match the loaded pack, resolved from an in-code library (`PLAYGROUND_LIBRARY`
   + `getPlaygroundForPack()` in `app.js`, keyed by pack title — *not* the pack
   JSON). A **Start the questions** button (`.playground-begin-btn`) runs
   `beginQuestions()`, which disposes the playground scenes, starts the timer
   and shows the game. A pack with no matching playground skips this screen.
3. **Game** (`#game-screen`) — HUD (timer, pace, score, hints, progress) + the
   question panel (code badge, time badge, progress bar, question text, **media
   stage**, answer buttons, the Hint/Lesson button, the hint/lesson box, the
   feedback line) + a pause overlay.
4. **Result** (`#result-screen`) — final score and hints used; "Play Again" /
   "New Pack" both just reload the page.

Flow: `Setup → (Start) → [Playground → (Start questions)] → Game → (answers/time run out) → Result`
(the playground step is skipped when the pack has no matching entry).

> **Reusable playgrounds.** `PLAYGROUND_LIBRARY` is deliberately an in-code
> object (not pack JSON) so the tool-sets can become shared, reusable objects
> used across packs and screens; a later refactor may formalise this.

---

## 5. `app.js` internal modules

`app.js` is organised into numbered sections (see its header comment). A rewrite
can map each to a module/component:

| # | Section | Responsibility |
|---|---------|----------------|
| 1 | Game state | All mutable state as module-level variables (see §6). |
| 2 | DOM references | The `els` object — every element the code touches (see §7). |
| 3 | Generic helpers | `formatTime`, `clearElement`, `makeEl`, `appendParagraphs`, pack/estimate getters, HUD updaters. |
| 4 | Audio feedback | Web Audio tone synthesis for correct / wrong / tick. |
| 5 | Simulation registry | Lifecycle for "live" scenes — `register/cleanup/pause/resume` per group. |
| 6 | Media renderers | One function per media type + the `MEDIA_RENDERERS` registry (the extension seam — see §8). |
| 7 | Question media | Picks the question's media and mounts it on the stage. |
| 8 | Mini-lesson renderer | Builds the multi-section lesson and mounts each section's visual. |
| 9 | Legacy hint renderer | Backwards-compatible one-shot hint box. |
| 10 | Question flow | `loadQuestion`, `renderInputs`, `checkAnswer`, advance/finish. |
| 11 | Timer | Total countdown + per-question pace; freeze rules. |
| 12 | Pack loading & setup | Normalise/validate packs, file upload, built-in fetch, Start handler. |
| 13 | Theme | Light/dark toggle and device-preference following. |

---

## 6. State model

All game state is held in module-level variables (section 1). A port should
model the same state (ideally in one store):

| Variable | Meaning |
|----------|---------|
| `quizData` | The loaded, **normalised** pack (`{ quizTitle, questions[] }`). |
| `currentQuestionIndex` | Index of the question on screen. |
| `correctAnswers` | Running score. |
| `helpUsedCount` | How many questions used a (legacy) hint. |
| `selectedDuration` | Total mission length, seconds. |
| `timeRemaining` | Countdown, seconds. |
| `questionTargetSeconds` | Pace target for the current question. |
| `questionElapsedSeconds` | Time spent on the current question. |
| `timerInterval` | The 1-second interval handle. |
| `audioContext` | Lazily created Web Audio context. |
| `helpUsedThisQuestion` | Guards double-counting a hint. |
| `isPaused` | Manual pause (overlay shown, timer frozen). |
| `lessonOpen` | A mini-lesson is expanded (timer frozen, **no** penalty). |
| `gameFinished` | Terminal flag. |
| `answerLocked` | Prevents double-answering during the post-answer delay. |

---

## 7. The DOM contract (integration points)

The current code binds to elements by `id` (collected once in the `els` object,
plus `#theme-toggle`). **These ids are the contract between the markup and the
logic** — in a framework rewrite they become component props/state, but the
*roles* must be reproduced:

`#setup-screen`, `#game-screen`, `#result-screen`, `#json-upload`,
`#file-status`, `#pack-select`, `#time-input`, `#time-status`, `#start-btn`,
`#pause-btn`, `#resume-btn`, `#pause-overlay`, `#quiz-title-display`,
`#timer-display`, `#timer-state`, `#question-pace-display`, `#pace-fill`,
`#score-display`, `#help-display`, `#progress-display`, `#progress-bar`,
`#question-code`, `#question-time`, `#question-time-value`, `#question-text`,
`#media-stage`, `#media-renderer`, `#canvas-wrapper`, `#input-area`, `#help-btn`,
`#hint-box`, `#feedback-message`, `#final-score`, `#final-help`, `#theme-toggle`.

Note the **media stage** has two children: `#media-renderer` (normal flow:
illustrations, charts, images, the interactive widgets) and `#canvas-wrapper`
(a bare, fixed-height box used only for `threejs`/`matterjs`). See §8.

---

## 8. The media renderer system (the main extension seam)

This is the most important contract to preserve, because it is how packs declare
visuals and how new visual types are added.

### 8.1 Renderer contract

Every media type is one function:

```js
function renderX(container, media) -> handle | void
```

- `container` — the DOM node to render into.
- `media` — the Media object from the JSON (always has a `type`).
- **Return value** — a static visual returns nothing; a **live** visual
  (animation loop / WebGL / physics) returns a **handle**:

```js
{ cleanup?: () => void, pause?: () => void, resume?: () => void }
```

Renderers are registered in a single map keyed by `media.type`:

```js
const MEDIA_RENDERERS = { illustration, chart, image, photo, video,
                          slices, grid, percentOf, percentLab, percentPie,
                          percentCompare, varBox, functionMachine, varExpression,
                          varBalance, varCounter, varTrick, volume3d,
                          threejs, matterjs };
```

`renderMedia(container, media, group)` looks up the function, calls it, and if a
handle comes back, registers it for lifecycle management (§8.3). Unknown types
render a visible "Unsupported media type" message rather than throwing.

### 8.2 The media types

| `type` | Library | Live? | Runs code from JSON? | Notes |
|--------|---------|-------|----------------------|-------|
| `illustration` | none (CSS/DOM) | no | no | Themed scenes: `balance`, `triangle`, `shop`, `reading`, `study`. |
| `chart` | none (DOM) | no | no | Horizontal bar chart. |
| `image` / `photo` | none (`<img>`) | no | no | Local SVG/path or URL. |
| `video` | none (`<video>`/`<iframe>`) | partial | no | `src` file or `embed` URL; handle pauses it. |
| `slices` | none (SVG) | no\* | no | Interactive pie/slices; sliders + live %. |
| `grid` | none (SVG) | no\* | no | Interactive 10×10 percent grid. |
| `percentOf` | none (DOM) | no\* | no | Interactive % of an amount (modes of/discount/increase). |
| `percentLab` | none (SVG) | no\* | no | Percentage Desk: cut a bar into N parts, shade k; fraction/simplified/percent/decimal + same-length equivalence bar + "fraction of a number". |
| `percentPie` | none (SVG) | no\* | no | Circle twin of `percentLab` (pizza slices); editable "group every N" lines. |
| `percentCompare` | none (SVG) | no\* | no | Two pizzas side by side (reuses `percentPie` via an `onChange` hook); "Same value!" badge + add/subtract; controls collapse to an "Adjust" panel on phones. |
| `varBox`, `functionMachine`, `varExpression`, `varBalance`, `varCounter`, `varTrick` | none (DOM/SVG) | no\* | no | The Variables playground: mystery box, function machine (+ guess-my-rule), expression builder, pan balance (solve x), changing counter (savings/score/battery), and the "think of a number" trick. |
| `volume3d` | Three.js | **yes** | no | Interactive 3D box/cylinder; dimension sliders; live volume; unit-cube lattice. |
| `threejs` | Three.js + OrbitControls | **yes** | **YES** | Runs `payload.setup`/`update` via `new Function`. |
| `matterjs` | Matter.js | **yes** | **YES** | Runs `payload.setup` via `new Function`. |

\* The interactive 2D widgets attach event listeners but have no animation loop,
so they need no handle; they are cleaned up when their container is cleared.

`isCanvasMedia(media)` is **true only for `threejs` and `matterjs`** — those mount
into the bare `#canvas-wrapper`. Everything else (including `volume3d`, which
builds its own sized sub-canvas) renders into `#media-renderer` / a lesson
section's `.lesson-visual`.

### 8.3 Lifecycle (why handles matter)

Live scenes must be torn down to free GPU/CPU. Handles are tracked in two groups
so the **question** scene and the **lesson** scenes dispose independently:

```js
simulationGroups = { question: [], lesson: [] }
```

- Changing question → `cleanupSimulations("question")`.
- Closing a lesson → `cleanupSimulations("lesson")`.
- Manual pause / resume → `pause`/`resume` every handle in both groups.
- The animation loops also check the global `isPaused` themselves.

**Any rewrite must keep this lifecycle**, or live scenes will leak. In React/Vue/
Svelte this maps naturally onto effect cleanup / `onUnmount`.

### 8.4 Security note

`threejs` and `matterjs` execute JavaScript embedded in the JSON (`new Function`).
**Only load trusted packs.** The interactive widgets (`slices`, `grid`,
`percentOf`, `volume3d`) take **parameters only** and run no code from JSON — they
are the safe, portable way to add interactivity.

---

## 9. Subsystems in detail

### 9.1 Hints and mini-lessons

`isLessonHint(question)` is true when `hint.format === "lesson"` or `hint.sections`
is an array. Two paths:

- **Lesson** — a multi-section teaching panel that expands below the question.
  While open, the timer is **frozen** and there is **no score penalty**; it can be
  reopened freely. Each section renders in the fixed order **heading → body →
  visual → steps → points → note**. The panel is attached to the DOM *before* its
  visuals mount, so live scenes read a correct size.
- **Legacy hint** — `{ title, text, steps }` or a plain string. A one-shot box
  that **counts as a used hint**.

Project convention (see QUESTION_FORMAT.md §4.2): each lesson should include an
**interactive change-it-yourself widget** and a closing **"Now you teach it: write
it and draw it"** handwriting/drawing section.

### 9.2 Timer, pacing, scoring

- One `setInterval` ticks every second; it does nothing while `isPaused`,
  `gameFinished`, or `lessonOpen`.
- Total time = `selectedDuration`. Per-question target = `estimatedSeconds` if the
  question has one, else `total / number-of-questions`.
- If **every** question has `estimatedSeconds`, the setup screen pre-fills the
  suggested total (still editable).
- Score is `correctAnswers / total`. After an answer, inputs lock and the game
  auto-advances after **1800 ms**.

### 9.3 Audio

Correct/wrong/tick cues are **synthesised** with the Web Audio API (oscillators +
gain envelopes) — no audio files. The context is created lazily and resumed on
demand (browser autoplay rules). If Web Audio is unavailable, the game is silent.

### 9.4 Theming

Light/dark is driven entirely by CSS custom properties under
`:root` / `[data-theme="dark"]`, with `data-theme` set on `<html>`. An inline
script in `<head>` applies the stored/`prefers-color-scheme` theme **before paint**
(no flash). The toggle persists the choice in `localStorage` under
`"aiedu-theme"`; until the user chooses, it follows the device.

### 9.5 Loading packs

- **Built-in:** `loadSelectedBuiltInPack()` does `fetch(packSelect.value)`. On any
  non-`file:` protocol the first option auto-loads at startup.
- **Upload:** `FileReader` reads the file → `JSON.parse` → `setLoadedQuiz`.
- `normalizeQuizData` fills defaults (`id`, `code`, `engine`, `payload`) and the
  title fallback; `setLoadedQuiz` rejects empty packs and computes the suggested
  total time.

---

## 10. Migration guide ("changing the technology")

### 10.1 Keep vs. replace

**Keep unchanged (portable data, not code):**

- Everything in `questions/*.json`.
- The pack format spec in [QUESTION_FORMAT.md](QUESTION_FORMAT.md).
- The lesson content and pedagogy.

**Preserve as contracts (so existing packs keep working):**

- The pack JSON schema.
- The **Media object** shape and the set of media `type`s + their fields.
- The **renderer contract** `(container, media) -> {cleanup,pause,resume}` and the
  **simulation lifecycle** (cleanup on question change / lesson close; pause on
  pause).
- The **behaviour rules**: timer freeze (pause/finish/lesson-open), pacing,
  scoring, hint counting, 1800 ms auto-advance, "lesson is free / legacy hint
  counts".

**Replace freely (tech-specific):**

- `index.html` structure and the element ids (§7).
- The vanilla-DOM building in `app.js`.
- The CSS theming mechanism.
- The specific libraries (Three.js, Matter.js).
- The Web Audio tone synthesis.

### 10.2 Recommended target shape (framework rewrite)

1. **Model layer (pure, portable):** load + normalise a pack; pure functions for
   scoring and pacing; the state from §6 in one store. Unit-testable, no DOM.
2. **View layer:** components for the three screens, the HUD, and the question
   panel — reproducing the roles in §7.
3. **Media subsystem:** a registry mapping `media.type` → a component/renderer.
   Keep the cleanup/pause/resume lifecycle (e.g. React effect cleanup). Encapsulate
   Three.js and Matter.js behind this interface so they can be swapped.

Keeping `media.type` as the stable seam means new packs and old packs both keep
working across the rewrite.

### 10.3 Swapping a specific library

- **Three.js → other 3D engine:** only `initThreeJS`, `renderVolume3D`, and the
  loaded packs' `threejs` payloads use it. `volume3d` is parameterised, so it is
  easy to re-implement in any engine. **Caveat:** `threejs` media embeds *raw
  Three.js code* in the JSON, so changing the 3D engine breaks those payloads —
  migrate them to parameterised widgets (like `volume3d`) or to the new engine's
  API.
- **Matter.js → other physics engine:** only `initMatterJS` and `matterjs`
  payloads use it; same caveat about embedded code.
- **Fonts:** purely cosmetic.

### 10.4 Adding a new media type (the seam in action)

1. Write `renderMyType(container, media)`; return a handle if it animates.
2. Add it to `MEDIA_RENDERERS` under a new `type` string.
3. If it needs the bare canvas box, extend `isCanvasMedia`; otherwise it renders
   in the normal flow.
4. Document its fields in QUESTION_FORMAT.md §3.
5. Prefer **parameters over embedded code** (like the interactive widgets) so packs
   stay engine-independent and safe.

### 10.5 Gotchas

- **eval-coupled packs:** `threejs`/`matterjs` tie packs to those exact libraries.
  The interactive widgets are library-light and portable — prefer them.
- **Asset caching:** there is no cache-busting; after editing `app.js`/`*.json`,
  hard-refresh (Ctrl/Cmd+F5). A real build step (or hashed filenames) would fix
  this for a production rewrite.
- **No tests** exist. The scoring/pacing/normalisation functions are the obvious
  first targets for unit tests in any rewrite.
- **`file://` limits:** opening `index.html` directly supports file upload but not
  the built-in pack `fetch` — use a static server.

---

## 11. Build & deploy

- **No build.** Deploy by serving the repository root as static files (Netlify).
- **Local dev:** any static server, e.g. `python -m http.server 8000` (the
  bundled tooling config uses port 8765). Then open `http://localhost:<port>`.

---

## 12. Dependency summary

| Dependency | Version | Source | Used by | Swap difficulty |
|------------|---------|--------|---------|-----------------|
| Three.js | r128 | cdnjs `<script>` | `threejs`, `volume3d` | Medium (`volume3d` easy; `threejs` payloads embed code) |
| OrbitControls | 0.128 | jsdelivr `<script>` | 3D orbit/zoom | Low |
| Matter.js | 0.19.0 | cdnjs `<script>` | `matterjs` | Medium (payloads embed code) |
| Inter font | — | Google Fonts | styling | Trivial (cosmetic) |

Everything else (game loop, charts, illustrations, interactive widgets, audio,
theming, pack loading) is **dependency-free** browser code.
