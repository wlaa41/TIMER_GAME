# Question Pack Format

This document is the complete specification for the JSON files that power
AI Edu Quiz Quest. A pack can be uploaded from disk or bundled in `questions/`.

> **Security note:** `threejs` and `matterjs` media run JavaScript from the
> JSON. Only load packs you trust.

---

## 1. Top level

```json
{
  "quizTitle": "Quest Lab: Maths, Shapes, and Motion",
  "description": "An optional sentence describing the pack.",
  "questions": [ /* one or more Question objects */ ]
}
```

| Field         | Type     | Required | Notes                                              |
|---------------|----------|----------|----------------------------------------------------|
| `quizTitle`   | string   | yes\*    | Shown in the header. `title` also accepted.        |
| `description` | string   | no       | Not shown in-game; for your own reference.         |
| `questions`   | array    | yes      | The list of questions, played in order.            |

\* If missing, the game falls back to `"Quiz Quest"`.

---

## 2. Question object

```json
{
  "id": "q1",
  "code": "ALG-01",
  "question": "Solve for x: 4x - 12 = 28",
  "options": ["4", "8", "10", "12"],
  "correctAnswer": "10",
  "estimatedSeconds": 90,
  "media": { /* optional Media object - see section 3 */ },
  "hint":  { /* Lesson object (section 4) or Legacy hint (section 5) */ }
}
```

| Field           | Type     | Required | Notes                                                        |
|-----------------|----------|----------|--------------------------------------------------------------|
| `id`            | string   | no       | Auto-filled (`q1`, `q2`, ...) if omitted.                    |
| `code`          | string   | no       | Badge shown above the question (e.g. `ALG-01`).              |
| `question`      | string   | yes      | The prompt the player reads.                                 |
| `options`       | string[] | yes      | Answer buttons. Use 2-4 for the cleanest layout.             |
| `correctAnswer` | string   | yes      | Must exactly match one entry of `options` (case-insensitive).|
| `estimatedSeconds` | number | no    | Suggested seconds to answer this question. Drives the time badge and pace meter — see the note below. |
| `media`         | Media    | no       | A visual shown with the question itself.                     |
| `hint`          | Lesson \| Legacy | no | The teaching content behind the hint button.            |

> **Tip:** Keep the question's own `media` free of spoilers. It is shown
> immediately, before the player tries. If a visual would reveal the method or
> answer, leave `media` out and place that visual inside a lesson section
> instead — the lesson only opens when the player presses **Let's Learn**.

> **Estimated time:** `estimatedSeconds` is optional. When set, the game shows
> it as a small time badge on the question and points the Question Pace meter
> at it instead of a flat average. When *every* question in a pack has one, the
> setup screen sums them to pre-fill the total play time (still editable).
> Packs without the field are unaffected. Vary it with difficulty — a quick
> recall question might be `60`, a multi-step challenge `240` or more.

---

## 3. Media object

A **Media** object describes one visual. The same shape is used in two places:
the question's `media` field, and each lesson section's `visual` field. The
`type` field selects the renderer.

### 3.1 `illustration` — built-in themed scene (no assets needed)

```json
{
  "type": "illustration",
  "theme": "balance",
  "title": "Keep the equation balanced",
  "caption": "Whatever you do to one side, do to the other.",
  "left": "4x - 12",
  "right": "28",
  "callouts": ["Add 12", "Then divide by 4"]
}
```

| Field      | Type     | Notes                                                          |
|------------|----------|----------------------------------------------------------------|
| `theme`    | string   | One of `balance`, `triangle`, `shop`, `reading`, `study`.      |
| `title`    | string   | Optional heading.                                              |
| `caption`  | string   | Optional sentence under the title.                             |
| `left`     | string   | `balance` theme: text on the left pan.                         |
| `right`    | string   | `balance` theme: text on the right pan.                        |
| `label`    | string   | `shop` theme: text on the counter.                             |
| `word`     | string   | `reading` theme: word shown on the book page.                  |
| `callouts` | string[] | Optional chips shown beneath the scene.                        |

### 3.2 `chart` — horizontal bar chart

