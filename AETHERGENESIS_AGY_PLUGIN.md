# AetherGenesis: Antigravity 2.0 Plugin Implementation
**Runtime: `agy` (Antigravity CLI)**
**Model: Gemini 3.5 Flash**
**Architecture: Native Plugin Bundle with MCP Servers + Agent Skills**

---

## Overview

This document builds AetherGenesis tooling as a first-class Antigravity
2.0 Plugin — not just loose MCP servers. A Plugin bundles MCP configs,
Agent Skills, hooks, and rules into one versioned directory the agent
resolves automatically across all sessions.

**Final plugin structure:**
```
.agents/plugins/aethergenesis/
├── plugin.json                    # Plugin manifest
├── mcp_config.json                # All three MCP server definitions
├── hooks.json                     # Physics tick + phase transition hooks
├── skills/
│   ├── stellar-physics/
│   │   └── SKILL.md
│   ├── orbital-mechanics/
│   │   └── SKILL.md
│   ├── astrobiology/
│   │   └── SKILL.md
│   └── shader-optimization/
│       └── SKILL.md
└── rules/
    ├── animation-loop-safety.md
    ├── physics-first.md
    └── typescript-hygiene.md
```

**Execute prompts in order. Each is a bounded subagent task.**
**Do not merge prompts. Do not skip prompts.**
**Use New Worktree mode for Prompts 1–6. Local Mode for 7–8.**

---

## PROMPT 1 — Plugin Scaffold & Manifest

**Mode:** New Worktree
**Scope:** Create directory structure and plugin.json only.

```
Create the AetherGenesis Antigravity 2.0 plugin scaffold.

Create this exact directory tree from the repository root:

  .agents/plugins/aethergenesis/plugin.json
  .agents/plugins/aethergenesis/hooks.json
  .agents/plugins/aethergenesis/skills/stellar-physics/SKILL.md
  .agents/plugins/aethergenesis/skills/orbital-mechanics/SKILL.md
  .agents/plugins/aethergenesis/skills/astrobiology/SKILL.md
  .agents/plugins/aethergenesis/skills/shader-optimization/SKILL.md
  .agents/plugins/aethergenesis/rules/animation-loop-safety.md
  .agents/plugins/aethergenesis/rules/physics-first.md
  .agents/plugins/aethergenesis/rules/typescript-hygiene.md

FILE: .agents/plugins/aethergenesis/plugin.json
Content:
{
  "name": "aethergenesis",
  "version": "1.0.0",
  "description": "AetherGenesis scientific stellar simulation platform. Provides physics engine tools, MCP server connections to NASA Horizons and stellar catalogs, live simulation state access, and agent skills for astrophysics, orbital mechanics, astrobiology, and WebGL shader optimization.",
  "author": "AetherGenesis",
  "skills": [
    "skills/stellar-physics",
    "skills/orbital-mechanics",
    "skills/astrobiology",
    "skills/shader-optimization"
  ],
  "rules": [
    "rules/animation-loop-safety.md",
    "rules/physics-first.md",
    "rules/typescript-hygiene.md"
  ],
  "mcpConfig": "mcp_config.json",
  "hooks": "hooks.json"
}

FILE: .agents/plugins/aethergenesis/hooks.json
Content:
{
  "onFileChange": [
    {
      "pattern": "src/simulation/StellarPhysics.ts",
      "action": "run_skill",
      "skill": "stellar-physics",
      "prompt": "A change was made to StellarPhysics.ts. Verify all equations still have citations. Check that no phase transition uses a timer. Run tsc --noEmit and report results."
    },
    {
      "pattern": "src/rendering/**/*.ts",
      "action": "run_skill",
      "skill": "shader-optimization",
      "prompt": "A rendering file changed. Verify no shader uniform is being set without a corresponding StellarState source field. Check for any Three.js geometry created without a paired dispose() call."
    },
    {
      "pattern": "src/core/engine.ts",
      "action": "enforce_rule",
      "rule": "animation-loop-safety.md",
      "prompt": "engine.ts was modified. Scan for any cancelAnimationFrame call inside a catch block. Scan for any await or Promise inside the physics tick function. Report violations immediately."
    }
  ],
  "onPhaseTransition": {
    "action": "mcp_broadcast",
    "server": "aethergenesis-sim",
    "tool": "get_phase_history"
  }
}

Leave all SKILL.md and rules/*.md files empty for now.
They are populated in subsequent prompts.

After creating all files, run:
  agy plugin list
Expected: aethergenesis plugin listed as loaded.
Report the exact output.
```

