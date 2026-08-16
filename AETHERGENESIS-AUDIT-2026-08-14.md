# ÆTHERGENESIS — Intensive Codebase Review
**Date:** August 14, 2026
**Reviewed:** full source tree from `aethergenesis-main__5_.zip` — all `src/**`, `server.ts`, `server/mcp/*.mjs`, shaders, configs (~10k lines TS/TSX + GLSL, no `.git` in this zip)
**Method:** fresh `npm install`, `npm run typecheck` / `build` / `lint` (all clean, 0 errors), then a full manual read of every source file, cross-checked line-by-line against the prior audits (in-repo docs + your own tracked findings) to confirm what's actually fixed vs. still open, plus a fresh sweep for anything not previously caught.

Nothing here duplicates your B1–B20 numbering — this uses its own numbering so it doesn't collide with your existing backlog.

---

## Part 1 — Status of previously-tracked issues (re-verified against this zip)

| Issue | Status |
|---|---|
| `PlanetarySystem.dispose()` leaking `orbitLinesGroup` geometries + `orbitLineMat` | **FIXED.** `dispose()` now loops `orbitLinesGroup.children`, disposes each `LineLoop` geometry, disposes `orbitLineMat`, calls `.clear()`. Verified in `PlanetarySystem.ts:358-374`. |
| Reversed `smoothstep()` in `starSurface.frag.glsl` | **FIXED, holding.** Line 35 is `1.0 - smoothstep(0.22, 0.28, n1)`. Re-checked every `smoothstep()` call in every shader in the repo (21 call sites) — all correctly ordered. `cinematic.frag.glsl:65` even has a comment flagging the exact pitfall you fixed. |
| Light culling cap (`MAX_FRAGMENT_UNIFORM_VECTORS` crash) | **FIXED, holding.** `Engine._cullStarLights()` caps at 12, sorts by distance with luminosity tiebreak. Clean implementation. |
| `addBodyToSimulation()` no-op stub | **STILL OPEN**, unchanged. See Finding #2. |
| `loadStarPreset()` incomplete (mass/temp only, no derived recalculation) | **STILL OPEN**, and worse than previously described — see Finding #2, the temperature write is now confirmed dead on arrival. |
| `updateAstrobiology()` stale tail biomass/civ data | **STILL OPEN**, unchanged. See Finding #6. |
| `App.tsx` / `Hud.tsx` viewport height + safe-area | **STILL OPEN**, unchanged. See Finding #8. |
| `AsteroidBeltSystem.ts` at 10,000 instances | Confirmed, but it's one `InstancedMesh`/one material/one draw call — not 10,000 separate materials. Not the performance risk it sounds like. See Finding #12 for the actual issue there. |

---

## Part 2 — New bugs found this pass

### 1. Every main-sequence star's planets share one fake, hardcoded orbit — HIGH
`useSimulation.ts:289-343` spins up exactly one `nbodyWorker`, and initializes it **once**, forever, with a hardcoded Earth+Jupiter+Halley's-Comet system around `centralMass_solar = 1.0`. There is no other `postMessage({type:'INIT'...})` anywhere in the codebase (grepped, confirmed) — it's never re-keyed to whichever star is selected.

`Engine.nbodyBuffer` is a single field, and every hero star in `MAIN_SEQUENCE` phase calls `this.planetarySystem?.updateFromBuffer(nbodyBuffer, ...)` (`HeroStarSystem.ts:381-383`) with that **same** buffer. Consequence:
- Every visible main-sequence star shows exactly 3 planets (buffer length), never the up-to-50 randomized rocky/gas/ice/lava/ocean/desert/jungle bodies each `PlanetarySystem` actually generates for itself.
- All of them orbit in lockstep — same radii, same angular position, every frame — regardless of that star's real mass (a 15-solar-mass supergiant shows planets orbiting as if gravity came from 1 solar mass).
- `SimulationCoordinator.ts:141` reverse-engineers `semi_major_axis_au` from this buffer using the **real** selected star's mass via vis-viva — but the buffer's positions were generated under the fake 1-solar-mass assumption, so the semi-major-axis fed into `AstrobiologyEngine.evaluatePlanet()` is wrong whenever mass ≠ 1.0 (i.e., most of the time). This also means `AstrobiologyPanel` is always evaluating "Earth" and "Jupiter" analogues, never the star's own planet roster.

