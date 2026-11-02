# Rendering model exploration

**Date:** 2026-10-26
**Status:** Plan only. No shader or scene changes in this document.
**Shipping path:** WebGL 2, Three.js r184, `EffectComposer`. Touch devices stay capped at the medium tier until a change is measured there.

This is a map of rendering models worth trying, and of the smaller graphical upgrades that should land around them. It is not a request to build them all. Each item is one branch, measured against the picture we already have.

## What the renderer is today

`Pipeline` draws in this order:

1. Scene render
2. `UnrealBloomPass` (strength 0.85, radius 0.4, threshold 1.0, full resolution)
3. Cinematic pass: screen-space lens for one black hole, supernova shockwave, chromatic split, film grain, 25% vignette
4. `OutputPass` (ACES filmic and sRGB)

The cinematic grade runs in linear light, and ACES runs after it. Grain (`±0.012`) and the vignette are compressed by the tone map instead of being applied to the displayed image.

Each hero star owns six phase components. Only the active phase is visible. `StellarPhysics` is the clock (`τ_MS` boundaries in `STELLAR_CONSTANTS.PHASE_BOUNDARIES`). Visuals read that clock. They do not keep a second one.

| Phase | What is drawn |
| --- | --- |
| Nebula | Unit-sphere raymarch, fixed 24 steps, step 0.1, plus a dust point cloud |
| Protostar | Displaced photosphere, bipolar jets, flat `MeshBasicMaterial` disk |
| Main sequence | `starSurface` granulation, corona, flares, diffraction. `colorTempToRGB` writes one RGB into `uColor` every frame |
| Red giant | Same surface shader, pulsation, flares, planet scorch inside a damage radius |
| Supernova | Ejecta points, expanding ring, fullscreen shockwave while `isSupernovaFlashing` |
| Remnant | White dwarf (`≤ 8 M☉`), neutron star with beams (`> 8` and `< 15`), or black-hole disk, rear-disk arch, and polar jets (`≥ 15`) |

Around the star, `PlanetarySystem` instances up to the n-body roster with seven surface types (rocky, gas, ice, lava, ocean, desert, jungle), rings, and a custom light direction. Comets, a three-band asteroid belt, and the Dyson swarm are separate systems. The belt is still `MeshStandardMaterial`, so it depends on the 12-light cap in `Engine`.

Level of detail is one boolean: `distance² > 160000` (about 400 world units) sets `uLowDetail`, which drops star and planet noise octaves. Nebula step count, bloom resolution, belts, comets, and the corona are outside that switch.

Hero counts are already the capacity budget, from `getNumStarsForTier`:

| Tier | Hero stars | Who lands here |
| --- | --- | --- |
| Low | 100 | Fewer than 4 cores |
| Medium | 200 | 4+ cores, and every touch device |
| High | 400 | 6+ cores, desktop |
| Ultra | 600 | 8+ cores and device pixel ratio ≥ 2, desktop |

Pixel ratio is clamped at 2. The renderer is created with `antialias: true`, and the composer target does not request samples. In Three.js, context antialiasing does not cover an effect-composer target. Wave 0 confirms that before anyone turns it off.

## Rules for every branch

- One concern per branch. A model and an unrelated upgrade do not share a pull request.
- WebGL 2 remains the default. A WebGPU path ships off, behind a flag, and only as M9.
- Do not raise hero-star counts to buy image quality. Spend steps, bloom resolution, and level of detail.
- `StellarPhysics` stays the only phase authority. Mass gates stay `8 M☉` (supernova) and `15 M☉` (black hole).
- New materials set `customProgramCacheKey`. New `smoothstep` calls keep `edge0 < edge1`. Hot loops do not allocate.
- Every branch adds a source-contract test in the existing `scripts/e2e` style, and names the catalog preset used as the eye test.
- Eye-test presets already in `server/shared/stellarCatalog.mjs`: TRAPPIST-1, Sirius A, Betelgeuse, Cygnus X-1. Remnant classes also use `Engine.forceSupernova()` and a star under `8 M☉`.

## Models

These are new ways of producing a pixel. An upgrade further down only retunes the current way.

### M1 — Spectral limb

**Concept.** Temperature is a spectrum sampled at three wavelengths, not one display tint.

**Today.** `colorTempToRGB` already runs every frame and overwrites the mass-bin hex colors (those bins only seed the first frame, including the brown-dwarf magenta). The corona then mixes that single color toward white. Limb darkening darkens the same RGB.