---

## PROMPT 2 — MCP Server Configuration

**Mode:** New Worktree
**Scope:** Create mcp_config.json inside the plugin only.

```
Create the file:
  .agents/plugins/aethergenesis/mcp_config.json

This registers all three AetherGenesis MCP servers using the full
Antigravity 2.0 configuration property set.

Content:
{
  "mcpServers": {
    "nasa-horizons": {
      "command": "node",
      "args": ["server/mcp/nasa-horizons.mjs"],
      "env": {
        "HORIZONS_BASE_URL": "https://ssd.jpl.nasa.gov/api/horizons.api"
      },
      "disabled": false,
      "disabledTools": []
    },
    "stellar-catalog": {
      "command": "node",
      "args": ["server/mcp/stellar-catalog.mjs"],
      "env": {
        "SIMBAD_BASE_URL": "https://simbad.u-strasbg.fr/simbad/sim-tap/sync",
        "HYG_CATALOG_PATH": "server/data/hyg_v3.json"
      },
      "disabled": false,
      "disabledTools": []
    },
    "aethergenesis-sim": {
      "command": "node",
      "args": ["server/mcp/sim-state.mjs"],
      "env": {
        "SIM_PORT": "3001",
        "SIM_HOST": "localhost"
      },
      "disabled": false,
      "disabledTools": ["trigger_simulation_event"]
    }
  }
}

Note on disabledTools for aethergenesis-sim:
trigger_simulation_event is disabled by default for safety.
To enable agent-directed scenario testing, the developer must
explicitly remove it from disabledTools in this file.
This prevents the agent from accidentally triggering force_supernova
or reset during a live research session.

After writing the file, run:
  agy mcp list
Expected: All three servers listed. trigger_simulation_event
should appear as disabled in the aethergenesis-sim tool list.
Report exact output.
```

---

## PROMPT 3 — NASA Horizons MCP Server

**Mode:** New Worktree
**Scope:** Create server/mcp/nasa-horizons.mjs only.

