import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { computeMainSequenceLifetime, sampleKroupaMass } from '../../src/simulation/StellarPhysics.ts';
import { solveKepler, keplerianToCartesian } from '../../src/simulation/OrbitalMechanics.ts';
import fs from 'node:fs';
import { AstrobiologyEngine } from '../../src/simulation/AstrobiologyEngine.ts';
import { RemnantPhase, WHITE_DWARF_SCALE, WHITE_DWARF_COLOR, NEUTRON_STAR_COLOR, blackHoleShadowRadius, blackHoleWorldShadowRadius, blackHoleGravitationalRadius, blackHoleInFrontOfCamera, BH_CORE_FILL } from '../../src/simulation/phases/RemnantPhase.ts';
import { BH_CORE_RADIUS, BH_DISK_INNER, BH_DISK_THETA_SEGMENTS, GEOMETRIES } from '../../src/simulation/phases/geometries.ts';
import { mulberry32 } from '../../src/physics/math.ts';

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

test('F6-8: RemnantPhase differentiates White Dwarf (<= 8 Msun) and Neutron Star (> 8 Msun) without scale/color leakage', () => {
  const dummyParent = new THREE.Group();
  const cameraPos = new THREE.Vector3(0, 0, 10);
  const physics = { G: 1, c: 1, h: 1, k_B: 1, weakForce: 1, strongForce: 1, darkEnergy: 1 };

  // 1. White Dwarf (<= 8 Msun, e.g. 1.0 Msun progenitor)
  const wdPhase = new RemnantPhase(1.0);
  wdPhase.init(dummyParent);
  wdPhase.update(0.016, 1.0, cameraPos, physics, 0.5, false, 1.0);

  assert.strictEqual(wdPhase.neutronStarGroup.scale.x, WHITE_DWARF_SCALE, 'WD scale must equal WHITE_DWARF_SCALE');
  assert.strictEqual(wdPhase.nsMat.color.getHex(), WHITE_DWARF_COLOR, 'WD color must equal WHITE_DWARF_COLOR (warm white)');
  assert.strictEqual(wdPhase.pulsarGroup.visible, false, 'WD must hide pulsar beams');
  assert.strictEqual(wdPhase.nsMagneticLines.visible, false, 'WD must hide magnetic lines');

  // 2. Neutron Star (> 8 Msun, e.g. 12.0 Msun progenitor)
  const nsPhase = new RemnantPhase(12.0);
  nsPhase.init(dummyParent);
  nsPhase.update(0.016, 1.0, cameraPos, physics, 0.5, false, 1.0);

  assert.strictEqual(nsPhase.neutronStarGroup.scale.x, 1.0, 'NS scale must equal 1.0');
  assert.strictEqual(nsPhase.nsMat.color.getHex(), NEUTRON_STAR_COLOR, 'NS color must equal NEUTRON_STAR_COLOR (blue-white)');
  assert.strictEqual(nsPhase.pulsarGroup.visible, true, 'NS must show pulsar beams');
  assert.strictEqual(nsPhase.nsMagneticLines.visible, true, 'NS must show magnetic lines');

  // 3. Recycling / mutation between mass regimes: ensure no appearance leakage
  wdPhase.setMass(14.0);
  wdPhase.update(0.016, 1.0, cameraPos, physics, 0.5, false, 1.0);
  assert.strictEqual(wdPhase.neutronStarGroup.scale.x, 1.0, 'Recycled to NS: scale must reset to 1.0');
  assert.strictEqual(wdPhase.nsMat.color.getHex(), NEUTRON_STAR_COLOR, 'Recycled to NS: color must reset to NS blue-white');
  assert.strictEqual(wdPhase.pulsarGroup.visible, true, 'Recycled to NS: pulsar beams visible');
  assert.strictEqual(wdPhase.nsMagneticLines.visible, true, 'Recycled to NS: magnetic lines visible');

  wdPhase.setMass(0.8);
  wdPhase.update(0.016, 1.0, cameraPos, physics, 0.5, false, 1.0);
  assert.strictEqual(wdPhase.neutronStarGroup.scale.x, WHITE_DWARF_SCALE, 'Recycled back to WD: scale must be WHITE_DWARF_SCALE');
  assert.strictEqual(wdPhase.nsMat.color.getHex(), WHITE_DWARF_COLOR, 'Recycled back to WD: color must be warm white');
  assert.strictEqual(wdPhase.pulsarGroup.visible, false, 'Recycled back to WD: pulsar beams hidden');
  assert.strictEqual(wdPhase.nsMagneticLines.visible, false, 'Recycled back to WD: magnetic lines hidden');

  wdPhase.dispose();
  nsPhase.dispose();
});

