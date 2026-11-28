import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ==========================================
// F27: InspectPanel Gemini stale-scan abort & cooldown reset on star switch
// When switching from Star A to Star B while an /api/analyze scan is in
// flight, InspectPanel stays mounted (preserving DOM refs for the per-frame
// HUD hot path). The [selectedStar?.physicsId] effect must abort any
// in-flight AbortController and reset isAnalyzing, geminiData,
// cooldownRemaining, and lastAnalysisTimeRef so Star A's response/fallback
// never lands on Star B and Star A's cooldown does not block scanning Star B.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const inspectSrc = (): string => readFileSync(join(root, 'src/ui/InspectPanel.tsx'), 'utf8');

function starChangeEffectBlock(): string {
  const s = inspectSrc();
  const depIdx = s.indexOf('[selectedStar?.physicsId]');
  assert.ok(depIdx !== -1, 'useEffect([selectedStar?.physicsId]) must exist in InspectPanel.tsx');
  const start = s.lastIndexOf('useEffect(() => {', depIdx);
  assert.ok(start !== -1, 'useEffect start must precede [selectedStar?.physicsId]');
  return s.slice(start, depIdx + '[selectedStar?.physicsId]);'.length);
}

test('F27-1: changing selectedStar.physicsId aborts in-flight Gemini AbortController', () => {
  const block = starChangeEffectBlock();
  assert.ok(
    block.includes('abortControllerRef.current.abort()'),
    'selectedStar.physicsId effect must call abortControllerRef.current.abort()'
  );
  assert.ok(
    block.includes('abortControllerRef.current = null'),
    'selectedStar.physicsId effect must clear abortControllerRef.current after aborting'
  );
});

test('F27-2: changing selectedStar.physicsId resets isAnalyzing, geminiData, and cooldown state', () => {
  const block = starChangeEffectBlock();
  assert.ok(
    block.includes('setIsAnalyzing(false)'),
    'selectedStar.physicsId effect must reset isAnalyzing to false'
  );
  assert.ok(
    block.includes('setGeminiData(null)'),
    'selectedStar.physicsId effect must clear geminiData to null'
  );
  assert.ok(
    block.includes('setCooldownRemaining(0)'),
    'selectedStar.physicsId effect must reset cooldownRemaining to 0 for the newly selected star'
  );
  assert.ok(
    block.includes('lastAnalysisTimeRef.current = 0'),
    'selectedStar.physicsId effect must reset lastAnalysisTimeRef.current to 0'
  );
});

test('F27-3: analyzeSystem guards state writes on !signal.aborted after star-switch abort', () => {
  const s = inspectSrc();
  const start = s.indexOf('const analyzeSystem = async () =>');
  assert.ok(start !== -1, 'analyzeSystem must exist');
  const end = s.indexOf('useEffect(() => {\n        return () => {', start);
  const body = s.slice(start, end !== -1 ? end : start + 2500);
  const guardMatches = body.split('!signal.aborted').length - 1;
  assert.ok(
    guardMatches >= 3,
    `analyzeSystem must guard success, fallback, and finally state updates with !signal.aborted (found ${guardMatches})`
  );
});