```
Create the file `server/mcp/nasa-horizons.mjs`.

This is a stdio-transport MCP server (Node.js ESM) wrapping the
NASA JPL Horizons API. It is the authoritative source of real
comet and small body orbital data for AetherGenesis.

TOOL 1: get_orbital_elements
  Description: Returns Keplerian orbital elements for any solar system
  body by NAIF ID or common name. This is the data source for
  OrbitalMechanics.ts. All values are real, not approximated.
  Input:
    body_id: string  (e.g. "1P" for Halley, "67P" for Churyumov,
                          "Hale-Bopp", "Ceres", "433" for Eros)
    epoch: string ISO date (default "2000-01-01")
  Output:
    body_name: string
    naif_id: string
    semi_major_axis_au: number
    eccentricity: number
    inclination_deg: number
    longitude_ascending_node_deg: number
    argument_perihelion_deg: number
    mean_anomaly_deg: number
    period_yr: number | null
    aphelion_au: number | null
    perihelion_au: number | null
    source: "NASA JPL Horizons"
    horizons_url: string  (the exact URL used to retrieve this data)

TOOL 2: get_ephemeris
  Description: Returns time-series position and velocity vectors for
  a body. Seeds OrbitalMechanics.ts with real trajectories instead
  of Keplerian approximations. Used for comet path visualization.
  Input:
    body_id: string
    start_date: string ISO
    stop_date: string ISO
    step_size: string  (e.g. "1d", "30d", "1y")
    center: string  (default "500@0" = solar system barycenter)
  Output: array of {
    date: string
    x_au, y_au, z_au: number    (J2000 ecliptic heliocentric)
    vx_km_s, vy_km_s, vz_km_s: number
    delta_au: number            (distance from Sun)
    lighttime_min: number
  }

TOOL 3: search_small_bodies
  Description: Returns catalog of comets or asteroids for populating
  the AetherGenesis small body system. Comets include coma and tail
  onset distances derived from perihelion distance.
  Input:
    type: "comet" | "asteroid" | "all"
    limit: number (max 50, default 20)
  Output: array of {
    naif_id: string
    name: string
    type: "comet" | "asteroid"
    period_yr: number | null
    eccentricity: number
    perihelion_au: number
    inclination_deg: number
    coma_onset_au: number | null  (comets only, ~3 AU typical)
    tail_onset_au: number | null  (comets only, ~2.5 AU typical)
  }

IMPLEMENTATION:
- Transport: @modelcontextprotocol/sdk/server/stdio.js
- Horizons GET endpoint:
  https://ssd.jpl.nasa.gov/api/horizons.api?format=json
- For get_orbital_elements use: EPHEM_TYPE=ELEMENTS
- For get_ephemeris use: EPHEM_TYPE=VECTORS, OUT_UNITS=AU-D
- Parse the JSON response. Orbital elements are in result.result
  as plain text. The data block is between $$SOE and $$EOE markers.
- For search_small_bodies, use the SB Search API:
  https://ssd-api.jpl.nasa.gov/sbdb_query.api
- Handle errors: return { error: string, code: number } never throw.
- Add JSDoc above each tool with the Horizons API reference URL.
- Server init: new Server({ name: "nasa-horizons", version: "1.0.0" })

Start the server after writing:
  node server/mcp/nasa-horizons.mjs

Test with:
  agy mcp call nasa-horizons get_orbital_elements '{"body_id":"1P"}'

Expected: Halley's Comet data with period ~75.3 yr, eccentricity ~0.967
Report exact JSON output received.
```

---

## PROMPT 4 — Stellar Catalog MCP Server

**Mode:** New Worktree
**Scope:** Create server/mcp/stellar-catalog.mjs only.

