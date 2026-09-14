# Migration Plan — Leon Portfolio

Status: approved (tracked in BB Tasks project `LEON`)
Source of truth for architecture decisions until superseded.

Goal: turn the single-file prototype into a maintainable, fast, deployable
3D-artist portfolio on static hosting.

## Decisions locked (2026-09-14)

- **Assets**: Leon supplies the real deliverables (GLB) later. Development
  proceeds with the existing `AK-74M.fbx` — no conversion work is done locally.
- **Canonical model**: `AK-74M.fbx`. `AK-74M-2.fbx` is a near-duplicate and gets
  deleted.
- **Textures**: none for now. All texture/KTX2 work is deferred (LEON-22).
- **Architecture**: vanilla TS + Vite + Tailwind v4, registry-driven MPA.
  No framework, no SSR, no R3F.

## Task map

| Task | Phase | Status |
|---|---|---|
| LEON-1 | Phase 0 — fix prototype breakage (epic) | todo |
| LEON-6 | scaffold, vite/Tailwind config, scripts, renderer hygiene | todo |
| LEON-7 | page metadata (viewport, title, favicon, OG) | todo |
| LEON-2 | Phase 1 — viewer module & controls (epic) | todo |
| LEON-8 | extract `src/viewer` modules | todo |
| LEON-9 | OrbitControls replace hand-rolled input | todo |
| LEON-10 | PMREM environment, ACES, sRGB | todo |
| LEON-11 | loading/error/no-WebGL states + teardown | todo |
| LEON-3 | Phase 2 — registry-driven pages (epic) | backlog |
| LEON-12 | model registry + types | backlog |
| LEON-13 | gallery / landing page | backlog |
| LEON-14 | per-model page + per-model meta | backlog |
| LEON-4 | Phase 3 — asset pipeline & budget (epic) | backlog |
| LEON-15 | format-agnostic loading (FBX → GLB by data) | backlog |
| LEON-16 | gltf-transform optimization pipeline | backlog |
| LEON-17 | ingest Leon's GLB exports (external dependency) | backlog |
| LEON-18 | static renders / posters | backlog |
| LEON-19 | CI asset budget check | backlog |
| LEON-5 | Phase 4 — Cloudflare deployment (epic) | backlog |
| LEON-20 | Pages project + build config | backlog |
| LEON-21 | `_headers` + custom domain verification | backlog |
| LEON-22 | deferred: KTX2/Draco wiring | backlog |

---

## 0. Second-pass corrections (verified against this repo and host)

These change the earlier recommendation. Evidence included so the plan is
auditable.

| # | First-pass claim | Verified reality | Consequence |
|---|---|---|---|
| 1 | "Convert FBX → GLB as step ①" | `blender`, `assimp`, `FBX2glTF` are **not installed** on this host (`which` → all missing). No npm package converts FBX→glTF. | Conversion is not a script we can write. It is an **asset handoff to Leon** (he has the source files), with a headless-Blender CI path as fallback. |
| 2 | "KTX2/DRACO texture pipeline" | Both FBX files contain **zero** texture/image references (`strings | grep -c tex` → 0; only `Material`). Models are untextured geometry. | Texture tooling is **premature**. Defer. The real visual gap is lighting/material treatment, plus asking Leon for textured sources. |
| 3 | Assumed deps installed | `node_modules/` **does not exist**. `package-lock.json` present, `three@0.178.0` and `tailwindcss@4.1.11` resolved. Registry reachable (`npm ping` → 422ms). | `npm install` is step 0. |
| 4 | "Cloudflare Pages, no caveats" | Pages has a hard **25 MiB per-asset** limit (and 20k files). Confirmed on Cloudflare's Limits page. | Any GLB/HDR above 25 MiB breaks Pages. Budget assets under it or move models to **R2**. Also: Cloudflare's own docs now push new projects toward **Workers Static Assets**; Pages remains supported. |
| 5 | "Mobile fallbacks" (treated as a later nice-to-have) | `index.html` has **no viewport meta tag** and **no touch/pointer handlers**. Mobile users cannot rotate the model and get a mis-scaled desktop layout. | Mobile is **broken today**, not merely unoptimized. This is P0, ahead of the asset pipeline. |
| 6 | Framework: "vanilla, revisit later" | Holds. Portfolio is static content + one canvas island. | Confirmed vanilla. Explicitly **reject** React/R3F/SSR. |
| 7 | Implied Pages = final answer | For a content portfolio, a **multi-page** output beats an SPA router: real per-model URLs, no router dep, per-page caching. | Revised target: registry-driven MPA (see §2). |

Additional real defects found in `index.html`:
- `renderer.setPixelRatio()` is only called in the `resize` handler — initial
  DPR is unclamped (`window.devicePixelRatio` on a phone = 3).
