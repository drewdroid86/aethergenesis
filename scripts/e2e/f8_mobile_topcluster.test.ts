import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// F8: Mobile top-cluster pile-up (<=480px, 390x844)
// At phone widths the floating top cluster (header, stats pill,
// breadcrumbs/Universe pill, scale ladder, location badge, compass and
// telemetry panels) overlaps itself and clips off-screen. Contract:
//  - the persistent top cluster leaves absolute positioning and stacks as
//    a single in-flow column at <=480px (desktop untouched),
//  - secondary panels (stats, nearest star, compass/telemetry) collapse
//    behind toggles on phones,
//  - the bottom deck is height-bounded with internal scroll so it never
//    reaches the top cluster,
//  - nothing overflows 390px horizontally.
// Static source-contract checks: the repo has no browser harness.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

test('F8-T1-1: Header nav joins the in-flow column first on phones', () => {
  const hud = src('src/ui/Hud.tsx');
  assert.ok(hud.includes('max-[480px]:static'), 'Hud nav must be static at <=480px');
  assert.ok(hud.includes('max-[480px]:order-first'), 'Hud nav must order before the deck cluster');
  assert.ok(hud.includes('absolute top-0 w-full'), 'Hud nav must keep desktop positioning');
});

test('F8-T1-2: Background-mass stats collapse behind a toggle on phones', () => {
  const hud = src('src/ui/Hud.tsx');
  assert.ok(hud.includes('statsOpen'), 'Hud must gate the stats pill on toggle state');
  assert.ok(hud.includes('aria-expanded'), 'Stats toggle must expose aria-expanded');
  assert.ok(hud.includes('min-[481px]:hidden'), 'Stats toggle must be phone-only');
  assert.ok(hud.includes('min-[481px]:flex'), 'Stats pill must stay visible on desktop');
});

test('F8-T2-1: Top instrumentation bar stacks full-width on phones', () => {
  const deck = src('src/ui/navigation/NavigationDeck.tsx');
  assert.ok(deck.includes('max-[480px]:static'), 'Top bar must be static at <=480px');
  assert.ok(deck.includes('max-[480px]:flex-col'), 'Top bar must stack vertically on phones');
  assert.ok(
    deck.includes('absolute top-20 left-8 right-8'),
    'Top bar must keep desktop positioning'
  );
});

test('F8-T2-2: Universe pill wraps instead of clipping on phones', () => {
  const crumbs = src('src/ui/navigation/SpatialBreadcrumbs.tsx');
  assert.ok(crumbs.includes('max-[480px]:flex-wrap'), 'Breadcrumbs must wrap at <=480px');
  assert.ok(crumbs.includes('<span>Universe</span>'), 'Universe pill must remain reachable');
});

test('F8-T2-3: Nearest-star block collapses behind a toggle on phones', () => {
  const badge = src('src/ui/navigation/YouAreHereBadge.tsx');
  assert.ok(badge.includes('max-[480px]:max-w-full'), 'Badge must fit phone width');
  assert.ok(badge.includes('max-[480px]:hidden'), 'Nearest-star block must collapse on phones');
  assert.ok(badge.includes('isTechnicalOpen'), 'Collapse must reuse the badge toggle state');
  assert.ok(badge.includes('truncate'), 'Nearest-star text must truncate instead of clipping');
});

test('F8-T2-4: Nearest-star toggle stays tappable on phones', () => {
  const badge = src('src/ui/navigation/YouAreHereBadge.tsx');
  assert.ok(
    badge.includes('aria-label="Toggle Technical Coordinates"'),
    'Badge must keep a toggle control for the collapsed nearest-star block'
  );
  // The collapse class must sit on the text block only, not on the wrapper
  // that also contains the toggle button — otherwise phones can never
  // expand the nearest-star info back open.
  assert.ok(
    badge.includes("flex flex-col text-right min-w-0 ${isTechnicalOpen ? '' : 'max-[480px]:hidden'}"),
    'Collapse must hide only the nearest-star text, leaving the toggle visible'
  );
  assert.ok(
    badge.includes('max-[480px]:min-h-[44px]'),
    'Toggle must meet a 44px touch target on phones'
  );
});

test('F8-T3-1: Compass/telemetry cluster collapses behind a toggle on phones', () => {
  const deck = src('src/ui/navigation/NavigationDeck.tsx');
  assert.ok(deck.includes('telemetryOpen'), 'FlightDeckTelemetry must gate content on toggle state');
  assert.ok(deck.includes('min-[481px]:hidden'), 'Telemetry toggle must be phone-only');
  assert.ok(
    deck.includes('max-[480px]:hidden'),
    'Telemetry content must collapse on phones when closed'
  );
});

test('F8-T3-2: Bottom deck is height-bounded with internal scroll on phones', () => {
  const hud = src('src/ui/BottomHud.tsx');
  assert.ok(hud.includes('max-[480px]:max-h-[38vh]'), 'BottomHud must be height-bounded on phones');
  assert.ok(hud.includes('max-[480px]:overflow-y-auto'), 'BottomHud must scroll internally on phones');
  assert.ok(hud.includes('absolute bottom-0'), 'BottomHud must keep desktop docking');
});


test('F8-T3-3: Diagnostics overlay joins the column instead of floating on phones', () => {
  const hud = src('src/ui/Hud.tsx');
  assert.ok(
    hud.includes('max-[480px]:static'),
    'Diagnostics overlay must be static at <=480px'
  );
  assert.ok(hud.includes('absolute top-24 right-4'), 'Diagnostics must keep desktop placement');
});
