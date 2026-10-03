# gawi01.github.io

Personal cybersecurity and software portfolio at [gawi.no](https://gawi.no), built as a 3D arcade you walk into.

Each arcade machine is a section (About, Projects, FPL-AI, Bajazzo, Contact). Click one and the camera flies up to it until its screen fills the window and becomes the page. Back (button, `Esc` or the browser) flies you out again.

The room also has things to play with:

- **Snake** (`#/snake`): a working Snake machine. Arrow keys, WASD, swipe or the on-screen pad. The same game is playable in the 2D site.
- **Hoops** (`#/hoops`): a pop-a-shot basketball machine. Hold to charge, let go in the green, aim with the mouse (or drag sideways on touch, arrow keys on a keyboard). 45 seconds, 2 points a basket, best score is remembered.
- A self-playing claw machine and an air hockey table with a ghost match.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/ (includes CNAME)
npm run preview  # serve the built site
```

## How it fits together

- `index.html` holds all the content as plain HTML sections. That is the light 2D site (used without WebGL, on phones and low-end devices, or via the "2D view" button) and the source the arcade screens are filled from, so text only lives in one place.
- `src/main.js` picks the mode and lazy-loads the 3D app, so the 2D site never downloads Three.js.
- `src/games/snake.js` is the Snake game, shared by both modes.
- `src/arcade/` is the 3D room: Three.js, `postprocessing` for bloom/tone mapping, GSAP for camera flights. Everything (cabinets, neon, screen animations, sound) is generated in code; there are no model or audio files. `hoops.js` has the basketball machine and its small ball physics, `props.js` the claw machine and air hockey table.

URL options: `?mode=2d` / `?mode=3d` force a mode, `?quality=low|medium|high` forces a render tier, `#/fpl-ai` (or any section id) deep-links straight to a machine.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to `main`. In the repository settings, Pages must use **Source: GitHub Actions**.

Work in progress is previewed without touching the live site: `.github/workflows/preview.yml` builds every `claude/**` branch with `BASE_PATH=/gawi-test/` and pushes it to the `gh-pages` branch of the separate `GAWI01/gawi-test` repository. It needs a `PREVIEW_TOKEN` secret (a fine-grained token with Contents read/write on `gawi-test` only); without it, the workflow builds and skips publishing.