```json
{
  "type": "chart",
  "title": "Original price and discount",
  "caption": "The final price is the original minus the discount.",
  "values": [
    { "label": "Original", "value": 120, "prefix": "$", "color": "#3772ff" },
    { "label": "Discount", "value": 30,  "prefix": "$", "color": "#ff6b6b" },
    { "label": "Final",    "value": 90,  "prefix": "$", "color": "#16b8a6" }
  ],
  "teachingPoint": "25% of 120 is the same as 120 divided by 4."
}
```

Each entry of `values` has `label`, `value` (number), and optional `prefix`,
`suffix`, and `color` (hex). `teachingPoint` is an optional closing sentence.

### 3.3 `image` — a picture or local SVG

```json
{
  "type": "image",
  "src": "assets/balance-scale.svg",
  "alt": "A level balance scale",
  "caption": "The same change on both sides keeps the equation balanced."
}
```

`src` may be a path inside the project (e.g. `assets/...`) or a full URL.
`alt` is for accessibility; `caption` is shown under the image. (`photo`
behaves identically to `image`.)

### 3.4 `video` — a video clip

Two ways to provide a video. Use **one** of `src` or `embed`.

```json
{
  "type": "video",
  "src": "assets/two-step-equations.mp4",
  "poster": "assets/two-step-poster.jpg",
  "caption": "A two-minute walkthrough."
}
```

```json
{
  "type": "video",
  "embed": "https://www.youtube.com/embed/VIDEO_ID",
  "caption": "Watch the full lesson."
}
```

| Field     | Type   | Notes                                                            |
|-----------|--------|------------------------------------------------------------------|
| `src`     | string | Direct video file (`.mp4`, `.webm`). Renders a `<video>` player. |
| `embed`   | string | Embed URL (YouTube/Vimeo `/embed/` link). Renders an `<iframe>`. |
| `poster`  | string | Optional still image shown before a `src` video plays.           |
| `caption` | string | Optional sentence under the video.                               |

### 3.5 `threejs` — interactive 3D scene

```json
{
  "type": "threejs",
  "payload": {
    "setup": "const geo = new THREE.BoxGeometry(2,2,2); const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3772ff })); mesh.name = 'quizShape'; scene.add(mesh); camera.position.z = 4.4;",
    "update": "const s = scene.getObjectByName('quizShape'); if (s) s.rotation.y += 0.01;"
  }
}
```

- `payload.setup` runs once. Available variables: `scene`, `camera`, `THREE`.
- `payload.update` runs every frame (optional). Same variables.
- The player can orbit and zoom the scene with the mouse.

### 3.6 `matterjs` — interactive 2D physics

```json
{
  "type": "matterjs",
  "payload": {
    "setup": "const ball = Matter.Bodies.circle(width * 0.5, 50, 28, { restitution: 0.8 }); Matter.World.add(world, ball);"
  }
}
```

- `payload.setup` runs once. Available variables: `world`, `Matter`, `width`,
  `height`. Outer walls and a floor are added automatically.
- The player can drag bodies with the mouse.

### 3.7 `slices` — interactive 2D pie / slices

```json
{
  "type": "slices",
  "title": "A pizza cut into equal slices",
  "caption": "Cut the circle and colour some slices.",
  "slices": 8,
  "filled": 4,
  "minSlices": 2,
  "maxSlices": 12,
  "color": "#f2b73d",
  "tip": "Drag the sliders and watch the percentage change."
}
```

A clean SVG circle cut into equal slices. When `interactive` (default `true`),
two sliders let the child change the number of slices and how many are coloured,
with a live fraction + percentage readout (fractions auto-simplify).

| Field                  | Type   | Notes                                              |
|------------------------|--------|----------------------------------------------------|
| `slices`               | number | Starting number of slices. Default 8.              |
| `filled`               | number | Starting coloured slices (0–`slices`). Default half.|
| `minSlices`/`maxSlices`| number | Slider range. Default 2–12.                        |
| `color`                | string | Fill colour of the coloured slices.                |
| `interactive`          | bool   | Show the sliders. Default `true`.                  |
| `tip`                  | string | One-line prompt shown under the widget.            |

### 3.8 `grid` — interactive 100-square percent grid

A 10×10 grid of 100 squares with a slider for how many are coloured and a live
percentage readout (it fills by rows, so a full row reads as 10%).

