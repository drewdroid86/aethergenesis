import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { calculateRadarContacts } from '../../src/utils/navigationMath.ts';
import type { HeroStarSystem } from '../../src/rendering/systems/HeroStarSystem.ts';

// ==========================================
// F12: Tactical radar mirror fix.
// The old yaw transform had determinant -1 (a reflection), mirroring
// left/right. These pin the true-rotation contract (determinant +1):
// relX > 0 = camera-right, relY < 0 = ahead (screen y points down).
// Pure math — no server needed.
// ==========================================

function cameraFacing(target: THREE.Vector3): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 0, 0);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  return cam;
}

function starAt(x: number, y: number, z: number, id: string): HeroStarSystem {
  return {
    position: new THREE.Vector3(x, y, z),
    currentTemp: 5778,
    physicsId: id,
  } as unknown as HeroStarSystem;
}

test('F12-1: facing -Z, a star at +X plots camera-right (relX > 0)', () => {
  const cam = cameraFacing(new THREE.Vector3(0, 0, -1));
  const contacts = calculateRadarContacts(cam, [starAt(10, 0, 0, 'f12-right')], null, 100);
  assert.equal(contacts.length, 1);
  assert.ok(contacts[0].relX > 0, `star at +X must plot right, got relX=${contacts[0].relX}`);
});

test('F12-2: facing +X, a star directly ahead plots up-screen (relY < 0)', () => {
  const cam = cameraFacing(new THREE.Vector3(1, 0, 0));
  const contacts = calculateRadarContacts(cam, [starAt(10, 0, 0, 'f12-ahead')], null, 100);
  assert.equal(contacts.length, 1);
  assert.ok(contacts[0].relY < 0, `star ahead must plot up-screen, got relY=${contacts[0].relY}`);
});
