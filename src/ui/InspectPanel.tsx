import React from 'react';
import { Scan, Zap, Pause, Play } from 'lucide-react';
import { PHASE_NAMES } from '../core/constants';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';

interface InspectPanelProps {
    selectedStar: HeroStarSystem;
    isPaused: boolean;
    setIsPaused: (paused: boolean) => void;
    onScrubStart: (e: React.PointerEvent) => void;
    onScrubMove: (e: React.PointerEvent) => void;
    onScrubEnd: () => void;
    uiRefs: {
        phase: React.RefObject<HTMLSpanElement | null>;
        temp: React.RefObject<HTMLSpanElement | null>;
        mass: React.RefObject<HTMLSpanElement | null>;
        age: React.RefObject<HTMLSpanElement | null>;
        lum: React.RefObject<HTMLSpanElement | null>;
        timelineFill: React.RefObject<HTMLDivElement | null>;
    };
}

export const InspectPanel: React.FC<InspectPanelProps> = ({
    selectedStar,
    isPaused,
    setIsPaused,
    onScrubStart,
    onScrubMove,
    onScrubEnd,
    uiRefs
}) => {
    return (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-80 bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]">
                <Scan size={20} className="text-[#C084FC]" />
                <h2 className="text-sm font-bold tracking-widest uppercase text-white">Stellar Telemetry</h2>
            </div>

            <div className="space-y-4 font-mono text-xs">
                <div className="flex justify-between items-center">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Phase</span>
                    <span ref={uiRefs.phase} className="text-[#C084FC] font-bold text-right">-</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider flex items-center gap-2">
                        <Zap size={14} /> Temp (K)
                    </span>
                    <span ref={uiRefs.temp} className="text-white">-</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Mass (M☉)</span>
                    <span ref={uiRefs.mass} className="text-white">-</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Luminosity (L☉)</span>
                    <span ref={uiRefs.lum} className="text-white">-</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Age (Myr)</span>
                    <span ref={uiRefs.age} className="text-white">-</span>
                </div>
                
                <div className="mt-8 pt-6 border-t border-[rgba(126,184,255,0.1)]">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] text-[#7EB8FF]/50 uppercase tracking-widest">Time Override</span>
                        <div className="flex gap-2">
                            <button onClick={() => setIsPaused(true)} className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus:outline-none rounded-sm" aria-label="Pause Simulation" title="Pause Simulation"><Pause size={12} /></button>
                            <button onClick={() => setIsPaused(false)} className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus:outline-none rounded-sm" aria-label="Play Simulation" title="Play Simulation"><Play size={12} /></button>
                        </div>
                    </div>
                    {/* Scrubbable Timeline */}
                    <div role="slider" aria-label="Stellar lifecycle timeline" tabIndex={0} aria-valuemin={0} aria-valuemax={100}
                        className="w-full h-2 bg-white/10 rounded-full overflow-hidden cursor-ew-resize relative group focus-visible:ring-2 focus-visible:ring-indigo-500 focus:outline-none"
                        onPointerDown={onScrubStart}
                        onPointerMove={onScrubMove}
                        onPointerUp={onScrubEnd}
                        onPointerLeave={onScrubEnd}
                    >
                        <div ref={uiRefs.timelineFill} className="h-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-red-500" style={{width: '0%'}}></div>
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-[#7EB8FF]/40 uppercase tracking-widest">
                        <span>Genesis</span>
                        <span>Terminal</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
