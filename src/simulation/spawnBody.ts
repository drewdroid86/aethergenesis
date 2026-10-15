/**
 * spawnBody.ts — pure spawn-state builders for tap-to-spawn (Phase B).
 *
 * Turns an empty-space tap position (AU, worker frame) into a worker-ready
 * OrbitalBody. No THREE imports, no Math.random — fully deterministic given
 * the same request (apart from the session id counter, resettable for tests).
 */

import { OrbitalBody, Vector3 } from './OrbitalMechanics';

/** Standard gravitational parameter scale: G = 4π² AU³ / (yr² M☉). */
const G_MU = 4.0 * Math.PI * Math.PI;

/** Spawn velocity intent. `orbit` enters a circular orbit; `drop` falls straight in. */
export type SpawnMode = 'orbit' | 'drop';

export interface SpawnRequest {
    /** Spawn position in AU, worker frame (ecliptic z=0 (X-Y) plane for taps). */
    position_au: Vector3;
    /** Central mass in solar masses — pass the star's phase-aware currentMass. */
    centralMass_solar: number;
    /** Default 'orbit'. Exposed as a parameter so the future toolbar can offer "drop" mode. */
    mode?: SpawnMode;
    /** Body id. Defaults to a session-monotonic `spawned_N` (deterministic per session). */
    id?: string;
    /** Default 'planet'. 'star' passes through worker gravity (see TODO in PlanetarySystem). */
    bodyType?: OrbitalBody['type'];
    mass_solar?: number;
    radius_km?: number;
}

/** Minimum spawn radius (AU). Inside this the circular-orbit speed diverges. */
export const MIN_SPAWN_RADIUS_AU = 0.05;

let spawnCounter = 1;

/** Next deterministic spawn id (`spawned_1`, `spawned_2`, …). */
export function nextSpawnId(): string {
    return `spawned_${spawnCounter++}`;
}

/** Reset the spawn id counter (tests / fresh deterministic runs). */
export function resetSpawnCounter(): void {
    spawnCounter = 1;
}

/**
 * Circular-orbit speed at radius r under centralMass: v = sqrt(G·M / r).
 * This is the exact formula the worker's own NaN-reset uses — reused here,
 * not re-derived.
 */
export function circularOrbitSpeed(radius_au: number, centralMass_solar: number): number {
    const r = Math.max(MIN_SPAWN_RADIUS_AU, radius_au);
    const m = centralMass_solar > 0 && Number.isFinite(centralMass_solar) ? centralMass_solar : 1.0;
    return Math.sqrt((G_MU * m) / r);
}

/**
 * Tangential prograde unit direction for a circular orbit through
 * `position` in the worker X-Y ecliptic plane (z=0): t = normalize(zUp × p).
 * Degenerate when p is on the z-axis — falls back to +x (deterministic, documented).
 */
export function progradeDirection(position: Vector3): Vector3 {
    // zUp × p for zUp=(0,0,1): (-py, px, 0)
    const tx = -position.y;
    const ty = position.x;
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len < 1e-9) return { x: 1, y: 0, z: 0 };
    return { x: tx / len, y: ty / len, z: 0 };
}

/**
 * Clamp a spawn position out to MIN_SPAWN_RADIUS_AU (preserving direction;
 * +x when the input is the zero vector). Deterministic — no randomness.
 */
export function clampSpawnRadius(position: Vector3): Vector3 {
    const r = Math.sqrt(
        position.x * position.x + position.y * position.y + position.z * position.z
    );
    if (r >= MIN_SPAWN_RADIUS_AU) return { ...position };
    if (r < 1e-9) return { x: MIN_SPAWN_RADIUS_AU, y: 0, z: 0 };
    const s = MIN_SPAWN_RADIUS_AU / r;
    return { x: position.x * s, y: position.y * s, z: position.z * s };
}

/** Position + velocity state vectors for a spawn request. */
export function computeSpawnState(request: SpawnRequest): { position: Vector3; velocity: Vector3 } {
    const position = clampSpawnRadius(request.position_au);
    if ((request.mode ?? 'orbit') === 'drop') {
        // Solar Smash "drop it in" feel: released at rest, falls straight in.
        return { position, velocity: { x: 0, y: 0, z: 0 } };
    }
    const r = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
    const speed = circularOrbitSpeed(r, request.centralMass_solar);
    const dir = progradeDirection(position);
    return { position, velocity: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed } };
}

/**
 * Build a worker-ready body for a spawn request. Planet-type spawns carry
 * Earth-like defaults; star-type spawns default to 1 M☉ and participate in
 * worker gravity (rich renderer hookup is a later build — see the TODO in
 * PlanetarySystem.applyRoster).
 */
export function buildSpawnBody(request: SpawnRequest): OrbitalBody {
    const type = request.bodyType ?? 'planet';
    const { position, velocity } = computeSpawnState(request);
    let mass_solar = request.mass_solar;
    if (mass_solar === undefined || !Number.isFinite(mass_solar)) {
        mass_solar = type === 'star' ? 1.0 : 0.000003;
    }
    return {
        id: request.id ?? nextSpawnId(),
        type,
        mass_solar,
        radius_km: request.radius_km ?? (type === 'star' ? 695700 : 6371),
        position_au: position,
        velocity_au_yr: velocity,
    };
}
