# Changelog

All notable changes to ÆTHERGENESIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [3.0.0] - 2026-07-23

### 🎨 Visual & Shader Upgrades
- **Volumetric Pulsar Beams & Relativistic Beaming** — Replaced static pulsar cone meshes in `RemnantPhase.ts` with custom volumetric `ShaderMaterial` featuring 3D turbulence, cyan core glow (`vec3(0.4, 0.9, 1.0)`), electric blue outer rims, and periodic time-dependent intensity modulation.
- **Relativistic Black Hole Accretion Disk** — Upgraded accretion disk fragment shader to simulate relativistic **Doppler beaming**: approaching edge is Doppler-shifted to electric blue/cyan ($1.6\times$ brightness), receding edge is redshifted to deep orange/crimson ($0.4\times$ brightness), with Keplerian differential rotation noise.
- **Dynamic Planet Orbit Path Lines** — Built `orbitLinesGroup` in `PlanetarySystem.ts` rendering glowing cyan orbital trajectory line loops (`LineLoop`) around host stars, synchronized with global timeline scrub fading.
- **Planckian Blackbody Star Colors** — Integrated `colorTempToRGB()` continuous blackbody surface color temperature mapping into `MainSequencePhase.ts` and `HeroStarSystem.ts`.
- **Twinkling Gaussian Background Stars** — Upgraded background starfield to custom `ShaderMaterial` with Gaussian radial falloff (`exp(-distSq * 14.0)`) and sinusoidal twinkling (`sin(uTime * 2.5 + aPhase)`).
- **Surface Granulation & Sunspots** — Upgraded `starSurface.frag.glsl` with domain-warped 5-octave FBM noise with high-frequency granulation detail, and dynamic sunspot cell darkening.
- **Supernova Shockwave Radial Distortion** — Added `uShockwave` radial UV displacement distortion in `cinematic.frag.glsl` and `Pipeline.ts` during stellar supernova explosions.

### 🎵 Soundscapes & Audio
- **Native WebAudio Ambient Synthesizer** — Implemented zero-dependency `CosmicAudioEngine.ts` producing generative ambient space drones (low-pass filtered harmonic sine waves with 0.1 Hz LFO breathing), supernova sub-bass explosion bursts, and UI click SFX.
- **Audio Controls in HUD** — Added Audio mute toggle button (`Volume2`/`VolumeX`) to top-right control grid in `Hud.tsx`.

### 🌌 Astronomical Catalog & UI Polish
- **Mounted Astronomical Catalog UI** — Mounted `CatalogPanel.tsx` in `AetherGenesis.tsx` and added catalog search button (`Search`) in `Hud.tsx` allowing live SIMBAD queries, JPL Horizons comet imports, and famous star preset loading (TRAPPIST-1, Betelgeuse).
- **Parented Coordinates** — Solar system comets, asteroid belts, and Dyson swarms now orbit the active selected/home star position rather than fixed origin space.

### ⚡ Performance & Physics
- **Velocity-Verlet Timestep Sub-Stepping** — N-body worker thread now sub-steps physics integration (`MAX_PHYSICS_DT = 0.002` yr, max 64 substeps) to preserve stable Keplerian orbits without body flinging.
- **External API Rate Limiting** — Added LRU rate-limiter (`checkApiRateLimit`) guarding `/api/catalog/search` and `/api/horizons/search` against IP rate limit exhaustion.

### 🔌 Antigravity 2.0 Plugin Architecture
- **Scaffolded Antigravity Plugin** — Created `.agents/plugins/aethergenesis/` containing `plugin.json` and agent skills (`stellar-physics`, `shader-optimization`).

---

## [2.0.0] - 2026-07-20

### 🎨 Rendering Pipeline Overhaul
- **ACES Filmic Tone-Mapping** — Added explicit `OutputPass` at the end of the `EffectComposer` post-processing pipeline for linear-to-sRGB color space conversion and ACES Filmic tone mapping.
- **Volumetric Raymarched Nebula** — Fixed unit-sphere raymarching shader and geometry matrix scaling in `NebulaSystem.ts` and `nebula.frag.glsl`.
- **Hero Star Scene Lighting** — Attached dynamic `PointLight` per hero star system to illuminate orbiting planetary systems, comets, and asteroid belts.
- **Cross-Platform GLSL Compliance** — Replaced all reversed GLSL `smoothstep(edge0, edge1, val)` calls (`edge0 > edge1`) with `(1.0 - smoothstep(edge1, edge0, val))` across all fragment shaders for full mobile GPU and ANGLE driver compliance.

---

## [1.0.0] - 2026-06-13

### 🛡️ Security

