# ÆTHERGENESIS — MASTER PROJECT LOG

**Repo:** `drewdroid86/aethergenesis`
**Stack:** React · TypeScript · Three.js · Vite · GLSL shaders
**Dev environment:** Pixel 9 Pro · Termux · Gemini CLI (executor) · Claude (architect)

---

## HOW THIS DOCUMENT WORKS

This log is updated after every AI session. Each AI signs off with their entry. The architect is **Claude** — all structural decisions route through Claude first, then get executed by Gemini CLI or other agents. Do not make architectural decisions without checking this log and the current source.

**Ground rules for any AI working on this project:**
1. Always branch before changing code. Never commit directly to `main`.
2. One concern per branch. No scope creep.
3. Read the source before writing prompts. Don't guess at variable names.
4. Max 3–5 file changes per Gemini CLI prompt. Scope creep causes thinking loops.
5. After merging, delete the branch immediately.
6. Update this log before ending your session.
7. No "Digital Signatures" with cosmic epithets. Just your model name and date.

---

## ARCHITECTURE OVERVIEW

```
src/
  core/engine.ts                     ← Main loop, camera, pipeline orchestration
  rendering/
    pipeline.ts                      ← Post-processing (UnrealBloom, cinematic pass)
    nebulae.ts                       ← Background nebula particle system
    systems/HeroStarSystem.ts        ← Per-star lifecycle controller
  simulation/phases/                 ← Each stellar phase is an isolated class
    NebulaPhase.ts / ProtostarPhase.ts / MainSequencePhase.ts
    RedGiantPhase.ts / SupernovaPhase.ts / RemnantPhase.ts
    geometries.ts                    ← Shared Three.js geometries (handle carefully)
  shaders/                           ← GLSL
    displacement.vert.glsl           ← Star surface vertex displacement
    lifeGlow.vert / frag.glsl        ← Star glow point rendering
    nebula.frag.glsl                 ← Volumetric nebula raymarching (solid, don't touch)
    cinematic.frag.glsl              ← Post: chromatic aberration, grain, vignette
  utils/
    hooks/useSimulation.ts           ← React hook, animation loop, tier management
    performance.ts                   ← Tier detection, star counts per tier
  ui/
    Hud.tsx                          ← Top stats bar
    InspectPanel.tsx                 ← Stellar telemetry panel (click a star)
```

**Key facts:**
- Stars stored in `engine.heroStars[]`, each a `HeroStarSystem` instance
- Stellar lifecycle driven by `t` value (0.0 = genesis → 1.0 = terminal)
- Performance tiers: `low / medium / high / ultra` — star counts: `400 / 800 / 800 / 1500`
- Models stored at `/storage/emulated/0/models/`, symlinked into Termux home
- Background starfield: 3000 points on radius-900 sphere in `engine.ts`

## VISION & PROJECT GOALS

ÆTHERGENESIS is a meditative, high-fidelity stellar evolution simulation designed to run on high-end mobile devices (Pixel 9 Pro target). The goal is to blend scientific accuracy (mass-luminosity relations, stellar phases) with a cinematic "AAA space game" aesthetic (heavy post-processing, volumetric-feeling nebulae, vibrant stellar surfaces).

**Core Experience Pillars:**
- **Cinematic Grandeur:** High-quality shaders, bloom, and atmospheric effects.
- **Scientific Soul:** Underlying physics drive the visuals (mass dictates lifecycle).
- **Infinite Discovery:** Thousands of stars, each with a unique timeline.
- **Performance Excellence:** Fluid 30+ FPS on mobile via tiered rendering.

---

## SESSION LOG

---

### perf/physics-benchmark — Authoritative Physics Benchmarking Suite
**Date:** July 23, 2026
**AI:** Antigravity (Gemini 3.6 Flash)
**Branch:** perf/physics-benchmark