| Field         | Type   | Notes                                                       |
|---------------|--------|-------------------------------------------------------------|
| `filled`      | number | Starting coloured squares (0–100). Default 30.              |
| `showDecimal` | bool   | If `true`, the readout reads `N% = N/100 = 0.NN`. Default `false`. |
| `color`, `interactive`, `tip` | | Same as `slices`.                           |

### 3.9 `percentOf` — interactive "percentage of an amount"

Two sliders (the percentage and the whole amount), a bar, and a live working
line. `mode` reshapes the result.

```json
{
  "type": "percentOf",
  "mode": "discount",
  "percent": 20,
  "amount": 30,
  "maxPercent": 90,
  "maxAmount": 100,
  "prefix": "GBP ",
  "stepPercent": 5,
  "tip": "Try 50% off."
}
```

| Field                    | Type   | Notes                                                            |
|--------------------------|--------|------------------------------------------------------------------|
| `mode`                   | string | `of` (the part), `discount` (amount − part), `increase` (amount + part). Default `of`. |
| `percent`/`amount`       | number | Starting values.                                                 |
| `maxPercent`/`maxAmount` | number | Slider maxima. Default 100.                                      |
| `stepPercent`/`stepAmount`| number| Slider steps. Default 1.                                         |
| `prefix`/`suffix`        | string | Wraps the amount, e.g. `"GBP "` or `" slices"`.                  |
| `color`, `interactive`, `tip` | | Same as `slices`.                                          |

### 3.10 `volume3d` — interactive 3D volume

A real Three.js box (or cylinder) the child can orbit, with sliders for its
dimensions and a live volume readout. Unlike `threejs`, **no code runs from the
JSON** — the shape is built from these safe parameters.

```json
{
  "type": "volume3d",
  "shape": "box",
  "unit": "cm",
  "length": 4, "width": 2, "height": 3,
  "min": 1, "max": 8,
  "tip": "Double one side and watch the volume."
}
```

| Field        | Type   | Notes                                                          |
|--------------|--------|----------------------------------------------------------------|
| `shape`      | string | `box` (uses length/width/height) or `cylinder` (uses radius/height). Default `box`. |
| `length`/`width`/`height`/`radius` | number | Starting dimensions.                     |
| `min`/`max`  | number | Slider range applied to every dimension. Default 1–6.          |
| `unit`       | string | Unit label, e.g. `"cm"`. Volume is shown as the unit cubed.    |
| `color`, `interactive`, `tip` | | Same as `slices`.                             |

### 3.11 `percentLab` — the Percentage Desk (bar)

A bar (the "desk") the child cuts into N equal parts and shades; the same amount
is shown four ways at once (fraction, simplified fraction, percentage, decimal),
with faint guide lines at the common fractions and a second bar showing the
**simplified fraction at the same length** (e.g. `2/10` and `1/5`). A panel
applies that fraction to a number the child types. No code runs from the JSON.

```json
{
  "type": "percentLab",
  "title": "The Percentage Desk",
  "parts": 10, "shaded": 2,
  "amount": 40,
  "maxParts": 100,
  "tip": "Cut into 4 and shade 3 to see 3/4 = 75%."
}
```

| Field      | Type   | Notes                                                       |
|------------|--------|-------------------------------------------------------------|
| `parts`    | number | Starting number of equal parts (2–`maxParts`). Default 10.  |
| `shaded`   | number | Starting shaded parts (0–`parts`). Default 2.               |
| `amount`   | number | Starting "of a number" amount. Default 40.                  |
| `maxParts` | number | Max parts the cut slider allows. Default 100.               |
| `color`, `interactive`, `tip` | | Same as `slices`.                          |

### 3.12 `percentPie` — the Percentage Pizza (circle)

The circle twin of `percentLab`: a pizza cut into N slices with k shaded, the
same fraction / simplified / percentage / decimal readout, and the same
"fraction of a number" panel.

```json
{
  "type": "percentPie",
  "title": "The Percentage Pizza",
  "parts": 8, "shaded": 4,
  "amount": 40,
  "maxParts": 24
}
```

