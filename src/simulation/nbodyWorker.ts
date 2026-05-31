import { OrbitalBody } from './OrbitalMechanics';

// Web worker state
let bodies: OrbitalBody[] = [];
let centralMass_solar: number = 1.0;
let isRunning = false;
let softeningSq = 0.0001; // small softening for N-body
let dt_yr = 1.0 / 365.25; // default 1 day step
let tickTimeout: any = null;

const G_mu = 4.0 * Math.PI * Math.PI;

// BOLT: Persistent buffers to eliminate per-frame allocations
let accelBuffer = new Float32Array(0);

self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') {
        bodies = payload.bodies || [];
        centralMass_solar = payload.centralMass_solar || 1.0;
        dt_yr = payload.dt_yr || (1.0 / 365.25);

        // Resize acceleration buffer if needed
        if (accelBuffer.length !== bodies.length * 3) {
            accelBuffer = new Float32Array(bodies.length * 3);
        }

        if (!isRunning) {
            isRunning = true;
            physicsTick();
        }
    } else if (type === 'ADD_BODY') {
        bodies.push(payload.body);
        accelBuffer = new Float32Array(bodies.length * 3);
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
 * BOLT: Zero-alloc acceleration update.
 * Calculates accelerations directly into the buffer, avoiding redundant
 * mass multiplications/divisions and Vector3 object allocations.
 */
function updateAccelerations(accel: Float32Array): void {
    accel.fill(0);

    // 1. Central star gravity: a = -G * M_star / r^3 * r_vec
    const starAccelFactor = -G_mu * centralMass_solar;
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const pos = b.position_au;
        const rSq = pos.x * pos.x + pos.y * pos.y + pos.z * pos.z;
        const rInv3 = 1.0 / Math.pow(rSq + softeningSq, 1.5);
        const aMag = starAccelFactor * rInv3;
        
        accel[i * 3 + 0] = aMag * pos.x;
        accel[i * 3 + 1] = aMag * pos.y;
        accel[i * 3 + 2] = aMag * pos.z;
    }

    // 2. N-Body gravity interaction
    for (let i = 0; i < bodies.length; i++) {
        const bi = bodies[i];
        const pi = bi.position_au;

        for (let j = i + 1; j < bodies.length; j++) {
            const bj = bodies[j];
            const pj = bj.position_au;

            const dx = pj.x - pi.x;
            const dy = pj.y - pi.y;
            const dz = pj.z - pi.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            const rInv3 = 1.0 / Math.pow(distSq + softeningSq, 1.5);
            
            // a_i = (G * m_j / r^3) * r_vec
            // a_j = -(G * m_i / r^3) * r_vec
            const factor = G_mu * rInv3;
            const commonX = dx * factor;
            const commonY = dy * factor;
            const commonZ = dz * factor;

            accel[i * 3 + 0] += commonX * bj.mass_solar;
            accel[i * 3 + 1] += commonY * bj.mass_solar;
            accel[i * 3 + 2] += commonZ * bj.mass_solar;

            accel[j * 3 + 0] -= commonX * bi.mass_solar;
            accel[j * 3 + 1] -= commonY * bi.mass_solar;
            accel[j * 3 + 2] -= commonZ * bi.mass_solar;
        }
    }
}

function physicsTick() {
    if (!isRunning) {
        tickTimeout = null;
        return;
    }

    // Störmer-Verlet (Leapfrog) Integrator
    const halfDt = dt_yr * 0.5;
    
    // 1. Half-step velocities & Full-step positions
    updateAccelerations(accelBuffer);
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const vel = b.velocity_au_yr;
        const pos = b.position_au;

        vel.x += accelBuffer[i * 3 + 0] * halfDt;
        vel.y += accelBuffer[i * 3 + 1] * halfDt;
        vel.z += accelBuffer[i * 3 + 2] * halfDt;

        pos.x += vel.x * dt_yr;
        pos.y += vel.y * dt_yr;
        pos.z += vel.z * dt_yr;
    }

    // 2. Full-step velocities (re-calculating accelerations at new positions)
    updateAccelerations(accelBuffer);
    for (let i = 0; i < bodies.length; i++) {
        const vel = bodies[i].velocity_au_yr;
        vel.x += accelBuffer[i * 3 + 0] * halfDt;
        vel.y += accelBuffer[i * 3 + 1] * halfDt;
        vel.z += accelBuffer[i * 3 + 2] * halfDt;
    }

    // Pack state for rendering main thread
    // BOLT: We still allocate the output buffer as it's transferred to the main thread
    const buffer = new Float32Array(bodies.length * 7);
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const idx = i * 7;
        buffer[idx + 0] = b.position_au.x;
        buffer[idx + 1] = b.position_au.y;
        buffer[idx + 2] = b.position_au.z;
        buffer[idx + 3] = b.velocity_au_yr.x;
        buffer[idx + 4] = b.velocity_au_yr.y;
        buffer[idx + 5] = b.velocity_au_yr.z;
        buffer[idx + 6] = b.type === 'planet' ? 0 : 1;
    }

    // Pass buffer via transferable interface for zero-copy
    (self as any).postMessage({ type: 'UPDATE', buffer }, [buffer.buffer]);

    // Schedule next tick (60Hz targeting)
    tickTimeout = setTimeout(physicsTick, 16);
}
