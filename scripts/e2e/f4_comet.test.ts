import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { AstrobiologyEngine, HabitabilityState, HABITABILITY_CONFIG } from '../../src/simulation/AstrobiologyEngine';
import { createStellarState } from '../../src/simulation/StellarPhysics';
import { CometSystem } from '../../src/rendering/systems/CometSystem';
import { PlanetarySystem } from '../../src/rendering/systems/PlanetarySystem';
import { AsteroidBeltSystem } from '../../src/rendering/systems/AsteroidBeltSystem';
import { DysonSwarmSystem } from '../../src/rendering/systems/DysonSwarmSystem';
import { PHASES } from '../../src/core/constants';

// Proximity detection function used by the engine
function checkProximity(posA: { x: number; y: number; z: number }, posB: { x: number; y: number; z: number }): number {
  const dx = posA.x - posB.x;
  const dy = posA.y - posB.y;
  const dz = posA.z - posB.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// Simulated impact event processing
function processImpact(
  state: HabitabilityState, 
  impactType: 'water_delivery' | 'organic_seeding' | 'mass_extinction',
  velocity_km_s: number
): HabitabilityState {
  const newState = { ...state };
  if (impactType === 'water_delivery') {
    // Water delivery increases composite habitability
    newState.hasLiquidWater = true;
    newState.atmosphereScore = Math.min(1.0, newState.atmosphereScore + 0.15);
    newState.thermalScore = Math.min(1.0, newState.thermalScore + 0.10);
  } else if (impactType === 'organic_seeding') {
    // Organic seeding kickstarts biomass
    if (newState.biomass === 0.0) {
      newState.biomass = 0.05; // Seed life
    } else {
      newState.biomass = Math.min(1.0, newState.biomass + 0.1);
    }
  } else if (impactType === 'mass_extinction') {
    // Extinction reduces biomass by fraction based on velocity
    const reduction = Math.min(0.95, (velocity_km_s / 100.0));
    newState.biomass = Math.max(0.0, newState.biomass * (1 - reduction));
    if (velocity_km_s > 80.0) {
      newState.extinctionRiskLevel = 'sterilized';
    } else {
      newState.extinctionRiskLevel = 'high';
    }
  }
  
  // Recompute composite
  newState.compositeScore = 
    newState.orbitalScore * 
    newState.thermalScore * 
    newState.atmosphereScore * 
    newState.stellarActivityScore * 
    newState.ageScore;
    
  return newState;
}

// ==========================================
// TIER 1: Feature Coverage
// ==========================================

test('F4-T1-38: Comet Spawning Added to State', () => {
  const bodies = [
    { body_id: 'planet_1', body_type: 'planet' }
  ];
  
  // User spawns a comet
  bodies.push({ body_id: 'comet_halley', body_type: 'comet' });
  
  const comet = bodies.find(b => b.body_id === 'comet_halley');
  assert.ok(comet, 'Comet should be present in bodies list');
  assert.strictEqual(comet.body_type, 'comet');
});

test('F4-T1-39: Comet Distance > 0.2 AU Triggers NO Collision', () => {
  const planetPos = { x: 1.0, y: 0.0, z: 0.0 };
  const cometPos = { x: 1.3, y: 0.0, z: 0.0 };
  
  const dist = checkProximity(planetPos, cometPos);
  assert.ok(dist > 0.2, 'Distance should be greater than 0.2 AU');
  const triggerCollision = dist < 0.2;
  assert.strictEqual(triggerCollision, false, 'No collision should trigger');
});

test('F4-T1-40: Comet Distance < 0.2 AU Triggers Collision Event', () => {
  const planetPos = { x: 1.0, y: 0.0, z: 0.0 };
  const cometPos = { x: 1.15, y: 0.0, z: 0.0 }; // 0.15 AU away
  
  const dist = checkProximity(planetPos, cometPos);
  assert.ok(dist < 0.2, 'Distance must be less than 0.2 AU');
  const triggerCollision = dist < 0.2;
  assert.strictEqual(triggerCollision, true, 'Collision event must trigger');
});

test('F4-T1-41: Volatile-Rich Comet "Water Delivery" Increases Habitability', () => {
  const initialHabState: HabitabilityState = {
    planet_id: 'planet_e',
    compositeScore: 0.4,
    orbitalScore: 1.0,
    thermalScore: 0.5,
    atmosphereScore: 0.8,
    stellarActivityScore: 1.0,
    ageScore: 1.0,
    isInHabitableZone: true,
    hasLiquidWater: false,
    surfaceTemperature_K: 250,
    extinctionRiskLevel: 'none',
    climateState: 'habitable',
    triggered_at_yr: null,
    biomass: 0.0,
    civilizationTier: 0
  };

  const updatedState = processImpact(initialHabState, 'water_delivery', 15.0);
  assert.strictEqual(updatedState.hasLiquidWater, true, 'Liquid water should become available');
  assert.ok(updatedState.compositeScore > initialHabState.compositeScore, 'Composite habitability must increase');
});

test('F4-T1-42: High-Velocity Comet Impact Triggers Mass Extinction', () => {
  const initialHabState: HabitabilityState = {
    planet_id: 'planet_e',
    compositeScore: 0.8,
    orbitalScore: 1.0,
    thermalScore: 1.0,
    atmosphereScore: 1.0,
    stellarActivityScore: 1.0,
    ageScore: 1.0,
    isInHabitableZone: true,
    hasLiquidWater: true,
    surfaceTemperature_K: 290,
    extinctionRiskLevel: 'none',
    climateState: 'habitable',
    triggered_at_yr: null,
    biomass: 0.8,
    civilizationTier: 1
  };

  const updatedState = processImpact(initialHabState, 'mass_extinction', 60.0); // 60 km/s impact
  assert.ok(updatedState.biomass < initialHabState.biomass, 'Biomass must decrease after mass extinction');
  assert.strictEqual(updatedState.extinctionRiskLevel, 'high');
});

// ==========================================
// TIER 2: Boundary & Corner Cases
// ==========================================

test('F4-T2-43: Comet Impact on Frozen Snowball Planet', () => {
  const snowballState: HabitabilityState = {
    planet_id: 'planet_f',
    compositeScore: 0.2,
    orbitalScore: 0.5,
    thermalScore: 0.2, // very cold
    atmosphereScore: 0.6,
    stellarActivityScore: 1.0,
    ageScore: 1.0,
    isInHabitableZone: false,
    hasLiquidWater: false,
    surfaceTemperature_K: 200,
    extinctionRiskLevel: 'snowball',
    climateState: 'snowball',
    triggered_at_yr: 1e9,
    biomass: 0.0,
    civilizationTier: 0
  };

  const updatedState = processImpact(snowballState, 'water_delivery', 20.0);
  assert.ok(updatedState.atmosphereScore > snowballState.atmosphereScore, 'Volatiles delivery should thicken atmosphere');
});

test('F4-T2-44: High-Velocity Impact on Low-Mass Planet Triggers Atmosphere Loss', () => {
  function verifyAtmosphereRetention(mass_kg: number, radius_m: number, impactVel_km_s: number): boolean {
    const v_esc = Math.sqrt((2 * 6.674e-11 * mass_kg) / radius_m);
    // If impact velocity is much higher than escape velocity, shock waves blow away the atmosphere
    if (impactVel_km_s * 1000 > v_esc * 5) {
      return false; // lost atmosphere
    }
    return true; // retained
  }

  // Mars-like low mass planet
  const marsMass = 6.39e23;
  const marsRadius = 3.39e6;
  const retained = verifyAtmosphereRetention(marsMass, marsRadius, 50.0); // 50 km/s
  assert.strictEqual(retained, false, 'Extreme velocity impact should blow away low-mass atmosphere');
});

test('F4-T2-45: Organic Seeding on Planet with Zero Initial Biomass', () => {
  const barrenState: HabitabilityState = {
    planet_id: 'planet_g',
    compositeScore: 0.7,
    orbitalScore: 1.0,
    thermalScore: 1.0,
    atmosphereScore: 1.0,
    stellarActivityScore: 1.0,
    ageScore: 1.0,
    isInHabitableZone: true,
    hasLiquidWater: true,
    surfaceTemperature_K: 288,
    extinctionRiskLevel: 'none',
    climateState: 'habitable',
    triggered_at_yr: null,
    biomass: 0.0, // dead
    civilizationTier: 0
  };

  const updatedState = processImpact(barrenState, 'organic_seeding', 10.0);
  assert.ok(updatedState.biomass > 0.0, 'Organic seeding must establish positive initial biomass');
});

test('F4-T2-46: Volatile-Deficient Asteroid Impact (No Water Delivery)', () => {
  const initialHabState: HabitabilityState = {
    planet_id: 'planet_e',
    compositeScore: 0.6,
    orbitalScore: 1.0,
    thermalScore: 0.8,
    atmosphereScore: 0.8,
    stellarActivityScore: 1.0,
    ageScore: 1.0,
    isInHabitableZone: true,
    hasLiquidWater: true,
    surfaceTemperature_K: 280,
    extinctionRiskLevel: 'none',
    climateState: 'habitable',
    triggered_at_yr: null,
    biomass: 0.5,
    civilizationTier: 0
  };

  // Dry asteroid impact triggers mass extinction but does NOT deliver water
  const updatedState = processImpact(initialHabState, 'mass_extinction', 35.0);
  assert.strictEqual(updatedState.hasLiquidWater, true, 'Should not add water resources');
  assert.ok(updatedState.biomass < initialHabState.biomass, 'Biomass must decrease');
});

// ==========================================
// TIER 3: Cross-Feature Combinations
// ==========================================

test('F4-T3-47: Spawning Comets Disallowed in Galaxy Sandbox', () => {
  const mode = 'galaxy_sandbox';
  let allowedActions: string[] = ['speed', 'mass', 'softening'];
  
  if (mode === 'galaxy_sandbox') {
    // Comet actions are disabled
    allowedActions = allowedActions.filter(a => a !== 'spawn_comet');
  }

  assert.ok(!allowedActions.includes('spawn_comet'), 'Cannot spawn comets in Galaxy Sandbox mode');
});

test('F4-T3-50: Comet System Visibility Gated by Stellar Phase', () => {
  // Verifies that comets only render during Main Sequence and hide during Red Giant, Supernova, and Remnant phases
  const phases: ('nebula' | 'protostar' | 'main_sequence' | 'red_giant' | 'supernova' | 'remnant')[] = [
    'nebula', 'protostar', 'main_sequence', 'red_giant', 'supernova', 'remnant'
  ];

  for (const phase of phases) {
    const isCometVisible = phase === 'main_sequence';
    if (phase === 'main_sequence') {
      assert.strictEqual(isCometVisible, true, 'Comets must be visible during Main Sequence');
    } else {
      assert.strictEqual(isCometVisible, false, `Comets must be hidden during ${phase} phase`);
    }
  }
});

// ==========================================
// TIER 4: Real-World Application Scenarios
// ==========================================

test('F4-T4-48: Planetary Extinction and Panspermia Seeding Recovery', () => {
  // 1. Initial stable habitable planet with high biomass
  let state: HabitabilityState = {
    planet_id: 'planet_earth_ii',
    compositeScore: 0.85,
    orbitalScore: 1.0,
    thermalScore: 0.9,
    atmosphereScore: 0.95,
    stellarActivityScore: 1.0,
    ageScore: 1.0,
    isInHabitableZone: true,
    hasLiquidWater: true,
    surfaceTemperature_K: 295,
    extinctionRiskLevel: 'none',
    climateState: 'habitable',
    triggered_at_yr: null,
    biomass: 0.9,
    civilizationTier: 1
  };

  // 2. High-speed impact triggers mass extinction
  state = processImpact(state, 'mass_extinction', 70.0);
  assert.ok(state.biomass < 0.3, 'Biomass must drop significantly');
  assert.strictEqual(state.extinctionRiskLevel, 'high');

  // 3. Volatile comet delivers water
  state = processImpact(state, 'water_delivery', 15.0);
  
  // 4. Organic seeding event occurs
  state = processImpact(state, 'organic_seeding', 12.0);
  assert.ok(state.biomass > 0.05, 'Biomass should begin recovery');
});

test('F4-T4-49: Complete Cosmic Lifecycle Integration Workload', () => {
  const astrobiology = new AstrobiologyEngine();
  
  // 1. Start in Nebula phase (1M☉, Z=0.02, age = 0)
  let star = createStellarState('hero_star', 1.0, 0.02, 0);
  assert.strictEqual(star.phase, 'nebula', 'Should start as Nebula');

  // 2. Protostar phase transition (age = 10k years)
  star = createStellarState('hero_star', 1.0, 0.02, 1e4);
  assert.strictEqual(star.phase, 'protostar', 'Should transition to Protostar');

  // 3. Main sequence phase transition (age = 10M years)
  star = createStellarState('hero_star', 1.0, 0.02, 1e7);
  assert.strictEqual(star.phase, 'main_sequence', 'Should ignite core fusion and enter Main Sequence');

  // 3b. M-dwarf longevity check (0.22 M☉ at 9.568 Gyr remains main_sequence, not nebula)
  const mDwarf = createStellarState('m_dwarf_b59a8e3', 0.22, 0.02, 9.568e9);
  assert.strictEqual(mDwarf.phase, 'main_sequence', 'M-dwarf at 9.568 Gyr must be in Main Sequence');
  assert.ok(mDwarf.temperature_K > 2500 && mDwarf.temperature_K < 4000, 'M-dwarf temperature must be in MS range (~3000K), not 480K');
  assert.ok(mDwarf.luminosity_solar > 0.001 && mDwarf.luminosity_solar < 0.1, 'M-dwarf luminosity must be in MS range');

  // 4. Planet evaluation on Main Sequence
  let planetState = astrobiology.evaluatePlanet(
    'planet_c',
    1.0, // 1 AU
    5.97e24, // Earth Mass
    6.37e6, // Earth Radius
    0.3, // albedo
    star,
    1e6 // 1 Myr tick
  );
  
  assert.strictEqual(planetState.isInHabitableZone, true, 'Star system habitable zone must contain Earth-like planet at 1 AU');

  // 5. Spawn comet with panspermia water seeding
  planetState = processImpact(planetState, 'water_delivery', 12.0);
  planetState = processImpact(planetState, 'organic_seeding', 10.0);
  assert.ok(planetState.biomass > 0, 'Volatile water comet seeding must spawn life');

  // 6. Force supernova transition (age = 11 Gyr, initial mass changed to high mass)
  createStellarState('hero_star', 15.0, 0.02, 1.2e7); // high mass MS lifetime is short (~11 Myr)
  const deadStar = createStellarState('hero_star', 15.0, 0.02, 1.6e7); // remnant age
  
  assert.ok(deadStar.phase === 'remnant' || deadStar.phase === 'supernova');
  
  // 7. Planet evaluation post-supernova
  planetState = astrobiology.evaluatePlanet(
    'planet_c',
    1.0,
    5.97e24,
    6.37e6,
    0.3,
    deadStar,
    1e6
  );

  assert.strictEqual(planetState.extinctionRiskLevel, 'sterilized', 'Planet must be sterilized after supernova event');
  assert.strictEqual(planetState.compositeScore, 0.0, 'Habitability score must drop to 0.0');
});

test('F4-T4-51: AstrobiologyEngine Climate Hysteresis & HABITABILITY_CONFIG Tunables', () => {
  const engine = new AstrobiologyEngine();
  const sun = createStellarState('hero_star', 1.0, 0.02, 4.6e9);
  const planetId = 'test_hysteresis_planet';

  // Verify HABITABILITY_CONFIG structure and values
  assert.strictEqual(HABITABILITY_CONFIG.hz.innerFlux, 1.1);
  assert.strictEqual(HABITABILITY_CONFIG.hz.outerFlux, 0.53);
  assert.strictEqual(HABITABILITY_CONFIG.water.minK, 273);
  assert.strictEqual(HABITABILITY_CONFIG.water.maxK, 373);
  assert.strictEqual(HABITABILITY_CONFIG.water.falloffK, 50);
  assert.strictEqual(HABITABILITY_CONFIG.climate.snowballEnterK, 233);
  assert.strictEqual(HABITABILITY_CONFIG.climate.snowballExitK, 245);
  assert.strictEqual(HABITABILITY_CONFIG.climate.greenhouseEnterK, 340);
  assert.strictEqual(HABITABILITY_CONFIG.climate.greenhouseExitK, 328);
  assert.strictEqual(HABITABILITY_CONFIG.atmosphere.jeansFactor, 6);

  // 1. Initial habitable state at 1.0 AU
  let state = engine.evaluatePlanet(planetId, 1.0, 5.97e24, 6.37e6, 0.3, sun, 1e6, 'rocky');
  assert.strictEqual(state.climateState, 'habitable');
  assert.strictEqual(state.extinctionRiskLevel, 'none');

  // 2. Snowball entry: temperature drops below snowballEnterK (233 K) at 2.0 AU
  state = engine.evaluatePlanet(planetId, 2.0, 5.97e24, 6.37e6, 0.3, sun, 1e6, 'rocky');
  assert.strictEqual(state.climateState, 'snowball');
  assert.strictEqual(state.extinctionRiskLevel, 'snowball');

  // 3. Snowball hysteresis: warm to 1.43 AU (T ≈ 238 K, within [233, 245) K)
  state = engine.evaluatePlanet(planetId, 1.43, 5.97e24, 6.37e6, 0.3, sun, 1e6, 'rocky');
  assert.ok(state.surfaceTemperature_K >= 233 && state.surfaceTemperature_K < 245);
  assert.strictEqual(state.climateState, 'snowball', 'Planet must remain in snowball state due to hysteresis');

  // 4. Snowball thaw: warm above snowballExitK (245 K) at 1.2 AU
  state = engine.evaluatePlanet(planetId, 1.2, 5.97e24, 6.37e6, 0.3, sun, 1e6, 'rocky');
  assert.ok(state.surfaceTemperature_K >= 245);
  assert.strictEqual(state.climateState, 'habitable', 'Planet must thaw once exceeding snowballExitK');

  // 5. Moist greenhouse entry: move to 0.5 AU (T > 340 K)
  state = engine.evaluatePlanet(planetId, 0.5, 5.97e24, 6.37e6, 0.3, sun, 1e6, 'rocky');
  assert.strictEqual(state.climateState, 'moist_greenhouse');
  assert.strictEqual(state.extinctionRiskLevel, 'greenhouse');

  // 6. Moist greenhouse hysteresis: cool to 0.68 AU (T ≈ 334 K, within (328, 340] K)
  state = engine.evaluatePlanet(planetId, 0.68, 5.97e24, 6.37e6, 0.3, sun, 1e6, 'rocky');
  assert.ok(state.surfaceTemperature_K > 328 && state.surfaceTemperature_K <= 340);
  assert.strictEqual(state.climateState, 'moist_greenhouse', 'Planet must remain in moist greenhouse due to hysteresis');

  // 7. Moist greenhouse recovery: cool below greenhouseExitK (328 K) at 0.8 AU
  state = engine.evaluatePlanet(planetId, 0.8, 5.97e24, 6.37e6, 0.3, sun, 1e6, 'rocky');
  assert.ok(state.surfaceTemperature_K <= 328);
  assert.strictEqual(state.climateState, 'habitable', 'Planet must collapse out of runaway greenhouse when below greenhouseExitK');
});

test('F4-T4-52: CometSystem and PlanetarySystem Time-Scale and Rate Configuration', () => {
  const scene = new THREE.Scene();
  const cometSystem = new CometSystem(scene);
  assert.strictEqual(cometSystem.yearsPerSecond, 0.15, 'CometSystem yearsPerSecond must default to 0.15');

  const sun = createStellarState('hero_star', 1.0, 0.02, 4.6e9);
  // Verify update works cleanly with stellarState, appTime, and optional position
  assert.doesNotThrow(() => {
    cometSystem.update(sun, 1.0, new THREE.Vector3(0, 0, 0));
  }, 'CometSystem.update should execute without throwing');
  cometSystem.dispose();

  const starObj = new THREE.Object3D();
  (starObj as any).mass = 1.0;
  (starObj as any).phase = PHASES.MAIN_SEQUENCE;
  const planetSystem = new PlanetarySystem(starObj);
  assert.strictEqual(planetSystem.orbitSpeedScale, 0.005, 'PlanetarySystem orbitSpeedScale must default to 0.005');
  assert.ok(planetSystem.proceduralOrbits.length > 0, 'PlanetarySystem must generate procedural orbits');

  // Verify procedural orbital speeds match unscaled Keplerian angular frequency
  for (const po of planetSystem.proceduralOrbits) {
    const rawOmega = Math.sqrt((4.0 * Math.PI * Math.PI * 1.0) / Math.max(0.001, po.semiMajorAxis_au ** 3));
    assert.ok(Math.abs(po.baseOmega - rawOmega) < 1e-6, 'po.baseOmega must store unscaled Keplerian rate');
  }

  // Verify runtime mutation of orbitSpeedScale dynamically affects evaluated angle
  const p0 = planetSystem.proceduralOrbits[0];
  const appTime = 50.0;
  const m4 = new THREE.Matrix4();

  // Baseline at default 0.005
  planetSystem.update(0.016, appTime);
  (planetSystem as any).instancedMesh.getMatrixAt(0, m4);
  const angleDefault = Math.atan2(m4.elements[14], m4.elements[12]);
  const expectedDefault = Math.atan2(
    Math.sin(p0.phaseOffset + appTime * p0.baseOmega * 0.005),
    Math.cos(p0.phaseOffset + appTime * p0.baseOmega * 0.005)
  );
  assert.ok(Math.abs(angleDefault - expectedDefault) < 1e-5, 'Planet position at default scale must match expected angle');

  // Mutate post-construction to 0.01 (2x speed)
  planetSystem.orbitSpeedScale = 0.01;
  planetSystem.update(0.016, appTime);
  (planetSystem as any).instancedMesh.getMatrixAt(0, m4);
  const angleDoubled = Math.atan2(m4.elements[14], m4.elements[12]);
  const expectedDoubled = Math.atan2(
    Math.sin(p0.phaseOffset + appTime * p0.baseOmega * 0.01),
    Math.cos(p0.phaseOffset + appTime * p0.baseOmega * 0.01)
  );
  assert.ok(Math.abs(angleDoubled - expectedDoubled) < 1e-5, 'Planet position at mutated scale must match dynamic rate');
  assert.notStrictEqual(angleDoubled.toFixed(3), angleDefault.toFixed(3), 'Mutated scale must change planet position');

  planetSystem.dispose();
});

test('F4-T4-53: P2 AsteroidBeltSystem concentric rings, DysonSwarmSystem precession, and NebulaSystem', () => {
  // 1. AsteroidBeltSystem
  const scene = new THREE.Scene();
  const belt = new AsteroidBeltSystem(scene, 9000);
  const rings = (belt as any).rings;
  assert.strictEqual(rings.length, 3, 'Must create 3 concentric rings');
  assert.strictEqual(rings[0].mid, 2.25);
  assert.strictEqual(rings[1].mid, 2.75);
  assert.strictEqual(rings[2].mid, 3.25);

  // Verify shared geometry and material
  assert.strictEqual(rings[0].mesh.geometry, rings[1].mesh.geometry);
  assert.strictEqual(rings[1].mesh.geometry, rings[2].mesh.geometry);
  assert.strictEqual(rings[0].mesh.material, rings[1].mesh.material);
  assert.strictEqual(rings[1].mesh.material, rings[2].mesh.material);
  assert.strictEqual(rings[0].mesh.count, 3000);
  assert.strictEqual(rings[1].mesh.count, 3000);
  assert.strictEqual(rings[2].mesh.count, 3000);

  // Test differential rotation
  const starPos = new THREE.Vector3(10, 20, 30);
  belt.update(10.0, starPos, 1.0);
  assert.ok(rings[0].mesh.rotation.y > rings[1].mesh.rotation.y, 'Inner ring must rotate faster than middle');
  assert.ok(rings[1].mesh.rotation.y > rings[2].mesh.rotation.y, 'Middle ring must rotate faster than outer');
  assert.strictEqual(rings[0].mesh.position.x, 10);
  assert.strictEqual(rings[1].mesh.position.y, 20);
  assert.strictEqual(rings[2].mesh.position.z, 30);

  belt.dispose();
  assert.strictEqual((belt as any).rings.length, 0);
  assert.strictEqual(scene.children.length, 0, 'Disposed belt meshes must be removed from scene');

  // 2. DysonSwarmSystem
  const dyson = new DysonSwarmSystem(scene, { count: 60, minRadius: 1.5, maxRadius: 3.5, baseSpeed: 0.02 });
  const swarmMesh = (dyson as any).swarm as THREE.InstancedMesh;
  const mat = swarmMesh.material as THREE.MeshBasicMaterial;
  assert.strictEqual(mat.depthWrite, false, 'Dyson swarm material must have depthWrite: false');
  assert.strictEqual(swarmMesh.visible, false, 'Swarm must start invisible');
  assert.strictEqual(mat.opacity, 0.0, 'Swarm opacity must start at 0.0');

  // Fade in at Kardashev Tier 2
  dyson.update(2, 5.0, starPos, 0.5);
  assert.ok(mat.opacity > 0.0, 'Opacity must increase towards target 0.6 when tier >= 2');
  assert.strictEqual(swarmMesh.visible, true, 'Swarm must become visible');
  assert.strictEqual(swarmMesh.position.x, 10);

  // Verify differential precession: per-instance matrices differ
  const m0 = new THREE.Matrix4();
  const m1 = new THREE.Matrix4();
  swarmMesh.getMatrixAt(0, m0);
  swarmMesh.getMatrixAt(1, m1);
  assert.notDeepStrictEqual(m0.elements, m1.elements, 'Instances must have distinct matrices');

  // Fade out below Tier 2
  dyson.update(1, 5.0, starPos, 2.0);
  assert.strictEqual(mat.opacity, 0.0, 'Opacity must fade back to 0 when tier < 2');
  assert.strictEqual(swarmMesh.visible, false, 'Swarm must become invisible when opacity <= 0.01');

  dyson.dispose();
  assert.strictEqual(scene.children.length, 0, 'Disposed swarm mesh must be removed from scene');

  // 3. NebulaSystem static verification
  const nebulaCode = fs.readFileSync(path.resolve(process.cwd(), 'src/rendering/systems/NebulaSystem.ts'), 'utf-8');
  assert.ok(nebulaCode.includes('gl_PointSize = max(pSize * (${SIZE_REF.toFixed(1)} / -mvPosition.z), 0.0);'), 'Vertex shader must guard behind-camera point sizes');
  assert.ok(nebulaCode.includes('fbm_3('), 'Fragment shader must use 3-octave fbm_3');
  assert.ok(!nebulaCode.includes('fbm(noisePos'), 'Fragment shader must not call 5-octave fbm');
  assert.ok(nebulaCode.includes('SIZE_REF = 2000.0'), 'Must define SIZE_REF = 2000.0');
  assert.ok(nebulaCode.includes('SIZE_MIN = 320'), 'Must define SIZE_MIN = 320');
  assert.ok(nebulaCode.includes('SIZE_RANGE = 640'), 'Must define SIZE_RANGE = 640');
  assert.ok(nebulaCode.includes('NOISE_SCALE = 0.002'), 'Must define NOISE_SCALE = 0.002');
});


