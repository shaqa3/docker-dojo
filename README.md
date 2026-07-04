# 🐳 Docker Dojo

**Learn Docker by doing — in a safe, zero-install browser sandbox.**

Docker Dojo is an interactive, self-contained web app that teaches Docker through hands-on lessons. Learners type **real Docker commands** into a simulated terminal that validates each step and produces faithful-looking output — no Docker daemon, no backend, no cost, no risk. It ships with a live state dashboard, an animated network topology, achievement badges, and a free-play sandbox.

Everything runs from static files. **Open `index.html` and go.**

---

## ✨ Features

- **Simulated Docker engine** — a mini in-browser engine tracks virtual images, containers, networks, and volumes, and renders authentic output for **50+ commands** (see below). Nothing actually runs; it's all safe.
- **21 lessons across 10 modules** (80 validated steps), from `hello-world` to Compose, networking, and goal-based challenges.
- **Interactive in-container shell** — `docker run -it alpine sh` drops you into a working shell with `cd`, `env`, `ps`, `curl`, `ping`, package installs, and working-directory tracking. Containers can reach each other by name.
- **Real shell orchestration** — command chaining (`&&`, `;`), substitution (`$(docker ps -aq)`), and pipes (`| wc -l`, `| grep`, `| xargs …`).
- **Live dashboard** with two views:
  - **State** — stat tiles + container cards (click any card to `inspect`; per-card buttons for logs / stop-start / remove) + network, volume, and image chips.
  - **Topology** — an SVG hub-and-spoke diagram (Docker host → networks → containers) with **animated “traffic” dashes**, packet dots on active links, and **live CPU/MEM bars** on running containers.
- **Achievements** — 10 unlockable badges with toast notifications, persisted locally.
- **Sandbox (free play)** — no lessons, state persists across commands, includes an **editable Dockerfile** whose `build` genuinely parses your `FROM/RUN/COPY/EXPOSE/CMD`.
- **Command cheat-sheet** overlay, **Tab autocompletion**, command **history** (↑/↓), and **progress saved** to `localStorage`.
- **Polished, responsive, dark UI** with a Docker-blue theme; respects `prefers-reduced-motion`.

---

## 🚀 Getting started

No build step, no dependencies.

```bash
# just open it
open index.html          # macOS
# or: xdg-open index.html # Linux  /  start index.html # Windows
```

Or serve it (optional, any static server works):

```bash
python3 -m http.server 8000    # then visit http://localhost:8000
```

> The app uses classic `<script>` tags (no ES modules), so it works directly from `file://` — no server required.

---

## 🧭 How to use it

1. Pick a lesson from the sidebar (or **🧪 Sandbox** for free play).
2. Read the concept, then type the command shown in each step into the terminal on the right.
3. Correct commands are auto-detected — the step turns green and you advance. Wrong ones just print realistic output; nothing breaks.
4. Watch the **Live dashboard** update as you go; switch to **Topology** to see the network graph and live metrics.
5. Use **⌨️ Cheat-sheet** and **🏅** (badges) in the header any time. Progress persists between visits.

Terminal niceties: **Tab** autocompletes, **↑/↓** cycle history, `help` lists supported commands, `clear` clears the screen.

---

## 📚 Curriculum

| # | Module | Lessons |
|---|--------|---------|
| 1 | Docker Fundamentals | Your First Container · Images & the Registry · Run, List, Stop, Remove |
| 2 | Working Inside Containers | Interactive Shells · Exec Into Running Containers · Publishing Ports |
| 3 | Building Your Own Images | Build From a Dockerfile |
| 4 | Inspecting & Debugging | Inspect & Metadata · Live Diagnostics |
| 5 | Data, Volumes & Config | Persist Data with Volumes · Environment Variables |
| 6 | Container Networking | Custom Bridge Networks |
| 7 | Lifecycle & Cleanup | Pause, Restart & Kill · Housekeeping & Prune |
| 8 | Compose & Image Authoring | Multi-Container Apps with Compose · Tag, History & Commit |
| 9 | CLI Power Moves | Filters, Formats & Quiet Mode · Explore & Connect from Inside |
| 10 | Challenges 🎯 | Publish a Gateway · Persistent Database · Clean Slate |

---

## 🗂️ Project structure

