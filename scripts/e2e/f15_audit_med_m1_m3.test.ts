import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// ==========================================
// Audit MEDIUMs M1–M3 — worker/roster/visual contracts.
// No server needed: worker logic runs under the `self` stub (f13 pattern);
// rendering-chain modules are pinned by static source contract only
// (useSimulation.ts pulls Three.js + .glsl, which node/tsx cannot parse).
// ==========================================

// The worker module assigns self.onmessage at import time, so the stub
// must exist before the (dynamic — static imports hoist) import.
const posted: any[] = [];
(globalThis as any).self = {
    onmessage: null as any,
    postMessage: (msg: any) => { posted.push(msg); },
};

const worker = await import('../../src/simulation/nbodyWorker.ts');

function dispatch(type: string, payload: any): void {
    (globalThis as any).self.onmessage({ data: { type, payload } });
}

const messagesOf = (type: string): any[] => posted.filter((m) => m.type === type);
const src = (p: string): string => fs.readFileSync(p, 'utf8');
const hookSrc = (): string => src('src/utils/hooks/useSimulation.ts');
const heroSrc = (): string => src('src/rendering/systems/HeroStarSystem.ts');
const engineSrc = (): string => src('src/core/engine.ts');
const planetarySrc = (): string => src('src/rendering/systems/PlanetarySystem.ts');

// --- M3 behavioral: an EMPTY init roster is a legal worker state ---
// The hook now INITs with bodies: [] (no demo earth/jupiter/halley).

test('F15-1: INIT with an empty roster announces an empty ROSTER', () => {
    posted.length = 0;
    dispatch('INIT', { bodies: [], centralMass_solar: 1.0, dt_yr: 0.05, isRunning: false });
    const rosters = messagesOf('ROSTER');
    assert.strictEqual(rosters.length, 1, 'INIT must announce the roster');
    assert.deepStrictEqual(rosters[0].bodies, [], 'empty INIT must announce an empty roster');
});

test('F15-2: empty-roster tick emits a zero-length UPDATE buffer', () => {
    posted.length = 0;
    dispatch('INIT', { bodies: [], centralMass_solar: 1.0, dt_yr: 0.05, isRunning: false });
    posted.length = 0;
    worker.physicsTickInner();
    const updates = messagesOf('UPDATE');
    assert.strictEqual(updates.length, 1, 'one UPDATE per tick');
    const buf = updates[0].buffer as Float32Array;
    assert.strictEqual(buf.length, 0, 'zero bodies give a zero-length buffer');
    // Coordinator shape: buffer.length / 7 body rows → zero iterations.
    assert.strictEqual(buf.length / 7, 0, 'coordinator sees zero body rows');
    // Renderer shape: isBufferDriven = buffer && buffer.length >= 7.
    assert.ok(!(buf && buf.length >= 7), 'empty buffer is not buffer-driven: procedural fallback');
});

test('F15-3: empty roster recovers on RESET — first re-key populates', () => {
    posted.length = 0;
    dispatch('INIT', { bodies: [], centralMass_solar: 1.0, dt_yr: 0.05, isRunning: false });
    const mu = 4 * Math.PI * Math.PI * 1.0;
    dispatch('RESET_BODIES', {
        bodies: [{
            id: 'preset_body_0', type: 'planet', mass_solar: 3e-6, radius_km: 6371,
            position_au: { x: 1, y: 0, z: 0 },
            velocity_au_yr: { x: 0, y: Math.sqrt(mu / 1.0), z: 0 },
        }],
        centralMass_solar: 1.0,
    });
    const rosters = messagesOf('ROSTER');
    assert.strictEqual(rosters[rosters.length - 1].bodies.length, 1, 'RESET re-populates the roster');
    posted.length = 0;
    worker.physicsTickInner();
    const buf = messagesOf('UPDATE')[0].buffer as Float32Array;
    assert.strictEqual(buf.length, 7, 'one body gives 7 floats');
});

// --- M3 static: hook INIT carries no demo bodies ---

test('F15-4: worker INIT posts an empty body list, not demo planets', () => {
    const s = hookSrc();
    assert.ok(s.includes("type: 'INIT'"), 'INIT post must still exist');
    assert.ok(s.includes('bodies: []'), 'INIT must post an EMPTY body list');
    assert.ok(!s.includes("id: 'earth'"), 'demo earth must be gone');
    assert.ok(!s.includes("id: 'jupiter'"), 'demo jupiter must be gone');
    assert.ok(!s.includes('1P_Halley'), 'demo halley must be gone');
});

