import { useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useSimulation } from '../utils/hooks/useSimulation';
import { Hud } from '../ui/Hud';
import { InspectPanel } from '../ui/InspectPanel';
import { ConstantsPanel } from '../ui/ConstantsPanel';
import { AstrobiologyPanel } from '../ui/AstrobiologyPanel';

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
    isConstantsOpen,
    setIsConstantsOpen,
    currentTier, 
    fps, 
    showTierDownIndicator, 
    numHeroStars,
    currentSeed,
    onScrubStart,
    onScrubMove,
    onScrubEnd,
    onGlobalScrubStart,
    onGlobalScrubMove,
    onGlobalScrubEnd,
    onKeyDown,
    resetCamera,
    centerOnStar,
    timeScale,
    setTimeScale,
    astrobiologyData
  } = useSimulation(mountRef);

  if (fatalError) {
    return (
      <div className="relative w-full h-screen bg-[#020205] overflow-hidden flex flex-col items-center justify-center font-sans text-white select-none p-6">
        <div className="max-w-md w-full border border-red-500/40 bg-red-950/40 rounded-lg p-6 shadow-lg">
          <h1 className="text-lg font-semibold text-red-300 mb-2">Simulation failed to start</h1>
          <p className="text-sm text-red-100/90 break-words mb-4">{fatalError}</p>
          <button
            type="button"
            className="px-4 py-2 rounded bg-red-600/80 hover:bg-red-500 text-sm font-medium pointer-events-auto"
            onClick={() => window.location.reload()}
          >
            Reload
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
        timeScale={timeScale}
        setTimeScale={setTimeScale}
        onGlobalScrubStart={onGlobalScrubStart}
        onGlobalScrubMove={onGlobalScrubMove}
        onGlobalScrubEnd={onGlobalScrubEnd}
        onKeyDown={(e) => onKeyDown(e, true)}
        resetCamera={resetCamera}
        centerOnStar={centerOnStar}
        performance={{
            tier: currentTier,
            numStars: numHeroStars,
            fps: fps,
            showIndicator: showTierDownIndicator
        }}
        currentSeed={currentSeed}
      />

      <AnimatePresence>
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
              onKeyDown={(e) => onKeyDown(e, false)}
              uiRefs={uiRefs}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedStar && astrobiologyData.length > 0 && (
            <AstrobiologyPanel
                data={astrobiologyData}
                selectedStar={selectedStar}
                onClose={() => setSelectedStar(null)}
            />
        )}
      </AnimatePresence>

      <ConstantsPanel 
        physics={physics}
        setPhysics={setPhysics}
        isOpen={isConstantsOpen}
        setIsOpen={setIsConstantsOpen}
      />

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,5,0.6)_100%)]" />
    </div>
  );
}
