import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

test('F22: off-screen remnant/nebula transitions clear wantsLight and RED_GIANT bounds scale from currentRadius', async () => {
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    try {
        const [{ HeroStarSystem }, { DEFAULT_CONSTANTS }, { PHASES, STELLAR_CONSTANTS }] = await Promise.all([
            vite.ssrLoadModule('/src/rendering/systems/HeroStarSystem.ts'),
            vite.ssrLoadModule('/src/types/physics.ts'),
            vite.ssrLoadModule('/src/core/constants.ts'),
        ]);

        const physics = { ...DEFAULT_CONSTANTS, G: 1 };
        const star = new HeroStarSystem(5, physics);
        star.applyPreset({ name: 'Sol', mass_solar: 1.0, luminosity_solar: 1.0, temperature_K: 5778, age_gyr: 4.6 }, undefined, 5, physics);
        star.position.set(0, 0, 0);

        const alwaysVisibleFrustum = { intersectsSphere: () => true } as unknown as THREE.Frustum;
        const neverVisibleFrustum = { intersectsSphere: () => false } as unknown as THREE.Frustum;

        // 1. On-screen MAIN_SEQUENCE star acquires wantsLight = true and visible PointLight
        star.update(0.016, 1.0, new THREE.Vector3(0, 0, 20), physics, undefined, 5, alwaysVisibleFrustum);
        assert.equal(star.phase, PHASES.MAIN_SEQUENCE);
        assert.equal(star.wantsLight, true);
        assert.equal(star.starLight.visible, true);

        // 2. While off-screen, advance age into REMNANT -> wantsLight and starLight.visible must clear immediately
        star.t = 1.55;
        star.syncBirthAge(5, 1);
        star.update(0.016, 2.0, new THREE.Vector3(0, 0, 20), physics, undefined, 5, neverVisibleFrustum);
        assert.equal(star.phase, PHASES.REMNANT);
        assert.equal(star.wantsLight, false, 'off-screen transition to REMNANT must clear wantsLight');
        assert.equal(star.starLight.visible, false, 'off-screen transition to REMNANT must hide starLight');
        assert.equal(star.starLight.intensity, 0);

        // 3. Re-enter emitting phase on-screen (RED_GIANT late progress, giant radius >> baseRadius * 4)
        star.t = 1.18;
        star.syncBirthAge(5, 1);
        let capturedFrustumRadius = 0;
        const captureFrustum = {
            intersectsSphere: (sphere: THREE.Sphere) => {
                capturedFrustumRadius = sphere.radius;
                return true;
            },
        } as unknown as THREE.Frustum;

        star.update(0.016, 3.0, new THREE.Vector3(0, 0, 20), physics, undefined, 5, captureFrustum);
        assert.equal(star.phase, PHASES.RED_GIANT);
        const expectedPhotosphereWorldR = star.currentRadius * STELLAR_CONSTANTS.VISUALS.WORLD_UNITS_PER_R_SUN;
        assert.ok(expectedPhotosphereWorldR > star.baseRadius * 4.0, 'late RED_GIANT world radius exceeds baseRadius * 4');
        assert.ok(
            capturedFrustumRadius >= expectedPhotosphereWorldR * 1.35 - 1e-6,
            'RED_GIANT frustum boundRadius must encompass halo scaled by currentRadius'
        );
        assert.ok(
            star.hitMesh.scale.x * 8.0 >= expectedPhotosphereWorldR - 1e-6,
            'RED_GIANT hitMesh scale must match currentRadius world size'
        );

        // 4. Off-screen transition into NEBULA (cosmic recycle / age < nebula limit) must also clear wantsLight
        star.t = 0.0;
        star.syncBirthAge(5, 1);
        star.update(0.016, 4.0, new THREE.Vector3(0, 0, 20), physics, undefined, 5, neverVisibleFrustum);
        assert.equal(star.phase, PHASES.NEBULA);
        assert.equal(star.wantsLight, false, 'off-screen transition to NEBULA must clear wantsLight');
        assert.equal(star.starLight.visible, false);

        star.dispose();
    } finally {
        await vite.close();
    }
});
