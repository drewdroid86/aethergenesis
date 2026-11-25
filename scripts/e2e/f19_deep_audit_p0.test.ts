import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';
import { solveKepler } from '../../src/simulation/OrbitalMechanics.ts';
import {
  computeMainSequenceLifetime,
  createStellarState,
} from '../../src/simulation/StellarPhysics.ts';
import { RemnantPhase } from '../../src/simulation/phases/RemnantPhase.ts';
import { DEFAULT_CONSTANTS } from '../../src/types/physics.ts';

// Stub worker scope before dynamically importing nbodyWorker.ts
const workerMessages: any[] = [];
(globalThis as any).self = {
  onmessage: null as any,
  postMessage: (msg: any) => {
    workerMessages.push(msg);
  },
};
const worker = await import('../../src/simulation/nbodyWorker.ts');

test('F19-1: solveKepler converges across [-pi, pi] including negative M for high eccentricities', () => {
  const eccentricities = [0.85, 0.967, 0.995, 0.9999];
  const samples = 200;
  for (const e of eccentricities) {
    for (let i = 0; i <= samples; i++) {
      const M = -Math.PI + (2 * Math.PI * i) / samples;
      const E = solveKepler(M, e);
      assert.ok(Number.isFinite(E), `E must be finite for e=${e}, M=${M}, got ${E}`);
      const residual = Math.abs(E - e * Math.sin(E) - M);
      assert.ok(residual < 1e-6, `Kepler residual ${residual} too large for e=${e}, M=${M}`);
    }
  }
});

test('F19-2: nbodyWorker preserves close-in catalog exoplanets (TRAPPIST-1 b at 0.0115 AU)', () => {
  const trappistMass = 0.0898;
  const a_au = 0.0115;
  const mu = 4 * Math.PI * Math.PI * trappistMass;
  const vCirc = Math.sqrt(mu / a_au);

  workerMessages.length = 0;
  (globalThis as any).self.onmessage({
    data: {
      type: 'INIT',
      payload: { bodies: [], centralMass_solar: trappistMass, dt_yr: 0.002, isRunning: false },
    },
  });
  (globalThis as any).self.onmessage({
    data: {
      type: 'RESET_BODIES',
      payload: {
        centralMass_solar: trappistMass,
        bodies: [
          {
            id: 'trappist-1b',
            type: 'planet',
            mass_solar: 3.1e-6,
            radius_km: 7110,
            position_au: { x: a_au, y: 0, z: 0 },
            velocity_au_yr: { x: 0, y: vCirc, z: 0 },
          },
        ],
      },
    },
  });

  workerMessages.length = 0;
  for (let t = 0; t < 30; t++) {
    worker.physicsTickInner();
  }
  const updates = workerMessages.filter((m) => m.type === 'UPDATE');
  assert.equal(updates.length, 30);
  for (const u of updates) {
    const b = u.buffer as Float32Array;
    const r = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
    // Before centralSofteningSq = 1e-8, 57% central gravity loss caused TRAPPIST-1 b to escape (>1 AU);
    // at T/20 Verlet substeps, bound oscillation stays within ~6% of 0.0115 AU.
    assert.ok(
      Math.abs(r - a_au) / a_au < 0.06,
      `TRAPPIST-1 b drifted from ${a_au} AU to ${r} AU (excess softening gravity loss)`
    );
  }
});

test('F19-3: StellarPhysics Red Giant follows Hayashi cooling without blue-white spike or radius dip', () => {
  for (const mass of [1.0, 5.0]) {
    const tau = computeMainSequenceLifetime(mass);
    const msEnd = createStellarState(`ms_${mass}`, mass, 0.02, tau * 0.9999);
    let prevTemp = msEnd.temperature_K;
    for (const frac of [0.001, 0.05, 0.25, 0.5, 0.999]) {
      const age = tau * (1.0 + 0.2 * frac);
      const rg = createStellarState(`rg_${mass}_${frac}`, mass, 0.02, age);
      assert.equal(rg.phase, 'red_giant');
      assert.ok(
        rg.radius_solar >= msEnd.radius_solar,
        `RG radius shrunk below R_MS at frac=${frac}: ${rg.radius_solar} < ${msEnd.radius_solar}`
      );
      assert.ok(
        rg.temperature_K <= msEnd.temperature_K + 1e-6,
        `RG temperature spiked above T_MS at frac=${frac}: ${rg.temperature_K} > ${msEnd.temperature_K}`
      );
      assert.ok(
        rg.temperature_K <= prevTemp + 1e-6,
        `RG temperature failed to cool monotonically at frac=${frac}: ${rg.temperature_K} > ${prevTemp}`
      );
      prevTemp = rg.temperature_K;
    }
    assert.ok(prevTemp < 4200, `RG tip should be cool K/M class, got ${prevTemp} K`);
  }
});

