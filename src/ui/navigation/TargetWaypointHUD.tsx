import React from 'react';
import { motion } from 'motion/react';
import { Navigation } from 'lucide-react';
import { TargetWaypoint } from '../../types/navigation';
import { audioEngine } from '../../audio/AudioEngine';

interface TargetWaypointHUDProps {
    waypoint: TargetWaypoint | null;
    onAlignCamera: () => void;
}

export const TargetWaypointHUD: React.FC<TargetWaypointHUDProps> = ({ waypoint, onAlignCamera }) => {
    if (!waypoint) return null;

    const handleAlignClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        audioEngine.playUiClick();
        onAlignCamera();
    };

    if (waypoint.isOnScreen) {
        // Render In-Frustum Target Lock Bracket
        return (
            <div 
                className="fixed pointer-events-none z-15 -translate-x-1/2 -translate-y-1/2 select-none transition-all duration-75 ease-out"
                style={{ 
                    left: `${(waypoint.screenX * 100).toFixed(2)}vw`, 
                    top: `${(waypoint.screenY * 100).toFixed(2)}vh` 
                }}
            >
                <div className="relative flex flex-col items-center">
                    {/* Targeting Reticle Brackets */}
                    <div className="w-14 h-14 relative flex items-center justify-center">
                        <div className="absolute inset-0 border border-[#C084FC]/30 rounded-full animate-ping opacity-20" />
                        <div className="absolute inset-2 border border-[#7EB8FF]/60 rounded-full" />
                        
                        {/* 4 Corner Crosshair Ticks */}
                        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#C084FC]" />
                        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#C084FC]" />
                        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#C084FC]" />
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#C084FC]" />
                        <div className="w-1.5 h-1.5 bg-[#C084FC] rounded-full animate-pulse shadow-[0_0_8px_#C084FC]" />
                    </div>
                </div>
            </div>
        );
    }

    // Render Off-Screen Directional Indicator docked at screen border
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed pointer-events-auto z-25 -translate-x-1/2 -translate-y-1/2 select-none group/waypoint"
            style={{ 
                left: `${(waypoint.screenX * 100).toFixed(2)}vw`, 
                top: `${(waypoint.screenY * 100).toFixed(2)}vh` 
            }}
        >
            <button
                onClick={handleAlignClick}
                className="flex items-center gap-2 bg-[rgba(8,8,20,0.85)] hover:bg-[rgba(16,16,36,0.95)] backdrop-blur-xl border border-[#C084FC]/50 hover:border-[#C084FC] px-2.5 py-1 rounded-full shadow-[0_0_20px_rgba(192,132,252,0.3)] transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#C084FC]"
                title={`Click or press [F] to align camera with ${waypoint.targetName}`}
                aria-label={`Target off-screen: ${waypoint.targetName} at ${waypoint.distanceFormatted}. Click to align camera.`}
            >
                {/* Rotating Directional Chevron pointing toward target */}
                <div 
                    className="w-5 h-5 flex items-center justify-center bg-[#C084FC]/20 rounded-full text-[#C084FC] transition-transform duration-100"
                    style={{ transform: `rotate(${waypoint.angleDeg - 90}deg)` }}
                >
                    <Navigation size={12} className="fill-[#C084FC]" />
                </div>

                <div className="flex flex-col items-start font-mono text-[9px] leading-tight">
                    <div className="flex items-center gap-1 text-white font-bold">
                        <span>{waypoint.targetName}</span>
                        <span className="text-[#C084FC] text-[8px]">({waypoint.bearingDeg}°)</span>
                    </div>
                    <span className="text-[#7EB8FF]/80">{waypoint.distanceFormatted}</span>
                </div>
            </button>
        </motion.div>
    );
};
