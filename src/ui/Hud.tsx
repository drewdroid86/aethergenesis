import React from 'react';
import { Crosshair, Navigation } from 'lucide-react';

interface HudProps {
    uiRefs: {
        hudX: React.RefObject<HTMLSpanElement | null>;
        hudY: React.RefObject<HTMLSpanElement | null>;
        hudZ: React.RefObject<HTMLSpanElement | null>;
        hudAge: React.RefObject<HTMLSpanElement | null>;
    };
}

export const Hud: React.FC<HudProps> = ({ uiRefs }) => {
    return (
        <>
            {/* Top HUD */}
            <nav className="absolute top-0 w-full p-8 flex justify-between items-start z-20 pointer-events-none">
                <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_#C084FC]"></div>
                    <h1 className="text-xl font-bold tracking-[0.3em] uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    ÆTHERGENESIS
                    </h1>
                </div>
                <span className="text-[10px] text-[#7EB8FF]/70 uppercase tracking-[0.2em] ml-6">
                    Simulation Phase 02: Stellar Genesis
                </span>
                </div>
                
                <div className="flex items-center gap-12 bg-[rgba(8,8,20,0.6)] backdrop-blur-md border border-[rgba(126,184,255,0.2)] rounded-full px-6 py-3">
                <div className="flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Background Mass</span>
                    <span className="font-mono text-sm">50,000 <span className="text-[#C084FC]">★</span></span>
                </div>
                <div className="w-[1px] h-6 bg-[rgba(126,184,255,0.2)]"></div>
                <div className="flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Simulation Subjects</span>
                    <span className="font-mono text-sm">12 Hero Stars</span>
                </div>
                </div>
            </nav>

            {/* Bottom HUD */}
            <div className="absolute bottom-0 w-full p-8 flex justify-between items-end z-20 pointer-events-none">
                <div className="font-mono text-[10px] text-[#7EB8FF]/60 space-y-1 border-l border-[#C084FC]/50 pl-4 bg-[rgba(8,8,20,0.4)] backdrop-blur-md py-3 pr-4 rounded-r border-y-0 border-r-0">
                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-[rgba(126,184,255,0.2)]">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#C084FC] animate-pulse shadow-[0_0_5px_#C084FC]" />
                    <span className="uppercase tracking-widest text-[#7EB8FF]">Location</span>
                </div>
                <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_X:</span><span ref={uiRefs.hudX}>0.0000</span></div>
                <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Y:</span><span ref={uiRefs.hudY}>0.0000</span></div>
                <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Z:</span><span ref={uiRefs.hudZ}>0.0000</span></div>
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
                <div className="px-12 py-4 bg-[rgba(8,8,20,0.6)] backdrop-blur-2xl border border-[rgba(126,184,255,0.2)] rounded-full flex flex-col items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Global Cosmic Age (Gyr)</span>
                    <span className="font-mono text-2xl font-light tracking-wider" ref={uiRefs.hudAge}>13.8000</span>
                </div>
                <p className="text-[10px] text-[#7EB8FF]/50 italic text-center max-w-sm">"Select any anomalous star to inspect its lifecycle. Use mouse to rotate."</p>
                </div>

                <div className="flex flex-col items-end gap-2 text-right">
                <div className="grid grid-cols-2 gap-2 pointer-events-auto">
                    <button className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus:outline-none" aria-label="Reset Camera" title="Reset Camera">
                    <Crosshair size={16} className="text-[#7EB8FF]" />
                    </button>
                    <button className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus:outline-none" aria-label="Center on Star" title="Center on Star">
                    <Navigation size={16} className="text-[#C084FC]" />
                    </button>
                </div>
                <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]/60 mt-1">Stellar Raycasting Active</span>
                </div>
            </div>
        </>
    );
};
