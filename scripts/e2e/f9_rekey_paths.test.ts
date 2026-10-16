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

test('F9-4: planet-less re-key posts RESET_BODIES with an empty list (M4, no phantom planets)', () => {
  const s = hookSrc();
  assert.ok(s.includes('RESET_BODIES'), 'must RESET_BODIES when orbits exist');
  // The shared clear-worker helper is the single empty-roster path.
  assert.ok(s.includes('function clearNBodyWorker'), 'shared clearNBodyWorker helper must exist');
  const helperStart = s.indexOf('function clearNBodyWorker');
  const helperWindow = s.slice(helperStart, helperStart + 700);
  assert.ok(helperWindow.includes('RESET_BODIES'), 'helper must post RESET_BODIES');
  assert.ok(helperWindow.includes('bodies: []'), 'helper must post an EMPTY body list');
  assert.ok(helperWindow.includes('centralMass_solar'), 'helper must still update the central mass');
  // The re-key else branch routes through the helper — never a mass-only update.
  const rekeyStart = s.indexOf('function rekeyNBodyForStar');
  const rekeyWindow = s.slice(rekeyStart, rekeyStart + 2500);
  assert.ok(
    rekeyWindow.includes('clearNBodyWorker(nbodyWorker, centralMass)'),
    'planet-less else branch must clear via the shared helper with the current mass'
  );
  assert.ok(
    !rekeyWindow.includes('UPDATE_CENTRAL_MASS'),
    'mass-only UPDATE_CENTRAL_MASS must be gone from rekeyNBodyForStar: stale bodies would persist as phantom planets'
  );
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

test('F9-7: [selectedStar] effect re-keys ONLY on deselect (#13), never on select', () => {
  const s = hookSrc();
  const anchor = 'engineRef.current.selectedStar = selectedStar';
  const idx = s.indexOf(anchor);
  assert.ok(idx !== -1, 'effect must still propagate selectedStar to the engine');
  const end = s.indexOf('}, [selectedStar]);', idx);
  assert.ok(end !== -1 && end > idx, 'effect end must be locatable');
  const window = s.slice(idx, end);
  // Deselect is a star -> null transition: select transitions must not re-key here
  // (click-select and preset-select already re-keyed with currentMass before this runs).
  assert.ok(
    window.includes('prevSelectedStarRef.current !== null && selectedStar === null'),
    'effect must gate the re-key on a star -> null deselect transition'
  );
  // The deselect re-key targets the coordinator's no-selection fallback star.
  assert.ok(window.includes('heroStars[0]'), 'deselect must target the heroStars[0] fallback');
  assert.ok(
    window.includes('rekeyNBodyForStar(fallback,'),
    'deselect must re-key through the SAME shared helper as selection'
  );
  // Guarded empty-array fallback routes through the shared clear helper.
  assert.ok(window.includes('clearNBodyWorker(worker)'), 'empty fallback must clear via the shared helper');
  // No direct worker writes from the effect body itself (no clobber on select).
  assert.ok(!window.includes('postMessage'), 'effect must not post to the n-body worker directly');
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

// --- H-N2: applyPreset seeds orbits from catalog literature distances ---
// Static contract: preset.planets must reach the PlanetarySystem constructor,
// which builds every other orbital element exactly the procedural way.

test('F9-10: applyPreset seeds the PlanetarySystem from preset.planets', () => {
  const heroSrc = src('src/rendering/systems/HeroStarSystem.ts');
  assert.ok(heroSrc.includes('preset.planets'), 'applyPreset must read preset.planets');
  assert.ok(
    heroSrc.includes('new PlanetarySystem(this, renderer, literatureDistances)'),
    'applyPreset must synchronously materialize a literature-seeded PlanetarySystem'
  );
  assert.ok(
    heroSrc.includes('PlanetarySystemQueue.cancelCreation(this)'),
    'seeding must cancel the queued async creation so it cannot overwrite the seeded system'
  );
});

test('F9-11: PlanetarySystem builds literature orbits the procedural way, only with real distances', () => {
  const psSrc = src('src/rendering/systems/PlanetarySystem.ts');
  assert.ok(
    psSrc.includes('literatureDistances_au'),
    'PlanetarySystem constructor must accept literature distances'
  );
  assert.ok(
    psSrc.includes('useLiterature ? literatureA[i] : currentA'),
    'literature mode must swap ONLY the semi-major axis, keeping the procedural element build'
  );
});

test('F9-12: Proxima Centauri catalog distances yield worker bodies at those radii', () => {
  // Literature values from server/shared/stellarCatalog.mjs (Proxima b/c/d).
  const proximaDistances = [0.0485, 1.48, 0.029];
  const proximaMass = 0.122;
  const orbits = proximaDistances.map((semiMajorAxis_au, i) => ({
    semiMajorAxis_au,
    phaseOffset: i * 2.1,
    type: 0,
  }));
  const bodies = buildWorkerBodiesFromOrbits(orbits, proximaMass);
  assert.equal(bodies.length, 3);
  for (let i = 0; i < proximaDistances.length; i++) {
    assert.ok(
      Math.abs(radius(bodies[i].position_au) - proximaDistances[i]) < 1e-9,
      `body ${i}: worker radius must equal the catalog distance ${proximaDistances[i]} AU`
    );
  }
  // Circular-orbit speed under the preset mass (vis-viva), not an RNG accident.
  const v = speed(bodies[0].velocity_au_yr);
  const expected = (2 * Math.PI * Math.sqrt(proximaMass)) / Math.sqrt(proximaDistances[0]);
  assert.ok(Math.abs(v - expected) / expected < 1e-9, `expected ${expected}, got ${v}`);
});
