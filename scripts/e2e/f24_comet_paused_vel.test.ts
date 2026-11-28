import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { createStellarState } from '../../src/simulation/StellarPhysics';
import { CometSystem } from '../../src/rendering/systems/CometSystem';

test('F24-1: CometSystem preserves dust-tail velocity shear on frame 0 and while paused at constant appTime', () => {
  const scene = new THREE.Scene();
  const cometSystem = new CometSystem(scene);
  const sun = createStellarState('hero_star', 1.0, 0.02, 4.6e9);

  // Pick a non-zero appTime where comet 1 (a=2.2, e=0.847, p=5.5, q=0.336 AU) is inside 2.5 AU
  const appTime = 0.25;
  cometSystem.update(sun, appTime);

  const ionTailMesh = (cometSystem as any).ionTailMesh as THREE.InstancedMesh;
  const dustTailMesh = (cometSystem as any).dustTailMesh as THREE.InstancedMesh;
  const ionActives = ionTailMesh.geometry.attributes.cActive.array as Float32Array;
  const ionDirs = ionTailMesh.geometry.attributes.cDir.array as Float32Array;
  const dustDirs = dustTailMesh.geometry.attributes.cDir.array as Float32Array;

  // Verify at least one comet is active inside 2.5 AU on frame 0 and has dust tail sheared away from ion tail
  let activeCount = 0;
  const frame0DustDirs = new Float32Array(dustDirs.length);
  frame0DustDirs.set(dustDirs);

  for (let i = 0; i < 5; i++) {
    if (ionActives[i] > 0.5) {
      activeCount++;
      const ix = ionDirs[i * 3];
      const iy = ionDirs[i * 3 + 1];
      const iz = ionDirs[i * 3 + 2];
      const dx = dustDirs[i * 3];
      const dy = dustDirs[i * 3 + 1];
      const dz = dustDirs[i * 3 + 2];
      const dot = ix * dx + iy * dy + iz * dz;
      assert.ok(
        dot < 0.999,
        `Comet ${i} dust tail on frame 0 must be sheared away from radial ion tail (dot=${dot})`,
      );
    }
  }
  assert.ok(activeCount > 0, 'At least one comet must have active tails at appTime=0.25');

  // Simulate paused frames: calling update repeatedly with the exact same appTime
  cometSystem.update(sun, appTime);
  cometSystem.update(sun, appTime);

  for (let i = 0; i < 5; i++) {
    if (ionActives[i] > 0.5) {
      const ix = ionDirs[i * 3];
      const iy = ionDirs[i * 3 + 1];
      const iz = ionDirs[i * 3 + 2];
      const dx = dustDirs[i * 3];
      const dy = dustDirs[i * 3 + 1];
      const dz = dustDirs[i * 3 + 2];
      const dot = ix * dx + iy * dy + iz * dz;
      assert.ok(
        dot < 0.999,
        `Comet ${i} dust tail must retain velocity shear while paused (dot=${dot})`,
      );
      assert.ok(
        Math.abs(dx - frame0DustDirs[i * 3]) < 1e-6 &&
          Math.abs(dy - frame0DustDirs[i * 3 + 1]) < 1e-6 &&
          Math.abs(dz - frame0DustDirs[i * 3 + 2]) < 1e-6,
        `Comet ${i} dust tail direction must remain invariant across paused frames`,
      );
    }
  }

  cometSystem.dispose();
});

test('F24-2: Tidally disrupted sungrazer debris train stays spread along orbital tangent when paused', () => {
  const scene = new THREE.Scene();
  const cometSystem = new CometSystem(scene);
  // Comet 4 (a=12.0, e=0.995) has perihelion q = a*(1-e) = 0.06 AU.
  // For a 4.0 M_sun main-sequence star, rocheLimitAU = 0.05 * cbrt(4) ≈ 0.0794 AU > 0.06 AU at perihelion (appTime = 0).
  const massiveStar = createStellarState('hero_star', 4.0, 0.02, 1e7);
  assert.strictEqual(massiveStar.phase, 'main_sequence');

  // Advance across two paused frames at perihelion (appTime = 0)
  cometSystem.update(massiveStar, 0.0);
  cometSystem.update(massiveStar, 0.0);

  const tidalDebrisMesh = (cometSystem as any).tidalDebrisMesh as THREE.InstancedMesh;
  const debrisActives = tidalDebrisMesh.geometry.attributes.dActive.array as Float32Array;

  const cometIdx = 4;
  const baseFrag = cometIdx * 6;
  assert.strictEqual(debrisActives[baseFrag], 1.0, 'Sungrazer comet 4 must be tidally disrupted inside Roche limit');

  const mFirst = new THREE.Matrix4();
  const mLast = new THREE.Matrix4();
  tidalDebrisMesh.getMatrixAt(baseFrag, mFirst);
  tidalDebrisMesh.getMatrixAt(baseFrag + 5, mLast);

  const pFirst = new THREE.Vector3().setFromMatrixPosition(mFirst);
  const pLast = new THREE.Vector3().setFromMatrixPosition(mLast);
  const trainSpan = pFirst.distanceTo(pLast);
  assert.ok(
    trainSpan > 0.15,
    `Tidal debris fragments must remain spread along the velocity tangent when paused (span=${trainSpan})`,
  );

  cometSystem.dispose();
});
