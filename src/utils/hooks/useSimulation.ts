import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { NebulaSystem } from '../../rendering/systems/NebulaSystem';
import { PHASE_NAMES, PHASES, STELLAR_CONSTANTS } from '../../core/constants';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../../types/physics';
import { getNumStarsForTier, PerformanceTier } from '../../utils/performance';
import { OrbitalBody, buildWorkerBodiesFromOrbits, keplerianToCartesian } from '../../simulation/OrbitalMechanics';
import { PlanetarySystem, PlanetarySystemQueue } from '../../rendering/systems/PlanetarySystem';
import { SimulationCoordinator } from '../../simulation/SimulationCoordinator';
import { actionLog, ingestWorkerEvent } from '../../simulation/ActionLog';
import { buildSpawnBody, type SpawnMode } from '../../simulation/spawnBody';

// Sub-hooks
import { useWebSocket } from './useWebSocket';
import { useCosmicAge } from './useCosmicAge';
import { usePerformanceAutoTuning } from './usePerformanceAutoTuning';
import { useStarSelection } from './useStarSelection';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

/**
 * H-N1 fix — shared n-body re-key for every star-selection path.
 * Rebuilds the worker's bodies with velocities computed under the star's
 * CURRENT phase-aware mass (currentMass ?? mass), materializing a
 * MAIN_SEQUENCE PlanetarySystem synchronously when the creation queue
 * budget left it undefined (e.g. fast cosmic-age scrubs). Extracted
 * verbatim from loadStarPreset so click-select and preset-select share
 * one path and cannot drift apart.
 */
export function rekeyNBodyForStar(star: HeroStarSystem, renderer: THREE.WebGLRenderer | undefined, nbodyWorker: Worker): void {
    // Authoritative phase-aware mass, not the birth mass: remnants
    // and giants must integrate under currentMass (post-mass-loss).
    const rawMass = star.currentMass ?? star.mass;
    const centralMass = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : 1.0;
    // applyPreset() disposes the old PlanetarySystem and only
    // queue-creates its replacement asynchronously, so the fresh
    // proceduralOrbits are not attached yet at this point. Without
    // this step the re-key below always falls through to the
    // mass-only update, keeping stale velocities under the new
    // gravity. Materialize the generated planets synchronously
    // (cancelling the queued duplicate) so the rebuild runs.
    if (!star.planetarySystem && star.phase === PHASES.MAIN_SEQUENCE) {
        PlanetarySystemQueue.cancelCreation(star);
        star.planetarySystem = new PlanetarySystem(star, renderer);
    }
    // Re-key bodies so velocities match the new gravity. Keeping
    // old velocities under a new central mass leaves every orbit
    // at the wrong energy (stale-velocity bug).
    const orbits = star.planetarySystem?.proceduralOrbits;
    if (orbits && orbits.length > 0) {
        const bodies: OrbitalBody[] = buildWorkerBodiesFromOrbits(orbits, centralMass);
        nbodyWorker.postMessage({
            type: 'RESET_BODIES',
            payload: { bodies, centralMass_solar: centralMass }
        });
    } else {
        // M4 fix — the target star has no generated planets (e.g. remnant):
        // RESET with an EMPTY body list so the previous star's bodies cannot
        // persist as phantom planets. Central mass still updates via the
        // RESET payload, so integration continues under the new gravity.
        clearNBodyWorker(nbodyWorker, centralMass);
    }
}

/**
 * Shared clear-worker helper (Fix A #13 deselect path + Fix D M4 planet-less
 * re-key). Posts RESET_BODIES with an EMPTY body list so the worker roster
 * empties instead of retaining the previous star's bodies. The worker applies
 * centralMass_solar when it is positive and emits the (empty) roster, which
 * the feed renders as no planets. Exactly one helper — both paths use this.
 */
export function clearNBodyWorker(nbodyWorker: Worker, centralMass_solar: number = 1.0): void {
    const centralMass = Number.isFinite(centralMass_solar) && centralMass_solar > 0 ? centralMass_solar : 1.0;
    nbodyWorker.postMessage({
        type: 'RESET_BODIES',
        payload: { bodies: [], centralMass_solar: centralMass }
    });
}

/**
 * Dedicated XYZ coordinate refs for one HUD consumer.
 * See the H1 fix note at the ref declarations inside useSimulation.
 */
