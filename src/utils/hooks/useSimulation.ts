import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { NebulaSystem } from '../../rendering/systems/NebulaSystem';
import { PHASE_NAMES } from '../../core/constants';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../../types/physics';
import { getNumStarsForTier, PerformanceTier } from '../../utils/performance';
import { OrbitalBody, keplerianToCartesian } from '../../simulation/OrbitalMechanics';
import { SimulationCoordinator } from '../../simulation/SimulationCoordinator';

// Sub-hooks
import { useWebSocket } from './useWebSocket';
import { useCosmicAge } from './useCosmicAge';
import { usePerformanceAutoTuning } from './usePerformanceAutoTuning';
import { useStarSelection } from './useStarSelection';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

export function useSimulation(containerRef: React.RefObject<HTMLDivElement | null>) {
    const engineRef = useRef<Engine | null>(null);
    const nebulaSystemRef = useRef<NebulaSystem | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const coordinatorRef = useRef<SimulationCoordinator | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(isPaused);
    useEffect(() => { 
        isPausedRef.current = isPaused; 
        if (engineRef.current) engineRef.current.isPaused = isPaused;
        if (nbodyWorkerRef.current) {
            nbodyWorkerRef.current.postMessage({
                type: 'SET_RUNNING',
                payload: { running: !isPaused, isRunning: !isPaused }
            });
        }
    }, [isPaused]);
    const [fatalError, setFatalError] = useState<string | null>(null);

    // Physics Constants State
    const [physics, setPhysics] = useState<PhysicsConstants>(() => {
        const params = new URLSearchParams(window.location.search);
        const seed = params.get('seed');
        if (seed) return decodeSeed(seed);
        return DEFAULT_CONSTANTS;
    });
    const physicsRef = useRef(physics);
    useEffect(() => { 
        physicsRef.current = physics; 
        if (engineRef.current) engineRef.current.physicsConstants = physics;
    }, [physics]);

    // Cosmic Age & Time Scale State
    const [timeScale, setTimeScale] = useState<'cosmic' | 'realtime'>('cosmic');
    const timeScaleRef = useRef(timeScale);
    useEffect(() => { 
        timeScaleRef.current = timeScale; 
        if (engineRef.current) engineRef.current.timeScale = timeScale;
    }, [timeScale]);

    // Sync worker time scale when timeScale state changes
    useEffect(() => {
        if (nbodyWorkerRef.current) {
            const dt = timeScale === 'cosmic' ? 0.3 : 0.05;
            nbodyWorkerRef.current.postMessage({
                type: 'UPDATE_TIMESTEP',
                payload: { dt_yr: dt }
            });
        }
    }, [timeScale]);

    // Astrobiology UI State
    const [astrobiologyData, setAstrobiologyData] = useState<any[]>([]);

    // UI Panel State
    const [isConstantsOpen, setIsConstantsOpen] = useState(false);
    const [isCatalogOpen, setIsCatalogOpen] = useState(false);



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

    const nbodyBufferRef = useRef<Float32Array | null>(null);
    const nbodyWorkerRef = useRef<Worker | null>(null);

    // Initialize sub-hooks (selection first so rebuild can clear it safely)
    const {
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
    } = useCosmicAge();

    const {
        selectedStar,
        setSelectedStar,
        selectedStarRef,
        centerOnStar,
        resetCamera,
        onScrubStart,
        onScrubMove,
        onScrubEnd
    } = useStarSelection({
        engineRef,
        controlsRef
    });

    const loadStarPreset = useCallback((preset: any) => {
        setIsCatalogOpen(false);
        if (!preset) return;
        const star = selectedStarRef.current || engineRef.current?.heroStars[0];
        if (star) {
            star.applyPreset(preset, engineRef.current?.renderer, engineRef.current?.cosmicAge);
            if (coordinatorRef.current) {
                coordinatorRef.current.clearHistory(star.physicsId);
            }
            if (nbodyWorkerRef.current) {
                nbodyWorkerRef.current.postMessage({
                    type: 'UPDATE_CENTRAL_MASS',
                    payload: { centralMass_solar: star.mass }
                });
            }
        }
    }, [selectedStarRef]);

    const addBodyToSimulation = useCallback((elements: any) => {
        setIsCatalogOpen(false);
        if (!elements) return;

        const centralMass = selectedStarRef.current?.mass || 1.0;
        const eccentricity = Math.max(0, elements.eccentricity || 0);
        const safeEcc = Math.min(0.9999, eccentricity);
        const semiMajorAxis_au = elements.semi_major_axis_au || (elements.perihelion_au ? (elements.perihelion_au / (1 - safeEcc)) : 1.0);
        const inclination_deg = elements.inclination_deg || 0;
        const longitudeOfAscendingNode_deg = elements.longitude_ascending_node_deg || elements.longitudeOfAscendingNode_deg || 0;
        const argumentOfPeriapsis_deg = elements.argument_perihelion_deg || elements.argumentOfPeriapsis_deg || 0;
        const meanAnomaly_deg = elements.mean_anomaly_deg || elements.meanAnomaly_deg || 0;

        const cartesian = keplerianToCartesian({
            semiMajorAxis_au,
            eccentricity,
            inclination_deg,
            longitudeOfAscendingNode_deg,
            argumentOfPeriapsis_deg,
            meanAnomaly_deg
        }, centralMass);

        const bodyType: 'comet' | 'asteroid' | 'planet' = elements.type === 'asteroid' ? 'asteroid' : (elements.type === 'comet' ? 'comet' : (eccentricity > 0.8 ? 'comet' : 'planet'));

        const newBody: OrbitalBody = {
            id: elements.naif_id || elements.name || `body_${Date.now()}`,
            type: bodyType,
            mass_solar: elements.mass_solar || (bodyType === 'comet' ? 1e-12 : (bodyType === 'asteroid' ? 1e-10 : 0.000003)),
            radius_km: elements.radius_km || (bodyType === 'comet' ? 5.0 : 10.0),
            color: bodyType === 'comet' ? '#aaddff' : '#aaaaaa',
            position_au: cartesian.position,
            velocity_au_yr: cartesian.velocity
        };

        if (nbodyWorkerRef.current) {
            nbodyWorkerRef.current.postMessage({
                type: 'ADD_BODY',
                payload: { body: newBody }
            });
        }
    }, [selectedStarRef]);

    const adjustStarfieldTier = useCallback((newTier: PerformanceTier) => {
        if (!engineRef.current || !engineRef.current.scene) return;
        const targetCount = getNumStarsForTier(newTier);
        const engine = engineRef.current;

        // If a star is selected, ensure it remains in the active pool [0 .. targetCount-1]
        const selected = selectedStarRef.current;
        if (selected) {
            const selectedIdx = engine.heroStars.indexOf(selected);
            if (selectedIdx >= targetCount) {
                // Swap selected star with index 0 so it stays active, visible, and selected
                const temp = engine.heroStars[0];
                engine.heroStars[0] = selected;
                engine.heroStars[selectedIdx] = temp;
            }
        }

        engine.setHeroStarCount(targetCount, physicsRef.current);
    }, [selectedStarRef]);

    const {
        currentTier,
        fps,
        showTierDownIndicator,
        registerFrameDelta,
        diagnosticsEnabled,
        setDiagnosticsEnabled,
        diagnostics,
        resetDiagnostics
    } = usePerformanceAutoTuning({
        adjustStarfieldTier,
        engineRef
    });

    const registerFrameDeltaRef = useRef(registerFrameDelta);
    useEffect(() => {
        registerFrameDeltaRef.current = registerFrameDelta;
    }, [registerFrameDelta]);

    const wsRef = useWebSocket({
        engineRef,
        selectedStarRef
    });

    useKeyboardShortcuts({
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
    });

    // Universe Seed Logic
    function encodeSeed(p: PhysicsConstants): string {
        const values = [
            p.G, p.alpha, p.strongForce, p.weakForce,
            p.lambda, p.c, p.hbar, p.darkMatter,
            p.baryon, p.H0, p.softening
        ];
        return btoa(JSON.stringify(values.map(v => parseFloat((v || 0).toFixed(4)))));
    }

    function decodeSeed(seed: string): PhysicsConstants {
        try {
            const values = JSON.parse(atob(seed));
            if (!Array.isArray(values)) {
                throw new Error("Seed is not an array");
            }
            const getSafeVal = (val: any, min: number, max: number, fallback: number): number => {
                const num = Number(val);
                if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) {
                    return fallback;
                }
                return Math.max(min, Math.min(max, num));
            };
            return {
                G: getSafeVal(values[0], 0.1, 5.0, 1.0),
                alpha: getSafeVal(values[1], 0.1, 2.0, 1.0),
                strongForce: getSafeVal(values[2], 0.1, 5.0, 1.0),
                weakForce: getSafeVal(values[3], 0.1, 5.0, 1.0),
                lambda: getSafeVal(values[4], 0.1, 3.0, 1.0),
                c: getSafeVal(values[5], 0.1, 3.0, 1.0),
                hbar: getSafeVal(values[6], 0.1, 3.0, 1.0), // slider min in UI is 0.0, but let's clamp at 0.1 for physical meaning
                darkMatter: getSafeVal(values[7], 0.0, 1.0, 0.25),
                baryon: getSafeVal(values[8], 0.01, 0.2, 0.05),
                H0: getSafeVal(values[9], 0.001, 1.0, 0.01),
                softening: getSafeVal(values[10], 0.01, 1.0, 0.1)
            };
        } catch (e) {
            console.error("Failed to decode seed:", e);
            return DEFAULT_CONSTANTS;
        }
    }

    useEffect(() => {
        if (!containerRef.current) return;
        if (engineRef.current) return; // Prevent double initialization

        try {
            const engine = new Engine(containerRef.current);
            engineRef.current = engine;
            engine.physicsConstants = physicsRef.current;
            engine.isPaused = isPausedRef.current;
            engine.timeScale = timeScaleRef.current;
            engine.isPlayingCosmic = isPlayingCosmicRef.current;
            engine.cosmicAge = cosmicAgeRef.current;

            const nebulaSystem = new NebulaSystem(engine.scene);
            nebulaSystemRef.current = nebulaSystem;

            const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxDistance = 2500;
            controls.minDistance = 2;
            controlsRef.current = controls;

            if (!nbodyWorkerRef.current) {
                const worker = new Worker(new URL('../../simulation/nbodyWorker.ts', import.meta.url), { type: 'module' });
                nbodyWorkerRef.current = worker;
                
                worker.onmessage = (e) => {
                    if (e.data.type === 'UPDATE') {
                        nbodyBufferRef.current = e.data.buffer;
                        if (engineRef.current) {
                            engineRef.current.nbodyBuffer = e.data.buffer;
                        }
                    }
                };

                worker.onerror = (err) => {
                    console.error('[NBodyWorker] Uncaught error:', err);
                };

                const centralMass = 1.0;
                
                const earthInit = keplerianToCartesian({
                    semiMajorAxis_au: 1.0, eccentricity: 0.0167, inclination_deg: 0, 
                    longitudeOfAscendingNode_deg: 0, argumentOfPeriapsis_deg: 102.9, meanAnomaly_deg: 0
                }, centralMass);
                
                const earth: OrbitalBody = {
                    id: 'earth', type: 'planet', mass_solar: 0.000003, radius_km: 6371, color: '#0055ff',
                    position_au: earthInit.position, velocity_au_yr: earthInit.velocity
                };

                const jupiterInit = keplerianToCartesian({
                    semiMajorAxis_au: 5.2, eccentricity: 0.0489, inclination_deg: 1.3, 
                    longitudeOfAscendingNode_deg: 100.5, argumentOfPeriapsis_deg: 273.8, meanAnomaly_deg: 20
                }, centralMass);

                const jupiter: OrbitalBody = {
                    id: 'jupiter', type: 'planet', mass_solar: 0.00095, radius_km: 71492, color: '#ffaa00',
                    position_au: jupiterInit.position, velocity_au_yr: jupiterInit.velocity
                };

                const halleyInit = keplerianToCartesian({
                    semiMajorAxis_au: 17.8, eccentricity: 0.967, inclination_deg: 162.2, 
                    longitudeOfAscendingNode_deg: 58.4, argumentOfPeriapsis_deg: 111.3, meanAnomaly_deg: 38.3
                }, centralMass);

                const halley: OrbitalBody = {
                    id: '1P_Halley', type: 'comet', mass_solar: 1e-12, radius_km: 5.5, color: '#ffffff',
                    position_au: halleyInit.position, velocity_au_yr: halleyInit.velocity
                };

                worker.postMessage({
                    type: 'INIT',
                    payload: {
                        bodies: [earth, jupiter, halley],
                        centralMass_solar: centralMass,
                        dt_yr: 0.05,
                        isRunning: !isPausedRef.current
                    }
                });
            }

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

                const hitMeshes = engine.heroStars.slice(0, engine.activeHeroStarCount).filter(h => h.visible && h.t >= 0).map(h => h.hitMesh);
                const intersects = raycaster.intersectObjects(hitMeshes);

                if (intersects.length > 0) {
                    const hit = intersects[0].object;
                    const system = hit.parent as HeroStarSystem;
                    selectedStarRef.current = system;
                    setSelectedStar(system);
                    engine.selectedStar = system;

                    const targetPos = system.position.clone();
                    const camOffset = engine.camera.position.clone().sub(controls.target).normalize().multiplyScalar(40);
                    engine.camera.position.copy(targetPos).add(camOffset);
                    controls.target.copy(targetPos);
                } else {
                    selectedStarRef.current = null;
                    setSelectedStar(null);
                    engine.selectedStar = null;
                }
            };

            window.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);

            // Instantiate Simulation Coordinator
            const coordinator = new SimulationCoordinator(engine, wsRef.current);
            coordinatorRef.current = coordinator;
            coordinator.onAstrobiologyUpdate = (data) => {
                setAstrobiologyData(data);
            };

            coordinator.onTick = (cosmicAgeVal, delta) => {
                try {
                    registerFrameDeltaRef.current(delta, performance.now());

                    if (isPlayingCosmicRef.current && !isGlobalScrubbingRef.current) {
                        cosmicAgeRef.current = cosmicAgeVal;
                        if (hudRefs.globalTimelineFill.current) {
                            hudRefs.globalTimelineFill.current.style.width = `${(cosmicAgeVal / 14.0) * 100}%`;
                        }
                        if (hudRefs.globalSlider.current) {
                            hudRefs.globalSlider.current.setAttribute('aria-valuenow', cosmicAgeVal.toFixed(2));
                            hudRefs.globalSlider.current.setAttribute('aria-valuetext', `${cosmicAgeVal.toFixed(2)} Billion Years`);
                        }
                        if (Math.floor(engine.appTime * 2) !== Math.floor((engine.appTime - delta) * 2)) {
                            setCosmicAge(cosmicAgeVal);
                        }
                    }

                    if (nebulaSystemRef.current) {
                        nebulaSystemRef.current.update(delta, engine.appTime);
                    }

                    controls.update();

                    if (hudRefs.hudX.current) hudRefs.hudX.current.innerText = engine.camera.position.x.toFixed(4);
                    if (hudRefs.hudY.current) hudRefs.hudY.current.innerText = engine.camera.position.y.toFixed(4);
                    if (hudRefs.hudZ.current) hudRefs.hudZ.current.innerText = engine.camera.position.z.toFixed(4);
                    if (hudRefs.hudAge.current) hudRefs.hudAge.current.innerText = cosmicAgeVal.toFixed(2);

                    if (selectedStarRef.current) {
                        const s = selectedStarRef.current;
                        const phaseStrMap: Record<number, string> = {
                            0: 'nebula',
                            1: 'protostar',
                            2: 'main_sequence',
                            3: 'red_giant',
                            4: 'supernova',
                            5: 'remnant'
                        };
                        const sPhase = phaseStrMap[s.phase] || 'main_sequence';
                        
                        if (uiRefs.phase.current) uiRefs.phase.current.innerText = sPhase.replace('_', ' ').toUpperCase();
                        if (uiRefs.temp.current) uiRefs.temp.current.innerText = Math.round(s.currentTemp).toLocaleString();
                        if (uiRefs.mass.current) uiRefs.mass.current.innerText = s.mass.toFixed(2);
                        if (uiRefs.age.current) uiRefs.age.current.innerText = s.currentRealAge.toFixed(1);
                        if (uiRefs.lum.current) uiRefs.lum.current.innerText = s.currentLum.toFixed(3);
                        
                        const perc = Math.round(s.t * 100);
                        if (uiRefs.timelineFill.current) uiRefs.timelineFill.current.style.width = `${perc}%`;
                        if (uiRefs.stellarSlider.current) {
                            uiRefs.stellarSlider.current.setAttribute('aria-valuenow', perc.toString());
                            uiRefs.stellarSlider.current.setAttribute('aria-valuetext', `${perc}% of Stellar Lifecycle (${sPhase})`);
                        }
                    }
                } catch (err: any) {
                    console.error('[AetherGenesis] Tick callback error:', err);
                    setFatalError((prev) => prev || (err.message || 'Unknown render error'));
                }
            };

            // Start the engine playhead and rendering loop
            engine.start();

            const handleResize = () => {
                engine.resize(window.innerWidth, window.innerHeight);
            };

            window.addEventListener('resize', handleResize);

            return () => {
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('pointerdown', onPointerDown);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                
                engine.stop();

                if (nbodyWorkerRef.current) {
                    nbodyWorkerRef.current.terminate();
                    nbodyWorkerRef.current = null;
                }

                if (controlsRef.current) {
                    controlsRef.current.dispose();
                    controlsRef.current = null;
                }

                if (nebulaSystemRef.current) {
                    nebulaSystemRef.current.dispose();
                    nebulaSystemRef.current = null;
                }

                if (coordinatorRef.current) {
                    coordinatorRef.current.dispose();
                    coordinatorRef.current = null;
                }

                engine.dispose();
                engineRef.current = null;
            };
        } catch (err: any) {
            setFatalError(err.message);
        }
    // Engine mount effect: run once. Dynamic values are read from refs
    // (selectedStarRef, physicsRef, etc.); re-running would dispose and
    // re-init Three.js incorrectly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync selectedStar central mass to worker and engine
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.selectedStar = selectedStar;
        }
        if (selectedStar && nbodyWorkerRef.current) {
            nbodyWorkerRef.current.postMessage({
                type: 'UPDATE_CENTRAL_MASS',
                payload: { centralMass_solar: selectedStar.mass }
            });
        }
    }, [selectedStar]);

    // Sync play/pause cosmic to engine
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.isPlayingCosmic = isPlayingCosmic;
        }
    }, [isPlayingCosmic]);

    // Wrapped scrub handlers to sync to engine properties
    const wrappedOnGlobalScrubStart = useCallback((e: React.PointerEvent) => {
        if (engineRef.current) engineRef.current.isGlobalScrubbing = true;
        onGlobalScrubStart(e);
    }, [onGlobalScrubStart]);

    const wrappedOnGlobalScrubMove = useCallback((e: React.PointerEvent) => {
        onGlobalScrubMove(e);
        if (engineRef.current) {
            engineRef.current.cosmicAge = cosmicAgeRef.current;
        }
    }, [onGlobalScrubMove, cosmicAgeRef]);

    const wrappedOnGlobalScrubEnd = useCallback(() => {
        if (engineRef.current) engineRef.current.isGlobalScrubbing = false;
        onGlobalScrubEnd();
    }, [onGlobalScrubEnd]);

    const wrappedOnScrubStart = useCallback((e: React.PointerEvent) => {
        if (engineRef.current) engineRef.current.isScrubbing = true;
        onScrubStart(e);
    }, [onScrubStart]);

    const wrappedOnScrubMove = useCallback((e: React.PointerEvent) => {
        onScrubMove(e);
    }, [onScrubMove]);

    const wrappedOnScrubEnd = useCallback(() => {
        if (engineRef.current) engineRef.current.isScrubbing = false;
        onScrubEnd();
    }, [onScrubEnd]);

    return {
        selectedStar,
        setSelectedStar,
        isPaused,
        setIsPaused,
        fatalError,
        setFatalError,
        hudRefs,
        uiRefs,
        physics,
        setPhysics,
        cosmicAge,
        setCosmicAge,
        isPlayingCosmic,
        setIsPlayingCosmic,
        isConstantsOpen,
        setIsConstantsOpen,
        currentTier, 
        fps, 
        showTierDownIndicator, 
        diagnosticsEnabled,
        setDiagnosticsEnabled,
        diagnostics,
        resetDiagnostics,
        numHeroStars: engineRef.current?.activeHeroStarCount ?? getNumStarsForTier(currentTier),
        onScrubStart: wrappedOnScrubStart,
        onScrubMove: wrappedOnScrubMove,
        onScrubEnd: wrappedOnScrubEnd,
        onGlobalScrubStart: wrappedOnGlobalScrubStart,
        onGlobalScrubMove: wrappedOnGlobalScrubMove,
        onGlobalScrubEnd: wrappedOnGlobalScrubEnd,
        onKeyDown: (e: React.KeyboardEvent, global: boolean) => {
            const k = e.key;
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) return;
            e.preventDefault();
            if (global) {
                let a = k==='Home'?0 : k==='End'?14 : cosmicAgeRef.current+(k==='ArrowLeft'?-0.1:0.1);
                a = Math.max(0, Math.min(14, a));
                setCosmicAge(a); cosmicAgeRef.current = a;
                if (engineRef.current) {
                    engineRef.current.cosmicAge = a;
                }
                const formattedAge = a.toFixed(2);
                e.currentTarget.setAttribute('aria-valuenow', formattedAge);
                e.currentTarget.setAttribute('aria-valuetext', `${formattedAge} Billion Years`);
            } else if (selectedStarRef.current) {
                const t = k==='Home'?0 : k==='End'?1 : selectedStarRef.current.t+(k==='ArrowLeft'?-0.01:0.01);
                selectedStarRef.current.t = Math.max(0, Math.min(1, t));
                const perc = Math.round(selectedStarRef.current.t * 100);
                e.currentTarget.setAttribute('aria-valuenow', perc.toString());
                e.currentTarget.setAttribute('aria-valuetext', `${perc}% of Stellar Lifecycle (${PHASE_NAMES[selectedStarRef.current.phase]})`);
            }
        },
        currentSeed: encodeSeed(physics),
        resetCamera,
        centerOnStar,
        timeScale,
        setTimeScale,
        astrobiologyData,
        isCatalogOpen,
        setIsCatalogOpen,
        loadStarPreset,
        addBodyToSimulation,
        engineRef,
        camera: engineRef.current?.camera ?? null,
        heroStars: engineRef.current?.heroStars ?? []
    };
}
