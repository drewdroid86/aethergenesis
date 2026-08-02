# AetherGenesis — Full Code Review & Visual Upgrade Plan

Reviewed: 61 source files (~9,300 LOC), `server.ts`, GLSL shaders, e2e scripts, build/deploy config.
Scope: correctness bugs, physics consistency, performance, production readiness, and a deep-dive on the visual/rendering layer.

---

## 1. Executive Summary

The codebase is well-organized (clean phase system, cited physics module, decent security posture on the server), but **the rendered image is being actively degraded by a small number of high-impact defects**. Your instinct that "the visuals aren't up to par" is correct — and it is not a matter of taste. There are five compounding root causes:

| # | Root cause | Effect on screen |
|---|-----------|------------------|
| V1 | **No tone-mapping / sRGB output transform** in the post chain | Whole image is gamma-crushed: dark, muddy, low-contrast. `renderer.toneMapping = ACESFilmic` is dead config — it never executes. |
| V2 | **The volumetric nebula raymarcher is broken** (unit-sphere shader vs radius-15 geometry) | The raymarched nebula renders *nothing*. The entire "nebula" phase is just ~500 sparse dots. |
| V3 | **Zero lights in the scene** while using `MeshStandardMaterial` / `MeshPhongMaterial` | Planets, asteroid belt, and the habitable-zone ring render **black/invisible**. |
| V4 | **Bloom misconfigured** (threshold 0.08 in linear space) + **double vignette** (CSS overlay + shader) + **heavy film grain** (±0.04 in linear space) | Scene-wide haze, crushed corners, and dirty noise over everything. |
| V5 | **Planet scale mismatch**: instanced planets (scale 1.5–3.5) are larger than their own orbits (1–18 world units) | Giant spheres intersecting every main-sequence star — when visible at all. |

Fix these five and the sim will look dramatically better before you touch a single aesthetic choice. Section 3 is a prioritized visual-upgrade roadmap; Section 4 is the full bug list; Sections 5–7 cover physics consistency, production, and performance.

---

## 2. Visual Root Causes (detailed)

### V1 — Missing output transform (the single biggest fix)

**Where:** `src/rendering/pipeline.ts`, `src/shaders/cinematic.frag.glsl`

The composer chain is `RenderPass → UnrealBloomPass → ShaderPass(cinematic)`. When three.js renders into an `EffectComposer` render target it works in **linear color space**; tone mapping and the sRGB conversion are only applied when rendering directly to the canvas. Your final `ShaderPass` uses a custom `ShaderMaterial`, which contains no `tonemapping_fragment` / `colorspace_fragment` chunks — so raw linear values are written to an sRGB display.

Result: everything is displayed roughly a gamma curve too dark (a linear 0.5 shows as ~0.22 luminance). The carefully chosen palette (`0x050510` background, star colors, nebula emission lines) never reaches the screen as designed. And `renderer.toneMapping = ACESFilmicToneMapping` + `toneMappingExposure = 1.2` in `engine.ts:86-87` do **nothing** — no pass applies them.

**Fix (5 lines):**
```ts
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// ...after cinematicPass:
this.composer.addPass(new OutputPass()); // applies renderer.toneMapping (ACES) + sRGB
```
This alone will make the scene feel "lit" again. Alternatively bake an ACES fit + `pow(color, 1/2.2)` into `cinematic.frag` if you want the grade applied *after* vignette/grain in one pass.

### V2 — Volumetric nebula never renders

**Where:** `src/simulation/phases/geometries.ts:17` vs `src/shaders/nebula.frag.glsl`

- `GEOMETRIES.nebula = new THREE.SphereGeometry(15, 32, 32)` → local vertex positions have radius **15**.
- The fragment shader raymarches assuming a **unit sphere**: `float d = length(pos); if (d > 1.0) break;`

The very first march step evaluates `d ≈ 15 > 1.0` → immediate break → `alpha = 0`, `accCol = 0`. **The entire raymarched volume — swirl, collapse dynamics, Hubble-palette emission lines, all of it — outputs transparent black, every pixel, every frame.** What you see during the nebula phase is only the separate 500-point dust cloud.

