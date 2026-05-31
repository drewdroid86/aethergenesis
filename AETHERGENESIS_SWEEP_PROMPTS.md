# AetherGenesis: Bug Sweep & Missing Features
**Session Priority: Critical Fixes + Visual Completeness**
**Execute prompts in order. New Worktree for 1-4. Local Mode for 5.**

---

## PROMPT 1 — Bug Sweep & Diagnostic

**Mode:** New Worktree
**Scope:** Read and diagnose only. No fixes yet.

```
Read these files completely before doing anything else:
  src/rendering/systems/CometSystem.ts
  src/rendering/systems/PlanetarySystem.ts
  src/rendering/systems/HeroStarSystem.ts
  src/simulation/AstrobiologyEngine.ts
  src/simulation/StellarPhysics.ts
  src/core/engine.ts

Diagnose the following six known issues and report findings
for each. Do not fix anything yet.

ISSUE 1: Comets not visible in simulation
  - Is CometSystem.ts being instantiated in engine.ts?
  - Is update() being called every frame?
  - Are comets being added to the Three.js scene?
  - Is the coma/tail shader receiving the star position uniform?
  - Are comet positions within the camera frustum?
  Report: exact line where CometSystem is initialized,
  or confirm it is missing entirely.

ISSUE 2: City lights not visible on planet night side
  - Does PlanetarySystem.ts pass a u_starDirection uniform
    to the planet fragment shader?
  - Is there a night-side masking step using dot(normal, starDir)?
  - Is the city lights texture/procedural layer present?
  - At what Kardashev tier do lights activate?
  Report: the exact uniform name and the line it is set,
  or confirm the night-side branch is missing.

ISSUE 3: Dyson Swarm not rendering at Kardashev Type II
  - Is DysonSwarm geometry created in HeroStarSystem.ts
    or a separate file?
  - Is it added to the scene?
  - What Kardashev threshold triggers it?
  - Is the biomass score from AstrobiologyEngine reaching
    the rendering layer?
  Report: exact file and line, or confirm it is missing.

ISSUE 4: FPS dropping to 24-25 on mobile at 600 stars
  - How many draw calls does the current scene make?
  - Is the N-body worker posting back at 60Hz or higher?
  - Are any per-frame object creations happening
    (new Vector3, new Color inside the render loop)?
  - Is frustum culling active on background stars?
  Report: the three most expensive operations per frame.

ISSUE 5: Habitability showing 100% on Planet 1 immediately
  - The ageScore requires system age > 1 Gyr for full score.
  - Is age_yr being passed correctly from StellarPhysics.ts
    to AstrobiologyEngine.ts?
  - Is the composite score a weighted product or a sum?
  Report: the compositeScore formula as currently implemented.

ISSUE 6: Missing space phenomena
  List which of these are completely absent from the codebase:
  - Asteroid belt (instanced rock geometry)
  - Nebula emission lines
  - Binary star system support
  - Gravitational lensing shader on black holes
  - Pulsar beam effect on neutron stars
  - Solar flares on main sequence stars
  - Accretion disk on black holes
  - Galaxy background (Milky Way band)
  Report: present / absent for each item above.

After completing all six diagnostics, write a summary report
to: docs/SWEEP_REPORT.md

Do not fix anything. Report only.
```

---

## PROMPT 2 — Fix Comets

**Mode:** New Worktree
**Scope:** Make comets visible. Based on SWEEP_REPORT findings.

```
Read docs/SWEEP_REPORT.md first.
Read src/rendering/systems/CometSystem.ts in full.
Read src/core/engine.ts in full.

Fix the comet visibility issue. Comets must:

1. INITIALIZATION
   If CometSystem is not instantiated in engine.ts, add it:
     const cometSystem = new CometSystem(scene, camera)
   Call cometSystem.update(deltaTime, stellarState) every frame
   inside the render loop after physics step.

2. ORBITAL DATA
   Seed 5 comets with these real orbital parameters from
   NASA Horizons (hardcoded for now, MCP will update later):
   
   Halley (1P):
     semi_major_axis_au: 17.8, eccentricity: 0.967,
     inclination_deg: 162.3, period_yr: 75.3
   
   Hale-Bopp (C/1995 O1):
     semi_major_axis_au: 186.0, eccentricity: 0.995,
     inclination_deg: 89.4, period_yr: 2520.0
   
   Churyumov (67P):
     semi_major_axis_au: 3.46, eccentricity: 0.641,
     inclination_deg: 7.04, period_yr: 6.44
   
   Encke (2P):
     semi_major_axis_au: 2.22, eccentricity: 0.848,
     inclination_deg: 11.8, period_yr: 3.30
   
   Swift-Tuttle (109P):
     semi_major_axis_au: 26.0, eccentricity: 0.963,
     inclination_deg: 113.4, period_yr: 130.0

3. COMA RENDERING
   Coma activates when distance_from_star_au < 3.0
   Render as: billboard sprite with Gaussian falloff
   Color: white-cyan (rgb 0.9, 0.95, 1.0)
   Size scales with 1/distance_from_star_au

4. TAIL RENDERING
   Ion tail: points directly away from star
     tail_direction = normalize(comet_pos - star_pos)
   Dust tail: curves 15 degrees from ion tail
     along the orbital velocity vector
   Both render as elongated billboard quads
   Length scales with solar wind intensity (proxy: 1/distance²)
   Ion tail color: blue-white (0.7, 0.8, 1.0)
   Dust tail color: warm white (1.0, 0.95, 0.8)

5. SCALE
   Comets must be visible from the simulation camera distance.
   Scale the visual size up by 50x from physical size —
   this is the standard "smoke and mirrors" approach.
   Tag these lines with: // AESTHETIC: scaled for visibility

After fixing:
- Run tsc --noEmit. Report results.
- Confirm CometSystem.update() is called inside a try/catch
  that never stops the animation loop.
```

