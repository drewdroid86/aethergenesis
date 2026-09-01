# AetherGenesis Current-State Audit — September 1, 2026

**Scope:** `drewdroid86/aethergenesis` @ `5be3efd` (`main`, merge of `feat/ws-heartbeat-and-glsl-precision`).
**Author:** Grok 4.6 deep review (not a line-by-line re-audit of all 174 files).
**Supersedes for current HEAD:** `AETHERGENESIS-AUDIT-2026-08-21-MASTER.md` and earlier findings that this document marks **FIXED**. Historical audits stay in `docs/audits/` as a paper trail only.

**CI on this SHA:** CI success, physics-benchmark success, GitHub Pages deploy success. No open issues. No code-scanning alerts configured.

---

## Verdict

Serious mid-stage product: React 19 + Three.js r184 + Velocity-Verlet worker + Express 5 + Gemini + MCP. The August 28 fix wave landed. Remaining work is architecture, physics-fidelity claims vs approximations, and a split Pages/Render deploy that will fail quietly in production.

Not production-hardened as a public multi-user service. Physics is inspired-by in a few places the README still frames as textbook-accurate.

Do **not** reopen the August 21 "hybrid engine / cloned nbody buffer" work. That war is over.

---

## Fixed since the August 21 master audit

Do not re-fix these. Verified on `5be3efd`.

| Old finding | Status |
|---|---|
| Every hero star cloned the same 3-body buffer at \(M = 1\,M_\odot\) | **Fixed.** `UPDATE_CENTRAL_MASS` / `RESET_BODIES` in `nbodyWorker.ts`. `useSimulation.ts` posts selected-star mass. `engine.ts` gates `isFocused ? nbodyBuffer : null`. Background stars use seeded Keplerian orbits in `PlanetarySystem.ts`. |
| Vis-viva used the wrong mass / fell back to \(a = 9999\,\mathrm{AU}\) | **Fixed.** `SimulationCoordinator.ts` uses `perStarState.mass_solar`; hyperbolic `invA <= 0` falls back to instantaneous \(r\). |
| `timeInHz_yr` wiped on one bad tick | **Fixed.** `AstrobiologyEngine.ts` decays with `max(0, timeInHz_yr - delta_yr * 2)`. |
| MK class via `includes('I')` in catalog MCP | **Fixed** (word-boundary ladder, longest-first). Shared module `server/shared/stellarCatalog.mjs`. |
| Client `VITE_WS_TOKEN \\| 'default_secret'` | **Removed** in `useWebSocket.ts`. Missing token errors in prod, throws in dev. |
| CI `npm audit` masking lint/test | **Fixed.** Audit is last step, `continue-on-error: true`. |
| Position clamp at 200 AU killing Hale-Bopp | **Fixed.** 1000 AU + `console.warn` with body index. |
| Pipeline per-frame `new Vector2/3` | **Fixed.** Cached `_tempV` / `_screenPos`. |
| InspectPanel double-reset / no abort | **Fixed.** AbortController on `analyzeSystem()`. |
| `package.json` version `1.0.0` vs changelog 3.0.0 | **Fixed.** |
| Audio silent until mute button double-clicked | **Fixed** (Aug 26 `fix(audio): initialize AudioContext globally on first user gesture`). |

HEAD also adds: client/server WS heartbeat (`ping`/`pong` every 30s), Roche debris stream in `CometSystem.ts`, relativistic BH disk / photon-sphere work in remnant shaders.

---

## P0 — ship blockers if this is a public URL

### 1. Two deploys, one of them is a hollow frontend

- GitHub Pages (`.github/workflows/deploy.yml`) builds `VITE_BASE_PATH=/aethergenesis/` and uploads `dist`. No `VITE_WS_TOKEN`, no API host, no Gemini key.
- Render (`render.yaml`) is the real app: `npm start` → `server.ts` serves `dist` + REST + WS.

On Pages, `useWebSocket` only **throws** when `VITE_WS_TOKEN` is missing in **dev**. In production it logs and still opens `new WebSocket(url, undefined)` against the Pages origin. There is no Express there. Catalog, Horizons, `/api/analyze`, and sim-state WS are dead.

**Fix (pick one):**

