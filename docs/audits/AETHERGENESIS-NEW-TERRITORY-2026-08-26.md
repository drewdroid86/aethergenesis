# AetherGenesis — New Territory Findings, August 26, 2026

**Scope**: Three subsystems that have never appeared in any prior audit — `src/audio/`, `server/mcp/nasa-horizons.mjs`, `server/mcp/sim-state.mjs` + its WebSocket auth counterpart. Also confirmed: the `AttitudeIndicator.tsx` max-w fix from the last session landed correctly (`w-full max-w-[190px]` present, line 36).

Three real, previously-unknown bugs found. Ready-to-paste agy prompts below for each.

---

## Finding 1 — Audio is silent app-wide until a specific button is clicked twice

**Files**: `src/audio/AudioEngine.ts`, `src/ui/Hud.tsx` (line 521)

`audioEngine.init()` — the only thing that creates the `AudioContext` — is called from exactly one place in the whole app: inside the Audio toggle button's `onClick` in `Hud.tsx`. Every other `playUiClick()` call site (there are 20+, across `TacticalRadar`, `SpatialBreadcrumbs`, `TargetLockHUD`, `AttitudeIndicator`, `YouAreHereBadge`, `TargetWaypointHUD`) silently no-ops until that context exists, because `playUiClick()` guards on `if (!this.ctx || this.isMuted) return`.

Worse, the button's handler runs `init()` → `playUiClick()` → `toggleMute()` in that order. On a fresh session `isMuted` defaults to `false`, so: click 1 inits audio, plays one blip, then immediately mutes everything (including the ambient drone that just started). Click 2 is needed to actually unmute. Net effect: a user has to find and double-click the one Audio icon before *anything* in the app makes sound — and if they click any other button first, they get total silence with no indication why.

**Fix**: call `audioEngine.init()` once on the app's first pointerdown/keydown anywhere (not tied to the mute button specifically), so any click ever wires up sound correctly.

```
Fix a real audio bug in AetherGenesis: audioEngine.init() (src/audio/AudioEngine.ts) is only ever called from the Audio toggle button in src/ui/Hud.tsx (line ~521), so every playUiClick() call elsewhere in the app (TacticalRadar, SpatialBreadcrumbs, TargetLockHUD, AttitudeIndicator, YouAreHereBadge, TargetWaypointHUD) silently does nothing until that one specific button has been clicked. Also, that button's onClick runs init() then playUiClick() then toggleMute() in that order, so the very first click mutes everything right after briefly unmuting it.

Add a one-time global listener (first pointerdown or keydown on the window, in AetherGenesis.tsx or App.tsx — wherever the app root mounts) that calls audioEngine.init() exactly once, independent of which element was clicked. Leave the existing Audio button's own init() call in place as a harmless redundant no-op (init() already guards on `if (this.initialized) return`), but the fix is the global listener — do not remove the audio button's toggleMute behavior.

New branch. Typecheck + build, then manually trace: does any playUiClick() site now fire before the Audio button has ever been touched? Show me the diff.
```

---

## Finding 2 — Live comet/asteroid search misclassifies by checking for the letter "P" in the name

**File**: `server/mcp/nasa-horizons.mjs`, `search_small_bodies` handler

When `type: 'all'` is requested and the live JPL SBDB query succeeds, there's no `sb-kind` filter, so nothing tells the code which rows are comets vs. asteroids. It guesses:

```js
const isComet = type === 'comet' || name.includes('/') || name.includes('P');
```

`name.includes('/')` is a reasonable comet-designation check (comet names like `C/1995 O1` do contain `/`). But `name.includes('P')` is not — plenty of real asteroid names contain a capital P. The catalog's own hardcoded fallback list demonstrates this immediately: **"2 Pallas" would be misclassified as a comet** by this exact check (asteroids like Psyche, Persephone, Parthenope, Proserpina all have the same problem). A misclassified asteroid gets `coma_onset_au: 3.0, tail_onset_au: 2.5` and will render a comet tail/coma it shouldn't have.

This only affects the live-API path with `type: 'all'` — the hardcoded fallback arrays are unaffected since they set `type` explicitly per array.