---

## PROMPT 3 — Fix City Lights + Dyson Swarm

**Mode:** New Worktree
**Scope:** Night side city lights and Dyson Swarm visibility.

```
Read docs/SWEEP_REPORT.md first.
Read src/rendering/systems/PlanetarySystem.ts in full.
Read src/simulation/AstrobiologyEngine.ts in full.

FIX 1: Night side city lights

The planet fragment shader must receive the star direction
and use it to mask city lights to the dark hemisphere only.

In PlanetarySystem.ts, ensure the planet ShaderMaterial has:
  uniforms: {
    u_starPosition: { value: new THREE.Vector3() },
    u_biomass: { value: 0.0 },
    u_kardashevTier: { value: 0 },
    u_time: { value: 0.0 }
  }

Update these uniforms every frame:
  material.uniforms.u_starPosition.value.copy(starWorldPosition)
  material.uniforms.u_biomass.value = astrobiologyState.biomass
  material.uniforms.u_kardashevTier.value = 
    astrobiologyState.kardashevTier

In the planet fragment shader, add this logic:
  // Night side masking
  vec3 starDir = normalize(u_starPosition - vWorldPosition);
  float dayFactor = dot(normalize(vNormal), starDir);
  float nightMask = 1.0 - smoothstep(-0.1, 0.2, dayFactor);
  
  // City lights (Kardashev Type I+)
  if (u_kardashevTier >= 1) {
    float cityNoise = hash(floor(vUv * 80.0));
    float cityLights = step(0.85, cityNoise) * nightMask;
    fragColor.rgb += vec3(1.0, 0.85, 0.4) * cityLights
                     * u_biomass * 2.0;
  }

City lights must ONLY appear where nightMask > 0.
They must NOT appear on the day side under any circumstance.

FIX 2: Dyson Swarm at Kardashev Type II

If DysonSwarm geometry does not exist, create it in
src/rendering/systems/DysonSwarmSystem.ts:

  export class DysonSwarmSystem {
    private swarm: THREE.InstancedMesh
    
    constructor(scene: THREE.Scene) {
      // 200 instanced ring segments orbiting the star
      const geometry = new THREE.TorusGeometry(2.0, 0.02, 4, 32)
      const material = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.6
      })
      this.swarm = new THREE.InstancedMesh(geometry, material, 200)
      // Distribute rings at random inclinations around star
      // Each ring gets a random rotation axis
      for (let i = 0; i < 200; i++) {
        const matrix = new THREE.Matrix4()
        matrix.makeRotationFromEuler(new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        ))
        this.swarm.setMatrixAt(i, matrix)
      }
      this.swarm.visible = false
      scene.add(this.swarm)
    }
    
    update(kardashevTier: number, time: number): void {
      this.swarm.visible = kardashevTier >= 2
      if (this.swarm.visible) {
        // Slowly rotate each segment
        this.swarm.rotation.y = time * 0.01
        this.swarm.instanceMatrix.needsUpdate = true
      }
    }
    
    dispose(): void {
      this.swarm.geometry.dispose()
      ;(this.swarm.material as THREE.Material).dispose()
    }
  }

Wire DysonSwarmSystem into engine.ts:
  - Instantiate after scene is created
  - Call update(kardashevTier, elapsedTime) every frame
  - Dispose on cleanup

Run tsc --noEmit. Report results.
```

---

## PROMPT 4 — Add Missing Space Phenomena

**Mode:** New Worktree  
**Scope:** Add the phenomena confirmed absent in SWEEP_REPORT.

