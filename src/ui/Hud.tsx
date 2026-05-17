import React, { useState } from 'react';
import { Check, Copy, Crosshair, Navigation, Pause, Play } from 'lucide-react';

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
    performance: {
        tier: string;
        numStars: number;
        fps: number;
        showIndicator: boolean;
    };
}

export const Hud: React.FC<HudProps> = ({ 
    uiRefs, 
    cosmicAge, 
    isPlayingCosmic, 
    setIsPlayingCosmic,
    onGlobalScrubStart,
    onGlobalScrubMove,
    onGlobalScrubEnd,
    onKeyDown,
    resetCamera,
    performance
}) => {
    const [copied, setCopied] = useState(false);

    const copyCoordinates = () => {
        const x = uiRefs.hudX.current?.innerText || '0.0000';
        const y = uiRefs.hudY.current?.innerText || '0.0000';
        const z = uiRefs.hudZ.current?.innerText || '0.0000';
        const coords = `X: ${x}, Y: ${y}, Z: ${z}`;

        navigator.clipboard.writeText(coords).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
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
                
                <div className="flex items-center gap-12 bg-[rgba(8,8,20,0.6)] backdrop-blur-md border border-[rgba(126,184,255,0.2)] rounded-full px-6 py-3">
                <div className="flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Background Mass</span>
                    <span className="font-mono text-sm">{performance.numStars.toLocaleString()} <span className="text-[#C084FC]">★</span></span>
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
                </div>
            </nav>

            {/* Tier Down Indicator */}
            {performance.showIndicator && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 animate-bounce">
                    <div className="bg-orange-500/20 backdrop-blur-xl border border-orange-500/50 px-6 py-2 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.3)]">
                        <span className="text-orange-400 text-xs font-bold uppercase tracking-[0.2em]">
                            Performance Warning: Optimizing Simulation Tier
                        </span>
                    </div>
                </div>
            )}

            {/* Bottom HUD */}
            <div className="absolute bottom-0 w-full p-8 flex justify-between items-end z-20 pointer-events-none">
                <div className="font-mono text-[10px] text-[#7EB8FF]/60 space-y-1 border-l border-[#C084FC]/50 pl-4 bg-[rgba(8,8,20,0.4)] backdrop-blur-md py-3 pr-4 rounded-r border-y-0 border-r-0 pointer-events-auto">
                <div className="flex items-center justify-between gap-4 mb-2 pb-1 border-b border-[rgba(126,184,255,0.2)]">
                    <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#C084FC] animate-pulse shadow-[0_0_5px_#C084FC]" />
                        <span className="uppercase tracking-widest text-[#7EB8FF]">Location</span>
                    </div>
                    <button
                        onClick={copyCoordinates}
                        className="text-[#7EB8FF]/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded"
                        aria-label="Copy Coordinates"
                        title="Copy Coordinates"
                    >
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
                                Global Cosmic Age (Gyr) <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-[8px] text-[#C084FC] hidden sm:inline">[Arrows to Seek]</span>
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsPlayingCosmic(!isPlayingCosmic)}
                                    className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded flex items-center gap-1 group"
                                    aria-label={isPlayingCosmic ? "Pause cosmic simulation" : "Play cosmic simulation"}
                                    title={isPlayingCosmic ? "Pause [Space]" : "Play [Space]"}
                                >
                                    <span className="text-[8px] text-[#C084FC] opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">[Space]</span>
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
                            onPointerDown={onGlobalScrubStart}
                            onPointerMove={onGlobalScrubMove}
                            onPointerUp={onGlobalScrubEnd}
                            onPointerLeave={onGlobalScrubEnd}
                            onKeyDown={(e) => onKeyDown(e, true)}
                        >
                            <div ref={uiRefs.globalTimelineFill} className="h-full bg-gradient-to-r from-[#7EB8FF] to-[#C084FC]" style={{width: `${(cosmicAge / 14.0) * 100}%`}}></div>
                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <span className="font-mono text-2xl font-light tracking-wider mt-2" ref={uiRefs.hudAge}>{cosmicAge.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-[#7EB8FF]/50 italic text-center pointer-events-none">"Scrub to T=0 to observe pre-stellar plasma state."</p>
                </div>

                <div className="flex flex-col items-end gap-2 text-right group/actions">
                <div className="grid grid-cols-2 gap-2 pointer-events-auto">
                    <button 
                        onClick={resetCamera}
                        className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none relative group/reset"
                        aria-label="Reset Camera" title="Reset Camera [R]"
                    >
                    <span className="absolute -top-6 right-0 text-[8px] text-[#C084FC] opacity-0 group-hover/reset:opacity-100 transition-opacity whitespace-nowrap hidden sm:inline">[R] Reset</span>
                    <Crosshair size={16} className="text-[#7EB8FF]" />
                    </button>
                    <button 
                        className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-not-allowed opacity-50 focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none" 
                        aria-label="Center on Star" title="Center on Star"
                    >
                    <Navigation size={16} className="text-[#C084FC]" />
                    </button>
                </div>
                <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]/60 mt-1">Stellar Raycasting Active</span>
                </div>
            </div>
        </>
    );
};
