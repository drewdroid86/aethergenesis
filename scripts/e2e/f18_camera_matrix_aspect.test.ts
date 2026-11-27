import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';

test('F18-1: Pipeline.updateLensing refreshes camera.matrixWorldInverse and uses camera.aspect without window', async () => {
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    try {
        const [{ Pipeline }, { PHASES }] = await Promise.all([
            vite.ssrLoadModule('/src/rendering/pipeline.ts'),
            vite.ssrLoadModule('/src/core/constants.ts'),
        ]);

        const pipeline = Object.create(Pipeline.prototype);
        const uBlackHoleScreenPos = { value: new THREE.Vector2(0.5, 0.5) };
        const uAspectRatio = { value: 1.0 };
        Object.assign(pipeline, {
            _tempV: new THREE.Vector3(),
            _screenPos: new THREE.Vector2(0.5, 0.5),
            _viewportAspect: 1.0,
            lensingStrength: 0,
            _bloomStrength: 0.65,
            _bloomRadius: 0.25,
            _bloomThreshold: 1.0,
            bloomPass: { threshold: 1.0, strength: 0.65, radius: 0.25, resolution: new THREE.Vector2() },
            composer: { setSize: () => {} },
            cinematicPass: {
                uniforms: {
                    uShockwave: { value: 0 },
                    uLensingStrength: { value: 0 },
                    uBlackHoleScreenPos,
                    uBlackHoleRadius: { value: 0 },
                    uAspectRatio,
                },
            },
        });

        // Camera starts at origin (viewZ of origin = 0), then moves to (0, 0, 12) WITHOUT calling updateMatrixWorld()
        const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
        camera.updateMatrixWorld(); // stale matrixWorldInverse at origin
        camera.position.set(0, 0, 12);
        camera.lookAt(0, 0, 0);

        const blackHole = {
            phase: PHASES.REMNANT,
            mass: 21.2,
            position: new THREE.Vector3(0, 0, 0),
            scale: new THREE.Vector3(1, 1, 1),
            isSupernovaFlashing: false,
        };

        // Must succeed with window === undefined and stale camera.matrixWorldInverse
        pipeline.updateLensing(blackHole, camera, 0.2);

        assert.ok(
            Math.abs(uBlackHoleScreenPos.value.x - 0.5) < 1e-4 && Math.abs(uBlackHoleScreenPos.value.y - 0.5) < 1e-4,
            `expected black hole centered at (0.5, 0.5), got (${uBlackHoleScreenPos.value.x}, ${uBlackHoleScreenPos.value.y})`
        );
        assert.ok(pipeline.lensingStrength > 0, 'lensingStrength must activate when camera moved in front of BH');
        assert.ok(Math.abs(uAspectRatio.value - 16 / 9) < 1e-6, `uAspectRatio must match camera.aspect (16/9), got ${uAspectRatio.value}`);

        // Fallback to _viewportAspect from setSize when camera.aspect is non-positive
        pipeline.setSize(800, 600);
        camera.aspect = 0;
        pipeline.updateLensing(blackHole, camera, 0.016);
        assert.ok(Math.abs(uAspectRatio.value - 800 / 600) < 1e-6, `expected 4/3 fallback, got ${uAspectRatio.value}`);
    } finally {
        await vite.close();
    }
});

test('F18-2: Engine.update calls camera.updateMatrixWorld() before frustum calculation and pipeline uses no unguarded window in updateLensing', () => {
    const engineSrc = fs.readFileSync('src/core/engine.ts', 'utf8');
    const updateIdx = engineSrc.indexOf('this.camera.updateMatrixWorld();');
    const frustumIdx = engineSrc.indexOf('this._frustum.setFromProjectionMatrix(');
    assert.ok(updateIdx !== -1 && frustumIdx !== -1, 'camera.updateMatrixWorld and _frustum.setFromProjectionMatrix must exist');
    assert.ok(updateIdx < frustumIdx, 'camera.updateMatrixWorld() must run before _frustum.setFromProjectionMatrix()');

    const pipelineSrc = fs.readFileSync('src/rendering/pipeline.ts', 'utf8');
    const lensingStart = pipelineSrc.indexOf('public updateLensing(');
    const renderStart = pipelineSrc.indexOf('public render(');
    const lensingBody = pipelineSrc.slice(lensingStart, renderStart);
    assert.ok(!lensingBody.includes('window.'), 'updateLensing must not read window.* directly');
});
