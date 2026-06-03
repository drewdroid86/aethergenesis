import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { NebulaSystem } from '../../rendering/systems/NebulaSystem';
import { PhysicsConstants } from '../../types/physics';
import { getNumStarsForTier } from '../../utils/performance';
import { OrbitalBody, keplerianToCartesian } from '../../simulation/OrbitalMechanics';

export function useSimulationEngine(
    containerRef: React.RefObject<HTMLDivElement | null>,
    physicsRef: React.MutableRefObject<PhysicsConstants>,
    cosmicAgeRef: React.MutableRefObject<number>,
    timeScaleRef: React.MutableRefObject<'cosmic' | 'realtime'>,
    isPausedRef: React.MutableRefObject<boolean>,
    isPlayingCosmicRef: React.MutableRefObject<boolean>,
    isScrubbingRef: React.MutableRefObject<boolean>,
    isGlobalScrubbingRef: React.MutableRefObject<boolean>,
    setCosmicAge: (age: number) => void,
    sendSimulationState: (currentTime: number, delta: number) => void,
    registerFrameDelta: (delta: number, currentTime: number) => void,
    currentTierRef: React.MutableRefObject<'low' | 'medium' | 'high' | 'ultra'>,
    hudRefs: any,
    uiRefs: any,
    engineRef: React.MutableRefObject<Engine | null>,
    selectedStarRef: React.MutableRefObject<HeroStarSystem | null>,
    nbodyBufferRef: React.MutableRefObject<Float32Array | null>
) {
    const nebulaSystemRef = useRef<NebulaSystem | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const [selectedStar, setSelectedStar] = useState<HeroStarSystem | null>(null);
    const [fatalError, setFatalError] = useState<string | null>(null);
    const nbodyWorkerRef = useRef<Worker | null>(null);

    useEffect(() => {
        if (!containerRef.current || engineRef.current) return;

        try {
            const engine = new Engine(containerRef.current);
            engineRef.current = engine;

            const nebulaSystem = new NebulaSystem(engine.scene);
            nebulaSystemRef.current = nebulaSystem;

            const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxDistance = 600;
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
            let isDraggingMouse = false;
            let mouseDownPos = { x: 0, y: 0 };

            const onPointerDown = (e: PointerEvent) => {
                isDraggingMouse = false;
                mouseDownPos = { x: e.clientX, y: e.clientY };
            };

            const onPointerMove = (e: PointerEvent) => {
                if (Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5) {
                    isDraggingMouse = true;
                }
            };

            const onPointerUp = (e: PointerEvent) => {
                if (isDraggingMouse || e.button !== 0) return;

                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, engine.camera);

                const hitMeshes = engine.heroStars.filter((s: HeroStarSystem) => s.visible).map((h: HeroStarSystem) => h.hitMesh);
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
                    
                    sendSimulationState(currentTime, delta);

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
                        const state = engine.stellarState;
                        
                        if (uiRefs.phase.current) uiRefs.phase.current.innerText = state.phase.replace('_', ' ').toUpperCase();
                        if (uiRefs.temp.current) uiRefs.temp.current.innerText = Math.round(state.temperature_K).toLocaleString();
                        if (uiRefs.mass.current) uiRefs.mass.current.innerText = state.mass_solar.toFixed(2);
                        if (uiRefs.age.current) uiRefs.age.current.innerText = (state.age_yr / 1e6).toFixed(1);
                        if (uiRefs.lum.current) uiRefs.lum.current.innerText = state.luminosity_solar.toFixed(3);
                        
                        const perc = Math.round(s.t * 100);
                        if (uiRefs.timelineFill.current) uiRefs.timelineFill.current.style.width = `${perc}%`;
                        if (uiRefs.stellarSlider.current) {
                            uiRefs.stellarSlider.current.setAttribute('aria-valuenow', perc.toString());
                            uiRefs.stellarSlider.current.setAttribute('aria-valuetext', `${perc}% of Stellar Lifecycle (${state.phase})`);
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

                if (nebulaSystemRef.current) {
                    nebulaSystemRef.current.dispose();
                    nebulaSystemRef.current = null;
                }

                if (nbodyWorkerRef.current) {
                    nbodyWorkerRef.current.terminate();
                    nbodyWorkerRef.current = null;
                }

                engine.dispose();
                engineRef.current = null;
            };
        } catch (err: any) {
            setFatalError(err.message);
        }
    }, [
        containerRef, physicsRef, cosmicAgeRef, timeScaleRef, isPausedRef, 
        isPlayingCosmicRef, isScrubbingRef, isGlobalScrubbingRef, 
        setCosmicAge, sendSimulationState, registerFrameDelta, hudRefs, uiRefs
    ]);

    const resetCamera = useCallback(() => {
        controlsRef.current?.reset();
    }, []);

    const centerOnStar = useCallback(() => {
        if (selectedStarRef.current && controlsRef.current && engineRef.current) {
            const targetPos = selectedStarRef.current.position.clone();
            const camOffset = engineRef.current.camera.position.clone().sub(controlsRef.current.target).normalize().multiplyScalar(40);
            engineRef.current.camera.position.copy(targetPos).add(camOffset);
            controlsRef.current.target.copy(targetPos);
            controlsRef.current.update();
        }
    }, []);

    return {
        selectedStar,
        setSelectedStar,
        fatalError,
        setFatalError,
        resetCamera,
        centerOnStar,
        controlsRef
    };
}
