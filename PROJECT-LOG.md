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

### v2.3 — Nebula Refinement + Infrastructure Cleanup
**Date:** May 14, 2026
**AI:** Gemini CLI (executor)
**Branch:** Committed to `main` (user request)

**Changes:**
- **Fixed critical nebula bug:** Resolved double-offset in `nebulae.ts` by passing `(0,0,0)` to `generateClusteredPositions`.
- **Nebula tuning:** Refined opacity (0.25) and spreadFactor (600) for a subtle, atmospheric background that doesn't overwhelm the scene.
- **Lighting fix:** Switched habitable zone rings to `MeshPhongMaterial` with emissive properties — they now correctly receive light from the central star.
- **Remote Cleanup:** Deleted stale branches: `bolt-optimization-rendering-*`, `fix/performance-banner`, and `sentinel/harden-ai-proxy-*`.
- **Visibility Overhaul:** Initially boosted nebulae for visibility, then toned them down to a balanced, "AAA" quality level once the positioning bug was resolved.

**State at end:** Nebulae are soft, distant, and correctly positioned. Star systems are fully lit and atmospheric. Repo is clean of stale branches.

---

## CURRENT BUGS (as of last session)

| Priority | Bug | File | Fix |
|----------|-----|------|-----|
| LOW | GEMINI AI DEEP SCAN button in InspectPanel — not wired up | `InspectPanel.tsx` | Wire to Gemini API call |
| LOW | README launch link points to `#` | `README.md` | Update after deploy |


---

## NEXT PRIORITIES

1. **Wire GEMINI DEEP SCAN button** — `InspectPanel.tsx` has the button, needs API call
2. **Deploy to Render** — `render.yaml` exists, just needs env vars + trigger
3. **Update README** launch link once deployed
4. **Cinematic Post-Processing pass** — further refine bloom and color grading for AAA feel


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
