# AetherGenesis — agent instructions

Read this at the start of every session. It encodes the standing
conventions of this project so you don't have to rediscover them.

## What this is
A realtime 3D picture of the actual universe: real star presets with
literature masses/luminosities, real comet/asteroid orbits pulled from
JPL Horizons, all evolved by a real n-body integrator. Three.js + React
+ TypeScript. Frame every change against that north star.

## Environment: Termux on unrooted Android
- You run natively in Termux. `/tmp` is NOT writable — use `./tmp` or `$HOME/tmp`.
- Background servers: detach stdin (`< /dev/null`), logs to `$HOME` (e.g. `~/vite.log`).
- `npm run dev` serves on :3000. Express backend `server.ts` on :3001.
- Headless Chromium CANNOT render this app's 3D scene (SwiftShader trace-traps).
  Never attempt headless screenshots of the app itself.
- Node 26 in Termux.

## The ritual — run after every change, all green before calling it done
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — must succeed
3. `npm test` — full suite green (E2E suites incl. f1–f13, registered in run-e2e-tests.ts)
4. Show the diff.

Notes: F1-T1-5 hits live JPL Horizons (a 404 there is external flakiness,
not a merge blocker). E2E tests hard-fail without Chromium — by design,
do not "fix" it by skipping.

## Git workflow
- Work on feature branches (`feat/...`, `fix/...`). Commit your work on the branch.
- Do NOT merge into main and do NOT push — Andrew lands branches himself.
- Repo ruleset requires linear history: squash or rebase merges, never merge commits.

## Agent roles in this loop
- Plain `agy` (you, right now) implements.
- `architect-review` is the pre-merge gate and is READ-ONLY — it reviews, never edits.
- The loop: implement on a branch → architect-review reviews → Andrew merges.

## Codebase map
- `useSimulation.ts` orchestrates Engine/Worker/Coordinator.
- Express backend: `server.ts` (:3001). MCP servers under `server/mcp/`.
- The per-frame hot path writes directly to DOM refs, bypassing React —
  don't "fix" this into setState; it's deliberate.
- Project skills available: stellar-physics, shader-optimization,
  orbital-mechanics, astrobiology. Use them for domain work.

## Gotchas learned the hard way
- Orbit strobing at cosmic speeds is a display-sampling effect, not an
  integration bug — don't "fix" the integrator for it.
- Belt/dyson/nebula systems are perf-budgeted for phones: keep per-frame
  uploads near zero (instanced attribute updates, not full matrix uploads).
- `effG` scales lifetimes, not ages: `currentRealAge` is true elapsed age.
- The click path and the simulation share re-keying through the shared
  `rekeyNBodyForStar` helper — don't fork it.