Secondary bug in the same path: `NebulaPhase.update()` only recomputes `uInverseModelMatrix` when `nebulaMesh.matrixWorldNeedsUpdate` is true. That flag tracks the *mesh's local* matrix — but the star (its parent) **drifts every frame**, so the inverse transform goes stale after frame one. Even after fixing the radius, the gas would appear to swim/offset as the star moves.

**Fix:**
1. `GEOMETRIES.nebula = new THREE.SphereGeometry(1, 48, 48)` and `nebulaMesh.scale.setScalar(15)` (world size unchanged, shader math now correct).
2. Compute `uInverseModelMatrix` unconditionally each frame — one matrix invert for a handful of visible nebulae is cheap; or track a position/scale version counter.

### V3 — No lights in the scene

**Where:** `src/core/engine.ts` (and nowhere else — verified by grep)

`MainSequencePhase` creates legacy planets with `MeshStandardMaterial`, the HZ ring with `MeshPhongMaterial`, and `AsteroidBeltSystem` uses `MeshStandardMaterial`. The scene contains **no `AmbientLight`, `PointLight`, or `DirectionalLight` at all**. Standard/Phong materials with no lights render black (only `emissive` shows: the HZ ring glows faint green from `emissive: 0x004422`; everything else is invisible).

**Fix:** one `PointLight` attached to each hero star (or a single global point light at the origin for the asteroid belt) plus a very low `AmbientLight` (~0.03) to lift the night side. Longer term: delete the legacy 2-planet system entirely (see B11) and light the *instanced* planets with the custom `PLANET_FS` shader, which already does its own star-direction lighting — it just needs the scale bug (V5) fixed.

### V4 — Post-processing stack fights itself

**Where:** `src/rendering/pipeline.ts:20-26`, `src/shaders/cinematic.frag.glsl`, `src/components/AetherGenesis.tsx:123`

- **Bloom threshold 0.08** — in linear HDR space, 0.08 catches *mid-tones*, not highlights. Nearly every pixel above dark-gray blooms → the whole scene is wrapped in haze, contrast dies, and small bright detail (stars) smears instead of sparkling. With V1 fixed, use threshold ≈ **1.0** (only true HDR emitters bloom), strength 0.6–0.9, radius 0.3–0.5.
- **Double vignette** — the shader multiplies corners by ~0.005 (`smoothstep(0.8, 0.2, dist*1.1)`), *and* a CSS `radial-gradient` overlay darkens edges to 60%. Corners are double-black. Keep one, at ~0.15–0.25 strength.
- **Film grain ±0.04 in linear space** ≈ ±0.22 sRGB — an extremely visible noise wash over dark regions (which, per V1, is most of the frame). Drop to **0.008–0.012** and apply *after* tone mapping. Also `random(uv * mod(time,100))` produces a full-screen constant at t=0 and precision issues on mobile; use `hash(uv + fract(time))`.
- **Chromatic aberration** is fine (subtle, ~1–2px at edges) — keep.

### V5 — Instanced planets are bigger than their orbits

**Where:** `src/rendering/systems/PlanetarySystem.ts:218-220`, `src/utils/hooks/useSimulation.ts:258-298`

The n-body worker integrates Earth (1 AU), Jupiter (5.2 AU), Halley (17.8 AU) and the buffer positions are used as **raw world units**. Meanwhile instanced bodies get `scale: 1.5 + Math.random() * 2.0` on a radius-1 sphere → planet radii of 1.5–3.5 world units. A scale-3 planet orbiting at radius 1.0 swallows its own star. Combined with B1 (worker timestep explosion flings everything to infinity anyway), the planetary layer is effectively non-functional.

**Fix:** planet scale `0.06 + random * 0.12` (with gas giants ×2.5), and/or scale the AU buffer by a world factor (e.g. ×2). Also see B1 — the worker dt must be substepped or the positions are garbage regardless.

### V6 — Undefined-behavior GLSL (works on your GPU, breaks on others)

`smoothstep(edge0, edge1, x)` with `edge0 > edge1` is **undefined behavior** per the GLSL spec. You have ~15 call sites and several reversed ones: `nebula.frag` (`smoothstep(targetR, targetR*0.6, d)`), `cinematic.frag` vignette, `NebulaSystem` (`smoothstep(1.0, 0.4, dist)`), comet coma/tail fades, BH lens shadow. Most desktop GL drivers do what you expect; ANGLE/Metal and some mobile drivers may not. Sweep them all into the `1.0 - smoothstep(a, b, x)` idiom.

