export type PerformanceTier = 'low' | 'medium' | 'high' | 'ultra';

export const FPS_THRESHOLD = 25;
export const CONSECUTIVE_FRAMES_THRESHOLD = 150; 
export const FPS_UPGRADE_THRESHOLD = 58;
export const CONSECUTIVE_UPGRADE_FRAMES_THRESHOLD = 300;
export const TIER_COOLDOWN_MS = 15000;
export const BANNER_DISPLAY_DURATION = 3000;

/**
 * Detects the performance tier based on hardware concurrency and device pixel ratio.
 * 
 * Ultra: 8+ cores AND 2+ DPR
 * High: 6+ cores
 * Medium: 4+ cores
 * Low: Otherwise
 */
export function detectPerformanceTier(): PerformanceTier {
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    if (cores >= 8 && dpr >= 2) return 'ultra';
    if (cores >= 6) return 'high';
    if (cores >= 4) return 'medium';
    return 'low';
}

export function getNumStarsForTier(tier: PerformanceTier): number {
    switch (tier) {
        case 'low': return 100;
        case 'medium': return 200;
        case 'high': return 400;
        case 'ultra': return 600;
        default: return 400;
    }
}

export const phaseCounters = {
    inits: 0,
    disposals: 0,
    blockedDoubleInits: 0
};
