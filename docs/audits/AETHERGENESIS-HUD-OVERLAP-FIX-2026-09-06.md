# AetherGenesis — Bottom HUD Overlap Fix Prompt

**Status:** Diagnosed, not yet implemented. No fresh repo zip reviewed for this round — verify exact JSX/props below against current source before editing, since file/line specifics may have drifted since the last audit.

## Root cause

`NavigationDeck` (renders Spatial Navigation panel + Tactical Radar) and `Hud` (renders the center Global Cosmic Age card + right icon-button cluster) are two **independent components**, both mounted at `z-20` in `AetherGenesis.tsx`, each assuming it owns the full width of the bottom row. There is no shared layout parent negotiating space between them, so on narrower viewports the center age card overlaps the left nav panel and the right icon cluster. Confirmed 100% reproducible at the reported device width across 6 screenshots (different scene states, same overlap every time) — this is a deterministic CSS layout bug, not a race condition or intermittent state issue.

## Fix approach

Merge the bottom row into one shared flex parent so the three regions negotiate width together instead of independently overlapping:

1. Wrap the three bottom-row regions (left: NavigationDeck's nav/radar cluster, center: Hud's age card, right: Hud's icon-button cluster) in a single flex container — likely needs lifting into `AetherGenesis.tsx` or a new shared `BottomHudRow` wrapper component, since the two are currently siblings with no shared parent.
2. Left and right regions: `flex: 0 1 auto; min-width: 0;` — they shrink but don't get force-stretched.
3. Center age card: `flex: 1 1 auto; max-width: min(220px, 30vw);` — matches the existing `Hud.tsx` age-card cap pattern (`w-full max-w-[220px]`, already applied per the Aug 21 fix) but ties it to viewport width too.
4. Add `flex-wrap: wrap` on the shared parent as a fallback — if all three genuinely can't fit on one row at a given width, the age card should drop to its own row below rather than overlap anything.
5. Preserve existing z-20 stacking and safe-area padding (`pb-[max(2rem,env(safe-area-inset-bottom))]`) already present on Hud's bottom bar.

## Verification steps for agy

- `npm run typecheck && npm run build` must pass clean.
- Full E2E suite (`npm run dev:full` target) must still pass — 49 tests as of last confirmed baseline.
- Manual/on-device check at the reported narrow viewport width: confirm no visual overlap across at least 2 different scene states (different star selected, cosmic-age slider at different positions), since that's the condition that was screenshotted as broken.
- Also spot-check a wide viewport to confirm the wrap fallback doesn't trigger unnecessarily and the row still looks like the original 3-across layout when there's room.
- Report back with a `git diff --stat` or commit SHA — per standing practice, "done" claims aren't accepted without one.

## Open question to flag back to Drew after the fix lands

Whether `AttitudeIndicator.tsx`'s existing `max-w-[190px]` cap (from the Aug 25/26 fix) needs any adjustment once it's inside the new shared flex parent, or whether it composes cleanly as-is.
