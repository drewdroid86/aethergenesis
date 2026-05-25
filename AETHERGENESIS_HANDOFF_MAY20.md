# ÆTHERGENESIS — Session Handoff
**Date:** May 20, 2026 — ~8:00 PM
**From:** Claude + Gemini CLI session
**To:** New chat session

---

## 🟢 CURRENT STATE — CONFIRMED GOOD

**Main branch = 66-file modular architecture. CI green. Git clean.**

```
HEAD -> main = latest push (NebulaSystem + PlanetarySystem added)
Tag: recovered-modular-architecture = b07fc19 (safe fallback)
All recovery branches preserved on GitHub
```

**GitHub:** https://github.com/drewdroid86/aethergenesis

---

## WHAT CHANGED THIS SESSION

### ✅ CI Stabilized (Hard fought)
- Bolt/Jules agents opened rogue PRs, caused merge conflicts, broke CI
- `.jules/` folder deleted — Bolt/Palette/Sentinel agents are GONE
- `package.json` lint script restored to `tsc --noEmit` only (ESLint removed)
- `HeroStarSystem.ts` import path fixed: `../../physics/types` → `../../types/physics`
- CI is now GREEN on main

### ✅ Phase 2 — NebulaSystem Added
- `src/rendering/systems/NebulaSystem.ts` created
- 8-12 volumetric gaseous cloud formations using THREE.Points
- Custom GLSL shader with soft Gaussian glow
- Cold hydrogen (blue-purple) + ionized regions (red-orange) color variations
- fbm noise billowing animation via `uTime` uniform
- Uses existing `src/shaders/utils/noise.glsl`
- `renderOrder = -10` → depth sorted behind hero stars
- Frustum culled per formation
- Wired into `useSimulation.ts` — running live at 27-54 FPS ULTRA tier
- **VISUALLY CONFIRMED WORKING** — gorgeous golden nebula clouds visible

### ✅ Phase 2 — PlanetarySystem Added (unwired)
- `src/rendering/systems/PlanetarySystem.ts` created by Bolt (kept)
- Keplerian orbit approximations around a central star
- 3-5 bodies per star, semi-major axis, eccentricity, inclination
- **NOT yet wired into simulation** — next session task

### ✅ Repo Hygiene
- `.jules/` agents removed (Bolt, Palette, Sentinel)
- All rogue Bolt PRs should be closed on GitHub manually
- Recovery branches and tags preserved

---

## REPO STRUCTURE (66 files)

```
aethergenesis/
├── .env.example
├── .github/workflows/ci.yml
├── eslint.config.js
├── index.html
├── metadata.json
├── package.json
├── render.yaml
├── server.ts
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── App.tsx
│   ├── components/AetherGenesis.tsx
│   ├── constants/simulation.ts
│   ├── core/
│   │   ├── constants.ts
│   │   └── engine.ts
│   ├── physics/math.ts
│   ├── rendering/
│   │   ├── nebulae.ts
│   │   ├── pipeline.ts
│   │   ├── shaders/stellar.ts
│   │   └── systems/
│   │       ├── HeroStarSystem.ts
│   │       ├── NebulaSystem.ts        ✅ NEW — Phase 2
│   │       └── PlanetarySystem.ts     ✅ NEW — unwired
│   ├── shaders/                       # 12 GLSL files
│   │   ├── starSurface.frag.glsl
│   │   ├── cinematic.frag/vert.glsl
│   │   ├── nebula.frag.glsl
│   │   ├── ejecta.frag/vert.glsl
│   │   ├── lifeGlow.frag/vert.glsl
│   │   ├── particle.frag/vert.glsl
│   │   ├── displacement.vert.glsl
│   │   ├── subDisplacement.vert.glsl
│   │   ├── basic.vert.glsl
│   │   └── utils/noise.glsl
│   ├── simulation/phases/
│   │   ├── NebulaPhase.ts
│   │   ├── ProtostarPhase.ts
│   │   ├── MainSequencePhase.ts
│   │   ├── RedGiantPhase.ts
│   │   ├── SupernovaPhase.ts
│   │   ├── RemnantPhase.ts
│   │   ├── geometries.ts
│   │   └── types.ts
│   ├── types/physics.ts
│   ├── ui/
│   │   ├── ConstantsPanel.tsx
│   │   ├── Hud.tsx
│   │   └── InspectPanel.tsx
│   └── utils/
│       ├── hooks/useSimulation.ts
│       ├── math.ts
│       ├── performance.ts
│       └── shaderLoader.ts
```

---

## KNOWN ISSUES

### 🟡 PATs Still Not Rotated — DO THIS FIRST
Both exposed tokens still sitting open:
- `ghp_REDACTED` (likely expired)
- `ghp_REDACTED` (in `~/.gemini/settings.json`)
Go to: GitHub Settings → Developer Settings → Personal Access Tokens
Revoke both. Generate new one. Update `~/.gemini/settings.json`.

### 🟡 Rogue Bolt PRs on GitHub
Go to github.com/drewdroid86/aethergenesis/pulls
Close any open PRs from bolt-* branches without merging.

### 🟡 PlanetarySystem Not Wired In
`src/rendering/systems/PlanetarySystem.ts` exists but isn't connected
to the simulation. Wire it in during MainSequencePhase. See prompt below.

### 🟡 ESLint Still Bypassed
`package.json` lint script is `tsc --noEmit` only.
ESLint exists but isn't running in CI. Fine for now — address later.

