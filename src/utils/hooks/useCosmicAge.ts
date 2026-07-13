import { useState, useRef, useEffect, useCallback } from 'react';

export function useCosmicAge() {
    const [cosmicAge, setCosmicAge] = useState(0.0);
    const cosmicAgeRef = useRef(cosmicAge);
    const [isPlayingCosmic, setIsPlayingCosmic] = useState(true);
    const isPlayingCosmicRef = useRef(isPlayingCosmic);
    const isGlobalScrubbingRef = useRef(false);

    useEffect(() => {
        cosmicAgeRef.current = cosmicAge;
    }, [cosmicAge]);

    useEffect(() => {
        isPlayingCosmicRef.current = isPlayingCosmic;
    }, [isPlayingCosmic]);

    const handleGlobalScrub = useCallback((e: React.PointerEvent) => {
        if (!isGlobalScrubbingRef.current) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = x / rect.width;
        const newAge = percentage * 14.0;
        setCosmicAge(newAge);
        cosmicAgeRef.current = newAge;
        const formattedAge = newAge.toFixed(2);
        e.currentTarget.setAttribute('aria-valuenow', formattedAge);
        e.currentTarget.setAttribute('aria-valuetext', `${formattedAge} Billion Years`);
    }, []);

    const onGlobalScrubStart = useCallback((e: React.PointerEvent) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        isGlobalScrubbingRef.current = true;
        handleGlobalScrub(e);
    }, [handleGlobalScrub]);

    const onGlobalScrubMove = useCallback((e: React.PointerEvent) => {
        if (isGlobalScrubbingRef.current) handleGlobalScrub(e);
    }, [handleGlobalScrub]);

    const onGlobalScrubEnd = useCallback(() => {
        isGlobalScrubbingRef.current = false;
    }, []);

    return {
        cosmicAge,
        setCosmicAge,
        cosmicAgeRef,
        isPlayingCosmic,
        setIsPlayingCosmic,
        isPlayingCosmicRef,
        isGlobalScrubbingRef,
        onGlobalScrubStart,
        onGlobalScrubMove,
        onGlobalScrubEnd
    };
}
