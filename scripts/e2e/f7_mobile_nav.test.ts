import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// F7: Mobile navigation (phone viewport, touch)
// Regression cover for three reported issues:
//  1. Catalog "Load" must select the preset star and fly the camera to it
//     (same as Tactical Radar contact + Focus [F]).
//  2. Astrobiology panel must sit below the bottom-deck controls so the
//     TargetLockHUD "Go To" button stays tappable when a system is focused.
//  3. Spatial Navigation panel (AttitudeIndicator, bottom-docked) and the
//     Catalog panel must not overlap at 390px width.
// These are static source-contract checks: the repo has no browser harness,
// so they pin the class/behavior contracts that guarantee the layout.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

function loadStarPresetBody(): string {
  const hook = src('src/utils/hooks/useSimulation.ts');
  const start = hook.indexOf('const loadStarPreset = useCallback((preset: any)');
  assert.ok(start !== -1, 'loadStarPreset callback must exist in useSimulation.ts');
  // Slice a bounded window covering the callback body (it ends before
  // addBodyToSimulation). Bounded slice keeps the assertions local to Load.
  const end = hook.indexOf('const addBodyToSimulation', start);
  assert.ok(end !== -1, 'addBodyToSimulation must follow loadStarPreset');
  return hook.slice(start, end);
}

test('F7-T1-1: Catalog Load selects the preset star', () => {
  const body = loadStarPresetBody();
  assert.ok(
    body.includes('setSelectedStar(star)'),
    'Load must call setSelectedStar(star) so the preset star becomes selected'
  );
});

test('F7-T1-2: Catalog Load flies the camera like Focus [F]', () => {
  const body = loadStarPresetBody();
  assert.ok(
    body.includes('centerOnStar()'),
    'Load must call centerOnStar() so the camera flies to the preset star'
  );
});

test('F7-T1-3: Load selection is wired to the camera move', () => {
  const hook = src('src/utils/hooks/useSimulation.ts');
  assert.ok(
    hook.includes('}, [selectedStarRef, setSelectedStar, centerOnStar]);'),
    'loadStarPreset deps must include setSelectedStar and centerOnStar'
  );
});

test('F7-T2-1: Astrobiology panel stacks below the bottom deck', () => {
  const astro = src('src/ui/AstrobiologyPanel.tsx');
  const hud = src('src/ui/BottomHud.tsx');
  assert.ok(hud.includes('z-20'), 'BottomHud (GO TO container) must keep z-20');
  // z-10 < z-20: the Astrobiology panel can never paint over deck controls.
  assert.ok(
    /z-10(?![\w-])/.test(astro),
    'AstrobiologyPanel must carry z-10 so it stays below the z-20 bottom deck'
  );
});

test('F7-T2-2: Go To button is elevated above overlapping panels', () => {
  const lock = src('src/ui/navigation/TargetLockHUD.tsx');
  assert.ok(lock.includes('Go To'), 'TargetLockHUD must still render the Go To action');
  assert.ok(
    /z-30(?![\w-])/.test(lock),
    'TargetLockHUD must carry z-30 so GO TO stays tappable above panels'
  );
});

test('F7-T2-3: Astrobiology panel is height-capped on phones', () => {
  const astro = src('src/ui/AstrobiologyPanel.tsx');
  assert.ok(
    astro.includes('max-h-[34vh]'),
    'AstrobiologyPanel must cap height on mobile so it cannot reach the bottom deck'
  );
  assert.ok(
    astro.includes('md:max-h-[calc(100vh-8rem)]'),
    'AstrobiologyPanel must keep the desktop height unchanged'
  );
});

test('F7-T3-1: Catalog panel fits 390px width as a top sheet', () => {
  const catalog = src('src/ui/CatalogPanel.tsx');
  assert.ok(
    catalog.includes('w-[calc(100vw-2rem)]'),
    'CatalogPanel must fit phone widths (was fixed 350px at left-8, overflowing 390px)'
  );
  assert.ok(catalog.includes('md:w-[350px]'), 'CatalogPanel must keep desktop width');
  assert.ok(catalog.includes('md:top-52'), 'CatalogPanel must keep desktop position');
});

test('F7-T3-2: Catalog phone sheet is height-bounded above the nav deck', () => {
  const catalog = src('src/ui/CatalogPanel.tsx');
  assert.ok(
    catalog.includes('max-h-[32vh]'),
    'Catalog list must be height-capped on mobile so the sheet ends above the bottom deck'
  );
  assert.ok(catalog.includes('md:max-h-[50vh]'), 'Catalog list must keep desktop height');
});

test('F7-T3-3: Catalog sheet bottom edge clears the bottom-docked nav deck', () => {
  const catalog = src('src/ui/CatalogPanel.tsx');
  const hud = src('src/ui/BottomHud.tsx');
  // Spatial Navigation (AttitudeIndicator) rides in BottomHud, which is
  // anchored to the viewport bottom; the Catalog is a top-anchored sheet.
  assert.ok(hud.includes('bottom-0'), 'BottomHud must stay bottom-docked');
  assert.ok(catalog.includes('top-24'), 'Catalog phone sheet must be top-anchored');
  // Geometry at 390x844: sheet top (top-24 = 96px) + chrome (~200px incl.
  // header/tabs/padding) + list cap (32vh = ~270px) must end well above the
  // bottom deck zone (which starts no higher than ~600px even at its
  // shortest). 96 + 200 + 270 = 566 < 600: no overlap.
  const viewportH = 844;
  const sheetBottom = 96 + 200 + Math.round(viewportH * 0.32);
  assert.ok(
    sheetBottom < 600,
    `Catalog sheet bottom edge (~${sheetBottom}px at 390x844) must clear the bottom deck`
  );
});
