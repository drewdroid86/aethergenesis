import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// F10: ConstantsPanel joins the phone top-cluster column (<=480px)
// The physics-constants panel (lucide Settings2) used to float at
// `absolute left-8 top-32` (closed: later `fixed` at 44vh) on every
// viewport, landing mid-stack over the SCALE LADDER panel and the
// YOU ARE HERE badge at phone widths. Contract:
//  - no unqualified `absolute left-8 top-32`: desktop positioning is
//    gated behind min-[481px] so phones never take the floated path,
//  - BOTH states (closed toggle, open panel) go static/in-flow at
//    <=480px with no hardcoded phone pixel offsets,
//  - ConstantsPanel renders inside the existing height-bounded
//    scrollable top-cluster column (reused, not duplicated),
//  - panel controls stay touch-reachable (>=44px) on phones,
//  - desktop classes are unchanged,
//  - the YouAreHereBadge nearest-star toggle fix is not regressed.
// Static source-contract checks in the f7/f8 style.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

test('F10-1: No unqualified floating position; desktop absolute is gated behind non-mobile', () => {
  const constants = src('src/ui/ConstantsPanel.tsx');
  assert.ok(
    !constants.includes('absolute left-8 top-32'),
    'unqualified `absolute left-8 top-32` must be gone: phones must never take the floated path'
  );
  assert.ok(
    constants.includes('min-[481px]:absolute'),
    'desktop absolute positioning must be gated behind min-[481px]'
  );
  assert.ok(
    constants.includes('min-[481px]:left-8') && constants.includes('min-[481px]:top-32'),
    'desktop offsets must be gated behind min-[481px] too'
  );
});

test('F10-2: No floating or hardcoded phone offsets at <=480px', () => {
  const constants = src('src/ui/ConstantsPanel.tsx');
  assert.ok(
    !constants.includes('max-[480px]:fixed'),
    'neither state may float via fixed at phone widths'
  );
  assert.ok(
    !constants.includes('max-[480px]:left-4'),
    'no hardcoded phone left offset'
  );
  assert.ok(
    !constants.includes('max-[480px]:top-['),
    'no hardcoded phone top offset'
  );
});

test('F10-3: Both panel states join the in-flow column at <=480px', () => {
  const constants = src('src/ui/ConstantsPanel.tsx');
  const staticOverrides = constants.split('max-[480px]:static').length - 1;
  assert.ok(
    staticOverrides >= 2,
    `both states (closed toggle + open panel) need a max-[480px]:static flow override, found ${staticOverrides}`
  );
  assert.ok(
    constants.includes('max-[480px]:order-4'),
    'constants must order after the deck bar inside the phone column'
  );
  assert.ok(
    constants.includes('max-[480px]:self-start'),
    'closed toggle must not stretch full-width as a column item'
  );
  assert.ok(
    constants.includes('max-[480px]:max-w-full'),
    'open panel must fit phone widths'
  );
  assert.ok(
    constants.includes('max-[480px]:mx-4'),
    'open panel must keep column gutters instead of touching the edges'
  );
});

test('F10-4: ConstantsPanel renders inside the existing scrollable column (reused, not duplicated)', () => {
  const genesis = src('src/components/AetherGenesis.tsx');
  const topStart = genesis.indexOf('renderTop={(topBar)');
  const bottomStart = genesis.indexOf('renderBottom=');
  assert.ok(topStart !== -1 && bottomStart > topStart, 'renderTop column must exist');
  const column = genesis.slice(topStart, bottomStart);
  assert.ok(
    column.includes('<ConstantsPanel'),
    'ConstantsPanel must be composed inside the renderTop column so opening it pushes the column in-flow'
  );
  assert.ok(
    column.includes('max-[480px]:max-h-[40vh]'),
    'the reused column must stay height-bounded so the canvas keeps room and touch'
  );
  assert.ok(
    !genesis.includes('max-[480px]:max-h-[40vh]', bottomStart),
    'no second phone column may be introduced elsewhere'
  );
});

test('F10-5: Closed toggle stays small, reachable, and opens the panel', () => {
  const constants = src('src/ui/ConstantsPanel.tsx');
  assert.ok(
    constants.includes('aria-label="Open Physical Constants"'),
    'constants toggle must remain reachable'
  );
  assert.ok(
    constants.includes('max-[480px]:w-[52px]') && constants.includes('max-[480px]:h-[52px]'),
    'closed state stays a small 52px in-flow toggle button (>=44px touch target)'
  );
  assert.ok(
    constants.includes('data-testid="constants-toggle"') &&
      constants.includes('data-testid="constants-panel"'),
    'both states must be addressable for rendered layout checks'
  );
});

test('F10-6: Open-panel controls stay touch-reachable on phones', () => {
  const constants = src('src/ui/ConstantsPanel.tsx');
  assert.ok(
    constants.includes('max-[480px]:min-h-[44px]'),
    'panel icon buttons (reset/close) must meet a 44px touch target on phones'
  );
  assert.ok(
    constants.includes('max-[480px]:min-w-[44px]'),
    'panel icon buttons (reset/close) must meet a 44px touch target on phones'
  );
});

test('F10-7: Desktop layout unchanged', () => {
  const constants = src('src/ui/ConstantsPanel.tsx');
  assert.ok(
    constants.includes('w-[min(320px,85vw)]'),
    'open panel must keep desktop width'
  );
  assert.ok(
    constants.includes('rounded-full p-4'),
    'closed toggle must keep desktop shape'
  );
  assert.ok(constants.includes('z-30'), 'constants must keep desktop paint order');
});

test('F10-8: Nearest-star toggle fix not regressed', () => {
  const badge = src('src/ui/navigation/YouAreHereBadge.tsx');
  assert.ok(
    badge.includes('aria-label="Toggle Technical Coordinates"'),
    'badge must keep a toggle control for the collapsed nearest-star block'
  );
  assert.ok(
    badge.includes("flex flex-col text-right min-w-0 ${isTechnicalOpen ? '' : 'max-[480px]:hidden'}"),
    'collapse must hide only the nearest-star text, leaving the toggle visible'
  );
  assert.ok(
    badge.includes('max-[480px]:min-h-[44px]'),
    'toggle must keep its 44px phone touch target'
  );
});
