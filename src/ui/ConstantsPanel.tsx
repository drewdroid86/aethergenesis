import React, { useState } from 'react';
import { Settings2, X, RotateCcw } from 'lucide-react';

const DEFAULT_PHYSICS = {
    G: 1.0,
    alpha: 1.0,
    lambda: 1.0,
    c: 1.0,
    hbar: 1.0
};

interface ConstantsPanelProps {
    physics: {
        G: number;
        alpha: number;
        lambda: number;
        c: number;
        hbar: number;
    };
    setPhysics: (physics: any) => void;
}

export const ConstantsPanel: React.FC<ConstantsPanelProps> = ({ physics, setPhysics }) => {
    const [isOpen, setIsOpen] = useState(true);

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)} 
                className="absolute left-8 top-32 bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-full p-4 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto text-[#7EB8FF]/70 hover:text-white group focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
                title="Open Physical Constants"
                aria-label="Open Physical Constants"
            >
                <Settings2 size={24} className="group-hover:text-[#C084FC] transition-colors" />
            </button>
        );
    }

    return (
        <div className="absolute left-8 top-32 w-[min(320px,85vw)] bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]">
                <h2 className="text-sm font-bold tracking-widest uppercase text-white flex items-center gap-3">
                    <Settings2 size={20} className="text-[#C084FC]" />
                    Constants
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPhysics(DEFAULT_PHYSICS)}
                        className="text-[#7EB8FF]/50 hover:text-[#C084FC] transition-all focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 group/reset"
                        aria-label="Reset to Defaults"
                        title="Reset to Defaults"
                    >
                        <RotateCcw size={16} className="group-hover/reset:rotate-[-45deg] transition-transform" />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1"
                        aria-label="Close Physical Constants"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>
            <div className="space-y-4 text-xs font-mono">
                {/* G Slider */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-g">Gravitation (G)</label>
                        <span>{physics.G.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-g"
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={physics.G}
                        aria-describedby="desc-g"
                        onChange={e => setPhysics({...physics, G: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-g" className="text-[9px] text-[#7EB8FF]/50 mt-1">G ↑ stars collapse faster, G ↓ cold dwarfs</p>
                </div>
                {/* Alpha */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-alpha">Fine-Structure (α)</label>
                        <span>{physics.alpha.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-alpha"
                        type="range"
                        min="0.1"
                        max="2.0"
                        step="0.1"
                        value={physics.alpha}
                        aria-describedby="desc-alpha"
                        onChange={e => setPhysics({...physics, alpha: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-alpha" className="text-[9px] text-[#7EB8FF]/50 mt-1">α ↑ chemistry breaks, α ↓ radiation univ</p>
                </div>
                {/* Lambda */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-lambda">Cosmological (Λ)</label>
                        <span>{physics.lambda.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-lambda"
                        type="range"
                        min="0.1"
                        max="3.0"
                        step="0.1"
                        value={physics.lambda}
                        aria-describedby="desc-lambda"
                        onChange={e => setPhysics({...physics, lambda: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-lambda" className="text-[9px] text-[#7EB8FF]/50 mt-1">Λ ↑ space expands, Λ ↓ crunch</p>
                </div>
                {/* c */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-c">Speed of Light (c)</label>
                        <span>{physics.c.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-c"
                        type="range"
                        min="0.1"
                        max="3.0"
                        step="0.1"
                        value={physics.c}
                        aria-describedby="desc-c"
                        onChange={e => setPhysics({...physics, c: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-c" className="text-[9px] text-[#7EB8FF]/50 mt-1">c ↑ universe looks flatter</p>
                </div>
                {/* hbar */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-hbar">Planck Constant (ħ)</label>
                        <span>{physics.hbar.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-hbar"
                        type="range"
                        min="0.0"
                        max="3.0"
                        step="0.1"
                        value={physics.hbar}
                        aria-describedby="desc-hbar"
                        onChange={e => setPhysics({...physics, hbar: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-hbar" className="text-[9px] text-[#7EB8FF]/50 mt-1">ħ ↑ quantum foam visible</p>
                </div>
            </div>
        </div>
    );
};
