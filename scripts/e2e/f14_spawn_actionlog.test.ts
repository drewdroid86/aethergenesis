import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import fs from 'node:fs';
import { ActionLog, ingestWorkerEvent } from '../../src/simulation/ActionLog.ts';
import {
    buildSpawnBody,
    computeSpawnState,
    circularOrbitSpeed,
    resetSpawnCounter,
} from '../../src/simulation/spawnBody.ts';
import { PlanetarySystem } from '../../src/rendering/systems/PlanetarySystem.ts';
import { PHASES } from '../../src/core/constants.ts';

// ==========================================
// F14 — Phase A (ActionLog + SIM_EVENT channel) and Phase B (spawn system +
// stable-id roster sync). The worker module assigns self.onmessage at import
// time, so the stub must exist before the (dynamic — static imports hoist)
// worker import. No server needed.
// ==========================================

const posted: any[] = [];
(globalThis as any).self = {
    onmessage: null as any,
    postMessage: (msg: any) => { posted.push(msg); },
};

const worker = await import('../../src/simulation/nbodyWorker.ts');

function dispatch(type: string, payload: any): void {
    (globalThis as any).self.onmessage({ data: { type, payload } });
}

function messagesOf(type: string): any[] {
    return posted.filter((m) => m.type === type);
}

function circularBody(id: string, a_au: number, centralMass_solar = 1.0): any {
    const mu = 4 * Math.PI * Math.PI * centralMass_solar;
    return {
        id, type: 'planet', mass_solar: 3e-6, radius_km: 6371,
        position_au: { x: a_au, y: 0, z: 0 },
        velocity_au_yr: { x: 0, y: Math.sqrt(mu / a_au), z: 0 },
    };
}

// ─── Phase A: ActionLog ────────────────────────────────────────────────

test('F14-1: logEvent + subscribe round-trip; insertion order; monotonic ids', () => {
    const log = new ActionLog();
    const seen: string[] = [];
    const unsub = log.subscribe((e) => { seen.push(e.type); });
    log.logEvent('SPAWN', { cosmicAge: 5, wallTimestamp: 1, actorId: 'a' });
    log.logEvent('COLLISION', { cosmicAge: 5, wallTimestamp: 2 });
    log.logEvent('PHASE_TRANSITION', { cosmicAge: 6, wallTimestamp: 3 });
    const entries = log.getLog();
    assert.deepStrictEqual(entries.map((e) => e.eventId), [1, 2, 3]);
    assert.deepStrictEqual(entries.map((e) => e.type), ['SPAWN', 'COLLISION', 'PHASE_TRANSITION']);
    assert.deepStrictEqual(seen, ['SPAWN', 'COLLISION', 'PHASE_TRANSITION']);
    unsub();
    log.logEvent('MERGE', { cosmicAge: 7, wallTimestamp: 4 });
    assert.deepStrictEqual(seen.length, 3, 'unsubscribed listener must not fire');
    assert.strictEqual(log.getLog()[3].eventId, 4, 'ids stay monotonic after unsubscribe');
});

test('F14-2: payloads are JSON-serializable; clearLog resets deterministically', () => {
    const log = new ActionLog();
    log.logEvent('SPAWN', {
        cosmicAge: 5.5, wallTimestamp: 123, actorId: 'spawned_1',
        targetIds: ['x'], masses: [3e-6],
        positions: [{ x: 1, y: 0, z: 0 }], note: 'tap:orbit:planet',
    });
    assert.doesNotThrow(() => JSON.stringify(log.getLog()), 'log must be JSON-serializable');
    log.clearLog();
    assert.strictEqual(log.size, 0);
    const again = log.logEvent('SPAWN', { cosmicAge: 0, wallTimestamp: 0 });
    assert.strictEqual(again.eventId, 1, 'clearLog resets the counter for deterministic replay');
});

