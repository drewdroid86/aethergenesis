# AetherGenesis — Deep Architecture Audit
**Date:** 2026-07-29
**Method:** Full source read of `aethergenesis-main` snapshot (no `.git` history in this export — findings verified against actual file content, not commit messages or prior claims). Cross-checked against the previous AI-generated "Production Architecture Review" docx and against prior tracked open items.
**Role reminder:** Claude = architect/reviewer. agy = executor. One concern per branch, 3–5 files per prompt, typecheck + build must pass before commit. Report back actual diffs, not summaries.

---

## Priority 0 — Likely root cause of the shader uniform overflow

### Finding
`getNumStarsForTier()` (`src/utils/performance.ts:25-33`) spawns **100–600 simultaneous `HeroStarSystem` instances** depending on tier (low=100, medium=200, high=400, ultra=600). Every `HeroStarSystem` constructs its own `THREE.PointLight` unconditionally (`HeroStarSystem.ts:136-137`) and adds it directly to the scene graph. The light stays `visible` whenever `globalFade > 0.01` — true for essentially any star in main sequence.

Meanwhile, `MeshStandardMaterial` (Three's built-in PBR material, used in `AsteroidBeltSystem.ts`, `RedGiantPhase.ts`, `MainSequencePhase.ts`) compiles a fragment shader with light-uniform arrays sized to every simultaneously active light Three's renderer collects for that frame. 100–600 real-time point lights is roughly an order of magnitude past what any forward-lit PBR shader budgets for. This is almost certainly what's blowing `MAX_FRAGMENT_UNIFORM_VECTORS(1024)` — not the RemnantPhase/lensing work it was previously suspected of.

Light disposal itself is fine (`HeroStarSystem.dispose()` correctly `remove()`s the light) — this is not a leak, it's a design mismatch between "hundreds of dynamic lights" and Three's forward-lighting model.

**Confidence:** high on the mechanism (the light count alone makes this close to inevitable); not yet runtime-confirmed with an actual live light count at the point of failure.

### Suggested fix direction
Two options, in order of how well they fit the existing architecture:
1. Migrate `AsteroidBeltSystem`, `RedGiantPhase`, and `MainSequencePhase` surface materials to custom `ShaderMaterial`s that fake their own lighting in GLSL — same pattern RemnantPhase already uses. This sidesteps Three's automatic per-light uniform expansion entirely and is consistent with how the rest of the stellar-phase rendering already works.
2. Cap simultaneously *lit* stars to a small budget (nearest-N or brightest-N to camera; something in the 8–16 range), force all others' `starLight.visible = false` regardless of fade state, and let distant/unfocused stars render emissive-only.

### Agy prompt
```
Before making changes: add a temporary console.log in engine.ts's render loop
that counts scene.children recursively for THREE.PointLight instances with
visible === true, logged once every 120 frames. Run the dev server at 'high'
tier, let 30+ stars reach main sequence, and report the actual peak
simultaneous visible-light count plus whether the FRAGMENT shader uniform
error reproduces at that count. Do not implement a fix yet — just confirm or
refute the light-count theory with real numbers, then report back.
```
Once confirmed, follow up with a scoped fix prompt for whichever direction we pick.

---

## Priority 1 — Diagnostic instrumentation left live in production

### Finding
`engine.ts`'s constructor unconditionally monkey-patches two global prototypes:
- `THREE.Material.prototype.onBeforeCompile`
- `WebGLRenderingContext.prototype.compileShader`

The guard is `if (typeof window !== 'undefined')` — an SSR-safety check, not a dev/prod gate. It's true in every browser. This is left over from the stutter investigation (the "webgl compile interceptor" that helped rule out shader-cache-key and tier-oscillation theories). It now:
- Runs a `console.error` with a full stack trace for any shader that compiles more than 5 seconds after boot — which will include entirely legitimate lazy compiles (first star reaching RemnantPhase, first new PlanetarySystem material) and will read as "🚨 LEAK DETECTED" false positives in every real user's console.
- Adds function-call overhead to `compileShader`, which is a hot path.
- If `Engine` is ever constructed more than once in a session (remount, HMR, a "reset simulation" feature), each construction re-wraps the already-wrapped prototype method — compounding overhead and duplicate logging with no way to unwind it.

### Agy prompt
```
In src/core/engine.ts, find the WebGL shader-compile interceptor and the
THREE.Material.prototype.onBeforeCompile monkey-patch in the Engine
constructor (guarded by `typeof window !== 'undefined'`). This was temporary
diagnostic instrumentation from a stutter investigation and was never
removed. Delete both blocks entirely. Keep any unrelated code in the same
region (e.g. renderer/scene setup) untouched. Confirm typecheck and build
pass, then confirm in a manual dev-server run that no "WEBGL INTERCEPTOR" or
"LEAK DETECTED" console output appears.
```

---

## Priority 1 — Two deployment targets, one config, likely conflict

### Finding
- `.github/workflows/deploy.yml` deploys to **GitHub Pages** on every push to `main` — which needs `base: '/aethergenesis/'` (subpath: `username.github.io/aethergenesis/`).
- `render.yaml` + `server.ts`'s `app.use(express.static(distPath))` (server.ts:~1030) serve from **Render at domain root** — which needs `base: '/'`.
- `vite.config.ts:8` hardcodes `base: '/aethergenesis/'`.

Both workflows run the identical `npm run build` against this one hardcoded value. Whichever target isn't `/aethergenesis/`-shaped is likely serving a broken asset tree right now (every JS/CSS URL in the emitted `index.html` would 404 against Express's root-mounted static server). Given aethergenesis.onrender.com is the one confirmed live, GitHub Pages is the more likely casualty — but this is worth a direct check rather than an assumption.

