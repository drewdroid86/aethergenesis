import test from 'node:test';
import assert from 'node:assert/strict';

const posted: any[] = [];
(globalThis as any).self = {
    onmessage: null as any,
    postMessage: (msg: any) => { posted.push(msg); },
};

const worker = await import('../../src/simulation/nbodyWorker.ts');

function dispatch(type: string, payload: any): void {
    (globalThis as any).self.onmessage({ data: { type, payload } });
}

function lastUpdateBuffer(): Float32Array {
    const found = [...posted].reverse().find((m) => m.type === 'UPDATE');
    assert.ok(found, 'expected at least one UPDATE message');
    return found.buffer as Float32Array;
}

test('F29-1: RESET_BODIES ignores non-finite centralMass_solar instead of poisoning gravity', () => {
    posted.length = 0;
    const mu1 = 4 * Math.PI * Math.PI * 1.0;
    const earth = {
        id: 'earth',
        type: 'planet',
        mass_solar: 3e-6,
        radius_km: 6371,
        position_au: { x: 1.0, y: 0, z: 0 },
        velocity_au_yr: { x: 0, y: Math.sqrt(mu1), z: 0 },
    };
    dispatch('INIT', { bodies: [], centralMass_solar: 1.0, dt_yr: 0.05, isRunning: false });
    dispatch('RESET_BODIES', { bodies: [earth], centralMass_solar: Infinity });
    worker.physicsTickInner();

    const buf = lastUpdateBuffer();
    for (let i = 0; i < buf.length; i++) {
        assert.ok(Number.isFinite(buf[i]), `buffer[${i}] must remain finite when RESET_BODIES passes Infinity mass`);
    }
    const r = Math.hypot(buf[0], buf[1], buf[2]);
    assert.ok(r > 0.98 && r < 1.02, `body must remain near 1 AU under preserved 1 M_sun mass, got r=${r}`);
});

test('F29-2: adaptive substepper resolves close-in comets and high-eccentricity perihelia', () => {
    posted.length = 0;
    const mu = 4 * Math.PI * Math.PI * 1.0;
    const closeComet = {
        id: 'close_comet',
        type: 'comet',
        mass_solar: 1e-12,
        radius_km: 5,
        position_au: { x: 0.05, y: 0, z: 0 },
        velocity_au_yr: { x: 0, y: Math.sqrt(mu / 0.05), z: 0 },
    };
    // Eccentric comet starting at aphelion r_a = 1.95 AU with perihelion q = 0.05 AU (a = 1.0 AU, e = 0.95)
    const q = 0.05;
    const a = 1.0;
    const rAphelion = 2 * a - q;
    const vAphelion = Math.sqrt(mu * (2 / rAphelion - 1 / a));
    const eccentricComet = {
        id: 'ecc_comet',
        type: 'comet',
        mass_solar: 1e-12,
        radius_km: 5,
        position_au: { x: rAphelion, y: 0, z: 0 },
        velocity_au_yr: { x: 0, y: vAphelion, z: 0 },
    };

    dispatch('INIT', { bodies: [closeComet], centralMass_solar: 1.0, dt_yr: 0.3, isRunning: false });
    for (let t = 0; t < 20; t++) worker.physicsTickInner();
    const closeBuf = lastUpdateBuffer();
    const rClose = Math.hypot(closeBuf[0], closeBuf[1], closeBuf[2]);
    assert.ok(Number.isFinite(rClose) && rClose > 0.03 && rClose < 0.08, `close 0.05 AU comet must stay bound, got r=${rClose}`);

    dispatch('RESET_BODIES', { bodies: [eccentricComet], centralMass_solar: 1.0 });
    // Integrate past a full 1.0 yr orbit (through q = 0.05 AU perihelion passage)
    for (let t = 0; t < 5; t++) worker.physicsTickInner();
    const eccBuf = lastUpdateBuffer();
    for (let i = 0; i < eccBuf.length; i++) {
        assert.ok(Number.isFinite(eccBuf[i]), `eccentric comet buffer[${i}] must stay finite through perihelion`);
    }
    const rEcc = Math.hypot(eccBuf[0], eccBuf[1], eccBuf[2]);
    const vEccSq = eccBuf[3] * eccBuf[3] + eccBuf[4] * eccBuf[4] + eccBuf[5] * eccBuf[5];
    const specificEnergy = 0.5 * vEccSq - mu / rEcc;
    assert.ok(specificEnergy < 0, `eccentric comet must remain gravitationally bound (E < 0), got E=${specificEnergy}`);
});

test('F29-3: NaN recovery velocity scales with sqrt(centralMass_solar)', () => {
    posted.length = 0;
    const lowMass = 0.089; // TRAPPIST-1 M_sun
    const target = {
        id: 'recover_me',
        type: 'planet',
        mass_solar: 3e-6,
        radius_km: 6371,
        position_au: { x: 2.0, y: 0, z: 0 },
        velocity_au_yr: { x: 0, y: 1.0, z: 0 },
    };
    dispatch('INIT', { bodies: [], centralMass_solar: lowMass, dt_yr: 0.0005, isRunning: false });
    dispatch('RESET_BODIES', { bodies: [target], centralMass_solar: lowMass });
    // Corrupt runtime state post-validation to trigger integrate() NaN recovery
    target.position_au.x = NaN;
    target.velocity_au_yr.y = NaN;
    worker.physicsTickInner();

    const buf = lastUpdateBuffer();
    assert.strictEqual(buf.length, 7, 'recovered body must emit 7-float state');
    const vx = buf[3];
    const vy = buf[4];
    const vz = buf[5];
    const speed = Math.hypot(vx, vy, vz);
    const expectedCircular = (2.0 * Math.PI * Math.sqrt(lowMass)) / Math.sqrt(2.0);
    const escapeSpeed = Math.SQRT2 * expectedCircular;
    assert.ok(Number.isFinite(speed) && speed < escapeSpeed, `recovered speed (${speed}) must be below escape speed (${escapeSpeed}) around 0.089 M_sun`);
    assert.ok(Math.abs(speed - expectedCircular) / expectedCircular < 0.05, `recovered speed (${speed}) must match circular speed (${expectedCircular})`);
});
