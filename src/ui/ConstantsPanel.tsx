import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Settings2, X, RotateCcw, Copy, Check } from 'lucide-react';
import { DEFAULT_CONSTANTS, PhysicsConstants } from '../types/physics';

interface ConstantsPanelProps {
    physics: PhysicsConstants;
    setPhysics: React.Dispatch<React.SetStateAction<PhysicsConstants>>;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    currentSeed: string;
}

export const ConstantsPanel: React.FC<ConstantsPanelProps> = ({
    physics,
    setPhysics,
    isOpen,
    setIsOpen,
    currentSeed
}) => {
    const [resetFeedback, setResetFeedback] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleReset = () => {
        setPhysics(DEFAULT_CONSTANTS);
        setResetFeedback(true);
        setTimeout(() => setResetFeedback(false), 2000);
    };

    const copySeed = () => {
        navigator.clipboard.writeText(currentSeed).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (!isOpen) {
        return (
            <motion.button
                key="closed"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setIsOpen(true)} 
                className="absolute left-8 top-32 bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-full p-4 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] pointer-events-auto text-[#7EB8FF]/70 hover:text-white group focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none relative"
                title="Open Physical Constants"
                aria-label="Open Physical Constants"
                aria-keyshortcuts="c"
            >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity whitespace-nowrap">
                    [C] Open
                </span>
                <Settings2 size={24} className="group-hover:text-[#C084FC] transition-colors" />
            </motion.button>
        );
    }

    return (
        <motion.div
            key="open"
            initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute left-8 top-32 w-[min(320px,85vw)] bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto"
        >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]">
                <h2 className="text-sm font-bold tracking-widest uppercase text-white flex items-center gap-3">
                    <Settings2 size={20} className="text-[#C084FC]" />
                    Constants
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copySeed}
                        className="text-[#7EB8FF]/50 hover:text-[#C084FC] transition-all focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 relative group/copy"
                        aria-label={copied ? "Universe Seed Copied" : "Copy Universe Seed"}
                        title="Copy Seed"
                    >
                        <span className={`absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] transition-opacity whitespace-nowrap ${copied ? 'opacity-100' : 'opacity-0 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100'}`}>
                            {copied ? 'Copied!' : 'Copy Seed'}
                        </span>
                        {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                    <button
                        onClick={handleReset}
                        className="text-[#7EB8FF]/50 hover:text-[#C084FC] transition-all focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 relative group/reset"
                        aria-label="Reset to Defaults"
                        title="Reset to Defaults"
                        aria-keyshortcuts="Alt+r"
                    >
                        <span className={`absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] transition-opacity whitespace-nowrap ${resetFeedback ? 'opacity-100' : 'opacity-0 group-hover/reset:opacity-100 group-focus-visible/reset:opacity-100'}`}>
                            {resetFeedback ? 'Reset!' : '[Alt+R] Reset'}
                        </span>
                        <RotateCcw size={16} className={`group-hover/reset:rotate-[-45deg] transition-transform ${resetFeedback ? 'text-green-400' : ''}`} />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded p-1 relative group/close"
                        aria-label="Close Physical Constants"
                        aria-keyshortcuts="c"
                        title="Close [C]"
                    >
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/close:opacity-100 group-focus-visible/close:opacity-100 transition-opacity whitespace-nowrap">
                            [C] Close
                        </span>
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
                        aria-describedby="desc-softening"
                        onChange={e => setPhysics({...physics, softening: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-softening" className="text-[9px] text-[#7EB8FF]/50 mt-1">Repulsion radius between close stars</p>
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
                        aria-describedby="desc-strong"
                        onChange={e => setPhysics({...physics, strongForce: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-strong" className="text-[9px] text-[#7EB8FF]/50 mt-1">Supernova explosion radius</p>
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
                        aria-describedby="desc-weak"
                        onChange={e => setPhysics({...physics, weakForce: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-weak" className="text-[9px] text-[#7EB8FF]/50 mt-1">Neutron star spin rate</p>
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
                        aria-describedby="desc-dm"
                        onChange={e => setPhysics({...physics, darkMatter: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-dm" className="text-[9px] text-[#7EB8FF]/50 mt-1">Background star density</p>
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
                        aria-describedby="desc-baryon"
                        onChange={e => setPhysics({...physics, baryon: parseFloat(e.target.value)})}
                        className="w-full accent-[#C084FC] cursor-pointer"
                    />
                    <p id="desc-baryon" className="text-[9px] text-[#7EB8FF]/50 mt-1">Star color temperature distribution</p>
                </div>
            </div>
        </motion.div>
    );
};
