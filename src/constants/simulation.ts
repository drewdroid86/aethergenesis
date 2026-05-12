
export type PerformanceTier = 'low' | 'medium' | 'high' | 'ultra';

export const TIER_STAR_COUNTS: Record<PerformanceTier, number> = {
    low: 4000,
    medium: 80000,
    high: 300000,
    ultra: 500000,
};

export async function detectPerformanceTier(): Promise<PerformanceTier> {
    if (typeof window === 'undefined') return 'medium';

    const cores = navigator.hardwareConcurrency || 4;
    const dpr = window.devicePixelRatio || 1;
    
    // Quick benchmark: timing 5 frames
    const benchmark = async (): Promise<number> => {
        return new Promise((resolve) => {
            let start = performance.now();
            let frames = 0;
            const check = () => {
                frames++;
                if (frames < 5) {
                    requestAnimationFrame(check);
                } else {
                    resolve((performance.now() - start) / 5);
                }
            };
            requestAnimationFrame(check);
        });
    };

    const frameTime = await benchmark();
    
    // Logic for tiering
    if (cores <= 4 || frameTime > 20) return 'low';
    if (cores <= 8 && dpr > 2 && frameTime > 12) return 'medium';
    if (cores <= 12 || frameTime > 8) return 'high';
    return 'ultra';
}

export let NUM_STARS = 80000;
export let CURRENT_TIER: PerformanceTier = 'medium';

export function updateNumStars(tier: PerformanceTier): void {
    CURRENT_TIER = tier;
    NUM_STARS = TIER_STAR_COUNTS[tier];
}

export const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;

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
