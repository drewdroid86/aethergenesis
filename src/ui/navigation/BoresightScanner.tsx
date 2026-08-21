import React from 'react';
import { Sparkles } from 'lucide-react';
import { BoresightTarget } from '../../types/navigation';

interface BoresightScannerProps {
    target: BoresightTarget | null;
    onLockTarget?: (id: string) => void;
}

export const BoresightScanner: React.FC<BoresightScannerProps> = ({ target, onLockTarget }) => {
    return (
        <div 
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-15 flex flex-col items-center select-none"
            aria-hidden="true"
        >
            {/* Center Crosshair Flight Reticle */}
            <div className="relative w-8 h-8 flex items-center justify-center">
                {/* 4 subtle direction ticks */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-2 bg-[#7EB8FF]/30" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1px] h-2 bg-[#7EB8FF]/30" />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px] w-2 bg-[#7EB8FF]/30" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[1px] w-2 bg-[#7EB8FF]/30" />
                
                {/* Center dot */}
                <div className={`w-1 h-1 rounded-full transition-all duration-200 ${target ? 'bg-[#C084FC] scale-150 shadow-[0_0_8px_#C084FC]' : 'bg-[#7EB8FF]/40'}`} />
            </div>

            {/* Target telemetry callout if celestial object is in line of sight */}
            {target && (
                <div 
                    onClick={() => onLockTarget?.(target.id)}
                    className="mt-3 pointer-events-auto bg-[rgba(8,8,20,0.85)] backdrop-blur-md border border-[#C084FC]/50 px-3 py-1.5 rounded-xl shadow-[0_0_20px_rgba(192,132,252,0.25)] flex flex-col items-center cursor-pointer transition-all hover:scale-105"
                    title="Click to lock target"
                >
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-white">
                        <Sparkles size={11} className="text-[#C084FC] animate-pulse" />
                        <span>{target.name}</span>
                        {target.spectralClass && (
                            <span className="text-[#7EB8FF] text-[9px]">[{target.spectralClass}]</span>
                        )}
                    </div>
                    <div className="text-[9px] font-mono text-[#7EB8FF]/80 flex items-center gap-2 mt-0.5">
                        <span>{target.type}</span>
                        <span>•</span>
                        <span className="text-[#C084FC]">{target.distanceFormatted}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
