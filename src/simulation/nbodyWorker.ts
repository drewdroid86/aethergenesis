import { OrbitalBody } from './OrbitalMechanics';

// Web worker state
let bodies: OrbitalBody[] = [];
let centralMass_solar: number = 1.0;
let isRunning = false;
let softeningSq = 0.0001; // small softening for N-body
let dt_yr = 1.0 / 365.25; // default 1 day step
let tickTimeout: any = null;

// BOLT: Persistent buffers to eliminate per-frame allocations
let accelBuffer: Float64Array;
let outputBuffer: Float32Array;

const G_mu = 4.0 * Math.PI * Math.PI;

self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') {
        bodies = payload.bodies || [];
        centralMass_solar = payload.centralMass_solar || 1.0;
        dt_yr = payload.dt_yr || (1.0 / 365.25);

        // BOLT: Initialize buffers
        accelBuffer = new Float64Array(bodies.length * 3);
        outputBuffer = new Float32Array(bodies.length * 7);

        if (!isRunning) {
            isRunning = true;
            physicsTick();
        }
    } else if (type === 'ADD_BODY') {
        bodies.push(payload.body);
        // BOLT: Resize buffers
        accelBuffer = new Float64Array(bodies.length * 3);
        outputBuffer = new Float32Array(bodies.length * 7);
    } else if (type === 'SET_RUNNING') {
        isRunning = payload.isRunning;
        if (isRunning && !tickTimeout) {
            physicsTick();
        }
    } else if (type === 'UPDATE_TIMESTEP') {
        dt_yr = payload.dt_yr;
    }
};

/**
 * BOLT: Zero-allocation acceleration calculation.
 * Updates the global accelBuffer directly.
 */
function updateAccelerations() {
    accelBuffer.fill(0);
    const n = bodies.length;

    // Central star gravity: a = -G*M_star / r^3 * r_vec
    const starAccelFactor = -G_mu * centralMass_solar;
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        const px = b.position_au.x;
        const py = b.position_au.y;
        const pz = b.position_au.z;
        const rSq = px * px + py * py + pz * pz;
        const invR3 = 1.0 / Math.pow(rSq + softeningSq, 1.5);
        const aMag = starAccelFactor * invR3;
        
        accelBuffer[i * 3 + 0] = aMag * px;
        accelBuffer[i * 3 + 1] = aMag * py;
        accelBuffer[i * 3 + 2] = aMag * pz;
    }

    // N-Body gravity: a_i = G*M_j / r^3 * r_ij
    for (let i = 0; i < n; i++) {
        const bi = bodies[i];
        const pix = bi.position_au.x;
        const piy = bi.position_au.y;
        const piz = bi.position_au.z;

        for (let j = i + 1; j < n; j++) {
            const bj = bodies[j];
            const dx = bj.position_au.x - pix;
            const dy = bj.position_au.y - piy;
            const dz = bj.position_au.z - piz;
            const distSq = dx * dx + dy * dy + dz * dz;
            const invR3 = 1.0 / Math.pow(distSq + softeningSq, 1.5);

            const commonFactor = G_mu * invR3;
            
            const ax = commonFactor * dx;
            const ay = commonFactor * dy;
            const az = commonFactor * dz;

            // Update i with bj's mass
            accelBuffer[i * 3 + 0] += ax * bj.mass_solar;
            accelBuffer[i * 3 + 1] += ay * bj.mass_solar;
            accelBuffer[i * 3 + 2] += az * bj.mass_solar;

            // Update j with bi's mass (opposite direction)
            accelBuffer[j * 3 + 0] -= ax * bi.mass_solar;
            accelBuffer[j * 3 + 1] -= ay * bi.mass_solar;
            accelBuffer[j * 3 + 2] -= az * bi.mass_solar;
        }
    }
}

function physicsTick() {
    if (!isRunning) {
        tickTimeout = null;
        return;
    }

    // Störmer-Verlet (Leapfrog) Integrator
    const n = bodies.length;
    const dt2 = dt_yr / 2.0;
    
    // 1. Calculate half-step velocities
    updateAccelerations();
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        b.velocity_au_yr.x += accelBuffer[i * 3 + 0] * dt2;
        b.velocity_au_yr.y += accelBuffer[i * 3 + 1] * dt2;
        b.velocity_au_yr.z += accelBuffer[i * 3 + 2] * dt2;

        // 2. Full-step positions
        b.position_au.x += b.velocity_au_yr.x * dt_yr;
        b.position_au.y += b.velocity_au_yr.y * dt_yr;
        b.position_au.z += b.velocity_au_yr.z * dt_yr;
    }

    // 3. Recalculate forces at new positions
    updateAccelerations();

    // 4. Calculate full-step velocities
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        b.velocity_au_yr.x += accelBuffer[i * 3 + 0] * dt2;
        b.velocity_au_yr.y += accelBuffer[i * 3 + 1] * dt2;
        b.velocity_au_yr.z += accelBuffer[i * 3 + 2] * dt2;
    }

    // Pack state for rendering main thread
    // BOLT: Reuse outputBuffer. Since we postMessage with transferables,
    // we need to re-allocate if the buffer is detached.
    if (outputBuffer.byteLength === 0) {
        outputBuffer = new Float32Array(n * 7);
    }

    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        outputBuffer[i * 7 + 0] = b.position_au.x;
        outputBuffer[i * 7 + 1] = b.position_au.y;
        outputBuffer[i * 7 + 2] = b.position_au.z;
        outputBuffer[i * 7 + 3] = b.velocity_au_yr.x;
        outputBuffer[i * 7 + 4] = b.velocity_au_yr.y;
        outputBuffer[i * 7 + 5] = b.velocity_au_yr.z;
        outputBuffer[i * 7 + 6] = b.type === 'planet' ? 0 : 1;
    }

    // Pass buffer via transferable interface for zero-alloc (main thread ownership)
    (self as any).postMessage({ type: 'UPDATE', buffer: outputBuffer }, [outputBuffer.buffer]);

    // Schedule next tick (60Hz targeting)
    tickTimeout = setTimeout(physicsTick, 16);
}
