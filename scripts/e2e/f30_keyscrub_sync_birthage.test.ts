import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyStarLifecycleScrub } from '../../src/simulation/stellarAge.ts';
import { PHASES, STELLAR_CONSTANTS } from '../../src/core/constants.ts';

test('F30-1: applyStarLifecycleScrub syncs birthAge across gravity settings so next frame preserves star.t', () => {
    const maxT = STELLAR_CONSTANTS.PHASE_BOUNDARIES.LIFECYCLE_MAX;
    for (const effG of [0.5, 1.0, 2.0]) {
        const cosmicAge = 5.0;
        const star = {
            physicsId: 'sun_test',
            mass: 1.0,
            currentMass: 1.0,
            lifespanReal: 10000,
            currentRealAge: 4600,
            t: 0.46,
            birthAge: cosmicAge - (4600 / 1000) / effG,
            phase: PHASES.MAIN_SEQUENCE,
            syncBirthAge(ageGyr: number, g: number = 1.0) {
                this.currentRealAge = Math.max(0, this.t * this.lifespanReal);
                this.birthAge = ageGyr - (this.currentRealAge / 1000) / g;
            },
        };

        // Scrub via ArrowRight (+0.015) and then to Red Giant (t = 1.1) and End (t = maxT)
        for (const targetT of [star.t + 0.015, 1.1, maxT, 0]) {
            const { clampedT } = applyStarLifecycleScrub(star, targetT, cosmicAge, effG);
            assert.ok(Math.abs(star.t - clampedT) < 1e-12, `star.t must match clampedT=${clampedT}`);
            // Simulate HeroStarSystem.update() on the next frame (overrideT === undefined)
            const ageMyrNextFrame = (cosmicAge - star.birthAge) * 1000;
            const rawTNextFrame = ageMyrNextFrame / (star.lifespanReal / effG);
            assert.ok(
                Math.abs(rawTNextFrame - clampedT) < 1e-9,
                `next frame rawT (${rawTNextFrame}) must preserve scrubbed t (${clampedT}) at effG=${effG}`
            );
        }
    }
});

test('F30-2: applyStarLifecycleScrub updates phase, currentMass, and phaseName before ARIA readout', () => {
    const star = {
        physicsId: 'sun_test',
        mass: 1.0,
        currentMass: 1.0,
        lifespanReal: 10000,
        currentRealAge: 4600,
        t: 0.46,
        birthAge: 0.4,
        phase: PHASES.MAIN_SEQUENCE,
    };

    // Scrub to Red Giant (t = 1.1) -> mass loses envelope, phase becomes RED_GIANT ("Red Giant")
    const rg = applyStarLifecycleScrub(star, 1.1, 5.0, 1.0);
    assert.strictEqual(star.phase, PHASES.RED_GIANT);
    assert.strictEqual(rg.phaseName, 'Red Giant');
    assert.ok(star.currentMass < 1.0, `expected post-mass-loss red giant mass < 1.0, got ${star.currentMass}`);

    // Scrub to End (Remnant) -> phase becomes REMNANT ("Remnant"), white dwarf core mass
    const rem = applyStarLifecycleScrub(star, STELLAR_CONSTANTS.PHASE_BOUNDARIES.LIFECYCLE_MAX, 5.0, 1.0);
    assert.strictEqual(star.phase, PHASES.REMNANT);
    assert.strictEqual(rem.phaseName, 'Remnant');
    assert.strictEqual(rem.percentage, 100);
    assert.ok(star.currentMass < 0.6, `expected white dwarf remnant mass < 0.6, got ${star.currentMass}`);
});

test('F30-3: useSimulation onKeyDown and wrappedOnScrubEnd call applyStarLifecycleScrub and rekeyNBodyForStar', () => {
    const src = fs.readFileSync('src/utils/hooks/useSimulation.ts', 'utf8');
    const scrubEndIdx = src.indexOf('const wrappedOnScrubEnd = useCallback(');
    assert.ok(scrubEndIdx !== -1, 'wrappedOnScrubEnd must exist in useSimulation.ts');
    const scrubEndBlock = src.slice(scrubEndIdx, scrubEndIdx + 800);
    assert.ok(
        scrubEndBlock.includes('applyStarLifecycleScrub(star, star.t, cosmicAgeVal, effG)'),
        'wrappedOnScrubEnd must call applyStarLifecycleScrub'
    );
    const keyIdx = src.indexOf('onKeyDown: (e: React.KeyboardEvent, global: boolean)');
    assert.ok(keyIdx !== -1, 'onKeyDown handler must exist in useSimulation.ts');
    const keyEnd = src.indexOf('currentSeed:', keyIdx);
    const keyBlock = src.slice(keyIdx, keyEnd !== -1 ? keyEnd : keyIdx + 2500);
    assert.ok(
        keyBlock.includes('applyStarLifecycleScrub(star, t, cosmicAgeVal, effG)'),
        'onKeyDown star branch must call applyStarLifecycleScrub to sync birthAge, phase, and mass'
    );
    assert.ok(
        keyBlock.includes('rekeyNBodyForStar(star, engineRef.current.renderer, nbodyWorkerRef.current)'),
        'onKeyDown star branch must re-key N-body worker via shared rekeyNBodyForStar helper'
    );
    assert.ok(
        keyBlock.includes('${perc}% of Stellar Lifecycle (${phaseName})'),
        'onKeyDown star branch must format aria-valuetext with the updated phaseName'
    );
});
