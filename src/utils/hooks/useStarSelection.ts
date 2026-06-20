import { useState, useRef, useCallback } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { PHASE_NAMES } from '../../core/constants';

interface UseStarSelectionProps {
    engineRef: React.MutableRefObject<Engine | null>;
    controlsRef: React.MutableRefObject<OrbitControls | null>;
}

export function useStarSelection({ engineRef, controlsRef }: UseStarSelectionProps) {
    const [selectedStar, setSelectedStarState] = useState<HeroStarSystem | null>(null);
    const selectedStarRef = useRef<HeroStarSystem | null>(null);
    const isScrubbingRef = useRef(false);

    const setSelectedStar = useCallback((s: HeroStarSystem | null) => {
        selectedStarRef.current = s;
        setSelectedStarState(s);
    }, []);

    const centerOnStar = useCallback(() => {
        if (selectedStarRef.current && controlsRef.current && engineRef.current) {
            const targetPos = selectedStarRef.current.position.clone();
            const camOffset = engineRef.current.camera.position.clone().sub(controlsRef.current.target).normalize().multiplyScalar(40);
            engineRef.current.camera.position.copy(targetPos).add(camOffset);
            controlsRef.current.target.copy(targetPos);
            controlsRef.current.update();
        }
    }, [engineRef, controlsRef]);

    const resetCamera = useCallback(() => {
        controlsRef.current?.reset();
    }, [controlsRef]);

    const handleScrub = useCallback((e: React.PointerEvent) => {
        if (!selectedStarRef.current || !isScrubbingRef.current) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = x / rect.width;
        selectedStarRef.current.t = percentage;
        const perc = Math.round(percentage * 100);
        e.currentTarget.setAttribute('aria-valuenow', perc.toString());
        e.currentTarget.setAttribute('aria-valuetext', `${perc}% of Stellar Lifecycle (${PHASE_NAMES[selectedStarRef.current.phase]})`);
    }, []);

    const onScrubStart = useCallback((e: React.PointerEvent) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        isScrubbingRef.current = true;
        handleScrub(e);
    }, [handleScrub]);

    const onScrubMove = useCallback((e: React.PointerEvent) => {
        if (isScrubbingRef.current) handleScrub(e);
    }, [handleScrub]);

    const onScrubEnd = useCallback(() => {
        isScrubbingRef.current = false;
    }, []);

    return {
        selectedStar,
        setSelectedStar,
        selectedStarRef,
        isScrubbingRef,
        centerOnStar,
        resetCamera,
        onScrubStart,
        onScrubMove,
        onScrubEnd
    };
}