- **Secure WebSocket protocol detection** — Client now auto-detects `wss://` on HTTPS deployments instead of hardcoding `ws://`, preventing mixed-content failures in production ([#131](https://github.com/drewdroid86/aethergenesis/pull/131))
- **Production token enforcement** — Server now rejects all WebSocket connections if `WS_TOKEN` is still set to `default_secret` in `NODE_ENV=production`, with a clear `CRITICAL SECURITY` error log ([#131](https://github.com/drewdroid86/aethergenesis/pull/131), [#134](https://github.com/drewdroid86/aethergenesis/pull/134))
- **Hardened Content-Security-Policy** — `connect-src` directive tightened from the permissive `ws: wss:` (allows all WebSocket connections) to specific allowed origins and ports only, preventing potential data exfiltration ([#134](https://github.com/drewdroid86/aethergenesis/pull/134))
- **Fixed `allowedOrigins` declaration order** — Variable was previously referenced before declaration in the CSP middleware; moved to correct position ([#134](https://github.com/drewdroid86/aethergenesis/pull/134))
- **Added `vite-env.d.ts`** — TypeScript type declarations for `ImportMetaEnv` (including `VITE_WS_TOKEN`) added to improve type safety and eliminate unsafe `any` casts ([#131](https://github.com/drewdroid86/aethergenesis/pull/131))

### ⚡ Performance

- **n-body physics: pre-cached inverse masses** — `invMasses[]` Float32Array now computed once per physics tick rather than once per integration step, saving N divisions per body per tick in the Velocity Verlet integrator ([#133](https://github.com/drewdroid86/aethergenesis/pull/133))
- **n-body physics: optimized force magnitude** — Gravitational force calculation uses `r * rSoftSq` instead of `r * r * r`, saving one floating-point multiplication per body pair in the O(N²) inner loop ([#133](https://github.com/drewdroid86/aethergenesis/pull/133))
- **n-body physics: corrected softened distance** — Softening epsilon now correctly applied as `rSoftSq = dx² + dy² + dz² + ε²`, fixing a subtle numerical correctness issue in the previous formulation ([#133](https://github.com/drewdroid86/aethergenesis/pull/133))
- **CometSystem: pre-calculated orbital constants** — `sqrt(1+e)`, `sqrt(1-e)`, semi-latus rectum, inclination in radians, and `2π/period` are now computed at initialization rather than every frame, eliminating expensive trig/sqrt from the rendering hot loop ([#133](https://github.com/drewdroid86/aethergenesis/pull/133))
- **DysonSwarmSystem: removed redundant GPU upload** — `instanceMatrix.needsUpdate = true` removed when only the group's base rotation changes; prevents unnecessary per-frame GPU buffer uploads for static instance geometry ([#133](https://github.com/drewdroid86/aethergenesis/pull/133))
- **RemnantPhase: dirty-checked opacity updates** — Per-star opacity values are cached and compared before writing to the geometry attribute buffer; GPU upload is skipped entirely when no values have changed ([#135](https://github.com/drewdroid86/aethergenesis/pull/135))

### 🎨 UX & Accessibility

- **Timescale keyboard shortcut** — `T` key now toggles between `cosmic` (accelerated) and `realtime` timescales ([#132](https://github.com/drewdroid86/aethergenesis/pull/132))
- **HUD timescale indicator** — Visual feedback in the HUD reflects the current timescale state with accessible ARIA attributes ([#132](https://github.com/drewdroid86/aethergenesis/pull/132))
- **InspectPanel: cinematic entry/exit animations** — Panel now uses `AnimatePresence` with slide-from-right + blur-in/out transition instead of appearing/disappearing instantly ([#128](https://github.com/drewdroid86/aethergenesis/pull/128))
- **InspectPanel: fixed vertical centering jitter** — Centering moved from CSS `-translate-y-1/2` to Framer Motion `y: '-50%'` prop, ensuring all animation keyframes share the same baseline and eliminating vertical displacement jumps ([#128](https://github.com/drewdroid86/aethergenesis/pull/128))
- **InspectPanel: improved accessibility** — Added `role="region"` and `aria-label="Stellar Telemetry Panel"` to the panel root for screen reader navigation ([#128](https://github.com/drewdroid86/aethergenesis/pull/128))

### 🧹 Housekeeping

- Bumped version from `0.0.0` to `1.0.0`
- Updated `.env.example` with all environment variables (`WS_TOKEN`, `VITE_WS_TOKEN`, `SIM_PORT`, `NODE_ENV`) and security guidance
- Added `eslint-report.txt` to `.gitignore`; deleted committed generated artifact
- Removed `.jules/` AI agent memory files from git tracking; added to `.gitignore`
- Replaced generic AI Studio template `README.md` with full project documentation
- Pruned 35 stale remote branches (merged PR branches and abandoned agent drafts)

---

[Unreleased]: https://github.com/drewdroid86/aethergenesis/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/drewdroid86/aethergenesis/releases/tag/v1.0.0
