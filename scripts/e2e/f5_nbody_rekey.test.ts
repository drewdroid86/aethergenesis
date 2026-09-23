import test from 'node:test';
import assert from 'node:assert';
import { buildWorkerBodiesFromOrbits } from '../../src/simulation/OrbitalMechanics.ts';

// ==========================================
// Preset n-body re-key: worker bodies must be rebuilt from the star's
// generated planets with velocities computed under the star's CURRENT mass
// (post-mass-loss currentMass, not birth mass). Keeping old velocities under
// a new central mass leaves every orbit at the wrong energy (stale-velocity
// bug). These tests pin the velocity-mass relationship used by
// loadStarPreset's RESET_BODIES path in src/utils/hooks/useSimulation.ts.
// No server needed: pure orbital mechanics.
// ==========================================

const TWO_PI = 2 * Math.PI;

function speed(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

test('F5-1: Circular orbit speed at 1 AU around 1 Msol is 2 PI AU/yr', () => {
  const bodies = buildWorkerBodiesFromOrbits(
    [{ semiMajorAxis_au: 1.0, phaseOffset: 0.7, type: 0 }],
    1.0
  );
  assert.strictEqual(bodies.length, 1);
  assert.strictEqual(bodies[0].id, 'preset_body_0');
  const v = speed(bodies[0].velocity_au_yr);
  assert.ok(Math.abs(v - TWO_PI) / TWO_PI < 1e-9, `expected 2PI AU/yr, got ${v}`);
});

test('F5-2: Velocities scale with sqrt(centralMass) — recomputed, not stale', () => {
  const orbits = [
    { semiMajorAxis_au: 1.0, phaseOffset: 0.7, type: 0 },
    { semiMajorAxis_au: 5.2, phaseOffset: 2.1, type: 1 },
  ];
  const light = buildWorkerBodiesFromOrbits(orbits, 1.0);
  const heavy = buildWorkerBodiesFromOrbits(orbits, 4.0);
  // Stale-velocity behavior (mass-independent speeds) fails this: v(4M) = 2 * v(1M).
  for (let i = 0; i < orbits.length; i++) {
    const ratio = speed(heavy[i].velocity_au_yr) / speed(light[i].velocity_au_yr);
    assert.ok(Math.abs(ratio - 2.0) < 1e-9, `body ${i}: expected speed ratio 2.0, got ${ratio}`);
  }
});

test('F5-3: Each body satisfies circular vis-viva under the given mass', () => {
  const currentMass = 0.6; // e.g. post-mass-loss currentMass, not birth mass
  const orbits = [
    { semiMajorAxis_au: 0.5, phaseOffset: 1.3, type: 0 },
    { semiMajorAxis_au: 2.0, phaseOffset: 4.0, type: 2 },
    { semiMajorAxis_au: 9.5, phaseOffset: 5.5, type: 1 },
  ];
  const bodies = buildWorkerBodiesFromOrbits(orbits, currentMass);
  for (let i = 0; i < orbits.length; i++) {
    const v = speed(bodies[i].velocity_au_yr);
    // Circular orbit: v^2 = mu / a with mu = 4 PI^2 M
    const expected = Math.sqrt((4 * Math.PI * Math.PI * currentMass) / orbits[i].semiMajorAxis_au);
    assert.ok(Math.abs(v - expected) / expected < 1e-9, `body ${i}: expected ${expected}, got ${v}`);
  }
});

test('F5-4: Body identity and gas-giant vs rocky mapping preserved', () => {
  const bodies = buildWorkerBodiesFromOrbits(
    [
      { semiMajorAxis_au: 1.0, phaseOffset: 0.0, type: 0 },
      { semiMajorAxis_au: 5.2, phaseOffset: 1.0, type: 1 },
    ],
    1.0
  );
  assert.strictEqual(bodies[0].id, 'preset_body_0');
  assert.strictEqual(bodies[1].id, 'preset_body_1');
  assert.strictEqual(bodies[0].type, 'planet');
  assert.strictEqual(bodies[1].type, 'planet');
  assert.strictEqual(bodies[0].mass_solar, 0.000003);
  assert.strictEqual(bodies[0].radius_km, 6371);
  assert.strictEqual(bodies[1].mass_solar, 0.00095);
  assert.strictEqual(bodies[1].radius_km, 71492);
});
