export const PHASE_NAMES = [
    "Nebula", "Protostar", "Main Sequence", "Red Giant", "Supernova", "Remnant"
];

export const PHASES = {
    NEBULA: 0,
    PROTOSTAR: 1,
    MAIN_SEQUENCE: 2,
    RED_GIANT: 3,
    SUPERNOVA: 4,
    REMNANT: 5
};

export const STELLAR_CONSTANTS = {
    /**
     * Phase boundaries as fractions of τ_MS (= this.t = age_yr / tau_ms).
     * Synchronised with REAL_PHASE_FRACTIONS in StellarPhysics.ts.
     *
     * nebula:      0          → 0.000001 τ_MS
     * protostar:   0.000001   → 0.001    τ_MS
     * main_seq:    0.001      → 1.0      τ_MS
     * red_giant:   1.0        → 1.2      τ_MS
     * supernova:   1.2        → 1.5      τ_MS  (mass ≥ 8 M☉)
     * remnant:     ≥ 1.5      τ_MS
     */
    PHASE_BOUNDARIES: {
        NEBULA_START: 0.0,
        NEBULA_LIMIT: 0.000001,
        PROTOSTAR_START: 0.000001,
        PROTOSTAR_LIMIT: 0.001,
        PROTOSTAR_DURATION: 0.001 - 0.000001,
        MAIN_SEQUENCE_START: 0.001,
        MAIN_SEQUENCE_LIMIT: 1.0,
        RED_GIANT_START: 1.0,
        RED_GIANT_LIMIT: 1.2,
        RED_GIANT_DURATION: 0.2,
        SUPERNOVA_START: 1.2,
        SUPERNOVA_LIMIT: 1.5,
        SUPERNOVA_DURATION: 0.3,
        REMNANT_START: 1.5,
        NEBULA_SECONDARY_LIMIT: 0.8,
    },
    PHYSICS: {
        TEMPERATURE_SOLAR: 5778,
        MASS_THRESHOLD_SUPERNOVA: 8,
        MASS_THRESHOLD_BLACK_HOLE: 15,
        MASS_THRESHOLD_INTERMEDIATE: 2,
    },
    TEMPERATURES: {
        NEBULA_START: 50,
        NEBULA_MAX: 1000,
        PROTOSTAR_START: 1000,
        RED_GIANT_TARGET: 3000,
        SUPERNOVA_HIGH_MASS: 100000,
        SUPERNOVA_LOW_MASS: 20000,
        REMNANT_NS_HIGH_MASS: 500000,
        REMNANT_NS_LOW_MASS: 100000,
        REMNANT_BH: 0,
    },
    LUMINOSITY: {
        NEBULA_MAX: 0.1,
        SUPERNOVA_HIGH_MASS: 100000,
        REMNANT_NS_HIGH_MASS: 0.5,
        REMNANT_NS_LOW_MASS: 0.1,
        REMNANT_BH: 0,
    },
    TRANSITIONS: {
        DEFAULT_SPEED: 4.0,
        VISIBILITY_THRESHOLD: 0.01,
        FADE_THRESHOLD: 160000, // Distance squared
    },
    VISUALS: {
        HALO_SCALE_FACTOR: 1.4,
        HZ_RADIUS_BASE: 4,
        HZ_LUM_FACTOR: 2.5,
        PLANET_HZ_DIST_FACTOR: 1.2,
        RED_GIANT_MAX_SCALE_FACTOR: 6.0,
        RED_GIANT_PULSATION_SPEED: 2.0,
        RED_GIANT_PULSATION_AMP: 0.1,
        RED_GIANT_PLANET_DMG_RADIUS: 1.2,
        RED_GIANT_PLANET_BURN_RADIUS: 0.2,
        SUPERNOVA_RING_SCALE_HIGH_MASS: 60.0,
        SUPERNOVA_RING_SCALE_LOW_MASS: 20.0,
        SUPERNOVA_FLASH_DURATION: 0.1,
        SUPERNOVA_EJECTA_EXP_SPEED: 0.5,
        PROTOSTAR_INTRO_SCALE_MIN: 0.5,
        PROTOSTAR_DISK_OPACITY: 0.8,
        NEBULA_DUST_ROTATION_SPEED: 0.2,
        NEBULA_DUST_ROTATION_SPEED_SECONDARY: 0.5,
        NEBULA_DUST_SCALE_REDUCTION: 0.5,
        NEBULA_DUST_ALPHA_REDUCTION: 1.25,
        NEBULA_DUST_SCALE_SECONDARY: 0.5,
        NEBULA_DUST_SCALE_SECONDARY_REDUCTION: 0.2,
    }
};
