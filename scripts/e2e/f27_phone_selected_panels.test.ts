import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// F27: Selected-star panels (InspectPanel & AstrobiologyPanel) on <=480px
// On phones (<=480px), the top cluster occupies up to 40vh and the bottom
// deck occupies up to 38vh (from 62vh to 100vh). Selected-star panels must:
//  - start below the 40vh top column (max-[480px]:top-[calc(40vh_+_0.5rem)]),
//  - cap height at max-[480px]:max-h-[21vh] with overflow-y-auto so they
//    never reach the 38vh bottom deck or clip the scrubber/Gemini block,
//  - preserve desktop positioning and existing f7 contracts.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

test('F27-1: InspectPanel bounds height and scrolls instead of clipping with overflow-hidden', () => {
  const inspect = src('src/ui/InspectPanel.tsx');
  const regionIdx = inspect.indexOf('aria-label="Stellar Telemetry Panel"');
  assert.ok(regionIdx !== -1, 'Stellar Telemetry Panel region must exist');
  const window = inspect.slice(Math.max(0, regionIdx - 400), regionIdx + 600);
  assert.ok(
    !window.includes('overflow-hidden'),
    'InspectPanel root must not use overflow-hidden which clips the scrubber and Gemini block'
  );
  assert.ok(
    window.includes('overflow-y-auto') && window.includes('custom-scrollbar'),
    'InspectPanel root must scroll vertically when content exceeds viewport height'
  );
  assert.ok(
    window.includes('max-h-[calc(100dvh-4rem)]'),
    'InspectPanel must bound height on desktop viewports'
  );
});

test('F27-2: InspectPanel clears the 40vh top column and 38vh bottom deck on <=480px phones', () => {
  const inspect = src('src/ui/InspectPanel.tsx');
  const regionIdx = inspect.indexOf('aria-label="Stellar Telemetry Panel"');
  const window = inspect.slice(Math.max(0, regionIdx - 400), regionIdx + 600);
  assert.ok(
    !window.includes("y: '-50%'"),
    'InspectPanel motion props must not hardcode inline y: -50% on phones'
  );
  assert.ok(
    window.includes('min-[481px]:top-1/2') && window.includes('min-[481px]:-translate-y-1/2') && window.includes('min-[481px]:right-8'),
    'InspectPanel must gate desktop vertical centering behind min-[481px]'
  );
  assert.ok(
    window.includes('max-[480px]:top-[calc(40vh_+_0.5rem)]'),
    'InspectPanel must start below the 40vh phone top column at <=480px'
  );
  assert.ok(
    window.includes('max-[480px]:max-h-[21vh]'),
    'InspectPanel must cap phone height at 21vh so 40vh + 0.5rem + 21vh clears the 38vh bottom deck'
  );
  assert.ok(
    window.includes('max-[480px]:left-4') && window.includes('max-[480px]:right-4') && window.includes('max-[480px]:w-[calc(100vw-2rem)]'),
    'InspectPanel must align symmetrically within phone horizontal gutters'
  );
});

test('F27-3: AstrobiologyPanel clears the 40vh phone top cluster even when ConstantsPanel is closed', () => {
  const astro = src('src/ui/AstrobiologyPanel.tsx');
  const regionIdx = astro.indexOf('aria-label="Astrobiology Report"');
  assert.ok(regionIdx !== -1, 'Astrobiology Report region must exist');
  const window = astro.slice(regionIdx, regionIdx + 500);
  assert.ok(
    window.includes('max-[480px]:top-[calc(40vh_+_0.5rem)]'),
    'AstrobiologyPanel must sit below the 40vh phone top cluster when constantsOpen is false'
  );
  assert.ok(
    window.includes('max-[480px]:max-h-[21vh]'),
    'AstrobiologyPanel must cap phone height at 21vh so it clears the 38vh bottom deck'
  );
  assert.ok(
    window.includes('max-h-[34vh]') && window.includes('md:max-h-[calc(100vh-8rem)]') && /z-10(?![\w-])/.test(window),
    'AstrobiologyPanel must preserve existing f7 contracts'
  );
});
