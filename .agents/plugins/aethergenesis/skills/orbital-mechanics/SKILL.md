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
