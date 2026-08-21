import React from 'react';
import { Layers } from 'lucide-react';

interface CosmicScaleLadderProps {
    currentDistanceUnits: number; // in AU
    formattedScale: string;
}

const SCALE_TIERS = [
    { id: 'galactic', label: 'Galactic', range: '10 kpc - 100 ly', threshold: 5000 },
    { id: 'interstellar', label: 'Interstellar', range: '100 ly - 100 AU', threshold: 500 },
    { id: 'system', label: 'Stellar System', range: '100 AU - 0.1 AU', threshold: 0.1 },
    { id: 'planetary', label: 'Planetary Orbit', range: '< 0.1 AU (km)', threshold: 0 },
];

export const CosmicScaleLadder: React.FC<CosmicScaleLadderProps> = ({
    currentDistanceUnits,
    formattedScale
}) => {
    // Determine active tier based on camera distance
    let activeTierIdx = 3; // default planetary
    if (currentDistanceUnits >= 5000) activeTierIdx = 0;
    else if (currentDistanceUnits >= 500) activeTierIdx = 1;
    else if (currentDistanceUnits >= 0.1) activeTierIdx = 2;

    return (
        <div 
            className="flex flex-col gap-1.5 bg-[rgba(8,8,20,0.65)] backdrop-blur-md border border-[rgba(126,184,255,0.2)] px-3 py-2 rounded-2xl font-mono text-[9px] select-none pointer-events-auto shadow-[0_0_20px_rgba(8,8,20,0.7)] group/ladder"
            role="region"
            aria-label="Cosmic Scale Ladder"
        >
            <div className="flex items-center justify-between text-[#7EB8FF]/70">
                <span className="flex items-center gap-1 uppercase tracking-wider font-semibold">
                    <Layers size={10} className="text-[#C084FC]" />
                    Scale Ladder
                </span>
                <span className="text-white font-bold">{formattedScale}</span>
            </div>

            {/* Visual 4-Step Ladder Bar */}
            <div className="grid grid-cols-4 gap-1 mt-0.5">
                {SCALE_TIERS.map((tier, idx) => {
                    const isActive = idx === activeTierIdx;
                    return (
                        <div 
                            key={tier.id}
                            className={`h-1.5 rounded-full transition-all duration-300 ${isActive ? 'bg-gradient-to-r from-[#7EB8FF] to-[#C084FC] shadow-[0_0_8px_#C084FC]' : 'bg-white/10'}`}
                            title={`${tier.label} (${tier.range})`}
                        />
                    );
                })}
            </div>

            <div className="flex justify-between text-[8px] text-[#7EB8FF]/50 uppercase tracking-tighter pt-0.5">
                <span>Galactic</span>
                <span>Interstellar</span>
                <span>System</span>
                <span>Orbit</span>
            </div>
        </div>
    );
};
