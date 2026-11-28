import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// F28: Timeline scrubber pointercancel / lostpointercapture & unmount cleanup
// Touch cancellations (pointercancel / lostpointercapture) or unmounting
// InspectPanel while dragging must end the scrub and release isGlobalScrubbing
// / isScrubbing so cosmic age and stellar age progression never freeze.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

test('F28-1: CosmicAgeCard slider binds onPointerCancel, onLostPointerCapture, and touch-none', () => {
  const hud = src('src/ui/Hud.tsx');
  const sliderIdx = hud.indexOf('ref={uiRefs.globalSlider}');
  assert.ok(sliderIdx !== -1, 'globalSlider ref must exist in Hud.tsx');
  const sliderBlock = hud.slice(sliderIdx, sliderIdx + 900);
  assert.ok(
    sliderBlock.includes('touch-none'),
    'globalSlider must set touch-none (touch-action: none) to prevent browser touch scroll cancellation'
  );
  assert.ok(
    sliderBlock.includes('onPointerCancel={handlePointerCancel}'),
    'globalSlider must handle onPointerCancel'
  );
  assert.ok(
    sliderBlock.includes('onLostPointerCapture={handlePointerCancel}'),
    'globalSlider must handle onLostPointerCapture'
  );
});

test('F28-2: CosmicAgeCard cleans up active scrub on pointercancel and unmount', () => {
  const hud = src('src/ui/Hud.tsx');
  const cardIdx = hud.indexOf('export const CosmicAgeCard');
  assert.ok(cardIdx !== -1, 'CosmicAgeCard must exist in Hud.tsx');
  const cardBlock = hud.slice(cardIdx, cardIdx + 2400);
  assert.ok(
    cardBlock.includes('const handlePointerCancel'),
    'CosmicAgeCard must define handlePointerCancel'
  );
  assert.ok(
    cardBlock.includes('isDraggingRef.current'),
    'CosmicAgeCard must track active dragging via ref for idempotent end and unmount cleanup'
  );
  assert.ok(
    cardBlock.includes('onGlobalScrubEndRef.current()'),
    'CosmicAgeCard unmount cleanup must call onGlobalScrubEnd when unmounted mid-drag'
  );
});

test('F28-3: InspectPanel stellar slider binds onPointerCancel, onLostPointerCapture, and touch-none', () => {
  const inspect = src('src/ui/InspectPanel.tsx');
  const sliderIdx = inspect.indexOf('ref={uiRefs.stellarSlider}');
  assert.ok(sliderIdx !== -1, 'stellarSlider ref must exist in InspectPanel.tsx');
  const sliderBlock = inspect.slice(sliderIdx, sliderIdx + 900);
  assert.ok(
    sliderBlock.includes('touch-none'),
    'stellarSlider must set touch-none (touch-action: none)'
  );
  assert.ok(
    sliderBlock.includes('onPointerCancel={handlePointerCancel}'),
    'stellarSlider must handle onPointerCancel'
  );
  assert.ok(
    sliderBlock.includes('onLostPointerCapture={handlePointerCancel}'),
    'stellarSlider must handle onLostPointerCapture'
  );
});

test('F28-4: InspectPanel cleans up active scrub on pointercancel and unmount', () => {
  const inspect = src('src/ui/InspectPanel.tsx');
  assert.ok(
    inspect.includes('const handlePointerCancel'),
    'InspectPanel must define handlePointerCancel'
  );
  assert.ok(
    inspect.includes('isDraggingRef.current'),
    'InspectPanel must track active dragging via ref for idempotent end and unmount cleanup'
  );
  assert.ok(
    inspect.includes('onScrubEndRef.current()'),
    'InspectPanel unmount cleanup must call onScrubEnd when unmounted mid-drag'
  );
});