```
Create the file `server/mcp/stellar-catalog.mjs`.

This is a stdio-transport MCP server wrapping SIMBAD TAP queries
and a hardcoded preset library sourced from verified astrophysics
literature. It is the source of real stellar parameters for
StellarPhysics.ts presets.

TOOL 1: search_stars
  Description: Query real stars by physical parameters via SIMBAD.
  Input:
    spectral_class: string optional  (e.g. "G2", "M5", "K5")
    mass_min_solar: number optional
    mass_max_solar: number optional
    distance_max_ly: number optional
    limit: number (default 10, max 20)
  Output: array of {
    name: string
    hip_id: number | null
    spectral_class: string
    mass_solar: number
    luminosity_solar: number
    temperature_K: number
    radius_solar: number
    distance_ly: number
    metallicity_Z: number | null
    source: "SIMBAD"
  }

TOOL 2: get_star_by_name
  Description: Full physical profile for a named star. Used to
  initialize StellarPhysics.ts with real validated parameters.
  Input:
    name: string  (e.g. "Betelgeuse", "Proxima Centauri")
  Output: all fields from search_stars plus:
    age_gyr: number | null
    known_planets: number | null
    habitable_zone_inner_au: number | null  (Kopparapu 2013)
    habitable_zone_outer_au: number | null  (Kopparapu 2013)
    chandrasekhar_relevant: boolean  (true if M > 0.8 M☉)
    literature_reference: string  (e.g. "Carroll & Ostlie §13.2")

TOOL 3: get_exoplanet_systems
  Description: Returns confirmed habitable zone systems for seeding
  AstrobiologyEngine.ts with real reference comparisons.
  Input:
    esi_min: number (Earth Similarity Index, 0.0–1.0, default 0.7)
    limit: number (default 10)
  Output: array of {
    star_name: string
    star_mass_solar: number
    star_temperature_K: number
    planet_name: string
    planet_semi_major_axis_au: number
    earth_similarity_index: number
    in_habitable_zone: boolean
    source: "NASA Exoplanet Archive"
  }

TOOL 4: get_preset_library
  Description: Returns the complete AetherGenesis built-in star
  preset library. All values are hardcoded from verified sources.
  No network call. Always available even if SIMBAD is down.
  No input required.
  Output: array of 10 preset objects for these stars:
    Sun (G2V)
    Proxima Centauri (M5Ve)
    Sirius A (A1V)
    Betelgeuse (M2Iab)
    Kepler-442 (K5V)
    Eta Carinae (LBV)
    61 Cygni A (K5V)
    Tau Ceti (G8V)
    Vega (A0V)
    Rigel (B8Ia)

  Each object includes: name, spectral_class, mass_solar,
  luminosity_solar, temperature_K, radius_solar, metallicity_Z,
  distance_ly, literature_reference.

  Hardcode the values. Add a JSDoc comment on each entry citing
  the source (Carroll & Ostlie, SIMBAD record, or observational paper).

IMPLEMENTATION:
- Transport: @modelcontextprotocol/sdk/server/stdio.js
- SIMBAD TAP ADQL queries via HTTP GET to:
  https://simbad.u-strasbg.fr/simbad/sim-tap/sync?REQUEST=doQuery
  &LANG=ADQL&FORMAT=json&QUERY=<url-encoded ADQL>
- If SIMBAD returns an error or times out (>5s), fall back to
  get_preset_library data and set source: "cached_preset".
- All numeric fields must use named units in the key
  (mass_solar not mass, temperature_K not temperature).
- Server init: new Server({ name: "stellar-catalog", version: "1.0.0" })

Test after writing:
  agy mcp call stellar-catalog get_preset_library '{}'
Expected: Array of 10 stars, all fields populated.
Report the Sun entry in full.
```

---

## PROMPT 5 — Simulation State MCP Server + WebSocket Bridge

**Mode:** New Worktree
**Scope:** Create server/mcp/sim-state.mjs and src/simulation/SimStateSocket.ts

