import React, { useState } from 'react';
import { Settings2, X, RotateCcw } from 'lucide-react';
import { DEFAULT_CONSTANTS, PhysicsConstants } from '../types/physics';

interface ConstantsPanelProps {
    physics: PhysicsConstants;
    setPhysics: React.Dispatch<React.SetStateAction<PhysicsConstants>>;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

export const ConstantsPanel: React.FC<ConstantsPanelProps> = ({ physics, setPhysics, isOpen, setIsOpen }) => {
    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)} 
                className="absolute left-8 top-32 bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-full p-4 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto text-[#7EB8FF]/70 hover:text-white group focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
                title="Open Physical Constants [C]"
                aria-label="Open Physical Constants"
            >
                <span className="absolute -right-2 -top-2 text-[8px] text-[#C084FC] bg-[#1a1a2e] border border-[#C084FC]/30 rounded px-1 opacity-0 group-hover:opacity-100 transition-opacity">[C]</span>
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
                <div className="flex items-center gap-2 group/header">
                    <button
                        onClick={() => setPhysics(DEFAULT_CONSTANTS)}
                        className="text-[#7EB8FF]/50 hover:text-[#C084FC] transition-all focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 group/reset"
                        aria-label="Reset to Defaults"
                        title="Reset to Defaults"
                    >
                        <RotateCcw size={16} className="group-hover/reset:rotate-[-45deg] transition-transform" />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 flex items-center gap-1"
                        aria-label="Close Physical Constants"
                        title="Close [Esc]"
                    >
                        <span className="text-[8px] text-[#C084FC] opacity-0 group-hover/header:opacity-100 transition-opacity hidden sm:inline">[Esc]</span>
                        <X size={20} />
                    </button>
                </div>
            </div>
            <div className="space-y-4 text-xs font-mono max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
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

                {/* Softening */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-softening">Softening (ε)</label>
                        <span>{physics.softening.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-softening"
                        type="range"
                        min="0.01"
                        max="1.0"
                        step="0.01"
                        value={physics.softening}
                        onChange={e => setPhysics({...physics, softening: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">Repulsion radius between close stars</p>
                </div>
                {/* Strong Force */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-strong">Strong Force</label>
                        <span>{physics.strongForce.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-strong"
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={physics.strongForce}
                        onChange={e => setPhysics({...physics, strongForce: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">Supernova explosion radius</p>
                </div>
                {/* Weak Force */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-weak">Weak Force</label>
                        <span>{physics.weakForce.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-weak"
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={physics.weakForce}
                        onChange={e => setPhysics({...physics, weakForce: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">Neutron star spin rate</p>
                </div>
                {/* Dark Matter */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-dm">Dark Matter</label>
                        <span>{physics.darkMatter.toFixed(2)}</span>
                    </div>
                    <input
                        id="slider-dm"
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={physics.darkMatter}
                        onChange={e => setPhysics({...physics, darkMatter: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">Background star density</p>
                </div>
                {/* Baryon */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-baryon">Baryon Ratio</label>
                        <span>{physics.baryon.toFixed(3)}</span>
                    </div>
                    <input
                        id="slider-baryon"
                        type="range"
                        min="0.01"
                        max="0.2"
                        step="0.01"
                        value={physics.baryon}
                        onChange={e => setPhysics({...physics, baryon: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">Star color temperature distribution</p>
                </div>
            </div>
        </div>
    );
};
