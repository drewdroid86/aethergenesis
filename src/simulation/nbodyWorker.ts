import { OrbitalBody } from './OrbitalMechanics';

// Web worker state
let bodies: OrbitalBody[] = [];
let centralMass_solar: number = 1.0;
let isRunning = false;
const softeningSq = 0.0001; // small softening for N-body
let dt_yr = 1.0 / 365.25; // default 1 day step
let tickTimeout: any = null;
let dtAccumulator = 0;

// BOLT: Persistent buffers for zero-allocation
let accelBuffer = new Float32Array(0);
let accelsValid = false;

// BOLT: Double buffering for zero-allocation thread transfers
let bufferA = new Float32Array(0);
let bufferB = new Float32Array(0);
let useA = true;

const G_mu = 4.0 * Math.PI * Math.PI;

self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') {
        bodies = payload.bodies || [];
        centralMass_solar = payload.centralMass_solar || 1.0;
        dt_yr = payload.dt_yr || (1.0 / 365.25);
        accelsValid = false; // BOLT: Reset cache on re-init
        dtAccumulator = 0;
        const shouldRun = payload.isRunning !== undefined ? payload.isRunning : true;
        isRunning = shouldRun;
        if (isRunning && !tickTimeout) {
            physicsTick();
        } else if (!isRunning && tickTimeout) {
            clearTimeout(tickTimeout);
            tickTimeout = null;
        }
    } else if (type === 'ADD_BODY') {
        bodies.push(payload.body);
        accelsValid = false; // BOLT: Invalidate cache when body added
    } else if (type === 'SET_RUNNING') {
        const nextRunning = payload.isRunning !== undefined ? payload.isRunning : payload.running;
        isRunning = Boolean(nextRunning);
        if (!isRunning && tickTimeout) {
            clearTimeout(tickTimeout);
            tickTimeout = null;
            dtAccumulator = 0;
        } else if (isRunning && !tickTimeout) {
            physicsTick();
        }
    } else if (type === 'UPDATE_TIMESTEP') {
        dt_yr = payload.dt_yr;
    } else if (type === 'UPDATE_CENTRAL_MASS') {
        if (payload && typeof payload.centralMass_solar === 'number' && payload.centralMass_solar > 0) {
            centralMass_solar = payload.centralMass_solar;
            accelsValid = false;
        }
    } else if (type === 'RESET_BODIES') {
        bodies = payload.bodies || [];
        if (payload.centralMass_solar && payload.centralMass_solar > 0) {
            centralMass_solar = payload.centralMass_solar;
        }
        accelsValid = false;
        dtAccumulator = 0;
    }
};

/**
 * BOLT: Optimized zero-allocation acceleration calculation
 * Writes directly into targetBuffer to avoid object creation.
 */
function calculateAccelerations(targetBuffer: Float32Array): void {
    const n = bodies.length;
    targetBuffer.fill(0, 0, n * 3);

    // Central star gravity
    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        const px = b.position_au.x;
        const py = b.position_au.y;
        const pz = b.position_au.z;

        const rSoftSq = px * px + py * py + pz * pz + softeningSq;
        const r = Math.sqrt(rSoftSq);
        
        // aMag = -G * M / r^3. Use r * rSoftSq to save one multiplication.
        const aMag = -(G_mu * centralMass_solar) / (r * rSoftSq);

        targetBuffer[i * 3 + 0] += aMag * px;
        targetBuffer[i * 3 + 1] += aMag * py;
        targetBuffer[i * 3 + 2] += aMag * pz;
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
            
            const distSoftSq = dx*dx + dy*dy + dz*dz + softeningSq;
            const dist = Math.sqrt(distSoftSq);
            const dist3 = dist * distSoftSq;

            if (dist3 < 1e-6) continue;

            // Acceleration on i due to j: a_i = G * m_j * dir / dist^3
            const aMag_i = (G_mu * bj.mass_solar) / dist3;
            // Acceleration on j due to i: a_j = -G * m_i * dir / dist^3
            const aMag_j = (G_mu * mi) / dist3;

            targetBuffer[i * 3 + 0] += aMag_i * dx;
            targetBuffer[i * 3 + 1] += aMag_i * dy;
            targetBuffer[i * 3 + 2] += aMag_i * dz;

            targetBuffer[j * 3 + 0] -= aMag_j * dx;
            targetBuffer[j * 3 + 1] -= aMag_j * dy;
            targetBuffer[j * 3 + 2] -= aMag_j * dz;
        }
    }
}

const MAX_PHYSICS_DT = 0.002; // Max physics timestep in years (~17.5 hrs) to maintain Verlet stability
const MAX_SUBSTEPS = 64;      // Cap steps to prevent freeze on tab-switch stall

/**
 * Perform a single Velocity-Verlet integration step of size subDt
 */
