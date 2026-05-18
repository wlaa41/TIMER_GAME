# Pack Format Reference

The exact JSON schema for an AI Edu Quiz Quest question pack. This mirrors the
game's engine (`app.js`) and the project's `QUESTION_FORMAT.md`. If the project
has a newer `QUESTION_FORMAT.md`, that file is authoritative.

## Contents
1. Top level
2. Question object
3. Lesson hint and sections
4. Media types (illustration, chart, image, video, threejs, matterjs)
5. Three.js / Matter.js code templates
6. A minimal valid pack

---

## 1. Top level

```json
{
  "quizTitle": "Pack title shown in the game header",
  "description": "Optional - for your own reference, not shown in-game.",
  "questions": [ /* one or more Question objects */ ]
}
```

## 2. Question object

```json
{
  "id": "q1",
  "code": "MOON-01",
  "question": "The prompt the explorer reads.",
  "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
  "correctAnswer": "Choice C",
  "estimatedSeconds": 90,
  "media": { /* optional - a visual shown WITH the question */ },
  "hint": { /* the lesson - see section 3 */ }
}
```

- `id` / `code` — optional labels; `code` shows as a small badge.
- `options` — 2 to 4 strings.
- `correctAnswer` — must match one `options` entry exactly (case-insensitive).
- `estimatedSeconds` — optional. The suggested time, in seconds, to answer this
  question. The game shows it as a badge, targets the pace meter at it, and
  sums every question's estimate to pre-fill the total play time. Vary it with
  difficulty — an easy recall question might be 60, a multi-step challenge 240+.
- `media` — optional. Omit it if a visual would spoil the answer; put that
  visual inside a lesson section instead.

## 3. Lesson hint and sections

```json
"hint": {
  "format": "lesson",
  "title": "The lesson's title",
  "subtitle": "One inviting line under the title (optional).",
  "sections": [ /* one or more Section objects */ ]
}
```

A **Section** — only `heading` is required; include whatever the section needs.
Fields render in this fixed order: heading → body → visual → steps → points → note.

```json
{
  "heading": "An inviting section title",
  "body": ["First paragraph.", "Second paragraph."],
  "visual": { "type": "image", "src": "assets/moon.jpg" },
  "steps": ["Step one.", "Step two.", "Step three."],
  "points": ["A bullet.", "Another bullet."],
  "note": "One highlighted takeaway sentence."
}
```

- `body` — a string, or an array of strings (one paragraph each).
- `steps` — numbered list (processes, worked examples).
- `points` — bullet list (tips, fun facts, exercises, warnings).
- `note` — a single highlighted callout box.

## 4. Media types

A **media object** is used in a question's `media` and in a section's `visual`.
The `type` field selects the renderer.

### illustration — built-in themed scene, no asset files needed
```json
{ "type": "illustration", "theme": "study", "title": "...", "caption": "...",
  "callouts": ["chip one", "chip two"] }
```
`theme` must be one of: `balance`, `triangle`, `shop`, `reading`, `study`.
Theme-specific text fields: `balance` uses `left` and `right`; `shop` uses
`label`; `reading` uses `word`. `study` is the generic fallback.

### chart — horizontal bar chart
```json
{ "type": "chart", "title": "...", "caption": "...",
  "values": [
    { "label": "Bar name", "value": 100, "prefix": "$", "suffix": "%", "color": "#6366f1" }
  ],
  "teachingPoint": "Optional closing sentence." }
```
`value` is a number; `prefix`, `suffix`, `color` are optional per bar.

### image — a photo or SVG
```json
{ "type": "image", "src": "assets/volcano.jpg", "alt": "A description",
  "caption": "Shown under the image." }
```
`src` is a project path (usually `assets/...`) or a full URL.

### video — a clip
```json
{ "type": "video", "src": "assets/clip.mp4", "caption": "..." }
```
Use `embed` instead of `src` for a YouTube/Vimeo `/embed/` URL. Optional `poster`.

### threejs — interactive 3D scene
```json
{ "type": "threejs", "title": "...", "caption": "Drag to spin it.",
  "payload": { "setup": "<JS string>", "update": "<JS string>" } }
```
`setup` runs once; variables available: `scene`, `camera`, `THREE`.
`update` runs every frame (optional); same variables.

### matterjs — interactive 2D physics
```json
{ "type": "matterjs", "title": "...", "caption": "Drag the shapes.",
  "payload": { "setup": "<JS string>" } }
```
`setup` runs once; variables available: `world`, `Matter`, `width`, `height`.
Outer walls and a floor are added automatically.

## 5. Three.js / Matter.js code templates

Keep scene code short and use these tested patterns. Always give the main object
`name = 'quizShape'` so `update` can find it. Indigo `0x6366f1` matches the
game's theme.

**A spinning sphere (planet, moon, ball, cell):**
```
setup:  "const s = new THREE.Mesh(new THREE.SphereGeometry(1.6, 48, 48), new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.6 })); s.name = 'quizShape'; scene.add(s); camera.position.z = 5;"
update: "const s = scene.getObjectByName('quizShape'); if (s) { s.rotation.y += 0.01; }"
```

**A spinning labelled shape (cube / cone / cylinder / torus):**
```
setup:  "const g = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 32), new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 })); g.name = 'quizShape'; g.add(new THREE.LineSegments(new THREE.EdgesGeometry(g.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }))); scene.add(g); camera.position.z = 5;"
update: "const g = scene.getObjectByName('quizShape'); if (g) { g.rotation.y += 0.012; g.rotation.x += 0.005; }"
```
Swap the geometry: `BoxGeometry(2,2,2)`, `CylinderGeometry(1,1,2,32)`,
`TorusGeometry(1.3,0.45,24,80)`, `SphereGeometry(1.6,48,48)`.

**Falling blocks (gravity, counting):**
```
setup: "const c = ['#6366f1','#818cf8','#4f46e5']; for (let i = 0; i < 5; i++) { Matter.World.add(world, Matter.Bodies.rectangle(width*0.25 + i*70, 40, 46, 46, { restitution: 0.5, render: { fillStyle: c[i % 3] } })); }"
```

**A bouncing ball:**
```
setup: "Matter.World.add(world, Matter.Bodies.circle(width*0.5, 50, 26, { restitution: 0.85, render: { fillStyle: '#6366f1' } }));"
```

Both `setup` and `update` must be **single-line JSON strings** — use single
quotes inside the code, and no line breaks.

## 6. A minimal valid pack

```json
{
  "quizTitle": "Tiny Demo",
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
          { "heading": "Count it out",
            "body": "Start at 2, then count up two more: 3, 4.",
            "note": "Adding just means counting onward." }
        ]
      }
    }
  ]
}
```
