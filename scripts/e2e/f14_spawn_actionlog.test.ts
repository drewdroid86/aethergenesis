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
