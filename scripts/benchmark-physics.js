import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createStellarState, advanceStellarState } from '../src/simulation/StellarPhysics.ts';
import { keplerianToCartesian } from '../src/simulation/OrbitalMechanics.ts';

function runBenchmark() {
  const steps = 1000;
  const numBodies = 500;

  // Setup isolated simulation state
  const stars = [];
  const bodies = [];

  for (let i = 0; i < numBodies; i++) {
    stars.push(createStellarState(`star_${i}`, 0.5 + (i % 25) * 0.1, 0.0134, (i % 10) * 1e9));
    bodies.push({
      elements: {
        semiMajorAxis_au: 0.5 + (i % 100) * 0.1,
        eccentricity: (i % 50) * 0.01,
        inclination_deg: i % 30,
        longitudeOfAscendingNode_deg: i % 360,
        argumentOfPeriapsis_deg: i % 360,
        meanAnomaly_deg: 0,
      },
      centralMass: 1.0,
    });
  }

  if (global.gc) {
    global.gc();
  }

  const startMemory = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  for (let i = 0; i < steps; i++) {
    const deltaYr = 1e5;
    // Step 1: Physics engine tick (stellar evolution)
    for (let j = 0; j < numBodies; j++) {
      stars[j] = advanceStellarState(stars[j], deltaYr).state;
    }
    // Step 2: Orbital mechanics calculation
    for (let j = 0; j < numBodies; j++) {
      bodies[j].elements.meanAnomaly_deg = (bodies[j].elements.meanAnomaly_deg + 0.1) % 360;
      keplerianToCartesian(bodies[j].elements, bodies[j].centralMass);
    }
  }

  const totalTimeMs = performance.now() - startTime;
  const avgTickTimeMs = totalTimeMs / steps;
  const heapUsedMb = Math.max(0, (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024);

  // Custom JSON schema accepted by github-action-benchmark
  const results = [
    {
      name: "Physics Loop - Avg Tick Time",
      unit: "ms/tick",
      value: parseFloat(avgTickTimeMs.toFixed(4)),
      biggerIsBetter: false
    },
    {
      name: "Physics Loop - Heap Delta",
      unit: "MB",
      value: parseFloat(heapUsedMb.toFixed(2)),
      biggerIsBetter: false
    }
  ];

  fs.writeFileSync('benchmark-output.json', JSON.stringify(results, null, 2));
  console.log(`Benchmark Complete: ${avgTickTimeMs.toFixed(3)}ms avg per tick`);
}

runBenchmark();