| Field      | Type   | Notes                                                       |
|------------|--------|-------------------------------------------------------------|
| `parts`    | number | Starting slices (2–`maxParts`). Default 8.                  |
| `shaded`   | number | Starting shaded slices (0–`parts`). Default 4.              |
| `amount`   | number | Starting "of a number" amount. Default 40.                  |
| `maxParts` | number | Max slices the cut slider allows. Default 100.              |
| `showGroups` | boolean | Whether the "group every N slices" lines start shown. Default true. |
| `groupSize`  | number | Starting group size for those lines; the child can edit it live. Default 10. |
| `color`, `interactive`, `tip` | | Same as `slices`.                          |

### 3.13 `percentCompare` — compare two pizzas

Two pizzas side by side so the child can SEE when two different cuts are the
same — e.g. `16/40` and `2/5`. Shows a live **"Same value!"** badge when they
match, and **Add / Subtract** buttons that combine the two. The answer is shown
as a fraction, %, decimal **and as pizza(s)** — two pizzas when it is more than
one whole (e.g. `1.6`), tinted red with a minus sign when it goes below zero. On
phones each pizza's controls collapse behind an **Adjust** button so the screen
shows just the two pizzas and their numbers.

```json
{
  "type": "percentCompare",
  "title": "Compare two pizzas",
  "left":  { "parts": 8, "shaded": 2 },
  "right": { "parts": 4, "shaded": 1 }
}
```

| Field      | Type   | Notes                                                       |
|------------|--------|-------------------------------------------------------------|
| `left` / `right` | object | Starting `{ parts, shaded }` for each pizza.          |
| `leftTitle` / `rightTitle` | string | Heading above each pizza.                   |
| `leftColor` / `rightColor` | string | Fill colour of each pizza.                  |
| `maxParts` | number | Max slices per pizza. Default 100.                          |

### 3.14 Variable widgets ("what's in the box?")

Six parameterised widgets for introducing variables and algebra. All are pure
DOM/SVG and run no code from the JSON.

- **`varBox`** — a named box (`x`) you fill and peek into; set `boxes` > 1 to show
  several identical boxes that share one value (same name = same value).
  Fields: `name`, `value`, `min`, `max`, `boxes`, `open`, `color`.
- **`functionMachine`** — a number goes in, the rule `× multiply + add` transforms
  it, the output comes out, with an in/out table. Set `hideRule: true` for a
  "guess my rule" challenge. Fields: `multiply`, `add`, `input`, `hideRule`.
- **`varExpression`** — shows `coef·x + const` as `coef` boxes (each holding `x`
  objects) plus `const` loose ones; slide `x` to see the total.
  Fields: `name`, `coef`, `const`, `value`, `max`, `color`.
- **`varBalance`** — model `coef·x + add = equals` as a pan balance; slide what's
  in the box until the beam is level. Fields: `name`, `coef`, `add`, `equals`,
  `start`, `max`, `color`.
- **`varCounter`** — a variable that changes over time, `x = start + step·n`, with
  `skin` `"savings"` / `"score"` / `"battery"`. Fields: `name`, `start`, `step`,
  `unit`, `steps`, `max`, `skin`.
- **`varTrick`** — the "think of a number" trick; steps through both the child's
  number and the algebra (`x → 2x → 2x+10 → x+5 → 5`) so they see the `x` cancel.
  Field: `secret`.

```json
{ "type": "functionMachine", "multiply": 3, "add": 1, "input": 4 }
```

> **Interactive media** (`slices`, `grid`, `percentOf`, `percentLab`,
> `percentPie`, `percentCompare`, `volume3d`, `varBox`, `functionMachine`,
> `varExpression`, `varBalance`, `varCounter`, `varTrick`) are safe — they take
> parameters only and never run code from the JSON. They are designed for
> **lessons**: set the starting values so the widget's default state does **not**
> reveal the question's own answer; let the child reach it by playing. These same
> toys also appear on the per-pack playground shown after Start.

---

## 4. Lesson hint (recommended)

A **Lesson** turns the hint button into a full, self-contained mini-lesson
that expands below the question. While it is open the timer is **frozen** and
opening it carries **no score penalty** — it is a pure study tool.

```json
"hint": {
  "format": "lesson",
  "title": "Solving Two-Step Equations",
  "subtitle": "How to free a hidden number step by step.",
  "sections": [ /* one or more Section objects */ ]
}
```

