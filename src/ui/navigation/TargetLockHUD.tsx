import React from 'react';
import { Target, Crosshair, Sparkles, X, FastForward } from 'lucide-react';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { audioEngine } from '../../audio/AudioEngine';
import { formatAdaptiveDistance } from '../../utils/navigationMath';

interface TargetLockHUDProps {
    star: HeroStarSystem;
    distanceUnits: number;
    bearingDeg: number;
    onFocus: () => void;
    onWarpTo?: () => void;
    onClearTarget: () => void;
}

const PHASE_TITLES: Record<number, string> = {
    0: 'Nebula Cloud',
    1: 'Protostar',
    2: 'Main Sequence',
    3: 'Red Giant',
    4: 'Supernova',
    5: 'Stellar Remnant',
};

export const TargetLockHUD: React.FC<TargetLockHUDProps> = ({
    star,
    distanceUnits,
    bearingDeg,
    onFocus,
    onWarpTo,
    onClearTarget
}) => {
    const formattedDistance = formatAdaptiveDistance(distanceUnits).formatted;
    const name = star.physicsId ? `Star ${star.physicsId.substring(0, 8)}` : 'Host Star';
    const phaseName = PHASE_TITLES[star.phase] || 'Star';

    return (
        <div 
            className="flex flex-col bg-[rgba(8,8,20,0.85)] backdrop-blur-2xl border border-[#C084FC]/40 rounded-2xl p-3.5 shadow-[0_0_30px_rgba(192,132,252,0.3)] pointer-events-auto select-none font-mono text-[10px] min-w-[240px] sm:min-w-[260px] max-w-full group/targetlock"
            role="region"
            aria-label={`Target Lock: ${name}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(126,184,255,0.2)]">
                <div className="flex items-center gap-1.5 text-[#C084FC] font-bold uppercase tracking-widest text-[9px]">
                    <Target size={12} className="animate-pulse text-[#C084FC]" />
                    <span>TARGET LOCKED</span>
                </div>
                <button
                    onClick={() => {
                        audioEngine.playUiClick();
                        onClearTarget();
                    }}
                    className="p-1 rounded text-[#7EB8FF]/60 hover:text-white hover:bg-white/10 transition-colors"
                    title="Unlock Target"
                    aria-label="Unlock Target"
                >
                    <X size={12} />
                </button>
            </div>

            {/* Main Target Metadata */}
            <div className="py-2 space-y-1">
                <div className="flex justify-between items-center text-white">
                    <span className="font-bold text-xs flex items-center gap-1">
                        <Sparkles size={11} className="text-[#C084FC]" />
                        {name}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#C084FC]/20 text-[#C084FC] border border-[#C084FC]/30">
                        {phaseName}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[9px] pt-1 text-[#7EB8FF]/80">
                    <div>Range: <strong className="text-white">{formattedDistance}</strong></div>
                    <div>Bearing: <strong className="text-white">{bearingDeg}°</strong></div>
                    <div>Mass: <strong className="text-white">{star.mass.toFixed(2)} M☉</strong></div>
                    <div>Temp: <strong className="text-white">{Math.round(star.currentTemp).toLocaleString()} K</strong></div>
                </div>
            </div>

            {/* Spatial Flight Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[rgba(126,184,255,0.15)]">
                <button
                    onClick={() => {
                        audioEngine.playUiClick();
                        onFocus();
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#C084FC]/15 hover:bg-[#C084FC]/30 border border-[#C084FC]/40 text-white font-semibold text-[9px] uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#C084FC]"
                    title="Center camera and look at target [F]"
                >
                    <Crosshair size={11} className="text-[#C084FC]" />
                    <span>Focus [F]</span>
                </button>

                <button
                    onClick={() => {
                        audioEngine.playUiClick();
                        if (onWarpTo) onWarpTo();
                        else onFocus();
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#7EB8FF]/15 hover:bg-[#7EB8FF]/30 border border-[#7EB8FF]/40 text-white font-semibold text-[9px] uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#7EB8FF]"
                    title="Warp camera to orbital proximity"
                >
                    <FastForward size={11} className="text-[#7EB8FF]" />
                    <span>Go To</span>
                </button>
            </div>
        </div>
    );
};