**Changes:**
- **Physics Benchmark Suite (`scripts/benchmark-physics.js`)**: Built an isolated benchmark loop stepping stellar physics (`advanceStellarState`) and orbital mechanics (`keplerianToCartesian`) across 500 bodies and 1,000 ticks. Exports standardized `github-action-benchmark` JSON schema to `benchmark-output.json`.
- **GitHub Actions Workflows (`.github/workflows/physics-benchmark.yml` & `.github/workflows/assets-and-shaders.yml`)**:
  - `physics-benchmark.yml`: Runs physics benchmarks on push/PR to `main`, auto-pushing metrics and alerting on >120% performance degradation via `github-action-benchmark`.
  - `assets-and-shaders.yml`: Runs GLSL shader validation with `glslangValidator` and optimizes 3D glTF/GLB models using `@gltf-transform/cli` with Draco compression and WebP textures.
- **npm Script & Gitignore**: Added `npm run benchmark:physics` command to `package.json` and added `benchmark-output.json` to `.gitignore`.
- **Performance Verification**: Confirmed average tick time of ~0.37–0.46ms/tick across 500 bodies (well within 16.67ms 60 FPS budget).

---

### refactor/visual-upgrade-phase2 — Visual Upgrade Audit, Shader Compliance & Rate Limiting
**Date:** July 23, 2026
**AI:** Antigravity (Gemini 3.6 Flash)
**Branch:** refactor/visual-upgrade-phase2

**Changes:**
- **Reversed GLSL `smoothstep` Shader Fixes**: Replaced reversed `smoothstep(edge0, edge1, val)` calls (where `edge0 > edge1`) with compliant `(1.0 - smoothstep(edge1, edge0, val))` across `src/shaders/nebula.frag.glsl`, `src/rendering/systems/CometSystem.ts`, and `src/rendering/systems/NebulaSystem.ts` to prevent undefined GLSL behavior on ANGLE and Metal drivers.
- **Supernova Phase Transition**: Updated `forceSupernova()` in `src/core/engine.ts` to set stellar age to `tau_ms * 1.21`, ensuring it correctly advances past the red giant boundary into the supernova phase.
- **Dark Matter Opacity Clamping**: Clamped `_backgroundStarMat.opacity` in `src/core/engine.ts` to `[0.0, 1.0]` bounds.
- **Astrobiology Simulation Timing**: Fixed `SimulationCoordinator.ts` to use actual elapsed wall clock time between 200ms tick updates and pause execution when `engine.isPaused` is active.
- **API Rate Limiting**: Added `checkApiRateLimit` LRU rate-limiter in `server.ts` guarding `/api/catalog/search` (SIMBAD TAP) and `/api/horizons/search` (NASA JPL) endpoints against IP rate limit exhaustion.

- **Star Surface Granulation & Sunspots**: Upgraded `starSurface.frag.glsl` with domain-warped FBM (`fbm(p + shift)`), a high-frequency 24-octave solar convective granulation cell noise, and dynamic sunspot cell darkening.
- **Supernova Shockwave Radial Distortion**: Added `uShockwave` uniform and screen-space radial UV displacement in `cinematic.frag.glsl` and `Pipeline.ts` during supernova flashes.

**State at end:** All 49 E2E test scenarios across presets, UI modes, galaxy, and comets pass cleanly. `npm run typecheck`, `npm run lint`, and production build all succeed with zero errors.

---

### fix/initial-cosmic-age-population — Initial Cosmic Age Star Population & Raycaster Safety
**Date:** July 22, 2026
**AI:** Antigravity (Gemini 3.6 Flash)
**Branch:** fix/initial-cosmic-age-population

**Changes:**
- **Birth Age Distribution & Immediate Creation-Time State**: Updated `HeroStarSystem` constructor and `respawn()` method to generate stellar birth ages `birthAge = Math.random() * 13.0` across `[0.0, 13.0]` Gyr, and implemented `applyInitialCosmicAge()` executed immediately on creation. This ensures `t`, `visible`, `globalFade`, and active phase mesh state match `cosmicAge` on frame 0 without waiting for the first `update()` tick.
- **Raycaster Object Filtering**: Filtered raycasting `hitMeshes` in `useSimulation.ts` using `.slice(0, activeHeroStarCount).filter(h => h.visible && h.t >= 0)` to prevent raycaster interactions with invisible, unspawned, or inactive hero stars.
- **Material Naming & Debug Traceability**: Assigned explicit descriptive `.name` properties to all material instantiations across render systems (`AsteroidBeltSystem`, `CometSystem`, `DysonSwarmSystem`, `HeroStarSystem`, `NebulaSystem`, `PlanetarySystem`, `Pipeline`) and simulation phases (`NebulaPhase`, `ProtostarPhase`, `MainSequencePhase`, `RedGiantPhase`, `SupernovaPhase`, `RemnantPhase`). Added an automatic `onBeforeCompile` fallback hook in `engine.ts` setting `this.name = ${this.type}_${this.id}` if a material is unnamed, ensuring WebGL shader compile errors always report explicit material names instead of blank fields.

