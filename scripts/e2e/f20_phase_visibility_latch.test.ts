import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const heroSrc = () => readFileSync('src/rendering/systems/HeroStarSystem.ts', 'utf8');

test('F20-1: HeroStarSystem transition blocks sync _lastVis* with visGroup (globalFade > 0.01) instead of latching true', () => {
    const s = heroSrc();
    assert.ok(s.includes('const visGroup = globalFade > 0.01;'), 'update() must compute visGroup = globalFade > 0.01');

    for (const [flag, groupExpr] of [
        ['_lastVisP', 'this.protostarPhase.protostarGroup.visible = visGroup;'],
        ['_lastVisM', 'this.mainSequencePhase.mainSeqGroup.visible = visGroup;'],
        ['_lastVisR', 'this.redGiantPhase.redGiantGroup.visible = visGroup;'],
        ['_lastVisS', 'this.supernovaPhase.supernovaGroup.visible = visGroup;'],
    ] as const) {
        assert.ok(
            s.includes(`if (this.${flag} !== visGroup)`),
            `${flag} must compare against visGroup so fade-out and recovery both update group.visible`
        );
        assert.ok(s.includes(groupExpr), `${flag} branch must assign ${groupExpr}`);
        assert.ok(s.includes(`this.${flag} = visGroup;`), `${flag} must store visGroup rather than unconditional true`);
        assert.ok(!s.includes(`if (!this.${flag})`), `${flag} must not use one-way if (!this.${flag}) latch`);
    }
});

test('F20-2: _exitPhase and phase show() calls keep _lastVis* synchronized with phase group visibility', () => {
    const s = heroSrc();
    const exitStart = s.indexOf('private _exitPhase(');
    const exitEnd = s.indexOf('public syncBirthAge(');
    assert.ok(exitStart !== -1 && exitEnd > exitStart, '_exitPhase must exist');
    const exitBody = s.slice(exitStart, exitEnd);

    for (const [phaseConst, hideCall, flag] of [
        ['PHASES.PROTOSTAR', 'this._protostarPhase?.hide()', 'this._lastVisP = false'],
        ['PHASES.MAIN_SEQUENCE', 'this._mainSequencePhase?.hide()', 'this._lastVisM = false'],
        ['PHASES.RED_GIANT', 'this._redGiantPhase?.hide()', 'this._lastVisR = false'],
        ['PHASES.SUPERNOVA', 'this._supernovaPhase?.hide()', 'this._lastVisS = false'],
    ] as const) {
        const idx = exitBody.indexOf(`exitingPhase === ${phaseConst}`);
        assert.ok(idx !== -1, `_exitPhase must handle ${phaseConst}`);
        const slice = exitBody.slice(idx, idx + 450);
        assert.ok(slice.includes(hideCall), `_exitPhase must call ${hideCall}`);
        assert.ok(slice.includes(flag), `_exitPhase must reset ${flag}`);
    }
});
