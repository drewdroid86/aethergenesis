import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { PlanetarySystem } from '../../src/rendering/systems/PlanetarySystem';
import { PHASES } from '../../src/core/constants';

test('F24-1: updateAstrobiology maps states by planet_id via slotById even when subset order differs', () => {
  const star = new THREE.Object3D() as any;
  star.mass = 1.0;
  star.phase = PHASES.MAIN_SEQUENCE;
  star.physicsId = 'f24_astro_slot_star';

  const system = new PlanetarySystem(star);
  system.applyRoster(
    [
      { id: 'barren_inner', type: 'planet' },
      { id: 'hab_world', type: 'planet' },
      { id: 'ice_outer', type: 'planet' },
    ],
    1,
  );

  // Pass only hab_world at index 0 of astrobiologyStates (mapped slot is 1!)
  system.updateAstrobiology([
    { planet_id: 'hab_world', biomass: 0.85, civilizationTier: 2 },
  ]);

  const biomassArray = (system as any).biomassAttr.array as Float32Array;
  const civArray = (system as any).civAttr.array as Float32Array;

  assert.strictEqual(biomassArray[0], 0, 'Slot 0 (barren_inner) must stay at 0 biomass');
  assert.strictEqual(civArray[0], 0, 'Slot 0 (barren_inner) must stay at 0 civ');
  assert.ok(Math.abs(biomassArray[1] - 0.85) < 1e-6, 'Slot 1 (hab_world) must receive biomass 0.85');
  assert.strictEqual(civArray[1], 2, 'Slot 1 (hab_world) must receive civ tier 2');
  assert.strictEqual(biomassArray[2], 0, 'Slot 2 (ice_outer) must stay at 0 biomass');

  system.dispose();
});

test('F24-2: applyRoster remaps cached astrobiology attributes and clears retired/compacted slots', () => {
  const star = new THREE.Object3D() as any;
  star.mass = 1.0;
  star.phase = PHASES.MAIN_SEQUENCE;
  star.physicsId = 'f24_astro_compact_star';

  const system = new PlanetarySystem(star);
  system.applyRoster(
    [
      { id: 'hab_world', type: 'planet' },
      { id: 'barren_b', type: 'planet' },
      { id: 'hab_c', type: 'planet' },
    ],
    1,
  );

  system.updateAstrobiology([
    { planet_id: 'hab_world', biomass: 0.75, civilizationTier: 1 },
    { planet_id: 'barren_b', biomass: 0.0, civilizationTier: 0 },
    { planet_id: 'hab_c', biomass: 0.4, civilizationTier: 0 },
  ]);

  const biomassArray = (system as any).biomassAttr.array as Float32Array;
  const civArray = (system as any).civAttr.array as Float32Array;
  assert.ok(Math.abs(biomassArray[0] - 0.75) < 1e-6);
  assert.ok(Math.abs(biomassArray[2] - 0.4) < 1e-6);

  // Retire hab_world and reorder: slot 0 becomes barren_b, slot 1 becomes hab_c, slot 2 is freed
  system.applyRoster(
    [
      { id: 'barren_b', type: 'planet' },
      { id: 'hab_c', type: 'planet' },
    ],
    2,
  );

  assert.strictEqual(biomassArray[0], 0, 'Compacted slot 0 (barren_b) must not inherit retired hab_world biomass');
  assert.strictEqual(civArray[0], 0, 'Compacted slot 0 (barren_b) must not inherit retired hab_world civ tier');
  assert.ok(Math.abs(biomassArray[1] - 0.4) < 1e-6, 'Slot 1 (hab_c) must carry its cached biomass 0.4');
  assert.strictEqual(biomassArray[2], 0, 'Freed slot 2 must be zeroed');

  // Empty roster clears remaining slots and uniforms
  system.applyRoster([], 3);
  assert.strictEqual(biomassArray[1], 0, 'Empty roster must zero all biomass slots');
  assert.strictEqual((system as any).material.uniforms.u_biomass.value, 0, 'Empty roster must zero u_biomass uniform');
  assert.strictEqual((system as any).material.uniforms.u_kardashevTier.value, 0, 'Empty roster must zero u_kardashevTier uniform');

  system.dispose();
});
