import { OrbitalBody, Vector3 } from './OrbitalMechanics';

// Web worker state
let bodies: OrbitalBody[] = [];
let centralMass_solar: number = 1.0;
let isRunning = false;
let softeningSq = 0.0001; // small softening for N-body
let dt_yr = 1.0 / 365.25; // default 1 day step
let tickTimeout: any = null;

const G_mu = 4.0 * Math.PI * Math.PI;

self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') {
        bodies = payload.bodies || [];
        centralMass_solar = payload.centralMass_solar || 1.0;
        dt_yr = payload.dt_yr || (1.0 / 365.25);
        if (!isRunning) {
            isRunning = true;
            physicsTick();
        }
    } else if (type === 'ADD_BODY') {
        bodies.push(payload.body);
    } else if (type === 'SET_RUNNING') {
        isRunning = payload.isRunning;
        if (isRunning && !tickTimeout) {
            physicsTick();
        }
    } else if (type === 'UPDATE_TIMESTEP') {
        dt_yr = payload.dt_yr;
    }
};

function calculateForces(): Vector3[] {
    const forces: Vector3[] = new Array(bodies.length).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

    // Central star gravity
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const rSq = b.position_au.x * b.position_au.x + b.position_au.y * b.position_au.y + b.position_au.z * b.position_au.z;
        const r = Math.sqrt(rSq + softeningSq);
        
        // F = -G * M * m / r^2
        // Force vector = F * (r_vec / r) = -G * M * m / r^3 * r_vec
        const aMag = -(G_mu * centralMass_solar) / (r * r * r);
        forces[i].x += aMag * b.position_au.x * b.mass_solar;
        forces[i].y += aMag * b.position_au.y * b.mass_solar;
        forces[i].z += aMag * b.position_au.z * b.mass_solar;
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
            const dist = Math.sqrt(distSq + softeningSq);
            
            const fMag = (G_mu * bi.mass_solar * bj.mass_solar) / (dist * dist * dist);
            const fx = fMag * dx;
            const fy = fMag * dy;
            const fz = fMag * dz;

            forces[i].x += fx;
            forces[i].y += fy;
            forces[i].z += fz;
            forces[j].x -= fx;
            forces[j].y -= fy;
            forces[j].z -= fz;
        }
    }
    return forces;
}

function physicsTick() {
    if (!isRunning) {
        tickTimeout = null;
        return;
    }

    // Störmer-Verlet (Leapfrog) Integrator
    
    // 1. Calculate half-step velocities
    const forces = calculateForces();
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const ax = forces[i].x / b.mass_solar;
        const ay = forces[i].y / b.mass_solar;
        const az = forces[i].z / b.mass_solar;

        b.velocity_au_yr.x += ax * (dt_yr / 2.0);
        b.velocity_au_yr.y += ay * (dt_yr / 2.0);
        b.velocity_au_yr.z += az * (dt_yr / 2.0);

        // 2. Full-step positions
        b.position_au.x += b.velocity_au_yr.x * dt_yr;
        b.position_au.y += b.velocity_au_yr.y * dt_yr;
        b.position_au.z += b.velocity_au_yr.z * dt_yr;
    }

    // 3. Recalculate forces at new positions
    const newForces = calculateForces();

    // 4. Calculate full-step velocities
    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const ax = newForces[i].x / b.mass_solar;
        const ay = newForces[i].y / b.mass_solar;
        const az = newForces[i].z / b.mass_solar;

        b.velocity_au_yr.x += ax * (dt_yr / 2.0);
        b.velocity_au_yr.y += ay * (dt_yr / 2.0);
        b.velocity_au_yr.z += az * (dt_yr / 2.0);
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
