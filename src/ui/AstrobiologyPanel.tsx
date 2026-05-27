import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Droplets, Thermometer, ShieldAlert, Globe } from 'lucide-react';
import { HabitabilityState } from '../simulation/AstrobiologyEngine';

interface AstrobiologyPanelProps {
    data: HabitabilityState[];
    selectedStar: any;
}

export const AstrobiologyPanel: React.FC<AstrobiologyPanelProps> = ({ data, selectedStar }) => {
    if (!selectedStar || data.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute left-6 top-6 w-80 max-h-[calc(100vh-3rem)] overflow-y-auto pointer-events-auto"
        >
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-white/10">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-medium text-white/90 font-mono tracking-wider">Astrobiology</h2>
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
                                            <span>Biomass</span>
                                            <span>{(planet.biomass * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
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
                    
                    {data.length === 0 && (
                        <div className="text-center text-white/40 text-xs font-mono py-4">
                            No planetary bodies detected.
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
