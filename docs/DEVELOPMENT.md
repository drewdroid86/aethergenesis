# Development and operations

Run commands from the repository root. See the [repository map](ARCHITECTURE.md)
for code ownership by directory and the [README](../README.md) for the overview.

## Local setup

The installed Vite and ESLint engine requirements overlap at Node 20.19+,
22.13+, or 24+. Use Node 22.13+ on the 22.x line for a consistent baseline.
Dependency engine declarations and the lockfile are authoritative.

```bash
npm ci
cp .env.example .env
# Edit .env before starting the servers.
npm run dev:full
```

Use identical values for `WS_TOKEN` and `VITE_WS_TOKEN`. Generate a separate
value for `WS_CONTROL_TOKEN` if using simulation MCP control. `openssl rand -hex
32` generates a suitable token. The Gemini key is optional for simulation and
catalog use; it is required for AI analysis. Never commit `.env`.

The client is at `http://localhost:3000`; Express and WebSockets listen at
`http://localhost:3001`. Vite proxies `/api` to Express. The client WebSocket
hook explicitly maps development port 3000 to 3001. Changing ports requires
updating the proxy and client connection logic, not just environment variables.

## Environment

| Variable | Consumer and meaning |
| --- | --- |
| `GEMINI_API_KEY` | Backend credential for AI analysis |
| `WS_TOKEN` | Backend browser-publisher token; required for startup |
| `VITE_WS_TOKEN` | Build-time browser token; must match `WS_TOKEN`; public in the bundle |
| `WS_CONTROL_TOKEN` | Private control credential; must differ from `WS_TOKEN` and `default_secret`; required by simulation MCP |
| `PORT` | Express HTTP/WebSocket listening port; default 3001 |
| `SIM_PORT` | Simulation MCP destination port and backend CSP WebSocket port hint; default 3001; does not set the listening port |
| `SIM_HOST` | Simulation MCP destination host; default `localhost`; current MCP transport uses `ws://` |
| `APP_URL` | Additional allowed browser origin |
| `ALLOWED_ORIGINS` | Comma-separated backend origin allowlist |
| `NODE_ENV` | Production mode enables static hosting and rejects the default publisher token |
| `VITE_BASE_PATH` | Frontend asset base path, used by Pages deployment |
| `HORIZONS_BASE_URL` | Horizons endpoint override used by backend and Horizons MCP |
| `SIMBAD_BASE_URL` | Stellar-catalog MCP endpoint override |
| `TRUST_PROXY` | Express trust-proxy setting; configure for the actual hosting topology |

All `VITE_` values are public. Set them before building and rebuild after changing
them. Browser publisher credentials do not grant the private control role.

## Commands and checks

| Command | Scope |
| --- | --- |
| `npm run dev:full` | Vite and backend together |
| `npm run dev` / `npm run server` | Run either service separately |
| `npm run lint` | ESLint followed by TypeScript checking |
| `npm run typecheck` | TypeScript only |
| `npm run build` | Build client into `dist/` |
| `npm test` | Registered E2E suites, WebSocket authentication tests, orbit-rendering tests |
| `npm run test:mcp` | Standalone MCP protocol/tool checks |
| `npm run test:appearance` | Chromium/WebGL appearance smoke checks |
| `npm run benchmark:physics` | Physics benchmark and JSON output |
| `npm run verify:physics` | Stellar-physics citation checks and typecheck |
| `npm run preview` | Preview built client; does not start the backend |
| `npm start` | Production Express server; build `dist/` first |

For code changes, run lint, build, and tests. Add MCP checks for MCP changes.
The CI workflow runs lint, build, tests, and a nonblocking dependency audit.
For documentation-only changes, check local links, commands, and consistency
with source; do not claim runtime tests passed unless actually run.

`npm test` starts a backend on port 3001: stop your development backend first.
Its E2E runner explicitly lists the included suites in
[`run-e2e-tests.ts`](../scripts/run-e2e-tests.ts); it does not discover every test
file. These suites include source-contract, math, worker, and HTTP checks, so
the E2E label does not imply every check launches a browser. Catalog tests may
call external services; report network failures separately from local failures.

Additional checks:

```bash
node node_modules/tsx/dist/cli.mjs scripts/verify-physics.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-astrobiology.ts
node scripts/validate-shaders.mjs
# Build first; this suite launches Vite preview itself.
node node_modules/tsx/dist/cli.mjs scripts/e2e/mobile-rendered-layout.test.ts
```

Shader validation requires `glslangValidator` on PATH. The standalone mobile
layout suite requires a build and Chromium; it reports a skip if Chromium is
unavailable. Appearance smoke tests fail if Chromium cannot start. Set
`CHROME_PATH` for your browser executable and `APPEARANCE_ARTIFACT_DIR` to retain
appearance screenshots. Software-rendered timings are not mobile GPU benchmarks.

## MCP setup

Configure your MCP host to launch these stdio processes from the repository root
(or use absolute script paths):

```bash
node server/mcp/nasa-horizons.mjs
node server/mcp/stellar-catalog.mjs
node --env-file=.env server/mcp/sim-state.mjs
```

These commands are MCP host entry points, not interactive command-line tools.
The scripts do not load `.env` automatically; supply environment variables
through the host or Node's `--env-file` option. Live simulation access requires
the backend, an open browser, and matching private `WS_CONTROL_TOKEN` values in
the backend and MCP process. Catalog tools can operate independently.

The checked-in plugin bundle contains a manifest, skills, and rules. The
historical [plugin implementation plan](../AETHERGENESIS_AGY_PLUGIN.md) also
proposes `hooks.json` and `mcp_config.json`; those files are not currently shipped.

## Deployment

For a full application, serve `dist/`, `/api`, and WebSockets on the same public
origin. `npm start` provides this arrangement after `npm run build`. Render's
[`render.yaml`](../render.yaml) defines this deployment. Configure its environment
values before building; add `WS_CONTROL_TOKEN` separately if control is needed.
The current blueprint does not declare that variable.

The [Pages workflow](../.github/workflows/deploy.yml) publishes static assets
with `/aethergenesis/` as their base path. It does not deploy Express or inject
`VITE_WS_TOKEN`. The client uses relative API URLs and same-host WebSockets in
production, so Pages plus a separate Render backend is **not wired together by
the current configuration**. Supporting split origins requires client connection
configuration or an appropriate proxy and matching backend origin settings.

## Troubleshooting

- Missing `WS_TOKEN`: configure `.env` and restart the backend.
- Missing `VITE_WS_TOKEN`: configure `.env`, restart Vite, or rebuild production assets.
- WebSocket disconnects: check token equality, allowed origin, port, and whether the backend is running.
- AI analysis fails: check the backend Gemini key; never move it into a `VITE_` variable.
- Empty MCP state: open the application and confirm its WebSocket connection.
- Port 3001 already in use during tests: stop the development backend before running `npm test`.
- Chromium rendering fails on Termux: use a supported browser/device environment for rendered checks and report the limitation.
