# ÆTHERGENESIS — Agy Fix Prompts (2026-08-28)

Source: `aethergenesis-code-review_2f5528ac.md`, verified against commit `94fb6eb`.
The uploaded zip today is **byte-identical** to that commit — nothing has changed,
so this is the same codebase, not a fresh audit.

**F5 is dropped.** Proven false by direct instrumentation (call-counter harness on
`nbodyWorker.ts`): `calculateAccelerations()` runs exactly once per substep, 1:1,
verified at both normal load (1-2 substeps/tick) and forced heavy load (64 substeps
in one tick). The cache already works. Nothing to fix.

Each prompt below is scoped to one branch, 1-3 files, matching your usual workflow.
Verify with `npm run typecheck && npm run build && npm run lint && npm test` before
committing each one — same as always. Ordered by priority.

---

## 1. F1 — CI audit gate (branch: `fix/ci-audit-gate-order`)

**Files:** `.github/workflows/ci.yml`, `package-lock.json`

```
In .github/workflows/ci.yml, move the "Run Security Audit" step (npm audit
--audit-level=high) to run AFTER `npm test`, as the last step in the job, and add
`continue-on-error: true` to it. This ensures lint/build/test always execute and
their pass/fail status is always visible, and a future transitive-only advisory
can never again silently mask a real regression in first-party code.

Then run `npm audit fix` (do NOT use --force) in the repo root and commit the
updated package-lock.json. This resolves all 7 current advisories (ip-address,
fast-uri, hono, @hono/node-server, postcss, nanoid, brace-expansion) via transitive
version bumps within existing semver ranges — no package.json change, no SDK
version bump needed. Confirm package.json is untouched by the fix (git diff
package.json should be empty).

Verify typecheck, build, lint, and the full E2E suite all still pass after the
audit fix, then push and confirm the next Actions run on main is green.
```

---

## 2. F3 — Real integrator conservation test (branch: `fix/f3-real-integrator-conservation`)

**Files:** `scripts/e2e/f3_galaxy.test.ts`, `src/simulation/nbodyWorker.ts`

```
In src/simulation/nbodyWorker.ts, add the `export` keyword to `function physicsTick()`
(line ~206). This is additive only — it does not change how the file behaves when
loaded as a real browser Worker via self.onmessage, since nothing else changes.

In scripts/e2e/f3_galaxy.test.ts:

1. Delete the local `leapfrogIntegrateStep()` function entirely (lines 4-39) — it
   duplicates real physics and is never checked against the actual integrator.

2. Add this shim at the top of the file, before any other imports, so the worker
   module's self.onmessage/postMessage calls run safely in Node:
     (globalThis as any).self = globalThis;
     (globalThis as any).postMessage = (msg: any) => { lastPosted = msg; };
     let lastPosted: any = null;
   Then `import { physicsTick } from '../../src/simulation/nbodyWorker';`

3. Replace F3-T1-27 ("Symplectic Leapfrog Integration Step Updates Position") and
   any other test that exercises integration math with a real conservation test:
   - Fire a real INIT message via self.onmessage({data:{type:'INIT', payload:{...}}})
     with a simple two-body Kepler setup: 1.0 M☉ central mass, one body at 1 AU
     with circular orbital velocity (vy = 2*PI AU/yr), dt_yr = 1/365.25, isRunning: true.
   - Call physicsTick() several thousand times (multiple full orbits).
   - After each call, read the position/velocity for the body out of `lastPosted.buffer`
     (7 floats per body: x,y,z,vx,vy,vz,type — see the packing loop in physicsTick).
   - Compute specific orbital energy (0.5*v² - G_mu*M/r) at the very first and very
     last captured state.
   - Assert the relative energy drift between first and last is under a tight
     tolerance (start with 1e-3 relative; tighten if it passes comfortably). This
     is a real symplectic-integrator conservation check and only passes if
     nbodyWorker.ts's actual integrate()/calculateAccelerations() are correct —
     it would have caught the F4 clamp bug if the clamp had fired during the test.

4. F3-T1-26 ("Galaxy Sandbox Initialization") currently asserts a literal against
   itself (galaxy1Stars=800; assert galaxy1Stars>=800) and touches no product code.
   There is no server-side galaxy/collision endpoint and no single exported
   constant for galaxy sandbox star counts in the current codebase (grep confirmed
   this). Do NOT invent a fake endpoint or constant to test against. Either:
   (a) delete this test, or
   (b) if you find a real client-side source of truth for the galaxy sandbox star
       count while working in this area, import and assert against that instead.
   If deleting, leave a one-line comment explaining why (no real source of truth
   exists yet to test against).

Keep F1/F2/F4 test files untouched — F1 and F4 already exercise real code and
don't need changes.
```

