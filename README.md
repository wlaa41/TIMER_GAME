# AI Edu Quiz Quest

A bright browser quiz game for kids with timed rounds, hints, visual question media, 2D physics, and 3D learning scenes.

Live site: <https://aiedu41.netlify.app/>

## Highlights

- Minimal interface with light and dark themes (one-tap toggle, follows the device by default).
- Upload local JSON question packs.
- Load bundled question packs directly on the deployed site.
- Set any mission length in minutes.
- Pause and resume the timer during play.
- Show a per-question pace counter based on `total time / number of questions`.
- Track score as `correct / total`.
- Track how many hints the player used.
- Render rich question media:
  - images or local SVG assets
  - video clips (local files or embeds)
  - bar charts
  - kid-friendly illustrations
  - Three.js 3D scenes
  - Matter.js 2D physics simulations
- Expand a hint into a full multi-section mini-lesson with its own visuals.
- Drag 2D physics objects with the mouse.
- Rotate and zoom 3D scenes with the mouse.

## Project Structure

```text
TIMER_GAME/
├── app.js
├── index.html
├── style.css
├── favicon.svg
├── site.webmanifest
├── README.md
├── QUESTION_FORMAT.md
├── assets/
│   ├── balance-scale.svg
│   ├── reading-window.svg
│   └── shape-gallery.svg
└── questions/
    ├── 1.json
    ├── 2.json
    └── percentage_5apr.json
```

## Run Locally

Open `index.html` directly in a browser for file-upload play, or run a tiny local server to use the bundled pack loader:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Question JSON Format

The full, authoritative pack specification lives in [QUESTION_FORMAT.md](QUESTION_FORMAT.md).

Each question can include a code, hint, answer options, and optional media. The
`hint` can be a small legacy hint (below) or a full multi-section **mini-lesson**
with its own per-section visuals — see the Lesson section of QUESTION_FORMAT.md.

```json
{
  "id": "q1",
  "code": "ALG-01",
  "question": "Solve for x: 4x - 12 = 28",
  "options": ["4", "8", "10", "12"],
  "correctAnswer": "10",
  "hint": {
    "title": "Balance move",
    "text": "Undo the minus 12 first, then undo the multiply by 4.",
    "steps": ["Add 12 to both sides.", "You get 4x = 40.", "Divide both sides by 4."]
  },
  "media": {
    "type": "illustration",
    "theme": "balance",
    "title": "Keep the equation balanced",
    "caption": "Whatever you do to one side of the equation, do to the other side too."
  }
}
```

## Media Types

### Image

```json
{
  "type": "image",
  "src": "assets/reading-window.svg",
  "alt": "A child reading near a window",
  "caption": "Peered means looked carefully."
}
```

### Chart

```json
{
  "type": "chart",
  "title": "Original price and discount",
  "values": [
    { "label": "Original", "value": 120, "prefix": "$" },
    { "label": "Discount", "value": 30, "prefix": "$" },
    { "label": "Final", "value": 90, "prefix": "$" }
  ]
}
```

### Illustration

Supported themes include `balance`, `triangle`, `shop`, `reading`, and `study`.

```json
{
  "type": "illustration",
  "theme": "triangle",
  "title": "Triangle area model",
  "caption": "The area is half of base x height.",
  "callouts": ["base 10 cm", "height 8 cm"]
}
```

### Three.js

```json
{
  "type": "threejs",
  "payload": {
    "setup": "const geo = new THREE.BoxGeometry(2, 2, 2); const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3772ff })); mesh.name = 'shape'; scene.add(mesh);",
    "update": "const shape = scene.getObjectByName('shape'); if (shape) shape.rotation.y += 0.01;"
  }
}
```

### Matter.js

```json
{
  "type": "matterjs",
  "payload": {
    "setup": "const ball = Matter.Bodies.circle(width * 0.5, 50, 28, { restitution: 0.8 }); Matter.World.add(world, ball);"
  }
}
```

### Video

```json
{
  "type": "video",
  "src": "assets/two-step-equations.mp4",
  "caption": "A short walkthrough."
}
```

Use `embed` instead of `src` for a YouTube/Vimeo embed URL.

## Notes

- JSON simulation payloads execute JavaScript. Only load trusted question packs.
- The app works as a static Netlify site.
- AI-generated hints should use a backend or Netlify Function so API keys are not exposed in the browser.