| Field      | Type      | Required | Notes                                          |
|------------|-----------|----------|------------------------------------------------|
| `format`   | string    | yes      | Must be `"lesson"` to use this renderer.       |
| `title`    | string    | yes      | Lesson heading.                                |
| `subtitle` | string    | no       | One line under the title.                      |
| `sections` | Section[] | yes      | The teaching steps, shown top to bottom.       |

### 4.1 Section object

Every field except `heading` is optional. Include only what a section needs;
they render in this order: **heading → body → visual → steps → points → note**.

```json
{
  "heading": "The golden rule: keep the scale balanced",
  "body": [
    "First paragraph of explanation.",
    "Second paragraph."
  ],
  "visual": { "type": "image", "src": "assets/balance-scale.svg" },
  "steps": ["Do this first.", "Then this.", "Finally this."],
  "points": ["A bullet point.", "Another bullet point."],
  "note": "The single most important thing to remember."
}
```

| Field     | Type               | Notes                                                       |
|-----------|--------------------|-------------------------------------------------------------|
| `heading` | string             | Required. Shown with an automatic step number badge.        |
| `body`    | string \| string[] | Explanation. An array renders as separate paragraphs.       |
| `visual`  | Media              | Any Media object from section 3 — its own per-section visual.|
| `steps`   | string[]           | Renders as a numbered list (ordered process).               |
| `points`  | string[]           | Renders as a bullet list (tips, warnings, facts).           |
| `note`    | string             | Renders as a highlighted "Remember" callout.                |

### 4.2 Writing guidance

A lesson is not a definition — it is a tiny, thrilling read that leaves a child
knowing more and *wondering* more. Write like a warm science communicator
talking to one curious explorer.

- **Voice.** Short sentences, one idea at a time. Speak to "you". Swap jargon
  for vivid, concrete pictures. Never talk down — light them up.
- **The arc.** A typical lesson runs 6–8 sections in this rhythm: a curious
  **hook** (an everyday scene, not "Today we learn…"), the **big idea**, a
  **worked example on _different_ numbers**, a **Fun Fact**, a **"where it lives
  in the world"** section, a **"try it yourself"** section of real activities,
  and a closing **pointer back to the question**.
- **Three sections are mandatory:** a Fun Fact, a real-world expansion, and a
  hands-on "try it yourself" — they are what make a lesson sing.
- **Never reveal the question's own answer.** Teach the method or the idea and
  leave the explorer the final, satisfying step. For maths, always demonstrate
  on numbers different from the question's.
- **Every fact must be true** — fun facts included. Verify anything uncertain.
- **Build knowledge across the pack.** Order questions easy → hard, and let a
  later lesson lean on an idea an earlier one taught.
- Give most sections a visual, and mix the types so the lesson stays lively.
- **Make it hands-on.** Give each lesson an interactive change-it-yourself
  widget (`slices`, `grid`, `percentOf`, `percentLab`, `percentPie` or
  `volume3d`) so the child explores by changing values, and a closing **"Now you
  teach it: write it and draw it"** section that asks them to write the idea in
  their own words and draw it.

---

## 5. Legacy hint (still supported)

Older packs use a small hint object. It still works: a one-shot box that
counts as a used hint. New packs should prefer the Lesson format above.

```json
"hint": {
  "title": "Balance move",
  "text": "Undo the minus 12 first, then undo the multiply by 4.",
  "steps": ["Add 12 to both sides.", "You get 4x = 40.", "Divide both sides by 4."]
}
```

A plain string is also accepted: `"hint": "Look at the chart first."`

---

## 6. Minimal example

```json
{
  "quizTitle": "Tiny Demo Pack",
  "questions": [
    {
      "code": "DEMO-01",
      "question": "What is 2 + 2?",
      "options": ["3", "4", "5"],
      "correctAnswer": "4",
      "hint": {
        "format": "lesson",
        "title": "Adding small numbers",
        "sections": [
          {
            "heading": "Count it out",
            "body": "Start at 2, then count up two more: 3, 4.",
            "note": "Addition just means counting on."
          }
        ]
      }
    }
  ]
}
```
