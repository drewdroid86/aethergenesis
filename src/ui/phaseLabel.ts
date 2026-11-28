import { PHASE_NAMES, PHASES, STELLAR_CONSTANTS } from '../core/constants';

export interface HudPhaseStarInput {
    phase: number;
    mass: number;
    t: number;
    isPlanetaryNebula?: boolean;
}

/**
 * Formats the user-facing HUD phase label for a star, resolving low-mass
 * remnants (<= 8 M_sun) into "Planetary Nebula" during the early shell
 * window and "White Dwarf" once the shell fades.
 */
export function formatHudPhaseLabel(
    star: HudPhaseStarInput,
    phaseTitles: Record<number, string> = PHASE_NAMES,
    fallbackTitle = 'Main Sequence'
): string {
    const isLowMassRemnant =
        star.phase === PHASES.REMNANT &&
        star.mass <= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA;
    if (isLowMassRemnant) {
        const isPlanetaryNebula =
            star.isPlanetaryNebula ??
            (star.t < STELLAR_CONSTANTS.PHASE_BOUNDARIES.REMNANT_START);
        return isPlanetaryNebula ? 'Planetary Nebula' : 'White Dwarf';
    }
    return phaseTitles[star.phase] || fallbackTitle;
}
