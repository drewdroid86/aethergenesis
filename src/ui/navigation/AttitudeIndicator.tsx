import React, { useState } from 'react';
import { AttitudeTelemetry } from '../../types/navigation';
import { Compass, Navigation, Radio, Copy, Check } from 'lucide-react';
import { audioEngine } from '../../audio/AudioEngine';
import { ScaleRuler } from './ScaleRuler';

interface AttitudeIndicatorProps {
    telemetry: AttitudeTelemetry;
    uiRefs?: {
        hudX?: React.RefObject<HTMLSpanElement | null>;
        hudY?: React.RefObject<HTMLSpanElement | null>;
        hudZ?: React.RefObject<HTMLSpanElement | null>;
    };
}

export const AttitudeIndicator: React.FC<AttitudeIndicatorProps> = ({ telemetry, uiRefs }) => {
    const [showRawCoords, setShowRawCoords] = useState(false);
    const [copied, setCopied] = useState(false);

    const copyTelemetry = () => {
        audioEngine.playUiClick();
        const text = `Navigation Attitude:
Heading: ${telemetry.headingDeg}° | Pitch: ${telemetry.pitchDeg}°
Plane Altitude: ${telemetry.altitudeFormatted}
Target: ${telemetry.targetName} (${telemetry.distanceToTargetFormatted})
Optical Scale: ${telemetry.scaleRulerFormatted} (FOV ${telemetry.fovDeg}°)`;

        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div 
            className="flex flex-col gap-2 font-mono text-[10px] text-[#7EB8FF]/70 bg-[rgba(8,8,20,0.65)] backdrop-blur-xl border border-[rgba(126,184,255,0.2)] rounded-2xl p-4 shadow-[0_0_30px_rgba(8,8,20,0.8)] pointer-events-auto select-none group/attitude w-full max-w-[190px]"
            role="region"
            aria-label="Spatial Orientation & Attitude Telemetry"
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-[rgba(126,184,255,0.15)]">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C084FC] animate-pulse shadow-[0_0_6px_#C084FC]" />
                    <span className="uppercase tracking-widest text-[#7EB8FF] font-bold">Spatial Navigation</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowRawCoords(!showRawCoords)}
                        className="text-[8px] uppercase tracking-wider text-[#C084FC] hover:text-white bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded border border-[#C084FC]/30 transition-colors"
                        title="Toggle between Human-Readable Spatial Metrics and Raw Cartesian XYZ"
                    >
                        {showRawCoords ? 'NAV MODE' : 'XYZ RAW'}
                    </button>
                    <button
                        onClick={copyTelemetry}
                        className="text-[#7EB8FF]/50 hover:text-white transition-colors p-0.5 outline-none rounded"
                        title="Copy Flight Telemetry"
                        aria-label={copied ? "Telemetry Copied" : "Copy Telemetry"}
                    >
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                </div>
            </div>

            {/* Content Display */}
            {!showRawCoords ? (
                /* Human-Readable Spatial Awareness Deck */
                <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-white">
                        <span className="text-[#7EB8FF]/70 flex items-center gap-1.5">
                            <Radio size={11} className="text-[#C084FC]" />
                            Target Range:
                        </span>
                        <span className="font-bold text-[#C084FC]">{telemetry.distanceToTargetFormatted}</span>
                    </div>

                    <div className="flex justify-between items-center text-white">
                        <span className="text-[#7EB8FF]/70 flex items-center gap-1.5">
                            <Navigation size={11} className="text-[#7EB8FF]" />
                            Plane Altitude:
                        </span>
                        <span className="font-medium">{telemetry.altitudeFormatted}</span>
                    </div>

                    <div className="flex justify-between items-center text-white">
                        <span className="text-[#7EB8FF]/70 flex items-center gap-1.5">
                            <Compass size={11} className="text-[#7EB8FF]" />
                            Attitude (Yaw / Pitch):
                        </span>
                        <span className="font-medium">{telemetry.headingDeg}° / {telemetry.pitchDeg >= 0 ? `+${telemetry.pitchDeg}` : telemetry.pitchDeg}°</span>
                    </div>

                    {/* Integrated Optical Scale Bar */}
                    <div className="pt-2 mt-2 border-t border-[rgba(126,184,255,0.1)] flex justify-between items-center">
                        <span className="text-[9px] uppercase tracking-wider text-[#7EB8FF]/60">Optical Scale</span>
                        <ScaleRuler 
                            formatted={telemetry.scaleRulerFormatted} 
                            widthPx={telemetry.scaleRulerWidthPx} 
                            fovDeg={telemetry.fovDeg} 
                        />
                    </div>
                </div>
            ) : (
                /* Raw Cartesian XYZ Fallback (preserved for engine debugging) */
                <div className="space-y-1 pt-1 font-mono text-[10px]">
                    <div className="text-white flex justify-between"><span className="text-[#7EB8FF]/70">POS_X:</span><span ref={uiRefs?.hudX}>0.0000</span></div>
                    <div className="text-white flex justify-between"><span className="text-[#7EB8FF]/70">POS_Y:</span><span ref={uiRefs?.hudY}>0.0000</span></div>
                    <div className="text-white flex justify-between"><span className="text-[#7EB8FF]/70">POS_Z:</span><span ref={uiRefs?.hudZ}>0.0000</span></div>
                </div>
            )}
        </div>
    );
};
