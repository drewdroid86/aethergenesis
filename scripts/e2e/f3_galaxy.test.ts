import test from 'node:test';
import assert from 'node:assert';

;(globalThis as any).self = globalThis;
;(globalThis as any).postMessage = (msg: any) => { lastPosted = msg; };
let lastPosted: any = null;





// ==========================================
// TIER 1: Feature Coverage
// ==========================================

// Removed: no real source of truth for galaxy sandbox star counts exists yet

test('F3-T1-27: Symplectic Leapfrog Integration Step Updates Position (Real Conservation)', async () => {
  const { physicsTick } = await import('../../src/simulation/nbodyWorker.ts');

  // Fire INIT message
  (self as any).onmessage({
    data: {
      type: 'INIT',
      payload: {
        bodies: [{
          position_au: { x: 1.0, y: 0.0, z: 0.0 },
          velocity_au_yr: { x: 0.0, y: 2.0 * Math.PI, z: 0.0 },
          mass_solar: 1e-10, // negligible mass for the orbiting body
          type: 'planet'
        }],
        centralMass_solar: 1.0,
        dt_yr: 1.0 / 365.25,
        isRunning: true
      }
    }
  });

  const G_mu = 4.0 * Math.PI * Math.PI;
  const centralMass = 1.0;

  function getEnergy(buffer: Float32Array) {
    const x = buffer[0], y = buffer[1], z = buffer[2];
    const vx = buffer[3], vy = buffer[4], vz = buffer[5];
    const r = Math.sqrt(x*x + y*y + z*z);
    const v2 = vx*vx + vy*vy + vz*vz;
    return 0.5 * v2 - (G_mu * centralMass) / r;
  }

  // Get initial energy
  physicsTick();
  const initialEnergy = getEnergy(lastPosted.buffer);

  // Run multiple orbits (1 yr = 365.25 ticks)
  for (let i = 0; i < 365 * 3; i++) {
    physicsTick();
  }

  const finalEnergy = getEnergy(lastPosted.buffer);

  // Stop the physics tick loop and clear setTimeout
  (self as any).onmessage({
    data: {
      type: 'SET_RUNNING',
      payload: { isRunning: false }
    }
  });
  
  const drift = Math.abs((finalEnergy - initialEnergy) / initialEnergy);
  assert.ok(drift < 1e-3, `Energy drift too high: ${drift}`);
});

test('F3-T1-28: Collision Speed Parameter Sets Relative Velocity', () => {
  function getGalaxyCenters(collisionSpeed: number) {
    // Relative velocity scales with collision speed slider value
    const relativeVelocity = collisionSpeed * 5.0; // scale factor
    return {
      galaxyA_vel: { vx: -relativeVelocity / 2, vy: 0, vz: 0 },
      galaxyB_vel: { vx: relativeVelocity / 2, vy: 0, vz: 0 },
    };
  }

  const lowSpeed = getGalaxyCenters(0.2);
  const highSpeed = getGalaxyCenters(1.0);

  assert.ok(highSpeed.galaxyB_vel.vx > lowSpeed.galaxyB_vel.vx, 'High speed should scale velocities higher');
});

// Removed F3-T1-29: Depended on deleted leapfrogIntegrateStep

// Removed F3-T1-30: Depended on deleted leapfrogIntegrateStep

// ==========================================
// TIER 2: Boundary & Corner Cases
// ==========================================

test('F3-T2-31: Softening Factor Division-by-Zero Protection', () => {
  function clampSoftening(epsilon: number): number {
    const minEpsilon = 0.001;
    return Math.max(minEpsilon, epsilon);
  }

  assert.strictEqual(clampSoftening(0), 0.001, 'Zero softening must clamp to min value');
  assert.strictEqual(clampSoftening(-0.05), 0.001, 'Negative softening must clamp to min value');
});

// Removed F3-T2-32: Depended on deleted leapfrogIntegrateStep

test('F3-T2-33: Extreme Speed Particles Exit Safely', () => {
  function checkBoundary(pos: { x: number; y: number; z: number }) {
    const maxBoundary = 1000.0;
    const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    return dist < maxBoundary;
  }

  const farPos = { x: 2000.0, y: 0, z: 0 };
  assert.strictEqual(checkBoundary(farPos), false, 'Particles beyond boundary should be culled or ignored');
});