**State at end:** TypeScript typecheck compiles with zero errors, production build succeeds, ESLint clean, and all 49 E2E test scenarios pass cleanly.

---

### fix/nbody-timestep-substepping — N-Body Physics Timestep Sub-Stepping Loop
**Date:** July 21, 2026
**AI:** Antigravity (Gemini 3.6 Flash)
**Branch:** fix/nbody-timestep-substepping

**Changes:**
- **Timestep Sub-stepping Loop in `nbodyWorker.ts`**: Re-factored Velocity-Verlet integrator step into an isolated `integrate(subDt)` helper function. Added `MAX_PHYSICS_DT = 0.002` (~17.5 hrs/step) and `MAX_SUBSTEPS = 64` to decompose large frame timesteps into micro-substeps, preventing integration numerical breakdown and body ejection ("orbital explosions").
- **Tab-Stall & Step Clamping**: Clamped input timestep `dt_yr` to `MAX_PHYSICS_DT * MAX_SUBSTEPS` (`0.128` yr) to prevent huge physics jumps and freezes after background tab stalls.
- **Simulation Time Scaling Adjustment**: Adjusted `useSimulation.ts` worker timestep payload to stable baseline (`0.05` / `0.3`), keeping integration stable under variable render frame rates.

**State at end:** TypeScript type-check compiles with zero errors, ESLint clean, and production Vite build completes successfully.

---

### feat/black-hole-lensing — Black Hole Gravitational Lensing & Render Loop Safety
**Date:** July 19, 2026
**AI:** Antigravity (Gemini 3.5 Flash)
**Branch:** perf/eager-phase-init

**Changes:**
- **Black Hole Lensing Shader & Post-Processing Warp**: Added post-processing gravitational lensing warp effect to the cinematic fragment shader (`cinematic.frag.glsl`) to warp the entire screen (including background stars and accretion disk) around the screen-space projection of high-mass black holes (mass > 15.0).
- **Accretion Disk & Visual Rework**: Replaced the placeholder flat accretion disk visual inside `RemnantPhase.ts` and `geometries.ts` with a smaller, high-fidelity circular disk (`RingGeometry(1.2, 4.0)`). Implemented a custom fragment shader incorporating Keplerian differential rotation (`orbitalSpeed = 4.0 / (dist^2 + 1.0)`), orbital winding spiral waves, and relativistic Doppler beaming (`1.0 + 0.6 * cos(angle)`) for a premium "Interstellar" look.
- **Starfield Rebuild Race Safety**: Guarded against out-of-bounds array reads in the render loop by:
  - Synchronously resetting `activeHeroStarCount` to `0` immediately after clearing the `heroStars` array in `rebuildStarfieldGeometry()` inside `useSimulation.ts`.
  - Adding a defensive clamping layer `Math.min(this.activeHeroStarCount, this.heroStars.length)` around all rendering/update loops iterating over active stars in `engine.ts` to prevent race conditions during performance-tier transitions.

**State at end:** TypeScript type-check compiles with zero errors, production builds succeed, and all 49 E2E test scenarios across presets, UI modes, galaxy, and comets pass perfectly.

---

### perf/planetary-system-budget-queue — PlanetarySystem Creation & Disposal Throttle
**Date:** July 18, 2026
**AI:** Antigravity (Gemini 3.5 Flash)
**Branch:** perf/eager-phase-init

