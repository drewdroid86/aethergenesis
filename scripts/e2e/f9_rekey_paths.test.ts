import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// NOTE: OrbitalMechanics.ts is intentionally rendering-free (zero imports), so it
// is safe to import under tsx. Do NOT import from useSimulation.ts here — that
// module pulls the entire Three.js rendering chain including .glsl shaders, which
// node/tsx cannot parse (ERR_UNKNOWN_FILE_EXTENSION).
import { buildWorkerBodiesFromOrbits } from '../../src/simulation/OrbitalMechanics';

const src = (p: string): string => fs.readFileSync(p, 'utf8');
const hookSrc = (): string => src('src/utils/hooks/useSimulation.ts');

// --- Static contract: the re-key wiring in useSimulation.ts (repo convention) ---

test('F9-1: rekeyNBodyForStar helper exists at module scope', () => {
  assert.ok(
    hookSrc().includes('function rekeyNBodyForStar'),
    'module-scope rekeyNBodyForStar helper must exist in useSimulation.ts'
  );
});

test('F9-2: re-key uses phase-aware currentMass, not birth mass', () => {
  assert.ok(
    hookSrc().includes('star.currentMass ?? star.mass'),
    'mass source must be currentMass ?? mass'
  );
});

test('F9-3: re-key keeps the synchronous PlanetarySystem materialization guard', () => {
  const s = hookSrc();
  assert.ok(s.includes('PlanetarySystemQueue.cancelCreation(star)'), 'must cancel the queued async creation');
  assert.ok(s.includes('new PlanetarySystem(star'), 'must materialize the PlanetarySystem synchronously');
});

test('F9-4: re-key posts RESET_BODIES, falls back to UPDATE_CENTRAL_MASS', () => {
  const s = hookSrc();
  assert.ok(s.includes('RESET_BODIES'), 'must RESET_BODIES when orbits exist');
  assert.ok(s.includes('UPDATE_CENTRAL_MASS'), 'must fall back to UPDATE_CENTRAL_MASS');
});

test('F9-5: loadStarPreset delegates to the shared helper', () => {
  const s = hookSrc();
  const start = s.indexOf('const loadStarPreset');
  const end = s.indexOf('const addBodyToSimulation');
  assert.ok(start !== -1 && end !== -1 && end > start, 'loadStarPreset block must be locatable');
  assert.ok(s.slice(start, end).includes('rekeyNBodyForStar('), 'loadStarPreset must call rekeyNBodyForStar');
});

test('F9-6: click-select path re-keys (no more zero-rebuild selection)', () => {
  assert.ok(
    hookSrc().includes('rekeyNBodyForStar(system,'),
    'onPointerUp hit branch must call rekeyNBodyForStar(system, ...)'
  );
});

test('F9-7: [selectedStar] effect no longer posts to the worker', () => {
  const s = hookSrc();
  const anchor = 'engineRef.current.selectedStar = selectedStar';
  const idx = s.indexOf(anchor);
  assert.ok(idx !== -1, 'effect must still propagate selectedStar to the engine');
  const window = s.slice(idx, idx + 400);
  assert.ok(window.includes('[selectedStar]'), 'effect must still depend on [selectedStar]');
  assert.ok(!window.includes('postMessage'), 'effect must not post to the n-body worker (no clobber)');
});

// --- Behavioral: velocities are derived under the passed central mass ---
// This is the heart of the stale-velocity fix, tested through the rendering-free
// seam (buildWorkerBodiesFromOrbits), which is what rekeyNBodyForStar calls.

const speed = (v: { x: number; y: number; z: number }): number =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const radius = (p: { x: number; y: number; z: number }): number =>
  Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);

test('F9-8: body velocities scale with sqrt(centralMass) — the stale-velocity fix', () => {
  const orbits = [{ semiMajorAxis_au: 1.0, phaseOffset: 0.7, type: 0 }];
  const heavy = buildWorkerBodiesFromOrbits(orbits, 1.0);
  const light = buildWorkerBodiesFromOrbits(orbits, 0.25);
  assert.equal(heavy.length, 1);
  assert.equal(light.length, 1);
  const ratio = speed(light[0].velocity_au_yr) / speed(heavy[0].velocity_au_yr);
  // circular-orbit speed v = 2π√(M/a), so v(0.25)/v(1.0) must equal √0.25 = 0.5
  assert.ok(Math.abs(ratio - 0.5) < 0.01, `velocity ratio must be 0.5, got ${ratio}`);
});

test('F9-9: rebuilt bodies keep circular-orbit radius, stable ids, type mapping', () => {
  const orbits = [
    { semiMajorAxis_au: 1.0, phaseOffset: 0.0, type: 0 },
    { semiMajorAxis_au: 5.2, phaseOffset: 2.1, type: 1 },
  ];
  const bodies = buildWorkerBodiesFromOrbits(orbits, 0.5);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].id, 'preset_body_0');
  assert.equal(bodies[1].id, 'preset_body_1');
  assert.ok(Math.abs(radius(bodies[0].position_au) - 1.0) < 1e-9, 'circular radius must equal semi-major axis');
  assert.ok(Math.abs(radius(bodies[1].position_au) - 5.2) < 1e-9, 'circular radius must equal semi-major axis');
  assert.equal(bodies[1].mass_solar, 0.00095); // gas-giant mapping preserved
});