---

## 3. Visual Upgrade Roadmap (prioritized)

Ordered by visual-impact-per-effort. Items 1–3 are the bug fixes above; 4+ are genuine upgrades.

1. **Repair the output chain** (V1) and **rebalance bloom** (V4). ~30 minutes. The scene will immediately look like it gained a lighting artist.
2. **Fix the nebula raymarch** (V2) — it already contains swirl, collapse, sparkles, and a Hubble palette nobody has ever seen. Then raise march steps 12 → 24 and add a per-pixel start-offset jitter (`pos += rayDir * stepSize * hash(gl_FragCoord.xy)`) to kill banding.
3. **Add scene lights** (V3) and **fix planet scale** (V5).
4. **Blackbody star colors.** `src/physics/math.ts` already has a proper Planckian-locus `colorTempToRGB(kelvin)` — it is *dead code*. Drive `uColor` from `currentTemp` every frame instead of the seven hand-picked hex bins in `MainSequencePhase.init`. Stars will then redden smoothly into the red-giant phase and shift blue-white when hot — the color becomes *physics*, matching your HUD telemetry. Bonus: multiply the shader output by ~1.5–3 (HDR) so only star cores exceed the new bloom threshold and bloom naturally.
5. **Star surface detail.** Current surface is 2-octave-scrolled fbm — reads as blurry soup up close. Cheap wins in `starSurface.frag`: domain-warp the fbm (`fbm(p + fbm(p))`), add a high-frequency granulation octave modulated by `uTurbulence`, and darken 5–10% of cells into sunspots for mid-life stars. The quadratic limb-darkening you have (Claret 2000) is genuinely good — keep it.
6. **Round, twinkling background stars.** `PointsMaterial` with no texture renders **square points** — 5,000 little squares is a big part of the "cheap" feel. Replace with a custom shader point: gaussian falloff (`exp(-d²·k)`), per-star size/brightness variance, and a slow `sin(time·f + phase)` twinkle. Two depth shells (e.g. 3 k and 4 k units) give free parallax.
7. **Black hole rework.** Current disk is `RingGeometry(8, 12)` around a 0.5-radius core with a 1.75 lens sphere — the disk floats ~5× too far out, and the shader uses `vUv.y` as a radial coordinate (RingGeometry UVs are *planar*, so the "radial" gradient is actually a linear one). Use `length(vUv - 0.5) * 2.0` as radius, geometry `RingGeometry(1.2, 4.0)` relative to the core, rotate the UV angle by `uTime` for visible orbital motion, and add Doppler beaming (brighten the side rotating toward the camera — `color *= 1.0 + 0.6 * tangentDir`). That's 80% of the Interstellar look for ~20 lines of GLSL.
8. **Attach solar-system content to an actual star.** Comets (`CometSystem`), the asteroid belt, and the Dyson swarm all orbit the **world origin** — but hero stars are scattered in a ±700-unit Gaussian cloud, so these artifacts orbit empty space. Parent them to the selected star (or a designated "home" star at the origin that you spawn deliberately).
9. **Supernova punch.** You have ejecta and a ring; add (a) a brief full-screen radial shockwave distortion in the cinematic pass when `isSupernovaFlashing` (offset UVs by `normalize(uv-0.5) * amp * falloff`), and (b) a noise-textured expanding shell (reuse `nebula.frag` techniques) instead of a bare torus.
10. **Kill dead visual code** (Section 6, C-items) — the unscaled `coronaMesh` radius-1.15 additive sphere inside every main-sequence star is pure mud on massive stars; remove it (the rim-shader corona right below it is the good one).
11. Optional polish: diffraction spikes on the brightest stars (billboard cross texture), pulsar beams as noise-faded volumetric cones with lighthouse timing, orbit path lines for planets, subtle camera-exposure shift when zooming from galaxy view to a star.

---

## 4. Bug List (functional)

