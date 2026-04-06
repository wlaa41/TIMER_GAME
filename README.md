# TIMER_GAME

An interactive browser-based quiz game with a polished sci-fi interface, animated simulation questions, configurable mission time, hint support, and live score tracking.

This project is designed for quick classroom-style quiz sessions, self-practice, and interactive learning experiences where a standard multiple-choice quiz feels too static. Questions can include plain text prompts or visual simulations powered by Three.js and Matter.js.

## Features

- Upload quiz content from a local JSON file
- Set the total game time manually using any number of minutes
- Play simulation-based questions using:
  - `Three.js` for 3D scenes
  - `Matter.js` for physics scenes
- Rotate and zoom 3D objects with mouse controls
- Keep physics objects inside the visible stage area
- Show a live HUD with:
  - score as `correct / total`
  - help usage count
  - question progress
  - mission timer state
- Reveal a hint with a dedicated help button
- Track how many hints the player used
- Play lightweight built-in right/wrong/timer warning sounds without external audio files
- Display a final results screen with score and help usage

## Demo Flow

1. Open the game in the browser.
2. Upload a quiz JSON file from the [`questions`](./questions) folder.
3. Enter the total number of minutes for the session.
4. Start the mission.
5. Answer questions, use hints when needed, and finish before time runs out.

## Project Structure

```text
TIMER_GAME/
├─ index.html
├─ style.css
├─ app.js
├─ questions/
│  ├─ 1.json
│  └─ percentage_5apr.json
└─ README.md
```

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- [Three.js](https://threejs.org/) for 3D rendering
- [Matter.js](https://brm.io/matter-js/) for 2D physics simulation
- Web Audio API for procedural sound feedback

## How To Run Locally

This is a static frontend project, so no build step is required.

### Option 1: Open Directly

Open [`index.html`](./index.html) in your browser.

### Option 2: Use a Local Server

Using a local server is recommended if you later extend the project with APIs or stricter browser policies.

Examples:

```bash
# Python
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Gameplay Rules

- The player uploads a quiz JSON file.
- The player chooses the total mission duration in minutes.
- Each correct answer increases the score by one.
- The score is displayed as `correct answers / total questions`.
- The help button reveals one hint per question.
- Help usage is tracked and shown in both the live HUD and final screen.
- The game ends when:
  - all questions are answered, or
  - the timer reaches zero

## Quiz JSON Format

Each quiz file should follow this structure:

```json
{
  "quizTitle": "Sample Quiz",
  "questions": [
    {
      "id": "q1",
      "question": "Solve for x: 4x - 12 = 28",
      "options": ["4", "8", "10", "12"],
      "correctAnswer": "10",
      "hint": "Add 12 to both sides first, then divide by 4.",
      "engine": "none",
      "payload": {}
    }
  ]
}
```

### Question Fields

- `id`: unique question identifier
- `question`: text shown to the player
- `options`: array of answer choices
- `correctAnswer`: the correct option value
- `hint`: optional custom hint shown when the help button is pressed
- `engine`: one of:
  - `none`
  - `threejs`
  - `matterjs`
- `payload`: engine-specific data

## Simulation Questions

### `engine: "none"`

Use this for normal text-based multiple-choice questions.

```json
{
  "engine": "none",
  "payload": {}
}
```

### `engine: "threejs"`

Use this for 3D interactive questions.

```json
{
  "engine": "threejs",
  "payload": {
    "setup": "const geo = new THREE.BoxGeometry(2, 2, 2); const mat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, wireframe: true }); window.mesh = new THREE.Mesh(geo, mat); scene.add(window.mesh);",
    "update": "window.mesh.rotation.y += 0.01;"
  }
}
```

### `engine: "matterjs"`

Use this for physics-based questions.

```json
{
  "engine": "matterjs",
  "payload": {
    "setup": "const ball = Matter.Bodies.circle(200, 50, 25, { restitution: 0.9 }); Matter.World.add(world, ball);"
  }
}
```

## Hint System

The game currently supports two hint modes:

1. Custom hint from the quiz JSON via the `hint` field
2. Automatic fallback hint generated from the answer/options if no custom hint exists

Recommended approach:

- Use custom hints in the JSON for best quality
- Keep the fallback system as a backup

## Current UX Improvements

The current version includes:

- upgraded visual styling and responsive layout
- animated background effects
- improved HUD and mission control theme
- manual mission-time input
- clearer answer feedback sounds
- support for hint usage tracking
- 3D mouse controls with orbit interaction
- fixed physics boundaries so objects remain visible

## Suggested Next Improvements

- Add authored hints to all questions in the JSON files
- Add drag interaction for Matter.js objects
- Add pause/resume support
- Add question categories and difficulty levels
- Add persistent high scores
- Add backend hint generation using:
  - OpenRouter
  - Ollama
  - another local or remote model provider
- Add question authoring tools in the UI

## AI Hint Integration Notes

If you later want AI-generated hints:

- safest frontend-only option: keep local JSON hints
- best free local AI option: Ollama
- easiest cloud API option: OpenRouter with a backend proxy

Do not place a private API key directly in the browser frontend.

## Known Notes

- The project currently loads quiz files from local JSON uploads rather than a database.
- Procedural sounds are generated in the browser using Web Audio.
- Simulation setup is driven by executable payload strings in JSON, so quiz content should come from trusted sources.

## Contributing

If you extend the project, recommended priorities are:

- improve question authoring
- add stronger validation for uploaded quiz files
- replace fallback hints with custom hints across all quizzes
- optionally add backend-powered AI hint generation

## License

No license file has been added yet. If you plan to share or reuse this publicly, consider adding an MIT license.