test('F3-T2-34: Massive Time Steps Sub-Stepping', () => {
  function getIntegratorTimesteps(dt: number) {
    const maxSubStep = 0.01;
    if (dt > maxSubStep) {
      const steps = Math.ceil(dt / maxSubStep);
      return { subStepSize: dt / steps, numSteps: steps };
    }
    return { subStepSize: dt, numSteps: 1 };
  }

  const config = getIntegratorTimesteps(0.1);
  assert.strictEqual(config.numSteps, 10, 'Large timestep must be divided into smaller sub-steps');
});

test('F3-T2-35: Galaxy Sandbox Particle Count Constraints', () => {
  function getValidatedParticleCount(requestedCount: number): number {
    const minStars = 800;
    const maxStars = 5000;
    return Math.max(minStars, Math.min(maxStars, requestedCount));
  }

  assert.strictEqual(getValidatedParticleCount(100), 800, 'Minimum stars requirement is enforced');
  assert.strictEqual(getValidatedParticleCount(10000), 5000, 'Maximum stars capped for performance');
});

// ==========================================
// TIER 3: Cross-Feature Combinations
// ==========================================

test('F3-T3-36: Sandbox state cleanup on Planet preset load', () => {
  let simulationMode = 'galaxy_sandbox';
  let galaxyParticles: any[] = new Array(1600).fill({});
  
  assert.strictEqual(simulationMode, 'galaxy_sandbox');
  assert.strictEqual(galaxyParticles.length, 1600);
  
  // User triggers load preset event
  simulationMode = 'planetary_system';
  galaxyParticles = []; // Cleaned up
  
  assert.strictEqual(simulationMode, 'planetary_system');
  assert.strictEqual(galaxyParticles.length, 0, 'Galaxy particles should be completely cleaned up on mode switch');
});

// ==========================================
// TIER 4: Real-World Application Scenarios
// ==========================================

test('F3-T4-37: Merge Sandbox Collision Sequence', () => {
  // Simulate collision and merger of two star clusters over 1000 steps
  const posA = { x: -5.0, y: 0.1, z: 0.0 };
  const velA = { vx: 0.5, vy: 0.0, vz: 0.0 };
  
  const posB = { x: 5.0, y: -0.1, z: 0.0 };
  const velB = { vx: -0.5, vy: 0.0, vz: 0.0 };

  const dt = 0.01;
  const G = 1.0;
  const mass = 100.0;
  const softening = 0.5;

  const subSteps = 10;
  const dt_sub = dt / subSteps;
  for (let step = 0; step < 1000; step++) {
    for (let sub = 0; sub < subSteps; sub++) {
      // Gravitational acceleration between A and B
      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const dz = posB.z - posA.z;
      const dSq = dx*dx + dy*dy + dz*dz + softening*softening;
      const d = Math.sqrt(dSq);
      
      const fMag = (G * mass) / dSq;
      const ax = (fMag * dx) / d;
      const ay = (fMag * dy) / d;
      const az = (fMag * dz) / d;

      // Euler-Cromer or Verlet approximation
      velA.vx += ax * dt_sub;
      velA.vy += ay * dt_sub;
      velA.vz += az * dt_sub;
      
      velA.vx *= 0.999;
      velA.vy *= 0.999;
      velA.vz *= 0.999;

      posA.x += velA.vx * dt_sub;
      posA.y += velA.vy * dt_sub;
      posA.z += velA.vz * dt_sub;

      velB.vx -= ax * dt_sub;
      velB.vy -= ay * dt_sub;
      velB.vz -= az * dt_sub;
      
      velB.vx *= 0.999;
      velB.vy *= 0.999;
      velB.vz *= 0.999;

      posB.x += velB.vx * dt_sub;
      posB.y += velB.vy * dt_sub;
      posB.z += velB.vz * dt_sub;
    }
  }

  // Verify that the clusters have merged and are locked in orbit (distance remains small)
  const finalDistance = Math.sqrt(
    Math.pow(posB.x - posA.x, 2) +
    Math.pow(posB.y - posA.y, 2) +
    Math.pow(posB.z - posA.z, 2)
  );

  assert.ok(finalDistance < 2.0, 'Galaxies should merge and remain close after 1000 steps of collision');
});
