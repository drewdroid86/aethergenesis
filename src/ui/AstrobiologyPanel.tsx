import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Droplets, Thermometer, ShieldAlert, Globe, Copy, Check, X } from 'lucide-react';
import { HabitabilityState } from '../simulation/AstrobiologyEngine';

interface AstrobiologyPanelProps {
    data: HabitabilityState[];
    selectedStar: any;
    onClose?: () => void;
}

export const AstrobiologyPanel: React.FC<AstrobiologyPanelProps> = ({ data, selectedStar, onClose }) => {
    const [copied, setCopied] = useState(false);

    const copyReport = () => {
        const report = data.map((planet, i) => {
            return `Planet ${i + 1} (${planet.climateState.replace('_', ' ')})
- Surface Temp: ${(planet.surfaceTemperature_K - 273.15).toFixed(1)}°C
- Habitability: ${(planet.compositeScore * 100).toFixed(1)}%
- Biomass: ${(planet.biomass * 100).toFixed(1)}%
- Extinction Risk: ${planet.extinctionRiskLevel.replace('_', ' ')}
${planet.civilizationTier > 0 ? `- Civilization: Type ${planet.civilizationTier}` : ''}`;
        }).join('\n\n');

        const header = `Astrobiology Report: System ${selectedStar.physicsId.substring(0, 8)}\n\n`;

        navigator.clipboard.writeText(header + report).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
            className="absolute left-6 top-24 w-80 max-h-[calc(100vh-8rem)] overflow-y-auto pointer-events-auto custom-scrollbar"
        >
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10 group/header">
                    <div className="flex items-center space-x-3">
                        <Activity className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-lg font-medium text-white/90 font-mono tracking-wider">Astrobiology</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={copyReport}
                            className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 relative group/copy"
                            aria-label={copied ? "Report Copied" : "Copy Astrobiology Report"}
                            title="Copy Report"
                        >
                            <span
                                className="absolute -top-6 right-0 text-[10px] text-[#C084FC] opacity-0 group-hover/copy:opacity-100 transition-opacity whitespace-nowrap"
                                aria-live="polite"
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </span>
                            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 relative group/close"
                                aria-label="Close Astrobiology Report"
                                title="Close [Esc]"
                            >
                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/close:opacity-100 transition-opacity whitespace-nowrap">
                                    [Esc] Close
                                </span>
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <AnimatePresence>
                        {data.map((planet, i) => (
                            <motion.div 
                                key={planet.planet_id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white/5 rounded-xl p-4 border border-white/5 relative overflow-hidden"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="text-white/80 font-mono text-sm capitalize flex items-center">
                                        <Globe className="w-4 h-4 mr-2 opacity-70" />
                                        Planet {i + 1}
                                    </h3>
                                    <div className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                                        planet.climateState === 'habitable' ? 'bg-emerald-500/20 text-emerald-300' :
                                        planet.climateState === 'snowball' ? 'bg-blue-500/20 text-blue-300' :
                                        planet.climateState === 'moist_greenhouse' ? 'bg-orange-500/20 text-orange-300' :
                                        'bg-red-500/20 text-red-300'
                                    }`}>
                                        {planet.climateState.replace('_', ' ')}
                                    </div>
                                </div>

                                <div className="space-y-2 text-xs font-mono text-white/60">
                                    <div className="flex justify-between">
                                        <span className="flex items-center"><Thermometer className="w-3 h-3 mr-1" /> Temp</span>
                                        <span className={planet.surfaceTemperature_K > 273 && planet.surfaceTemperature_K < 373 ? "text-emerald-400" : ""}>
                                            {(planet.surfaceTemperature_K - 273.15).toFixed(1)}°C
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="flex items-center"><Droplets className="w-3 h-3 mr-1" /> Habitability</span>
                                        <span>{(planet.compositeScore * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="flex items-center"><ShieldAlert className="w-3 h-3 mr-1" /> Extinction Risk</span>
                                        <span className={planet.extinctionRiskLevel !== 'none' ? 'text-red-400' : 'text-emerald-400'}>
                                            {planet.extinctionRiskLevel.replace('_', ' ')}
                                        </span>
                                    </div>
                                    
                                    {/* Biomass progress bar */}
                                    <div className="pt-2 mt-2 border-t border-white/10">
                                        <div className="flex justify-between mb-1 text-[10px]">
                                            <span id={`biomass-label-${planet.planet_id}`}>Biomass</span>
                                            <span>{(planet.biomass * 100).toFixed(1)}%</span>
                                        </div>
                                        <div
                                            className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden"
                                            role="progressbar"
                                            aria-labelledby={`biomass-label-${planet.planet_id}`}
                                            aria-valuenow={Math.round(planet.biomass * 100)}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                        >
                                            <div 
                                                className="h-full bg-emerald-400 transition-all duration-300" 
                                                style={{ width: `${planet.biomass * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Civilization Level */}
                                    {planet.civilizationTier > 0 && (
                                        <div className="pt-2 mt-2 border-t border-white/10 flex justify-between items-center text-xs font-mono">
                                            <span className="text-yellow-400/80">Civilization</span>
                                            <span className="text-yellow-400 font-bold">Type {planet.civilizationTier}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};