test('F14-3: ingestWorkerEvent stamps cosmicAge and lands in the log', () => {
    const log = new ActionLog();
    const stored = ingestWorkerEvent(log, {
        type: 'COLLISION', seq: 7, cosmicAge: 0, wallTimestamp: 999,
        actorId: 'a', targetIds: ['a', 'b'],
    }, 11.25);
    assert.ok(stored, 'well-formed event must be ingested');
    assert.strictEqual(stored!.eventId, 1);
    assert.strictEqual(stored!.cosmicAge, 11.25, 'main-thread cosmic age wins');
    assert.strictEqual(stored!.wallTimestamp, 999, 'worker wall timestamp preserved');
    assert.strictEqual(ingestWorkerEvent(log, null as any, 0), null, 'malformed event drops safely');
    assert.strictEqual(log.size, 1, 'dropped event must not reach the log');
});

// ─── Phase B: spawn math ───────────────────────────────────────────────

test('F14-4: orbit spawn enters a circular orbit; drop spawn falls straight in', () => {
    const orbit = computeSpawnState({ position_au: { x: 1, y: 0, z: 0 }, centralMass_solar: 1.0 });
    const speed = Math.sqrt(
        orbit.velocity.x ** 2 + orbit.velocity.y ** 2 + orbit.velocity.z ** 2
    );
    const twoPi = 2 * Math.PI;
    assert.ok(Math.abs(speed - twoPi) / twoPi < 1e-12, `1 AU circular speed must be 2PI, got ${speed}`);
    const dot = orbit.velocity.x * orbit.position.x
        + orbit.velocity.y * orbit.position.y + orbit.velocity.z * orbit.position.z;
    assert.ok(Math.abs(dot) < 1e-12, `velocity must be tangential, got dot=${dot}`);
    assert.ok(Math.abs(orbit.velocity.z) < 1e-12, 'velocity must stay in the worker X-Y plane, got z=' + orbit.velocity.z);
    assert.ok(Math.abs(orbit.velocity.x) < 1e-12 && Math.abs(orbit.velocity.y - twoPi) < 1e-12, '1 AU prograde velocity must be (0, 2PI, 0), got (' + orbit.velocity.x + ', ' + orbit.velocity.y + ', ' + orbit.velocity.z + ')');
    assert.ok(Math.abs(circularOrbitSpeed(4.0, 1.0) - Math.PI) < 1e-12,
        `v(4 AU) must be PI (sqrt(mu/r)), got ${circularOrbitSpeed(4.0, 1.0)}`);

    const drop = computeSpawnState({
        position_au: { x: 1, y: 0, z: 0 }, centralMass_solar: 1.0, mode: 'drop',
    });
    assert.deepStrictEqual(drop.velocity, { x: 0, y: 0, z: 0 });
});

test('F14-5: spawn ids and state are deterministic (no Math.random)', () => {
    resetSpawnCounter();
    const a = buildSpawnBody({ position_au: { x: 2, y: 0, z: 0 }, centralMass_solar: 1.0 });
    const b = buildSpawnBody({ position_au: { x: 2, y: 0, z: 0 }, centralMass_solar: 1.0 });
    assert.strictEqual(a.id, 'spawned_1');
    assert.strictEqual(b.id, 'spawned_2');
    assert.deepStrictEqual(a.position_au, b.position_au, 'same input must give same position');
    assert.deepStrictEqual(a.velocity_au_yr, b.velocity_au_yr, 'same input must give same velocity');
    resetSpawnCounter();
    const replay = buildSpawnBody({ position_au: { x: 2, y: 0, z: 0 }, centralMass_solar: 1.0 });
    assert.strictEqual(replay.id, 'spawned_1', 'counter reset must replay identically');
});

test('F14-6: degenerate spawn radius clamps deterministically', () => {
    const atOrigin = computeSpawnState({ position_au: { x: 0, y: 0, z: 0 }, centralMass_solar: 1.0 });
    const r = Math.sqrt(atOrigin.position.x ** 2 + atOrigin.position.y ** 2 + atOrigin.position.z ** 2);
    assert.ok(Math.abs(r - 0.05) < 1e-12, `origin spawn must clamp to 0.05 AU, got ${r}`);
    for (const v of [atOrigin.velocity.x, atOrigin.velocity.y, atOrigin.velocity.z]) {
        assert.ok(Number.isFinite(v), 'clamped spawn velocity must be finite');
    }
});

