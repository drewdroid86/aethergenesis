import React, { useRef } from 'react';
import { Hud } from '../ui/Hud';
import { InspectPanel } from '../ui/InspectPanel';
import { useSimulation } from '../utils/hooks/useSimulation';

export function AetherGenesis() {
  const mountRef = useRef<HTMLDivElement>(null);
  const {
    selectedStar,
    isPaused,
    setIsPaused,
    fatalError,
    hudRefs,
    uiRefs,
    onScrubStart,
    onScrubMove,
    onScrubEnd
  } = useSimulation(mountRef);

  return (
    <div className="relative w-full h-screen bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none">
      {fatalError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.85)',
          color: '#ff4444', padding: '8px 12px', fontSize: '10px', 
          fontFamily: 'monospace', whiteSpace: 'pre-wrap', zIndex: 9999,
          maxHeight: '40vh', overflowY: 'auto'
        }}>
          {fatalError}
        </div>
      )}
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair z-0" />

      <Hud uiRefs={hudRefs} />

      {selectedStar && (
        <InspectPanel 
          selectedStar={selectedStar}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
          onScrubStart={onScrubStart}
          onScrubMove={onScrubMove}
          onScrubEnd={onScrubEnd}
          uiRefs={uiRefs}
        />
      )}

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,5,0.6)_100%)]"></div>
    </div>
  );
}