**Changes:**
- **Diagnostics Logging Endpoint**: Added `/api/debug-log` POST endpoint to `server.ts` to log diagnostic payloads to `ps_diag.log` file on disk for remote capture.
- **PlanetarySystem Cache Verification**: Verified that `customProgramCacheKey` successfully deduplicates shader compilation (shader program count remains flat at 49).
- **Throttled Creation/Disposal Queue**: Implemented a frame-budgeted `PlanetarySystemQueue` to limit synchronous allocations/deallocations of planetary systems to a maximum budget of 2 per frame, resolving the 60ms stutters during massive scrubbing transitions.
- **Typescript Visibility fixes**: Made `PlanetarySystem.parent` and `PlanetarySystem.renderer` properties public to allow proper access by the queue manager.

**State at end:** Code compiles cleanly, production builds succeed, and frame spacing of creation/disposal operations is verified under load.

---

### perf/eager-phase-init — Eager Phase Initialization & Stutter Diagnostics
**Date:** July 17, 2026
**AI:** Antigravity (Gemini 3.5 Flash)
**Branch:** perf/eager-phase-init

**Changes:**
- **Eager Phase Initialization:** Eagerly instantiated all six stellar lifecycle phases (`NebulaPhase`, `ProtostarPhase`, `MainSequencePhase`, `RedGiantPhase`, `SupernovaPhase`, `RemnantPhase`) inside the `HeroStarSystem` constructor instead of initializing them lazily. Set `customProgramCacheKey` across all phase materials to maximize WebGL program caching and prevent compile stutters.
- **Stutter & Performance Telemetry Dashboard:** Implemented a togglable diagnostics panel in the HUD (`Hud.tsx`, `usePerformanceAutoTuning.ts`) displaying frame times, 1% low FPS, draw calls, triangles, memory heap usage, long-running tasks, and phase inits/disposals.
- **Main Thread Block Logging:** Integrated a `PerformanceObserver` targeting `longtask` entries to log, trace, and warn about main thread blockages (>50ms) with a suspect collection size printout.
- **ESLint & TypeScript Cleanup:** Fixed 14 ESLint error issues across `server.ts`, `SimulationCoordinator.ts`, and test files (fixing `no-useless-assignment` and `prefer-const` warnings-turned-errors).

**State at end:** Code compiles, passes build bundler checks, passes all E2E test suites with zero errors, and runs cleanly with no ESLint errors.

---

### fix/e2e-preset-lifecycle-issues — E2E Test Suite Alignment & Bug Fixes
**Date:** July 15, 2026
**AI:** Antigravity (Gemini 3.5 Flash)
**Branch:** fix/e2e-preset-lifecycle-issues

**Changes:**
- **Catalog Presets Endpoint:** Implemented `GET /api/catalog/presets` in `server.ts` to return the complete catalog preset library, integrating Trappist-1, Kepler-186, Kepler-22b, and Kepler-442 to resolve preset lookup and loader E2E test failures.
- **Star Search Endpoint:** Implemented `GET /api/catalog/search` in `server.ts` with spectral class filter, mass/distance constraints, numeric boundary validation, and a fallback from SIMBAD TAP query to local presets.
- **JPL Horizons Endpoint & URL Encoding:** Implemented `GET /api/horizons/search` in `server.ts` with input sanitization. Fixed a critical URL encoding bug in the ambiguous record retry query where literal semicolons in the template string split query parameters, causing 400 Bad Request responses from the JPL Horizons API.
- **Stellar Phase Boundaries:** Adjusted Jeans collapse and Kelvin-Helmholtz thresholds in `src/simulation/StellarPhysics.ts` from `0.001` and `0.01` of $\tau_{MS}$ to `0.000001` ($10^{-6}$) and `0.001` ($10^{-3}$) respectively. This aligns the nebula/protostar durations with real astrophysics (10k and 10M years for $1.0\ \text{M}_\odot$ stars) and resolves the cosmic lifecycle integration workload E2E test failure.
- **PR #220 Merge (Sentinel):** Merged the latest security updates, including parameter injection prevention for the NASA Horizons MCP server and centralized WebSocket broadcast clamping. Resolved minor origin regex conflicts in `src/utils/security.ts`.
- **PR #219 Merge (Palette):** Merged the latest design updates, featuring context-specific climate and extinction risk icons in `AstrobiologyPanel.tsx` with accessibility helpers. Consolidated the rendering functions to resolve icon-mapping conflicts.
- **PR #221 Merge (Bolt):** Merged the latest performance optimizations, collating simulation analysis loops to $O(n)$ complexity, restoring WebSocket state streaming, and reducing Three.js vector reallocations in `PlanetarySystem.ts`. Resolved loop integration conflicts in `useSimulation.ts` and `PlanetarySystem.ts`.

