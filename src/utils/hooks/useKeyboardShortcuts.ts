import { useEffect } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../../types/physics';

interface UseKeyboardShortcutsProps {
    selectedStarRef: React.MutableRefObject<HeroStarSystem | null>;
    setSelectedStar: (star: HeroStarSystem | null) => void;
    setIsPlayingCosmic: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
    setIsConstantsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setTimeScale: React.Dispatch<React.SetStateAction<'cosmic' | 'realtime'>>;
    setPhysics: React.Dispatch<React.SetStateAction<PhysicsConstants>>;
    controlsRef: React.MutableRefObject<OrbitControls | null>;
    engineRef: React.MutableRefObject<Engine | null>;
    centerOnStar: () => void;
}

export function useKeyboardShortcuts({
    selectedStarRef,
    setSelectedStar,
    setIsPlayingCosmic,
    setIsPaused,
    setIsConstantsOpen,
    setTimeScale,
    setPhysics,
    controlsRef,
    engineRef,
    centerOnStar
}: UseKeyboardShortcutsProps) {
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement;
            if (active && (
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                (active as HTMLElement).isContentEditable ||
                active.closest('[contenteditable="true"]')
            )) {
                return;
            }

            // Alt+R for resetting physics constants
            if (e.altKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault();
                setPhysics(DEFAULT_CONSTANTS);
                return;
            }

            // Ignore if any other modifier key is pressed
            if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    setIsPlayingCosmic(prev => !prev);
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    setIsPaused(prev => !prev);
                    break;
                case 'r':
                case 'R':
                    e.preventDefault();
                    controlsRef.current?.reset();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    centerOnStar();
                    break;
                case 'c':
                case 'C':
                    e.preventDefault();
                    setIsConstantsOpen(prev => !prev);
                    break;
                case 't':
                case 'T':
                    e.preventDefault();
                    setTimeScale(prev => prev === 'cosmic' ? 'realtime' : 'cosmic');
                    break;
                case 'Escape':
                    selectedStarRef.current = null;
                    setSelectedStar(null);
                    setIsConstantsOpen(false);
                    break;
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => {
            window.removeEventListener('keydown', handleGlobalKeyDown);
        };
    }, [
        selectedStarRef,
        setSelectedStar,
        setIsPlayingCosmic,
        setIsPaused,
        setIsConstantsOpen,
        setTimeScale,
        setPhysics,
        controlsRef,
        engineRef,
        centerOnStar
    ]);
}
