import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// F28: BottomHud 768px (md) flex-row negotiation & CosmicAgeCard control wrap
// At 768px (md), BottomHud switches to md:flex-row inside 704px inner width.
// Without min-w-0 on slots, flex-wrap fallback, and a bounded md card width
// with wrapping controls, the 3 columns demand >850px and collide/overflow.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

test('F28-1: BottomHud enables md:flex-wrap fallback and min-w-0 on all three slots', () => {
  const bottomHud = src('src/ui/BottomHud.tsx');
  assert.ok(
    bottomHud.includes('md:flex-row') && bottomHud.includes('md:flex-wrap') && bottomHud.includes('lg:flex-nowrap'),
    'BottomHud must wrap at md if needed while keeping single-row lg:flex-nowrap on wide desktops'
  );
  const minW0Count = bottomHud.split('min-w-0').length - 1;
  assert.ok(
    minW0Count >= 3,
    `All three BottomHud slot wrappers (left, center, right) must include min-w-0 (found ${minW0Count})`
  );
  assert.ok(
    bottomHud.includes('max-[480px]:max-h-[38vh]') && bottomHud.includes('max-[480px]:overflow-y-auto') && bottomHud.includes('absolute bottom-0') && bottomHud.includes('z-20'),
    'BottomHud must preserve all <=480px and stacking contracts'
  );
});

test('F28-2: CosmicAgeCard caps md width to fit 704px row and wraps its header button cluster', () => {
  const hud = src('src/ui/Hud.tsx');
  const cardIdx = hud.indexOf('export const CosmicAgeCard');
  assert.ok(cardIdx !== -1, 'CosmicAgeCard must exist in Hud.tsx');
  const cardEndIdx = hud.indexOf('export interface HudActionButtonsProps', cardIdx);
  const cardBlock = hud.slice(cardIdx, cardEndIdx !== -1 ? cardEndIdx : cardIdx + 4500);
  assert.ok(
    cardBlock.includes('md:max-w-[300px]') && cardBlock.includes('lg:max-w-xl'),
    'CosmicAgeCard must cap width at md:max-w-[300px] so 190 + 300 + 190 + 24 = 704px fits at 768px while preserving lg:max-w-xl'
  );
  assert.ok(
    cardBlock.includes('flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 min-w-0'),
    'CosmicAgeCard control row must wrap and allow shrinking so it never forces min-content overflow at 360px or 768px'
  );
});
