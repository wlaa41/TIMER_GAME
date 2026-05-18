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
| `media`         | Media    | no       | A visual shown with the question itself.                     |
| `hint`          | Lesson \| Legacy | no | The teaching content behind the hint button.            |

> **Tip:** Keep the question's own `media` free of spoilers. It is shown
> immediately, before the player tries. If a visual would reveal the method or
> answer, leave `media` out and place that visual inside a lesson section
> instead — the lesson only opens when the player presses **Let's Learn**.

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

- A lesson should **teach the idea and walk a parallel worked example**, then
  point the player back at the real question — it should not simply state the
  question's own answer.
- A typical lesson has 5–8 sections: what the question asks, the core idea,
  a worked example, the method, common mistakes, and a closing pointer.
- Mix visual types across sections so the lesson stays lively.

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
