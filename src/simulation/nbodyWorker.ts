import { OrbitalBody } from './OrbitalMechanics';
import type { SimulationEventType } from './ActionLog';

// Web worker state
let bodies: OrbitalBody[] = [];
let centralMass_solar: number = 1.0;
let isRunning = false;
const softeningSq = 0.0001; // small softening for N-body
let dt_yr = 1.0 / 365.25; // default 1 day step
let tickTimeout: any = null;
let dtAccumulator = 0;

// ─── Stable-id roster (Phase B) ─────────────────────────────────────────────
// Every body carries a stable string id from creation. Bodies that arrive
// without one (legacy callers) get a worker-side monotonic `spawned_N` id —
// deterministic: the counter resets on INIT/RESET_BODIES, so replaying the
// same message sequence yields the same ids. No Math.random (determinism pass).
let nextWorkerId = 1;
const knownIds = new Set<string>();

function claimId(id: string): void {
    knownIds.add(id);
}

function ensureStableIds(list: OrbitalBody[]): void {
    knownIds.clear();
    nextWorkerId = 1;
    for (const b of list) {
        if (typeof b.id === 'string' && b.id.length > 0) {
            claimId(b.id);
            continue;
        }
        let candidate: string;
        do {
            candidate = `spawned_${nextWorkerId++}`;
        } while (knownIds.has(candidate));
        b.id = candidate;
        claimId(candidate);
    }
}

function assignStableId(body: OrbitalBody): void {
    if (typeof body.id === 'string' && body.id.length > 0) {
        claimId(body.id);
        return;
    }
    let candidate: string;
    do {
        candidate = `spawned_${nextWorkerId++}`;
    } while (knownIds.has(candidate));
    body.id = candidate;
    claimId(candidate);
}

export interface RosterEntry {
    id: string;
    type: string;
}

/**
 * Announce the stable roster (id + type per body, worker order) to the main
 * thread. Emitted on every roster change (INIT / ADD_BODY / RESET_BODIES) and
 * on any future remove/merge — the renderer resolves UPDATE buffer rows
 * through this, never by bare array index. Designed for retire+introduce:
 * a future MERGE retires ids here and introduces the merged body's id.
 */
function emitRoster(): void {
    const roster: RosterEntry[] = bodies.map((b) => ({ id: b.id, type: b.type }));
    (self as any).postMessage({ type: 'ROSTER', bodies: roster });
}

// ─── Worker→main physics events (Phase A) ───────────────────────────────────
// SIM_EVENT is a dedicated postMessage channel OUTSIDE the per-frame UPDATE
// stream, so physics events are never dropped or reordered relative to each
// other (postMessage preserves FIFO order per sender). The main-thread hook
// feeds them into the action log.
let workerEventSeq = 1;
let tickCounter = 0;
const collisionCooldown = new Map<string, number>(); // pairKey -> tick of last report
const COLLISION_COOLDOWN_TICKS = 600; // ~10 s of ticks: bounds event rate without dropping first contact
const AU_KM = 1.495978707e8;

function emitSimEvent(
    type: SimulationEventType,
    fields: {
        actorId?: string;
        targetIds?: string[];
        masses?: number[];
        positions?: { x: number; y: number; z: number }[];
        note?: string;
    }
): void {
    (self as any).postMessage({
        type: 'SIM_EVENT',
        event: { type, seq: workerEventSeq++, wallTimestamp: Date.now(), cosmicAge: 0, ...fields },
    });
}

function resetEventState(): void {
    workerEventSeq = 1;
    tickCounter = 0;
    collisionCooldown.clear();
}

/**
 * Close-approach detector. Emits COLLISION (event only — no merge physics,
 * which is a later build) when two bodies come within the sum of their
 * physical radii. Per-pair cooldown keeps a resting contact from spamming;
 * first contact is always reported. Reads positions only — the NaN guards
 * below are untouched.
 */
