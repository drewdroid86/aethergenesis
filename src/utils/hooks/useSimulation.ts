import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { PHASE_NAMES } from '../../core/constants';

export function useSimulation(containerRef: React.RefObject<HTMLDivElement | null>) {
    const engineRef = useRef<Engine | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const [selectedStar, setSelectedStar] = useState<HeroStarSystem | null>(null);
    const selectedStarRef = useRef<HeroStarSystem | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [fatalError, setFatalError] = useState<string | null>(null);
    const isScrubbingRef = useRef(false);

    // Physics Constants State
    const [physics, setPhysics] = useState({
        G: 1.0,
        alpha: 1.0,
        lambda: 1.0,
        c: 1.0,
        hbar: 1.0
    });
    const physicsRef = useRef(physics);
    useEffect(() => { physicsRef.current = physics; }, [physics]);

    // Cosmic Age State
    const [cosmicAge, setCosmicAge] = useState(13.8);
    const cosmicAgeRef = useRef(cosmicAge);
    const [isPlayingCosmic, setIsPlayingCosmic] = useState(true);
    const isPlayingCosmicRef = useRef(isPlayingCosmic);
    const isGlobalScrubbingRef = useRef(false);
    useEffect(() => { cosmicAgeRef.current = cosmicAge; }, [cosmicAge]);
    useEffect(() => { isPlayingCosmicRef.current = isPlayingCosmic; }, [isPlayingCosmic]);

    // HUD & UI Refs for performance
    const hudRefs = {
        hudX: useRef<HTMLSpanElement>(null),
        hudY: useRef<HTMLSpanElement>(null),
        hudZ: useRef<HTMLSpanElement>(null),
        hudAge: useRef<HTMLSpanElement>(null),
        globalTimelineFill: useRef<HTMLDivElement>(null),
        globalSlider: useRef<HTMLDivElement>(null),
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

    useEffect(() => {
        if (!containerRef.current) return;

        try {
            const engine = new Engine(containerRef.current);
            engineRef.current = engine;

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

                const hitMeshes = engine.heroStars.map(h => h.hitMesh);
                const intersects = raycaster.intersectObjects(hitMeshes);

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
            const animate = () => {
                frameId = requestAnimationFrame(animate);
                try {
                    const delta = Math.min(engine.clock.getDelta(), 0.05);

                    // Auto play cosmic Age if playing
                    if (isPlayingCosmicRef.current && !isGlobalScrubbingRef.current) {
                        cosmicAgeRef.current += delta * 0.2; // 0.2 Gyr per second
                        if (cosmicAgeRef.current > 14) {
                            cosmicAgeRef.current = 0; // Loop universe
                        }
                        if (hudRefs.globalTimelineFill.current) {
                            hudRefs.globalTimelineFill.current.style.width = `${(cosmicAgeRef.current / 14.0) * 100}%`;
                        }
                        if (hudRefs.globalSlider.current) {
                            hudRefs.globalSlider.current.setAttribute('aria-valuenow', cosmicAgeRef.current.toFixed(2));
                        }
                        // Throttled state update to keep React sync
                        if (Math.floor(engine.appTime) !== Math.floor(engine.appTime - delta)) {
                            setCosmicAge(cosmicAgeRef.current);
                        }
                    }

                    engine.isPaused = isPaused;
                    engine.update(selectedStarRef.current, isScrubbingRef.current, physicsRef.current, cosmicAgeRef.current);
                    controls.update();

                    // Update HUD
                    if (hudRefs.hudX.current) hudRefs.hudX.current.innerText = engine.camera.position.x.toFixed(4);
                    if (hudRefs.hudY.current) hudRefs.hudY.current.innerText = engine.camera.position.y.toFixed(4);
                    if (hudRefs.hudZ.current) hudRefs.hudZ.current.innerText = engine.camera.position.z.toFixed(4);
                    if (hudRefs.hudAge.current) hudRefs.hudAge.current.innerText = cosmicAgeRef.current.toFixed(2);

                    // Update Selected Star UI Panel
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
                        }
                    }
                } catch (err: any) {
                    setFatalError(err.message);
                }
            };
            animate();

            const handleResize = () => {
                engine.resize(window.innerWidth, window.innerHeight);
            };
            window.addEventListener('resize', handleResize);

            return () => {
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('pointerdown', onPointerDown);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                cancelAnimationFrame(frameId);
                engine.dispose();
            };
        } catch (err: any) {
            setFatalError(err.message);
        }
    }, [isPaused]);

    const handleScrub = (e: React.PointerEvent) => {
        if (!selectedStarRef.current || !isScrubbingRef.current) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = x / rect.width;
        selectedStarRef.current.t = percentage;
        e.currentTarget.setAttribute('aria-valuenow', Math.round(percentage * 100).toString());
    };

    const handleGlobalScrub = (e: React.PointerEvent) => {
        if (!isGlobalScrubbingRef.current) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = x / rect.width;
        const newAge = percentage * 14.0;
        setCosmicAge(newAge);
        cosmicAgeRef.current = newAge;
        e.currentTarget.setAttribute('aria-valuenow', newAge.toFixed(2));
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
        cosmicAge,
        setCosmicAge,
        isPlayingCosmic,
        setIsPlayingCosmic,
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
        resetCamera: () => {
            controlsRef.current?.reset();
        }
    };
}