export interface HudCoordRefs {
    hudX: RefObject<HTMLSpanElement | null>;
    hudY: RefObject<HTMLSpanElement | null>;
    hudZ: RefObject<HTMLSpanElement | null>;
}

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

    // H1 fix — dedicated coordinate refs per consumer. Attaching the same ref
    // object to elements in Hud, YouAreHereBadge, and AttitudeIndicator meant
    // React nulled the shared ref whenever any one of them unmounted (e.g.
    // closing the coordinates drawer), permanently freezing the tick-loop
    // updates for the still-mounted consumers. Each consumer now gets its own
    // set, and the tick loop updates all of them.
    const badgeCoordRefs: HudCoordRefs = {
        hudX: useRef<HTMLSpanElement>(null),
        hudY: useRef<HTMLSpanElement>(null),
        hudZ: useRef<HTMLSpanElement>(null),
    };
    const attitudeCoordRefs: HudCoordRefs = {
        hudX: useRef<HTMLSpanElement>(null),
        hudY: useRef<HTMLSpanElement>(null),
        hudZ: useRef<HTMLSpanElement>(null),
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
    const lastSyncedWorkerMassRef = useRef<number>(1.0);

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
            star.applyPreset(preset, engineRef.current?.renderer, engineRef.current?.cosmicAge, engineRef.current?.physicsConstants);
            if (coordinatorRef.current) {
                coordinatorRef.current.clearHistory(star.physicsId);
            }
            if (nbodyWorkerRef.current) {
                rekeyNBodyForStar(star, engineRef.current?.renderer, nbodyWorkerRef.current);
                const rawMass = star.currentMass ?? star.mass;
                lastSyncedWorkerMassRef.current = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : 1.0;
            }
            // Mirror Tactical Radar contact + Focus [F]: select the preset
            // star so its panels open, then fly the camera to it. Tap and
            // click share this path, so phone and desktop behave the same.
            setSelectedStar(star);
            centerOnStar();
        }
    }, [selectedStarRef, setSelectedStar, centerOnStar]);

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

        // Phase A producer: every catalog spawn is announced to the action log.
        actionLog.logEvent('SPAWN', {
            actorId: newBody.id,
            cosmicAge: engineRef.current?.cosmicAge ?? 0,
            wallTimestamp: Date.now(),
            masses: [newBody.mass_solar],
            positions: [{ ...newBody.position_au }],
            note: `catalog:${newBody.type}`,
        });
    }, [selectedStarRef]);

    /**
     * Phase B producer: spawn a live, gravitating body at a worker-frame AU
     * position (tap-to-spawn path). Defaults to circular-orbit velocity intent;
     * pass mode 'drop' for the Solar Smash straight-in fall (toolbar hookup
     * comes in a later build — no UI for the choice yet). Planet-type spawns
     * render fully; star/black-hole types participate in worker gravity with
     * a default visual (see the TODO in PlanetarySystem.applyRoster).
     * Every spawn emits a SPAWN event with actorId, position, mass, cosmicAge.
     */
    const spawnBodyAt = useCallback((position_au: { x: number; y: number; z: number }, opts?: {
        mode?: SpawnMode;
        bodyType?: OrbitalBody['type'];
        mass_solar?: number;
        radius_km?: number;
    }) => {
        const star = selectedStarRef.current ?? engineRef.current?.heroStars[0];
        if (!star || !nbodyWorkerRef.current) return null;
        // Authoritative phase-aware mass, not the birth mass (stale-velocity bug).
        const rawMass = star.currentMass ?? star.mass;
        const centralMass = Number.isFinite(rawMass) && (rawMass as number) > 0 ? (rawMass as number) : 1.0;
        const body = buildSpawnBody({
            position_au,
            centralMass_solar: centralMass,
            mode: opts?.mode ?? 'orbit',
            bodyType: opts?.bodyType ?? 'planet',
            mass_solar: opts?.mass_solar,
            radius_km: opts?.radius_km,
        });
        nbodyWorkerRef.current.postMessage({
            type: 'ADD_BODY',
            payload: { body }
        });
        actionLog.logEvent('SPAWN', {
            actorId: body.id,
            cosmicAge: engineRef.current?.cosmicAge ?? 0,
            wallTimestamp: Date.now(),
            masses: [body.mass_solar],
            positions: [{ ...body.position_au }],
            note: `tap:${opts?.mode ?? 'orbit'}:${body.type}`,
        });
        return body.id;
    }, [selectedStarRef]);

    // Ref-stable handle so the mount-once pointer handlers below can spawn
    // without re-subscribing (same pattern as registerFrameDeltaRef).
    const spawnBodyAtRef = useRef(spawnBodyAt);
    useEffect(() => {
        spawnBodyAtRef.current = spawnBodyAt;
    }, [spawnBodyAt]);

    /**
     * UI spawn trigger: spawn a gravitating body at a default location
     * (1 AU in worker frame relative to the currently selected star, or the
     * first hero star if none selected). Uses the exact same clamping logic
     * (0.05–100 AU) and worker flow as the tap handler.
     */
    const spawnDefaultBody = useCallback((position_au?: { x: number; y: number; z: number }) => {
        const star = selectedStarRef.current ?? engineRef.current?.heroStars[0];
        if (!star || !nbodyWorkerRef.current) return null;

        let px = position_au?.x ?? 1.0;
        let py = position_au?.y ?? 0.0;
        let pz = position_au?.z ?? 0.0;

        const MAX_SPAWN_AU = 100;
        const MIN_SPAWN_AU = 0.05;
        const r = Math.sqrt(px * px + py * py + pz * pz);
        if (r > MAX_SPAWN_AU) {
            const s = MAX_SPAWN_AU / r;
            px *= s; py *= s; pz *= s;
        } else if (r < MIN_SPAWN_AU) {
            if (r > 1e-9) {
                const s = MIN_SPAWN_AU / r;
                px *= s; py *= s; pz *= s;
            } else {
                px = MIN_SPAWN_AU; py = 0; pz = 0;
            }
        }
        return spawnBodyAtRef.current({ x: px, y: py, z: pz });
    }, []);

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
                    } else if (e.data.type === 'ROSTER') {
                        // Stable-id roster channel (NOT the UPDATE stream):
                        // version-bumped so the engine applies it to the
                        // focused star's system, even a late-created one.
                        if (engineRef.current && Array.isArray(e.data.bodies)) {
                            engineRef.current.nbodyRoster = e.data.bodies;
                            engineRef.current.nbodyRosterVersion++;
                        }
                    } else if (e.data.type === 'SIM_EVENT') {
                        // Physics-event channel: worker arrival order is the
                        // log order — never dropped, never reordered.
                        ingestWorkerEvent(
                            actionLog,
                            e.data.event,
                            engineRef.current?.cosmicAge ?? 0
                        );
                    }
                };

                worker.onerror = (err) => {
                    console.error('[NBodyWorker] Uncaught error:', err);
                };

                // M3: INIT with an EMPTY roster (bodies: [] below). The old
                // hardcoded demo bodies (earth/jupiter/halley) matched no star:
                // until the first click the focus star drew its own planets at
                // the demo positions and the orbit rings baked once from the
                // demo radii. The coordinator tolerates empty buffers
                // (zero-iteration loops) and PlanetarySystem falls back to
                // procedural orbits, so the focus star renders its OWN orbits
                // until the first re-key. Gravity seed: the no-selection
                // fallback star's current mass (irrelevant with zero bodies,
                // but correct for any pre-click spawn).
                const hero0Mass = engine.heroStars[0]?.currentMass ?? engine.heroStars[0]?.mass;
                const centralMass = typeof hero0Mass === 'number' && Number.isFinite(hero0Mass) && hero0Mass > 0 ? hero0Mass : 1.0;
                lastSyncedWorkerMassRef.current = centralMass;
                
                worker.postMessage({
                    type: 'INIT',
                    payload: {
                        bodies: [],
                        centralMass_solar: centralMass,
                        dt_yr: 0.05,
                        isRunning: !isPausedRef.current
                    }
                });

                // M2: recycle/respawn re-key. A star that exhausts its lifecycle
                // resamples mass and rebuilds its roster out from under the
                // worker, which otherwise keeps integrating the PRE-recycle
                // roster under the old mass. Re-key through the SAME shared
                // helper as every selection path (RESET_BODIES with the exact
                // selection-path payload shape — no new message types), and
                // ONLY when the recycled star is the focused one: the worker
                // holds exactly one roster (the focus star's body set), so a
                // background star's recycle must not clobber the live
                // simulation. After a recycle the star is a NEBULA newborn with
                // no planets, so the helper takes its planet-less branch and
                // clears the worker to an empty roster under the post-resample
                // currentMass (synced in recycleToNewGeneration / respawn —
                // never the stale pre-recycle or birth mass, per the H1 fix).
                engine.onStarRecycled = (star) => {
                    const workerNow = nbodyWorkerRef.current;
                    const eng = engineRef.current;
                    if (!workerNow || !eng) return;
                    const focused = eng.selectedStar ?? eng.heroStars[0];
                    if (star === focused) {
                        rekeyNBodyForStar(star, eng.renderer, workerNow);
                        const rawMass = star.currentMass ?? star.mass;
                        lastSyncedWorkerMassRef.current = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : 1.0;
                    }
                };
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
                if (e.target !== engine.renderer.domElement) return;
                if (isDragging || e.button !== 0) return;

                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, engine.camera);

                const hitMeshes = engine.heroStars.slice(0, engine.activeHeroStarCount).filter(h => h.visible && h.t >= 0).map(h => h.hitMesh);
                const intersects = raycaster.intersectObjects(hitMeshes);

                if (intersects.length > 0) {
                    const hit = intersects[0].object;
                    const system = hit.parent as HeroStarSystem;
                    if (nbodyWorkerRef.current) {
                        rekeyNBodyForStar(system, engine.renderer, nbodyWorkerRef.current);
                        const rawMass = system.currentMass ?? system.mass;
                        lastSyncedWorkerMassRef.current = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : 1.0;
                    }
                    selectedStarRef.current = system;
                    setSelectedStar(system);
                    engine.selectedStar = system;

                    const targetPos = system.position.clone();
                    const diff = engine.camera.position.clone().sub(controls.target);
                    const camOffset = diff.lengthSq() > 1e-6
                        ? diff.normalize().multiplyScalar(40)
                        : new THREE.Vector3(0, 0, 40);
                    engine.camera.position.copy(targetPos).add(camOffset);
                    controls.target.copy(targetPos);
                } else {
                    // Empty-space tap → spawn a live n-body body (Phase B).
                    // Primary: intersect the tap ray with the ecliptic (y=0)
                    // plane. Fallback (camera edge-on, ray parallel to the
                    // plane): intersect a camera-facing plane through the
                    // focus star. Worker frame is AU at 12 world units per AU.
                    const focus = selectedStarRef.current ?? engine.heroStars[0];
                    if (focus && nbodyWorkerRef.current) {
                        const ecliptic = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                        const hitPoint = new THREE.Vector3();
                        let world = raycaster.ray.intersectPlane(ecliptic, hitPoint);
                        if (!world) {
                            const camDir = engine.camera.getWorldDirection(new THREE.Vector3());
                            const facing = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, focus.position);
                            world = raycaster.ray.intersectPlane(facing, hitPoint);
                        }
                        if (world) {
                            const ORBIT_SCALE = 12.0;
                            const rel = world.clone().sub(focus.position);
                            // Renderer maps worker (x, y, z) -> world
                            // (x, z, y): invert it back to worker frame.
                            let px = rel.x / ORBIT_SCALE;
                            let py = rel.z / ORBIT_SCALE;
                            let pz = rel.y / ORBIT_SCALE;
                            // Clamp the spawn radius deterministically: past
                            // 100 AU a tap is a misclick, inside 0.05 AU the
                            // circular-orbit speed diverges.
                            const MAX_SPAWN_AU = 100;
                            const MIN_SPAWN_AU = 0.05;
                            const r = Math.sqrt(px * px + py * py + pz * pz);
                            if (r > MAX_SPAWN_AU) {
                                const s = MAX_SPAWN_AU / r;
                                px *= s; py *= s; pz *= s;
                            } else if (r < MIN_SPAWN_AU) {
                                if (r > 1e-9) {
                                    const s = MIN_SPAWN_AU / r;
                                    px *= s; py *= s; pz *= s;
                                } else {
                                    px = MIN_SPAWN_AU; py = 0; pz = 0;
                                }
                            }
                            spawnBodyAtRef.current({ x: px, y: py, z: pz });
                        }
                    }
                }
            };

            window.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);

            // Instantiate Simulation Coordinator
            // H3 fix: pass a getter, not a snapshot — useWebSocket replaces
            // wsRef.current on reconnect, and a captured socket would silently
            // stop the 5 Hz sim-state feed after the first reconnect.
            const coordinator = new SimulationCoordinator(engine, () => wsRef.current);
            coordinatorRef.current = coordinator;
            coordinator.onAstrobiologyUpdate = (data) => {
                setAstrobiologyData(data);
            };

            coordinator.onTick = (cosmicAgeVal, delta) => {
                try {
                    registerFrameDeltaRef.current(delta, performance.now());

                    const focusedStar = selectedStarRef.current ?? engine.heroStars[0];
                    if (focusedStar && nbodyWorkerRef.current) {
                        const currentMass = focusedStar.currentMass ?? focusedStar.mass;
                        const lastSynced = lastSyncedWorkerMassRef.current;
                        if (
                            Number.isFinite(currentMass) &&
                            currentMass > 0 &&
                            (lastSynced <= 0 || Math.abs(currentMass - lastSynced) / lastSynced > 0.01)
                        ) {
                            lastSyncedWorkerMassRef.current = currentMass;
                            nbodyWorkerRef.current.postMessage({
                                type: 'UPDATE_CENTRAL_MASS',
                                payload: { centralMass_solar: currentMass }
                            });
                        }
                    }

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

                    // H1 fix: update every consumer's dedicated coordinate refs.
                    // Sharing one ref object across conditionally-mounted
                    // elements lets React null it on unmount, permanently
                    // freezing these readouts for still-mounted consumers.
                    const coordRefSets: HudCoordRefs[] = [hudRefs, badgeCoordRefs, attitudeCoordRefs];
                    for (const coordRefs of coordRefSets) {
                        if (coordRefs.hudX.current) coordRefs.hudX.current.innerText = engine.camera.position.x.toFixed(4);
                        if (coordRefs.hudY.current) coordRefs.hudY.current.innerText = engine.camera.position.y.toFixed(4);
                        if (coordRefs.hudZ.current) coordRefs.hudZ.current.innerText = engine.camera.position.z.toFixed(4);
                    }
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
                        
                        const maxT = STELLAR_CONSTANTS.PHASE_BOUNDARIES.LIFECYCLE_MAX;
                        const perc = Math.min(100, Math.max(0, Math.round((s.t / maxT) * 100)));
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

    // #13 fix — deselect re-keys the worker to the coordinator's
    // no-selection fallback (heroStars[0]) so the previously selected
    // star's bodies cannot persist as stale state. Every deselect
    // affordance (Escape in useKeyboardShortcuts, the InspectPanel and
    // AstrobiologyPanel close buttons) funnels through
    // setSelectedStar(null), so this star->null transition is the single
    // deselect path. Select transitions are untouched: click-select and
    // preset-select already re-key with currentMass (H-N1) before this runs.
    const prevSelectedStarRef = useRef<HeroStarSystem | null>(null);
    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.selectedStar = selectedStar;
        }
        if (prevSelectedStarRef.current !== null && selectedStar === null) {
            const engine = engineRef.current;
            const worker = nbodyWorkerRef.current;
            if (engine && worker) {
                // Same shared re-key the selection path uses, targeting the
                // coordinator's fallback (SimulationCoordinator falls back to
                // engine.selectedStar || engine.heroStars[0]).
                const fallback = engine.heroStars[0];
                if (fallback) {
                    rekeyNBodyForStar(fallback, engine.renderer, worker);
                    const rawMass = fallback.currentMass ?? fallback.mass;
                    lastSyncedWorkerMassRef.current = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : 1.0;
                } else {
                    clearNBodyWorker(worker);
                    lastSyncedWorkerMassRef.current = 1.0;
                }
            }
        }
        prevSelectedStarRef.current = selectedStar;
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
        badgeCoordRefs,
        attitudeCoordRefs,
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
                const maxT = STELLAR_CONSTANTS.PHASE_BOUNDARIES.LIFECYCLE_MAX;
                const t = k==='Home'?0 : k==='End'?maxT : selectedStarRef.current.t+(k==='ArrowLeft'?-0.015:0.015);
                selectedStarRef.current.t = Math.max(0, Math.min(maxT, t));
                const perc = Math.min(100, Math.max(0, Math.round((selectedStarRef.current.t / maxT) * 100)));
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
        spawnBodyAt,
        spawnDefaultBody,
        spawnBody: spawnDefaultBody,
        engineRef,
        camera: engineRef.current?.camera ?? null,
        heroStars: engineRef.current?.heroStars ?? []
    };
}

// Default export mirrors the named H-N1 helper so the e2e contract test can
// default-import it directly without mounting the hook.
export default rekeyNBodyForStar;