```
Create two files.

--- FILE 1: server/mcp/sim-state.mjs ---

stdio-transport MCP server that connects to the live AetherGenesis
Vite dev server via WebSocket on localhost:3001. Exposes live
simulation state to the agent runtime.

TOOL 1: get_stellar_state
  Description: Live authoritative physics state of the hero star.
  Used by Gemini to ground all astrophysics explanations in real
  computed values before generating responses.
  Input: { star_id: string (default "hero_star") }
  Output: full StellarState {
    id, initialMass_solar, metallicity_Z,
    age_yr, mass_solar, luminosity_solar,
    radius_solar, temperature_K, phase,
    spectralClass, absoluteMagnitude,
    hrPosition: { logT: number, logL: number },
    remnantType?: string,
    schwarzschildRadius_km?: number,
    sim_time_yr: number
  }

TOOL 2: get_habitability_scores
  Description: Live AstrobiologyEngine scores for all planets.
  Gemini uses these to answer habitability questions with real numbers.
  Input: { planet_id: string | "all" }
  Output: array of {
    planet_id, orbitalScore, thermalScore,
    atmosphereScore, stellarActivityScore,
    ageScore, compositeScore,
    isInHabitableZone, hasLiquidWater,
    extinctionRiskLevel,
    sim_time_yr: number
  }

TOOL 3: get_phase_history
  Description: Timestamped log of every phase transition.
  Answers: "when did this star leave the main sequence."
  Input: { star_id: string }
  Output: array of {
    phase, triggered_at_yr,
    trigger_condition,
    duration_yr: number | null,
    sim_time_yr: number
  }

TOOL 4: get_orbital_states
  Description: Current positions and velocities of all bodies
  including comets and asteroids.
  No input required.
  Output: array of {
    body_id, body_type,
    position_au: { x, y, z },
    velocity_au_yr: { vx, vy, vz },
    semi_major_axis_au,
    hz_status: "inside" | "outside" | "in_zone",
    coma_active: boolean,
    tail_vector: { x, y, z } | null,
    sim_time_yr: number
  }

TOOL 5: trigger_simulation_event
  Description: Sends an event command to the simulation. DISABLED
  by default in mcp_config.json. Must be manually enabled.
  Input: {
    event: "force_supernova"|"advance_1gyr"|"reset"|
           "spawn_comet"|"impact_event",
    target_id?: string,
    parameters?: object
  }
  Output: { success, message, new_state_summary }

WebSocket reconnection: exponential backoff starting at 1s,
doubling each attempt, capping at 30s. Log each reconnect attempt.
Server init: new Server({ name: "aethergenesis-sim", version: "1.0.0" })

--- FILE 2: src/simulation/SimStateSocket.ts ---

WebSocket server that broadcasts simulation state to MCP clients.

Exports:
  broadcastSimState(state: SimBroadcast): void
  registerEventHandler(handler: (event: SimEvent) => void): void

Types:
  interface SimBroadcast {
    timestamp_ms: number
    stellar: StellarState
    orbital: OrbitalState[]
    astrobiology: AstrobiologyState[]
  }

  interface SimEvent {
    event: string
    target_id?: string
    parameters?: Record<string, unknown>
  }

Rules for SimStateSocket.ts:
- WebSocket library: ws
- Port: process.env.SIM_PORT || 3001
- broadcastSimState is synchronous from the caller's perspective.
  JSON.stringify errors are caught and suppressed.
- No imports from src/rendering/ or Three.js.
- No circular imports.
- registerEventHandler stores handlers in an array.
  Each incoming WS message matching { type: "event" } is dispatched.

After creating both files:
1. Run: tsc --noEmit
   Report all errors or confirm zero errors.
2. Run: node server/mcp/sim-state.mjs
   Report startup log.
```

---

## PROMPT 6 — Agent Skills Population

**Mode:** New Worktree
**Scope:** Write all four SKILL.md files inside the plugin.

