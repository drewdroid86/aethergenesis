export const FPS_THRESHOLD = 30;
export const CONSECUTIVE_FRAMES_THRESHOLD = 90; // Approx 3 seconds at 30fps

export function detectPerformanceTier(): 'low' | 'medium' | 'high' | 'ultra' {
    return 'medium';
}

export function getNumStarsForTier(_tier: 'low' | 'medium' | 'high' | 'ultra'): number {
    switch (_tier) {
        case 'low': return 500;
        case 'medium': return 1000;
        case 'high': return 2000;
        case 'ultra': return 5000;
        default: return 1000;
    }
}

export function setOnTierChangeCallback(_callback: (tier: 'low' | 'medium' | 'high' | 'ultra') => void): void {
    //
}
