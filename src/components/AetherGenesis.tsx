import { useRef, useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { useSimulation } from '../utils/hooks/useSimulation';
import { Hud, CosmicAgeCard, HudActionButtons } from '../ui/Hud';
import { InspectPanel } from '../ui/InspectPanel';
import { ConstantsPanel } from '../ui/ConstantsPanel';
import { AstrobiologyPanel } from '../ui/AstrobiologyPanel';
import { CatalogPanel } from '../ui/CatalogPanel';
import { NavigationDeck } from '../ui/navigation/NavigationDeck';
import { BottomHud } from '../ui/BottomHud';
import { audioEngine } from '../audio/AudioEngine';
import { useViewportHeight } from '../utils/hooks/useViewportHeight';

export function AetherGenesis() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [showNavDeck, setShowNavDeck] = useState(true);
  const viewportHeight = useViewportHeight();

  // Initialize Web Audio API on first user gesture anywhere in the app
  useEffect(() => {
    const handleFirstGesture = () => {
      audioEngine.init();
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };

    window.addEventListener('pointerdown', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as HTMLElement).isContentEditable
      )) {
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        setShowNavDeck(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
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
    isCatalogOpen,
    setIsCatalogOpen,
    loadStarPreset,
    addBodyToSimulation,
    currentTier, 
    fps, 
    showTierDownIndicator, 
    diagnosticsEnabled,
    setDiagnosticsEnabled,
    diagnostics,
    resetDiagnostics,
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
    astrobiologyData,
    engineRef
  } = useSimulation(mountRef);

  if (fatalError) {
    return (
      <div 
        style={{ height: viewportHeight || '100dvh' }}
        className="relative w-full bg-[#020205] overflow-hidden flex flex-col items-center justify-center font-sans text-white select-none p-6"
      >
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
    <div 
      style={{ height: viewportHeight || '100dvh' }}
      className="relative w-full bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none"
    >
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair z-0" />
      
      {/* Spatial Navigation & Flight Deck Layer with Responsive Bottom HUD Slots */}
      <NavigationDeck 
        visible={showNavDeck}
        camera={engineRef.current?.camera ?? null}
        stars={engineRef.current?.heroStars ?? []}
        selectedStar={selectedStar}
        onSelectStar={(star) => setSelectedStar(star)}
        onAlignCamera={centerOnStar}
        uiRefs={hudRefs}
        renderBottom={({ left, right }) => (
          <BottomHud 
            left={left}
            center={
              <CosmicAgeCard 
                cosmicAge={cosmicAge}
                isPlayingCosmic={isPlayingCosmic}
                setIsPlayingCosmic={setIsPlayingCosmic}
                timeScale={timeScale}
                setTimeScale={setTimeScale}
                onGlobalScrubStart={onGlobalScrubStart}
                onGlobalScrubMove={onGlobalScrubMove}
                onGlobalScrubEnd={onGlobalScrubEnd}
                onKeyDown={(e) => onKeyDown(e, true)}
                uiRefs={hudRefs}
                currentSeed={currentSeed}
              />
            }
            right={
              <div className="pointer-events-none flex flex-col items-center md:items-end gap-3">
                {right}
                <HudActionButtons 
                  onOpenCatalog={() => setIsCatalogOpen(true)}
                  resetCamera={resetCamera}
                  centerOnStar={centerOnStar}
                />
              </div>
            }
          />
        )}
      />

      <Hud 
        uiRefs={hudRefs}
        performance={{
            tier: currentTier,
            numStars: numHeroStars,
            fps: fps,
            showIndicator: showTierDownIndicator,
            diagnosticsEnabled,
            setDiagnosticsEnabled,
            diagnostics,
            resetDiagnostics
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

      <CatalogPanel
        isOpen={isCatalogOpen}
        setIsOpen={setIsCatalogOpen}
        loadStarPreset={loadStarPreset}
        addBodyToSimulation={addBodyToSimulation}
      />

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,5,0.6)_100%)]" />
    </div>
  );
}