```
Populate all four Agent Skill manifests inside the AetherGenesis plugin.
Write each file exactly as specified. The description field controls
routing heuristics — it must be precise and specific.

FILE: .agents/plugins/aethergenesis/skills/stellar-physics/SKILL.md

---
name: stellar-physics
description: Use when working on StellarPhysics.ts, phase transition logic, stellar evolution equations, HR diagram data, spectral classification, luminosity-mass relations, Stefan-Boltzmann calculations, Chandrasekhar limit branching, Schwarzschild radius, or any TypeScript file in src/simulation/ that computes physical stellar state. Also triggers when verifying that phase transitions use physics thresholds and not timers.
version: 1.0.0
---

# Stellar Physics Skill

You are operating on the authoritative physics engine of AetherGenesis.
All equations must be cited to peer-reviewed sources.

## Core Equations Reference

| Quantity | Formula | Citation |
|---|---|---|
| Main sequence lifetime | τ_MS ≈ 10¹⁰ yr × (M/M☉)^(-2.5) | Carroll & Ostlie §13.1 |
| Luminosity-mass (M > 0.43) | L ∝ M^4.0 | Eddington 1924 |
| Luminosity-mass (M < 0.43) | L ∝ M^2.3 | Kroupa 2001 |
| Stefan-Boltzmann | L = 4πR²σT_eff⁴ | Fundamental |
| Chandrasekhar limit | M_Ch ≈ 1.4 M☉ | Chandrasekhar 1931 |
| TOV limit | M_TOV ≈ 2.0–3.0 M☉ | Oppenheimer & Volkoff 1939 |
| Schwarzschild radius | r_s = 2GM/c² | GR fundamental |

## Phase Transition Rules

EVERY phase transition must be triggered by a physics threshold.
No transition may use setTimeout, setInterval, or a frame counter.

| Transition | Trigger Condition |
|---|---|
| Nebula → Protostar | core density ρ_c > 10^-13 g/cm³ |
| Protostar → Main Seq | core T_c > 10^7 K |
| Main Seq → Red Giant | age_yr > τ_MS |
| Red Giant → Supernova | M_initial > 8 M☉ |
| Red Giant → Remnant | M_initial ≤ 8 M☉ |
| Remnant type | M_remnant vs M_Ch vs M_TOV |

## Validation Checklist

Before committing any change to StellarPhysics.ts:
- [ ] tsc --noEmit passes with zero errors
- [ ] Every equation has a JSDoc citation
- [ ] No phase transition uses a timer
- [ ] StellarState fields all have unit suffixes (_solar, _K, _yr, _km)


---

FILE: .agents/plugins/aethergenesis/skills/orbital-mechanics/SKILL.md

---
name: orbital-mechanics
description: Use when working on OrbitalMechanics.ts, nbodyWorker.ts, comet trajectories, asteroid belt rendering, habitable zone calculations, Keplerian elements, symplectic integrators, Web Worker N-body solver, or any orbital position/velocity computation. Also triggers when NASA Horizons MCP data is being parsed or fed into the simulation.
version: 1.0.0
---

# Orbital Mechanics Skill

## Integrator Standard

AetherGenesis uses Störmer-Verlet (symplectic leapfrog) exclusively
for all orbital integration. Euler integration is forbidden — it
diverges over long timescales and is not energy-conserving.

Leapfrog step:
  v_half = v + (F/m) * (dt/2)
  x_new  = x + v_half * dt
  v_new  = v_half + (F_new/m) * (dt/2)

## Key Equations

| Quantity | Formula | Notes |
|---|---|---|
| Gravitational force | F = GMm/r² | Softened: r² + ε² |
| Orbital period | T = 2π√(a³/GM) | Kepler's third law |
| HZ inner edge | r_in = √(L/1.1) AU | Kopparapu et al. 2013 |
| HZ outer edge | r_out = √(L/0.53) AU | Kopparapu et al. 2013 |
| Comet coma onset | ~3.0 AU from Sun | Water sublimation threshold |
| Comet tail onset | ~2.5 AU from Sun | Solar wind pressure |

## Web Worker Rule

The N-body solver runs in nbodyWorker.ts (Web Worker).
It never runs on the main thread. Results are postMessage'd
back at 60Hz. Never import Three.js into the worker.

## Comet Rendering

Ion tail: points directly away from the star (solar wind vector).
Dust tail: curves along the orbital path (trailing the comet).
Both are shader-driven. The MCP server provides the base trajectory.
The worker provides the current position. The shader does the rest.


---

FILE: .agents/plugins/aethergenesis/skills/astrobiology/SKILL.md

---
name: astrobiology
description: Use when working on AstrobiologyEngine.ts, habitability scoring, HabitabilityState, extinction events, life emergence triggers, habitable zone migration, atmosphere retention, snowball states, moist greenhouse threshold, or the astrobiology panel UI components. Also triggers when Gemini is being prompted to answer habitability questions.
version: 1.0.0
---

# Astrobiology Skill

## Habitability Score Components

All scores are 0.0–1.0. compositeScore is a weighted product.

| Score | Condition for 1.0 |
|---|---|
| orbitalScore | Planet inside HZ bounds |
| thermalScore | Surface T between 273–373 K |
| atmosphereScore | Escape velocity > thermal velocity of H₂O |
| stellarActivityScore | UV flux below sterilization threshold |
| ageScore | System age > 1 Gyr (life needs time) |

## Key Thresholds

| Event | Condition |
|---|---|
| Snowball state | T_surface < 233 K |
| Moist greenhouse | T_surface > 340 K |
| Atmosphere loss | v_esc < 6 × v_thermal |
| Sterilization | Supernova within 25 ly |
| Life emergence | compositeScore > 0.65 for > 500 Myr |

## Gemini Integration Rule

When Gemini analyzes habitability, it must receive the full
HabitabilityState JSON — not just a phase name or a summary.
The prompt must include: compositeScore, isInHabitableZone,
extinctionRiskLevel, and triggered_at_yr for each event.


---

FILE: .agents/plugins/aethergenesis/skills/shader-optimization/SKILL.md

---
name: shader-optimization
description: Use when writing or optimizing GLSL fragment shaders, vertex shaders, Three.js shader materials, post-processing passes, comet coma/tail shaders, nebula volume shaders, stellar surface shaders, or any file in src/rendering/. Also triggers when diagnosing frame rate drops or GPU memory issues.
version: 1.0.0
---

# Shader Optimization Skill

## Core Rule

Shaders are display layers. They never invent physical values.
Every uniform fed to a shader must come from StellarState,
OrbitalState, or AstrobiologyState. If a visual parameter has
no physics source, it is explicitly tagged as aesthetic.

## Performance Targets

- Fragment shaders: < 50 ALU ops per fragment on hot paths
- No texture lookups in inner loops unless cached
- Noise functions: use value noise or hash-based, not Perlin in frag
- Comet tail: billboard quad + procedural UV, no geometry shader
- Nebula: ray-march at half resolution, upscale with depth-aware blur

## Memory Safety

Every Three.js geometry, material, or texture created at runtime
requires a paired dispose() call when replaced or removed.
Black hole geometry replacement: dispose old geometry before new.

## Smoke and Mirror Patterns

These expensive effects are faked convincingly:

| Effect | Real Method | Our Approach |
|---|---|---|
| Radiative transfer | Full RT solve | Attenuation uniform from L |
| Gravitational lensing | GR ray-bend | Radial distortion in frag shader |
| SPH fluid | Particle solver | Procedural noise + velocity field |
| Coma scattering | Mie scattering | Gaussian falloff + color ramp |
| Ion tail | Plasma physics | Billboard + solar wind vector uniform |


After writing all four SKILL.md files, run:
  agy skill list
Expected: four skills listed under aethergenesis plugin.
Report exact output.
```