### Agy prompt
```
Check whether the GitHub Pages deployment (via .github/workflows/deploy.yml)
is currently serving a working site or a broken one (404s on JS/CSS assets
due to the /aethergenesis/ base path). Report findings first.

Then: if Render is the only deployment target we actually care about, delete
deploy.yml and change vite.config.ts's base to '/'. If both targets are
wanted, make vite.config.ts read `base: process.env.VITE_BASE_PATH || '/'`
and set VITE_BASE_PATH=/aethergenesis/ only in the GitHub Pages workflow env,
leaving Render's build using the default '/'.
```

---

## Priority 2 — E2E tests exist but nothing runs them

### Finding
Four real test files exist (`scripts/e2e/f1_presets.test.ts`, `f2_ui_modes.test.ts`, `f3_galaxy.test.ts`, `f4_comet.test.ts`, using Node's built-in `node:test` + `ws`), plus a `scripts/run-e2e-tests.ts` runner. But:
- `package.json` has no `test` script.
- `.github/workflows/ci.yml` runs `npm audit`, `npm run lint`, `npm run build` — no test step at all.

The "49 tests passed" from past sessions was a manual local run. There is currently no regression net — a future change can silently break any of this coverage and CI will stay green.

### Agy prompt
```
Add a "test": "node node_modules/tsx/dist/cli.mjs scripts/run-e2e-tests.ts"
script to package.json (check run-e2e-tests.ts first to confirm the correct
invocation and any required env vars like WS_TOKEN/PORT). Add a test step to
.github/workflows/ci.yml after the build step (the e2e tests need a running
server — check if run-e2e-tests.ts starts one itself, or if the workflow
needs to start server.ts in the background first with a wait-for-port step).
Run it locally, report actual pass/fail counts, and don't mark this done
until CI is green on a real PR run.
```

---

## Priority 2 — B20: hit-sphere radius is fixed, not dynamic

### Finding
`geometries.ts:53`: `hit: new THREE.SphereGeometry(8, 16, 16)` — a single shared, fixed-radius geometry used for hit-testing on every star regardless of actual visual size. No per-instance scaling anywhere (`hitMesh.scale` is never set). A remnant and a red giant get identical click targets.

### Agy prompt
```
In HeroStarSystem.ts, scale hitMesh to roughly match the star's current
visual radius per phase (main sequence radius, red giant radius, remnant
radius are all already computed elsewhere for rendering — reuse those
values rather than recomputing). Keep a sane minimum so tiny remnants stay
clickable. Verify selection still works at each phase in a manual pass.
```

---

## Priority 3 — Untyped seam between subsystems

### Finding
`SimulationCoordinator.ts` — the file that bridges stellar/orbital/astrobiology state every frame — types its core state as `stellar: any; orbital: any[]; astrobiology: any[]` (lines 7-9), with more `any` at the actual data-assembly points (lines 83-84, 148-149). This is exactly the seam where B9 (unify stellar phase models) needs to happen, and it's the one place currently opted out of the type system — precisely where a cross-subsystem bug like B3/B4 likes to hide.

### Agy prompt
```
Define a proper SimulationFrameState interface (or similarly named type) in
src/simulation/ covering the actual shape of stellar/orbital/astrobiology
data currently passed through SimulationCoordinator.ts. Replace the `any`
usages there with it. Don't touch behavior — this is a typing-only pass.
Typecheck must pass with no new `any` introduced elsewhere to route around
the new type.
```

---

## Priority 3 — Quick win: RemnantPhase typing

### Finding
`RemnantPhase.ts` casts `this.beamMat as any` five separate times (lines 98, 100, 101, 266-267, 300-301) just to reach `.uniforms`, because `beamMat` isn't declared as `THREE.ShaderMaterial`.

### Agy prompt
```
In RemnantPhase.ts, type beamMat as THREE.ShaderMaterial at its declaration.
Remove all five `as any` casts that exist solely to access .uniforms on it.
Typecheck must pass.
```

---

## Needs live repro, not a code fix yet

**"Dead corona mesh"** — I could not confirm this from static reading. `MainSequencePhase` has two corona layers: a base additive `MeshBasicMaterial` mesh (`coronaMesh`) and a separate shader-based atmospheric layer (`_coronaMesh`/`_coronaMat`). Both are assigned, both updated per-frame, both disposed correctly in `dispose()`. If there's a real dead/orphaned mesh, it's more likely showing up at a phase-transition moment rather than at disposal — would need a live repro (screenshot or console state) to pin down further.

---

## Verified resolved — remove from the open-items list

These were tracked as open but are actually implemented and working:

| Item | Evidence |
|---|---|
| Blackbody star colors | `colorTempToRGB(kelvin)` in `physics/math.ts:20`, driving star + flare color from actual Kelvin temp in `MainSequencePhase.ts:214,216` |
| Star granulation/sunspots | `starSurface.frag.glsl` — real fbm noise granulation + a sunspot mask darkening low-density cells |
| Twinkling background stars | `engine.ts` background star shaders — `vTwinkle` sine-phase modulation, desynced per-star via `aPhase` |
| Parenting artifacts to active star | `PlanetarySystem.ts:191` — `this.parent = star` |
| B5 (duplicate WS payload) | `SimStateSocket.ts` — one clean `JSON.stringify` per payload type, no duplication found |

---

## Big picture

The codebase is straddling two different rendering philosophies at once: custom GLSL faking its own lighting (RemnantPhase, the stellar surface shaders) versus standard Three.js PBR materials that lean on the engine's built-in light collection (asteroid belts, red giant/main-sequence surfaces). The P0 finding above is a direct symptom of that split — the "many simultaneous hero stars as real dynamic lights" design only works under the custom-shader philosophy, and breaks the moment it touches a `MeshStandardMaterial`. Picking one approach for anything star-count-scaled (not per-object) would remove this whole class of bug permanently rather than just patching this one instance.

Same underlying pattern shows up in the typing debt: the churn-hotspot files (`SimulationCoordinator.ts`, `useSimulation.ts`, `engine.ts`) are exactly the files still carrying `any` at their seams. That's not a coincidence — high-churn files accumulate typing shortcuts fastest, and those shortcuts are what let bugs like B3/B4 hide until an audit catches them by hand. A typed `SimulationFrameState` (P3 above) is worth doing before further B9 work, not after — it'll make the next audit's job smaller.

The deployment and CI gaps (P1/P2 above) are lower drama but higher real-world risk than they look: a broken GH Pages deploy or an untested regression can sit silently for weeks with green CI the whole time.
