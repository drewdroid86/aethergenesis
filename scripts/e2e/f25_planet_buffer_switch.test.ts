import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { PlanetarySystem } from '../../src/rendering/systems/PlanetarySystem';
import { PHASES } from '../../src/core/constants';

function orbitLineYs(group: THREE.Group): number[] {
  const ys: number[] = [];
  for (const child of group.children) {
    if (child instanceof THREE.LineLoop) {
      const pos = child.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        ys.push(Math.abs(pos.getY(i)));
      }
    }
  }
  return ys;
}

test('F25-1: PlanetarySystem rebuilds orbit lines on equal-count procedural <-> buffer switches', () => {
  const star = new THREE.Object3D() as any;
  star.mass = 1.0;
  star.currentMass = 1.0;
  star.phase = PHASES.MAIN_SEQUENCE;
  star.physicsId = 'f25_switch_star';

  const system = new PlanetarySystem(star);
  const n = system.proceduralOrbits.length;
  assert.ok(n >= 2, 'Procedural system must generate at least 2 bodies');

  // 1. Start in procedural mode: all orbit lines are flat circles in XZ (y === 0)
  system.update(0.016, 1.0, null);
  assert.strictEqual(system.orbitLinesGroup.children.length, n);
  const procMaxY = Math.max(...orbitLineYs(system.orbitLinesGroup));
  assert.strictEqual(procMaxY, 0, 'Procedural orbit lines must lie flat in y = 0');

  // 2. Switch to an N-body inclined, eccentric buffer WITHOUT calling applyRoster (same body count n!)
  const mu = 4 * Math.PI * Math.PI * 1.0;
  const buf = new Float32Array(n * 7);
  for (let i = 0; i < n; i++) {
    const r = 1.0 + i * 0.8;
    const v = Math.sqrt(mu / r);
    const inc = 0.45; // radians -> non-zero Y excursion in XZ-remapped orbit loop
    buf[i * 7 + 0] = r;
    buf[i * 7 + 1] = 0;
    buf[i * 7 + 2] = 0;
    buf[i * 7 + 3] = 0;
    buf[i * 7 + 4] = v * Math.cos(inc);
    buf[i * 7 + 5] = v * Math.sin(inc);
    buf[i * 7 + 6] = 3e-6;
  }

  system.update(0.016, 1.016, buf);
  assert.strictEqual(system.orbitLinesGroup.children.length, n);
  const bufMaxY = Math.max(...orbitLineYs(system.orbitLinesGroup));
  assert.ok(bufMaxY > 1.0, `Buffer switch with identical body count must rebuild inclined orbit lines (maxY=${bufMaxY})`);

  // 3. Switch back to procedural (null) with identical body count n -> orbit lines must return to y === 0
  system.update(0.016, 1.032, null);
  assert.strictEqual(system.orbitLinesGroup.children.length, n);
  const revertedMaxY = Math.max(...orbitLineYs(system.orbitLinesGroup));
  assert.strictEqual(revertedMaxY, 0, `Reverting to procedural must rebuild flat orbit lines (maxY=${revertedMaxY})`);

  system.dispose();
});

test('F25-2: PlanetarySystem restores typeAttr and seedAttr to proceduralOrbits when reverting from buffer mode', () => {
  const star = new THREE.Object3D() as any;
  star.mass = 1.0;
  star.currentMass = 1.0;
  star.phase = PHASES.MAIN_SEQUENCE;
  star.physicsId = 'f25_attr_restore_star';

  const system = new PlanetarySystem(star);
  const n = system.proceduralOrbits.length;
  const expectedTypes = system.proceduralOrbits.map((po) => po.type);
  const expectedSeeds = system.proceduralOrbits.map((po) => po.seed);

  // Apply a non-preset roster with distinct IDs so applyRoster overwrites typeAttr/seedAttr via hashString
  const roster = Array.from({ length: n }, (_, i) => ({
    id: `custom_spawned_body_${i}`,
    type: 'planet' as const,
  }));
  system.applyRoster(roster, 1);

  const mu = 4 * Math.PI * Math.PI * 1.0;
  const buf = new Float32Array(n * 7);
  for (let i = 0; i < n; i++) {
    const r = 1.0 + i * 0.5;
    buf[i * 7 + 0] = r;
    buf[i * 7 + 4] = Math.sqrt(mu / r);
    buf[i * 7 + 6] = 3e-6;
  }
  system.update(0.016, 0.5, buf);

  const typeArray = (system as any).typeAttr.array as Float32Array;
  const seedArray = (system as any).seedAttr.array as Float32Array;

  // Confirm roster changed at least one seed compared to proceduralOrbits
  const changed = expectedSeeds.some((s, i) => Math.abs(seedArray[i] - s) > 1e-3);
  assert.ok(changed, 'Roster application must write distinct roster seeds into seedAttr');

  // Revert to procedural fallback (buffer = null)
  system.update(0.016, 0.516, null);
  for (let i = 0; i < n; i++) {
    assert.strictEqual(
      typeArray[i],
      expectedTypes[i],
      `Slot ${i} planetType must be restored to proceduralOrbits[${i}].type`,
    );
    assert.ok(
      Math.abs(seedArray[i] - expectedSeeds[i]) < 1e-4,
      `Slot ${i} planetSeed must be restored to proceduralOrbits[${i}].seed`,
    );
  }

  system.dispose();
});