Fix is a design call, not a one-liner — two reasonable directions: (a) minimal — re-`INIT` the worker with the selected star's actual mass + a body set matching its own `PlanetarySystem.bodies[]` whenever selection changes, accepting that only the selected star gets true N-body; or (b) give every other visible main-sequence star cheap analytic Kepler propagation (you already have `solveKepler`/`keplerianToCartesian` in `OrbitalMechanics.ts`, same approach `CometSystem` already uses with no worker) instead of feeding them the shared buffer at all.

### 2. Catalog "Load"/"Spawn" buttons don't do anything real — HIGH
`CatalogPanel.tsx` is a fully-built 3-tab UI (Presets / Search / Horizons) hitting real server endpoints (`GET /api/catalog/presets`, `/api/catalog/search`, `/api/horizons/search` all exist and work in `server.ts`). But:
- **Spawn** → `addBodyToSimulation()` (`useSimulation.ts:147-149`) only does `setIsCatalogOpen(false)`. The `_elements` param is unused. Nothing reaches the worker — confirmed via grep, `ADD_BODY` is never posted anywhere.
- **Load** → `loadStarPreset()` (`useSimulation.ts:139-145`) sets `mass` and `currentTemp` directly on the star. `mass` "sticks" but nothing recomputes `baseRadius`, `lifespanReal`, `tHeat`, or `_msLuminosity` from it, so the star becomes physically inconsistent with its own new mass. Worse: `currentTemp` is silently overwritten on the very next frame — `HeroStarSystem.update()` sets `this.currentTemp = this.tHeat` unconditionally every tick while in Main Sequence (`HeroStarSystem.ts:378`), so the preset's temperature never has any visible effect at all.
- Root cause for a real fix: `baseRadius`/`tHeat`/`_msLuminosity` are set once in the constructor and baked into each phase object's own constructor args (e.g. `new MainSequencePhase(this.mass, this.baseRadius)`). A correct "load preset" needs either a new `HeroStarSystem.applyPreset()` that recalculates everything derived from mass, or simplest: dispose and reconstruct the star in place at the new mass.

### 3. Main Sequence corona glow is built, wired, disposed — and never rendered — MEDIUM-HIGH
`MainSequencePhase.ts` constructs **two** separate corona effects: `this.coronaMesh` (`GEOMETRIES.corona` + `MeshBasicMaterial`, line 88) and `this._coronaMesh`/`corona` (a nicer Fresnel rim-light `ShaderMaterial`, lines 130-135). Both get their opacity updated every frame in `setOpacity()` (lines 248, 251) and both get correctly disposed in `dispose()` (lines 276-279). Neither is ever `.add()`-ed to `mainSeqGroup` or `parent` — I checked every `.add(` call in the file (lines 96, 136, 183, 185, 202), and neither corona mesh is among them. Since Main Sequence is the phase a star spends the most time in (t: 0.15–0.70), this is a real, currently-invisible piece of the star's visual design. One-line fix once you decide which of the two coronas you want (they look like two different implementation attempts — probably drop one and add the other).

### 4. Supernova/UI sound effects are dead code — MEDIUM
`AudioEngine.ts` fully implements `playSupernovaSound()` and `playUiClick()` — real oscillators, envelopes, the works. Grepped the whole repo: neither is called from anywhere except their own definitions. Only `audioEngine.init()` (the ambient drone) is wired, from the mute button in `Hud.tsx:531`. The CHANGELOG lists "supernova sub-bass explosion bursts, and UI click SFX" as shipped — they're built but never triggered. Fix: call `playSupernovaSound()` where `isSupernovaFlashing` flips true (`HeroStarSystem`/`Engine`), and `playUiClick()` from the HUD button handlers.