test('F19-4: 8.0 M_sun boundary is consistent across StellarPhysics phases and remnants', () => {
  const tau8 = computeMainSequenceLifetime(8.0);
  const edge8 = createStellarState('edge8', 8.0, 0.02, tau8 * 1.25);
  assert.equal(edge8.phase, 'remnant');
  assert.equal(edge8.remnantType, 'white_dwarf');

  const tau81 = computeMainSequenceLifetime(8.1);
  const sn81 = createStellarState('sn81', 8.1, 0.02, tau81 * 1.25);
  assert.equal(sn81.phase, 'supernova');
  const rem81 = createStellarState('rem81', 8.1, 0.02, tau81 * 1.55);
  assert.equal(rem81.phase, 'remnant');
  assert.equal(rem81.remnantType, 'neutron_star');
});

test('F19-5: SupernovaPhase.setMass and RemnantPhase toggle active groups cleanly across mass regimes', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { SupernovaPhase } = await vite.ssrLoadModule('/src/simulation/phases/SupernovaPhase.ts');
    const parent = new THREE.Group();
    const physics = { ...DEFAULT_CONSTANTS };
    const cam = new THREE.Vector3(0, 0, 10);

    const sn = new SupernovaPhase(1.0, 0.8);
    sn.init(parent);
    sn.setMass(8.1, 4.2);
    sn.update(0.016, 1.0, cam, physics, 1.21, false, 1.0);
    assert.equal(sn.isFlashing, true, 'upgraded 8.1 M_sun SupernovaPhase must flash at supernova start');
    sn.dispose();

    const rem = new RemnantPhase(21.2);
    rem.init(parent);
    rem.update(0.016, 1.0, cam, physics, 1.55, false, 1.0);
    assert.equal(rem.blackHoleGroup.visible, true);
    assert.equal(rem.neutronStarGroup.visible, false);

    rem.setMass(8.1);
    rem.update(0.016, 1.0, cam, physics, 1.55, false, 1.0);
    assert.equal(rem.blackHoleGroup.visible, false, 'BH group must hide when mass drops to Neutron Star');
    rem.dispose();
  } finally {
    await vite.close();
  }
});

test('F19-6: GLSL dot clamps, low-detail skip, and gl_PointSize depth/size bounds are enforced', () => {
  const starFrag = fs.readFileSync('src/shaders/starSurface.frag.glsl', 'utf8');
  assert.ok(starFrag.includes('clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0)'));
  assert.ok(starFrag.includes('pow(max(1e-5, 1.0 - mu), 4.5)'));
  const lowIdx = starFrag.indexOf('if (uLowDetail > 0.5)');
  const shiftIdx = starFrag.indexOf('vec3 shift = vec3(');
  assert.ok(lowIdx !== -1 && shiftIdx > lowIdx, '5-octave fbm shift must live after uLowDetail branch');

  const particleVert = fs.readFileSync('src/shaders/particle.vert.glsl', 'utf8');
  assert.ok(particleVert.includes('mvPosition.z >= -0.1') && particleVert.includes('64.0'));

  const ejectaVert = fs.readFileSync('src/shaders/ejecta.vert.glsl', 'utf8');
  assert.ok(ejectaVert.includes('clamp(uExp, 0.0, 1.0)') && ejectaVert.includes('mvPos.z >= -0.1') && ejectaVert.includes('64.0'));

  const nebulaSys = fs.readFileSync('src/rendering/systems/NebulaSystem.ts', 'utf8');
  assert.ok(nebulaSys.includes('mvPosition.z >= -0.1') && nebulaSys.includes('256.0'));

  const planetSys = fs.readFileSync('src/rendering/systems/PlanetarySystem.ts', 'utf8');
  assert.ok(planetSys.includes('clamp(dot(N_smooth, viewDir), 0.0, 1.0)'));
  assert.ok(planetSys.includes('float h0 = snoise(p * 3.0);'));
  assert.ok(!planetSys.includes('vPosition * 2.5 + vSeed + uTime * 0.06'));
});
