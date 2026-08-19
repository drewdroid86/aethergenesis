import { useState, useRef, useCallback, useEffect } from 'react';
import { 
    detectPerformanceTier, 
    FPS_THRESHOLD, 
    CONSECUTIVE_FRAMES_THRESHOLD, 
    FPS_UPGRADE_THRESHOLD, 
    CONSECUTIVE_UPGRADE_FRAMES_THRESHOLD, 
    TIER_COOLDOWN_MS, 
    BANNER_DISPLAY_DURATION, 
    phaseCounters,
    PerformanceTier 
} from '../../utils/performance';
import { Engine } from '../../core/engine';

export interface PerformanceDiagnostics {
    fps: number;
    onePercentLow: number;
    frameTime: number;
    maxFrameTime: number;
    stutterCount: number;
    timeSinceLastStutter: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    memoryUsage: string;
    longTaskCount: number;
    lastLongTaskDuration: number;
    longTasksLog: { duration: number; timestamp: number }[];
    totalHeroStars: number;
    activeHeroStars: number;
    sceneChildren: number;
    nbodyBodiesCount: number;
    geometriesInMemory: number;
    texturesInMemory: number;
    shaderProgramsInMemory: number;
    phaseInits: number;
    phaseDisposals: number;
    blockedDoubleInits: number;
}

interface UsePerformanceAutoTuningProps {
    adjustStarfieldTier?: (tier: PerformanceTier) => void;
    rebuildStarfieldGeometry?: () => void;
    engineRef?: React.MutableRefObject<Engine | null>;
}

