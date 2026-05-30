import { OrbitalBody, Vector3 } from './OrbitalMechanics';

// Web worker state
let bodies: OrbitalBody[] = [];
let centralMass_solar: number = 1.0;
let isRunning = false;
let softeningSq = 0.0001; // small softening for N-body
let dt_yr = 1.0 / 365.25; // default 1 day step
let tickTimeout: any = null;
let accelBuffer = new Float32Array(0);

const G_mu = 4.0 * Math.PI * Math.PI;

function ensureAccelBuffer(numBodies: number) {
    if (accelBuffer.length !== numBodies * 3) {
        accelBuffer = new Float32Array(numBodies * 3);
    }
}

self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') {
        bodies = payload.bodies || [];
        ensureAccelBuffer(bodies.length);
        centralMass_solar = payload.centralMass_solar || 1.0;
        dt_yr = payload.dt_yr || (1.0 / 365.25);
        if (!isRunning) {
            isRunning = true;
            physicsTick();
        }
    } else if (type === 'ADD_BODY') {
        bodies.push(payload.body);
        ensureAccelBuffer(bodies.length);
    } else if (type === 'SET_RUNNING') {
        isRunning = payload.isRunning;
        if (isRunning && !tickTimeout) {
            physicsTick();
        }
    } else if (type === 'UPDATE_TIMESTEP') {
        dt_yr = payload.dt_yr;
    }
};

function updateAccelerations(): void {
    accelBuffer.fill(0);

    // Central star gravity
    const mu = G_mu * centralMass_solar;
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const pos = b.position_au;
        const rSq = pos.x * pos.x + pos.y * pos.y + pos.z * pos.z;
        const rInv3 = 1.0 / Math.pow(rSq + softeningSq, 1.5);
        
        const aMag = -mu * rInv3;
        accelBuffer[i * 3 + 0] = aMag * pos.x;
        accelBuffer[i * 3 + 1] = aMag * pos.y;
        accelBuffer[i * 3 + 2] = aMag * pos.z;
    }

    // N-Body gravity
    for (let i = 0; i < bodies.length; i++) {
        const bi = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
            const bj = bodies[j];
            const dx = bj.position_au.x - bi.position_au.x;
            const dy = bj.position_au.y - bi.position_au.y;
            const dz = bj.position_au.z - bi.position_au.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            const rInv3 = 1.0 / Math.pow(distSq + softeningSq, 1.5);
            
            const common = G_mu * rInv3;
            const ax = common * bj.mass_solar * dx;
            const ay = common * bj.mass_solar * dy;
            const az = common * bj.mass_solar * dz;

            accelBuffer[i * 3 + 0] += ax;
            accelBuffer[i * 3 + 1] += ay;
            accelBuffer[i * 3 + 2] += az;

            accelBuffer[j * 3 + 0] -= common * bi.mass_solar * dx;
            accelBuffer[j * 3 + 1] -= common * bi.mass_solar * dy;
            accelBuffer[j * 3 + 2] -= common * bi.mass_solar * dz;
        }
    }
}

function physicsTick() {
    if (!isRunning) {
        tickTimeout = null;
        return;
    }

    // Störmer-Verlet (Leapfrog) Integrator
    
    // 1. Calculate half-step velocities
    updateAccelerations();
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const idx = i * 3;

        b.velocity_au_yr.x += accelBuffer[idx + 0] * (dt_yr / 2.0);
        b.velocity_au_yr.y += accelBuffer[idx + 1] * (dt_yr / 2.0);
        b.velocity_au_yr.z += accelBuffer[idx + 2] * (dt_yr / 2.0);

        // 2. Full-step positions
        b.position_au.x += b.velocity_au_yr.x * dt_yr;
        b.position_au.y += b.velocity_au_yr.y * dt_yr;
        b.position_au.z += b.velocity_au_yr.z * dt_yr;
    }

    // 3. Recalculate accelerations at new positions
    updateAccelerations();

    // 4. Calculate full-step velocities
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const idx = i * 3;

        b.velocity_au_yr.x += accelBuffer[idx + 0] * (dt_yr / 2.0);
        b.velocity_au_yr.y += accelBuffer[idx + 1] * (dt_yr / 2.0);
        b.velocity_au_yr.z += accelBuffer[idx + 2] * (dt_yr / 2.0);
    }

    // Pack state for rendering main thread
    const buffer = new Float32Array(bodies.length * 7);
    for (let i = 0; i < bodies.length; i++) {
        buffer[i * 7 + 0] = bodies[i].position_au.x;
        buffer[i * 7 + 1] = bodies[i].position_au.y;
        buffer[i * 7 + 2] = bodies[i].position_au.z;
        buffer[i * 7 + 3] = bodies[i].velocity_au_yr.x;
        buffer[i * 7 + 4] = bodies[i].velocity_au_yr.y;
        buffer[i * 7 + 5] = bodies[i].velocity_au_yr.z;
        buffer[i * 7 + 6] = bodies[i].type === 'planet' ? 0 : 1; 
    }

    // Pass buffer via transferable interface for zero-alloc
    (self as any).postMessage({ type: 'UPDATE', buffer }, [buffer.buffer]);

    // Schedule next tick (60Hz targeting)
    tickTimeout = setTimeout(physicsTick, 16);
}