- Title is `portfolio ni leon (prototype)`; no favicon, no OG/Twitter meta.
- `spotLightHelper.update()` runs every frame although the helper is never
  added to the scene.
- FOV-based "zoom" distorts perspective and has no dolly; hand-rolled drag
  lacks inertia, touch, and pointer capture.
- Hardcoded `0.02` scale and per-model rotation apply to every future model.

---

## 1. Target architecture

```
leon-portfolio/
  index.html              # gallery / landing
  models/<slug>/index.html# generated at build from the registry
  public/
    models/*.glb          # optimized, served with immutable cache headers
    renders/*.webp        # static beauty shots: OG images + no-WebGL fallback
  src/
    viewer/
      createViewer.ts     # renderer, camera, controls, resize, DPR clamp, disposal
      lighting.ts         # environment/IBL + light rig presets
      loadModel.ts        # GLTFLoader + loaders, progress, error handling
    data/
      models.ts           # registry — single source of truth
      types.ts
    pages/
      gallery.ts
      model.ts
    styles.css            # @import "tailwindcss"
  vite.config.ts
  _headers                # cache policy (copied to dist root)
  scripts/                # asset check / budget enforcement
```

Design rules:
- One canvas island; page chrome is plain HTML + Tailwind.
- Everything model-specific lives in the registry, never in page code.
- The viewer module owns its own lifecycle (`dispose()`) so navigation does
  not leak GL contexts.
- Registry shape:
  ```ts
  // Format-aware so the dev-FBX → production-GLB swap is a data edit, not code (LEON-15)
  type ModelEntry = {
    slug: string;
    title: string;
    description: string;
    model: string;          // /AK-74M.fbx during dev; /models/<slug>.glb later
    format: 'fbx' | 'glb';  // selects the loader
    poster?: string;        // /renders/<slug>.webp
    scale: number;          // replaces the hardcoded 0.02
    rotation?: [number, number, number];
    cameraPreset?: { position: [number,number,number]; target: [number,number,number]; fov: number };
    tags?: string[];
  };
  ```

## 2. Rendering & UX decisions

- **OrbitControls** replaces hand-rolled drag/wheel. Gives touch, pen, damping,
  inertia, zoom limits, pointer capture. Wheel-zoom → dolly (not FOV), which
  removes the perspective distortion bug.
- **IBL lighting** via `RoomEnvironment` + `PMREMGenerator` (no HDR download,
  ~0 payload) as the v1 default; swap to a real HDR only if a hero shot
  demands it. Keep a small light rig for shadows.
- `renderer.toneMapping = ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`,
  `setPixelRatio(Math.min(devicePixelRatio, 2))` **at init**, shadow map size
  reduced on small/low-power devices.
- Loading: `GLTFLoader` `onProgress` → real progress bar; `LoadingManager` for
  multi-asset. Failed/offline load falls back to the model's poster image.
- No-WebGL / reduced-motion / mobile-low-power: render the poster image with a
  "View in 3D" opt-in. Never a blank canvas.
- **Static renders are a first-class deliverable**, not a fallback: they are
  the OG/Twitter preview, the gallery thumbnail, and the SEO content.

## 3. Asset pipeline

Reality: no local FBX→glTF converter, so the pipeline has two paths.

**Path A (preferred) — handoff to Leon.**
1. Ask Leon for Blender/Maya source + a GLB export (`File → Export → glTF 2.0`,
   `+Y up`, apply modifiers, embed textures).
2. Optimize what arrives with `@gltf-transform/cli` (4.5.0 current):
   ```sh
   npx @gltf-transform/cli optimize in.glb out.glb \
     --compress meshopt --texture-compress webp --texture-size 2048
   ```
   (switch to `--compress draco` only if meshopt proves incompatible; add KTX2
   via `etc1s`/`uastc` once real textures exist.)
3. Commit the optimized GLB to `public/models/`; wire it into the registry.

**Path B (not needed).** A headless-Blender import→export existed as a fallback
if Leon could not export. Confirmed unnecessary: he supplies the files, so no
FBX conversion toolchain is installed or maintained.

**Interim:** until those files land, `AK-74M.fbx` is the development asset and
LEON-15 makes the loader format-agnostic so the swap is a registry edit.

**Deferred:** DRACO/KTX2 transcoder assets, GPU texture compression. Justified
only after textured models exist. (When needed: copy `basis/` and `draco/`
decoders from `three/examples/jsm/libs/` into `public/` and instantiate
`KTX2Loader`/`DRACOLoader` with those paths.)

**Dedup:** decided — `AK-74M.fbx` is canonical, `AK-74M-2.fbx` is deleted as part
of LEON-6.

## 4. Hosting & delivery

