import * as THREE from 'three';

export const NUM_STARS = 50000;
export const GALAXY_ARMS = 5;
export const GALAXY_SPIN = -0.15;
export const GALAXY_MAX_RADIUS = 350;
export const CORE_RADIUS = 25;

export const PHASES = {
    NEBULA: 0,
    PROTOSTAR: 1,
    MAIN_SEQUENCE: 2,
    RED_GIANT: 3,
    SUPERNOVA: 4,
    REMNANT: 5
} as const;

export const PHASE_NAMES = [
    "Nebula Formation",
    "Protostar Ignition",
    "Main Sequence",
    "Red Giant",
    "Supernova",
    "Stellar Remnant"
] as const;
