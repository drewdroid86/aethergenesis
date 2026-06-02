import { OrbitalBody } from './OrbitalMechanics';

// Web worker state
let bodies: OrbitalBody[] = [];
let centralMass_solar: number = 1.0;
let isRunning = false;
let softeningSq = 0.0001; // small softening for N-body
let dt_yr = 1.0 / 365.25; // default 1 day step
let tickTimeout: any = null;

// BOLT: Persistent buffers for zero-allocation
let forceBuffer = new Float32Array(0);
let forcesValid = false;

const G_mu = 4.0 * Math.PI * Math.PI;

self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') {
        bodies = payload.bodies || [];
        centralMass_solar = payload.centralMass_solar || 1.0;
        dt_yr = payload.dt_yr || (1.0 / 365.25);
        forcesValid = false; // BOLT: Reset cache on re-init
        if (!isRunning) {
            isRunning = true;
            physicsTick();
        }
    } else if (type === 'ADD_BODY') {
        bodies.push(payload.body);
        forcesValid = false; // BOLT: Invalidate cache when body added
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
 * BOLT: Optimized zero-allocation force calculation
 * Writes directly into targetBuffer to avoid object creation.
 */
function calculateForces(targetBuffer: Float32Array): void {
    const n = bodies.length;
    targetBuffer.fill(0, 0, n * 3);

    // Central star gravity
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        const px = b.position_au.x;
        const py = b.position_au.y;
        const pz = b.position_au.z;

        const rSq = px * px + py * py + pz * pz;
        const r = Math.sqrt(rSq + softeningSq);
        
        // aMag = -G * M / r^3
        const aMag = -(G_mu * centralMass_solar) / (r * r * r);
        const mass = b.mass_solar;

        targetBuffer[i * 3 + 0] += aMag * px * mass;
        targetBuffer[i * 3 + 1] += aMag * py * mass;
        targetBuffer[i * 3 + 2] += aMag * pz * mass;
    }

    // N-Body gravity
    for (let i = 0; i < n; i++) {
        const bi = bodies[i];
        const pix = bi.position_au.x;
        const piy = bi.position_au.y;
        const piz = bi.position_au.z;
        const mi = bi.mass_solar;

        for (let j = i + 1; j < n; j++) {
            const bj = bodies[j];
            const dx = bj.position_au.x - pix;
            const dy = bj.position_au.y - piy;
            const dz = bj.position_au.z - piz;
            const distSq = dx*dx + dy*dy + dz*dz;
            const dist = Math.sqrt(distSq + softeningSq);
            
            const fMag = (G_mu * mi * bj.mass_solar) / (dist * dist * dist);
            const fx = fMag * dx;
            const fy = fMag * dy;
            const fz = fMag * dz;

            targetBuffer[i * 3 + 0] += fx;
            targetBuffer[i * 3 + 1] += fy;
            targetBuffer[i * 3 + 2] += fz;

            targetBuffer[j * 3 + 0] -= fx;
            targetBuffer[j * 3 + 1] -= fy;
            targetBuffer[j * 3 + 2] -= fz;
        }
    }
}

function physicsTick() {
    if (!isRunning) {
        tickTimeout = null;
        return;
    }

    const n = bodies.length;
    if (forceBuffer.length !== n * 3) {
        forceBuffer = new Float32Array(n * 3);
        forcesValid = false;
    }

    // Velocity Verlet Integrator (optimized to 1 force calc per tick)
    
    // 1. If we don't have valid forces from last tick, calculate them now
    if (!forcesValid) {
        calculateForces(forceBuffer);
        forcesValid = true;
    }

    const dt_half = dt_yr * 0.5;

    // 2. First half-step: v(t + dt/2) = v(t) + a(t) * dt/2
    //    And full-step position: r(t + dt) = r(t) + v(t + dt/2) * dt
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        const invMass = 1.0 / b.mass_solar;

        const ax = forceBuffer[i * 3 + 0] * invMass;
        const ay = forceBuffer[i * 3 + 1] * invMass;
        const az = forceBuffer[i * 3 + 2] * invMass;

        b.velocity_au_yr.x += ax * dt_half;
        b.velocity_au_yr.y += ay * dt_half;
        b.velocity_au_yr.z += az * dt_half;

        b.position_au.x += b.velocity_au_yr.x * dt_yr;
        b.position_au.y += b.velocity_au_yr.y * dt_yr;
        b.position_au.z += b.velocity_au_yr.z * dt_yr;
    }

    // 3. Recalculate forces at new positions: a(t + dt)
    calculateForces(forceBuffer);

    // 4. Second half-step: v(t + dt) = v(t + dt/2) + a(t + dt) * dt/2
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        const invMass = 1.0 / b.mass_solar;

        const ax = forceBuffer[i * 3 + 0] * invMass;
        const ay = forceBuffer[i * 3 + 1] * invMass;
        const az = forceBuffer[i * 3 + 2] * invMass;

        b.velocity_au_yr.x += ax * dt_half;
        b.velocity_au_yr.y += ay * dt_half;
        b.velocity_au_yr.z += az * dt_half;
    }

    // Pack state for rendering main thread
    const buffer = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        const offset = i * 7;
        buffer[offset + 0] = b.position_au.x;
        buffer[offset + 1] = b.position_au.y;
        buffer[offset + 2] = b.position_au.z;
        buffer[offset + 3] = b.velocity_au_yr.x;
        buffer[offset + 4] = b.velocity_au_yr.y;
        buffer[offset + 5] = b.velocity_au_yr.z;
        buffer[offset + 6] = b.type === 'planet' ? 0 : 1;
    }

    // Pass buffer via transferable interface for zero-alloc
    (self as any).postMessage({ type: 'UPDATE', buffer }, [buffer.buffer]);

    // Schedule next tick (60Hz targeting)
    tickTimeout = setTimeout(physicsTick, 16);
}
