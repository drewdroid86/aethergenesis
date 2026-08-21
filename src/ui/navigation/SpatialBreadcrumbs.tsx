import React from 'react';
import { ChevronRight, Globe, Sparkles, Orbit } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine';

interface SpatialBreadcrumbsProps {
    starName?: string;
    planetName?: string;
    onResetUniverse: () => void;
    onFocusStar?: () => void;
    onFocusPlanet?: () => void;
}

export const SpatialBreadcrumbs: React.FC<SpatialBreadcrumbsProps> = ({
    starName,
    planetName,
    onResetUniverse,
    onFocusStar,
    onFocusPlanet
}) => {
    return (
        <nav 
            className="flex items-center gap-1.5 bg-[rgba(8,8,20,0.65)] backdrop-blur-md border border-[rgba(126,184,255,0.2)] px-3 py-1.5 rounded-full font-mono text-[9px] text-[#7EB8FF]/70 select-none pointer-events-auto shadow-[0_0_15px_rgba(8,8,20,0.6)]"
            aria-label="Spatial Breadcrumb Hierarchy"
        >
            {/* Level 1: Universe */}
            <button
                onClick={() => {
                    audioEngine.playUiClick();
                    onResetUniverse();
                }}
                className="flex items-center gap-1 text-[#7EB8FF] hover:text-white hover:underline transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#C084FC] rounded px-1"
                title="Zoom out to Full Universe / Galactic View"
            >
                <Globe size={11} className="text-[#C084FC]" />
                <span>Universe</span>
            </button>

            <ChevronRight size={10} className="text-[#7EB8FF]/40" />

            {/* Level 2: Sector */}
            <span className="text-[#7EB8FF]/60 px-1">
                Orion Sector
            </span>

            {/* Level 3: Star System */}
            {starName && (
                <>
                    <ChevronRight size={10} className="text-[#7EB8FF]/40" />
                    <button
                        onClick={() => {
                            audioEngine.playUiClick();
                            onFocusStar?.();
                        }}
                        className="flex items-center gap-1 text-white font-bold hover:text-[#C084FC] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#C084FC] rounded px-1"
                        title={`Focus camera on star: ${starName}`}
                    >
                        <Sparkles size={10} className="text-[#C084FC]" />
                        <span>{starName}</span>
                    </button>
                </>
            )}

            {/* Level 4: Planet */}
            {planetName && (
                <>
                    <ChevronRight size={10} className="text-[#7EB8FF]/40" />
                    <button
                        onClick={() => {
                            audioEngine.playUiClick();
                            onFocusPlanet?.();
                        }}
                        className="flex items-center gap-1 text-[#4ade80] font-bold hover:underline transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#4ade80] rounded px-1"
                        title={`Focus camera on ${planetName}`}
                    >
                        <Orbit size={10} className="text-[#4ade80]" />
                        <span>{planetName}</span>
                    </button>
                </>
            )}
        </nav>
    );
};
