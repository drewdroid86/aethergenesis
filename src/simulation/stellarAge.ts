import { createStellarState } from './StellarPhysics';
import { PHASE_NAMES, PHASES, STELLAR_CONSTANTS } from '../core/constants';

const PHASE_STR_TO_NUM: Record<string, number> = {
    nebula: PHASES.NEBULA,
    protostar: PHASES.PROTOSTAR,
    main_sequence: PHASES.MAIN_SEQUENCE,
    red_giant: PHASES.RED_GIANT,
    supernova: PHASES.SUPERNOVA,
    remnant: PHASES.REMNANT,
};

/** Set a star's effective age and the cosmic-time anchor that produces it. */
export function setStellarAge(
    star: { lifespanReal: number; currentRealAge: number; t: number; birthAge: number },
    ageMyr: number,
    cosmicAgeGyr: number,
    gravity: number,
): void {
    if (!(star.lifespanReal > 0) || !Number.isFinite(ageMyr)) return;
    star.currentRealAge = Math.max(0, ageMyr);
    star.t = star.currentRealAge / star.lifespanReal;
    star.birthAge = cosmicAgeGyr - star.currentRealAge / (1000 * Math.max(0.01, gravity));
}

/**
 * Apply a lifecycle scrub target `t` (0..LIFECYCLE_MAX), syncing `birthAge`,
 * `currentRealAge`, `phase`, and `currentMass` from StellarPhysics so the next
 * animation frame does not snap `star.t` back and ARIA / N-body rekey see the
 * updated phase and mass immediately.
 */
export function applyStarLifecycleScrub(
    star: {
        physicsId?: string;
        mass: number;
        currentMass?: number;
        lifespanReal: number;
        currentRealAge: number;
        t: number;
        birthAge: number;
        phase: number;
        syncBirthAge?: (cosmicAge: number, effG?: number) => void;
    },
    targetT: number,
    cosmicAgeGyr: number,
    gravity: number = 1.0,
): { clampedT: number; percentage: number; phaseName: string } {
    const maxT = STELLAR_CONSTANTS.PHASE_BOUNDARIES.LIFECYCLE_MAX;
    const clampedT = Math.max(0, Math.min(maxT, Number.isFinite(targetT) ? targetT : 0));
    const effG = Math.max(0.01, Number.isFinite(gravity) ? gravity : 1.0);
    star.t = clampedT;
    if (typeof star.syncBirthAge === 'function') {
        star.syncBirthAge(cosmicAgeGyr, effG);
    } else {
        star.currentRealAge = Math.max(0, clampedT * star.lifespanReal);
        star.birthAge = cosmicAgeGyr - (star.currentRealAge / 1000) / effG;
    }
    const state = createStellarState(
        star.physicsId ?? 'scrub_star',
        star.mass,
        0.02,
        star.currentRealAge * 1e6,
    );
    star.phase = PHASE_STR_TO_NUM[state.phase] ?? star.phase;
    star.currentMass = state.mass_solar;
    const percentage = Math.min(100, Math.max(0, Math.round((clampedT / maxT) * 100)));
    const phaseName = PHASE_NAMES[star.phase] ?? 'Main Sequence';
    return { clampedT, percentage, phaseName };
}