### 5. Comets don't hide when they should — MEDIUM
`CometSystem.update()` hides itself based on `stellarState.phase !== 'main_sequence'`, where `stellarState` comes from `Engine.getStellarState()` → `createStellarState()` in `StellarPhysics.ts`. That module computes phase from `age_yr < tau_ms` (main sequence ends at `age == tau_ms`). But the star's actual visual `t` (driving what you see) uses a completely different breakpoint scheme (`HeroStarSystem.getPhaseForT`: main sequence ends at `t = 0.70`, red giant/supernova/remnant fill `t: 0.70→1.05`). Since `t` is capped at 1.05 and `StellarPhysics`'s own "not main sequence anymore" threshold needs `age_yr ≥ tau_ms` (`t ≥ 1.0`), `getStellarState().phase` reports `'main_sequence'` for essentially the entire visual Red Giant and Supernova phases, and most of Remnant — comets only actually disappear in the last sliver (`t: 1.0–1.05`) right before the star respawns. Net effect: comets keep orbiting through a star's red giant swell and supernova explosion.

Broader point: `StellarPhysics.ts`'s header explicitly says it's "the single source of truth... no physical quantity may be invented in a rendering file" — but the actual simulation (`HeroStarSystem`) only borrows `computeLuminosity()` and (via `Engine.forceSupernova()`) `computeMainSequenceLifetime()` from it, and has its own separate, incompatible phase/radius/temperature model. `SimulationCoordinator.ts` correctly sidesteps this by building its own `perStarState` from `star.phase` directly rather than calling `createStellarState()` — which is why astrobiology data is *not* affected by this, only `CometSystem` is. Worth deciding whether `StellarPhysics.ts` should actually drive the sim, or whether it's just for the (currently very lightly used) telemetry/WS layer — right now it's dead-in-the-middle and a standing trap for the next thing that calls `getStellarState()` expecting it to match what's on screen.

