import test from 'node:test';
import assert from 'node:assert';

// ==========================================
// FIX-06: worker substeps scale with the innermost orbital period.
// A close-in planet took ~T/5.6 per fixed 0.002-yr step and went
// unstable (strobing/teleporting). The worker now resolves every
// substep to at most T_min/20, capped at 2000 substeps/tick with
// a throttled log instead of a freeze. Pure worker logic — the
// `self` stub stands in for the worker scope; no server needed.
// ==========================================

// The worker module assigns self.onmessage at import time, so the stub
// must exist before the (dynamic — static imports hoist) import.
const updates: any[] = [];
(globalThis as any).self = {
    onmessage: null as any,
    postMessage: (msg: any) => { updates.push(msg); },
};

const worker = await import('../../src/simulation/nbodyWorker.ts');

function dispatch(type: string, payload: any): void {
    (globalThis as any).self.onmessage({ data: { type, payload } });
}

function init(dt_yr = 0.3, centralMass_solar = 1.0): void {
    updates.length = 0;
    dispatch('INIT', { bodies: [], centralMass_solar, dt_yr, isRunning: false });
}

function circularPlanet(id: string, a_au: number, centralMass_solar = 1.0): any {
    const mu = 4 * Math.PI * Math.PI * centralMass_solar;
    return {
        id, type: 'planet', mass_solar: 3e-6, radius_km: 6371,
        position_au: { x: a_au, y: 0, z: 0 },
        velocity_au_yr: { x: 0, y: Math.sqrt(mu / a_au), z: 0 },
    };
}

function postedRadii(): number[] {
    return updates.map((u) => {
        const b = u.buffer as Float32Array;
        return Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
    });
}

test('F13-1: close-in planet (0.05 AU) stays bound over 40 cosmic ticks', () => {
    init(0.3, 1.0);
    dispatch('RESET_BODIES', {
        bodies: [circularPlanet('close', 0.05)],
        centralMass_solar: 1.0,
    });
    for (let t = 0; t < 40; t++) worker.physicsTickInner();
    assert.equal(updates.length, 40, `one UPDATE per tick, got ${updates.length}`);
    for (const r of postedRadii()) {
        assert.ok(Number.isFinite(r), `radius must stay finite, got ${r}`);
        assert.ok(r > 0.025 && r < 0.1, `0.05 AU planet must stay bound, got r=${r}`);
    }
});

test('F13-2: 1 AU planet keeps its orbit (no regression for normal systems)', () => {
    init(0.3, 1.0);
    dispatch('RESET_BODIES', {
        bodies: [circularPlanet('earth', 1.0)],
        centralMass_solar: 1.0,
    });
    for (let t = 0; t < 10; t++) worker.physicsTickInner();
    for (const r of postedRadii()) {
        assert.ok(Math.abs(r - 1.0) < 0.01, `1 AU planet must hold its orbit, got r=${r}`);
    }
});

test('F13-3: pathological innermost orbit hits the substep cap without freezing and logs it', () => {
    init(0.3, 1.0);
    dispatch('RESET_BODIES', {
        bodies: [circularPlanet('hot', 0.005)],
        centralMass_solar: 1.0,
    });
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => { warnings.push(args.join(' ')); };
    try {
        for (let t = 0; t < 10; t++) worker.physicsTickInner();
    } finally {
        console.warn = origWarn;
    }
    assert.equal(updates.length, 10, `tick loop must not freeze, got ${updates.length} UPDATEs`);
    for (const r of postedRadii()) {
        assert.ok(Number.isFinite(r), `radius must stay finite, got ${r}`);
    }
    assert.ok(
        warnings.some((w) => w.includes('substep cap')),
        `expected a substep-cap log, got: ${JSON.stringify(warnings)}`
    );
});
