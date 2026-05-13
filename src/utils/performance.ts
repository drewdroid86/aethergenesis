export type PerformanceTier = 'low' | 'medium' | 'high' | 'ultra';

export const FPS_THRESHOLD = 25;
export const CONSECUTIVE_FRAMES_THRESHOLD = 150; 
export const BANNER_DISPLAY_DURATION = 3000;

let onTierChangeCallback: ((tier: PerformanceTier) => void) | null = null;

/**
 * Detects the performance tier based on hardware concurrency and device pixel ratio.
 * 
 * Ultra: 8+ cores AND 2+ DPR
 * High: 6+ cores
 * Medium: 4+ cores
 * Low: Otherwise
 */
export function detectPerformanceTier(): PerformanceTier {
    const cores = navigator.hardwareConcurrency || 4;
    const dpr = window.devicePixelRatio || 1;

    if (cores >= 8 && dpr >= 2) return 'ultra';
    if (cores >= 6) return 'high';
    if (cores >= 4) return 'medium';
    return 'low';
}

export function getNumStarsForTier(tier: PerformanceTier): number {
    switch (tier) {
        case 'low': return 500;
        case 'medium': return 1000;
        case 'high': return 800;
        case 'ultra': return 1500;
        default: return 1000;
    }
}

/**
 * Stores a callback to be executed when the performance tier changes.
 */
export function setOnTierChangeCallback(callback: (tier: PerformanceTier) => void): void {
    onTierChangeCallback = callback;
}