function integrate(subDt: number): void {
    const n = bodies.length;
    const dt_half = subDt * 0.5;

    // 1. If we don't have valid accelerations from last step/tick, calculate them now
    if (!accelsValid) {
        calculateAccelerations(accelBuffer);
        accelsValid = true;
    }

    // 2. First half-step: v(t + dt/2) = v(t) + a(t) * dt/2
    //    And full-step position: r(t + dt) = r(t) + v(t + dt/2) * dt
    for (let i = 0; i < n; i++) {
        const b = bodies[i];

        // NaN guard: reset if calculation exploded
        if (isNaN(b.position_au.x) || isNaN(b.velocity_au_yr.x)) {
            b.position_au.x = (i + 1) * 2.0;
            b.position_au.y = 0.0;
            b.position_au.z = 0.0;
            b.velocity_au_yr.x = 0.0;
            b.velocity_au_yr.y = (2.0 * Math.PI) / Math.sqrt((i + 1) * 2.0);
            b.velocity_au_yr.z = 0.0;
            accelsValid = false;
        }

        const ax = accelBuffer[i * 3 + 0];
        const ay = accelBuffer[i * 3 + 1];
        const az = accelBuffer[i * 3 + 2];

        b.velocity_au_yr.x += ax * dt_half;
        b.velocity_au_yr.y += ay * dt_half;
        b.velocity_au_yr.z += az * dt_half;

        b.position_au.x += b.velocity_au_yr.x * subDt;
        b.position_au.y += b.velocity_au_yr.y * subDt;
        b.position_au.z += b.velocity_au_yr.z * subDt;

        // Clamp maximum distance to 1000 AU to prevent infinity propagation
        const distSq = b.position_au.x * b.position_au.x + b.position_au.y * b.position_au.y + b.position_au.z * b.position_au.z;
        if (distSq > 1000000.0) { // 1000 AU squared
            const dist = Math.sqrt(distSq);
            console.warn(`[nbody] Position clamp triggered: body index ${i} at ${dist.toFixed(1)} AU, clamped to 1000 AU`);
            const scale = Math.sqrt(1000000.0 / distSq);
            b.position_au.x *= scale;
            b.position_au.y *= scale;
            b.position_au.z *= scale;
            b.velocity_au_yr.x *= 0.1;
            b.velocity_au_yr.y *= 0.1;
            b.velocity_au_yr.z *= 0.1;
            accelsValid = false;
        }
    }

    // 3. Recalculate accelerations at new positions: a(t + dt)
    calculateAccelerations(accelBuffer);

    // 4. Second half-step: v(t + dt) = v(t + dt/2) + a(t + dt) * dt/2
    for (let i = 0; i < n; i++) {
        const b = bodies[i];

        const ax = accelBuffer[i * 3 + 0];
        const ay = accelBuffer[i * 3 + 1];
        const az = accelBuffer[i * 3 + 2];

        b.velocity_au_yr.x += ax * dt_half;
        b.velocity_au_yr.y += ay * dt_half;
        b.velocity_au_yr.z += az * dt_half;
    }
}

function physicsTick() {
    if (!isRunning) {
        tickTimeout = null;
        return;
    }

    const n = bodies.length;
    if (accelBuffer.length !== n * 3) {
        accelBuffer = new Float32Array(n * 3);
        accelsValid = false;
    }

    // Accumulate requested timestep and consume in fixed MAX_PHYSICS_DT chunks.
    // Cap accumulator at 5x max batch size (0.64 yr) to prevent unbounded accumulation on long tab stalls.
    dtAccumulator += dt_yr;
    dtAccumulator = Math.min(dtAccumulator, MAX_PHYSICS_DT * MAX_SUBSTEPS * 5);

    let steps = 0;
    while (dtAccumulator >= MAX_PHYSICS_DT && steps < MAX_SUBSTEPS) {
        integrate(MAX_PHYSICS_DT);
        dtAccumulator -= MAX_PHYSICS_DT;
        steps++;
    }

    // If accumulator has a non-zero residual smaller than MAX_PHYSICS_DT and no full step ran,
    // execute a single micro-step for low-framerate responsiveness when dt_yr < MAX_PHYSICS_DT
    if (steps === 0 && dtAccumulator > 0) {
        integrate(dtAccumulator);
        dtAccumulator = 0;
    }

    // Pack state for rendering main thread
    const size = n * 7;
    if (bufferA.length !== size) {
        bufferA = new Float32Array(size);
        bufferB = new Float32Array(size);
    }
    const buffer = useA ? bufferA : bufferB;
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

    // Reallocate the transferred buffer since it was detached/neutered
    if (useA) {
        bufferA = new Float32Array(size);
    } else {
        bufferB = new Float32Array(size);
    }
    useA = !useA;

    // Schedule next tick (60Hz targeting)
    tickTimeout = setTimeout(physicsTick, 16);
}
