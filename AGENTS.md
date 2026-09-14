# AGENTS.md

Portfolio site for a 3D artist (Leon) showcasing 3D models. Currently a prototype: a single Three.js scene with an FBX viewer.

## Run

- Dev server: `npx vite` (no `dev` script in package.json; Vite 7 is a devDependency).
- Root `index.html` is the only page; all app code is inline in its `<script type="module">`. No `src/`, no framework, no build config file.

## Key facts

- FBX models live in `public/` and are loaded by URL from the web root (e.g. `/AK-74M.fbx`). Vite serves `public/` at `/` — loader paths must not include `public/`.
- `AK-74M-2.fbx` exists in `public/` but is unused.
- Tailwind v4 (`tailwindcss` + `@tailwindcss/vite`) is installed but **not wired up**: there is no `vite.config.js`, so the Tailwind plugin is not registered. Add a Vite config before using Tailwind classes.
- Model is scaled down hard (`0.02`) after load — FBX units differ from scene units; keep this when swapping models.
- Wheel = FOV zoom, drag = rotate model. `sphere` and `spotLightHelper` are commented out, kept intentionally.
- No tests, no lint, no CI. `.gitignore` only covers `node_modules`.