function detectCollisions(): void {
    tickCounter++;
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
        const a = bodies[i];
        if (!isFiniteVec3(a.position_au)) continue;
        for (let j = i + 1; j < n; j++) {
            const b = bodies[j];
            if (!isFiniteVec3(b.position_au)) continue;
            const dx = b.position_au.x - a.position_au.x;
            const dy = b.position_au.y - a.position_au.y;
            const dz = b.position_au.z - a.position_au.z;
            if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) continue;
            const ra_km = Number.isFinite(a.radius_km) && (a.radius_km as number) > 0
                ? (a.radius_km as number) : 6371;
            const rb_km = Number.isFinite(b.radius_km) && (b.radius_km as number) > 0
                ? (b.radius_km as number) : 6371;
            const thresh_au = Math.max((ra_km + rb_km) / AU_KM, 1e-4);
            const distSq = dx * dx + dy * dy + dz * dz;
            if (!(distSq <= thresh_au * thresh_au)) continue;
            const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
            const last = collisionCooldown.get(key);
            if (last !== undefined && tickCounter - last < COLLISION_COOLDOWN_TICKS) continue;
            collisionCooldown.set(key, tickCounter);
            // Bound the map: prune cooled-down pairs once it grows large.
            if (collisionCooldown.size > 4096) {
                for (const [k, t] of collisionCooldown) {
                    if (tickCounter - t >= COLLISION_COOLDOWN_TICKS) collisionCooldown.delete(k);
                }
            }
            emitSimEvent('COLLISION', {
                actorId: a.id,
                targetIds: [a.id, b.id],
                masses: [a.mass_solar, b.mass_solar],
                positions: [
                    { x: a.position_au.x, y: a.position_au.y, z: a.position_au.z },
                    { x: b.position_au.x, y: b.position_au.y, z: b.position_au.z },
                ],
                note: `close approach ${Math.sqrt(distSq).toExponential(2)} AU`,
            });
        }
    }
}

// BOLT: Persistent buffers for zero-allocation
let accelBuffer = new Float32Array(0);
let accelsValid = false;

// Double buffering with per-tick reallocation for thread transfers (one-way
// transfer detaches the buffer; true zero-alloc would require SharedArrayBuffer or return-transfer)
let bufferA = new Float32Array(0);
let bufferB = new Float32Array(0);
let useA = true;

const G_mu = 4.0 * Math.PI * Math.PI;