- Build: `vite build` → `dist/` (static, no SSR, no server runtime).
- Platform: **Cloudflare Pages** via git integration to start (repo:
  `github.com/RafiSoemarno/portfolio-leon`), noting Cloudflare's current
  guidance steers new projects to Workers Static Assets. Pages is the lower-friction
  start; the config is portable.
- `_headers`:
  ```
  /models/*
    Cache-Control: public, max-age=31536000, immutable
    Access-Control-Allow-Origin: *
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```
  (Vite already content-hashes `/assets/*`; model filenames are stable, so
  rename on change or bust via the registry path.)
- No Worker needed. Contact form, if added, goes to a third-party endpoint or a
  single Pages Function — not a reason to add a backend.
- **Asset budget enforced in CI**: fail the build if any file in `dist/`
  exceeds ~20 MiB (Pages hard limit 25 MiB). Over budget → host models in R2
  and point the registry at the R2 URL.

## 5. Phases

Each phase is independently shippable and reversible.

### Phase 0 — Fix what is broken (no architecture change)
- `npm install`; add `vite.config.js` registering `@tailwindcss/vite` + Tailwind v4
  (`src/styles.css`: `@import "tailwindcss";`).
- TypeScript setup: `typescript` devDependency, `tsconfig.json`, `typecheck` script
  (Vite/esbuild transpiles TS but does not typecheck).
- Add viewport meta, real title, favicon, OG/Twitter tags.
- Clamp DPR at init; remove dead `spotLightHelper.update()`.
- Add `dev`/`build`/`preview` scripts; add `dist` + `node_modules` to `.gitignore`.
- Acceptance: `npx vite build` succeeds; site usable on a phone viewport.

### Phase 1 — Viewer module + controls
- Extract `createViewer` / `loadModel` / lighting from `index.html` into `src/`.
- Replace drag/wheel with `OrbitControls`; dolly zoom; PMREM environment;
  ACES tone mapping; loading indicator + error state; `dispose()` on unmount.
- Acceptance: no per-frame helper updates; smooth touch rotate/pinch;
  context released on navigation (verify via `WEBGL_lose_context`/DevTools).

### Phase 2 — Registry-driven pages
- `models.ts` registry; gallery page; per-model view via
  `/models/<slug>?model=` **or** build-time generated `/models/<slug>/index.html`
  (recommended once >3 models) with per-model meta + poster OG image.
- `robots.txt` + sitemap generated from the registry (SEO plumbing —
  currently unowned; slot into LEON-13).
- Delete hardcoded scale/rotation in favor of registry values.
- Acceptance: adding a model touches exactly one file.

### Phase 3 — Real assets
- Leon handoff → optimized GLB → registry; posters/renders generated and
  committed; drop the unused duplicate FBX; add asset-budget check to CI.
- Acceptance: every model served as GLB; hero model loads < 2 MB; no FBX in `public/`.

### Phase 4 — Deploy
- Cloudflare Pages project, build `npm run build`, output `dist`, `_headers`
  applied, custom domain, verify cache headers and OG previews in a real
  link-unfurl test.
- Acceptance: production URL serves immutable hashed assets; OG card renders.

## 6. Budgets (target)

| Metric | Target |
|---|---|
| Initial JS (excl. lazy three chunk) | < 100 KB gzip |
| three + addons (lazy) | ~170 KB gzip (one-time, cacheable) |
| Hero GLB | < 2 MB |
| Largest dist asset | < 20 MiB (Pages limit 25 MiB) |
| LCP (4G, mid-tier phone) | < 2.5 s |
| Max DPR | 2 |

## 7. Risks / open questions

1. **Timing of Leon's exports** — resolved in principle (he supplies GLB), but
   arrival time is unknown; LEON-17 is the blocked item. Phases 0–2 are
   unaffected and proceed on the existing FBX.
2. **Texture/material quality** — deferred by decision; the portfolio look is
   lighting-driven until real textured assets arrive.
3. ~~Duplicate model~~ — resolved: `AK-74M.fbx` canonical.
4. **Legal/branding** — a real firearm model may be sensitive for some clients/
   hosts; worth an explicit decision on what is showcased.
5. **three version** — lockfile pins `0.178.0`; `^0.178.0` on 0.x allows patches
   only, so no silent minor jumps. Upgrade to 0.186.x is a deliberate, separate
   change (addon API churn).
6. **Pages → Workers** — if Cloudflare deprecates Pages git integration,
   identical `dist/` works on Workers Static Assets; no code change expected.

## 8. Explicitly rejected

- React / React-Three-Fiber / Next.js — abstraction + payload cost for one canvas.
- SSR / server runtime — nothing server-dependent.
- Hand-rolled controls — solved problem, already causing mobile breakage.
- FBX in production — wrong format for web delivery.
- A CMS before the model count justifies one (registry file is the CMS for now).
