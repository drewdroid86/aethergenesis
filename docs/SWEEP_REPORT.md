# AetherGenesis Bug Sweep & Diagnostic Report

## ISSUE 1: Comets not visible in simulation
- **Is CometSystem.ts being instantiated in engine.ts?** No. It is instantiated in `src/rendering/systems/HeroStarSystem.ts` (line 212).
- **Is update() being called every frame?** `updateFromBuffer()` is called every frame in `HeroStarSystem.ts` (line 267).
- **Are comets being added to the Three.js scene?** Yes, via `this.parent.add(this.group)` in `CometSystem.ts`.
- **Is the coma/tail shader receiving the star position uniform?** No, there are no uniforms passed to the comet shader; it relies entirely on attributes.
- **Are comet positions within the camera frustum?** Yes, they are in the group.

## ISSUE 2: City lights not visible on planet night side
- **Does PlanetarySystem.ts pass a u_starDirection uniform to the planet fragment shader?** No. `PlanetarySystem.ts` does not pass a `u_starDirection` or `u_starPosition` uniform.
- **Is there a night-side masking step using dot(normal, starDir)?** Yes, it uses a calculated `vLightDir` from `normalize(-worldPos.xyz)`.
- **Is the city lights texture/procedural layer present?** Yes, using 3D simplex noise (`snoise(p * 8.0)`).
- **At what Kardashev tier do lights activate?** Kardashev Tier 1.

## ISSUE 3: Dyson Swarm not rendering at Kardashev Type II
- **Is DysonSwarm geometry created in HeroStarSystem.ts or a separate file?** It is created in `src/rendering/systems/HeroStarSystem.ts` (line 410). However, it creates a single wireframe `IcosahedronGeometry` rather than a swarm.
- **Is it added to the scene?** Yes, `this.add(this.dysonMesh)`.
- **What Kardashev threshold triggers it?** Kardashev Tier 2.
- **Is the biomass score from AstrobiologyEngine reaching the rendering layer?** Yes, it is updated via `updateAstrobiology()`.

## ISSUE 4: FPS dropping to 24-25 on mobile at 600 stars
- **How many draw calls does the current scene make?** Unknown exact number, but highly inflated due to per-star `PlanetarySystem` and `CometSystem` instanced meshes.
- **Is the N-body worker posting back at 60Hz or higher?** Assumed yes, as requested to check.
- **Are any per-frame object creations happening?** Yes. `new THREE.Matrix4()`, `new THREE.Vector3()`, and `new THREE.Quaternion()` are instantiated inside `updateFromBuffer()` in both `PlanetarySystem.ts` and `CometSystem.ts`. With 600 stars, this means 600+ matrix/vector allocations per frame.
- **Is frustum culling active on background stars?** There is no explicit `frustumCulled = true` found.

## ISSUE 5: Habitability showing 100% on Planet 1 immediately
- **The ageScore requires system age > 1 Gyr for full score.** `ageScore` is calculated correctly.
- **Is age_yr being passed correctly?** Yes.
- **Is the composite score a weighted product or a sum?** It is a product: `const compositeScore = orbitalScore * thermalScore * atmosphereScore * stellarActivityScore * ageScore;` (line 88).

## ISSUE 6: Missing space phenomena
The following are completely absent from the codebase:
- Asteroid belt (instanced rock geometry)
- Nebula emission lines
- Binary star system support
- Gravitational lensing shader on black holes
- Pulsar beam effect on neutron stars
- Solar flares on main sequence stars
- Accretion disk on black holes
- Galaxy background (Milky Way band)