---

## PROMPT 7 — Rules Population

**Mode:** Local Mode
**Scope:** Write three rule files inside the plugin.

```
Write the three AetherGenesis agent rule files.
Rules are enforced automatically by hooks.json on file changes.

FILE: .agents/plugins/aethergenesis/rules/animation-loop-safety.md

# Rule: Animation Loop Safety

CRITICAL: The animation loop in src/core/engine.ts is sacred.
These patterns are ALWAYS forbidden:

1. cancelAnimationFrame() inside any catch block
2. await or Promise inside the physics tick function
3. setState() or any React state mutation inside the physics tick
4. Synchronous network calls inside the render loop
5. JSON.stringify of large objects inside the render loop

Errors must surface as non-blocking overlays, never as loop kills.
Pattern for error surfacing:
  try {
    // physics step
  } catch (error) {
    emitErrorOverlay(error)  // non-blocking UI notification
    // loop continues
  }

This rule is enforced on every commit touching engine.ts.


FILE: .agents/plugins/aethergenesis/rules/physics-first.md

# Rule: Physics First

StellarPhysics.ts is the single source of truth.
These patterns are ALWAYS forbidden:

1. Setting shader uniforms to hardcoded values
2. Phase transitions triggered by timers or frame counters
3. Color values not derived from temperature_K via colorTempToRGB()
4. Scale values not derived from radius_solar
5. Any physical quantity invented in a rendering file

Every shader uniform must trace back to a StellarState field.
If a value is purely aesthetic, add this comment:
  // AESTHETIC: not physics-derived, intentional


FILE: .agents/plugins/aethergenesis/rules/typescript-hygiene.md

# Rule: TypeScript Hygiene

1. tsc --noEmit must pass with zero errors before every commit.
2. All StellarState numeric fields must have unit suffixes:
   _solar, _K, _yr, _km, _au, _deg
3. No 'any' types in simulation files (src/simulation/, src/core/)
4. MCP server files (server/mcp/*.mjs) are excluded from tsconfig.
5. Web Worker files must never import from src/rendering/ or Three.js.
6. After every Antigravity agent edit session: run tsc --noEmit.
   Do not commit if errors exist.


After writing all rule files, confirm with:
  agy rule list
Report exact output.
```

