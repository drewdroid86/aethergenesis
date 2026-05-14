import React, { useState, useEffect, useRef } from 'react';
import { Scan, Zap, Pause, Play, X } from 'lucide-react';
import { PHASE_NAMES } from '../core/constants';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { PhysicsConstants } from '../types/physics';

interface GeminiAnalysisResult {
    planet_name: string;
    life_stage: number;
    dominant_species: string;
    civilization: string;
    biome: string;
    isFallback?: boolean;
}

interface InspectPanelProps {
    selectedStar: HeroStarSystem;
    setSelectedStar: (star: HeroStarSystem | null) => void;
    isPaused: boolean;
    setIsPaused: (paused: boolean) => void;
    physics: PhysicsConstants;
    onScrubStart: (e: React.PointerEvent) => void;
    onScrubMove: (e: React.PointerEvent) => void;
    onScrubEnd: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    uiRefs: {
        phase: React.RefObject<HTMLSpanElement | null>;
        temp: React.RefObject<HTMLSpanElement | null>;
        mass: React.RefObject<HTMLSpanElement | null>;
        age: React.RefObject<HTMLSpanElement | null>;
        lum: React.RefObject<HTMLSpanElement | null>;
        timelineFill: React.RefObject<HTMLDivElement | null>;
        stellarSlider: React.RefObject<HTMLDivElement | null>;
    };
}

export const InspectPanel: React.FC<InspectPanelProps> = ({
    selectedStar,
    setSelectedStar,
    isPaused,
    setIsPaused,
    physics,
    onScrubStart,
    onScrubMove,
    onScrubEnd,
    onKeyDown,
    uiRefs
}) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [geminiData, setGeminiData] = useState<GeminiAnalysisResult | null>(null);
    const [analysisFailed, setAnalysisFailed] = useState(false);
    const lastAnalysisTimeRef = useRef(0);

    const analyzeSystem = async () => {
        if (!selectedStar || isAnalyzing) return;

        const now = Date.now();
        if (now - lastAnalysisTimeRef.current < 5000) return;
        lastAnalysisTimeRef.current = now;

        try {
            setIsAnalyzing(true);
            const payload = {
                temp: Math.round(selectedStar.currentTemp),
                mass: parseFloat(selectedStar.mass.toFixed(2)),
                lum: parseFloat(selectedStar.currentLum.toFixed(3)),
                age: parseFloat(selectedStar.currentRealAge.toFixed(1)),
                phase: PHASE_NAMES[selectedStar.phase],
                G: physics.G,
                alpha: physics.alpha
            };

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json() as GeminiAnalysisResult;
            setGeminiData(data);
            setAnalysisFailed(false);
        } catch (err) {
            console.warn("Analysis unavailable - using predictive fallback.");
            setAnalysisFailed(true);
            setGeminiData({
                planet_name: "Kerath-7",
                biome: "Crystalline Deserts",
                dominant_species: "Silicate Swarm",
                life_stage: 4,
                civilization: "Post-Scarcity Hive",
                isFallback: true,
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        setGeminiData(null);
        setAnalysisFailed(false);
    }, [selectedStar]);

    return (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-[min(320px,85vw)] overflow-hidden bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]">
                <div className="flex items-center gap-3">
                    <Scan size={20} className="text-[#C084FC]" />
                    <h2 className="text-sm font-bold tracking-widest uppercase text-white">Stellar Telemetry</h2>
                </div>
                <button
                    onClick={() => setSelectedStar(null)}
                    className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded"
                    aria-label="Close Stellar Telemetry"
                >
                    <X size={20} />
                </button>
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
                
                <div className="mt-8 pt-6 border-t border-[rgba(126,184,255,0.1)] group/timeline">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] text-[#7EB8FF]/50 uppercase tracking-widest">
                            Time Override <span className="opacity-0 group-hover/timeline:opacity-100 transition-opacity ml-1 text-[8px] text-[#C084FC] hidden sm:inline">[Arrows to Seek]</span>
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setIsPaused(true)} className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded" aria-label="Pause Simulation" title="Pause Simulation"><Pause size={12} /></button>
                            <button onClick={() => setIsPaused(false)} className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded" aria-label="Play Simulation" title="Play Simulation"><Play size={12} /></button>
                        </div>
                    </div>
                    <div 
                        ref={uiRefs.stellarSlider}
                        role="slider" 
                        tabIndex={0} 
                        aria-label="Stellar lifecycle timeline" 
                        aria-valuemin={0} 
                        aria-valuemax={100}
                        className="w-full h-2 bg-white/10 rounded-full overflow-hidden cursor-ew-resize relative group focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
                        onPointerDown={onScrubStart}
                        onPointerMove={onScrubMove}
                        onPointerUp={onScrubEnd}
                        onPointerLeave={onScrubEnd}
                        onKeyDown={onKeyDown}
                    >
                        <div ref={uiRefs.timelineFill} className="h-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-red-500" style={{width: '0%'}}></div>
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-[#7EB8FF]/40 uppercase tracking-widest">
                        <span>Genesis</span>
                        <span>Terminal</span>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[rgba(126,184,255,0.1)]">
                    <button 
                        onClick={analyzeSystem}
                        disabled={isAnalyzing}
                        className="w-full py-2 bg-[#C084FC]/20 hover:bg-[#C084FC]/40 text-[#C084FC] hover:text-white border border-[#C084FC]/30 rounded transition-colors text-[10px] uppercase tracking-widest disabled:opacity-50"
                    >
                        {isAnalyzing ? "Analyzing System..." : "Gemini AI: Deep Scan"}
                    </button>
                    {geminiData && (
                        <div className="mt-4 p-3 bg-black/40 border border-[#7EB8FF]/20 rounded text-[10px] space-y-2">
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Planet:</span> {geminiData.planet_name}</div>
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Biome:</span> {geminiData.biome}</div>
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Species:</span> {geminiData.dominant_species} (Stage {geminiData.life_stage})</div>
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Civilization:</span> {geminiData.civilization}</div>
                            {analysisFailed && (
                              <p className="text-[9px] text-yellow-400/70 mt-3 italic">
                                ⚠ Predictive fallback — AI scan unavailable
                              </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
