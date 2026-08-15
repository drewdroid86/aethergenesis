import React, { useRef, useState, useEffect } from 'react';
import { Check, Copy, Crosshair, Navigation, Pause, Play, Search, Volume2, VolumeX } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine';

interface HudProps {
    uiRefs: {
        hudX: React.RefObject<HTMLSpanElement | null>;
        hudY: React.RefObject<HTMLSpanElement | null>;
        hudZ: React.RefObject<HTMLSpanElement | null>;
        hudAge: React.RefObject<HTMLSpanElement | null>;
        globalTimelineFill: React.RefObject<HTMLDivElement | null>;
        globalSlider: React.RefObject<HTMLDivElement | null>;
    };
    cosmicAge: number;
    isPlayingCosmic: boolean;
    setIsPlayingCosmic: (playing: boolean) => void;
    onGlobalScrubStart: (e: React.PointerEvent) => void;
    onGlobalScrubMove: (e: React.PointerEvent) => void;
    onGlobalScrubEnd: () => void;
    onKeyDown: (e: React.KeyboardEvent, isGlobal: boolean) => void;
    resetCamera: () => void;
    centerOnStar: () => void;
    performance: {
        tier: string;
        numStars: number;
        fps: number;
        showIndicator: boolean;
        diagnosticsEnabled?: boolean;
        setDiagnosticsEnabled?: (enabled: boolean) => void;
        diagnostics?: {
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
        };
        resetDiagnostics?: () => void;
    };
    currentSeed: string;
    timeScale: 'cosmic' | 'realtime';
    setTimeScale: (scale: 'cosmic' | 'realtime') => void;
    onOpenCatalog?: () => void;
}