test('F6-9: mulberry32 generates deterministic sequences and RedGiantPhase uses seeded RNG', () => {
  const rng1 = mulberry32(42);
  const rng2 = mulberry32(42);
  const rng3 = mulberry32(99);

  for (let i = 0; i < 20; i++) {
    const val1 = rng1();
    const val2 = rng2();
    assert.strictEqual(val1, val2, 'Identical seed must produce identical numbers');
    assert.ok(val1 >= 0 && val1 < 1, 'Value must be in [0, 1)');
  }
  assert.notStrictEqual(rng1(), rng3(), 'Different seed must produce different numbers');

  const rgSrc = fs.readFileSync('src/simulation/phases/RedGiantPhase.ts', 'utf8');
  assert.ok(rgSrc.includes("import { colorTempToRGB, mulberry32 } from '../../physics/math';"), 'RedGiantPhase must import mulberry32');
  assert.ok(rgSrc.includes('DEFAULT_RED_GIANT_SEED'), 'RedGiantPhase must export/define DEFAULT_RED_GIANT_SEED');
  assert.ok(rgSrc.includes('const rng = mulberry32(this.seed);'), 'RedGiantPhase.init must instantiate mulberry32 with this.seed');
  assert.ok(rgSrc.includes('rng() * Math.PI * 2'), 'RedGiantPhase must use rng() for Euler rotation');
  assert.ok(rgSrc.includes('0.5 + rng() * 0.5'), 'RedGiantPhase must use rng() for scale');
});

test('F6-10: SupernovaPhase isFlashing reset hygiene, ejecta uOpacity uniform, setOpacity fading, and deterministic ejecta velocities', () => {
  const snSrc = fs.readFileSync('src/simulation/phases/SupernovaPhase.ts', 'utf8');
  const fragSrc = fs.readFileSync('src/shaders/ejecta.frag.glsl', 'utf8');
  const vertSrc = fs.readFileSync('src/shaders/ejecta.vert.glsl', 'utf8');

  // Verify isFlashing hygiene
  const isFlashingIdx = snSrc.indexOf('this.isFlashing = false;');
  const guardIdx = snSrc.indexOf('if (!this.ejectaMat?.uniforms?.uColor) return;');
  assert.ok(isFlashingIdx !== -1 && guardIdx !== -1, 'Both isFlashing and guard must exist');
  assert.ok(isFlashingIdx < guardIdx, 'this.isFlashing = false must be placed BEFORE early-return guard');

  // Verify ejecta shader uOpacity uniform
  assert.ok(fragSrc.includes('uniform float uOpacity;'), 'ejecta.frag.glsl must declare uniform float uOpacity');
  assert.ok(fragSrc.includes('* uOpacity'), 'ejecta.frag.glsl must multiply output alpha by uOpacity');

  // Verify ejecta vertex shader point-size depth guard
  assert.ok(vertSrc.includes('max(-mvPos.z, 0.001)'), 'ejecta.vert.glsl must guard against non-positive depth in point size division');
  assert.ok(vertSrc.includes('max(0.0,'), 'ejecta.vert.glsl must clamp point size to non-negative');

  // Verify SupernovaPhase sets ejectaMat uOpacity in init, update, and setOpacity
  assert.ok(snSrc.includes('uOpacity: { value: 1.0 }'), 'ejectaMat uniforms must initialize uOpacity to 1.0');
  assert.ok(snSrc.includes('this.ejectaMat.uniforms.uOpacity.value = opacity;'), 'setOpacity must update ejectaMat uOpacity');

  // Verify SupernovaPhase deterministic ejecta velocities using mulberry32
  assert.ok(snSrc.includes("import { mulberry32 } from '../../physics/math';"), 'SupernovaPhase must import mulberry32');
  assert.ok(snSrc.includes('DEFAULT_SUPERNOVA_SEED'), 'SupernovaPhase must define DEFAULT_SUPERNOVA_SEED');
  assert.ok(snSrc.includes('const rng = mulberry32(this.seed);'), 'SupernovaPhase must seed PRNG for ejecta velocities');
});