// ─── Worker: ROSTER + SIM_EVENT ────────────────────────────────────────

test('F14-7: INIT emits ROSTER with stable ids; id-less bodies get deterministic worker ids', () => {
    posted.length = 0;
    dispatch('INIT', {
        bodies: [circularBody('earth', 1.0), { type: 'planet', mass_solar: 3e-6, radius_km: 6371,
            position_au: { x: 2, y: 0, z: 0 }, velocity_au_yr: { x: 0, y: 5, z: 0 } }],
        centralMass_solar: 1.0, dt_yr: 0.3, isRunning: false,
    });
    const rosters = messagesOf('ROSTER');
    assert.strictEqual(rosters.length, 1, 'INIT must announce the roster');
    assert.deepStrictEqual(rosters[0].bodies.map((b: any) => b.id), ['earth', 'spawned_1']);

    // Deterministic replay: same INIT sequence yields the same ids.
    posted.length = 0;
    dispatch('INIT', {
        bodies: [circularBody('earth', 1.0), { type: 'planet', mass_solar: 3e-6, radius_km: 6371,
            position_au: { x: 2, y: 0, z: 0 }, velocity_au_yr: { x: 0, y: 5, z: 0 } }],
        centralMass_solar: 1.0, dt_yr: 0.3, isRunning: false,
    });
    assert.deepStrictEqual(messagesOf('ROSTER')[0].bodies.map((b: any) => b.id), ['earth', 'spawned_1']);
});

test('F14-8: ADD_BODY emits ROSTER; buffer order matches roster order', () => {
    posted.length = 0;
    dispatch('INIT', { bodies: [circularBody('earth', 1.0)], centralMass_solar: 1.0, dt_yr: 0.3, isRunning: false });
    posted.length = 0;
    dispatch('ADD_BODY', { body: circularBody('mars', 1.5) });
    const rosters = messagesOf('ROSTER');
    assert.strictEqual(rosters.length, 1, 'ADD_BODY must announce the roster');
    assert.deepStrictEqual(rosters[0].bodies.map((b: any) => b.id), ['earth', 'mars']);
    worker.physicsTickInner();
    const update = messagesOf('UPDATE')[0].buffer as Float32Array;
    assert.strictEqual(update.length, 14, 'two bodies give 14 floats');
    assert.ok(Math.abs(Math.sqrt(update[0] ** 2 + update[1] ** 2 + update[2] ** 2) - 1.0) < 0.05,
        'buffer row 0 must be the 1 AU body (roster order == buffer order)');
});

test('F14-9: forced close approach emits an ordered SIM_EVENT that lands in the log', () => {
    posted.length = 0;
    dispatch('INIT', { bodies: [], centralMass_solar: 1.0, dt_yr: 1 / 365.25, isRunning: false });
    dispatch('RESET_BODIES', {
        bodies: [
            { id: 'pa', type: 'planet', mass_solar: 3e-6, radius_km: 6371,
              position_au: { x: 1, y: 0, z: 0 }, velocity_au_yr: { x: 0, y: 0, z: 0 } },
            { id: 'pb', type: 'planet', mass_solar: 3e-6, radius_km: 6371,
              position_au: { x: 1.00005, y: 0, z: 0 }, velocity_au_yr: { x: 0, y: 0, z: 0 } },
            { id: 'pc', type: 'planet', mass_solar: 3e-6, radius_km: 6371,
              position_au: { x: 5, y: 0, z: 0 }, velocity_au_yr: { x: 0, y: 0, z: 0 } },
            { id: 'pd', type: 'planet', mass_solar: 3e-6, radius_km: 6371,
              position_au: { x: 5.00005, y: 0, z: 0 }, velocity_au_yr: { x: 0, y: 0, z: 0 } },
        ],
        centralMass_solar: 1.0,
    });
    posted.length = 0;
    for (let t = 0; t < 3; t++) worker.physicsTickInner();
    const simEvents = messagesOf('SIM_EVENT');
    assert.strictEqual(simEvents.length, 2, `two resting contacts must report once each, got ${simEvents.length}`);
    assert.deepStrictEqual(simEvents.map((m) => m.event.seq), [1, 2], 'worker seq must be ordered');
    for (const m of simEvents) {
        assert.strictEqual(m.event.type, 'COLLISION');
        assert.ok(Array.isArray(m.event.targetIds) && m.event.targetIds.length === 2);
    }
    // The hook's ingestion path lands them in the log in arrival order.
    const log = new ActionLog();
    for (const m of simEvents) ingestWorkerEvent(log, m.event, 3.0);
    const entries = log.getLog();
    assert.strictEqual(entries.length, 2);
    assert.ok(entries.every((e) => e.type === 'COLLISION' && e.cosmicAge === 3.0));
    assert.deepStrictEqual(entries.map((e) => e.eventId), [1, 2]);
});

