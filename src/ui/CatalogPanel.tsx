import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, X, Sparkles, Database } from 'lucide-react';

interface CatalogPanelProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    loadStarPreset: (preset: any) => void;
    addBodyToSimulation: (elements: any) => void;
}

export const CatalogPanel: React.FC<CatalogPanelProps> = ({
    isOpen,
    setIsOpen,
    loadStarPreset,
    addBodyToSimulation
}) => {
    const [activeTab, setActiveTab] = useState<'presets' | 'search' | 'horizons'>('presets');
    const [presets, setPresets] = useState<any[]>([]);
    
    // Search fields
    const [spectralClass, setSpectralClass] = useState('');
    const [massMin, setMassMin] = useState('');
    const [massMax, setMassMax] = useState('');
    const [distanceMax, setDistanceMax] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    // Small bodies fields
    const [sbType, setSbType] = useState<'comet' | 'asteroid'>('comet');
    const [smallBodies, setSmallBodies] = useState<any[]>([]);
    const [loadingHorizons, setLoadingHorizons] = useState(false);

    // Fetch presets on load
    useEffect(() => {
        if (isOpen && activeTab === 'presets' && presets.length === 0) {
            fetch('/api/catalog/presets')
                .then(res => res.json())
                .then(data => setPresets(data))
                .catch(err => console.error("Error loading presets:", err));
        }
    }, [isOpen, activeTab, presets.length]);

    // Handle catalog search
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setSearching(true);
        try {
            const params = new URLSearchParams();
            if (spectralClass) params.append('spectral_class', spectralClass);
            if (massMin) params.append('mass_min_solar', massMin);
            if (massMax) params.append('mass_max_solar', massMax);
            if (distanceMax) params.append('distance_max_ly', distanceMax);
            
            const res = await fetch(`/api/catalog/search?${params.toString()}`);
            const data = await res.json();
            setSearchResults(data);
        } catch (err) {
            console.error("Error searching stars:", err);
        } finally {
            setSearching(false);
        }
    };

    // Handle horizons fetch
    const handleLoadHorizons = async () => {
        setLoadingHorizons(true);
        try {
            const res = await fetch(`/api/horizons/search?type=${sbType}&limit=15`);
            const data = await res.json();
            setSmallBodies(data);
        } catch (err) {
            console.error("Error querying JPL Horizons:", err);
        } finally {
            setLoadingHorizons(false);
        }
    };

    useEffect(() => {
        if (isOpen && activeTab === 'horizons') {
            handleLoadHorizons();
        }
    }, [isOpen, activeTab, sbType]);

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute left-8 top-52 w-[350px] bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5 z-30 shadow-2xl text-white pointer-events-auto"
        >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    <Database size={18} className="text-purple-400" />
                    Catalog & Presets
                </h2>
                <button onClick={() => setIsOpen(false)} className="hover:text-red-400 transition-colors">
                    <X size={18} />
                </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 mb-4 bg-black/30 p-1 rounded-lg">
                {(['presets', 'search', 'horizons'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 text-center py-1.5 rounded-md text-xs font-mono capitalize transition-all ${
                            activeTab === tab ? 'bg-purple-600/30 text-white font-bold' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Panels */}
            <div className="max-h-[50vh] overflow-y-auto pr-1 font-mono text-xs custom-scrollbar">
                {activeTab === 'presets' && (
                    <div className="space-y-3">
                        {presets.map(p => (
                            <div key={p.name} className="p-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between">
                                <div>
                                    <div className="font-bold flex items-center gap-1">
                                        <Sparkles size={12} className="text-yellow-400" />
                                        {p.name}
                                    </div>
                                    <div className="text-[10px] text-gray-400">Class: {p.spectral_class} | Mass: {p.mass_solar}M☉</div>
                                </div>
                                <button
                                    onClick={() => loadStarPreset(p)}
                                    className="px-3 py-1 rounded bg-purple-600/20 hover:bg-purple-600/40 text-xs border border-purple-500/40 text-purple-200 transition-all font-semibold"
                                >
                                    Load
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'search' && (
                    <div>
                        <form onSubmit={handleSearch} className="space-y-3 mb-4">
                            <div>
                                <label className="block text-[10px] text-gray-400 mb-1">Spectral Class Prefix (O, B, A, F, G, K, M)</label>
                                <input
                                    type="text"
                                    value={spectralClass}
                                    onChange={e => setSpectralClass(e.target.value)}
                                    placeholder="e.g. G2, M5"
                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 outline-none text-white focus:border-purple-500/60"
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-gray-400 mb-1">Min Mass (M☉)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={massMin}
                                        onChange={e => setMassMin(e.target.value)}
                                        placeholder="0.1"
                                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 outline-none text-white"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] text-gray-400 mb-1">Max Mass (M☉)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={massMax}
                                        onChange={e => setMassMax(e.target.value)}
                                        placeholder="20.0"
                                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 outline-none text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-400 mb-1">Max Distance (Light Years)</label>
                                <input
                                    type="number"
                                    value={distanceMax}
                                    onChange={e => setDistanceMax(e.target.value)}
                                    placeholder="50"
                                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 outline-none text-white"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={searching}
                                className="w-full bg-purple-600/30 hover:bg-purple-600/50 text-white py-1.5 rounded transition-all font-bold border border-purple-500/50 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <Search size={14} />
                                {searching ? 'Searching SIMBAD...' : 'Search Stars'}
                            </button>
                        </form>

                        <div className="space-y-2">
                            {searchResults.map(star => (
                                <div key={star.name} className="p-2.5 bg-black/20 border border-white/5 rounded-lg flex justify-between items-center">
                                    <div>
                                        <div className="font-semibold">{star.name}</div>
                                        <div className="text-[9px] text-gray-400">Class: {star.spectral_class} | Dist: {star.distance_ly || 'Unknown'} ly</div>
                                    </div>
                                    <button
                                        onClick={() => loadStarPreset(star)}
                                        className="px-2 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-[10px]"
                                    >
                                        Load
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'horizons' && (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSbType('comet')}
                                className={`flex-1 py-1 rounded border text-[10px] transition-all ${
                                    sbType === 'comet' ? 'bg-sky-600/20 border-sky-500' : 'border-white/10 text-gray-400'
                                }`}
                            >
                                Comets
                            </button>
                            <button
                                onClick={() => setSbType('asteroid')}
                                className={`flex-1 py-1 rounded border text-[10px] transition-all ${
                                    sbType === 'asteroid' ? 'bg-sky-600/20 border-sky-500' : 'border-white/10 text-gray-400'
                                }`}
                            >
                                Asteroids
                            </button>
                        </div>

                        {loadingHorizons ? (
                            <div className="text-center py-6 text-gray-400">Loading JPL Horizons Catalog...</div>
                        ) : (
                            <div className="space-y-2">
                                {smallBodies.map(body => (
                                    <div key={body.naif_id} className="p-2.5 bg-black/20 border border-white/5 rounded-lg flex justify-between items-center">
                                        <div>
                                            <div className="font-semibold text-sky-200">{body.name}</div>
                                            <div className="text-[9px] text-gray-400">
                                                Ecc: {body.eccentricity.toFixed(3)} | Perihelion: {body.perihelion_au.toFixed(2)} AU
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => addBodyToSimulation(body)}
                                            className="px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-[10px]"
                                        >
                                            Spawn
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};