**Try.** Evaluate the existing Planck function at 450, 550, and 650 nm, once per star per frame, into a `vec3`. Limb darkening uses a coefficient per sample so a cool star's limb goes redder, not just dimmer. The corona is a hotter blackbody than the photosphere, not a white mix. The core stays above 1.0 so the bloom threshold of 1.0 still isolates it. Bake a 64-entry LUT if the per-star math shows up in a profile. Do not build an 81-bin spectrum.

**Lands in.** `src/physics/math.ts`, `src/shaders/starSurface.frag.glsl`, `glowFS` in `src/rendering/shaders/stellar.ts`, the main-sequence, red-giant, and protostar phases.

**Eye test.** Betelgeuse: deep red limb, cooler than the disk center. Sirius A: blue-white limb that does not turn grey. Corona visibly hotter than the photosphere on both.

**Wave 2.** Shares the temperature function with M4.

### M2 — Layered atmosphere

**Concept.** A focused planet is a surface plus one thin shell. Everyone else stays a surface.

**Today.** `PLANET_FS` paints surface and rim in one pass. The rim color is chosen per type and is not optical depth.

**Try.** For the focused system only, add one transparent shell: Rayleigh scatter from the M1 samples (stronger to the blue, stronger at the limb), a thin Mie haze, and the existing cloud deck pushed out along the normal so it parallaxes. Gas giants keep a rim taken from their own albedo. Rocky worlds get a thin limb, not an Earth-blue one. Fifty shells are out of scope. If the extra draw misses the medium-tier budget, the shell is a quality flag defaulting off on low and medium.

**Lands in.** `src/rendering/systems/PlanetarySystem.ts`.

**Eye test.** TRAPPIST-1 e in focus: a thin limb and no copied Earth sky. An ocean-type world: blue limb brighter than the day side. A gas giant: ochre limb, not blue.

**Wave 4.** After M1, so the shell has samples to scatter.

### M3 — Volume budget

**Concept.** Gas is a shared step budget, not a 24-step march on every visible cloud.

**Today.** `src/shaders/nebula.frag.glsl` loops `i < 24` at `stepSize = 0.1` inside the unit sphere, with full `fbm`, for each visible nebula. Hero count and march count multiply.

**Try.** A uniform step cap: 8, 12, 16, 24 across low, medium, high, ultra. At most eight full marches in view; farther nebulae drop to the dust point cloud that already exists. Supernova ejecta glow and the planetary-nebula shell (U4) draw from the same counter. Keep the unit-sphere march. Do not introduce a 3D texture until the cap is measured and still looks banded.

**Lands in.** `nebula.frag.glsl`, `NebulaPhase.ts`, `HeroStarSystem.ts`, `src/utils/performance.ts`.

**Eye test.** One nearby collapsing cloud still has a hot core and a soft edge. A field of distant nebulae reads as points. Medium tier holds frame time within the band recorded in wave 0.

**Wave 3.** Numbers above are the starting cap, not a promise. Wave 0 can move them.

### M4 — Thin disk

**Concept.** A protostar disk and a black-hole disk are the same radiator, `T(r) ∝ r^-3/4`, with a different inner edge.

**Today.** The remnant disk already has logarithmic spiral turbulence, Doppler beaming, gravitational redshift, and an ISCO flare. The protostar disk is a flat colored ring.

**Try.** One shader. Inner cutoff is the dust sublimation radius for a protostar and the ISCO for a black hole. Outer radius and the existing Doppler and redshift terms stay uniforms. The protostar disk gets darker and cooler outward. The black-hole disk keeps the approaching-side beam.

**Lands in.** `RemnantPhase.ts`, `ProtostarPhase.ts`, a new `src/shaders/thinDisk.frag.glsl` if sharing through `stellar.ts` gets clumsy.

**Eye test.** Cygnus X-1: inner rim hotter than the outer disk, approaching side still bright. A protostar: dull red-orange disk, darker at the rim, not a flat orange band.

**Wave 2.** With M1.

### M5 — Render LOD contract

**Concept.** Every body class names three rungs. Missing rungs are explicit.

**Today.** `uLowDetail` covers star surfaces and planets. Belts, comets, the Dyson swarm, corona shells, and nebula steps do not consult it. The belt's standard material goes dark when it is not one of the 12 lit stars.

**Try.** One helper, `src/rendering/lod.ts`, with rungs far (point or billboard), mid (`uLowDetail`), and near (full shader). Each system declares which rungs it implements. The first consumer is the belt: an unlit rocky shader, the same family as planetary type 0, so it no longer needs a point light. That slice can ship early as U3.

