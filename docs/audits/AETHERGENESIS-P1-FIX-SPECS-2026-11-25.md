# P1 fix specs (second-pass audit, 2026-11-25)

Implementation specs for Neon. Verified against `main` at `60c39b7`. The audit's baseline, `014ae4f`, is not in this checkout.

P1 #1 and #3 come from the first-pass audit, which isn't in the repo. Their specs are pending until that list is available.

---

## P1 #2: WebSocket state fan-out mixes visitors' simulations

### What happens now

- Every browser connects with the public `VITE_WS_TOKEN` and publishes `{type:'state'}` about 1×/s (`src/simulation/SimulationCoordinator.ts:247`).
- The server checks the payload's shape and calls `broadcastSimState(data.data, ws)`. That sends the state to **every other client**: other visitors' browsers and the MCP server (`src/simulation/SimStateSocket.ts:265-287`, `:83-105`).
- `server/mcp/sim-state.mjs:51` overwrites a single `latestState` with whichever browser published last. It then derives `phaseHistory` from consecutive messages. With two visitors connected, phases flip between their simulations and fake transitions get recorded.
- Control events from the MCP server (token-gated) go to **every** browser (`SimStateSocket.ts:321-330`). One MCP command changes every visitor's simulation.

### Required behaviour

1. Each browser connection gets a server-assigned `sessionId` (random UUID) when it connects. The server sends it to the browser once: `{type:'hello', sessionId}`.
2. Browser `state` messages are **never** forwarded to other browser connections. They go only to control-token connections (`ws.protocol === controlToken`).
3. Forwarded state is wrapped as `{type:'state', sessionId, data}`.
4. Control events must name a target session: `{type:'event', event, sessionId, target_id?, parameters?}`. The server delivers the event only to that session's socket. It drops events with a missing or unknown `sessionId`. Local `handlers` still run.
5. The server tracks which sessions are live. It sends `{type:'session_closed', sessionId}` to control clients when a browser disconnects.

### MCP server (`server/mcp/sim-state.mjs`)

- Replace `latestState`, `lastPhase`, `lastPhaseStartTime` and `phaseHistory` with `Map<sessionId, {state, lastPhase, lastPhaseStartTime, phaseHistory, lastSeen}>`. Drop an entry on `session_closed`, or after 5 minutes of silence.
- Add a `list_sessions` tool that returns the id, phase, age and `lastSeen` for each session.
- Every read and control tool takes an optional `session_id`. If it's omitted and exactly one session is live, use that session. If several are live, return an error that lists them. Never pick one silently.
- `phaseHistory` stays per session, still capped at 200.

### Tests

- Extend the WebSocket auth suite in `scripts/`. With two browser clients A and B plus one control client C:
  - B never receives A's state.
  - C receives both, tagged with their `sessionId`.
  - An event from C sent to A reaches A only.
  - An event without `sessionId` is dropped.
- `npm run test:mcp`: alternating states from two sessions produce no phase transitions in either session's history.

### Out of scope

Changing token roles. The auth model was cleared in the second pass.

---

## P1 #4: four unrelated clocks run at once

### What happens now

| Clock | Where | Effective rate | Pauses? |
| --- | --- | --- | --- |
| Stellar evolution | `src/core/engine.ts:92-95`, rAF delta | 2e8 yr/s (cosmic), 1 s/s (realtime) | Yes |
| n-body worker | `src/simulation/nbodyWorker.ts:555,568`: `dt_yr` added on each 16 ms `setTimeout` | ≈18.75 yr/s (cosmic, 0.3/tick), ≈3.1 yr/s ("realtime", 0.05/tick). Slows when ticks are late (Mali throttling, background tab) | Yes (`isRunning`) |
| Procedural orbits | `src/rendering/systems/PlanetarySystem.ts:946`: `appTime × baseOmega × 0.005` | 0.005 yr/s | Yes (`appTime`) |
| Showcase comets | `src/rendering/systems/CometSystem.ts:329`: `appTime × 0.15` | 0.15 yr/s | Yes (`appTime`) |

`dt_yr` is set in four separate places in `src/utils/hooks/useSimulation.ts` (`:141`, `:253`, `:664`, `:827`), plus a one-off 0.00035 at `:466`. "Realtime" mode runs orbits about 1e8 times faster than real time.

### Design

Collapse to **two named clocks** that the code reads from one place. Stellar evolution at 2e8 yr/s can't drive visible orbits: they would alias to noise. So the split between the two is deliberate, and it should be explicit.

- **Evolution clock**: the existing `engine.simulatedTimeYears` and `cosmicAge`. No change.
- **Dynamics clock**: a new `engine.dynamicsTimeYears` that the engine advances once per frame by `delta × dynamicsRate_yrPerSec`, only while unpaused.
  - Define the rates once in `src/constants/simulation.ts`: `DYNAMICS_RATE = { cosmic: 2.0, realtime: 1 / 31557600 }` yr/s. 2.0 yr/s keeps inner orbits readable. The final value is a tuning call for the owner. Remove `orbitSpeedScale` and `CometSystem.yearsPerSecond`.
  - Procedural orbits: `theta = phaseOffset + baseOmega × dynamicsTimeYears`.
  - Comets: `simYears = dynamicsTimeYears`.
  - Worker: make it tick-rate independent. Replace the fixed per-tick `dt_yr` with a rate message, `SET_DYNAMICS_RATE {yr_per_s}`. Each tick, the worker adds `yr_per_s × (now − lastTick)/1000`, using `performance.now()`, clamped to 0.25 s of wall time per tick. Keep the existing accumulator, its cap and the substep logic. Remove `UPDATE_TIMESTEP` and all five `dt_yr` call sites in `useSimulation.ts`, and send the rate from one `useEffect` keyed on `timeScale`. The encounter case (`:466`) becomes a temporary rate override with a clear restore path.
  - Drift: the worker reports its integrated `sim_time_yr` in snapshots. The coordinator logs a warning when it differs from `dynamicsTimeYears` by more than 5%. It doesn't correct it: the worker remains authoritative for buffer bodies.
- HUD: label the two clocks separately, for example "Stellar age" and "Orbital time ×N".

### Acceptance

- In each time scale, a body integrated in the worker and a procedural body with the same `a` complete orbits at the same rate, within 2% over 30 s.
- Halving the worker's tick rate (a test hook) changes elapsed dynamics time by less than 2%.
- When paused, all four consumers freeze. On resume, nothing jumps.
- New test `scripts/*clock*.test.ts` covers the rate constants, the worker's wall-clock integration (with a faked `performance.now`), and the absence of any remaining `orbitSpeedScale` or `yearsPerSecond` readers.
- `npm run lint`, `npm run build` and `npm test` pass.

### Coordinate with

- P2 "orbit lines stale after mass loss": touch orbit-line regeneration in the same PR only if it's trivial.
- P2 "re-renders 3×/s": don't add a React state for `dynamicsTimeYears`. Read it from the engine ref.