### 6. `updateAstrobiology()` still leaves stale biomass/civilization data — MEDIUM (confirmed still open)
`PlanetarySystem.ts:379-404` writes `biomassArray[i]`/`civArray[i]` for `i < astrobiologyStates.length` but never clears indices beyond that when the list shrinks. In practice `astrobiologyStates.length` currently tracks the shared nbody buffer (see Finding #1), so it rarely shrinks today — but the moment #1 is fixed and each star gets its own varying body count, a planet that stops being evaluated will keep showing its last biomass/city-lights state forever (or until a coincidentally-same-index planet overwrites it). Cheap fix: `.fill(0)` the tail past `astrobiologyStates.length` each call.

### 7. Habitability/civilization history is keyed by array index, not by star — MEDIUM
`AstrobiologyEngine.history` is a `Map<string, ...>` keyed by `planet_id = "body_${i}"` (`SimulationCoordinator.ts`). That `AstrobiologyEngine` instance lives for the whole session on `SimulationCoordinator`. Switching selected stars (`useStarSelection.ts`) never touches it. So Star A's `body_0` accumulating "time in habitable zone" / civilization-emergence state gets **inherited** by Star B's `body_0` the instant you select a different star — a brand-new star can show pre-existing biomass or even an instant civilization tier that actually belongs to whatever you looked at previously. Fix: scope the map key by star id too (`${star.physicsId}:body_${i}`), and/or clear relevant entries on selection change.

### 8. No safe-area / dynamic-viewport handling anywhere — MEDIUM (confirmed still open, affects your Pixel directly)
Three things stacking together:
- `index.html` meta viewport has no `viewport-fit=cover`, so `env(safe-area-inset-*)` resolves to 0 even if used.
- `App.tsx:5` and `AetherGenesis.tsx:57,74` all use `h-screen` (`100vh`), not `h-dvh`. Tailwind 4.3 (what you're on) supports `dvh` utilities natively — this is a straight swap.
- `Hud.tsx:420`'s bottom bar is `absolute bottom-0 w-full p-8` with no `env(safe-area-inset-bottom)` padding, matching the clipped-HUD screenshots from the last audit.
Fix: add `viewport-fit=cover` to the meta tag, swap `h-screen`→`h-dvh` in both files, add `pb-[max(2rem,env(safe-area-inset-bottom))]` (or similar) to the bottom HUD bar.

### 9. Performance auto-downgrade only goes one direction, and nukes the whole universe when it fires — MEDIUM
`usePerformanceAutoTuning.ts` has a clean downgrade path (`handleTierChange` triggered when FPS < 25 for 150 consecutive frames) but **no upgrade path anywhere in the file** — once a session downgrades from `ultra`→`high` (say, from one bad stretch during a heavy scrub), it's stuck there for the rest of the session even if performance fully recovers.

More significant: every tier change (up or down) calls `rebuildStarfieldGeometry()` (`useSimulation.ts:151-171`), which disposes **every** hero star and creates an entirely new random population from scratch, and explicitly does `setSelectedStar(null)` first. So the exact moment FPS tanks during heavy cosmic-age scrubbing — the scenario your last few sessions have been chasing — is also the moment the auto-tuner (once its 150-frame/10s-cooldown debounce elapses) will silently regenerate the whole universe and kick you out of whatever star you had selected. Worth deciding if a downgrade should really mean "reduce star count" (currently: destroy and reshuffle everything) versus something less disruptive to whatever the user is currently looking at.

### 10. Frustum culling checks only the star's center point — LOW-MEDIUM
`HeroStarSystem.ts:345`: `frustum.containsPoint(this.position)` — no radius padding. For phases with a large visual radius (red giant up to `baseRadius × 4`, supernova ring out to `baseRadius × 60`), a star whose *center* has just left the frustum but whose glow/ring is still partly on screen will stop updating (opacity ramps, shader time, planet rotation all freeze) until the center point re-enters. Worth a quick look at the edges of the screen during a red giant or supernova near the screen border — likely shows as a brief freeze/pop rather than a smooth exit.

### 11. `pipeline.ts` duplicates the black-hole mass threshold as a bare literal — LOW (preventative)
`updateLensing()` gates the screen-space lensing warp on `selectedStar.mass > 15.0` (`pipeline.ts:43`) instead of importing `STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE` (currently also `15`, so no active bug). `RemnantPhase.ts` correctly uses the shared constant for the 3D lensing-sphere mesh and accretion disk. If you ever tune that constant, the full-screen warp and the in-scene lensing mesh will silently disagree about which remnants count as black holes. Cheap fix: import the constant instead of the literal.

### 12. `cosmicAge`'s "realtime" auto-advance doesn't match the rate everything else uses for "realtime" — LOW-MEDIUM
`Engine.start()` (`engine.ts:64`): in `timeScale==='realtime'`, `cosmicAge` advances by `(delta/31557600)/1e9` per real second — i.e., true 1-real-second-equals-1-real-second, so the global timeline is effectively frozen unless manually scrubbed. But `deltaTime_yr` for comets/dyson/asteroids (`engine.ts:418`) and for astrobiology (`SimulationCoordinator.ts:124`) both use `delta * 1000` in realtime mode — 1 real second = 1000 years — matching the "Astrobiology Timescale Correction" changelog entry. The `cosmicAge` formula on line 64 looks like it was never updated to match that fix; it's using a different, much smaller conversion factor. Worth confirming intent (should the global timeline visibly creep forward in realtime mode, matching the 1000×-years-per-second rate everything else uses, or is "frozen unless scrubbed" actually what you want?) — if the latter, this is fine as-is and can be ignored.

### 13. Supernova ring/ejecta ignore the universe-edge fade — LOW
`SupernovaPhase.setOpacity()` only touches `coreFlashMesh`. `snRing` and `ejectaMesh` opacity are set directly in `update()` from `normT` alone, with no `globalFade` factor — so a star going supernova right at the edge of the 14 Gyr timeline (`cosmicAge < 1` or `> 13`) would show a full-brightness ring/ejecta burst even while everything else is fading out. Narrow edge case, easy fix (thread `globalFade` into the two `update()` branches like `RemnantPhase` and `NebulaPhase` already do).

---

## Part 3 — Visual / mobile polish

- **Stale copy in two places:** `Hud.tsx:170` still reads "Simulation Phase 02: Stellar Genesis" even though the app is well into what your own CHANGELOG calls "Phase 3." `metadata.json`'s description ("500,000 instanced stars... logarithmic spiral galaxy") is leftover AI-Studio-template text that doesn't match the actual app at all (max ~600 hero stars, no galaxy structure). Neither affects runtime, but both will confuse anyone reading the repo cold.
- **Touch targets:** the audio/catalog/reset/focus buttons in the bottom-right of `Hud.tsx` are `w-10 h-10` (40px) — under both Apple's 44pt and Material's 48dp minimums. Given this is phone-only, worth bumping.
- **Orbit rings are frozen circles:** `PlanetarySystem.updateFromBuffer()` builds the `orbitLinesGroup` line loops exactly once (`orbitLinesBuilt` flag, line 285), from whatever radius the buffer reports on the first frame it sees. If an orbit is eccentric (likely, given it's N-body) or constants change later via `ConstantsPanel`, the drawn ring won't match the planet's actual path — it's a static circle, not a live trajectory, despite the CHANGELOG calling this "Dynamic Planet Orbit Path Lines."

## Part 4 — Architecture & code quality

- **Duplicated phase-transition logic in `HeroStarSystem`**: the "hide old phase → dispose planetary system if leaving Main Sequence → show new phase" sequence is hand-written three separate times — `respawn()` (lines 217-229), and `update()`'s transition-out (309-321) and transition-in (323-338) blocks. This is exactly the shape of bug that produced the orbit-line leak you fixed last session: a cleanup step added in one copy and missed in the others. Worth extracting into one shared method both call.
- **Dead/duplicated utilities**: `randomGaussian()` (`physics/math.ts`), `computeHabitableZone()` and `computeCometActivity()` (`OrbitalMechanics.ts`) are all exported, all unused — each has its logic re-implemented inline elsewhere instead (e.g. `engine.ts`'s `createHeroStars()` does its own inline Box-Muller). `AsteroidBeltSystem`'s `orbitalPeriods` array is computed for all 10,000 asteroids (proper Kepler's-third-law timing) and then never read — `update()` just rigid-rotates the whole belt as one unit. The comment explains why (avoiding 10k per-frame matrix updates), which is a reasonable tradeoff, but the array itself is pure waste; either use it (e.g. a per-instance rotation-phase shader attribute, no per-frame CPU cost) or drop it.
- **Silent failure in `Engine.update()`**: the comet/dyson/asteroid update is wrapped in a try/catch that, on error, only calls an optional `window.emitErrorOverlay` if that happens to be mounted — no `console.error` fallback. A regression in any of those three systems would fail completely silently in normal use.
- **Unused field**: `RemnantPhase.bhDiskGeometry` is declared but the constructor assigns to a same-named local `const` instead, so the field is always `undefined`. Harmless (disposal doesn't touch it, correctly reads from `GEOMETRIES.blackHoleDisk` instead) but confusing to read.

## Part 5 — Verified clean (so you know what's *not* worth worrying about)

- Fresh install → `typecheck` / `build` / `lint` all pass with zero errors or warnings (Vite only warns about the `three` chunk exceeding 500kB after minification — expected for a Three.js app, and you've already got manual chunk-splitting configured in `vite.config.ts` for `three`/`postprocessing`/`vendor-core`).
- Every `smoothstep()` call in every shader — 21 sites — correctly ordered, no regressions.
- `server.ts` + `SimStateSocket.ts` security layer is unusually thorough: anchored-regex origin allowlisting shared between HTTP and WS, mandatory subprotocol token auth with a hard production fail-closed if `WS_TOKEN` is left at the default, per-IP and per-client rate limiting, 100KB WS payload cap, event whitelisting, entity-count clamping on broadcast. Nothing jumped out here.
- `OrbitalMechanics.ts`'s Keplerian-to-Cartesian conversion and Kepler solver are textbook-correct (proper P/Q rotation vectors, stable `atan2` true-anomaly form).
- `physics/math.ts`'s `colorTempToRGB` is the standard Tanner Helland blackbody approximation, correctly implemented including the two-branch break at 6600K/1900K.
- The sweep-and-prune star-repulsion loop, the `PlanetarySystemQueue` creation/disposal throttle, and the light-culling system (all previously audited) are all still intact and doing what they're supposed to.

---

## Suggested grouping if you want to hand these to agy one branch at a time

1. `fix/safe-area-viewport` — Finding #8 (quick, high visible impact on your own device)
2. `fix/catalog-actions` — Finding #2 (addBodyToSimulation + loadStarPreset, probably needs a new `HeroStarSystem.applyPreset()`)
3. `fix/main-sequence-corona` — Finding #3 (decide which corona to keep, wire it in)
4. `fix/dead-sfx` — Finding #4 (trivial, two call sites to add)
5. `fix/astrobiology-history-scope` + Finding #6's tail-clear — small, same area, same PR makes sense
6. `feat/per-star-orbits` — Finding #1, the big one — needs a design decision first, not a quick fix
7. Everything in Parts 3-4 — cheap, low-risk, good filler branches between the bigger ones
