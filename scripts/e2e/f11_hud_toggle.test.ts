import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HUD_VISIBILITY_KEY,
  readHudVisible,
  persistHudVisible,
  type HudVisibilityStorage,
} from '../../src/utils/hudVisibility';

// ==========================================
// F11: HUD hide/show toggle ("clear-screen mode")
// Static source-contract checks + persistence unit checks: the repo has no
// browser harness, so these pin the contracts that guarantee the behavior:
// a single boolean owns visibility, hiding is CSS-only (panels stay
// mounted, preserving per-panel state), the toggle never hides itself,
// the choice persists under `aethergenesis.hudVisible`, and Escape toggles.
// ==========================================

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

function memoryStorage(initial: Record<string, string> = {}): HudVisibilityStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
}

test('F11-T1-1: persistence key is exactly aethergenesis.hudVisible', () => {
  assert.strictEqual(HUD_VISIBILITY_KEY, 'aethergenesis.hudVisible');
});

test('F11-T1-2: HUD defaults to visible when nothing is stored', () => {
  assert.strictEqual(readHudVisible(memoryStorage()), true);
});

test('F11-T1-3: corrupt stored values fall back to visible', () => {
  assert.strictEqual(
    readHudVisible(memoryStorage({ [HUD_VISIBILITY_KEY]: 'banana' })),
    true
  );
  assert.strictEqual(
    readHudVisible(memoryStorage({ [HUD_VISIBILITY_KEY]: '' })),
    true
  );
});

test('F11-T1-4: persist round-trips hide and restore', () => {
  const storage = memoryStorage();
  persistHudVisible(false, storage);
  assert.strictEqual(readHudVisible(storage), false);
  persistHudVisible(true, storage);
  assert.strictEqual(readHudVisible(storage), true);
});

test('F11-T1-5: persisted value is stored as a plain string under the key', () => {
  const seen: Record<string, string> = {};
  const spy: HudVisibilityStorage = {
    getItem: () => null,
    setItem: (k, v) => {
      seen[k] = v;
    },
  };
  persistHudVisible(false, spy);
  assert.strictEqual(seen['aethergenesis.hudVisible'], 'false');
});

test('F11-T1-6: blocked storage never throws (falls back to memory)', () => {
  const throwing: HudVisibilityStorage = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  assert.strictEqual(readHudVisible(throwing), true);
  assert.doesNotThrow(() => persistHudVisible(false, throwing));
});

test('F11-T2-1: hudVisible boolean defaults to true and reads persisted state', () => {
  const comp = src('src/components/AetherGenesis.tsx');
  assert.ok(
    comp.includes('const [hudVisible, setHudVisible] = useState<boolean>(() => readHudVisible())'),
    'hudVisible must be React state defaulting to true via the persisted reader'
  );
});

test('F11-T2-2: hudVisible persists on every change', () => {
  const comp = src('src/components/AetherGenesis.tsx');
  assert.ok(
    comp.includes('persistHudVisible(hudVisible)'),
    'hudVisible changes must be written back to localStorage'
  );
});

test('F11-T2-3: hiding is CSS-only — panels are never conditionally unmounted', () => {
  const comp = src('src/components/AetherGenesis.tsx');
  assert.ok(
    !/\{hudVisible &&/.test(comp) && !/\{!hudVisible &&/.test(comp),
    'no panel may be gated on hudVisible; hiding must be the hud-hidden class so per-panel state survives restore'
  );
  assert.ok(
    comp.includes('hud-hidden'),
    'the app root must take the hud-hidden class when the HUD is hidden'
  );
});

test('F11-T2-4: toggle button is always rendered above all HUD', () => {
  const comp = src('src/components/AetherGenesis.tsx');
  const at = comp.indexOf('data-testid="hud-toggle"');
  assert.ok(at !== -1, 'hud-toggle button must exist');
  const window = comp.slice(Math.max(0, at - 2500), at);
  assert.ok(window.includes('hud-toggle'), 'toggle must carry the hud-toggle exemption class');
  assert.ok(window.includes('fixed'), 'toggle must be fixed positioned');
  assert.ok(window.includes('z-50'), 'toggle must sit above all HUD layers');
  assert.ok(
    window.includes('env(safe-area-inset-bottom)'),
    'toggle must sit above the safe area'
  );
  assert.ok(
    window.includes('right-4'),
    'toggle must live bottom-right, offset above the action-button cluster'
  );
});

test('F11-T2-5: toggle is semi-transparent while hidden and styled like the floating buttons', () => {
  const comp = src('src/components/AetherGenesis.tsx');
  assert.ok(comp.includes('opacity-50'), 'toggle must go semi-transparent while the HUD is hidden');
  assert.ok(
    comp.includes('bg-[rgba(8,8,20,0.6)]') && comp.includes('rounded-md') && comp.includes('backdrop-blur-md'),
    'toggle must reuse the existing floating-button surface treatment'
  );
  assert.ok(comp.includes('<Eye ') && comp.includes('<EyeOff '), 'toggle must show Eye/EyeOff state icons');
  assert.ok(comp.includes('aria-pressed={hudVisible}'), 'toggle must expose its pressed state');
});

test('F11-T2-6: Escape toggles the HUD', () => {
  const comp = src('src/components/AetherGenesis.tsx');
  assert.ok(
    comp.includes("e.key === 'Escape'") && comp.includes('setHudVisible(prev => !prev)'),
    'Escape must flip hudVisible'
  );
});

test('F11-T2-7: hud-hidden CSS keeps only canvas and toggle', () => {
  const css = src('src/index.css');
  const at = css.indexOf('.hud-hidden');
  assert.ok(at !== -1, 'hud-hidden rule must exist');
  const rule = css.slice(at, css.indexOf('}', at) + 1);
  assert.ok(
    rule.includes(':not(.hud-canvas):not(.hud-toggle)'),
    'hud-hidden must exempt the 3D canvas and the toggle so the toggle never hides itself'
  );
  assert.ok(
    rule.includes('display: none'),
    'hud-hidden must remove all HUD panels so the canvas fills the viewport'
  );
});

test('F11-T2-8: canvas keeps filling the viewport behind the HUD', () => {
  const comp = src('src/components/AetherGenesis.tsx');
  assert.ok(
    comp.includes('hud-canvas absolute inset-0'),
    'the 3D canvas must stay absolute inset-0 so it fills the viewport once HUD layers hide'
  );
});