export const Hud: React.FC<HudProps> = ({ 
    uiRefs, 
    cosmicAge, 
    isPlayingCosmic, 
    setIsPlayingCosmic,
    timeScale,
    setTimeScale,
    onGlobalScrubStart,
    onGlobalScrubMove,
    onGlobalScrubEnd,
    onKeyDown,
    resetCamera,
    centerOnStar,
    performance,
    currentSeed,
    onOpenCatalog
}) => {
    const isDebugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
    const [copied, setCopied] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [idCopied, setIdCopied] = useState(false);
    const [announcement, setAnnouncement] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const isFirstRenderRef = useRef(true);

    useEffect(() => {
        if (isFirstRenderRef.current) {
            isFirstRenderRef.current = false;
            return;
        }
        announce(`Timescale changed to ${timeScale}`);
    }, [timeScale]);

    const announce = (msg: string) => {
        setAnnouncement(msg);
        setTimeout(() => setAnnouncement(''), 3000);
    };

    const copyCoordinates = () => {
        audioEngine.playUiClick();
        const x = uiRefs.hudX.current?.innerText || '0.0000';
        const y = uiRefs.hudY.current?.innerText || '0.0000';
        const z = uiRefs.hudZ.current?.innerText || '0.0000';
        const coords = `X: ${x}, Y: ${y}, Z: ${z}`;

        navigator.clipboard.writeText(coords).then(() => {
            setCopied(true);
            announce('Coordinates copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const copyUniverseId = () => {
        audioEngine.playUiClick();
        navigator.clipboard.writeText(currentSeed).then(() => {
            setIdCopied(true);
            announce('Universe ID copied to clipboard');
            setTimeout(() => setIdCopied(false), 2000);
        });
    };

    const shareUniverse = () => {
        audioEngine.playUiClick();
        const url = new URL(window.location.href);
        url.searchParams.set('seed', currentSeed);
        navigator.clipboard.writeText(url.toString()).then(() => {
            setShareCopied(true);
            announce('Universe Share URL copied to clipboard');
            setTimeout(() => setShareCopied(false), 2000);
        });
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            // Ignored
        }
        onGlobalScrubStart(e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDragging) onGlobalScrubMove(e);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            // Ignored
        }
        onGlobalScrubEnd();
    };

    return (
        <>
            {/* Top HUD */}
            <nav className="absolute top-0 w-full p-4 md:p-8 flex justify-between items-start z-20 pointer-events-none">
                <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_#C084FC]"></div>
                    <h1 className="text-xl font-bold tracking-[0.3em] uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    ÆTHERGENESIS
                    </h1>
                </div>
                <span className="text-[10px] text-[#7EB8FF]/70 uppercase tracking-[0.2em] ml-6">
                    Simulation Phase 02: Stellar Genesis
                </span>
                </div>
                
                <div className="flex items-center gap-8 bg-[rgba(8,8,20,0.6)] backdrop-blur-md border border-[rgba(126,184,255,0.2)] rounded-full px-6 py-3">
                <div className="flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Background Mass</span>
                    <span className="font-mono text-sm">{performance.numStars.toLocaleString()} <span className="text-[#C084FC]">★</span></span>
                </div>
                <div className="w-[1px] h-6 bg-[rgba(126,184,255,0.2)]"></div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Universe ID</span>
                    <button
                        onClick={copyUniverseId}
                        className="font-mono text-sm uppercase text-indigo-300 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded relative group/uid pointer-events-auto"
                        aria-label={idCopied ? "Universe ID Copied" : "Copy Universe ID"}
                    >
                        <span className={`absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] transition-opacity whitespace-nowrap ${idCopied ? 'opacity-100' : 'opacity-0 group-hover/uid:opacity-100 group-focus-visible/uid:opacity-100'}`}>
                            {idCopied ? 'Copied!' : 'Copy'}
                        </span>
                        {currentSeed.substring(0, 8)}
                    </button>
                </div>
                <div className="w-[1px] h-6 bg-[rgba(126,184,255,0.2)]"></div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Engine Tier</span>
                    <span className="font-mono text-sm uppercase text-indigo-300">{performance.tier}</span>
                </div>
                <div className="w-[1px] h-6 bg-[rgba(126,184,255,0.2)]"></div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Performance</span>
                    <span className="font-mono text-sm">{performance.fps} <span className="text-[10px] opacity-50">FPS</span></span>
                </div>
                {performance.setDiagnosticsEnabled && (
                    <>
                        <div className="w-[1px] h-6 bg-[rgba(126,184,255,0.2)]"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Diagnostics</span>
                            <button
                                onClick={() => {
                                    audioEngine.playUiClick();
                                    performance.setDiagnosticsEnabled?.(!performance.diagnosticsEnabled);
                                }}
                                className={`font-mono text-xs uppercase px-2 py-0.5 pointer-events-auto rounded border focus-visible:ring-1 focus-visible:ring-[#C084FC] outline-none transition-all ${performance.diagnosticsEnabled ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'text-indigo-300 hover:text-white hover:bg-white/5 border-transparent'}`}
                                aria-label="Toggle performance diagnostics panel"
                            >
                                {performance.diagnosticsEnabled ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </>
                )}
                </div>
            </nav>

            {/* Tier Down Indicator */}
            {performance.showIndicator && (
                <div
                    className="absolute top-24 left-1/2 -translate-x-1/2 z-30 animate-bounce"
                    role="alert"
                    aria-live="polite"
                >
                    <div className="bg-orange-500/20 backdrop-blur-xl border border-orange-500/50 px-6 py-2 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.3)]">
                        <span className="text-orange-400 text-xs font-bold uppercase tracking-[0.2em]">
                            Performance Warning: Optimizing Simulation Tier
                        </span>
                    </div>
                </div>
            )}

            {/* Performance Telemetry Overlay */}
            {performance.diagnosticsEnabled && performance.diagnostics && (
                <div 
                    className="absolute top-24 right-4 bg-[rgba(8,8,20,0.85)] backdrop-blur-xl border border-[rgba(126,184,255,0.25)] rounded-2xl p-6 w-80 text-[#7EB8FF] font-mono text-[11px] space-y-4 shadow-[0_0_30px_rgba(8,8,20,0.8)] z-30 pointer-events-auto"
                    role="region"
                    aria-label="Performance Telemetry"
                >
                    <div className="flex items-center justify-between border-b border-[rgba(126,184,255,0.2)] pb-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                            Stutter Diagnostics
                        </span>
                        <button 
                            onClick={() => {
                                audioEngine.playUiClick();
                                performance.resetDiagnostics?.();
                            }} 
                            className="text-[9px] uppercase bg-white/5 hover:bg-white/10 text-white/70 px-2 py-0.5 rounded border border-[rgba(126,184,255,0.15)] transition-colors"
                        >
                            Reset Stats
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <div className="text-[9px] uppercase tracking-wider text-[#7EB8FF]/60 mb-1">FPS (Avg)</div>
                            <div className="text-lg font-bold text-white flex items-baseline gap-1">
                                {performance.diagnostics.fps}
                                <span className="text-[9px] font-normal text-[#7EB8FF]/40">FPS</span>
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <div className="text-[9px] uppercase tracking-wider text-[#7EB8FF]/60 mb-1">1% Low</div>
                            <div className="text-lg font-bold text-white flex items-baseline gap-1">
                                {performance.diagnostics.onePercentLow}
                                <span className="text-[9px] font-normal text-[#7EB8FF]/40">FPS</span>
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <div className="text-[9px] uppercase tracking-wider text-[#7EB8FF]/60 mb-1">Frame Time</div>
                            <div className="text-lg font-bold text-white flex items-baseline gap-1">
                                {performance.diagnostics.frameTime.toFixed(1)}
                                <span className="text-[9px] font-normal text-[#7EB8FF]/40">ms</span>
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <div className="text-[9px] uppercase tracking-wider text-[#7EB8FF]/60 mb-1">Max Frame</div>
                            <div className="text-lg font-bold text-white flex items-baseline gap-1">
                                {performance.diagnostics.maxFrameTime.toFixed(1)}
                                <span className="text-[9px] font-normal text-[#7EB8FF]/40">ms</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 border-t border-[rgba(126,184,255,0.1)] pt-3">
                        <div className="flex justify-between">
                            <span className="text-[#7EB8FF]/70">Stutters (&gt;50ms):</span>
                            <span className={`font-bold ${performance.diagnostics.stutterCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {performance.diagnostics.stutterCount}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#7EB8FF]/70">Last Stutter:</span>
                            <span className="text-white">
                                {performance.diagnostics.timeSinceLastStutter === Infinity || performance.diagnostics.stutterCount === 0 
                                    ? 'None' 
                                    : `${(performance.diagnostics.timeSinceLastStutter / 1000).toFixed(1)}s ago`}
                            </span>
                        </div>
                        <div className="flex justify-between border-t border-[rgba(126,184,255,0.05)] pt-2 mt-1">
                            <span className="text-[#7EB8FF]/70">Main Thread Blocks:</span>
                            <span className={`font-bold ${performance.diagnostics.longTaskCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {performance.diagnostics.longTaskCount}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#7EB8FF]/70">Last Block Duration:</span>
                            <span className="text-white font-mono">
                                {performance.diagnostics.longTaskCount === 0 
                                    ? 'None' 
                                    : `${performance.diagnostics.lastLongTaskDuration.toFixed(1)} ms`}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#7EB8FF]/70">WebGL Draw Calls:</span>
                            <span className="text-white font-bold">{performance.diagnostics.drawCalls}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#7EB8FF]/70">WebGL Triangles:</span>
                            <span className="text-white">{performance.diagnostics.triangles.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#7EB8FF]/70">Geometries / Textures:</span>
                            <span className="text-white">{performance.diagnostics.geometries} / {performance.diagnostics.textures}</span>
                        </div>
                        <div className="flex justify-between border-t border-[rgba(126,184,255,0.05)] pt-2 mt-1">
                            <span className="text-[#7EB8FF]/70">JS Heap Usage:</span>
                            <span className="text-white">
                                {performance.diagnostics.memoryUsage === 'N/A' 
                                    ? 'N/A' 
                                    : `${performance.diagnostics.memoryUsage} MB`}
                            </span>
                        </div>

                        <div className="border-t border-[rgba(126,184,255,0.1)] pt-2 mt-2 space-y-1">
                            <div className="text-[8px] text-[#C084FC] uppercase tracking-wider font-bold mb-1">Suspect Collections</div>
                            <div className="flex justify-between">
                                <span className="text-[#7EB8FF]/70">Hero Stars (Act/Tot):</span>
                                <span className="text-white">{performance.diagnostics.activeHeroStars} / {performance.diagnostics.totalHeroStars}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#7EB8FF]/70">Scene Children:</span>
                                <span className="text-white">{performance.diagnostics.sceneChildren}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#7EB8FF]/70">N-Body Particles:</span>
                                <span className="text-white">{performance.diagnostics.nbodyBodiesCount}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#7EB8FF]/70">Geometries / Textures:</span>
                                <span className="text-white">{performance.diagnostics.geometriesInMemory} / {performance.diagnostics.texturesInMemory}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#7EB8FF]/70">Shader Programs:</span>
                                <span className="text-white">{performance.diagnostics.shaderProgramsInMemory}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#7EB8FF]/70">Phase Inits (total):</span>
                                <span className="text-white">{performance.diagnostics.phaseInits}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#7EB8FF]/70">Phase Disposals (total):</span>
                                <span className="text-white">{performance.diagnostics.phaseDisposals}</span>
                            </div>
                            <div className="flex justify-between text-yellow-400">
                                <span className="text-yellow-400/80">Blocked Double-Inits:</span>
                                <span className="font-bold">{performance.diagnostics.blockedDoubleInits}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-[8px] text-[#7EB8FF]/40 text-center uppercase tracking-wider pt-1 border-t border-[rgba(126,184,255,0.05)]">
                        Press [D] to Toggle Panel
                    </div>
                </div>
            )}

            {/* Thread Block Log (Max 15) */}
            {isDebugMode && performance.diagnostics && (
                <div 
                    className="fixed bottom-4 right-4 bg-[rgba(12,12,28,0.95)] border border-red-500/40 rounded-xl p-4 w-80 text-[#FF7E7E] font-mono text-[10px] space-y-3 shadow-[0_0_40px_rgba(239,68,68,0.15)] z-40 pointer-events-auto backdrop-blur-xl"
                    role="region"
                    aria-label="Thread Block Log"
                >
                    <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
                        <span className="text-white font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                            Thread Block Log (Max 15)
                        </span>
                        <button 
                            onClick={() => {
                                audioEngine.playUiClick();
                                performance.resetDiagnostics?.();
                            }} 
                            className="text-[8px] uppercase bg-red-500/10 hover:bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/20 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {performance.diagnostics.longTasksLog && performance.diagnostics.longTasksLog.length === 0 ? (
                            <div className="text-[#FF7E7E]/40 text-center py-4 uppercase tracking-widest text-[8px]">
                                No main thread blocks detected
                            </div>
                        ) : (
                            performance.diagnostics.longTasksLog?.slice().reverse().map((item: { duration: number; timestamp: number }, index: number) => {
                                const secAgo = ((window.performance.now() - item.timestamp) / 1000).toFixed(1);
                                return (
                                    <div key={index} className="flex justify-between items-center py-1 border-b border-white/5 last:border-b-0 hover:bg-white/5 px-1 rounded transition-colors">
                                        <span className="text-white font-bold">{item.duration.toFixed(1)} ms</span>
                                        <span className="text-[#FF7E7E]/60">{secAgo}s ago</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Bottom HUD */}
            <div className="absolute bottom-0 w-full p-8 pb-[max(2rem,env(safe-area-inset-bottom))] flex justify-between items-end z-20 pointer-events-none">
                <div className="font-mono text-[10px] text-[#7EB8FF]/60 space-y-1 border-l border-[#C084FC]/50 pl-4 bg-[rgba(8,8,20,0.4)] backdrop-blur-md py-3 pr-4 rounded-r border-y-0 border-r-0 pointer-events-auto group/telemetry" tabIndex={-1}>
                <div className="flex items-center justify-between gap-4 mb-2 pb-1 border-b border-[rgba(126,184,255,0.2)]">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#C084FC] animate-pulse shadow-[0_0_5px_#C084FC]" />
                        <span className="uppercase tracking-widest text-[#7EB8FF]">Location</span>
                    </div>
                    <button
                        onClick={copyCoordinates}
                        className="text-[#7EB8FF]/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-0.5 relative group/copy"
                        aria-label={copied ? "Coordinates Copied" : "Copy Coordinates"}
                        title="Copy Coordinates"
                    >
                        <span className={`absolute -top-6 right-0 text-[10px] text-[#C084FC] transition-opacity whitespace-nowrap ${copied ? 'opacity-100' : 'opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100'}`}>
                            {copied ? 'Copied!' : 'Copy'}
                        </span>
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                </div>
                <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_X:</span><span ref={uiRefs.hudX}>0.0000</span></div>
                <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Y:</span><span ref={uiRefs.hudY}>0.0000</span></div>
                <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Z:</span><span ref={uiRefs.hudZ}>0.0000</span></div>
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 w-1/3 pointer-events-auto">
                    <div className="w-full px-8 py-4 bg-[rgba(8,8,20,0.6)] backdrop-blur-2xl border border-[rgba(126,184,255,0.2)] rounded-2xl flex flex-col items-center group">
                        <div className="flex justify-between w-full items-center mb-3">
                            <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">
                                Global Cosmic Age (Gyr) <span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-2 text-[8px] text-[#C084FC] hidden sm:inline">[Arrows to Seek]</span>
                            </span>
                            <div className="flex gap-2">
                                <div
                                    className="flex bg-[rgba(8,8,20,0.8)] border border-[rgba(126,184,255,0.2)] rounded-full p-0.5 pointer-events-auto mr-2 relative group/timescale"
                                    role="radiogroup"
                                    aria-label="Simulation timescale"
                                    aria-keyshortcuts="t"
                                >
                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/timescale:opacity-100 group-focus-within/timescale:opacity-100 transition-opacity whitespace-nowrap">
                                        [T] Scale
                                    </span>
                                    <button 
                                        onClick={() => {
                                            audioEngine.playUiClick();
                                            setTimeScale('cosmic');
                                        }}
                                        className={`px-3 py-1 text-[9px] uppercase tracking-wider rounded-full transition-colors focus-visible:ring-1 focus-visible:ring-[#7EB8FF] outline-none ${timeScale === 'cosmic' ? 'bg-[#7EB8FF]/20 text-[#7EB8FF]' : 'text-white/40 hover:text-white'}`}
                                        title="1 second = 200 Million Years"
                                        role="radio"
                                        aria-checked={timeScale === 'cosmic'}
                                        aria-label="Cosmic timescale: 1 second equals 200 Million Years"
                                    >
                                        Cosmic
                                    </button>
                                    <button 
                                        onClick={() => {
                                            audioEngine.playUiClick();
                                            setTimeScale('realtime');
                                        }}
                                        className={`px-3 py-1 text-[9px] uppercase tracking-wider rounded-full transition-colors focus-visible:ring-1 focus-visible:ring-[#C084FC] outline-none ${timeScale === 'realtime' ? 'bg-[#C084FC]/20 text-[#C084FC]' : 'text-white/40 hover:text-white'}`}
                                        title="1 second = 1 second"
                                        role="radio"
                                        aria-checked={timeScale === 'realtime'}
                                        aria-label="Realtime timescale: 1 second equals 1 second"
                                    >
                                        Realtime
                                    </button>
                                </div>
                                <button
                                    onClick={shareUniverse}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-[#C084FC]/10 border border-[#C084FC]/30 rounded-full text-[9px] uppercase tracking-wider text-[#C084FC] hover:bg-[#C084FC]/20 transition-colors pointer-events-auto focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
                                    aria-label={shareCopied ? "Universe Seed URL Copied" : "Copy Universe Seed URL to clipboard"}
                                    title="Copy Universe Seed URL"
                                >
                                    {shareCopied ? <Check size={10} /> : <Copy size={10} />}
                                    {shareCopied ? "Copied" : "Share Universe"}
                                </button>
                                <button
                                    onClick={() => {
                                        audioEngine.playUiClick();
                                        setIsPlayingCosmic(!isPlayingCosmic);
                                    }}
                                    className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded relative group/play"
                                    aria-label={isPlayingCosmic ? "Pause cosmic simulation" : "Play cosmic simulation"}
                                    title={isPlayingCosmic ? "Pause Cosmic Simulation" : "Play Cosmic Simulation"}
                                    aria-keyshortcuts="Space"
                                >
                                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/play:opacity-100 group-focus-visible/play:opacity-100 transition-opacity whitespace-nowrap">
                                        [Space]
                                    </span>
                                    {isPlayingCosmic ? <Pause size={14} /> : <Play size={14} />}
                                </button>
                            </div>
                        </div>
                        
                        <div 
                            ref={uiRefs.globalSlider}
                            role="slider"
                            tabIndex={0}
                            aria-label="Global cosmic age timeline"
                            aria-valuemin={0}
                            aria-valuemax={14}
                            aria-valuenow={parseFloat(cosmicAge.toFixed(2))}
                            className="w-full h-3 bg-white/10 rounded-full overflow-hidden cursor-ew-resize relative focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onKeyDown={(e) => onKeyDown(e, true)}
                        >
                            <div ref={uiRefs.globalTimelineFill} className="h-full bg-gradient-to-r from-[#7EB8FF] to-[#C084FC]" style={{width: `${(cosmicAge / 14.0) * 100}%`}}></div>
                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <span className="font-mono text-2xl font-light tracking-wider mt-2" ref={uiRefs.hudAge}>{cosmicAge.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-[#7EB8FF]/50 italic text-center pointer-events-none">"Scrub to T=0 to observe pre-stellar plasma state."</p>
                </div>

                <div className="flex flex-col items-end gap-2 text-right">
                <div className="grid grid-cols-4 gap-2 pointer-events-auto">
                    <button 
                        onClick={() => {
                            audioEngine.init();
                            audioEngine.playUiClick();
                            const muted = audioEngine.toggleMute();
                            setIsMuted(muted);
                        }}
                        className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none relative group/audio"
                        aria-label="Toggle ambient audio drone and sound effects" title="Toggle Audio"
                    >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/audio:opacity-100 group-focus-visible/audio:opacity-100 transition-opacity whitespace-nowrap">
                        Audio
                    </span>
                    {isMuted ? <VolumeX size={16} className="text-red-400" /> : <Volume2 size={16} className="text-[#7EB8FF]" />}
                    </button>

                    {onOpenCatalog && (
                        <button 
                            onClick={() => {
                                audioEngine.playUiClick();
                                onOpenCatalog();
                            }}
                            className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none relative group/catalog"
                            aria-label="Open Astronomical Catalog & Presets" title="Catalog Search"
                        >
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/catalog:opacity-100 group-focus-visible/catalog:opacity-100 transition-opacity whitespace-nowrap">
                            Catalog
                        </span>
                        <Search size={16} className="text-[#C084FC]" />
                        </button>
                    )}

                    <button 
                        onClick={() => {
                            audioEngine.playUiClick();
                            resetCamera();
                        }}
                        className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none relative group/reset"
                        aria-label="Reset camera position and orientation" title="Reset Camera [R]"
                        aria-keyshortcuts="r"
                    >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/reset:opacity-100 group-focus-visible/reset:opacity-100 transition-opacity whitespace-nowrap">
                        [R] Reset
                    </span>
                    <Crosshair size={16} className="text-[#7EB8FF]" />
                    </button>

                    <button 
                        onClick={() => {
                            audioEngine.playUiClick();
                            centerOnStar();
                        }}
                        className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none relative group/focus"
                        aria-label="Center camera on selected star" title="Focus on Star [F]"
                        aria-keyshortcuts="f"
                    >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/focus:opacity-100 group-focus-visible/focus:opacity-100 transition-opacity whitespace-nowrap">
                        [F] Focus
                    </span>
                    <Navigation size={16} className="text-[#C084FC]" />
                    </button>
                </div>
                <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]/60 mt-1">Stellar Raycasting Active</span>
                </div>
            </div>

            {/* Screen Reader Announcements */}
            <div className="sr-only" role="region" aria-live="polite">
                {announcement}
            </div>
        </>
    );
};