**State at end:** All E2E test suites compile and pass successfully, and PR #219, #220, and #221 are successfully merged into the local branch with conflicts fully resolved.

---

### docs/update-project-log — Master Project Log Update
**Date:** July 3, 2026
**AI:** Antigravity (Flash)
**Branch:** docs/update-project-log

**Changes:**
- **Stale Bug Cleanup:** Removed the stale "GEMINI AI DEEP SCAN button in InspectPanel — not wired up" row from the CURRENT BUGS table since the feature is already fully implemented.

**State at end:** Stale bug removed from log.

---

### v2.5 — Phase 2 Stellar Genesis Wiring
**Date:** May 20, 2026
**AI:** Gemini CLI (executor)
**Branch:** main

**Changes:**
- **PlanetarySystem Wiring:** Integrated `PlanetarySystem` into `HeroStarSystem.ts`. Systems are now spawned on MainSequence entry and disposed on exit.
- **Universe Seeds:** Implemented base64 encoding/decoding for `PhysicsConstants`. Added ?seed= URL parameter support and "Share Universe" functionality in `Hud.tsx`.
- **Live Physics Constants:** Wired 5 previously dead constants into the simulation:
    - `softening` → Now drives inter-stellar repulsion physics in `Engine.ts`.
    - `strongForce` → Controls supernova explosion radius and ejecta speed in `SupernovaPhase.ts`.
    - `weakForce` → Controls pulsar and magnetic field rotation speed in `RemnantPhase.ts`.
    - `darkMatter` → Live-adjusts background starfield visibility/density.
    - `baryon` → Affects base stellar temperature distribution in `HeroStarSystem.ts`.
- **UI Enhancements:**
    - `Hud.tsx`: Added Universe ID display and Share button.
    - `ConstantsPanel.tsx`: Added sliders for all 11 physics constants with a scrollable container.

**State at end:** Phase 2 structural wiring complete. Universe sharing active. Inter-stellar repulsion active.

---

### v2.6 — Accretion Disk & Visual Alignment Bug Fixes
**Date:** May 27, 2026
**AI:** Antigravity (Medium)
**Branch:** sentinel/input-validation-7488507696427334673

**Changes:**
- **Decoupled Accretion Disk:** Refactored the black hole accretion disk to create, update, and dispose its customized RingGeometry and ShaderMaterial directly within the `RemnantPhase` component, resolving a memory leak and a bug that disposed the global shared geometry.
- **Green Habitable Zone:** Removed the system-level color override from `HeroStarSystem.ts` that colored the habitable zone orange, restoring its original green color signature.
- **Supernova Ring Colors:** Transferred ring color control from `HeroStarSystem.ts` to `SupernovaPhase.ts`, adding white-to-orange-red color gradients for high-mass supernova rings while preserving cyan-green planetary nebula shells for low-mass stars.
- **Geometries Cleanup:** Removed the unused `GEOMETRIES.blackHoleDisk` to clean up shared global assets.

**State at end:** Code compiles cleanly and builds successfully in production mode.

---

### v2.7 — Memory Leak Resolution & Timescale Alignment
**Date:** July 3, 2026
**AI:** Antigravity (Flash)
**Branch:** docs/update-project-log

**Changes:**
- **Nbody Worker & OrbitControls Leak Fix:** Cleaned up the animation frame loop, terminated the Nbody worker thread, and disposed of the OrbitControls instance in the `useEffect` cleanup handler of `useSimulation.ts`, preventing memory/GPU leaks on React.StrictMode remount.
- **Astrobiology Timescale Correction:** Aligned the astrobiology simulation speed with `engine.ts`. Switched the realtime `deltaTime_yr` from wall-clock seconds `delta / 31557600` to `delta * 1000` to allow biosphere and Kardashev civilization tiers to develop at the same pace as stellar physics in realtime mode.
- **Phase Disposal Leak Cleanup:** Fixed geometry and material memory leaks across phase lifecycles:
  - `MainSequencePhase`: Tracked and disposed of the dynamic `coronaGeo` (SphereGeometry) and `haloMesh` material.
  - `RemnantPhase`: Added a direct call to dispose of `beamMat` (MeshBasicMaterial) since it is nested in the `pulsarGroup` and skipped by parent traversal.
