import { useRef, useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';
import { useSimulation } from '../utils/hooks/useSimulation';
import { readHudVisible, persistHudVisible } from '../utils/hudVisibility';
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
  // Clear-screen mode: single boolean owning ONLY HUD visibility. Panels
  // stay mounted and keep their own collapse/open state, so hiding never
  // resets per-panel state. Persisted under `aethergenesis.hudVisible`.
  const [hudVisible, setHudVisible] = useState<boolean>(() => readHudVisible());
  useEffect(() => {
    persistHudVisible(hudVisible);
  }, [hudVisible]);
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
      if (e.key === 'Escape') {
        setHudVisible(prev => !prev);
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
    badgeCoordRefs,
    attitudeCoordRefs,
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
      className={`relative w-full bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none${hudVisible ? '' : ' hud-hidden'}`}
    >
      <div ref={mountRef} className="hud-canvas absolute inset-0 cursor-crosshair z-0" />

      {/* Clear-screen toggle: always mounted above every HUD layer (it must
          never hide itself). Fixed bottom-right above the safe area, offset
          above the bottom-right action-button cluster; semi-transparent
          while the HUD is hidden. */}
      <button
        type="button"
        onClick={() => {
          audioEngine.playUiClick();
          setHudVisible(prev => !prev);
        }}
        className={`hud-toggle fixed z-50 right-4 md:right-8 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5.5rem)] md:bottom-[calc(max(2rem,env(safe-area-inset-bottom))+5.75rem)] w-12 h-12 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-all hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none group/hudtoggle${hudVisible ? '' : ' opacity-50 hover:opacity-100 focus-visible:opacity-100'}`}
        aria-label={hudVisible ? 'Hide HUD (clear-screen mode)' : 'Show HUD'}
        aria-pressed={hudVisible}
        aria-keyshortcuts="Escape"
        title={hudVisible ? 'Hide HUD [Esc]' : 'Show HUD [Esc]'}
        data-testid="hud-toggle"
      >
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-[#C084FC] opacity-0 group-hover/hudtoggle:opacity-100 group-focus-visible/hudtoggle:opacity-100 transition-opacity whitespace-nowrap">
          [Esc] {hudVisible ? 'Hide' : 'Show'}
        </span>
        {hudVisible ? <Eye size={16} className="text-[#7EB8FF]" /> : <EyeOff size={16} className="text-[#C084FC]" />}
      </button>
      
      {/* Spatial Navigation & Flight Deck Layer with Responsive Bottom HUD Slots */}
      <NavigationDeck
        visible={showNavDeck}
        camera={engineRef.current?.camera ?? null}
        stars={engineRef.current?.heroStars ?? []}
        selectedStar={selectedStar}
        onSelectStar={(star) => setSelectedStar(star)}
        onAlignCamera={centerOnStar}
        coordUiRefs={{ badge: badgeCoordRefs, attitude: attitudeCoordRefs }}
        renderTop={(topBar) => (
          // Phone (<=480px): the floating top cluster (header HUD + deck
          // instrumentation bar) stacks in a single height-bounded scrollable
          // column so panels can never overlap each other or reach the bottom
          // deck; the canvas stays visible in the gap between them. Desktop:
          // display:contents dissolves the wrapper, keeping every absolute
          // position and paint order exactly as before.
          <div className="contents max-[480px]:flex max-[480px]:flex-col max-[480px]:w-full max-[480px]:min-h-0 max-[480px]:max-h-[40vh] max-[480px]:overflow-y-auto max-[480px]:gap-2 max-[480px]:pointer-events-none custom-scrollbar">
            {topBar}
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
            {/* Phone (<=480px): the constants toggle/panel is an in-flow
                member of this column (order-4, after the deck bar) so it
                stacks with the Scale Ladder / badge instead of floating
                over them. Desktop: display:contents dissolves the wrapper,
                keeping the gated absolute positioning exactly as before. */}
            <ConstantsPanel
              physics={physics}
              setPhysics={setPhysics}
              isOpen={isConstantsOpen}
              setIsOpen={setIsConstantsOpen}
            />
          </div>
        )}
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
