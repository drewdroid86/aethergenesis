import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { PHASE_NAMES } from '../../core/constants';
import { PhysicsConstants } from '../../types/physics';
import { 
    detectPerformanceTier, 
    getNumStarsForTier, 
    setOnTierChangeCallback,
    FPS_THRESHOLD,
    CONSECUTIVE_FRAMES_THRESHOLD,
    BANNER_DISPLAY_DURATION
} from '../../utils/performance';
import { updateNumStars } from '../../constants/simulation';

export function useSimulation(containerRef: React.RefObject<HTMLDivElement | null>) {
    const engineRef = useRef<Engine | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const [selectedStar, setSelectedStar] = useState<HeroStarSystem | null>(null);
    const selectedStarRef = useRef<HeroStarSystem | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
    const [isConstantsOpen, setIsConstantsOpen] = useState(true);
    const isConstantsOpenRef = useRef(isConstantsOpen);
    useEffect(() => { isConstantsOpenRef.current = isConstantsOpen; }, [isConstantsOpen]);
    const [fatalError, setFatalError] = useState<string | null>(null);
    const isScrubbingRef = useRef(false);
    const hitMeshesRef = useRef<THREE.Object3D[]>([]);

    // Performance State
    const [currentTier, setCurrentTier] = useState<'low' | 'medium' | 'high' | 'ultra'>('medium');
    const currentTierRef = useRef(currentTier);
    const [fps, setFps] = useState(0);
    const [showTierDownIndicator, setShowTierDownIndicator] = useState(false);
    const consecutiveFramesBelowThresholdRef = useRef(0);
    const tierDownIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hasDowngradedRef = useRef(false);

    // Physics Constants State
    const [physics, setPhysics] = useState<PhysicsConstants>({
        G: 1.0,
        alpha: 1.0,
        strongForce: 1.0,
        weakForce: 1.0,
        lambda: 1.0,
        c: 1.0,
        hbar: 1.0,
        darkMatter: 0.25,
        baryon: 0.05,
        H0: 0.01,
        softening: 0.1
    });
    const physicsRef = useRef(physics);
    useEffect(() => { 
        physicsRef.current = physics; 
    }, [physics]);

    // Cosmic Age State
    const [cosmicAge, setCosmicAge] = useState(13.8);
    const cosmicAgeRef = useRef(cosmicAge);
    const [isPlayingCosmic, setIsPlayingCosmic] = useState(true);
    const isPlayingCosmicRef = useRef(isPlayingCosmic);
    const isGlobalScrubbingRef = useRef(false);
    useEffect(() => { cosmicAgeRef.current = cosmicAge; }, [cosmicAge]);
    useEffect(() => { isPlayingCosmicRef.current = isPlayingCosmic; }, [isPlayingCosmic]);

    // HUD & UI Refs
    const hudRefs = {
        hudX: useRef<HTMLSpanElement>(null),
        hudY: useRef<HTMLSpanElement>(null),
        hudZ: useRef<HTMLSpanElement>(null),
        hudAge: useRef<HTMLSpanElement>(null),
        globalTimelineFill: useRef<HTMLDivElement>(null),
        globalSlider: useRef<HTMLDivElement>(null),
        tierDownIndicator: useRef<HTMLDivElement>(null),
    };

    const uiRefs = {
        phase: useRef<HTMLSpanElement>(null),
        temp: useRef<HTMLSpanElement>(null),
        mass: useRef<HTMLSpanElement>(null),
        age: useRef<HTMLSpanElement>(null),
        lum: useRef<HTMLSpanElement>(null),
        timelineFill: useRef<HTMLDivElement>(null),
        stellarSlider: useRef<HTMLDivElement>(null),
    };

    const disposeStarSystem = (star: HeroStarSystem) => {
        star.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => material.dispose());
                } else if (child.material) {
                    child.material.dispose();
                }
            }
        });
    };

    const rebuildStarfieldGeometry = useCallback(() => {
        if (!engineRef.current || !engineRef.current.scene) return;

        engineRef.current.heroStars.forEach((star) => {
            engineRef.current?.scene.remove(star);
            disposeStarSystem(star);
        });
        engineRef.current.heroStars = [];

        engineRef.current.createHeroStars(
            getNumStarsForTier(currentTierRef.current),
            physicsRef.current
        );
        hitMeshesRef.current = engineRef.current.heroStars.map(h => (h as any).hitMesh);
    }, [currentTier]); 

    const handleTierChange = useCallback((newTier: 'low' | 'medium' | 'high' | 'ultra') => {
        if (newTier === currentTierRef.current) return;

        const previousTier = currentTierRef.current;
        currentTierRef.current = newTier;
        setCurrentTier(newTier);
        updateNumStars(newTier);

        const isDowngrade = ['low', 'medium', 'high', 'ultra'].indexOf(newTier) < ['low', 'medium', 'high', 'ultra'].indexOf(previousTier);
        if (isDowngrade) {
            hasDowngradedRef.current = true;
            setShowTierDownIndicator(true); 

            if (tierDownIndicatorTimeoutRef.current) {
                clearTimeout(tierDownIndicatorTimeoutRef.current);
            }
            tierDownIndicatorTimeoutRef.current = setTimeout(() => {
                setShowTierDownIndicator(false);
            }, BANNER_DISPLAY_DURATION);
        }

        rebuildStarfieldGeometry();
    }, [rebuildStarfieldGeometry]); 

    useEffect(() => {
        setOnTierChangeCallback(handleTierChange);
        const initialTier = detectPerformanceTier();
        currentTierRef.current = initialTier;
        setCurrentTier(initialTier);
        updateNumStars(initialTier);
    }, [handleTierChange]); 

    useEffect(() => {
        if (!containerRef.current) return;
        if (engineRef.current) return; // Prevent double initialization

        try {
            const engine = new Engine(containerRef.current);
            engineRef.current = engine;
            hitMeshesRef.current = engine.heroStars.map(h => (h as any).hitMesh);

            const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxDistance = 600;
            controls.minDistance = 2;
            controlsRef.current = controls;

            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();
            let isDragging = false;
            let mouseDownPos = { x: 0, y: 0 };

            const onPointerDown = (e: PointerEvent) => {
                isDragging = false;
                mouseDownPos = { x: e.clientX, y: e.clientY };
            };

            const onPointerMove = (e: PointerEvent) => {
                if (Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5) {
                    isDragging = true;
                }
            };

            const onPointerUp = (e: PointerEvent) => {
                if (isDragging || e.button !== 0) return;

                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, engine.camera);

                const intersects = raycaster.intersectObjects(hitMeshesRef.current);

                if (intersects.length > 0) {
                    const hit = intersects[0].object;
                    const system = hit.parent as HeroStarSystem;
                    selectedStarRef.current = system;
                    setSelectedStar(system);

                    const targetPos = system.position.clone();
                    const camOffset = engine.camera.position.clone().sub(controls.target).normalize().multiplyScalar(40);
                    engine.camera.position.copy(targetPos).add(camOffset);
                    controls.target.copy(targetPos);
                } else {
                    selectedStarRef.current = null;
                    setSelectedStar(null);
                }
            };

            window.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);

            let frameId: number;
            let lastAnimationTime = performance.now();
            let fpsHistory: number[] = [];

            const animate = () => {
                frameId = requestAnimationFrame(animate);
                try {
                    const currentTime = performance.now();
                    const delta = Math.max(0.001, Math.min((currentTime - lastAnimationTime) / 1000, 0.05)); 
                    lastAnimationTime = currentTime;

                    fpsHistory.push(1 / delta); 
                    if (fpsHistory.length > 60) fpsHistory.shift(); 
                    const currentFps = fpsHistory.reduce((sum, val) => sum + val, 0) / fpsHistory.length;
                    setFps(Math.round(currentFps));

                    if (currentFps < FPS_THRESHOLD) {
                        consecutiveFramesBelowThresholdRef.current++;
                    } else {
                        consecutiveFramesBelowThresholdRef.current = 0;
                    }

                    if (consecutiveFramesBelowThresholdRef.current >= CONSECUTIVE_FRAMES_THRESHOLD) {
                        const tiers: ('low' | 'medium' | 'high' | 'ultra')[] = ['low', 'medium', 'high', 'ultra'];
                        const currentTierIndex = tiers.indexOf(currentTierRef.current);
                        if (currentTierIndex > 0 && !hasDowngradedRef.current) {
                            const newTier = tiers[currentTierIndex - 1];
                            handleTierChange(newTier);
                            consecutiveFramesBelowThresholdRef.current = 0; 
                        }
                    }

                    if (isPlayingCosmicRef.current && !isGlobalScrubbingRef.current) {
                        cosmicAgeRef.current += delta * 0.2; 
                        if (cosmicAgeRef.current > 14) {
                            cosmicAgeRef.current = 0; 
                        }
                        if (hudRefs.globalTimelineFill.current) {
                            hudRefs.globalTimelineFill.current.style.width = `${(cosmicAgeRef.current / 14.0) * 100}%`;
                        }
                        if (hudRefs.globalSlider.current) {
                            hudRefs.globalSlider.current.setAttribute('aria-valuenow', cosmicAgeRef.current.toFixed(2));
                            hudRefs.globalSlider.current.setAttribute('aria-valuetext', `${cosmicAgeRef.current.toFixed(2)} Billion Years`);
                        }
                        if (Math.floor(engine.appTime * 2) !== Math.floor((engine.appTime - delta) * 2)) {
                            setCosmicAge(cosmicAgeRef.current);
                        }
                    }

                    engine.isPaused = isPausedRef.current;
                    engine.update(delta, selectedStarRef.current, isScrubbingRef.current, physicsRef.current, cosmicAgeRef.current);
                    controls.update();

                    if (hudRefs.hudX.current) hudRefs.hudX.current.innerText = engine.camera.position.x.toFixed(4);
                    if (hudRefs.hudY.current) hudRefs.hudY.current.innerText = engine.camera.position.y.toFixed(4);
                    if (hudRefs.hudZ.current) hudRefs.hudZ.current.innerText = engine.camera.position.z.toFixed(4);
                    if (hudRefs.hudAge.current) hudRefs.hudAge.current.innerText = cosmicAgeRef.current.toFixed(2);

                    if (selectedStarRef.current) {
                        const s = selectedStarRef.current;
                        if (uiRefs.phase.current) uiRefs.phase.current.innerText = PHASE_NAMES[s.phase];
                        if (uiRefs.temp.current) uiRefs.temp.current.innerText = Math.round(s.currentTemp).toLocaleString();
                        if (uiRefs.mass.current) uiRefs.mass.current.innerText = s.mass.toFixed(2);
                        if (uiRefs.age.current) uiRefs.age.current.innerText = s.currentRealAge.toFixed(1);
                        if (uiRefs.lum.current) uiRefs.lum.current.innerText = s.currentLum.toFixed(3);
                        const perc = Math.round(s.t * 100);
                        if (uiRefs.timelineFill.current) uiRefs.timelineFill.current.style.width = `${perc}%`;
                        if (uiRefs.stellarSlider.current) {
                            uiRefs.stellarSlider.current.setAttribute('aria-valuenow', perc.toString());
                            uiRefs.stellarSlider.current.setAttribute('aria-valuetext', `${perc}% of Stellar Lifecycle (${PHASE_NAMES[s.phase]})`);
                        }
                    }
                } catch (err: any) {
                    cancelAnimationFrame(frameId);
                    setFatalError(err.message);
                }
            };
            animate();

            const handleResize = () => {
                engine.resize(window.innerWidth, window.innerHeight);
            };

            const handleGlobalKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    if (selectedStarRef.current) {
                        selectedStarRef.current = null;
                        setSelectedStar(null);
                    } else if (isConstantsOpenRef.current) {
                        setIsConstantsOpen(false);
                    }
                }
            };

            window.addEventListener('resize', handleResize);
            window.addEventListener('keydown', handleGlobalKeyDown);

            return () => {
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('keydown', handleGlobalKeyDown);
                window.removeEventListener('pointerdown', onPointerDown);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                cancelAnimationFrame(frameId);
                if (tierDownIndicatorTimeoutRef.current) {
                    clearTimeout(tierDownIndicatorTimeoutRef.current);
                }
                engine.dispose();
                engineRef.current = null;
            };
        } catch (err: any) {
            setFatalError(err.message);
        }
    }, [handleTierChange, rebuildStarfieldGeometry]); 

    const handleScrub = (e: React.PointerEvent) => {
        if (!selectedStarRef.current || !isScrubbingRef.current) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = x / rect.width;
        selectedStarRef.current.t = percentage;
        const perc = Math.round(percentage * 100);
        e.currentTarget.setAttribute('aria-valuenow', perc.toString());
        e.currentTarget.setAttribute('aria-valuetext', `${perc}% of Stellar Lifecycle (${PHASE_NAMES[selectedStarRef.current.phase]})`);
    };

    const handleGlobalScrub = (e: React.PointerEvent) => {
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
    };

    return {
        selectedStar,
        setSelectedStar: (s: HeroStarSystem | null) => {
            selectedStarRef.current = s;
            setSelectedStar(s);
        },
        isPaused,
        setIsPaused,
        fatalError,
        hudRefs,
        uiRefs,
        physics,
        setPhysics,
        isConstantsOpen,
        setIsConstantsOpen,
        cosmicAge,
        setCosmicAge,
        isPlayingCosmic,
        setIsPlayingCosmic,
        currentTier, 
        fps, 
        showTierDownIndicator, 
        onScrubStart: (e: React.PointerEvent) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            isScrubbingRef.current = true;
            handleScrub(e);
        },
        onScrubMove: (e: React.PointerEvent) => {
            if (isScrubbingRef.current) handleScrub(e);
        },
        onScrubEnd: () => {
            isScrubbingRef.current = false;
        },
        onGlobalScrubStart: (e: React.PointerEvent) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            isGlobalScrubbingRef.current = true;
            handleGlobalScrub(e);
        },
        onGlobalScrubMove: (e: React.PointerEvent) => {
            if (isGlobalScrubbingRef.current) handleGlobalScrub(e);
        },
        onGlobalScrubEnd: () => {
            isGlobalScrubbingRef.current = false;
        },
        onKeyDown: (e: React.KeyboardEvent, global: boolean) => {
            const k = e.key;
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) return;
            e.preventDefault();
            if (global) {
                let a = k==='Home'?0 : k==='End'?14 : cosmicAgeRef.current+(k==='ArrowLeft'?-0.1:0.1);
                a = Math.max(0, Math.min(14, a));
                setCosmicAge(a); cosmicAgeRef.current = a;
                const formattedAge = a.toFixed(2);
                e.currentTarget.setAttribute('aria-valuenow', formattedAge);
                e.currentTarget.setAttribute('aria-valuetext', `${formattedAge} Billion Years`);
            } else if (selectedStarRef.current) {
                let t = k==='Home'?0 : k==='End'?1 : selectedStarRef.current.t+(k==='ArrowLeft'?-0.01:0.01);
                selectedStarRef.current.t = Math.max(0, Math.min(1, t));
                const perc = Math.round(selectedStarRef.current.t * 100);
                e.currentTarget.setAttribute('aria-valuenow', perc.toString());
                e.currentTarget.setAttribute('aria-valuetext', `${perc}% of Stellar Lifecycle (${PHASE_NAMES[selectedStarRef.current.phase]})`);
            }
        },
        resetCamera: () => {
            controlsRef.current?.reset();
        }
    };
}