// --- M3 static: orbit rings rebuild on roster generation change ---

test('F15-5: roster application resets the orbit-line gate', () => {
    const s = planetarySrc();
    const start = s.indexOf('public applyRoster(');
    assert.ok(start !== -1, 'applyRoster must exist');
    const window = s.slice(start, start + 4200);
    assert.ok(window.includes('this.clearOrbitLines()'), 'applyRoster must clear orbit lines on roster change');
});

test('F15-6: orbit lines rebuild when the live body count changes', () => {
    const s = planetarySrc();
    assert.ok(s.includes('orbitBuiltBodyCount'), 'build generation must be tracked per body count');
    assert.ok(
        s.includes('numBodies !== this.orbitBuiltBodyCount'),
        'ring build must re-fire when the body count changes'
    );
});

// --- M1 static: nebula secondary hidden on PROTOSTAR exit, normalized fade ---

test('F15-7: PROTOSTAR exit hides the lingering nebula secondary', () => {
    const s = heroSrc();
    const start = s.indexOf('private _exitPhase(');
    assert.ok(start !== -1, '_exitPhase must exist');
    const end = s.indexOf('public syncBirthAge');
    const window = s.slice(start, end);
    const protoIdx = window.indexOf('exitingPhase === PHASES.PROTOSTAR');
    assert.ok(protoIdx !== -1, 'PROTOSTAR branch must exist');
    const branch = window.slice(protoIdx, protoIdx + 600);
    assert.ok(branch.includes('this._protostarPhase?.hide()'), 'protostar visuals must still hide');
    assert.ok(branch.includes('this._nebulaPhase?.hide()'), 'nebula secondary must hide on PROTOSTAR exit');
});

test('F15-8: secondary update receives a normalized protostar time', () => {
    const s = heroSrc();
    assert.ok(
        s.includes('(this.t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.PROTOSTAR_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.PROTOSTAR_DURATION'),
        'updateAsSecondary must receive (t - PROTOSTAR_START) / PROTOSTAR_DURATION, not raw t'
    );
    assert.ok(
        !s.includes('updateAsSecondary(delta, appTime, cameraPos, this.t,'),
        'raw this.t must no longer be passed as normT'
    );
});

// --- M2 static: recycle/respawn re-keys the worker through the shared helper ---

test('F15-9: recycle + respawn resample mass, sync currentMass, and fire onRecycle', () => {
    const s = heroSrc();
    assert.ok(s.includes('onRecycle'), 'onRecycle bridge must exist');
    for (const method of ['recycleToNewGeneration', 'respawn']) {
        const start = s.indexOf(method + '(');
        assert.ok(start !== -1, `${method} must exist`);
        const window = s.slice(start, start + 4500);
        assert.ok(window.includes('sampleKroupaMass()'), `${method} must resample mass`);
        assert.ok(window.includes('this.currentMass = this.mass'), `${method} must sync currentMass post-resample (H1: never stale/birth mass)`);
        assert.ok(window.includes('this.onRecycle?.(this)'), `${method} must fire the re-key bridge`);
    }
});

test('F15-10: engine forwards recycle; hook re-keys the focused star only', () => {
    const e = engineSrc();
    assert.ok(e.includes('onStarRecycled'), 'engine onStarRecycled bridge must exist');
    const createIdx = e.indexOf('createHeroStars(');
    assert.ok(createIdx !== -1, 'createHeroStars must exist');
    const createWindow = e.slice(createIdx, createIdx + 3000);
    assert.ok(createWindow.includes('star.onRecycle'), 'every created star (including late ones) must forward onRecycle');
    const h = hookSrc();
    assert.ok(h.includes('engine.onStarRecycled = (star)'), 'hook must consume the recycle bridge');
    const wireIdx = h.indexOf('engine.onStarRecycled = (star)');
    const wireWindow = h.slice(wireIdx, wireIdx + 1200);
    assert.ok(wireWindow.includes('rekeyNBodyForStar(star,'), 'recycle must re-key through the shared helper (exact selection-path payload)');
    assert.ok(wireWindow.includes('eng.selectedStar ?? eng.heroStars[0]'), 're-key must target the focus star');
    assert.ok(wireWindow.includes('if (star === focused)'), 'background-star recycles must not clobber the focus simulation');
    assert.ok(!wireWindow.includes('UPDATE_CENTRAL_MASS'), 'no mass-only worker writes in recycle path (F9-4 invariant holds)');
});