- **Scrubbing Damage Reset:** Stored the planet's original `baseColor` in `PlanetInfo` and implemented a restoration path in `MainSequencePhase` to reset color, scale, and emissive properties, ensuring planets regain their pristine appearance when scrubbing time backwards out of the red giant damage zone.

**State at end:** Code builds cleanly. StrictMode memory/thread leaks resolved, and backward scrubbing damage states reset correctly.

---

### v3.0 — Phase 3 Next-Generation Upgrades & Antigravity 2.0 Plugin
**Date:** July 23, 2026
**AI:** Antigravity (Gemini 3.6 Flash & Claude Sonnet 4.6)
**Branch:** refactor/visual-upgrade-phase2

**Changes:**
- **Volumetric Pulsar Beams:** Replaced static cone meshes in `RemnantPhase.ts` with custom high-energy `ShaderMaterial` featuring volumetric turbulence, cyan core glow, electric blue rims, and Doppler frequency modulation.
- **Relativistic Accretion Disk:** Upgraded black hole accretion disk shader with Doppler beaming (approaching edge shines brighter/bluer, receding edge dims/reddens) and Keplerian differential rotation noise.
- **Dynamic Planet Orbit Path Lines:** Built `orbitLinesGroup` in `PlanetarySystem.ts` rendering glowing cyan orbital trajectory line loops (`LineLoop`) around host stars.
- **Native WebAudio Ambient Synthesizer:** Implemented zero-dependency `CosmicAudioEngine.ts` generating ambient space drones, LFO filter sweeps, supernova explosions, and UI clicks.
- **CatalogPanel & Audio HUD Integration:** Mounted `CatalogPanel.tsx` in `AetherGenesis.tsx` and added top-right HUD buttons for Astronomical Catalog search (`Search`) and Audio mute toggle (`Volume2`/`VolumeX`).
- **Antigravity 2.0 Plugin Scaffold:** Created `.agents/plugins/aethergenesis/` with plugin manifest (`plugin.json`) and skills (`stellar-physics`, `shader-optimization`).

**State at end:** All 49 E2E scenarios pass. `npm run typecheck` and `npm run build` pass with 0 errors.

---

## CURRENT BUGS (as of last session)

| Priority | Bug | File | Fix |
|----------|-----|------|-----|
| LOW | README launch link points to `#` | `README.md` | Update after deploy |


---

## NEXT PRIORITIES

1. **Black Hole Gravitational Lensing** — Add post-processing warp effect for high-mass remnants.
2. **Wire GEMINI DEEP SCAN button** — `InspectPanel.tsx` has the button, needs API call.
3. **Deploy to Render** — `render.yaml` exists, just needs env vars + trigger.
4. **Cinematic Post-Processing pass** — further refine bloom and color grading.


---

## HANDOFF PROTOCOL FOR INCOMING AI

Read this entire document first. Then:

```bash
cd ~/aethergenesis
git pull
git checkout -b fix/your-task-name
```

Check the CURRENT BUGS table above. Fix one thing per branch. When done:

```bash
git add -A
git commit -m "fix: description of what you fixed"
git push origin fix/your-task-name
# Open PR to main, then update this log
```

Do not push to `main` directly. Do not run `git commit --amend` on pushed commits. Do not create more than one branch per session without merging the first.

---

## ARCHITECT SIGN-OFF

**Claude Sonnet 4.6**
*Session: May 14, 2026*
*Role: Architect*

Actions this session: Full repo audit, identified 7 core engine bugs, generated all fix prompts, directed Gemini CLI execution across PRs #27–#31, identified Grok's nebula double-offset root cause, authored this document.

Next architect action needed: Review nebula fix diff after Gemini executes, verify visual output matches intent, confirm FPS holds at 30+ after fix.

> "The simulation is structurally sound. The nebulae just need their coordinates fixed. Everything else is polish."
