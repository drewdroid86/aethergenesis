# November audit findings: verification

Verified November 8, 2026 against main commit `b37ebe6d33e5685b11592f41b673a788d30fce63`, using a clean `npm ci` install.

The dashboard's seven open findings came from the November 1 audit snapshot at `8e439f5`. They were subsequently addressed by merged PR #258 (`3d0a1f2`). They should not be treated as seven newly confirmed open defects on current main.

| Finding | Current implementation | Regression evidence |
| --- | --- | --- |
| F1: navigation selection and worker host diverge | Exported UI selection calls `selectStarFromUi`, invalidates snapshots, rekeys the worker, and synchronizes effective mass. Generation filtering rejects stale worker messages. | f7 mobile navigation, f9 rekey paths, f15 audit regressions |
| F2: explicit age advance is overwritten | `advanceTime` and `forceSupernova` use `setStellarAge`, updating birth-time anchor and derived age under the active gravity scale. | f6 explicit stellar age; f16 actual star updates after advance and forced supernova |
| F3: cosmic clock runs while paused | Cosmic clock advancement includes the engine pause condition. | f16 paused clock near universe-age wrap, followed by resume |
| F4: paused reset retains old positions | INIT, ADD_BODY, and RESET_BODIES emit snapshots immediately; reset emits roster and positions with a generation. | f14 paused reset snapshots; f13 integration regressions |
| F5: comet telemetry uses planet metadata | Coordinator takes physical type from the worker roster and resolves render metadata by stable ID. | f6 reordered comet, planet, and asteroid telemetry; f4 comet coverage |
| F6: catalog mass and identity disagree | Imports use selected/fallback effective mass, validate numeric inputs, generate instance IDs separately from catalog identity, and worker ID assignment rejects collisions. | f14 duplicate IDs; f15 catalog mass, identity, and validation contracts |
| F7: dependency advisories | Lockfile updates and targeted overrides already merged in #258. | Fresh `npm audit --json`: zero reported vulnerabilities |

## Remaining verification blocker repaired

The original `npm test` launcher failed before executing tests because the tsx CLI tried to create an IPC Unix socket that this execution environment does not allow. Load tsx directly with `node --import tsx` for test entrypoints and their server/test subprocesses. This preserves TypeScript execution while removing that launcher dependency. No simulation behavior changes were needed for this verification.

## Results after launcher repair

- `npm run lint`: passed, including TypeScript check.
- `npm run build`: passed; existing warning about a bundle chunk larger than 500 kB remains.
- `npm test`: passed, 174 tests in 17 E2E suites, plus WebSocket control authorization and inclined/eccentric orbit/empty-roster checks.
- `npm run test:mcp`: passed all three MCP server integration groups.
- `npm audit --json`: zero reported vulnerabilities.
- `git diff --check`: passed.

These checks establish the automated coverage listed above. They do not claim a fresh Pixel browser rendering or thermal/frame-time benchmark. Several navigation/import assertions are source-contract checks rather than a complete interactive browser reproduction.
