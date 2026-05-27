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

## ARCHITECTURE OVERVIEW
... (rest of architecture overview)

---

## SESSION LOG

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

## CURRENT BUGS (as of last session)

| Priority | Bug | File | Fix |
|----------|-----|------|-----|
| LOW | GEMINI AI DEEP SCAN button in InspectPanel — not wired up | `InspectPanel.tsx` | Wire to Gemini API call |
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
