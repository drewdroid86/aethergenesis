import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { NebulaSystem } from '../../rendering/systems/NebulaSystem';
import { PHASE_NAMES } from '../../core/constants';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../../types/physics';
import { detectPerformanceTier, getNumStarsForTier } from '../../utils/performance';
import { AstrobiologyEngine } from '../../simulation/AstrobiologyEngine';
import { OrbitalBody, keplerianToCartesian } from '../../simulation/OrbitalMechanics';
import { computeSpectralClass, StellarPhase } from '../../simulation/StellarPhysics';

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
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
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
    }, [physics]);

    // Cosmic Age & Time Scale State
    const [timeScale, setTimeScale] = useState<'cosmic' | 'realtime'>('cosmic');
    const timeScaleRef = useRef(timeScale);
    useEffect(() => { timeScaleRef.current = timeScale; }, [timeScale]);

    // Sync worker time scale when timeScale state changes
    useEffect(() => {
        if (nbodyWorkerRef.current) {
            const dt = timeScale === 'cosmic'
                ? (1.0 / 60) * 200000000 // 200M yrs per sec at 60Hz
                : (1.0 / 60) * 1000;      // 1000 yrs per sec at 60Hz
            nbodyWorkerRef.current.postMessage({
                type: 'UPDATE_TIMESTEP',
                payload: { dt_yr: dt }
            });
        }
    }, [timeScale]);

    // Performance State Owned by Main Hook for Rebuilding
    const [currentTier, setCurrentTier] = useState<'low' | 'medium' | 'high' | 'ultra'>('medium');
    const currentTierRef = useRef(currentTier);

    // Astrobiology UI State
    const [astrobiologyData, setAstrobiologyData] = useState<any[]>([]);

    // UI Panel State
    const [isConstantsOpen, setIsConstantsOpen] = useState(false);

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
    const astrobiologyEngineRef = useRef<AstrobiologyEngine | null>(null);
    const lastAnalysisTimeRef = useRef(0);

    const disposeStarSystem = (star: HeroStarSystem) => {
        star.dispose();
    };

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
        isScrubbingRef,
        centerOnStar,
        resetCamera,
        onScrubStart,
        onScrubMove,
        onScrubEnd
    } = useStarSelection({
        engineRef,
        controlsRef
    });

    const rebuildStarfieldGeometry = useCallback(() => {
        if (!engineRef.current || !engineRef.current.scene) return;

        // Dispose replaces every HeroStarSystem; drop selection so UI/refs
        // never point at disposed objects.
        setSelectedStar(null);

        engineRef.current.heroStars.forEach((star) => {
            engineRef.current?.scene.remove(star);
            disposeStarSystem(star);
        });
        engineRef.current.heroStars = [];

        const count = getNumStarsForTier(currentTierRef.current);
        engineRef.current.createHeroStars(count, physicsRef.current);
        engineRef.current.activeHeroStarCount = count;
    }, [setSelectedStar]);

    const {
        currentTier: _tier,
        fps,
        showTierDownIndicator,
        registerFrameDelta,
    } = usePerformanceAutoTuning({
        rebuildStarfieldGeometry
    });

    // Sync performance auto-tuning tier to our local state
    useEffect(() => {
        if (_tier !== currentTierRef.current) {
            currentTierRef.current = _tier;
            setCurrentTier(_tier);
        }
    }, [_tier]);

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
        const initialTier = detectPerformanceTier();
        currentTierRef.current = initialTier;
        setCurrentTier(initialTier);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        if (engineRef.current) return; // Prevent double initialization

        try {
            const engine = new Engine(containerRef.current);
            engineRef.current = engine;

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
                    }
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
                        dt_yr: 1.0 / 365.25
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
            let lastAnimationTime = performance.now();
            let lastStateSendTime = 0;

            const animate = () => {
                frameId = requestAnimationFrame(animate);
                try {
                    const currentTime = performance.now();
                    const delta = Math.max(0.001, Math.min((currentTime - lastAnimationTime) / 1000, 0.05)); 
                    lastAnimationTime = currentTime;

                    registerFrameDelta(delta, currentTime);

                    if (isPlayingCosmicRef.current && !isGlobalScrubbingRef.current) {
                        cosmicAgeRef.current += timeScaleRef.current === 'cosmic' ? delta * 0.2 : (delta / 31557600) / 1e9; 
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
                    engine.update(delta, selectedStarRef.current, isScrubbingRef.current, physicsRef.current, cosmicAgeRef.current, timeScaleRef.current, nbodyBufferRef.current);
                    
                    // Send simulation state to WebSocket server at 5Hz (every 200ms)
                    if (currentTime - lastStateSendTime > 200) {
                        if (engineRef.current) {
                            const star = selectedStarRef.current || engineRef.current.heroStars[0];
                            if (star) {
                                const phaseStrMap: Record<number, StellarPhase> = {
                                    0: 'nebula',
                                    1: 'protostar',
                                    2: 'main_sequence',
                                    3: 'red_giant',
                                    4: 'supernova',
                                    5: 'remnant'
                                };
                                const perStarState = {
                                    id: star.physicsId,
                                    initialMass_solar: star.mass,
                                    metallicity_Z: 0.02,
                                    age_yr: star.currentRealAge * 1e6,
                                    mass_solar: star.mass,
                                    luminosity_solar: star.currentLum,
                                    radius_solar: Math.pow(star.mass, 0.8),
                                    temperature_K: star.currentTemp,
                                    phase: (phaseStrMap[star.phase] || 'main_sequence'),
                                    spectralClass: computeSpectralClass(star.currentTemp),
                                    absoluteMagnitude: 4.83 - 2.5 * Math.log10(Math.max(star.currentLum, 1e-10)),
                                    hrPosition: {
                                        logT: Math.log10(Math.max(star.currentTemp, 1)),
                                        logL: Math.log10(Math.max(star.currentLum, 1e-10))
                                    },
                                    sim_time_yr: engine.appTime * 1e6
                                };

                                // Extract planetary system orbital state
                                const orbitalStates: any[] = [];
                                const buffer = nbodyBufferRef.current;
                                if (buffer) {
                                    const numBodies = buffer.length / 7;
                                    const G_M = 4.0 * Math.PI * Math.PI * perStarState.mass_solar;
                                    for (let i = 0; i < numBodies; i++) {
                                        const x = buffer[i * 7 + 0];
                                        const y = buffer[i * 7 + 1];
                                        const z = buffer[i * 7 + 2];
                                        const vx = buffer[i * 7 + 3];
                                        const vy = buffer[i * 7 + 4];
                                        const vz = buffer[i * 7 + 5];
                                        const typeNum = buffer[i * 7 + 6];
                                        
                                        const r = Math.sqrt(x*x + y*y + z*z);
                                        const vSq = vx*vx + vy*vy + vz*vz;
                                        
                                        let a = 1.0;
                                        if (G_M > 0 && r > 0) {
                                            const invA = 2.0 / r - vSq / G_M;
                                            a = invA > 0 ? 1.0 / invA : 9999;
                                        }

                                        const p = star.planetarySystem?.bodies[i];
                                        const bodyType = p ? (p.type === 1 ? 'gas_giant' : p.type === 2 ? 'ice' : p.type === 3 ? 'lava' : p.type === 4 ? 'ocean' : p.type === 5 ? 'desert' : p.type === 6 ? 'jungle' : 'rocky') : 'rocky';

                                        orbitalStates.push({
                                            body_id: `body_${i}`,
                                            body_type: bodyType,
                                            position_au: { x, y, z },
                                            velocity_au_yr: { vx, vy, vz },
                                            semi_major_axis_au: a,
                                            hz_status: a < 10 ? 'inside' : a > 25 ? 'outside' : 'in_zone',
                                            coma_active: typeNum === 1 && r < 3.0,
                                            tail_vector: typeNum === 1 && r < 2.5 ? { x, y, z } : null,
                                            sim_time_yr: engine.appTime * 1e6
                                        });
                                    }
                                }
                                
                                // Assemble astrobiology states using the AstrobiologyEngine
                                if (!astrobiologyEngineRef.current) {
                                    astrobiologyEngineRef.current = new AstrobiologyEngine();
                                }
                                
                                const astrobiologyStates: any[] = [];
                                const deltaTime_yr = timeScaleRef.current === 'cosmic' ? delta * 200000000 : delta * 1000;
                                
                                // BOLT: Pre-calculated constants for planet estimation
                                const mass_earth = 5.97e24;
                                const r_earth = 6371000;
                                const simTimeYr = engine.appTime * 1e6;
                                let maxK = 0;

                                for (let i = 0; i < orbitalStates.length; i++) {
                                    const o = orbitalStates[i];
                                    
                                    // Estimate physical properties based on body type
                                    let mass = mass_earth;
                                    let radius = r_earth;
                                    let albedo = 0.3;
                                    
                                    if (o.body_type === 'gas_giant') {
                                        mass *= 317;
                                        radius *= 11;
                                        albedo = 0.5;
                                    } else if (o.body_type === 'ice') {
                                        mass *= 15;
                                        radius *= 4;
                                        albedo = 0.6;
                                    } else if (o.body_type === 'lava') {
                                        mass *= 0.8;
                                        radius *= 0.9;
                                        albedo = 0.1;
                                    } else if (o.body_type === 'desert') {
                                        mass *= 0.5;
                                        radius *= 0.8;
                                        albedo = 0.4;
                                    } else if (o.body_type === 'ocean') {
                                        mass *= 1.2;
                                        radius *= 1.1;
                                        albedo = 0.2;
                                    } else if (o.body_type === 'jungle') {
                                        mass *= 1.0;
                                        radius *= 1.0;
                                        albedo = 0.18;
                                    } else { // rocky or fallback
                                        mass *= 0.6;
                                        radius *= 0.75;
                                        albedo = 0.15;
                                    }
                                    
                                    const habState = astrobiologyEngineRef.current.evaluatePlanet(
                                        o.body_id,
                                        o.semi_major_axis_au,
                                        mass,
                                        radius,
                                        albedo,
                                        perStarState as any,
                                        deltaTime_yr,
                                        o.body_type
                                    );
                                    
                                    // BOLT: Merge maxK calculation into main loop to reduce complexity O(2n) -> O(n)
                                    if (habState.civilizationTier > maxK) {
                                        maxK = habState.civilizationTier;
                                    }

                                    // Make sure sim_time_yr is included
                                    astrobiologyStates.push({
                                        ...habState,
                                        sim_time_yr: simTimeYr
                                    });
                                }

                                engine.highestKardashevTier = maxK;

                                // Avoid rapid React state updates by throttling UI state to 1Hz
                                if (currentTime - (lastAnalysisTimeRef.current || 0) > 1000) {
                                    setAstrobiologyData(astrobiologyStates);
                                    lastAnalysisTimeRef.current = currentTime;
                                }
                                
                                // Update Biosphere & City Light shaders
                                if (star.planetarySystem) {
                                    star.planetarySystem.updateAstrobiology(astrobiologyStates);
                                }

                                // Send simulation state to WebSocket server
                                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                                    const outPayload = {
                                        timestamp_ms: Date.now(),
                                        stellar: perStarState,
                                        orbital: orbitalStates,
                                        astrobiology: astrobiologyStates
                                    };
                                    wsRef.current.send(JSON.stringify({ type: 'state', data: outPayload }));
                                }
                            }
                        }
                        lastStateSendTime = currentTime;
                    }

                    if (nebulaSystemRef.current) {
                        nebulaSystemRef.current.update(delta, engine.appTime);
                    }

                    controls.update();

                    if (hudRefs.hudX.current) hudRefs.hudX.current.innerText = engine.camera.position.x.toFixed(4);
                    if (hudRefs.hudY.current) hudRefs.hudY.current.innerText = engine.camera.position.y.toFixed(4);
                    if (hudRefs.hudZ.current) hudRefs.hudZ.current.innerText = engine.camera.position.z.toFixed(4);
                    if (hudRefs.hudAge.current) hudRefs.hudAge.current.innerText = cosmicAgeRef.current.toFixed(2);

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
                    console.error('[AetherGenesis] Render loop error:', err);
                    setFatalError((prev) => prev || (err.message || 'Unknown render error'));
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
        numHeroStars: engineRef.current?.heroStars.length ?? 0,
        onScrubStart,
        onScrubMove,
        onScrubEnd,
        onGlobalScrubStart,
        onGlobalScrubMove,
        onGlobalScrubEnd,
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
        astrobiologyData
    };
}
