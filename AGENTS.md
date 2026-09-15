# AGENTS.md

Portfolio site for a 3D artist (Leon) showcasing 3D models. Currently a prototype: one Three.js canvas island with an FBX viewer, being migrated per `MIGRATION-PLAN.md`.

## Run

- Dev server: `npx vite` (also `npm run dev`). Scripts: `dev`, `build`, `preview`, `typecheck`.
- `index.html` is the only page and contains no scene code; it loads `/src/main.ts`, the thin page entry that wires `src/viewer/*` together.
- `npm run typecheck` (`tsc --noEmit`) is separate from the build — Vite transpiles TS without typechecking it.

## Structure

- `src/viewer/createViewer.ts` — scene, perspective camera, renderer (DPR clamped to 2 at init), ground plane, resize handling, rAF loop, `OrbitControls`. `createViewer(container?)` returns `{ scene, camera, renderer, controls, dispose }`; callers set `controls.target` to the model position. Orbit radius is clamped to `[MIN_DISTANCE, MAX_DISTANCE]` (0.35–15) and `controls.update()` runs each frame (damping).
- `src/viewer/lighting.ts` — spotlight (shadow-casting, 2048 map) + ambient fill. `setupLighting(scene)` returns `{ spotlight, ambient, dispose }`.
- `src/viewer/loadModel.ts` — FBX loader construction, transforms, shadow flags, progress/error callbacks. `loadModel(parent, options)` returns `{ ready: Promise<LoadedModel | null>, dispose }`; a disposed load is cancelled and its object released.
- Every module owns its own teardown: no module-level three.js state, `dispose()` is idempotent and releases geometry/material/texture/shadow resources. `src/main.ts` calls them on `beforeunload` until LEON-11 adds mount/unmount hooks.

## Key facts

- FBX models live in `public/` and are loaded by URL from the web root (e.g. `/AK-74M.fbx`). Vite serves `public/` at `/` — loader paths must not include `public/`.
- `AK-74M.fbx` is the canonical development asset (`AK-74M-2.fbx` was deleted in LEON-6).
- Tailwind v4 (`tailwindcss` + `@tailwindcss/vite`) is registered in `vite.config.js`; `src/styles.css` does `@import "tailwindcss";`.
- Model transforms are hardcoded in `src/main.ts` — scale `0.02` (FBX units differ from scene units), position and rotation. The registry (LEON-12/LEON-15) replaces these with per-model values; keep the 0.02 default when swapping models meanwhile.
- Input is `OrbitControls` (LEON-9): mouse + touch + pen, damping, pointer capture, wheel = dolly (never FOV zoom), touch `TWO` = `DOLLY_ROTATE` so pinch stays centred. Lighting semantics are still the prototype's: no image-based lighting/tone mapping until PMREM + ACES in LEON-10.
- `OrbitControls.dispose()` is called from `Viewer.dispose()`; it removes its canvas/document listeners, releases pointer capture and restores `touchAction`.
- No tests, no lint, no CI. `.gitignore` covers `node_modules` and `dist`.