---

## 3. F4 — Comet clamp bound + loud warning (branch: `fix/f4-comet-clamp-bound`)

**Files:** `src/simulation/nbodyWorker.ts`

```
In the integrate() function (~line 175-186), the position clamp currently fires
at 200 AU (40000.0 = 200² in the distSq check), which is below Hale-Bopp's real
aphelion_au: 371.1 from your own catalog (server.ts:789) — meaning a legitimate
catalog comet hits this "anti-infinity" backstop and gets silently rescaled and
slowed by 90%.

Raise the threshold to 1,000,000.0 (1000 AU²... i.e. use 1000*1000 = 1000000.0 as
the new distSq bound, giving a 1000 AU radius) — this clears Hale-Bopp with real
headroom. Note: if live SBDB/Horizons imports can return interstellar objects or
very long-period comets with aphelia beyond 1000 AU, this bound may need to go
higher still or use a different strategy entirely (e.g. per-body max distance
instead of one global constant) — flag this back to Drew rather than guessing
further if you find evidence of that while working in this file.

When the clamp DOES trip, add a console.warn (or self.postMessage of a warning
event, matching how other diagnostics in this file communicate) logging which
body index/id triggered it and the distance it was clamped from, so this is
visible instead of silent. Keep the underlying NaN/Infinity guard behavior itself
— only the threshold and the silence are the problems.
```

---

## 4. F6a — Luminosity class misclassification (branch: `fix/f6-luminosity-class-regex`)

**Files:** `server.ts`

```
server.ts:458-464 currently only distinguishes III vs "everything else containing
the letter I", so classes II, IV, VI, and VII are all misclassified — II/VI/VII
wrongly get the x100/x10 supergiant multiplier via the includes('I') fallthrough,
and IV isn't handled as a distinct tier at all. The MCP copy in
server/mcp/stellar-catalog.mjs (lines ~354-370) already has the complete, correctly
anchored version. Replace server.ts's block:

    if (cleanSp.includes('III')) {
      rad = rad * 10;
      mass = mass * 1.5;
    } else if (cleanSp.includes('I')) {
      rad = rad * 100;
      mass = mass * 10;
    }

with the full Morgan-Keenan ladder from stellar-catalog.mjs (VII → VI → IV → III →
II → I, each anchored with \b word boundaries, same multipliers). Copy it verbatim
so both entry points classify identically — do not paraphrase the regex.

Add a regression test to scripts/test-mcp-servers.ts (same file/pattern as the
existing pdes-comet-classification Test 2.4) asserting: "B2II" and "B2VI" and
"B2VII" do NOT get the x100/x10 multiplier, "B2I" and "B2Ia" DO.
```

---

## 5. F6b — Single-source the catalog (branch: `fix/f6-single-source-catalog`) — bigger, do separately

**Files:** `server.ts`, `server/mcp/stellar-catalog.mjs`, new shared module

```
This is the larger architectural piece from F6 — treat it as its own session with
extra review, not squeezed in with F6a above.

Extract the preset star catalog array (server.ts:156-405 /
server/mcp/stellar-catalog.mjs) and the estimateParams() spectral-class estimator
into one shared module (suggest server/shared/stellarCatalog.mjs, since both the
Express server and the MCP server are Node-side and can both import a .mjs) that
both server.ts and server/mcp/stellar-catalog.mjs import from, instead of keeping
two independently-maintained copies. Preserve all existing exported function
signatures each file currently relies on so callers don't need to change. Run the
full E2E suite plus test:mcp after — this touches code both entry points depend on.
```

---

## 6. F8/F9 — Docs accuracy + cleanup (branch: `fix/docs-accuracy-and-cleanup`)

**Files:** `README.md`, `CHANGELOG.md`, `package.json`, doc moves