### 🟡 Dead Physics Constants (5 of 11 unwired)
These exist in PhysicsConstants but don't affect anything yet:
- `softening`, `strongForce`, `weakForce`, `darkMatter`, `baryon`

---

## PHASE ROADMAP

### Phase 1 — Foundation ✅ DONE
Galaxy distribution, 6-phase lifecycle, physics constants, Gemini AI,
bloom post-processing, OrbitControls, HUD, inspect panel.

### Phase 2 — Stellar Genesis 🔄 IN PROGRESS
- ✅ NebulaSystem volumetric clouds
- ✅ PlanetarySystem (created, needs wiring)
- 🔜 Wire PlanetarySystem into MainSequencePhase
- 🔜 Wire remaining 5 dead constants
- 🔜 Star clusters (groups that age together)
- 🔜 Black hole gravitational lensing effect

### Phase 3 — Deep Time & Civilization
- Persistent Gemini civilization state per star
- Civilization fate tied to star phase
- Dyson sphere visual

### Phase 4 — Community & Sharing
- Universe seeds (base64 physics snapshot)
- Screenshot mode (4K PNG)
- Observation log

### Phase 5 — Audio
- Tone.js procedural soundscape
- Phase-based audio

### Phase 6 — WebGPU
- Compute shaders, 10,000+ stars

---

## READY-TO-FIRE GEMINI CLI PROMPTS

### Next Up — Wire PlanetarySystem into simulation
```
Wire PlanetarySystem into the hero star lifecycle in
src/rendering/systems/HeroStarSystem.ts.

Import PlanetarySystem from './PlanetarySystem'.

1. When a star enters MainSequence phase, create a new
   PlanetarySystem(starMesh, 3) and store it on the star object
2. Call planetarySystem.update(delta) in the star's update loop
   when phase is MainSequence
3. Call planetarySystem.dispose() when the star transitions
   away from MainSequence (RedGiant phase begins)

Do not touch any other files.
```

### Feature — Universe Seeds
```
Implement a universe seed system in src/utils/hooks/useSimulation.ts.

A seed is a base64-encoded string that encodes the current
PhysicsConstants snapshot (all 11 fields).

Add:
1. encodeSeed(physics: PhysicsConstants): string
2. decodeSeed(seed: string): PhysicsConstants
3. On initial load, check for ?seed= URL parameter and decode if present
4. Return currentSeed from the hook

Add to src/ui/Hud.tsx:
- "Share Universe" button that copies the current seed URL to clipboard
- Show first 8 chars of seed as universe ID in HUD

Do not touch simulation logic. Do not touch any other files.
```

### Feature — Wire Dead Constants
```
Wire these 5 unused PhysicsConstants into visible simulation effects
in src/utils/hooks/useSimulation.ts or src/core/engine.ts:

1. softening → affects how close stars can get before repulsion
2. strongForce → affects supernova explosion radius
3. weakForce → affects neutron star spin rate
4. darkMatter → affects background star density/distribution
5. baryon → affects star color temperature distribution

Add sliders for each in src/ui/ConstantsPanel.tsx with descriptions.
Do not touch any other files.
```

### Feature — Black Hole Gravitational Lensing
```
Add a gravitational lensing post-processing effect to black holes
in src/rendering/systems/HeroStarSystem.ts.

When a star is in Remnant phase with mass > 10 solar masses
(black hole), add a lens distortion effect using a custom shader
pass that warps nearby pixels toward the black hole center.

Create src/shaders/gravitationalLens.frag.glsl for the effect.
Do not touch any other files.
```

---

## TECH STACK

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4
- **Rendering:** Three.js r184 + WebGL 2 + custom GLSL shaders
- **Post-processing:** UnrealBloom + cinematic film grain
- **AI:** Gemini 2.0 Flash via @google/genai ^1.51.0
- **Backend:** Express.js (server.ts) — Gemini API proxy
- **Build:** Vite 6
- **Device:** Pixel 9 Pro, Termux, aarch64, Mali-G715 Vulkan
- **Dev tools:** Gemini CLI (implementation) + Claude (architecture/review)
- **Performance:** ULTRA tier, 27-54 FPS on Mali-G715

---

## DEVICE / ENVIRONMENT

- **Phone:** Pixel 9 Pro (drewdroid86)
- **Shell:** Termux + Oh My Zsh
- **Git auth:** SSH key at `~/.ssh/id_ed25519`
- **Remote:** `git@github.com:drewdroid86/aethergenesis.git`
- **Dev server:** `npm run dev` → localhost:3000
- **Crucible:** `~/crucible` — main AI dev platform

---

## DEV.TO GEMMA 4 CHALLENGE
**Deadline: May 24, 2026 — 4 days away**
Prize pool: $3,000

Submission angle: "I built a real-time universe simulator on nothing
but a Pixel 9 Pro. No laptop. No desktop. Just vision."

Key screenshot for submission: The golden nebula cloud (Image 6 from
this session) — that's the hero image.

Universe Seeds feature (Phase 4) would make the submission interactive —
readers can paste a seed URL and load a custom universe. Priority feature
before the deadline.

---

## THE VISION

*"Before the first light — there was a choice."*

Built entirely on a Pixel 9 Pro. No laptop. No desktop.
The universe is open source. 🌌

---

*ÆTHERGENESIS v0.1.0 — Built on a phone — Powered by physics*
*Phase 2: Stellar Genesis — In Progress*
