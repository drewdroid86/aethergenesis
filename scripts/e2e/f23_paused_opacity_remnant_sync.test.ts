import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

test('F23: paused preset/scrub opacity snaps cleanly, overrideT syncs birthAge, and remnant groups stay mutually exclusive', async () => {
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    try {
        const [{ HeroStarSystem }, { RemnantPhase }, { DEFAULT_CONSTANTS }, { PHASES }] = await Promise.all([
            vite.ssrLoadModule('/src/rendering/systems/HeroStarSystem.ts'),
            vite.ssrLoadModule('/src/simulation/phases/RemnantPhase.ts'),
            vite.ssrLoadModule('/src/types/physics.ts'),
            vite.ssrLoadModule('/src/core/constants.ts'),
        ]);

        const physics = { ...DEFAULT_CONSTANTS, G: 1 };
        const star = new HeroStarSystem(5, physics);

        // 1. Paused preset load (delta = 0) must make the star immediately visible at opacity > 0
        star.applyPreset({ name: 'Sol', mass_solar: 1.0, luminosity_solar: 1.0, temperature_K: 5778, age_gyr: 4.6 }, undefined, 5, physics);
        star.update(0, 1.0, new THREE.Vector3(0, 0, 20), physics, undefined, 5);
        const msPhase = (star as any)._mainSequencePhase;
        assert.equal(star.phase, PHASES.MAIN_SEQUENCE);
        assert.equal(msPhase.mainSeqGroup.visible, true, 'paused MAIN_SEQUENCE preset must be visible when delta = 0');
        assert.equal(msPhase.starMat.uniforms.uOpacity.value, 1.0, 'paused MAIN_SEQUENCE preset opacity must snap to 1.0');

        // 2. Scrubbing via overrideT must sync birthAge so releasing overrideT retains the scrubbed phase/t
        star.update(0, 1.1, new THREE.Vector3(0, 0, 20), physics, 1.08, 5);
        assert.equal(star.phase, PHASES.RED_GIANT);
        star.update(0, 1.2, new THREE.Vector3(0, 0, 20), physics, undefined, 5);
        assert.equal(star.phase, PHASES.RED_GIANT, 'birthAge synced on overrideT must keep star in RED_GIANT after overrideT ends');
        assert.ok(Math.abs(star.t - 1.08) < 1e-6);

        // 3. Sub-BH remnant -> BH remnant mutual exclusion & _opNs sync even when paused (delta = 0)
        star.applyPreset({ name: 'Vela', mass_solar: 11.0, phase: 5 }, undefined, 5, physics);
        star.update(0, 2.0, new THREE.Vector3(0, 0, 20), physics, 1.55, 5);
        const remPhase = (star as any)._remnantPhase;
        assert.equal(remPhase.neutronStarGroup.visible, true, '11 M☉ remnant must show neutronStarGroup');
        assert.equal(remPhase.blackHoleGroup.visible, false, '11 M☉ remnant must hide blackHoleGroup');
        assert.equal((star as any)._opNs, 1.0, 'HeroStarSystem._opNs must mirror RemnantPhase._opNs');

        // Switch mass to 21.2 M☉ directly on RemnantPhase and verify mutual exclusion
        const remUnit = new RemnantPhase(11.0);
        const container = new THREE.Group();
        remUnit.init(container);
        remUnit.update(0.016, 1.0, new THREE.Vector3(0, 2, 10), physics, 1.55, false, 1.0);
        remUnit.updateRemnantOpacity(0, 1, 1.0);
        assert.equal(remUnit.neutronStarGroup.visible, true);
        assert.equal(remUnit.blackHoleGroup.visible, false);

        remUnit.setMass(21.2);
        remUnit.update(0.016, 1.1, new THREE.Vector3(0, 2, 10), physics, 1.55, false, 1.0);
        const opAfterBh = remUnit.updateRemnantOpacity(0, 0, 1.0);
        assert.equal(opAfterBh, 0);
        assert.equal(remUnit.neutronStarGroup.visible, false, 'BH mass must hide neutronStarGroup');
        assert.equal(remUnit.blackHoleGroup.visible, true, 'BH mass must show blackHoleGroup');

        remUnit.dispose();
        star.dispose();
    } finally {
        await vite.close();
    }
});
