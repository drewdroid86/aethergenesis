import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { PlanetarySystem, PlanetarySystemQueue } from '../../src/rendering/systems/PlanetarySystem';
import { PHASES } from '../../src/core/constants';

function makeStar(phase: string, id: string): any {
  const star = new THREE.Object3D() as any;
  star.mass = 1.0;
  star.phase = phase;
  star.physicsId = id;
  star.planetarySystem = null;
  return star;
}

test('F26-1: PlanetarySystemQueue materializes queued stars that entered RED_GIANT before processing', () => {
  // Drain any leftovers from earlier tests
  PlanetarySystemQueue.flushDisposals();

  const star = makeStar(PHASES.MAIN_SEQUENCE, 'f26_rg_star');
  PlanetarySystemQueue.enqueueCreation(star);

  // Advance to RED_GIANT before the queue drains (e.g., high time-rate scrub)
  star.phase = PHASES.RED_GIANT;
  PlanetarySystemQueue.process();

  assert.ok(star.planetarySystem instanceof PlanetarySystem, 'Star queued in MS and processed in RED_GIANT must receive a PlanetarySystem');
  // Red Giant update should make planetary system visible for scorching
  star.planetarySystem.update(0.016, 1.0, null, false, 1.0, 2.0);
  assert.strictEqual((star.planetarySystem as any).group.visible, true);

  star.planetarySystem.dispose();
  star.planetarySystem = null;
});

test('F26-2: PlanetarySystemQueue skips pre-stellar phases and does not overwrite existing PlanetarySystem', () => {
  const nebulaStar = makeStar(PHASES.NEBULA, 'f26_nebula_star');
  PlanetarySystemQueue.enqueueCreation(nebulaStar);
  PlanetarySystemQueue.process();
  assert.strictEqual(nebulaStar.planetarySystem, null, 'NEBULA star must not receive a PlanetarySystem');

  const protoStar = makeStar(PHASES.PROTOSTAR, 'f26_proto_star');
  PlanetarySystemQueue.enqueueCreation(protoStar);
  PlanetarySystemQueue.process();
  assert.strictEqual(protoStar.planetarySystem, null, 'PROTOSTAR must not receive a PlanetarySystem');

  // Existing PlanetarySystem must not be overwritten (preventing GPU leak)
  const existingStar = makeStar(PHASES.MAIN_SEQUENCE, 'f26_existing_star');
  const original = new PlanetarySystem(existingStar);
  existingStar.planetarySystem = original;
  PlanetarySystemQueue.enqueueCreation(existingStar);
  PlanetarySystemQueue.process();
  assert.strictEqual(existingStar.planetarySystem, original, 'Existing PlanetarySystem must not be overwritten by queued creation');

  original.dispose();
  existingStar.planetarySystem = null;
});
