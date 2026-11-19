import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlanetarySystem } from '../../src/rendering/systems/PlanetarySystem';
import { DestructionEffects } from '../../src/rendering/systems/DestructionEffects';
import { PHASES } from '../../src/core/constants';

const messages: any[] = [];
(globalThis as any).self = { onmessage: null, postMessage: (message: any) => messages.push(message) };
const worker = await import('../../src/simulation/nbodyWorker');
const send = (type: string, payload: any) => (globalThis as any).self.onmessage({ data: { type, payload } });
const body = (id: string, radius: number, speed = 0) => ({ id, type: 'planet', mass_solar: 3e-6, radius_km: 6371,
    position_au: { x: radius, y: 0, z: 0 }, velocity_au_yr: { x: speed, y: 0, z: 0 } });
const init = (bodies: any[]) => {
    send('INIT', { generation: 7, bodies, centralMass_solar: 4, dt_yr: 0.00035, isRunning: false });
    messages.length = 0;
};
const events = () => messages.filter(m => m.type === 'SIM_EVENT');

test('F18: expanding blast retires only reached bodies, preserving ids and event order', () => {
    init([body('inner', 0.4), body('outer', 2)]);
    send('UPDATE_DESTRUCTION', { generation: 7, blastRadius_au: 0.5, captureRadius_au: 0 });
    assert.deepEqual(events().map(m => m.event.actorId), ['inner']);
    assert.equal(events()[0].event.type, 'DESTRUCTION');
    assert.equal(events()[0].generation, 7);
    assert.equal(events()[0].event.positions[0].x, 0.4);
    assert.deepEqual(messages.find(m => m.type === 'ROSTER').bodies.map((b: any) => b.id), ['outer']);
    assert.ok(messages.findIndex(m => m.type === 'SIM_EVENT') < messages.findIndex(m => m.type === 'ROSTER'));
    send('UPDATE_DESTRUCTION', { generation: 7, blastRadius_au: 0.5, captureRadius_au: 0 });
    assert.equal(events().length, 1, 'a retired body explodes only once');
    send('UPDATE_DESTRUCTION', { generation: 7, blastRadius_au: 3, captureRadius_au: 0 });
    assert.deepEqual(events().map(m => m.event.actorId), ['inner', 'outer']);
    assert.equal(messages.at(-1).buffer.length, 0);
});

test('F18: stale and invalid boundaries cannot destroy a new selection', () => {
    init([body('safe', 0.4)]);
    for (const payload of [
        { generation: 6, blastRadius_au: 10, captureRadius_au: 0 },
        { generation: 7, blastRadius_au: NaN, captureRadius_au: 0 },
        { generation: 7, blastRadius_au: 0, captureRadius_au: -1 },
    ]) send('UPDATE_DESTRUCTION', payload);
    assert.equal(events().length, 0);
    send('UPDATE_DESTRUCTION', { generation: 7, blastRadius_au: 0, captureRadius_au: 1 });
    send('RESET_BODIES', { generation: 8, bodies: [body('new', 0.4)], centralMass_solar: 4 });
    messages.length = 0;
    worker.physicsTickInner();
    assert.equal(events().length, 0, 'reset clears the old capture boundary');
    assert.equal(messages.at(-1).buffer.length, 7);
});

test('F18: fast plunges are captured without tunnelling, while an outer orbit survives', () => {
    const outer = body('outer', 2);
    outer.velocity_au_yr.y = Math.sqrt(4 * Math.PI * Math.PI * 4 / 2);
    init([body('plunge', 0.2, -1500), outer]);
    send('UPDATE_DESTRUCTION', { generation: 7, blastRadius_au: 0, captureRadius_au: 0.1 });
    worker.physicsTickInner();
    assert.deepEqual(events().map(m => m.event.type), ['ACCRETION']);
    assert.equal(events()[0].event.actorId, 'plunge');
    assert.ok(Math.abs(events()[0].event.positions[0].x) <= 0.1);
    for (let i = 0; i < 50; i++) worker.physicsTickInner();
    assert.equal(events().length, 1, 'black holes do not indiscriminately consume distant circular orbits');
    assert.equal(messages.at(-1).buffer.length, 7);
    assert.ok([...messages.at(-1).buffer].every(Number.isFinite));
});

test('F18: remnant planets render, stretch toward the hole, then disappear with their roster', () => {
    const star = Object.assign(new THREE.Object3D(), { mass: 21.2, currentMass: 4.24,
        phase: PHASES.REMNANT, t: 1.55, physicsId: 'test-hole' });
    const system = new PlanetarySystem(star);
    system.applyRoster([{ id: 'falling', type: 'planet' }], 1);
    system.update(0.05, 0, new Float32Array([0.2, 0, 0, -1, 0, 0, 3e-6]));
    const planets = star.children.flatMap(c => c.children).find(c => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    assert.ok(planets.parent?.visible);
    assert.equal(planets.count, 1);
    assert.ok(planets.instanceMatrix.array[0] > planets.instanceMatrix.array[5], 'radial tidal elongation');
    system.destroyBody('falling', { x: 0.09, y: 0, z: 0 }, true);
    system.applyRoster([], 2);
    system.update(0.05, 0.05, new Float32Array(0));
    assert.equal(planets.count, 0);
    assert.equal(system.orbitLinesGroup.children.length, 0);
    const debris = star.getObjectByName('PlanetDestructionDebris') as THREE.Points;
    assert.ok(debris?.visible);
    system.dispose();
    assert.equal(star.children.length, 0, 'all owned render resources detach on disposal');
});

test('F18: debris is bounded, finite, pauseable, and fades completely', () => {
    const parent = new THREE.Group();
    const effect = new DestructionEffects(parent);
    for (let i = 0; i < 40; i++) effect.burst(2, 0, 0, i % 2 === 0);
    effect.update(0.1);
    const position = effect.points.geometry.attributes.position;
    assert.equal(position.count, 2048);
    assert.ok([...position.array].every(Number.isFinite));
    const paused = Array.from(position.array);
    effect.update(0);
    assert.deepEqual(Array.from(position.array), paused);
    for (let i = 0; i < 100; i++) effect.update(0.1);
    assert.equal(effect.points.visible, false);
    assert.ok([...effect.points.geometry.attributes.color.array].every(v => v === 0));
    effect.dispose();
    assert.equal(parent.children.length, 0);
});


test('F18: background blast uses stable preset ids and keeps distant worlds intact', () => {
    const star = Object.assign(new THREE.Object3D(), { mass: 21.2, currentMass: 21.2,
        phase: PHASES.SUPERNOVA, t: 1.23, physicsId: 'background-blast' });
    const system = new PlanetarySystem(star, undefined, [0.4, 2]);
    system.update(0.1, 0, null);
    assert.equal(system.isBodyDestroyed('preset_body_0'), true);
    assert.equal(system.isBodyDestroyed('preset_body_1'), false);
    star.phase = PHASES.REMNANT;
    system.update(0.1, 0.1, null);
    assert.equal(system.isBodyDestroyed('preset_body_0'), true, 'destruction persists into remnant phase and re-key filtering');
    system.dispose();
});
