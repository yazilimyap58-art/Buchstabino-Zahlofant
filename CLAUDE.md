# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repository.

## Project

Rechen-Abenteuer — a German-language, kid-friendly PWA math game (counting,
addition, subtraction) for preschool-age children. Zero build step: vanilla
HTML/CSS/JS, no framework, no `package.json`, no bundler.

## Running locally

No dependencies to install. Serve the folder with any static file server:

```bash
python -m http.server 8000
# or
npx http-server
```

Open `http://localhost:8000`. A service worker is registered (`sw.js`), so
hard-refresh (Ctrl+Shift+R) or unregister it in DevTools → Application when
testing changes to cached files.

There is no test suite. Verify changes by running a local server and
clicking through in a real browser (or via the claude-in-chrome tools).

## Architecture

Three files, no build tooling:

- **`index.html`** — two `<section class="screen">` blocks
  (`#screen-mode-select`, `#screen-game`) toggled via the `hidden` attribute;
  `Game.showScreen()` in `app.js` switches between them. Plus a native
  `<dialog>` pause modal and a PWA install banner.
- **`style.css`** — CSS custom properties for theming (`:root`, dark mode via
  `prefers-color-scheme`), `@media (hover: hover) and (pointer: fine)` guards
  around every `:hover` rule (see Gotchas).
- **`app.js`** — ES module. Four plain objects form the whole "architecture":
  - `CONFIG` — static data (modes, motifs).
  - `STATE` — mutable game state, persisted to `localStorage` under key
    `rechenAbenteuer`.
  - `EL` — cached DOM references, queried once at load.
  - `Game` — all game logic/methods.
  - `TTS` — Web Speech API wrapper.
  - `Confetti` — canvas particle effect.

  No classes, no framework. Keep it this way unless the project genuinely
  outgrows it.

### Game modes

Two modes, chosen on the mode-select screen (`CONFIG.modes`):

- **`count`** — shows N of one motif scattered across the stage
  (`.motif-stage--scatter`, absolutely positioned via
  `renderScatteredMotifs()`), asks "Wie viele siehst du?". TTS speaks only
  the short prompt — never enumerates the objects.
- **`arithmetic`** — randomly adds or subtracts per task. Both groups always
  use the *same* motif (mixing motifs was found confusing during testing;
  could become a "difficulty" toggle later, but isn't built now). Rendered
  side by side (`.motif-stage--groups`) with a visible operator symbol
  between them (`renderMotifGroups()`). TTS speaks counts + motif name
  ("6 Äpfel plus 5 Äpfel...", singular/plural via `nameForCount()`), never
  reads a raw emoji string.

### Async coordination pattern

`handleCorrect()` waits for **both** the confetti animation and the TTS
"Richtig!" callout before generating the next task
(`Promise.all([confettiDone, audioDone])`), so the transition doesn't cut
audio/animation short. Both promises are wrapped in `withTimeout()` (top of
`app.js`) as a safety net: `requestAnimationFrame` pauses *entirely* on a
backgrounded tab, and `speechSynthesis` doesn't reliably fire `onend` on all
devices — without a timeout fallback the game could hang indefinitely on
"Richtig!". Reuse `withTimeout(promise, ms)` for any future async effect
that gates progression.

## Conventions

- German UI strings and comments throughout (target audience: German-
  speaking preschoolers/parents). Keep new user-facing text and comments in
  German.
- No TypeScript, no linter config.
- Touch-first: never add a bare `:hover` rule — always wrap it in
  `@media (hover: hover) and (pointer: fine)` (see Gotchas).

## Gotchas / lessons learned on this project

- **Stuck `:hover` on touch devices**: tapping a button on a touchscreen
  leaves it in `:hover` state indefinitely (no `mouseleave` event fires).
  Fixed by scoping every `:hover` rule to
  `@media (hover: hover) and (pointer: fine)`. Never remove that guard.
- **`<dialog>` centering**: use `showModal()` / `close()`, not toggling the
  `open` property directly — the latter keeps the dialog out of the top
  layer and centering becomes unreliable. Dim via `::backdrop`, not a manual
  `rgba` background on the dialog itself.
- **German TTS reads "3." as an ordinal** ("dritter" instead of "drei") when
  a number is immediately followed by a period. Never put a `.` directly
  after an interpolated number in spoken text.
- **`requestAnimationFrame` pauses entirely** when the tab/window loses
  focus (not just throttles). Any promise that resolves via an rAF loop
  (like `Confetti.trigger()`) needs a timeout fallback if game-critical
  logic awaits it.
- **Deployment paths**: `manifest.json`'s `start_url`/`scope` and `sw.js`'s
  `ASSETS_TO_CACHE` use root-relative paths (`/`), because the project is
  deployed at the domain root on Vercel — not under a `/rechen-abenteuer/`
  subpath. If ever deployed under a subpath (e.g. a GitHub Pages project
  site), these need to change back.

## Deployment

Static site, deployed via Vercel connected to the GitHub repo (see
`README.md` for exact steps). No build command / output directory needed —
Vercel serves the repo root as-is. `vercel.json` sets
`Cache-Control: no-cache` on `sw.js` and `manifest.json` so PWA updates
propagate instead of getting stuck behind a stale cached service worker.

## Fixed issues (kept here as history/context)

- `Confetti.resize()` used to call `ctx.scale(devicePixelRatio, ...)` without
  resetting the transform first, so repeated resize events (rotating
  device, resizing window) compounded the scale each time. Now uses
  `ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)`.
- `STATE.isPaused` / `isPlaying` used to get persisted to `localStorage`
  verbatim. If the tab was closed while paused, they were restored as
  `true` on the next load even though the app always boots back to the
  mode-select screen — this silently blocked `generateTask()` /
  `handleOptionClick()` after reload. `loadState()` now force-resets both
  to their session-start defaults after loading.
- Removed dead markup: `<span class="option-number">` in the option
  buttons, `<audio id="audio-number">`, and the unused
  `.install-banner.hidden` CSS rule (JS toggles the native `hidden`
  attribute, not a class).
- Removed `Game.loop()` / `STATE.lastTimestamp` — it was an empty
  `requestAnimationFrame` loop reserved for future time-based effects that
  never did anything. Re-add a loop like it if/when an effect actually
  needs a per-frame update; don't keep an idle one running.
