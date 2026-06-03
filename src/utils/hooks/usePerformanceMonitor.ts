import { useState, useRef, useCallback, useEffect } from 'react';
import { detectPerformanceTier, FPS_THRESHOLD, CONSECUTIVE_FRAMES_THRESHOLD, BANNER_DISPLAY_DURATION } from '../../utils/performance';

export function usePerformanceMonitor(onTierChangeCallback: (newTier: 'low' | 'medium' | 'high' | 'ultra') => void) {
    const [currentTier, setCurrentTier] = useState<'low' | 'medium' | 'high' | 'ultra'>('medium');
    const currentTierRef = useRef(currentTier);
    const [fps, setFps] = useState(0);
    const [showTierDownIndicator, setShowTierDownIndicator] = useState(false);
    
    const fpsHistoryRef = useRef<number[]>([]);
    const lastFpsUpdateTimeRef = useRef(0);
    const consecutiveFramesBelowThresholdRef = useRef(0);
    const tierDownIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastDowngradeTimeRef = useRef(0);

    const handleTierChange = useCallback((newTier: 'low' | 'medium' | 'high' | 'ultra') => {
        if (newTier === currentTierRef.current) return;

        const previousTier = currentTierRef.current;
        currentTierRef.current = newTier;
        setCurrentTier(newTier);

        const isDowngrade = ['low', 'medium', 'high', 'ultra'].indexOf(newTier) < ['low', 'medium', 'high', 'ultra'].indexOf(previousTier);
        if (isDowngrade) {
            setShowTierDownIndicator(true); 

            if (tierDownIndicatorTimeoutRef.current) {
                clearTimeout(tierDownIndicatorTimeoutRef.current);
            }
            tierDownIndicatorTimeoutRef.current = setTimeout(() => {
                setShowTierDownIndicator(false);
            }, BANNER_DISPLAY_DURATION);
        }

        onTierChangeCallback(newTier);
    }, [onTierChangeCallback]);

    useEffect(() => {
        const initialTier = detectPerformanceTier();
        currentTierRef.current = initialTier;
        setCurrentTier(initialTier);
    }, [handleTierChange]);

    const registerFrameDelta = useCallback((delta: number, currentTime: number) => {
        const fpsHistory = fpsHistoryRef.current;
        fpsHistory.push(1 / delta); 
        if (fpsHistory.length > 60) fpsHistory.shift(); 
        
        const currentFps = fpsHistory.reduce((sum, val) => sum + val, 0) / fpsHistory.length;
        if (currentTime - lastFpsUpdateTimeRef.current > 1000) {
            setFps(Math.round(currentFps));
            lastFpsUpdateTimeRef.current = currentTime;
        }

        if (currentFps < FPS_THRESHOLD) {
            consecutiveFramesBelowThresholdRef.current++;
        } else {
            consecutiveFramesBelowThresholdRef.current = 0;
        }

        if (consecutiveFramesBelowThresholdRef.current >= CONSECUTIVE_FRAMES_THRESHOLD) {
            const tiers: ('low' | 'medium' | 'high' | 'ultra')[] = ['low', 'medium', 'high', 'ultra'];
            const currentTierIndex = tiers.indexOf(currentTierRef.current);
            if (currentTierIndex > 0 && (currentTime - lastDowngradeTimeRef.current > 10000)) {
                const newTier = tiers[currentTierIndex - 1];
                handleTierChange(newTier);
                lastDowngradeTimeRef.current = currentTime;
                consecutiveFramesBelowThresholdRef.current = 0; 
            }
        }
    }, [handleTierChange]);

    useEffect(() => {
        return () => {
            if (tierDownIndicatorTimeoutRef.current) {
                clearTimeout(tierDownIndicatorTimeoutRef.current);
            }
        };
    }, []);

    return {
        currentTier,
        currentTierRef,
        fps,
        showTierDownIndicator,
        registerFrameDelta
    };
}
