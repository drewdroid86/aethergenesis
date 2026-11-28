import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASES } from '../../src/core/constants.ts';
import { formatHudPhaseLabel } from '../../src/ui/phaseLabel.ts';

// ==========================================
// F27: U4 HUD phase label ("Planetary Nebula" vs "White Dwarf")
// For remnants <= 8 M_sun (star.phase === PHASES.REMNANT &&
// star.mass <= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA):
//  - During the early shell window (star.isPlanetaryNebula === true, or
//    fallback star.t < STELLAR_CONSTANTS.PHASE_BOUNDARIES.REMNANT_START),
//    the HUD phase label reads "Planetary Nebula".
//  - After the shell fades (isPlanetaryNebula === false or t >= 1.5),
//    the HUD phase label reads "White Dwarf".
//  - Masses > 8 M_sun (Neutron Star / Black Hole) and non-remnant phases
//    keep their existing labels.
//  - Per-frame HUD updates write directly to DOM refs (uiRefs.phase.current)
//    rather than React state.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

test('F27-1: formatHudPhaseLabel gates on PHASES.REMNANT, <= 8 M_sun, and isPlanetaryNebula / REMNANT_START', () => {
  const helper = src('src/ui/phaseLabel.ts');
  assert.ok(
    helper.includes('star.phase === PHASES.REMNANT') &&
      helper.includes('star.mass <= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA'),
    'formatHudPhaseLabel must gate on PHASES.REMNANT and star.mass <= MASS_THRESHOLD_SUPERNOVA (8 M_sun)'
  );
  assert.ok(
    helper.includes('star.isPlanetaryNebula') &&
      helper.includes('star.t < STELLAR_CONSTANTS.PHASE_BOUNDARIES.REMNANT_START'),
    'formatHudPhaseLabel must read star.isPlanetaryNebula with fallback star.t < REMNANT_START'
  );

  // Low-mass remnant during shell window (explicit flag true)
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 1.0, t: 1.25, isPlanetaryNebula: true }),
    'Planetary Nebula'
  );
  // Low-mass remnant during shell window (fallback t < 1.5 when flag omitted)
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 8.0, t: 1.35 }),
    'Planetary Nebula'
  );
  // Low-mass remnant after shell fades (explicit flag false, even if t < 1.5)
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 1.0, t: 1.35, isPlanetaryNebula: false }),
    'White Dwarf'
  );
  // Low-mass remnant after shell window (t >= 1.5, e.g. Sirius B / WD preset at t = 1.55)
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 1.0, t: 1.55 }),
    'White Dwarf'
  );
  // Boundary 8.0 M_sun after shell fades -> White Dwarf
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 8.0, t: 1.55, isPlanetaryNebula: false }),
    'White Dwarf'
  );
  // Neutron star (> 8 M_sun, < 15 M_sun) must NOT be labeled Planetary Nebula or White Dwarf
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 10.0, t: 1.25, isPlanetaryNebula: false }),
    'Remnant'
  );
  // Black hole (>= 15 M_sun, e.g. Cygnus X-1) must NOT be labeled Planetary Nebula or White Dwarf
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 21.2, t: 1.55, isPlanetaryNebula: false }),
    'Remnant'
  );
  // Non-remnant phase (Main Sequence)
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.MAIN_SEQUENCE, mass: 1.0, t: 0.5 }),
    'Main Sequence'
  );
});

test('F27-2: InspectPanel writes HUD phase label directly to DOM ref (uiRefs.phase.current) without React state', () => {
  const inspect = src('src/ui/InspectPanel.tsx');
  assert.ok(
    inspect.includes("from './phaseLabel'") && inspect.includes('formatHudPhaseLabel(selectedStar)'),
    'InspectPanel must delegate to shared formatHudPhaseLabel helper'
  );
  assert.ok(
    inspect.includes('const phaseEl = uiRefs.phase.current') &&
      inspect.includes('phaseEl.innerText = label'),
    'InspectPanel must write formatHudPhaseLabel(selectedStar) directly to uiRefs.phase.current.innerText in its RAF loop'
  );
  assert.ok(
    !/useState<[^>]*>\([^)]*formatHudPhaseLabel/.test(inspect),
    'Per-frame phase label must not be stored in React state'
  );
});

test('F27-3: TargetLockHUD uses shared formatHudPhaseLabel with PHASE_TITLES', () => {
  const lock = src('src/ui/navigation/TargetLockHUD.tsx');
  assert.ok(
    lock.includes("from '../phaseLabel'") &&
      lock.includes("formatHudPhaseLabel(star, PHASE_TITLES, 'Star')"),
    'TargetLockHUD must use shared formatHudPhaseLabel helper with PHASE_TITLES'
  );
  const PHASE_TITLES: Record<number, string> = {
    0: 'Nebula Cloud',
    1: 'Protostar',
    2: 'Main Sequence',
    3: 'Red Giant',
    4: 'Supernova',
    5: 'Stellar Remnant',
  };
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 1.0, t: 1.3, isPlanetaryNebula: true }, PHASE_TITLES, 'Star'),
    'Planetary Nebula'
  );
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 1.0, t: 1.55, isPlanetaryNebula: false }, PHASE_TITLES, 'Star'),
    'White Dwarf'
  );
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 12.0, t: 1.3 }, PHASE_TITLES, 'Star'),
    'Stellar Remnant'
  );
  assert.strictEqual(
    formatHudPhaseLabel({ phase: PHASES.REMNANT, mass: 21.2, t: 1.55 }, PHASE_TITLES, 'Star'),
    'Stellar Remnant'
  );
});