**Lands in.** `lod.ts`, `AsteroidBeltSystem.ts`, `HeroStarSystem.ts`, `CometSystem.ts`, `DysonSwarmSystem.ts`.

**Eye test.** Fly from a star out through the belt. Rocks stay lit and rough as the 12 lights move to other stars. No black band, no pop from lit to unlit.

**Wave 5.** U3 may land in wave 1 without the helper, then fold into this contract.

### M6 — Optics catalog

**Concept.** Lensing is a list of at most two screen-space deflectors, not a new camera model.

**Today.** `Pipeline.updateLensing` tracks one remnant at phase 5 with mass `≥ 15`. The warp is a clamped higher-order `1/r` term in `cinematic.frag.glsl`, plus a photon-ring glow. It is not a geodesic integrator, and it should not become one.

**Try.** The pass takes a fixed array of length 2. Slot 0 is the focused black hole and must match today's image when it is the only lens. Slot 1 stays off. A later flag may draw a faint Einstein ring when a remnant crosses a bright background star inside a small pixel radius. Two warps are the ceiling.

**Lands in.** `src/rendering/pipeline.ts`, `src/shaders/cinematic.frag.glsl`, `src/core/engine.ts`.

**Eye test.** Cygnus X-1 matches the current shadow, photon ring, and beamed disk with slot 1 disabled. A second remnant in frame does not warp the picture.

**Wave 6.** After the grade split (U1), so lens math and display grade are no longer the same shader.

### M7 — Magnetosphere

**Concept.** A dipole you can see, and only up close, on worlds that should have one.

**Today.** Nothing draws field lines or aurora. The July 2026 audit item is still open. Planetary type is already on the instance.

**Try.** A handful of additive tubes on the focused ice or ocean world. Aurora is a high-latitude band in the M2 shell, brighter on the night side, scaled by stellar luminosity times a fixed magnetic moment. Rocky, lava, gas, desert, and jungle draw none. Skip the whole model if M2's extra draw already fails the medium tier.

**Lands in.** `PlanetarySystem.ts`.

**Eye test.** Focused ice world around Sirius A: ovals at high latitude. Focused lava world: no ovals and no tubes.

**Wave 4.** Depends on M2. Easy to delete.

### M8 — Galactic density

**Concept.** The far field is a disk. Hero stars are the resolved sample of that disk.

**Today.** The background is a gaussian point shader with twinkle, plus up to 600 hero stars. The navigation deck already talks about galactic scale. The image is still a starfield.

**Try.** One camera-facing plane, or two shells, with an exponential radial profile and a two-arm brightness wave. It shares the camera's orientation with the hero field so it does not drift. It fades out as you approach a hero star. No new n-body, no new star count.

**Lands in.** The background setup in `src/core/engine.ts`, and a small `src/rendering/systems/GalacticDisk.ts`.

**Eye test.** Wide view: a brighter plane and darker poles. Focused star: the disk drops under the hero and does not veil the photosphere.

**Wave 5.** With the LOD contract, since both are about what you see when you pull back.

### M9 — Compute particles

**Concept.** Dust motion can leave JavaScript. Drawing stays instanced. This is a gate, not a commitment.

**Today.** Comet tails, supernova ejecta, Dyson panels, and nebula dust update on the CPU. Ejecta velocities are already seeded with `mulberry32`.

**Try.** Only if wave 0 shows the particle update, rather than fragment shading, dominating ultra-tier frame time. A WebGPU compute shader advects those buffers. The WebGL 2 path remains the default and the tested one. Same seed must produce the same tail and the same ejecta cloud.

**Lands in.** A new optional module. `Engine` keeps the WebGL systems either way.

**Eye test.** A Halley-style comet and one `forceSupernova()` ejecta cloud, WebGL frame beside WebGPU frame, same seed.

**Wave 7.** Default outcome is to stop and not build it.

## Graphical upgrades

These do not introduce a model. They make the current one honest, and they give later models a stable picture to be compared with.

### U1 — Grade after the tone map

Split the cinematic pass. Lens warp, shockwave, and photon ring stay in linear light, before `OutputPass`. Grain and vignette move to a short pass after `OutputPass`, in display space. Retune the constants against a main-sequence star and Cygnus X-1 so the image is not crushed a second time. The constant chromatic split `(uv - 0.5) * 0.002` (U6) goes to zero when `uLensingStrength` is 0. Dispersion beside the photon ring stays.

