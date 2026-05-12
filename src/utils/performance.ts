// src/utils/performance.ts

export const FPS_THRESHOLD = 30;
export const CONSECUTIVE_FRAMES_THRESHOLD = 90; // Approx 3 seconds at 30fps

let _onTierChangeCallback: ((tier: 'low' | 'medium' | 'high' | 'ultra') => void) | null = null;

export function setOnTierChangeCallback(callback: (tier: 'low' | 'medium' | 'high' | 'ultra') => void): void {
    _onTierChangeCallback = callback;
}

export function triggerTierChange(tier: 'low' | 'medium' | 'high' | 'ultra'): void {
    if (_onTierChangeCallback) {
        _onTierChangeCallback(tier);
    }
}
