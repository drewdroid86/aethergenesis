import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';

test('F18-1: uShockwave expands forward to completion after flash ends and freezes when paused', async () => {
    const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { innerWidth: 1280, innerHeight: 720 },
    });

    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    try {
        const { Pipeline } = await vite.ssrLoadModule('/src/rendering/pipeline.ts');
        const pipeline = Object.create(Pipeline.prototype);
        const uShockwave = { value: 0 };
        Object.assign(pipeline, {
            _tempV: new THREE.Vector3(),
            _screenPos: new THREE.Vector2(0.5, 0.5),
            lensingStrength: 0,
            _bloomStrength: 0.65,
            _bloomRadius: 0.25,
            _bloomThreshold: 1.0,
            bloomPass: { threshold: 1.0, strength: 0.65, radius: 0.25 },
            cinematicPass: {
                uniforms: {
                    uShockwave,
                    uLensingStrength: { value: 0 },
                    uBlackHoleScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
                    uBlackHoleRadius: { value: 0 },
                    uAspectRatio: { value: 1 },
                },
            },
        });

        const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
        camera.position.z = 5;
        camera.updateMatrixWorld();

        const star = { phase: 4, mass: 10, position: new THREE.Vector3(), isSupernovaFlashing: true };

        // 1. While flashing and unpaused, shockwave expands outward monotonically
        pipeline.updateLensing(star, camera, 0.2, false);
        assert.ok(Math.abs(uShockwave.value - 0.3) < 1e-6, `expected 0.3, got ${uShockwave.value}`);

        // 2. While paused (even during flash), shockwave must freeze
        pipeline.updateLensing(star, camera, 0.2, true);
        assert.ok(Math.abs(uShockwave.value - 0.3) < 1e-6, `shockwave must freeze while paused, got ${uShockwave.value}`);

        // 3. When flash ends unpaused, shockwave must advance forward (> 0.3), NEVER implode backward (< 0.3)
        star.isSupernovaFlashing = false;
        pipeline.updateLensing(star, camera, 0.2, false);
        assert.ok(
            uShockwave.value > 0.3 && Math.abs(uShockwave.value - 0.6) < 1e-6,
            `post-flash shockwave must continue expanding forward to 0.6, got ${uShockwave.value}`
        );

        // 4. Pausing during post-flash tail also freezes uShockwave
        pipeline.updateLensing(star, camera, 0.2, true);
        assert.ok(Math.abs(uShockwave.value - 0.6) < 1e-6, `post-flash shockwave must freeze while paused, got ${uShockwave.value}`);

        // 5. Large frame hitch completes outward expansion cleanly to 0 (never negative)
        pipeline.updateLensing(star, camera, 0.5, false);
        assert.strictEqual(uShockwave.value, 0, 'completed shockwave resets cleanly to 0');

        // 6. Idle non-flashing frame keeps uShockwave at 0
        pipeline.updateLensing(star, camera, 0.05, false);
        assert.strictEqual(uShockwave.value, 0, 'idle frame stays at 0');
    } finally {
        await vite.close();
        if (prevWindow) {
            Object.defineProperty(globalThis, 'window', prevWindow);
        } else {
            delete (globalThis as any).window;
        }
    }
});

test('F18-2: Engine.update forwards this.isPaused to pipeline.updateLensing', () => {
    const engineSrc = fs.readFileSync('src/core/engine.ts', 'utf8');
    assert.ok(
        engineSrc.includes('this.pipeline.updateLensing(this.selectedStar || this.heroStars[0], this.camera, delta, this.isPaused)'),
        'Engine.update must pass this.isPaused to pipeline.updateLensing'
    );
});
