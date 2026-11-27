import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { detectPerformanceTier, getNumStarsForTier } from '../../src/utils/performance.ts';

function withHardwareStub<T>(
    opts: { cores: number; dpr: number; maxTouchPoints: number; coarsePointer?: boolean },
    fn: () => T
): T {
    const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    try {
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
                hardwareConcurrency: opts.cores,
                maxTouchPoints: opts.maxTouchPoints,
            },
        });
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                devicePixelRatio: opts.dpr,
                location: { search: '' },
                matchMedia: (query: string) => ({
                    matches: Boolean(opts.coarsePointer && query.includes('pointer: coarse')),
                }),
            },
        });
        return fn();
    } finally {
        if (prevNavigator) {
            Object.defineProperty(globalThis, 'navigator', prevNavigator);
        } else {
            delete (globalThis as any).navigator;
        }
        if (prevWindow) {
            Object.defineProperty(globalThis, 'window', prevWindow);
        } else {
            delete (globalThis as any).window;
        }
    }
}

test('F18-1: touch devices stay capped at medium (200 hero stars) during auto-tuning upgrades', async () => {
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    try {
        const mod = await vite.ssrLoadModule('/src/utils/hooks/usePerformanceAutoTuning.ts');
        const { clampTierToHardwareCeiling, getAutoUpgradedTier } = mod;

        // 8-core, 3x DPR flagship phone/tablet with touch input
        withHardwareStub({ cores: 8, dpr: 3, maxTouchPoints: 5, coarsePointer: true }, () => {
            assert.strictEqual(detectPerformanceTier(), 'medium', 'touch hardware ceiling must be medium');
            assert.strictEqual(getAutoUpgradedTier('low'), 'medium', 'low may recover up to medium on touch');
            assert.strictEqual(getAutoUpgradedTier('medium'), null, 'medium must NEVER auto-upgrade to high on touch');
            assert.strictEqual(getAutoUpgradedTier('high'), null, 'high must NEVER auto-upgrade on touch');
            assert.strictEqual(clampTierToHardwareCeiling('high'), 'medium', 'explicit high clamps to medium on touch');
            assert.strictEqual(clampTierToHardwareCeiling('ultra'), 'medium', 'explicit ultra clamps to medium on touch');
            assert.strictEqual(getNumStarsForTier(clampTierToHardwareCeiling('ultra')), 200, 'touch hero star cap stays 200');
        });

        // 4-core non-touch desktop (medium hardware ceiling)
        withHardwareStub({ cores: 4, dpr: 1, maxTouchPoints: 0, coarsePointer: false }, () => {
            assert.strictEqual(detectPerformanceTier(), 'medium');
            assert.strictEqual(getAutoUpgradedTier('low'), 'medium', 'low recovers to hardware ceiling medium');
            assert.strictEqual(getAutoUpgradedTier('medium'), null, '4-core medium ceiling must not oscillate into high');
        });

        // 8-core 2x DPR non-touch desktop (ultra hardware ceiling)
        withHardwareStub({ cores: 8, dpr: 2, maxTouchPoints: 0, coarsePointer: false }, () => {
            assert.strictEqual(detectPerformanceTier(), 'ultra');
            assert.strictEqual(getAutoUpgradedTier('medium'), 'high', 'desktop with ultra ceiling can upgrade medium -> high');
            assert.strictEqual(getAutoUpgradedTier('high'), 'ultra', 'desktop with ultra ceiling can upgrade high -> ultra');
            assert.strictEqual(getAutoUpgradedTier('ultra'), null, 'ultra is top tier');
        });
    } finally {
        await vite.close();
    }
});

test('F18-2: usePerformanceAutoTuning source contract enforces hardware ceiling on upgrades', () => {
    const src = fs.readFileSync('src/utils/hooks/usePerformanceAutoTuning.ts', 'utf8');
    assert.ok(
        src.includes('const maxTierIndex = PERFORMANCE_TIERS.indexOf(detectPerformanceTier());'),
        'registerFrameDelta must compute maxTierIndex from detectPerformanceTier()'
    );
    assert.ok(
        src.includes('currentTierIndex < maxTierIndex'),
        'auto-upgrade branch must gate on currentTierIndex < maxTierIndex'
    );
    assert.ok(
        !src.includes('currentTierIndex < tiers.length - 1') && !src.includes('currentTierIndex < PERFORMANCE_TIERS.length - 1'),
        'unbounded upgrade up to ultra (tiers.length - 1) must not exist'
    );
    assert.ok(
        src.includes('const newTier = clampTierToHardwareCeiling(requestedTier);'),
        'handleTierChange must clamp requestedTier to hardware ceiling'
    );
});
