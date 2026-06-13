# Changelog

All notable changes to ÆTHERGENESIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