- Treat Pages as a documented offline demo: stub WS/API, local presets only, no reconnect loop.
- Or stop deploying Pages and treat Render as the only prod.
- If both stay, add `VITE_API_BASE` / `VITE_WS_URL` and inject them in the Pages workflow.

Dual-path without a client API base is a product bug, not a docs nit.

### 2. WS "auth" is a handshake key in the public bundle

Already reworded in `SimStateSocket.ts` (good). Remaining facts:

- `VITE_WS_TOKEN` is compiled into the client. Anyone can read it.
- Real controls are origin allowlist, connection cap, rate limit, and event whitelist.
- Client still honors `force_supernova` / `reset` / `advance_1gyr` if a message arrives.

Treat WS as **origin + rate-limit isolation**, not authentication. If MCP or a second client needs to mutate the sim, use a server-only token that is never `VITE_`-prefixed.

### 3. Express Horizons path still classifies by the letter `P`

MCP `nasa-horizons.mjs` was fixed. `server.ts` was not.

```js
const isComet = type === 'comet' || name.includes('/') || name.includes('P');
```

On `type=asteroid`, names like **2 Pallas** / Psyche become comets and get `coma_onset_au` / `tail_onset_au`. Same class of bug as the Aug 26 MCP finding.

**Fix:** copy the JPL SBDB `kind` field logic from `server/mcp/nasa-horizons.mjs` into the Express handler. Keep `name.includes('/')` only as a fallback when `kind` is missing.

---

## P1 — physics claims vs code

### 4. Roche limit is a visual effect, not a Roche limit

`CometSystem.ts`:

```text
d_Roche ≈ 0.85 AU * M_star^(1/3)
```

For the Sun that is **0.85 AU**. Fluid Roche around the Sun for an icy nucleus is order **0.01–0.02 AU**:

```text
d = 2.44 * R_star * (ρ_star / ρ_comet)^(1/3)
```

Halley perihelion is 0.59 AU — this formula shreds it every orbit. Encke (0.34 AU) never survives.

Either document it as a cinematic "tidal danger zone," or use current stellar radius (red giant vs MS changes this by ~100×) and a real density ratio. Add a one-line test: Sun + ice body ⇒ Roche ≪ 0.1 AU.

### 5. Coordinator radius is a mass-radius power law, not the evolved star

`SimulationCoordinator.ts`:

```ts
radius_solar: Math.pow(star.mass, 0.8)
```

`Engine.getStellarState()` already goes through `createStellarState()`. The coordinator ignores evolved radius, so HZ / astrobiology / MCP telemetry disagree with what is on screen during red-giant and remnant phases.

**Fix:** feed evolved radius from `StellarPhysics` (or Stefan–Boltzmann from `currentLum` / `currentTemp`) into `perStarState`.

### 6. Integrator is real; the system it integrates is still small

Worker: Velocity-Verlet, softening `1e-4`, substep cap 64, central mass updates. Conservation test against exported `physicsTick()` exists. Good.

Still true:

- One worker, a handful of bodies, focused star only.
- Background planets are analytic Kepler, not N-body. Fine for 600 stars.
- After `postMessage(..., [buffer.buffer])` the worker allocates a **new** `Float32Array` every tick. Double-buffering does not avoid GC; it only avoids racing a live buffer. Copy into two persistent buffers if the "zero-alloc" comments are meant to stay true.
- `setTimeout(physicsTick, 16)` is not vsync-aligned and keeps running when the tab is backgrounded (the accumulator cap helps; it does not stop the timer).

### 7. Background point size is still unbounded

`engine.ts` background vertex shader:

```glsl
gl_PointSize = aSize * (300.0 / -mvPosition.z);
```

No clamp. Camera near a point → fill-rate spike. Same class as the old nebula/ejecta finding. Clamp to something like `[1.0, 24.0]` and floor `-mvPosition.z`.

Lensing guard is still `projected.z <= 1.0` only. Behind-camera black holes can still light the cinematic pass. Also test `projected.z >= -1` and camera-space `z < 0`.

---

## P1 — security / backend

`server.ts` is better than most hobby Express apps: `x-powered-by` off, 10kb JSON limit, CSP, HSTS, CORP/COOP, shared `isOriginAllowed`, Gemini 5/min, catalog 60/min, input clamps, output sanitization, fetch timeouts, graceful shutdown.

