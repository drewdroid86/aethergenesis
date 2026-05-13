import { useRef } from 'react';
import { useSimulation } from '../utils/hooks/useSimulation';
import { Hud } from '../ui/Hud';
import { InspectPanel } from '../ui/InspectPanel';
import { ConstantsPanel } from '../ui/ConstantsPanel';

export function AetherGenesis() {
  const mountRef = useRef<HTMLDivElement>(null);
  const {
    selectedStar,
    setSelectedStar,
    isPaused,
    setIsPaused,
    fatalError,
    hudRefs,
    uiRefs,
    physics,
    setPhysics,
    cosmicAge,
    isPlayingCosmic,
    setIsPlayingCosmic,
    currentTier,
    fps,
    showTierDownIndicator,
    onScrubStart,
    onScrubMove,
    onScrubEnd,
    onGlobalScrubStart,
    onGlobalScrubMove,
    onGlobalScrubEnd,
    resetCamera
  } = useSimulation(mountRef);

  if (fatalError) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-red-500 font-mono p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">CRITICAL SIMULATION ERROR</h1>
          <p className="text-sm opacity-80">{fatalError}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 px-6 py-2 border border-red-500 hover:bg-red-500 hover:text-white transition-colors uppercase tracking-widest text-xs"
          >
            Reset Engine
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none">
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair z-0" />
      
      <Hud 
        uiRefs={hudRefs}
        cosmicAge={cosmicAge}
        isPlayingCosmic={isPlayingCosmic}
        setIsPlayingCosmic={setIsPlayingCosmic}
        onGlobalScrubStart={onGlobalScrubStart}
        onGlobalScrubMove={onGlobalScrubMove}
        onGlobalScrubEnd={onGlobalScrubEnd}
        resetCamera={resetCamera}
        performance={{
            tier: currentTier,
            numStars: 0, // This could be improved if Engine exposed it
            fps: fps,
            showIndicator: showTierDownIndicator
        }}
      />

      {selectedStar && (
        <InspectPanel 
            selectedStar={selectedStar}
            setSelectedStar={setSelectedStar}
            isPaused={isPaused}
            setIsPaused={setIsPaused}
            physics={physics}
            onScrubStart={onScrubStart}
            onScrubMove={onScrubMove}
            onScrubEnd={onScrubEnd}
            uiRefs={uiRefs}
        />
      )}

      <ConstantsPanel 
        physics={physics}
        setPhysics={setPhysics}
      />

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,5,0.6)_100%)]" />
    </div>
  );
}
