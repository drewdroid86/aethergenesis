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
    setFatalError,
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
    centerOnStar
  } = useSimulation(mountRef);

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
