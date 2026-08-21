import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine';

interface YouAreHereBadgeProps {
    nearestStarName: string;
    distanceToNearest: string;
    sectorName?: string;
    uiRefs?: {
        hudX?: React.RefObject<HTMLSpanElement | null>;
        hudY?: React.RefObject<HTMLSpanElement | null>;
        hudZ?: React.RefObject<HTMLSpanElement | null>;
    };
}

export const YouAreHereBadge: React.FC<YouAreHereBadgeProps> = ({
    nearestStarName,
    distanceToNearest,
    sectorName = 'Orion Arm • Sector 07',
    uiRefs
}) => {
    const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const copyRawCoords = (e: React.MouseEvent) => {
        e.stopPropagation();
        audioEngine.playUiClick();
        const x = uiRefs?.hudX?.current?.innerText || '0.0000';
        const y = uiRefs?.hudY?.current?.innerText || '0.0000';
        const z = uiRefs?.hudZ?.current?.innerText || '0.0000';
        const coords = `Cartesian: X=${x}, Y=${y}, Z=${z} | ${sectorName} | Near ${nearestStarName}`;

        navigator.clipboard.writeText(coords).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div 
            className="flex flex-col bg-[rgba(8,8,20,0.75)] backdrop-blur-xl border border-[rgba(126,184,255,0.25)] rounded-2xl p-2.5 shadow-[0_0_25px_rgba(8,8,20,0.8)] pointer-events-auto select-none font-mono text-[9px] group/location"
            role="region"
            aria-label="Current Location and You Are Here status"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#4ade80] animate-pulse shadow-[0_0_8px_#4ade80]" />
                    <div className="flex flex-col">
                        <span className="text-[8px] uppercase tracking-widest text-[#7EB8FF]/70 font-semibold">
                            YOU ARE HERE
                        </span>
                        <span className="text-white font-bold text-[10px]">
                            {sectorName}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 pl-2 border-l border-[rgba(126,184,255,0.15)]">
                    <div className="flex flex-col text-right">
                        <span className="text-[8px] uppercase tracking-wider text-[#7EB8FF]/60">Nearest Star</span>
                        <span className="text-[#C084FC] font-semibold">
                            {nearestStarName} <span className="text-white/60">({distanceToNearest})</span>
                        </span>
                    </div>

                    <button
                        onClick={() => {
                            audioEngine.playUiClick();
                            setIsTechnicalOpen(!isTechnicalOpen);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-[#7EB8FF]/60 hover:text-white transition-colors"
                        title="Toggle Technical Cartesian Coordinates"
                        aria-label="Toggle Technical Coordinates"
                    >
                        {isTechnicalOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                </div>
            </div>

            {/* Expandable Technical Coordinates Drawer */}
            {isTechnicalOpen && (
                <div className="mt-2 pt-2 border-t border-[rgba(126,184,255,0.15)] flex items-center justify-between text-[#7EB8FF]/80">
                    <div className="flex items-center gap-3">
                        <span>X: <strong className="text-white" ref={uiRefs?.hudX}>0.0000</strong></span>
                        <span>Y: <strong className="text-white" ref={uiRefs?.hudY}>0.0000</strong></span>
                        <span>Z: <strong className="text-white" ref={uiRefs?.hudZ}>0.0000</strong></span>
                    </div>
                    <button
                        onClick={copyRawCoords}
                        className="p-1 rounded hover:bg-white/10 text-[#7EB8FF] transition-colors"
                        title="Copy Raw Coordinates"
                        aria-label="Copy Raw Coordinates"
                    >
                        {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                </div>
            )}
        </div>
    );
};