```
docker-dojo/
├── index.html          # markup: header, sidebar, lesson panel, terminal, dashboard, overlays
├── css/
│   └── styles.css       # full theme + layout + dashboard/topology/animations
├── js/
│   ├── engine.js        # the simulated Docker engine (state + command output)
│   ├── lessons.js        # course content: modules, lessons, per-step validators
│   └── app.js            # UI controller: terminal, dashboard, topology, badges, progress
├── test.js              # headless validator for all lesson steps (node test.js)
└── README.md
```

Load order in `index.html`: `lessons.js` → `engine.js` → `app.js`. The engine attaches `window.DockerEngine`; lessons attach `window.COURSE`; `app.js` wires the DOM on `DOMContentLoaded`.

---

## 🧩 How it works

### The engine (`js/engine.js`)
A `DockerEngine` instance holds virtual state (`images`, `containers`, `networks`, `volumes`, and a `shellStack` for in-container shells). The app calls **`engine.execLine(raw)`**, which handles substitution/chaining/pipes and dispatches each command to `exec()`. Every command returns an array of `{ text, cls }` output lines that the terminal renders (`cls` maps to colors: `err`, `success`, `dim`, `accent`, …).

### Lessons & validation (`js/lessons.js`)
Each step defines a `check(cmd, engine)` predicate. It can match the typed command **and/or** inspect resulting engine state:

```js
{
  instruction: "Start nginx in the background, named <code>web</code>.",
  cmd: "docker run -d --name web nginx",     // used by the “Insert command” button
  hint: "docker run -d --name web nginx",
  check: (c, e) => /docker\s+run\b/.test(c)
                   && e.findContainer("web")?.status === "running",
}
```

Challenges check **end state only**, so any commands that reach the goal count.

### The UI (`js/app.js`)
Renders the sidebar/lesson panel, drives the terminal, tracks progress + badges in `localStorage`, and re-renders the dashboard after every command. The topology is generated as an inline SVG; a lightweight ticker updates CPU/MEM bar widths in place (so the flow animations aren't disturbed).

---

## 🛠️ Extending it

### Add a lesson
Add an entry to a module's `lessons` array in `js/lessons.js`:

```js
{
  id: "l22",                      // unique
  title: "My New Lesson",
  subtitle: "One-line summary.",
  intro: "HTML supported — use <code>…</code> and <pre class='code'>…</pre>.",
  concepts: [["term", "definition"], ["flag", "what it does"]],
  // optional: setup: (e) => { e.hasDockerfile = [...]; e.hasCompose = [...]; },
  steps: [
    { instruction: "Do the thing.", cmd: "docker …", hint: "docker …",
      check: (c, e) => /regex/.test(c) /* && state assertions */ },
  ],
}
```

`COURSE.flatLessons` and `COURSE.totalSteps` are derived automatically — no other wiring needed.

### Add a command to the engine
1. Add a `case` in `Engine.prototype.docker` (in `js/engine.js`).
2. Implement a method returning `[L("output line"), L("...", "dim")]` (use the `L(text, cls)` helper).
3. Mutate `this.containers` / `this.images` / `this.networks` / `this.volumes` as needed.

### Add an image
Add an entry to the `IMAGES` map in `js/engine.js` (`size`, default `cmd`, `os`, optional `expose`).

### Add a badge
Add an object to the `BADGES` array in `js/app.js`:

```js
{ id: "my-badge", icon: "🎯", label: "Title", desc: "How to earn it",
  test: (cmd) => /pattern/.test(cmd) }
```

---

## ✅ Testing

A headless harness runs every lesson's intended command through the engine and asserts its validator passes:

```bash
node test.js
# → 80/80 step validators passed · 21 lessons · 10 modules
#   OK
```

Syntax-check the sources:

```bash
node --check js/engine.js && node --check js/lessons.js && node --check js/app.js
```

---

## 🔭 Roadmap ideas

- Swap the simulated engine for a WASM shell or real per-user containers (the lesson format wouldn't change).
- Guided Dockerfile lessons using the inline editor (not just Sandbox).
- Shareable progress / completion certificate.
- More modules: multi-stage builds, healthchecks, secrets, registries.

---

## 📝 Notes

- **All simulated.** Output is generated for teaching; it won't reflect a real daemon's exact bytes, and image digests/IDs are random each run.
- **State is local.** Progress and badges live in your browser's `localStorage` (buttons in the header reset them).
- No network requests, no telemetry, no tracking.

Happy shipping. 🐳