test('F6-11: POST /api/analyze rejects planet-less phases (Nebula, Protostar) with HTTP 400', async () => {
  const serverSrc = fs.readFileSync('server.ts', 'utf8');
  assert.ok(serverSrc.includes("phase === 'Nebula' || phase === 'Protostar'"), 'server.ts must gate Nebula and Protostar');
  assert.ok(serverSrc.includes('No planets exist in this phase'), 'server.ts must return clear gating message');

  const port = process.env.PORT || '3001';
  try {
    const health = await fetch(`http://localhost:${port}/health`);
    if (health.status !== 200) return;
    const healthData = await health.json();
    if (!healthData.aiEnabled) return;
  } catch {
    return; // Skip if server is not running in this test environment
  }

  for (const phase of ['Nebula', 'Protostar']) {
    const res = await fetch(`http://localhost:${port}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temp: 5778,
        mass: 1.0,
        lum: 1.0,
        age: 4600,
        phase,
        G: 1.0,
        alpha: 1.0
      })
    });
    assert.strictEqual(res.status, 400, `Expected 400 for phase ${phase}`);
    const data = await res.json();
    assert.ok(data.error.includes('No planets exist in this phase'), `Error message expected for ${phase}, got: ${data.error}`);
  }
});

test('F6-12: closeWebSocketServer closes wss gracefully, and server.ts drains WS and HTTP keep-alives', async () => {
  const wsSrc = fs.readFileSync('src/simulation/SimStateSocket.ts', 'utf8');
  const serverSrc = fs.readFileSync('server.ts', 'utf8');

  assert.ok(wsSrc.includes('export function closeWebSocketServer'), 'SimStateSocket must export closeWebSocketServer');
  assert.ok(serverSrc.includes('closeWebSocketServer'), 'server.ts must import closeWebSocketServer');
  assert.ok(serverSrc.includes('await closeWebSocketServer()'), 'server.ts must await closeWebSocketServer() in handleShutdown');
  assert.ok(serverSrc.includes('closeIdleConnections'), 'server.ts must drain idle HTTP keep-alive connections');

  // Verify RemnantPhase dead else branch was removed
  const remSrc = fs.readFileSync('src/simulation/phases/RemnantPhase.ts', 'utf8');
  assert.ok(!remSrc.includes('this.beamMat.opacity = opacityVal;'), 'RemnantPhase dead else setting beamMat.opacity must be removed');

  const { closeWebSocketServer } = await import('../../src/simulation/SimStateSocket.ts');
  await assert.doesNotReject(closeWebSocketServer());
});

// ==========================================
// P3 HeroStarSystem one-liners (non-shader items): respawn visibility-guard
// reset, lifespanReal provenance, typed preset param. Static
// source-contract checks — HeroStarSystem pulls the THREE render chain.
// ==========================================

test('F6-13: respawn resets _lastVisS like the other full-reset paths', () => {
  const heroSrc = fs.readFileSync('src/rendering/systems/HeroStarSystem.ts', 'utf8');
  const start = heroSrc.indexOf('respawn(renderer?');
  assert.ok(start !== -1, 'respawn must exist');
  const window = heroSrc.slice(start, start + 1500);
  assert.ok(window.includes('this._lastVisS = false'), 'respawn must reset _lastVisS');
  assert.ok(window.includes('this._lastVisP = false'), 'respawn must keep the P reset');
  assert.ok(window.includes('this._lastVisM = false'), 'respawn must keep the M reset');
  assert.ok(window.includes('this._lastVisR = false'), 'respawn must keep the R reset');
});

test('F6-14: every lifespanReal mass^-2.5 site documents the 10 Gyr anchor', () => {
  const heroSrc = fs.readFileSync('src/rendering/systems/HeroStarSystem.ts', 'utf8');
  const sites = heroSrc.split('\n').filter((l) => l.includes('this.lifespanReal = 10000 * Math.pow(this.mass, -2.5)'));
  assert.strictEqual(sites.length, 4, `expected 4 lifespanReal sites, found ${sites.length}`);
  const notes = heroSrc.split('\n').filter((l) => l.includes("Sun's ~10 Gyr main-sequence lifetime"));
  assert.strictEqual(notes.length, 4, `each lifespanReal site must carry the provenance comment, found ${notes.length}`);
});

test('F6-15: applyPreset takes a typed StarPreset, not any', () => {
  const heroSrc = fs.readFileSync('src/rendering/systems/HeroStarSystem.ts', 'utf8');
  assert.ok(heroSrc.includes('interface StarPreset'), 'StarPreset interface must exist');
  assert.ok(
    heroSrc.includes('applyPreset(preset: StarPreset'),
    'applyPreset preset param must be typed StarPreset'
  );
  assert.ok(!heroSrc.includes('applyPreset(preset: any'), 'applyPreset must not take any');
});

test('F6-16: sampleKroupaMass samples OB-association high-mass tail (>=15 M_sun Black Hole progenitors)', () => {
  let massiveCount = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const m = sampleKroupaMass();
    assert.ok(m >= 0.08 && m <= 45.0, `Mass out of bounds: ${m}`);
    if (m >= 15.0) massiveCount++;
  }
  // With 6% in 8-45 M_sun tail, ~2.5% of all stars are >= 15 M_sun
  assert.ok(massiveCount > 25, `Expected high-mass black hole progenitors, got ${massiveCount}/${N}`);
});

test('F6-18: black hole shadow authority scales meshes and the arch is not primary', () => {
  const cyg = blackHoleShadowRadius(21.2);
  assert.ok(Math.abs(cyg - BH_DISK_INNER) < 1e-9, `Cygnus b_c should be ${BH_DISK_INNER}, got ${cyg}`);
  assert.ok(Math.abs(blackHoleWorldShadowRadius(21.2, 1) - cyg) < 1e-9, 'unit group scale leaves b_c unchanged');
  assert.ok(Math.abs(blackHoleWorldShadowRadius(21.2, 2) - cyg * 2) < 1e-9, 'post ring must track hero expansion scale');
  const rg = blackHoleGravitationalRadius(21.2);
  assert.ok(Math.abs(rg - cyg / Math.sqrt(27)) < 1e-9, 'r_g = b_c / sqrt(27)');
  const lo = blackHoleShadowRadius(15);
  const hi = blackHoleShadowRadius(40);
  assert.ok(lo < cyg && cyg < hi, 'shadow radius increases with mass');
  assert.ok(lo / cyg > 0.7 && hi / cyg < 1.5, 'mass scale stays mild across 15–40 Msun');

  assert.strictEqual(blackHoleInFrontOfCamera(-2, 0.2), true);
  assert.strictEqual(blackHoleInFrontOfCamera(0.4, 0.2), false, 'behind-camera viewZ > 0 kills the lens');
  assert.strictEqual(blackHoleInFrontOfCamera(-2, 1.2), false, 'ndc z past the far plane is not in front');
  assert.strictEqual(blackHoleInFrontOfCamera(-2, -1.1), false);

  const diskGeo = GEOMETRIES.blackHoleDisk;
  assert.ok(diskGeo.parameters.thetaSegments <= 96, 'disk theta segments must stay ≤ 96');
  assert.strictEqual(diskGeo.parameters.thetaSegments, BH_DISK_THETA_SEGMENTS);
  assert.strictEqual((GEOMETRIES as unknown as { blackHoleLensedArch?: unknown }).blackHoleLensedArch, undefined);

  const physics = { G: 1, c: 1, h: 1, k_B: 1, weakForce: 1, strongForce: 1, darkEnergy: 1 };
  const phase = new RemnantPhase(21.2);
  phase.init(new THREE.Group());
  phase.update(0.016, 1, new THREE.Vector3(0, 3, 8), physics, 1.6, false, 1);
  const disk = phase.blackHoleGroup.getObjectByName('bhDisk') as THREE.Mesh;
  const wrap = phase.blackHoleGroup.getObjectByName('bhWrap') as THREE.Mesh;
  const core = phase.blackHoleGroup.getObjectByName('bhCore') as THREE.Mesh;
  const lens = phase.blackHoleGroup.getObjectByName('bhLocalLens') as THREE.Mesh;
  assert.ok(disk && wrap && core && lens, 'core, disk, secondary wrap, and muted local lens must exist');
  assert.ok(Math.abs(disk.scale.x - 1) < 1e-4, 'Cygnus disk scale is 1');
  assert.ok(Math.abs(wrap.scale.x - disk.scale.x) < 1e-6, 'wrap shares the disk scale');
  const coreScale = (cyg * BH_CORE_FILL) / BH_CORE_RADIUS;
  assert.ok(Math.abs(core.scale.x - coreScale) < 1e-3, `core scale ${core.scale.x} vs ${coreScale}`);
  assert.strictEqual(lens.visible, false, 'local lens mesh stays hidden');
  assert.strictEqual(phase.blackHoleGroup.getObjectByName('bhArch'), undefined);
  for (const child of phase.blackHoleGroup.children) {
    const mat = (child as THREE.Mesh).material as THREE.Material | undefined;
    if (mat) assert.notStrictEqual(mat.name, 'RemnantBlackHoleArchMaterial');
  }
  phase.setMass(40);
  const expected = blackHoleShadowRadius(40) / BH_DISK_INNER;
  assert.ok(Math.abs(disk.scale.x - expected) < 1e-4, 'setMass rescales the disk from b_c');
  phase.dispose();
});

test('F6-17: HeroStarSystem applyPreset and cosmic lifecycle preserve Black Hole phase and persistence', () => {
  const heroSrc = fs.readFileSync('src/rendering/systems/HeroStarSystem.ts', 'utf8');
  assert.ok(heroSrc.includes("preset.spectral_class === 'BH'"), 'applyPreset must check for BH spectral class');
  assert.ok(heroSrc.includes('this.t = 1.55;'), 'BH preset or initial cosmic remnant must set t = 1.55 (REMNANT)');
  assert.ok(heroSrc.includes('this.mass >= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE'), 'HeroStarSystem must guard Black Hole persistence');
});