| ID | Severity | File:Line | Bug | Fix |
|----|----------|-----------|-----|-----|
| B1 | **Critical** | `useSimulation.ts:48-58` | Worker timestep: cosmic mode = **3.3M years/step**, realtime = **16.7 years/step**. Velocity-Verlet needs ≲0.01 yr for a 1-yr orbit. Earth/Jupiter/Halley are flung to ~10⁷ AU in the first ticks → planets vanish, astrobiology gets garbage, WS broadcasts garbage. | Substep the worker: fixed dt (e.g. 2e-3 yr), N substeps/tick capped (e.g. 200), and drive *speed* by substep count, not dt. |
| B2 | **Critical** | `server.ts:943` | Express 5: `app.get('*', ...)` throws `Missing parameter name` (path-to-regexp v8) **at startup** in production. `npm start` (NODE_ENV=production) crashes on boot. | `app.get('/*splat', ...)` or replace with `app.use((req,res) => res.sendFile(...))`. |
| B3 | High | `useCosmicAge.ts:4` + `useSimulation.ts:359-363` | `cosmicAge` starts at 0 while `birthAge` ∈ [0.5, 10] Gyr → **every star is unborn/invisible at load**; the field only fully populates after ~50 s, then hard-resets (blink to empty) at 14 Gyr every ~70 s. | Start `cosmicAge` at ~5 Gyr; on reaching 14, fade or respawn birth epochs instead of snapping to 0. |
| B4 | High | `useSimulation.ts:323-339` | Raycaster tests `hitMesh` of **invisible** stars (`visible=false` for unborn stars / beyond `activeHeroStarCount`). Clicking empty space can select a star that doesn't exist visually. | Filter: `engine.heroStars.filter(h => h.visible && h.t >= 0).map(h => h.hitMesh)`. |
| B5 | High | `useSimulation.ts:500-532` | **Duplicate WS state broadcast** every 200 ms in two different message shapes. The first (`{type:'state', stellar_state, orbital_bodies...}`) is *ignored* by the server (it expects `data.data`) — pure wasted serialization/bandwidth. | Delete the first send; keep the `data`-shaped one. |
| B6 | High | `engine.ts:33-45` | `forceSupernova()` sets age to `τ_MS + 1` yr — but `computePhase` maps `age < 1.2·τ_MS` to **red_giant**, not supernova. Comment says "immediately trigger supernova"; it doesn't. | Use `age = τ_MS * 1.21` (and document the red-giant skip). |
| B7 | Medium | `MainSequencePhase.ts:229-235` | Planet "heal" after red-giant rewind resets `p.mesh.scale.setScalar(1.0)` — original scales were 0.2–0.45. Rewound planets come back permanently oversized. | Store `pScale` in `planetsInfo` and restore that. |
| B8 | Medium | `useSimulation.ts:399,408` | WS telemetry: `radius_solar` is always the main-sequence radius (`Math.pow(mass, 0.8)`) regardless of phase; `sim_time_yr = engine.appTime * 1e6` labels wall-clock *seconds* as millions of years. | Use `computeRadius(...)` from StellarPhysics; track a real sim-year accumulator. |
| B9 | Medium | `HeroStarSystem.ts:20-27` vs `StellarPhysics.computePhase` | **Two conflicting phase models.** Hero stars: MS ends at t=0.70; physics engine: MS ends at τ. Nebula is 1e-6 τ in one, 5% of life in the other. Low-mass stars visually get a "supernova" phase (green ring — presumably meant as a planetary nebula) and a *neutron-star-looking* remnant instead of a white dwarf. | Pick one authority (StellarPhysics, per its own module docs) and derive the visual timeline from it. Label the low-mass ejection as "Planetary Nebula" and give <8 M☉ remnants a white-dwarf visual (small hot white sphere, no pulsar beams). |
| B10 | Medium | `core/constants.ts:33` vs `StellarPhysics.computeLuminosity` | `MASS_LUMINOSITY_EXPONENT: 3.5` (used for HZ ring sizing) vs `L = M^4.0` Eddington in the physics engine — the visual HZ disagrees with the physics HZ. | Single source of truth: export one `computeLuminosity`. |
| B11 | Medium | `MainSequencePhase.ts:193-210` + `PlanetarySystem.ts` | **Two parallel planet systems** per star: 2 legacy `MeshStandardMaterial` planets (black per V3) + the 50-body instanced system. Double memory, double draw setup, conflicting visuals. | Delete the legacy loop; keep the instanced system (its custom shader is far better). |
| B12 | Low | `engine.ts:167` | Dark-matter slider drives **background-star opacity** (`0.1 + darkMatter*2`, unclamped > 1). Conceptually wrong — dark matter is invisible; and opacity > 1 is meaningless. | Clamp to 1; better: map dark matter to background-nebula density or galaxy rotation, not star brightness. |
| B13 | Low | `useSimulation.ts:411-521` | Astrobiology time accounting: `evaluatePlanet` is called at 5 Hz but receives the *frame* delta (≈3.3 Myr), so habitability time accrues ~12× slower than universe time — and keeps accruing **while paused**. | Pass the true elapsed sim time between calls (200 ms × rate); skip when `isPaused`. |
| B14 | Low | `CometSystem.ts:186` | `update(delta, ...)` — first arg is `deltaTime_yr` in *years* from the engine but is unused inside; harmless but confusing. Also comets orbit the origin (see roadmap #8). | Rename/clean signature; reparent. |
| B15 | Low | `nbodyWorker.ts:184-192` | "Zero-allocation" double buffer actually reallocates a `Float32Array` **every tick** after transfer; `setTimeout(16)` drifts; no NaN guard after B1-type blowups. | Reuse the two buffers properly (post back, or copy into a retained buffer); add a sanity clamp on positions. |
| B16 | Low | `SimStateSocket.ts:17` vs `useSimulation.ts:457` | `OrbitalState.velocity_au_yr` typed `{vx,vy,vz}` but the client sends `{x,y,z}`; `hz_status`/`sim_time_yr` never sent. Consumers reading `.vx` get `undefined`. | Align the shapes. |
| B17 | Low | `vite.config.ts:8` | `base: '/aethergenesis/'` breaks the Render deployment (served at root → all asset URLs 404 → blank page). It's correct for AI Studio embedding; wrong for `render.yaml`. | Make base env-dependent: `process.env.VITE_BASE_PATH || '/'`. |
| B18 | Low | `server.ts:513-803` | `/api/catalog/*` and `/api/horizons/*` have **no rate limit and no upstream timeout** — each request fans out to SIMBAD/JPL with Node fetch's (infinite) default timeout. | Add the same LRU limiter as `/api/analyze` + `AbortSignal.timeout(8000)`. |
| B19 | Low | `useWebSocket.ts:50-52` | `advance_1gyr` does `currentRealAge += 1000` (Myr — correct) but only on the *selected* star, while `engine.advanceTime(1e9)` advances the global physics star — two different stars' ages mutated. | Clarify intent; probably drop the manual `+= 1000`. |
| B20 | Nit | `HeroStarSystem.ts:149-155` | Hit sphere radius is a flat 8 world units regardless of star size; camera spawns at z=5 — clicks near the camera can select a star you're inside. | Scale hit radius with `baseRadius`, min ~2. |

---

## 5. Physics / Architecture Notes (non-blocking)

- **StellarPhysics.ts is genuinely good** — cited equations, pure functions, immutable state. The problem is it's *not actually the authority* its header claims: the visual timeline lives in `HeroStarSystem.getPhaseForT` with different boundaries (B9). Unify.
- Brown dwarfs (0.08–0.3 M☉) are rolled into the same lifecycle as stars and will "ignite" into a main sequence at 0xff3300 (M-class red) — acceptable stylization, but a brown-dwarf branch (never ignites, cools forever) would be a nice physics nod.
- `computePhase` for massive stars: MS → red_giant (τ–1.2τ) → supernova (1.2τ–1.5τ) → remnant. Real ≥8 M☉ stars go effectively straight from core H burning to core collapse; the 0.2τ red-giant linger is a simplification worth a comment.
- `AstrobiologyEngine` is a nice scoring model, but its inputs currently come from the broken worker (B1) — fix that first before tuning it.

---

## 6. Performance & Code Quality

- **Per-star unique geometry:** `MainSequencePhase` creates a *new* `SphereGeometry(baseRadius*1.15, 32, 32)` per star for the rim corona (~2 k verts each). At 600 stars on ultra that's 600 unique GPU buffers for what could be one shared unit sphere scaled by the mesh. Same for the pattern in general — audit `new THREE.*Geometry` inside `init()` methods.
- **Dead corona mesh:** `this.coronaMesh` uses shared `GEOMETRIES.corona` (radius 1.15) and is **never scaled by `baseRadius`** — for any star bigger than ~1.4 M☉ it sits *inside* the star as an invisible additive blob, and flatly wastes draw calls and fillrate. Unify or remove it.