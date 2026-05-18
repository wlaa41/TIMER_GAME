# Example: a gold-standard question and lesson

This is one complete question, written to the quality bar this skill aims for.
Read it to calibrate **tone, depth, and rhythm** — then write in that spirit, not
by copying it. Notice: a curious hook, one idea per section, a true fun fact, the
topic stretched out into the real world, real activities, and a closing nudge
that guides without giving the answer away.

## The JSON

```json
{
  "id": "q1",
  "code": "MOON-01",
  "question": "About how long does the Moon take to cycle through all its phases — from one full Moon to the next?",
  "options": ["About 1 day", "About 1 week", "About 1 month", "About 1 year"],
  "correctAnswer": "About 1 month",
  "hint": {
    "format": "lesson",
    "title": "The Moon's Monthly Journey",
    "subtitle": "Why the Moon seems to change shape — and what is really going on up there.",
    "sections": [
      {
        "heading": "Have you noticed the Moon changing?",
        "body": [
          "Look up at the Moon on two different nights and something strange seems to happen. One night it is a bright round coin. A week later it is a thin silver smile.",
          "The Moon looks like it is playing a slow game of hide-and-seek with us. Let's find out what is really going on up there."
        ]
      },
      {
        "heading": "The big secret: the Moon never changes shape",
        "body": [
          "Here is the secret. The Moon is always a full ball of rock — it never actually changes shape at all.",
          "The Sun lights up one half of the Moon, just like it lights up one half of the Earth. As the Moon travels its slow lap around us, we simply get to see different amounts of that bright, sunlit half. That is what a 'phase' is."
        ],
        "visual": {
          "type": "threejs",
          "title": "The Moon, lit from one side",
          "caption": "Drag to spin it. The Sun only ever lights up one half.",
          "payload": {
            "setup": "const m = new THREE.Mesh(new THREE.SphereGeometry(1.7, 48, 48), new THREE.MeshStandardMaterial({ color: 0xc7cad1, roughness: 0.95, metalness: 0.0 })); m.name = 'quizShape'; scene.add(m); camera.position.z = 5;",
            "update": "const m = scene.getObjectByName('quizShape'); if (m) { m.rotation.y += 0.006; }"
          }
        }
      },
      {
        "heading": "Follow the Moon through one cycle",
        "body": "Watch how the bright part grows and then shrinks again, step by step.",
        "steps": [
          "New Moon: the lit side faces away from us, so the Moon looks almost invisible.",
          "A few days later a thin crescent appears — a sliver of the bright side peeks around the edge.",
          "After about a week we see exactly half of it lit: the first quarter.",
          "Around two weeks in, the whole sunlit side faces us — a full Moon.",
          "Then it shrinks back: half, crescent, and finally new again."
        ],
        "visual": {
          "type": "chart",
          "title": "How much of the Moon we see lit",
          "caption": "The bright part grows to full, then shrinks back to nothing.",
          "values": [
            { "label": "New Moon", "value": 0, "suffix": "%", "color": "#4f46e5" },
            { "label": "Crescent", "value": 25, "suffix": "%", "color": "#6366f1" },
            { "label": "Half Moon", "value": 50, "suffix": "%", "color": "#818cf8" },
            { "label": "Gibbous", "value": 75, "suffix": "%", "color": "#6366f1" },
            { "label": "Full Moon", "value": 100, "suffix": "%", "color": "#4f46e5" }
          ],
          "teachingPoint": "One full trip — new Moon all the way back to new Moon — is a whole cycle."
        }
      },
      {
        "heading": "Fun fact: the Moon has a hidden face",
        "body": "Wave at the Moon tonight, and you are seeing the exact same craters Galileo saw 400 years ago — and the very same ones the dinosaurs saw. The Moon turns at just the right speed to keep one face pointed at Earth forever. The other side, the 'far side', was a complete mystery to everyone who ever lived, until a spacecraft finally flew around and photographed it in 1959.",
        "note": "Nobody on Earth had ever seen the far side of the Moon until a space probe sent back the first pictures."
      },
      {
        "heading": "Where the Moon shows up in your life",
        "body": "The Moon is far more than a night-light. Its gravity reaches all the way down and gently tugs on Earth's oceans — and that tug is what gives us tides, the sea creeping up and down the beach twice every day.",
        "points": [
          "The word 'month' comes straight from the word 'Moon' — a month was first measured as one Moon cycle.",
          "Sea turtles and corals time the laying of their eggs to the phase of the Moon.",
          "Many calendars around the world are still built around the Moon's steady rhythm."
        ]
      },
      {
        "heading": "Try it yourself: become a Moon watcher",
        "body": "The best way to understand the Moon is to watch it — exactly the way explorers have for thousands of years.",
        "points": [
          "Start a Moon journal. On each clear night for two weeks, draw the Moon's shape and write the date.",
          "Look for the pattern: is your Moon growing fuller (waxing) or shrinking (waning)?",
          "In a dark room, shine a torch on a tennis ball and slowly carry the ball around your head — watch your very own phases appear.",
          "Hunt for the Moon in the daytime. It is often up while the Sun is still shining."
        ]
      },
      {
        "heading": "A common mix-up to avoid",
        "points": [
          "The Moon's phases are NOT caused by Earth's shadow falling on it. That rare event is a lunar eclipse — a different thing entirely.",
          "The Moon does not rise at the same time each night — it comes up about 50 minutes later each day.",
          "The Moon is not tiny: it is about a quarter as wide as the whole Earth."
        ]
      },
      {
        "heading": "Back to your question",
        "body": "You are asked how long the Moon takes to travel through all of its phases — from one full Moon to the next.",
        "note": "Think back to your Moon journal: a half Moon shows up after about a week. A full cycle takes quite a bit longer than that — picture how far the Moon must travel all the way around the Earth and back."
      }
    ]
  }
}
```

## Why this works

- **The hook** opens with the explorer's own experience, not a definition.
- **One idea per section** — shape, then the cycle, then a fact, then the world.
- **The visual earns its place** — the 3D Moon shows the lit/dark halves; the
  chart shows the cycle climbing and falling.
- **The fun fact is true and genuinely surprising** — and it is its own section,
  with the punchiest line saved for the `note`.
- **The expansion section** stretches the topic into tides, language, animals,
  and calendars — the world looks different afterwards.
- **The exercises are real** — doable tonight, with a tennis ball and a torch.
- **The closing `note` guides without revealing** — it rules out "a day" and "a
  week" by reasoning, but never says "a month."