```
Read docs/SWEEP_REPORT.md.
Add whichever of these are confirmed ABSENT. Skip present ones.

PHENOMENON 1: Pulsar Beam (Neutron Star)
In RemnantPhase.ts, when remnantType === 'neutron_star':
  Add two opposing beam cylinders along the rotation axis
  Material: emissive cyan (0.0, 0.8, 1.0), additive blending
  Animate: rotate rapidly (period ~0.033s = 30Hz pulsar)
  Scale: beam length 50 units, width 0.1 units
  Tag: // AESTHETIC: scaled 10^12x for visibility

PHENOMENON 2: Accretion Disk (Black Hole)
In RemnantPhase.ts, when remnantType === 'black_hole':
  Add a flat torus geometry around the black hole
  Inner radius: schwarzschildRadius_km * 3 (ISCO)
  Outer radius: inner * 6
  Material: temperature gradient shader
    inner color: white-blue (hot, near ISCO)
    outer color: orange-red (cooler, farther out)
  Animate: rotate, inner faster than outer (differential rotation)
    inner angular velocity: 2.0 rad/s
    outer angular velocity: 0.3 rad/s
  Add gravitational lensing distortion:
    In the fragment shader, offset UV coordinates radially
    by: 1.0 / (distance_from_center * distance_from_center)
    This fakes light bending near the Schwarzschild radius.
    Tag: // SMOKE AND MIRRORS: faked lensing via UV distortion

PHENOMENON 3: Solar Flares (Main Sequence)
In HeroStarSystem.ts, for main_sequence phase:
  Spawn a flare event randomly every 30-120 seconds
  Render as: elongated billboard quad extending from star surface
  Color: matches star temperature (colorTempToRGB(temperature_K))
  Animation: extends to 2x star radius over 2s, fades over 3s
  Direction: random point on star hemisphere
  Max 3 simultaneous flares

PHENOMENON 4: Asteroid Belt
Create src/rendering/systems/AsteroidBeltSystem.ts:
  10,000 instanced small meshes (IcosahedronGeometry radius 0.02)
  Distributed in a torus between 2.0 and 3.5 AU from star
  Random inclinations within ±5 degrees of ecliptic
  Slow orbital motion (period scales with √(a³/GM))
  Color: grey-brown (0.5, 0.4, 0.3)
  No physics — purely visual, Keplerian approximation only
  Wire into engine.ts update loop

PHENOMENON 5: Nebula Emission Lines
In the nebula phase fragment shader (nebula.frag.glsl):
  Add three emission line colors as additive layers:
    Hydrogen-alpha: rgb(1.0, 0.1, 0.1) — red
    Oxygen-III: rgb(0.1, 0.9, 0.8) — blue-green  
    Sulfur-II: rgb(0.9, 0.2, 0.0) — deep red
  Each line is a thin band at a specific noise frequency
  Opacity: 0.3 each, additive blending
  This creates the Hubble Palette look

For ALL new geometry:
  - Store reference for disposal
  - Call .dispose() on geometry and material when phase changes
  - Never create new geometry inside the render loop
  - Wrap all updates in try/catch that never stops the loop

Run tsc --noEmit after all additions. Report results.
```

---

## PROMPT 5 — FPS Optimization Pass

**Mode:** Local Mode
**Scope:** Performance only. No new features.

```
Read src/core/engine.ts in full.
Read src/rendering/systems/ directory listing.

Perform these five optimizations exactly:

OPTIMIZATION 1: Object pooling for Vector3
  Scan all files in src/rendering/systems/ for:
    new THREE.Vector3() inside any update() method
    new THREE.Color() inside any update() method
    new THREE.Matrix4() inside any update() method
  For each found: move the allocation to the constructor
  as a class property. Reuse it each frame with .set() or .copy()
  Report: every file and line where this was fixed.

OPTIMIZATION 2: Frustum culling on background stars
  In the instanced star field system, confirm:
    frustumCulled = true on the InstancedMesh
  If it is false or missing, set it to true.
  For stars beyond 500 units from camera, reduce their
  instance opacity to 0 rather than removing them.

OPTIMIZATION 3: N-body worker message rate
  In src/simulation/nbodyWorker.ts:
  The worker should post results at maximum 30Hz, not 60Hz.
  Add a frame skip: only postMessage every 2nd physics step.
  The visual interpolation between frames handles the gap.
  This halves the main thread message overhead.

OPTIMIZATION 4: Shader uniform batching
  In PlanetarySystem.ts update():
  All uniform updates for all planets should happen in
  one loop, not multiple separate loops.
  Consolidate into a single pass per frame.

OPTIMIZATION 5: Dispose audit
  Run this check across all rendering system files:
  Any THREE.Mesh, InstancedMesh, or Points created in a
  constructor must have a corresponding dispose() call
  in a cleanup() or dispose() method on the same class.
  List any missing dispose() calls found.
  Add the missing ones.

After all optimizations:
  Run tsc --noEmit. Report results.
  Report estimated draw call reduction from Optimization 1-4.
```

---

## What This Session Delivers

After these 5 prompts AetherGenesis will have:

| Feature | Status After Session |
|---|---|
| Halley, Hale-Bopp, 67P comets | ✓ Visible with real orbital data |
| City lights on night side only | ✓ Normal-vector masked |
| Dyson Swarm at Kardashev II | ✓ 200 instanced ring segments |
| Pulsar beam (neutron star) | ✓ Animated cyan beams |
| Accretion disk (black hole) | ✓ Faked lensing shader |
| Solar flares | ✓ Random eruptions |
| Asteroid belt | ✓ 10,000 instanced rocks |
| Nebula emission lines | ✓ Hubble Palette GLSL |
| FPS on mobile | Target 45-60 FPS |
