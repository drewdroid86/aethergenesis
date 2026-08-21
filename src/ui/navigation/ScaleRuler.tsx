import React from 'react';
import { Eye } from 'lucide-react';

interface ScaleRulerProps {
    formatted: string;
    widthPx: number;
    fovDeg: number;
}

export const ScaleRuler: React.FC<ScaleRulerProps> = ({ formatted, widthPx, fovDeg }) => {
    return (
        <div 
            className="flex flex-col items-end gap-1 select-none pointer-events-auto group/ruler"
            role="region"
            aria-label="Optical scale and field of view"
            title={`Optical Field of View: ${fovDeg}°`}
        >
            <div className="flex items-center gap-2 text-[9px] font-mono text-[#7EB8FF]/70 uppercase tracking-wider">
                <span className="flex items-center gap-1 opacity-70 group-hover/ruler:opacity-100 transition-opacity">
                    <Eye size={10} className="text-[#C084FC]" />
                    FOV {fovDeg}°
                </span>
                <span className="text-white font-semibold">{formatted}</span>
            </div>

            {/* Sci-Fi Optical Bracket Ruler */}
            <div 
                className="h-2.5 flex items-center justify-between relative border-x border-[#C084FC] transition-all duration-200"
                style={{ width: `${Math.max(50, widthPx)}px` }}
            >
                {/* Horizontal ruler bar with center tick */}
                <div className="w-full h-[1px] bg-gradient-to-r from-[#C084FC]/40 via-[#7EB8FF] to-[#C084FC]/40" />
                <div className="absolute left-1/2 -translate-x-1/2 w-[1px] h-1.5 bg-[#C084FC]/80" />
                
                {/* Left/Right end brackets */}
                <div className="absolute left-0 top-0 w-1 h-full border-l-2 border-t-2 border-b-2 border-[#C084FC] opacity-60" />
                <div className="absolute right-0 top-0 w-1 h-full border-r-2 border-t-2 border-b-2 border-[#C084FC] opacity-60" />
            </div>
        </div>
    );
};
