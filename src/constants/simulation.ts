export const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;
export const NUM_STARS = IS_MOBILE ? 8000 : 500000;
export const HERO_COUNT = IS_MOBILE ? 6 : 20;
export const GALAXY_ARMS = 5;
export const GALAXY_SPIN = -0.15;
export const GALAXY_MAX_RADIUS = 350;
export const CORE_RADIUS = 25;
export const GALAXY_CYCLE = (Math.PI * 2) / GALAXY_ARMS;
export const GALAXY_INV_CYCLE = 1.0 / GALAXY_CYCLE;

export const PHASES = {
    NEBULA: 0,
    PROTOSTAR: 1,
    MAIN_SEQUENCE: 2,
    RED_GIANT: 3,
    SUPERNOVA: 4,
    REMNANT: 5
};

export const PHASE_NAMES = [
    "Nebula Formation",
    "Protostar Ignition",
    "Main Sequence",
    "Red Giant",
    "Supernova",
    "Stellar Remnant"
];