```
1. package.json: bump "version" from "1.0.0" to "3.0.0". CHANGELOG.md's own
   history (1.0.0 → 2.0.0 → 3.0.0, dated entries) confirms 3.0.0 is the real,
   already-released version — package.json's field is the stale one, not the
   README badge (which already correctly says 3.0.0).

2. README.md line 26: "Watch 500,000 stars ignite" overstates the real ceiling by
   ~100x. Actual: 5,000 decorative (non-simulated) background points
   (engine.ts:237) plus up to 600 simulated hero stars at 'ultra' performance tier
   (performance.ts). Rewrite to state the real numbers.

3. README.md line 54 AND the matching line in CHANGELOG.md's [3.0.0] entry both
   say "24-octave convective solar granulation" — actual FBM octaves are 5
   (noise.glsl:21) / 3 for the high-perf variant (noise.glsl:34). The "24" is
   actually the noise-frequency multiplier in starSurface.frag.glsl:29
   (`fbm(vLocalPosition * 24.0 * uTurbulence + ...)`) — not an octave count and
   not a raymarch step count. Fix the wording in both files to describe it
   accurately (e.g. "domain-warped 5-octave FBM noise with high-frequency
   granulation detail") rather than calling it "24-octave".

4. Move AETHERGENESIS-VERIFICATION-2026-08-25.md, AETHERGENESIS_REVIEW_AND_HANDOFF.md,
   and RED-GIANT-SCORCH-PORT.md into docs/audits/. Do NOT move
   AETHERGENESIS_AGY_PLUGIN.md — it's a living tooling spec (the agy plugin bundle
   definition), not a dated audit. Do NOT move PROJECT-LOG.md — it's the active
   architect/executor handoff doc per project convention.

   (Aside, not part of this prompt's scope: AETHERGENESIS_AGY_PLUGIN.md's header
   says "Model: Gemini 3.5 Flash" — worth a look at whether that's stale given
   agy currently runs 3.7 Flash per recent sessions. Separate task, flag to Drew.)

Leave PROJECT-LOG.md's stale "ARCHITECT SIGN-OFF" section (dated May 14, doesn't
reflect June-August work) alone — also a separate task, not this one.
```

---

## 7. F7 — InspectPanel cleanup (branch: `fix/f7-inspectpanel-effects-abort`)

**Files:** `src/ui/InspectPanel.tsx`

```
Two useEffect hooks do the same setGeminiData(null)/setAnalysisFailed(false) reset
on different deps: line ~60-63 keys on [selectedStar?.physicsId], line ~182-185
keys on [selectedStar] (fires on every new object identity, not just real star
changes). Delete the second one (line ~182-185); keep the physicsId-keyed version.

In analyzeSystem() (~line 131-179), the fetch('/api/analyze') call has no
AbortController, so deselecting a star mid-request can call setGeminiData after
unmount. CatalogPanel.tsx already handles this correctly for its own fetch — copy
that exact AbortController pattern (create it at the top of the effect/handler,
pass signal to fetch, abort in cleanup, guard the state-setting calls behind an
aborted check) into analyzeSystem().
```

---

## 8. F2 addendum — WS token framing + client fallback (branch: `fix/ws-token-framing-and-fallback`)

**Files:** `src/utils/hooks/useWebSocket.ts`, `src/simulation/SimStateSocket.ts`

```
Two separate small fixes, same area:

1. useWebSocket.ts line ~23 currently has:
     const wsToken = import.meta.env.VITE_WS_TOKEN || 'default_secret';
   Remove the '|| default_secret' fallback. If VITE_WS_TOKEN is unset at build
   time, this should fail loudly (console.error at minimum, ideally thrown in dev
   mode) instead of silently shipping a client that tries a guessable default —
   matching the server side, which already fails loudly on missing WS_TOKEN
   (SimStateSocket.ts and server/mcp/sim-state.mjs both already do this correctly,
   no changes needed there).

2. SimStateSocket.ts's error strings currently say "Unauthorized: Invalid security
   token" and comments say "enforce mandatory WS_TOKEN" — this invites the belief
   the socket is authenticated when the token is actually inlined into the public
   client bundle at build time (unavoidable for a static frontend) and only
   guards against casual cross-origin use. The real protection is the origin
   check, connection cap, rate limit, and ALLOWED_EVENTS whitelist elsewhere in
   this file. Reword the error strings/comments to reflect this (e.g. "Invalid
   handshake key" instead of "Invalid security token") so a future reader doesn't
   build a false trust assumption on it. Variable/env names can stay as WS_TOKEN/
   VITE_WS_TOKEN to keep this a small diff — only the language changes.
```
