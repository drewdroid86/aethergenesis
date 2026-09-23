import test from 'node:test';
import assert from 'node:assert';
import { computeMainSequenceLifetime } from '../../src/simulation/StellarPhysics.ts';
import { solveKepler, keplerianToCartesian } from '../../src/simulation/OrbitalMechanics.ts';
import { AstrobiologyEngine } from '../../src/simulation/AstrobiologyEngine.ts';

// ==========================================
// Batch-1 audit fixes: guards that stop NaN/Infinity from poisoning
// the simulation. Pure functions only — no server needed.
// ==========================================

function keplerResidual(E: number, M: number, e: number): number {
  return E - e * Math.sin(E) - M;
}

test('F6-1: Sun lifetime is ~10 Gyr', () => {
  const tau = computeMainSequenceLifetime(1.0);
  assert.ok(Math.abs(tau - 1e10) / 1e10 < 1e-9, `expected 1e10, got ${tau}`);
});

test('F6-2: Non-positive / non-finite mass yields NaN, not Infinity', () => {
  for (const m of [0, -1, NaN, Infinity]) {
    assert.ok(Number.isNaN(computeMainSequenceLifetime(m)), `mass=${m} should give NaN`);
  }
});

test('F6-3: solveKepler converges at M=0', () => {
  const E = solveKepler(0, 0.1);
  assert.ok(Math.abs(E) < 1e-9, `expected ~0, got ${E}`);
});

test('F6-4: solveKepler normalizes large anomalies (4π + M ≡ M)', () => {
  const a = solveKepler(0.5, 0.3);
  const b = solveKepler(0.5 + 4 * Math.PI, 0.3);
  assert.ok(Math.abs(a - b) < 1e-9, `expected equal, got ${a} vs ${b}`);
  assert.ok(Math.abs(keplerResidual(b, 0.5, 0.3)) < 1e-6, `residual too large: ${keplerResidual(b, 0.5, 0.3)}`);
});

test('F6-5: solveKepler rejects non-finite input, clamps e >= 1', () => {
  assert.ok(Number.isNaN(solveKepler(NaN, 0.1)), 'NaN M should give NaN');
  assert.ok(Number.isNaN(solveKepler(0.5, NaN)), 'NaN e should give NaN');
  const E = solveKepler(1.0, 2.0);
  assert.ok(Number.isFinite(E), `e=2 should clamp and converge, got ${E}`);
});

test('F6-6: keplerianToCartesian still gives ~0.983 AU at Earth perihelion', () => {
  const { position } = keplerianToCartesian(
    {
      semiMajorAxis_au: 1.0,
      eccentricity: 0.0167,
      inclination_deg: 0,
      longitudeOfAscendingNode_deg: 0,
      argumentOfPeriapsis_deg: 0,
      meanAnomaly_deg: 0,
    },
    1.0
  );
  const r = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2);
  assert.ok(Math.abs(r - 0.9833) < 0.01, `expected ~0.983, got ${r}`);
});

test('F6-7: Frozen dark rock (T=0 edge) keeps every score finite', () => {
  const engine = new AstrobiologyEngine();
  const state = engine.evaluatePlanet(
    'f6-frozen',
    1000, // far out: S_eff ~ 0
    1e22, // <= 1e23: no greenhouse, so T stays exactly 0 with albedo 1
    6.371e6,
    1.0, // perfect reflector: T_eq = 0
    {
      id: 'sun',
      initialMass_solar: 1.0,
      metallicity_Z: 0.02,
      age_yr: 4.6e9,
      mass_solar: 1.0,
      luminosity_solar: 1.0,
      radius_solar: 1.0,
      temperature_K: 5778,
      phase: 'main_sequence',
      spectralClass: 'G',
      absoluteMagnitude: 4.83,
      hrPosition: { logT: 3.76, logL: 0 },
    },
    1000,
    'rocky'
  );
  for (const k of ['orbitalScore', 'thermalScore', 'atmosphereScore', 'stellarActivityScore', 'ageScore', 'compositeScore'] as const) {
    assert.ok(Number.isFinite(state[k]), `${k} should be finite, got ${state[k]}`);
  }
});