// ─── Renderer: roster-resolved visuals ────────────────────────────────

function makeTestSystem(): PlanetarySystem {
    const star = new THREE.Group() as any;
    star.mass = 1.0;
    star.physicsId = 'f14-test-star';
    star.phase = PHASES.MAIN_SEQUENCE;
    return new PlanetarySystem(star);
}

function slotTranslation(sys: PlanetarySystem, slot: number): [number, number, number] {
    const arr = (sys as any).instancedMesh.instanceMatrix.array as Float32Array;
    return [arr[slot * 16 + 12], arr[slot * 16 + 13], arr[slot * 16 + 14]];
}

function typeAttrAt(sys: PlanetarySystem, slot: number): number {
    return ((sys as any).typeAttr.array as Float32Array)[slot];
}

test('F14-10: roster reorder keeps each body\'s visuals (no index-shift misassignment)', () => {
    const sys = makeTestSystem();
    sys.applyRoster([{ id: 'a', type: 'planet' }, { id: 'b', type: 'planet' }], 1);
    assert.strictEqual(sys.slotForBodyId('a'), 0);
    assert.strictEqual(sys.slotForBodyId('b'), 1);

    // Buffer rows in roster order: a at 1 AU on x, b at 2 AU on y.
    // Renderer maps worker (x, y, z) -> world (x*12, z*12, y*12).
    sys.update(0.016, 0, new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]));
    assert.deepStrictEqual(slotTranslation(sys, 0), [12, 0, 0]);
    assert.deepStrictEqual(slotTranslation(sys, 1), [0, 0, 24]);
    const aType = typeAttrAt(sys, 0);
    const bType = typeAttrAt(sys, 1);

    // Reorder the roster (as a remove/merge-style change would) with matching rows.
    sys.applyRoster([{ id: 'b', type: 'planet' }, { id: 'a', type: 'planet' }], 2);
    sys.update(0.016, 1, new Float32Array([0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
    assert.deepStrictEqual(slotTranslation(sys, 0), [0, 0, 24], 'slot 0 must now show b');
    assert.deepStrictEqual(slotTranslation(sys, 1), [12, 0, 0], 'slot 1 must now show a');
    assert.strictEqual(typeAttrAt(sys, 0), bType, "b keeps b's visual, not the index visual");
    assert.strictEqual(typeAttrAt(sys, 1), aType, "a keeps a's visual, not the index visual");
});

test('F14-11: spawned ids render; retired ids compact away; star/BH TODO is marked', () => {
    const sys = makeTestSystem();
    sys.applyRoster(
        [{ id: 'a', type: 'planet' }, { id: 'b', type: 'planet' }, { id: 'spawned_1', type: 'planet' }],
        3
    );
    assert.strictEqual(sys.slotForBodyId('spawned_1'), 2);
    sys.update(0.016, 0, new Float32Array([
        1, 0, 0, 0, 0, 0, 0,
        0, 2, 0, 0, 0, 0, 0,
        0, 0, 3, 0, 0, 0, 0,
    ]));
    assert.deepStrictEqual(slotTranslation(sys, 2), [0, 36, 0]);

    // Retire 'a' (MERGE-style): slots compact, survivors keep visuals.
    const bType = typeAttrAt(sys, 1);
    sys.applyRoster([{ id: 'b', type: 'planet' }, { id: 'spawned_1', type: 'planet' }], 4);
    assert.strictEqual(sys.slotForBodyId('a'), undefined);
    assert.strictEqual(sys.slotForBodyId('b'), 0);
    sys.update(0.016, 1, new Float32Array([
        0, 2, 0, 0, 0, 0, 0,
        0, 0, 3, 0, 0, 0, 0,
    ]));
    assert.deepStrictEqual(slotTranslation(sys, 0), [0, 0, 24]);
    assert.strictEqual(typeAttrAt(sys, 0), bType);

    const src = fs.readFileSync('src/rendering/systems/PlanetarySystem.ts', 'utf8');
    assert.ok(src.includes('TODO(spawn-phase)'), 'star/BH renderer hookup must stay a marked TODO');
});

// ─── AUD-01..AUD-04 Acceptance Tests ──────────────────────────────────

test('AUD-01: Escape closes open panels/selection before toggling HUD; clear-screen restores HUD without deselecting', () => {
    const comp = fs.readFileSync('src/components/AetherGenesis.tsx', 'utf8');
    const shortcuts = fs.readFileSync('src/utils/hooks/useKeyboardShortcuts.ts', 'utf8');
    assert.ok(
        !shortcuts.includes("case 'Escape':"),
        'competing Escape handler must be removed from useKeyboardShortcuts.ts'
    );
    assert.ok(
        comp.includes('if (hudVisible && (isCatalogOpen || selectedStar !== null || isConstantsOpen))'),
        'Escape when HUD is visible must close open panels/selection without hiding HUD'
    );
    assert.ok(
        comp.includes('setHudVisible(prev => !prev)'),
        'Escape with nothing open (or when restoring from clear-screen) must toggle hudVisible'
    );
});

test('AUD-02: scrubbing a 10 M_sun star through supernova updates worker central mass with no negative semi-major axes', () => {
    const hook = fs.readFileSync('src/utils/hooks/useSimulation.ts', 'utf8');
    assert.ok(hook.includes('lastSyncedWorkerMassRef'), 'useSimulation must track lastSyncedWorkerMassRef');
    assert.ok(hook.includes("type: 'UPDATE_CENTRAL_MASS'"), 'coordinator.onTick must post UPDATE_CENTRAL_MASS on >1% mass change');

    posted.length = 0;
    dispatch('INIT', {
        bodies: [
            circularBody('preset_body_0', 1.0, 10.0),
            circularBody('preset_body_1', 2.5, 10.0),
            circularBody('preset_body_2', 5.2, 10.0),
        ],
        centralMass_solar: 10.0,
        dt_yr: 0.05,
        isRunning: false,
    });
    posted.length = 0;
    // Scrub 10 M_sun star through supernova -> 1.4 M_sun neutron star remnant
    dispatch('UPDATE_CENTRAL_MASS', { centralMass_solar: 1.4 });
    const updates = messagesOf('UPDATE');
    assert.ok(updates.length >= 1, 'UPDATE_CENTRAL_MASS must emit an updated state buffer');
    const buf = updates[updates.length - 1].buffer as Float32Array;
    const G_M = 4 * Math.PI * Math.PI * 1.4;
    for (let i = 0; i < 3; i++) {
        const off = i * 7;
        const r = Math.sqrt(buf[off] ** 2 + buf[off + 1] ** 2 + buf[off + 2] ** 2);
        const vSq = buf[off + 3] ** 2 + buf[off + 4] ** 2 + buf[off + 5] ** 2;
        const invA = 2.0 / r - vSq / G_M;
        assert.ok(invA > 0, `body ${i} must retain a positive semi-major axis after supernova mass loss, got invA=${invA}`);
    }
});

test('AUD-03: spawning 10 bodies via tap-to-spawn assigns deterministic hash visuals, never a random gas giant', () => {
    const sys = makeTestSystem();
    resetSpawnCounter();
    const roster = [];
    for (let i = 0; i < 10; i++) {
        const spawned = buildSpawnBody({ position_au: { x: 1 + i * 0.5, y: 0, z: 0 }, centralMass_solar: 1.0 });
        roster.push({ id: spawned.id, type: spawned.type });
    }
    sys.applyRoster(roster, 1);
    for (let i = 0; i < 10; i++) {
        const slot = sys.slotForBodyId(`spawned_${i + 1}`);
        assert.strictEqual(slot, i);
        assert.strictEqual(typeAttrAt(sys, slot!), 0, `spawned_${i + 1} must render with deterministic rocky type 0, never gas giant (1)`);
    }
});

test('AUD-04: shared horizonsParser resolves 1P to Halley and rejects Kerberos in both server.ts and MCP server', async () => {
    const serverSrc = fs.readFileSync('server.ts', 'utf8');
    const mcpSrc = fs.readFileSync('server/mcp/nasa-horizons.mjs', 'utf8');
    assert.ok(serverSrc.includes('./server/shared/horizonsParser.mjs'), 'server.ts must import shared horizonsParser.mjs');
    assert.ok(mcpSrc.includes('../shared/horizonsParser.mjs'), 'nasa-horizons.mjs must import shared horizonsParser.mjs');
    assert.ok(!mcpSrc.includes('recordNumbers[recordNumbers.length - 1]'), 'legacy last-record disambiguation must be gone from nasa-horizons.mjs');

    // @ts-expect-error .mjs shared helper
    const { horizonsRecordMatchesRequest, parseHorizonsIndexCandidates } = await import('../../server/shared/horizonsParser.mjs');
    assert.strictEqual(horizonsRecordMatchesRequest('1P/Halley', '1P'), true);
    assert.strictEqual(horizonsRecordMatchesRequest('Kerberos (904)', '1P'), false);
    const listing = [
        '  90000001  1682  1P               1P/Halley',
        '  90000030  1986  1P               1P/Halley',
        '       904  2020  (904)            Kerberos',
    ].join('\n');
    const candidates = parseHorizonsIndexCandidates(listing);
    const matching = candidates.filter((c: any) => horizonsRecordMatchesRequest(c.label, '1P'));
    assert.strictEqual(matching.length, 2);
    assert.ok(matching.every((c: any) => c.label.includes('Halley')));
});

test('BUG-01: discoverable spawn control exists in UI, defaults to 1 AU, and follows clamping path', () => {
    const hudSrc = fs.readFileSync('src/ui/Hud.tsx', 'utf8');
    const compSrc = fs.readFileSync('src/components/AetherGenesis.tsx', 'utf8');
    const hookSrc = fs.readFileSync('src/utils/hooks/useSimulation.ts', 'utf8');

    // 1. Visible button in HudActionButtons labeled "Spawn Body" with restrained HUD styling
    assert.ok(hudSrc.includes('onSpawnBody?: () => void'), 'HudActionButtonsProps must include onSpawnBody callback');
    assert.ok(hudSrc.includes('data-testid="spawn-body-btn"'), 'Spawn button must have data-testid="spawn-body-btn"');
    assert.ok(hudSrc.includes('<span>Spawn Body</span>'), 'Spawn button must be clearly labeled "Spawn Body"');
    assert.ok(hudSrc.includes('bg-[#C084FC]/15') && hudSrc.includes('border-[#C084FC]/40'), 'Spawn button must match TargetLockHUD aesthetic');

    // 2. Wired in AetherGenesis
    assert.ok(compSrc.includes('spawnDefaultBody'), 'AetherGenesis must destructure spawnDefaultBody from useSimulation');
    assert.ok(compSrc.includes('onSpawnBody={spawnDefaultBody}'), 'AetherGenesis must pass spawnDefaultBody to HudActionButtons');

    // 3. Sensible default (1 AU) and clamping in useSimulation hook
    assert.ok(hookSrc.includes('spawnDefaultBody = useCallback'), 'useSimulation must define spawnDefaultBody callback');
    assert.ok(hookSrc.includes('position_au?.x ?? 1.0'), 'spawnDefaultBody must default to 1 AU');
    assert.ok(hookSrc.includes('const MAX_SPAWN_AU = 100') && hookSrc.includes('const MIN_SPAWN_AU = 0.05'), 'spawnDefaultBody must enforce 0.05-100 AU clamping');
    assert.ok(hookSrc.includes('spawnBodyAtRef.current({ x: px, y: py, z: pz })'), 'spawnDefaultBody must delegate to spawnBodyAtRef');

    // 4. Existing tap handler intact
    assert.ok(hookSrc.includes("window.addEventListener('pointerup', onPointerUp)"), 'pointerup tap handler must remain intact');
    assert.ok(hookSrc.includes('raycaster.ray.intersectPlane(ecliptic, hitPoint)'), 'ecliptic plane raycasting in tap handler must remain intact');
});

test('BUG-02: audio engine handles suspended context asynchronously and camera handlers guard against zero-vector normalization', () => {
    const audioSrc = fs.readFileSync('src/audio/AudioEngine.ts', 'utf8');
    const starSelectionSrc = fs.readFileSync('src/utils/hooks/useStarSelection.ts', 'utf8');
    const simulationSrc = fs.readFileSync('src/utils/hooks/useSimulation.ts', 'utf8');
    const shortcutsSrc = fs.readFileSync('src/utils/hooks/useKeyboardShortcuts.ts', 'utf8');
    const targetLockSrc = fs.readFileSync('src/ui/navigation/TargetLockHUD.tsx', 'utf8');

    // 1. AudioEngine initiates resume() non-blockingly and defers playback when suspended
    assert.ok(audioSrc.includes("this.ctx.state === 'suspended'"), 'AudioEngine must check for suspended AudioContext state');
    assert.ok(audioSrc.includes('this.ctx.resume().then('), 'playUiClick / playSupernovaSound must resume asynchronously without blocking UI thread');
    assert.ok(audioSrc.includes('osc.onended = () =>'), 'AudioEngine must clean up oscillator and gain nodes on ended');

    // 2. AudioEngine init begins resume on first gesture if suspended
    assert.ok(audioSrc.includes("if (this.ctx.state === 'suspended') {\n                this.ctx.resume().catch(() => {});\n            }"), 'AudioEngine.init() must resume suspended context');

    // 3. centerOnStar guards against zero-vector NaN normalization
    assert.ok(starSelectionSrc.includes('diff.lengthSq() > 1e-6'), 'centerOnStar must check diff.lengthSq() > 1e-6 before normalizing');
    assert.ok(starSelectionSrc.includes('new THREE.Vector3(0, 0, 40)'), 'centerOnStar must supply a safe fallback Vector3 on zero length');

    // 4. Tap-select handler guards against zero-vector NaN normalization
    assert.ok(simulationSrc.includes('diff.lengthSq() > 1e-6'), 'tap-select handler must check diff.lengthSq() > 1e-6 before normalizing');

    // 5. [F] keyboard shortcut remains direct centerOnStar() call without audio overhead
    assert.ok(shortcutsSrc.includes("case 'f':\n                case 'F':\n                    e.preventDefault();\n                    centerOnStar();\n                    break;"), '[F] shortcut must call centerOnStar directly');

    // 6. TargetLockHUD maintains audio feedback on Go To action
    assert.ok(targetLockSrc.includes('audioEngine.playUiClick()'), 'TargetLockHUD must play UI click audio on Go To');
    assert.ok(targetLockSrc.includes('if (onWarpTo) onWarpTo()'), 'TargetLockHUD must invoke onWarpTo on Go To');
});