Remaining:

- SIMBAD ADQL still interpolates user strings (quote-doubled, length-capped). Not your DB, but this process is an open proxy to Strasbourg. Consider rejecting characters other than `[A-Za-z0-9 +\-.*]`.
- `trust proxy = 1` is correct on Render; rate limits are per `req.ip`.
- Gemini model is hardcoded `gemini-2.0-flash`. Make it `process.env.GEMINI_MODEL`.
- `/health` exposes `aiEnabled`. Harmless, slightly informative.
- SPA fallback `sendFile(index.html)` is after API routes — good. Confirm it never swallows `/api/*` 404s you care about.
- No Dependabot / code-scanning on the repo. `npm audit` in CI is `continue-on-error`. Transitive advisories can rot quietly.

---

## P2 — structure and process

God files (maintainability, not style):

| File | ~size | Problem |
|---|---|---|
| `server.ts` | 34 KB | Catalog + Horizons + Gemini + static + listen |
| `src/ui/Hud.tsx` | 36 KB | Entire cockpit |
| `src/rendering/systems/HeroStarSystem.ts` | 34 KB | Phase + planets + lights |
| `src/utils/hooks/useSimulation.ts` | 27 KB | Worker + presets + engine wiring |
| `src/simulation/phases/RemnantPhase.ts` | 22 KB | After BH disk work |
| `PROJECT-LOG.md` | 69 KB | Living diary; May "architect sign-off" still stale |

Tests: custom `scripts/e2e/*` + `test:mcp`, not Vitest/Playwright. CI is green. README still says "45-scenario E2E suite" while PROJECT-LOG has claimed 51. Align the number to whatever `scripts/run-e2e-tests.ts` actually runs.

No unit tests for `AstrobiologyEngine` or Roche math.

`detectPerformanceTier()` still treats a phone (8 ARM cores, DPR 3) as `ultra` / 600 hero stars and a 16-core desktop at DPR 1 as `high`. Auto-tuner can walk it down, but first paint on mobile will hitch. Cap mobile initial tier at `medium`.

No open GitHub issues. Findings live only in `docs/audits/`. Mark older audits superseded rather than leaving them as if they describe HEAD.

---

## What is actually good

- Engine / phase / system split is the right cut. Gravity belongs in the worker.
- Express surface has real security thinking, not headers-only cargo cult.
- August 28 branches were small and verifiable. That workflow is working.
- Light culling (`MAX_ACTIVE_POINT_LIGHTS = 12`) is the correct Three.js footgun fix.
- Shared stellar catalog ended a class of "Express and MCP disagree" bugs.
- Conservation test against `physicsTick` is worth more than the old mock leapfrog.

---

## Suggested next cuts (one branch each)

1. `fix/pages-vs-render` — Pages build: stub WS/API or inject `VITE_API_BASE`. Do not ship a client that reconnects forever to itself.
2. `fix/horizons-kind-field-express` — delete `name.includes('P')` in `server.ts`.
3. `fix/roche-physical` — Roche from \(R_\star, \rho\); assert Sun+ice ≪ 0.1 AU.
4. `fix/coordinator-evolved-radius` — `perStarState.radius_solar` from stellar physics.
5. `fix/point-size-clamp` — background VS + any remaining particle VS.
6. `chore/split-server` — `server/http/{catalog,horizons,analyze,static}.ts`. Stop growing `server.ts`.

---

## Coverage note

This pass re-read: `package.json`, `.env.example`, `render.yaml`, `deploy.yml`, `ci.yml`, `.gitignore`, `LICENSE`, `src/utils/security.ts`, `src/utils/performance.ts`, `src/utils/hooks/useWebSocket.ts`, `src/simulation/nbodyWorker.ts`, `src/simulation/SimulationCoordinator.ts`, `src/simulation/AstrobiologyEngine.ts`, `src/rendering/pipeline.ts`, `src/core/engine.ts`, `server.ts` (full), plus targeted search across worker/engine/catalog/WS/Roche.

Not re-audited line-by-line: every GLSL file, every nav HUD widget, every e2e assertion quality, `claude-review.yml` behavior.