// PH2 fix: validate inbound bodies — a malformed payload (NaN/Infinity fields)
// would poison the integration and freeze the worker's tick loop.
function isFiniteVec3(v: any): boolean {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isValidBody(body: any): body is OrbitalBody {
    // Only physics-relevant fields are required: mass, position, velocity.
    // id / radius_km are render metadata unused by the integrator, so a body
    // missing them is still integrable and must not be rejected.
    return !!body
        && (body.id === undefined || typeof body.id === 'string')
        && Number.isFinite(body.mass_solar) && body.mass_solar >= 0
        && (body.radius_km === undefined || Number.isFinite(body.radius_km))
        && isFiniteVec3(body.position_au)
        && isFiniteVec3(body.velocity_au_yr);
}

self.onmessage = (e) => {
    const { type, payload } = e.data;
    if (type === 'INIT') {
        // Validate inbound bodies — same poison guard as ADD_BODY (a single
        // NaN field used to freeze the integration loop forever).
        const inbound = Array.isArray(payload.bodies) ? payload.bodies : [];
        const rejectedInit = inbound.filter((b: any) => !isValidBody(b)).length;
        if (rejectedInit > 0) {
            console.warn(`[nbody] INIT rejected ${rejectedInit} malformed bodie(s)`);
        }
        bodies = inbound.filter(isValidBody);
        ensureStableIds(bodies);
        if (Number.isFinite(payload.centralMass_solar) && payload.centralMass_solar > 0) {
            centralMass_solar = payload.centralMass_solar;
        } else {
            centralMass_solar = 1.0;
        }
        if (Number.isFinite(payload.dt_yr) && payload.dt_yr > 0) {
            dt_yr = payload.dt_yr;
        } else {
            dt_yr = 1.0 / 365.25;
        }
        recomputeTMin();
        resetEventState();
        emitRoster();
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
        // PH2 fix: reject malformed bodies instead of letting them poison the
        // integration (a single NaN field used to freeze the loop forever).
        if (isValidBody(payload.body)) {
            assignStableId(payload.body);
            bodies.push(payload.body);
            recomputeTMin();
            emitRoster();
            accelsValid = false; // BOLT: Invalidate cache when body added
        } else {
            console.warn('[nbody] ADD_BODY rejected: malformed body payload', payload.body);
        }
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
        // Reject non-finite / non-positive timesteps — they would silently
        // freeze or corrupt the integration (accumulator has no lower clamp).
        if (Number.isFinite(payload.dt_yr) && payload.dt_yr > 0) {
            dt_yr = payload.dt_yr;
        } else {
            console.warn('[nbody] UPDATE_TIMESTEP rejected: invalid dt_yr', payload.dt_yr);
        }
    } else if (type === 'UPDATE_CENTRAL_MASS') {
        const nextMass = payload?.centralMass_solar ?? e.data?.centralMass_solar;
        if (typeof nextMass === 'number' && Number.isFinite(nextMass) && nextMass > 0) {
            if (centralMass_solar > 0 && Number.isFinite(centralMass_solar)) {
                const vScale = Math.sqrt(nextMass / centralMass_solar);
                for (let i = 0; i < bodies.length; i++) {
                    const b = bodies[i];
                    b.velocity_au_yr.x *= vScale;
                    b.velocity_au_yr.y *= vScale;
                    b.velocity_au_yr.z *= vScale;
                }
            }
            centralMass_solar = nextMass;
            recomputeTMin();
            accelsValid = false;
            emitBuffer();
        }
    } else if (type === 'RESET_BODIES') {
        const inboundReset = Array.isArray(payload.bodies) ? payload.bodies : [];
        const rejectedReset = inboundReset.filter((b: any) => !isValidBody(b)).length;
        if (rejectedReset > 0) {
            console.warn(`[nbody] RESET_BODIES rejected ${rejectedReset} malformed bodie(s)`);
        }
        bodies = inboundReset.filter(isValidBody);
        ensureStableIds(bodies);
        if (payload.centralMass_solar && payload.centralMass_solar > 0) {
            centralMass_solar = payload.centralMass_solar;
        }
        recomputeTMin();
        resetEventState();
        emitRoster();
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

        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;

        const rSoftSq = px * px + py * py + pz * pz + softeningSq;
        const r = Math.sqrt(rSoftSq);
        
        // aMag = -G * M / r^3. Use r * rSoftSq to save one multiplication.
        const aMag = -(G_mu * centralMass_solar) / (r * rSoftSq);
        if (!Number.isFinite(aMag)) continue;

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

            if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) continue;
            
            const distSoftSq = dx*dx + dy*dy + dz*dz + softeningSq;
            const dist = Math.sqrt(distSoftSq);
            const dist3 = dist * distSoftSq;

            if (dist3 < 1e-6 || !Number.isFinite(dist3)) continue;

            // Acceleration on i due to j: a_i = G * m_j * dir / dist^3
            const aMag_i = (G_mu * bj.mass_solar) / dist3;
            // Acceleration on j due to i: a_j = -G * m_i * dir / dist^3
            const aMag_j = (G_mu * mi) / dist3;

            if (!Number.isFinite(aMag_i) || !Number.isFinite(aMag_j)) continue;

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
// FIX-06: the substep budget must also resolve the innermost orbit (see
// tMin_yr): a close-in planet (e.g. 0.05 AU, T ~ 0.011 yr) advances ~T/5.6 per
// fixed 0.002-yr step and goes unstable — strobing/teleporting. 2000 steps ×
// O(n²) over a handful of bodies is still far below the 16 ms tick budget,
// and the hard cap below keeps a pathological system from freezing the loop.
const MAX_SUBSTEPS = 2000;      // Hard cap on substeps per tick (freeze protection)
// PH1: diagnostic for time dropped by the accumulator cap (stall protection).
// Steady-state drops should now be zero; any drop is logged, not silent.
let discardedTime_yr = 0;
let lastDiscardWarn_yr = 0;

// FIX-06: smallest orbital period (yr) among the worker's planets, derived
// from the bodies already in the INIT/RESET payloads (vis-viva osculating
// semi-major axis + Kepler's third law, T = 2π√(a³/GM)). Infinity when
// unknown (no planets) → substep falls back to MAX_PHYSICS_DT as before.
let tMin_yr = Number.POSITIVE_INFINITY;
let lastSubstepCapWarn_ms = 0;

function recomputeTMin(): void {
    const mu = G_mu * centralMass_solar;
    if (!(mu > 0)) {
        tMin_yr = Number.POSITIVE_INFINITY;
        return;
    }
    let tMin = Number.POSITIVE_INFINITY;
    for (const b of bodies) {
        if (b.type !== 'planet') continue;
        const px = b.position_au.x;
        const py = b.position_au.y;
        const pz = b.position_au.z;
        const rSq = px * px + py * py + pz * pz;
        if (!(rSq > 0)) continue;
        const r = Math.sqrt(rSq);
        const vx = b.velocity_au_yr.x;
        const vy = b.velocity_au_yr.y;
        const vz = b.velocity_au_yr.z;
        const vSq = vx * vx + vy * vy + vz * vz;
        const invA = 2.0 / r - vSq / mu; // vis-viva: 1/a
        if (!(invA > 0)) continue; // unbound/parabolic: no period to resolve
        const a = 1.0 / invA;
        const T = 2.0 * Math.PI * Math.sqrt(a * a * a / mu);
        if (T < tMin) tMin = T;
    }
    tMin_yr = tMin;
}

/**
 * Perform a single Velocity-Verlet integration step of size subDt
 */
function integrate(subDt: number): void {
    const n = bodies.length;
    if (accelBuffer.length !== n * 3) {
        accelBuffer = new Float32Array(n * 3);
        accelsValid = false;
    }
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

        // NaN guard: reset if calculation exploded (all components —
        // a poisoned y/z used to slip through the x-only check and re-poison
        // the accelerations on the next substep).
        if (!isFiniteVec3(b.position_au) || !isFiniteVec3(b.velocity_au_yr)) {
            b.position_au.x = (i + 1) * 2.0;
            b.position_au.y = 0.0;
            b.position_au.z = 0.0;
            b.velocity_au_yr.x = 0.0;
            b.velocity_au_yr.y = (2.0 * Math.PI) / Math.sqrt((i + 1) * 2.0);
            b.velocity_au_yr.z = 0.0;
            accelsValid = false;
            continue;
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

        if (Number.isFinite(ax)) b.velocity_au_yr.x += ax * dt_half;
        if (Number.isFinite(ay)) b.velocity_au_yr.y += ay * dt_half;
        if (Number.isFinite(az)) b.velocity_au_yr.z += az * dt_half;
    }
}

export function physicsTick() {
    if (!isRunning) {
        tickTimeout = null;
        return;
    }

    // PH2 fix: an uncaught exception here used to abort the setTimeout chain
    // forever, silently freezing every planet with no user-visible error.
    // Log it and always reschedule.
    try {
        physicsTickInner();
    } catch (err) {
        console.error('[nbody] physicsTick failed; rescheduling tick loop:', err);
    }

    // Schedule next tick (60Hz targeting)
    tickTimeout = setTimeout(physicsTick, 16);
}

export function physicsTickInner() {
    const n = bodies.length;
    if (accelBuffer.length !== n * 3) {
        accelBuffer = new Float32Array(n * 3);
        accelsValid = false;
    }

    // Accumulate requested timestep and consume in fixed MAX_PHYSICS_DT chunks.
    // Cap accumulator at 5x max batch size to prevent unbounded accumulation on
    // long tab stalls. PH1: drops are now logged instead of silent.
    dtAccumulator += dt_yr;
    const accumulatorCap = MAX_PHYSICS_DT * MAX_SUBSTEPS * 5;
    if (dtAccumulator > accumulatorCap) {
        discardedTime_yr += dtAccumulator - accumulatorCap;
        // Throttle the warning: at most one per simulated year of dropped time.
        if (discardedTime_yr - lastDiscardWarn_yr >= 1.0) {
            console.warn(`[nbody] accumulator cap discarded ${(dtAccumulator - accumulatorCap).toFixed(3)} yr ` +
                `(total ${discardedTime_yr.toFixed(2)} yr) — tab stall or dt_yr exceeds the substep budget`);
            lastDiscardWarn_yr = discardedTime_yr;
        }
        dtAccumulator = accumulatorCap;
    }

    // FIX-06: adaptive substep — at most 1/20th of the innermost planet period
    // (substep count = ceil(dt_yr / (T_min/20))), never above the Verlet
    // stability cap. The total simulated time per tick is unchanged: the
    // accumulator still consumes the full dt_yr, only the resolution changes.
    let subDt = MAX_PHYSICS_DT;
    if (Number.isFinite(tMin_yr) && tMin_yr > 0) {
        subDt = Math.min(MAX_PHYSICS_DT, tMin_yr / 20);
    }
    if (!(subDt > 0)) subDt = MAX_PHYSICS_DT;

    let steps = 0;
    while (dtAccumulator >= subDt && steps < MAX_SUBSTEPS) {
        integrate(subDt);
        dtAccumulator -= subDt;
        steps++;
    }

    // If accumulator has a non-zero residual smaller than subDt and no full step ran,
    // execute a single micro-step for low-framerate responsiveness when dt_yr < subDt
    if (steps === 0 && dtAccumulator > 0) {
        integrate(dtAccumulator);
        dtAccumulator = 0;
    }

    // FIX-06: substep-cap guard — a pathological innermost orbit needing more
    // than MAX_SUBSTEPS gets slight undersampling instead of freezing the tick
    // loop (the residual drains through later ticks or the accumulator cap
    // above). Throttled log, not per-tick spam.
    if (steps >= MAX_SUBSTEPS && dtAccumulator >= subDt) {
        const now_ms = Date.now();
        if (now_ms - lastSubstepCapWarn_ms >= 5000) {
            lastSubstepCapWarn_ms = now_ms;
            console.warn(`[nbody] substep cap hit: ${steps} steps of ${subDt.toExponential(2)} yr ` +
                `could not consume the full tick (tMin_yr=${tMin_yr.toExponential(2)} yr) — ` +
                `undersampling this system until its innermost orbit widens`);
        }
    }

    // Close-approach physics events (COLLISION) ride the dedicated SIM_EVENT
    // channel — never the UPDATE buffer. Event-only: no merge physics here.
    detectCollisions();

    emitBuffer();
}

function emitBuffer(): void {
    const n = bodies.length;
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
        // TODO(spawn-phase): the type slot is binary (planet ? 0 : 1) — a
        // spawned STAR or BLACK HOLE participates in worker gravity today but
        // has no rich renderer hookup (HeroStarSystem / RemnantPhase bridging
        // lands in a later build — do not half-build it here).
        buffer[offset + 6] = b.type === 'planet' ? 0 : 1;
    }

    // Pass buffer via transferable interface (one-way transfer detaches the buffer,
    // requiring per-tick reallocation below; true zero-alloc would require SharedArrayBuffer or return-transfer)
    (self as any).postMessage({ type: 'UPDATE', buffer }, [buffer.buffer]);

    // Reallocate the transferred buffer since it was detached/neutered
    if (useA) {
        bufferA = new Float32Array(size);
    } else {
        bufferB = new Float32Array(size);
    }
    useA = !useA;
}