---

## PROMPT 8 — Full Stack Verification

**Mode:** Local Mode
**Scope:** Verification only. Zero file modifications.

```
Run full AetherGenesis MCP stack verification.
Report PASS or FAIL for each check with exact output.

CHECK 1: Plugin loaded
  agy plugin list
  Expected: aethergenesis listed, version 1.0.0, 4 skills, 3 rules

CHECK 2: MCP servers registered
  agy mcp list
  Expected: nasa-horizons, stellar-catalog, aethergenesis-sim

CHECK 3: Skills registered
  agy skill list
  Expected: stellar-physics, orbital-mechanics, astrobiology,
            shader-optimization all listed under aethergenesis

CHECK 4: Halley's Comet orbital elements
  agy mcp call nasa-horizons get_orbital_elements '{"body_id":"1P"}'
  Expected: eccentricity ~0.967, period ~75.3 yr

CHECK 5: Comet catalog
  agy mcp call nasa-horizons search_small_bodies '{"type":"comet","limit":5}'
  Expected: Array of 5 comets with coma_onset_au populated

CHECK 6: Star preset library
  agy mcp call stellar-catalog get_preset_library '{}'
  Expected: 10 stars. Report Sun entry in full.

CHECK 7: Betelgeuse parameters
  agy mcp call stellar-catalog get_star_by_name '{"name":"Betelgeuse"}'
  Expected: mass_solar ~15-19, temperature_K ~3500, spectral M2Iab

CHECK 8: TypeScript integrity
  tsc --noEmit
  Expected: Zero errors

CHECK 9: trigger_simulation_event disabled
  agy mcp call aethergenesis-sim trigger_simulation_event \
    '{"event":"force_supernova"}'
  Expected: Tool disabled error (this is correct behavior)

CHECK 10: Hooks registered
  agy hook list
  Expected: onFileChange hooks for StellarPhysics.ts,
            src/rendering/**/*.ts, and src/core/engine.ts

If any check fails: report the error verbatim and stop.
Do not attempt fixes. Verification only.
```

---

## Post-Installation: Using the Plugin in Sessions

Once installed, reference these slash commands in any `agy` session:

```bash
# See the full development goal map
/goal

# Validate current file before touching it
/grill-me

# Open browser for Three.js or WebGL docs without search loops
/browser https://threejs.org/docs/

# Schedule nightly TypeScript integrity check
/schedule "0 2 * * *" "tsc --noEmit && echo PASS || echo FAIL"
```

**Invoking skills manually:**
```bash
agy "Refactor RedGiantPhase.ts to read radius from StellarState"
# Agent auto-routes to stellar-physics + shader-optimization skills

agy "Add Halley's Comet to the simulation with real orbital data"
# Agent auto-routes to orbital-mechanics skill + nasa-horizons MCP
```

**Invoking MCP tools directly:**
```bash
agy mcp call nasa-horizons get_ephemeris \
  '{"body_id":"1P","start_date":"2060-01-01","stop_date":"2062-01-01","step_size":"30d"}'
```