```
Fix a classification bug in server/mcp/nasa-horizons.mjs's search_small_bodies handler. The live-query path (type: 'all') guesses comet-vs-asteroid via `name.includes('/') || name.includes('P')` — the 'P' check is wrong and misclassifies any asteroid whose name contains a capital P (e.g. "2 Pallas") as a comet, giving it a coma/tail it shouldn't have.

Replace the name-based guess with the actual JPL SBDB `kind` field: add `kind` to the requested `fields` param in the sbdb_query.api URL, then use that field's value (comet kinds are 'c'/'cn'/'cu'/'cp'/'ci'/'cd'/'ce'/'cx'; everything else is asteroid) instead of string-matching the name. Keep the `name.includes('/')` check only as a secondary fallback if `kind` is somehow missing from a row.

New branch, this file only. Typecheck + build, then show me the diff plus what the new field-based classification returns for a quick 'all' query including at least one P-named object.
```

---

## Finding 3 — WebSocket auth falls back to a hardcoded, now-public shared secret

**Files**: `src/simulation/SimStateSocket.ts` (line 112), `server/mcp/sim-state.mjs` (matching client-side constant)

Both sides of the sim-state WebSocket connection compute their auth token the same way:

```js
const expectedToken = process.env.WS_TOKEN || 'default_secret';
```

`SimStateSocket.ts` correctly enforces subprotocol-based auth (verifies origin, requires the header, rejects missing/mismatched tokens) — the *mechanism* is sound. But if `WS_TOKEN` is ever unset in either the server's or the MCP client's environment — which is exactly the kind of thing that's easy to miss during a deploy — both sides silently agree on the literal string `'default_secret'`. Since this repo is public on GitHub, that fallback value is now visible to anyone, making the auth check pure theater in that scenario. This is directly relevant given `render.yaml` deploy is on your near-term list (PROJECT-LOG's "NEXT PRIORITIES") — it's an easy env var to forget to set.

```
Security fix for AetherGenesis: both src/simulation/SimStateSocket.ts (line ~112) and server/mcp/sim-state.mjs compute their shared WebSocket auth token as `process.env.WS_TOKEN || 'default_secret'`. If WS_TOKEN is ever unset in either environment, both sides silently agree on the same hardcoded, publicly-visible fallback string, making the auth check meaningless.

Change both files so that if WS_TOKEN is not set, the server refuses to start (throw/exit with a clear error naming the missing env var) instead of falling back to a default value. Do not silently continue with a hardcoded token on either side.

New branch, both files. Typecheck + build, then confirm: does the server actually fail loudly and immediately when WS_TOKEN is unset locally? Show me that output plus the diff.
```

---

## Coverage ledger update

**Newly audited this pass** (previously 0% coverage): `src/audio/AudioEngine.ts`, `server/mcp/nasa-horizons.mjs`, `server/mcp/sim-state.mjs`, `src/simulation/SimStateSocket.ts` (auth path only).

**Still untouched — next up**: 13 of 14 shader files (`ejecta.*`, `lifeGlow.*`, `subDisplacement.vert`, `particle.*`, `basic.vert`, `cinematic.*`, `nebula.frag`, `utils/noise.glsl` — only `starSurface.frag.glsl` has ever been reviewed, for the smoothstep bug), the 4 `scripts/e2e/*.test.ts` files (never checked for whether the "49 E2E tests passing" gate is actually asserting anything meaningful), all 6 `.github/workflows/*.yml` files including `claude-review.yml` (unclear what this automated review actually does), `src/types/physics.ts` + `src/types/navigation.ts`, and re-confirming current status of `CatalogPanel.tsx`'s Load/Spawn handlers and `InspectPanel.tsx`'s GEMINI DEEP SCAN button (both previously flagged as dead/unwired — unconfirmed whether still true after recent HUD work).

Also worth a note: `PROJECT-LOG.md` itself is stale — its "ARCHITECT SIGN-OFF" and bug table date to May 14, 2026 and don't reflect any of the June–August work. If it's meant to be the living handoff doc, it needs a real update, not just code changes landing around it.
