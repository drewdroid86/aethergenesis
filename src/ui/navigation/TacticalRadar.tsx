import React, { useState } from 'react';
import { RadarContact } from '../../types/navigation';
import { audioEngine } from '../../audio/AudioEngine';
import { Compass } from 'lucide-react';

interface TacticalRadarProps {
    contacts: RadarContact[];
    selectedTargetName?: string;
    onSelectContact?: (id: string) => void;
    rangeAU?: number;
    onRangeChange?: (newRange: number) => void;
}

const SPECTRAL_COLORS: Record<string, string> = {
    O: '#93c5fd', // Blue
    B: '#bfdbfe', // Blue-white
    A: '#ffffff', // White
    F: '#fef08a', // Yellow-white
    G: '#facc15', // Yellow (Sun-like)
    K: '#fb923c', // Orange
    M: '#f87171', // Red
};

export const TacticalRadar: React.FC<TacticalRadarProps> = ({
    contacts,
    selectedTargetName: _selectedTargetName,
    onSelectContact,
    rangeAU = 100,
    onRangeChange
}) => {
    const [currentRange, setCurrentRange] = useState(rangeAU);

    const toggleRange = () => {
        audioEngine.playUiClick();
        const ranges = [25, 100, 500, 2500];
        const nextIdx = (ranges.indexOf(currentRange) + 1) % ranges.length;
        const next = ranges[nextIdx];
        setCurrentRange(next);
        onRangeChange?.(next);
    };

    const radarRadiusPx = 54;
    const centerPx = 60;

    return (
        <div 
            className="flex flex-col items-center bg-[rgba(8,8,20,0.75)] backdrop-blur-xl border border-[rgba(126,184,255,0.25)] rounded-2xl p-2.5 shadow-[0_0_25px_rgba(8,8,20,0.9)] select-none pointer-events-auto group/radar w-full max-w-[190px]"
            role="region"
            aria-label="Tactical Proximity Radar"
        >
            {/* Header */}
            <div className="flex items-center justify-between w-full mb-1.5 px-1">
                <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-[#7EB8FF]">
                    <Compass size={11} className="text-[#C084FC] animate-spin-slow" />
                    <span>Tactical Radar</span>
                </div>
                <button
                    onClick={toggleRange}
                    className="text-[8px] font-mono uppercase text-[#C084FC] hover:text-white bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded border border-[#C084FC]/30 transition-colors"
                    title="Cycle Radar Detection Range"
                    aria-label={`Radar range: ${currentRange} AU. Click to cycle.`}
                >
                    {currentRange >= 1000 ? `${(currentRange / 1000).toFixed(1)}k AU` : `${currentRange} AU`}
                </button>
            </div>

            {/* Radar Scope Display */}
            <div className="relative w-[120px] h-[120px] rounded-full bg-[radial-gradient(circle_at_center,rgba(192,132,252,0.08)_0%,rgba(8,8,24,0.9)_100%)] border border-[#7EB8FF]/30 overflow-hidden shadow-[inset_0_0_15px_rgba(0,0,0,0.8)]">
                {/* Concentric Range Rings */}
                <div className="absolute inset-[25%] rounded-full border border-dashed border-[#7EB8FF]/15 pointer-events-none" />
                <div className="absolute inset-[50%] rounded-full border border-[#7EB8FF]/20 pointer-events-none" />
                <div className="absolute inset-[75%] rounded-full border border-dashed border-[#7EB8FF]/15 pointer-events-none" />
                
                {/* Crosshairs */}
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#7EB8FF]/15 -translate-x-1/2 pointer-events-none" />
                <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-[#7EB8FF]/15 -translate-y-1/2 pointer-events-none" />

                {/* Camera View Frustum Cone (Forward is Top/Y-axis) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 120 120">
                    <polygon 
                        points="60,60 30,0 90,0" 
                        fill="url(#frustumGrad)" 
                        opacity="0.3"
                    />
                    <defs>
                        <linearGradient id="frustumGrad" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="#C084FC" stopOpacity="0.1" />
                            <stop offset="100%" stopColor="#7EB8FF" stopOpacity="0.4" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Center Observer Vessel / Camera */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#C084FC] shadow-[0_0_8px_#C084FC] pointer-events-none z-10" />

                {/* Radar Contact Blips */}
                {contacts.map((contact) => {
                    const posX = centerPx + contact.relX * radarRadiusPx;
                    const posY = centerPx + contact.relY * radarRadiusPx;
                    const color = SPECTRAL_COLORS[contact.spectralClass] || '#ffffff';

                    return (
                        <button
                            key={contact.id}
                            onClick={() => {
                                audioEngine.playUiClick();
                                onSelectContact?.(contact.id);
                            }}
                            className={`absolute -translate-x-1/2 -translate-y-1/2 group/blip outline-none cursor-pointer transition-transform hover:scale-150 ${contact.isSelected ? 'z-20' : 'z-10'}`}
                            style={{ left: `${posX}px`, top: `${posY}px` }}
                            title={`${contact.name} (${contact.spectralClass}-Type) • ${contact.distanceFormatted}`}
                            aria-label={`${contact.name}, ${contact.distanceFormatted}`}
                        >
                            {/* Selected Pulse Ring */}
                            {contact.isSelected && (
                                <div className="absolute -inset-1.5 rounded-full border border-[#C084FC] animate-ping opacity-75 pointer-events-none" />
                            )}

                            {/* Contact Dot */}
                            <div 
                                className={`rounded-full transition-all ${contact.isSelected ? 'w-2.5 h-2.5 ring-1 ring-white shadow-[0_0_8px_#C084FC]' : 'w-1.5 h-1.5 opacity-80 group-hover/blip:opacity-100'}`}
                                style={{ backgroundColor: color }}
                            />
                        </button>
                    );
                })}
            </div>

            {/* Selected Target readout */}
            <div className="mt-1.5 text-[8px] font-mono text-center text-[#7EB8FF]/70 truncate max-w-[120px]">
                {contacts.length} Contacts In Scan
            </div>
        </div>
    );
};
