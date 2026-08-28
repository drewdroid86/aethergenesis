# Fix: Port Red Giant Planet Scorch to the Real Instanced Planets
**Branch:** `fix/red-giant-scorch-or-remove`
**Date:** August 19, 2026
**Context:** Finding B in `AETHERGENESIS-AUDIT-2026-08-19.md` — decided to port the dead damage system rather than delete it.

---

Port the Red Giant planet-scorch system onto the real instanced planets in
PlanetarySystem.ts. It currently reads from MainSequencePhase.planetsInfo,
which is permanently empty dead code — this visual has never fired for any
star.

**ROOT ISSUE (read first):** PlanetarySystem.updateFromBuffer() hides its group
the moment star.phase !== PHASES.MAIN_SEQUENCE, AND HeroStarSystem disposes
`this.planetarySystem` outright on that same transition (3 call sites). So
by the time a star reaches PHASES.RED_GIANT today, there's no PlanetarySystem
instance left to scorch. Step 1 has to land before anything else works.

## 1. Stop disposing planets on Main Sequence exit (HeroStarSystem.ts)
Three places call `PlanetarySystemQueue.enqueueDisposal(this.planetarySystem)`
when `_activePhase === PHASES.MAIN_SEQUENCE` (~line 226-229, ~291-294,
~414-417). The transition-out block inside `update()` (~414-417) should only
dispose planetarySystem when advancing to `PHASES.SUPERNOVA` or later — not
on entry to `PHASES.RED_GIANT`. Leave `respawn()`'s two dispose calls
(~226-229, ~291-294) unconditional — respawn is a full reset regardless of
phase.

While in here: this is the 3rd near-identical copy of "hide old phase, maybe
dispose planetarySystem" logic. If it's not much extra risk, extract it into
one shared private method (e.g. `_exitPhase(phase)`) called from both
`respawn()` and `update()`'s transition block, instead of a 4th copy-pasted
variant. This exact duplication pattern is what caused `applyPreset()` to
miss a `setPlanets()` call elsewhere in this file — don't repeat it. Skip
this refactor if it meaningfully raises risk; not required.

## 2. Let planets render through Red Giant (PlanetarySystem.ts:268)
Currently: `if (star.phase !== PHASES.MAIN_SEQUENCE || lowDetail)`.
Change to allow both `PHASES.MAIN_SEQUENCE` and `PHASES.RED_GIANT`.
Everything below already works generically off the buffer.

## 3. Thread the Red Giant's current scale into updateFromBuffer()
`RedGiantPhase.update()` already computes this every frame:
```ts
const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START)
              / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
const giantScale = this.baseRadius * (1.0 + normT *
  STELLAR_CONSTANTS.VISUALS.RED_GIANT_MAX_SCALE_FACTOR) +
  Math.sin(appTime * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PULSATION_SPEED)
  * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PULSATION_AMP;
```
Extract this into `getCurrentScale(t: number, appTime: number): number` on
`RedGiantPhase` (refactor `update()` to call it instead of duplicating the
formula). In `HeroStarSystem.update()`, wherever t/appTime are already in
scope near the existing `redGiantPhase.update()` and
`planetarySystem?.updateFromBuffer()` calls, compute `giantScale` via the
new getter when `_activePhase === PHASES.RED_GIANT` (else `undefined`), and
pass it as a new optional 5th param:
`updateFromBuffer(buffer, delta, lowDetail, globalFade, redGiantScale?)`.

## 4. Add a `scorch` instance attribute (PlanetarySystem.ts)
Mirror the existing `biomassAttr`/`civAttr` pattern exactly:
`Float32Array(numBodies).fill(0)` → `InstancedBufferAttribute` →
`geometry.setAttribute('scorch', ...)` → store as `this.scorchAttr`.

Inside `updateFromBuffer()`'s existing per-body loop (x/y/z are already
computed from the buffer there), when `redGiantScale` is provided:
```ts
const dist = Math.sqrt(x*x + y*y + z*z);
const dmgRadius = redGiantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_DMG_RADIUS;
const burnDenom = redGiantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_BURN_RADIUS;
const dmg = dist < dmgRadius
  ? Math.min(1.0, Math.max(0, 1.0 - (dist - redGiantScale) / Math.max(0.001, burnDenom)))
  : 0.0;
```
This is the exact formula `RedGiantPhase.ts` (~line 135-137) already uses on
the dead legacy planets — reuse it, don't reinvent it. Write `dmg` into the
scorch array at index `i`; set `scorchAttr.needsUpdate = true` after the
loop. When `redGiantScale` is NOT provided (still Main Sequence), fill
scorch with 0 the same way `updateAstrobiology()` clears its tail — don't
leave stale scorch values if a star respawns.

Same loop, same iteration: multiply the scale terms (`sc`, `ss`, and the
Y-column's `s`) by `(1.0 - dmg)`, floored at a small epsilon so it doesn't
hit exactly 0 and z-fight. Mirrors the legacy
`p.mesh.scale.setScalar(Math.max(0.01, 1.0 - dmg))`.

## 5. Shader changes (PlanetarySystem.ts, PLANET_VS / PLANET_FS)
VS: add `attribute float scorch; varying float vScorch;`, set
`vScorch = scorch;` in `main()`.
FS: add `varying float vScorch;`, and right before `gl_FragColor`:
```glsl
finalColor = mix(finalColor, finalColor * 0.15, vScorch);
finalColor += vec3(1.0, 0.4, 0.0) * vScorch * 0.8;
```
Tune to taste, but keep it a pure blend driven by `vScorch` — not a one-way
mutation — since step 4 recomputes `vScorch` fresh every frame and time can
scrub backward.

## 6. Fix applyPreset()'s Red Giant branch while you're in this file
`HeroStarSystem.ts` ~line 349: `else if (initialPhase === PHASES.RED_GIANT)
this.redGiantPhase.show();` is missing the
`if (this._mainSequencePhase) { this.redGiantPhase.setPlanets(this._mainSequencePhase.planetsInfo); }`
call that `applyInitialCosmicAge()` and `update()`'s transition block both
have before `.show()`. Add it for consistency even though `planetsInfo`
itself stays unused after this change.

## Verification — don't report done without all of this
- `npm run typecheck && npm run build && npm run lint` — all clean, paste the output.
- `npm run test` — full e2e suite, paste pass/fail counts (48/49 was baseline going into this branch).
- Manual scrub-safety check: push a star into Red Giant, confirm planets visibly scorch/shrink, then scrub time **backward** out of Red Giant into Main Sequence and confirm they return to pristine color/scale. This is the easiest part to get wrong with a one-way mutation instead of step 4's per-frame recompute.
- Report the actual `git diff --stat` and commit SHA, not just "done."