export function usePerformanceAutoTuning({ adjustStarfieldTier, rebuildStarfieldGeometry, engineRef }: UsePerformanceAutoTuningProps) {
    const [currentTier, setCurrentTier] = useState<PerformanceTier>(detectPerformanceTier);
    const currentTierRef = useRef(currentTier);
    const [fps, setFps] = useState(0);
    const [showTierDownIndicator, setShowTierDownIndicator] = useState(false);
    
    const fpsHistoryRef = useRef<number[]>([]);
    const lastFpsUpdateTimeRef = useRef(0);
    const consecutiveFramesBelowThresholdRef = useRef(0);
    const consecutiveFramesAboveThresholdRef = useRef(0);
    const tierDownIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTierChangeTimeRef = useRef(0);

    const isDebugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

    // Diagnostics state and refs
    const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
    const [diagnostics, setDiagnostics] = useState<PerformanceDiagnostics>({
        fps: 0,
        onePercentLow: 0,
        frameTime: 0,
        maxFrameTime: 0,
        stutterCount: 0,
        timeSinceLastStutter: Infinity,
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        memoryUsage: 'N/A',
        longTaskCount: 0,
        lastLongTaskDuration: 0,
        longTasksLog: [],
        totalHeroStars: 0,
        activeHeroStars: 0,
        sceneChildren: 0,
        nbodyBodiesCount: 0,
        geometriesInMemory: 0,
        texturesInMemory: 0,
        shaderProgramsInMemory: 0,
        phaseInits: 0,
        phaseDisposals: 0,
        blockedDoubleInits: 0
    });

    const frameTimesRef = useRef<number[]>([]);
    const maxFrameTimeRef = useRef<number>(0);
    const stutterCountRef = useRef<number>(0);
    const lastStutterTimeRef = useRef<number>(0); // PURE INITIALIZATION (fixes React lint issue)
    const lastDiagnosticsUpdateTimeRef = useRef<number>(0);

    // PerformanceObserver longtask monitoring refs
    const longTaskCountRef = useRef<number>(0);
    const lastLongTaskDurationRef = useRef<number>(0);
    const longTasksLogRef = useRef<{ duration: number; timestamp: number }[]>([]);

    const resetDiagnostics = useCallback(() => {
        maxFrameTimeRef.current = 0;
        stutterCountRef.current = 0;
        lastStutterTimeRef.current = window.performance.now();
        frameTimesRef.current = [];
        longTaskCountRef.current = 0;
        lastLongTaskDurationRef.current = 0;
        longTasksLogRef.current = [];

        phaseCounters.inits = 0;
        phaseCounters.disposals = 0;
        phaseCounters.blockedDoubleInits = 0;

        setDiagnostics(prev => ({
            ...prev,
            maxFrameTime: 0,
            stutterCount: 0,
            longTaskCount: 0,
            lastLongTaskDuration: 0,
            longTasksLog: [],
            totalHeroStars: 0,
            activeHeroStars: 0,
            sceneChildren: 0,
            nbodyBodiesCount: 0,
            geometriesInMemory: 0,
            texturesInMemory: 0,
            shaderProgramsInMemory: 0,
            phaseInits: 0,
            phaseDisposals: 0,
            blockedDoubleInits: 0
        }));
    }, []);

    // Observe long tasks (UI-blocking code > 50ms) on the main thread
    useEffect(() => {
        if (typeof PerformanceObserver === 'undefined') return;

        try {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    console.log('[Diagnostics] Long task detected (main thread blocked):', entry.duration, 'ms');
                    
                    const engine = engineRef?.current;
                    const heroStarsCount = engine ? engine.heroStars.length : 0;
                    const activeHeroStarsCount = engine ? engine.activeHeroStarCount : 0;
                    const sceneChildrenCount = engine ? engine.scene.children.length : 0;
                    
                    const nbodyBuffer = engine ? engine.nbodyBuffer : null;
                    const nbodyCount = nbodyBuffer ? nbodyBuffer.length / 7 : 0;
                    
                    const geoCount = engine && engine.renderer ? engine.renderer.info.memory.geometries : 0;
                    const texCount = engine && engine.renderer ? engine.renderer.info.memory.textures : 0;
                    const programsCount = engine && engine.renderer && (engine.renderer.info as any).programs 
                        ? (engine.renderer.info as any).programs.length 
                        : 0;

                    console.log(`[Diagnostics] Suspect collections size:`, {
                        longTasksLogLength: longTasksLogRef.current.length,
                        totalHeroStars: heroStarsCount,
                        activeHeroStars: activeHeroStarsCount,
                        sceneChildren: sceneChildrenCount,
                        nbodyBodiesCount: nbodyCount,
                        geometriesInMemory: geoCount,
                        texturesInMemory: texCount,
                        shaderProgramsInMemory: programsCount
                    });

                    longTaskCountRef.current++;
                    stutterCountRef.current++; // Both incremented by the observer!
                    lastStutterTimeRef.current = window.performance.now();
                    lastLongTaskDurationRef.current = entry.duration;

                    if (entry.duration > maxFrameTimeRef.current) {
                        maxFrameTimeRef.current = entry.duration;
                    }

                    const log = longTasksLogRef.current;
                    log.push({ duration: entry.duration, timestamp: window.performance.now() });
                    if (log.length > 15) {
                        log.shift();
                    }
                });
            });
            observer.observe({ entryTypes: ['longtask'] });
            return () => observer.disconnect();
        } catch (e) {
            console.warn('PerformanceObserver for longtask is not supported:', e);
        }
    }, [engineRef]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement;
            if (active && (
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                (active as HTMLElement).isContentEditable ||
                active.closest('[contenteditable="true"]')
            )) {
                return;
            }

            if (e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }

            if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                setDiagnosticsEnabled(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleTierChange = useCallback((newTier: PerformanceTier) => {
        if (newTier === currentTierRef.current) return;

        const previousTier = currentTierRef.current;
        currentTierRef.current = newTier;
        setCurrentTier(newTier);

        const tiers: PerformanceTier[] = ['low', 'medium', 'high', 'ultra'];
        const isDowngrade = tiers.indexOf(newTier) < tiers.indexOf(previousTier);
        if (isDowngrade) {
            setShowTierDownIndicator(true); 

            if (tierDownIndicatorTimeoutRef.current) {
                clearTimeout(tierDownIndicatorTimeoutRef.current);
            }
            tierDownIndicatorTimeoutRef.current = setTimeout(() => {
                setShowTierDownIndicator(false);
            }, BANNER_DISPLAY_DURATION);
        }

        if (adjustStarfieldTier) {
            adjustStarfieldTier(newTier);
        } else if (rebuildStarfieldGeometry) {
            rebuildStarfieldGeometry();
        }
    }, [adjustStarfieldTier, rebuildStarfieldGeometry]);

    useEffect(() => {
        const initialTier = detectPerformanceTier();
        if (currentTierRef.current !== initialTier) {
            handleTierChange(initialTier);
        }
    }, [handleTierChange]);

    const registerFrameDelta = useCallback((delta: number, currentTime: number) => {
        const fpsHistory = fpsHistoryRef.current;
        
        const currentAverage = fpsHistory.length > 0
            ? fpsHistory.reduce((sum, val) => sum + val, 0) / fpsHistory.length
            : 60;

        let sample = delta > 0 ? 1 / delta : 0;
        if (fpsHistory.length > 0 && sample > 3 * currentAverage) {
            sample = Math.min(240, 3 * currentAverage);
        } else {
            sample = Math.min(240, sample);
        }

        fpsHistory.push(sample); 
        if (fpsHistory.length > 60) fpsHistory.shift(); 
        
        const currentFps = fpsHistory.reduce((sum, val) => sum + val, 0) / fpsHistory.length;
        if (currentTime - lastFpsUpdateTimeRef.current > 1000) {
            setFps(Math.round(currentFps));
            lastFpsUpdateTimeRef.current = currentTime;
        }

        // Diagnostics tracking
        const frameTimes = frameTimesRef.current;
        const currentFrameTime = delta * 1000;
        frameTimes.push(currentFrameTime);
        if (frameTimes.length > 120) frameTimes.shift();

        if (currentFrameTime > maxFrameTimeRef.current) {
            maxFrameTimeRef.current = currentFrameTime;
        }

        // Throttle React state updates to 5Hz to prevent layout thrashing/GC stutter
        if ((diagnosticsEnabled || isDebugMode) && (currentTime - lastDiagnosticsUpdateTimeRef.current > 200)) {
            let drawCalls = 0;
            let triangles = 0;
            let geometries = 0;
            let textures = 0;
            let totalHeroStars = 0;
            let activeHeroStars = 0;
            let sceneChildren = 0;
            let nbodyBodiesCount = 0;
            let geometriesInMemory = 0;
            let texturesInMemory = 0;
            let shaderProgramsInMemory = 0;

            const engine = engineRef?.current;
            if (engine) {
                totalHeroStars = engine.heroStars.length;
                activeHeroStars = engine.activeHeroStarCount;
                sceneChildren = engine.scene.children.length;
                
                const nbodyBuffer = engine.nbodyBuffer;
                nbodyBodiesCount = nbodyBuffer ? nbodyBuffer.length / 7 : 0;

                if (engine.renderer) {
                    drawCalls = engine.renderer.info.render.calls;
                    triangles = engine.renderer.info.render.triangles;
                    geometries = engine.renderer.info.memory.geometries;
                    textures = engine.renderer.info.memory.textures;
                    geometriesInMemory = engine.renderer.info.memory.geometries;
                    texturesInMemory = engine.renderer.info.memory.textures;
                    shaderProgramsInMemory = (engine.renderer.info as any).programs 
                        ? (engine.renderer.info as any).programs.length 
                        : 0;
                }
            }

            let memoryUsage = 'N/A';
            if (typeof window !== 'undefined' && (window.performance as any).memory) {
                memoryUsage = ((window.performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
            }

            let onePercentLow = 0;
            if (frameTimes.length > 0) {
                const sortedTimes = [...frameTimes].sort((a, b) => b - a);
                const index = Math.min(sortedTimes.length - 1, Math.max(0, Math.floor(sortedTimes.length * 0.01)));
                const onePercentTime = sortedTimes[index];
                onePercentLow = onePercentTime > 0 ? Math.round(1000 / onePercentTime) : 0;
            }

            setDiagnostics({
                fps: Math.round(currentFps),
                onePercentLow,
                frameTime: currentFrameTime,
                maxFrameTime: maxFrameTimeRef.current,
                stutterCount: stutterCountRef.current,
                timeSinceLastStutter: currentTime - lastStutterTimeRef.current,
                drawCalls,
                triangles,
                geometries,
                textures,
                memoryUsage,
                longTaskCount: longTaskCountRef.current,
                lastLongTaskDuration: lastLongTaskDurationRef.current,
                longTasksLog: [...longTasksLogRef.current],
                totalHeroStars,
                activeHeroStars,
                sceneChildren,
                nbodyBodiesCount,
                geometriesInMemory,
                texturesInMemory,
                shaderProgramsInMemory,
                phaseInits: phaseCounters.inits,
                phaseDisposals: phaseCounters.disposals,
                blockedDoubleInits: phaseCounters.blockedDoubleInits
            });

            lastDiagnosticsUpdateTimeRef.current = currentTime;
        }

        if (currentFps < FPS_THRESHOLD) {
            consecutiveFramesBelowThresholdRef.current++;
            consecutiveFramesAboveThresholdRef.current = 0;
        } else if (currentFps >= FPS_UPGRADE_THRESHOLD) {
            consecutiveFramesAboveThresholdRef.current++;
            consecutiveFramesBelowThresholdRef.current = 0;
        } else {
            consecutiveFramesBelowThresholdRef.current = 0;
            consecutiveFramesAboveThresholdRef.current = 0;
        }

        const tiers: PerformanceTier[] = ['low', 'medium', 'high', 'ultra'];
        const currentTierIndex = tiers.indexOf(currentTierRef.current);

        if (consecutiveFramesBelowThresholdRef.current >= CONSECUTIVE_FRAMES_THRESHOLD) {
            if (currentTierIndex > 0 && (currentTime - lastTierChangeTimeRef.current > TIER_COOLDOWN_MS)) {
                const newTier = tiers[currentTierIndex - 1];
                handleTierChange(newTier);
                lastTierChangeTimeRef.current = currentTime;
                consecutiveFramesBelowThresholdRef.current = 0; 
            }
        } else if (consecutiveFramesAboveThresholdRef.current >= CONSECUTIVE_UPGRADE_FRAMES_THRESHOLD) {
            if (currentTierIndex < tiers.length - 1 && (currentTime - lastTierChangeTimeRef.current > TIER_COOLDOWN_MS)) {
                const newTier = tiers[currentTierIndex + 1];
                handleTierChange(newTier);
                lastTierChangeTimeRef.current = currentTime;
                consecutiveFramesAboveThresholdRef.current = 0;
            }
        }
    }, [handleTierChange, diagnosticsEnabled, engineRef, isDebugMode]);

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
        registerFrameDelta,
        handleTierChange,
        diagnosticsEnabled,
        setDiagnosticsEnabled,
        diagnostics,
        resetDiagnostics
    };
}