**Lands in.** `pipeline.ts`, `cinematic.frag.glsl`, `src/shaders/grade.frag.glsl`.

### U2 — Bloom resolution and samples by tier

Half-resolution bloom on low and medium. Threshold stays 1.0 so only HDR cores bloom. After wave 0 confirms the context antialias flag is unused, set renderer `antialias` to false and request 4 samples on the composer target for high and ultra only. Low and medium stay at 0 samples.

**Lands in.** `pipeline.ts`, `engine.ts`, `usePerformanceAutoTuning.ts`.

### U3 — Unlit belt

Replace the belt's `MeshStandardMaterial` with an unlit rocky shader (planetary type 0's crater and mare logic, stripped of the atmosphere rim). Three Keplerian bands, shared geometry, and differential rates stay as they are. This is the first slice of M5 and may land alone.

**Lands in.** `AsteroidBeltSystem.ts`.

### U4 — Planetary nebula shell

`≤ 8 M☉` remnants are a warm white dwarf and, for the early remnant window only, a thin ejected shell drawn under the M3 budget. Then the shell fades and the dwarf remains. Do not restore a green ring. Neutron-star beams stay on `> 8` and `< 15`. Black holes stay `≥ 15`. The HUD names the shell window "Planetary Nebula" and the bare dwarf "White Dwarf".

**Lands in.** `RemnantPhase.ts`, `HeroStarSystem.ts`, the HUD phase label.

### U5 — Ion tail along the wind

Dust tails stay anti-sun and sheared by velocity. Ion tails bend along the radial wind from the parent star and keep the existing flicker. Activation bands and the Roche cutoff stay. No new particle count.

**Lands in.** `CometSystem.ts`.

### U6 — Aberration only while lensing

Folded into U1. Called out so it is not lost: a full-frame chromatic split on every ordinary frame is a lens artifact with no lens.

## Sequence

| Wave | Ships | Why this order | Done when |
| --- | --- | --- | --- |
| 0 | Measurement only | Later waves need a baseline | Four frame times written to `PROJECT-LOG.md`: wide field, focused main sequence, focused nebula, focused Cygnus X-1, medium tier. Draw calls and triangle counts from `renderer.info` (already reset each frame). No shader edits |
| 1 | U1, U2, U3, U6 | Raises the floor before new models change the picture | Grade is after ACES. Bloom is half-res on medium. Belt is visible with no point light on it. Cygnus X-1 lens still matches |
| 2 | M1, M4 | One temperature function for stars and disks | Betelgeuse limb and Sirius A limb read as temperature. Protostar disk cools outward. Cygnus X-1 inner disk stays hot and beamed |
| 3 | M3, U4 | Fill rate, then the missing low-mass death | Medium-tier nebula field stays inside the wave 0 band. A `< 8 M☉` remnant shows a shell, then a white dwarf. An `≥ 15 M☉` remnant is unchanged |
| 4 | M2, then M7 | Close-up planets, easy to disable | TRAPPIST-1 e limb is thin. Ice world has aurora. Lava world does not. Medium tier still holds, or the shell flag defaults off |
| 5 | M5, M8, U5 | How the field reads when you pull back | Belt survives the light cap. Galactic plane appears only in the wide view. Ion tail kinks, dust tail does not |
| 6 | M6 | Riskiest shader, after the grade split | Slot 0 matches today's Cygnus X-1. Slot 1 off produces no second warp |
| 7 | M9 or a stop | Only if wave 0 blamed CPU particle updates | Same seed, same tail, WebGL path still the default. Otherwise close the model |

Waves are ordered. They are not a promise to run all of them. A wave that misses the medium-tier band stops the next model that adds draws.

## What this plan will not do

- Path tracing, ReSTIR, or a second renderer beside Three.js.
- A rewrite of the phase classes or a second timeline next to `StellarPhysics`.
- An 81-bin spectrum, a GPU n-body, or more than two screen-space lenses.
- Atmosphere shells on all fifty planets.
- A return of the unscaled additive corona sphere, or of a green ring on low-mass stars.
- Raising the 100 / 200 / 400 / 600 hero caps.

## Acceptance, shared

A branch is ready when:

- `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` are clean.
- The new source-contract test fails if the uniform, the step cap, or the mass gate is reverted.
- The named preset still loads through the catalog path exercised by `scripts/e2e/f1_presets.test.ts`.
- Medium tier is the device that matters. Ultra is allowed to spend more steps. Low is allowed to spend fewer. Touch hardware does not get a desktop-only default.
