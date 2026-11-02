import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

test('remote age changes persist through paused frames at different gravity values', async () => {
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    try {
        const [{ HeroStarSystem }, { Engine }, { DEFAULT_CONSTANTS }] = await Promise.all([
            vite.ssrLoadModule('/src/rendering/systems/HeroStarSystem.ts'),
            vite.ssrLoadModule('/src/core/engine.ts'),
            vite.ssrLoadModule('/src/types/physics.ts'),
        ]);
        for (const gravity of [0.5, 2]) {
            const physics = { ...DEFAULT_CONSTANTS, G: gravity };
            const star = new HeroStarSystem(5, physics);
            Object.assign(star, { mass: 1, lifespanReal: 10000, currentRealAge: 1000, t: 0.1, _activePhase: 2 });
            const engine = Object.create(Engine.prototype);
            Object.assign(engine, { selectedStar: star, heroStars: [star], cosmicAge: 5, physicsConstants: physics });
            const frame = () => star.update(0, 0, new THREE.Vector3(0, 0, 100), physics, undefined, 5, { intersectsSphere: () => false });

            engine.advanceTime(1e9);
            for (let i = 0; i < 3; i++) frame();
            assert.ok(Math.abs(star.currentRealAge - 2000) < 0.001);

            engine.forceSupernova();
            const forcedAge = star.currentRealAge;
            for (let i = 0; i < 3; i++) frame();
            assert.ok(Math.abs(star.currentRealAge - forcedAge) < 0.001);
            assert.equal(star.phase, 4);
        }

        const previousRequest = globalThis.requestAnimationFrame;
        const previousCancel = globalThis.cancelAnimationFrame;
        try {
            let nextFrame: FrameRequestCallback | undefined;
            globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return 1; };
            globalThis.cancelAnimationFrame = () => {};
            const clock = Object.create(Engine.prototype);
            let respawns = 0;
            Object.assign(clock, { _frameId: null, renderer: null, isPaused: true, isPlayingCosmic: true,
                isGlobalScrubbing: false, timeScale: 'cosmic', cosmicAge: 13.9999999, simulatedTimeYears: 0,
                update: () => {}, respawnAllStars: () => { respawns++; }, onTick: null });
            clock.start();
            for (let i = 0; i < 3; i++) nextFrame!(0);
            assert.equal(clock.cosmicAge, 13.9999999);
            assert.equal(clock.simulatedTimeYears, 0);
            assert.equal(respawns, 0);
            clock.isPaused = false;
            nextFrame!(0);
            assert.equal(clock.cosmicAge, 0);
            assert.equal(respawns, 1);
            clock.stop();
        } finally {
            globalThis.requestAnimationFrame = previousRequest;
            globalThis.cancelAnimationFrame = previousCancel;
        }
    } finally {
        await vite.close();
    }
});
