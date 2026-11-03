import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { colorTempToRGB } from '../../src/physics/math';
import {
    createStellarSurfaceUniforms, updateStellarSurfaceUniforms,
    thermalPalette, THERMAL_PALETTE_MIN_K, THERMAL_PALETTE_MAX_K, THERMAL_PALETTE_SIZE,
} from '../../src/rendering/stellarAppearance';
import { RemnantPhase } from '../../src/simulation/phases/RemnantPhase';
import { DEFAULT_CONSTANTS } from '../../src/types/physics';

const source = (path: string) => readFileSync(path, 'utf8');

test('F17: cool and hot stellar palettes follow temperature, including their limb colors', () => {
    const cool = createStellarSurfaceUniforms(3600); // Betelgeuse
    const hot = createStellarSurfaceUniforms(9940); // Sirius A
    assert.ok(cool.uColor.value.r > cool.uColor.value.b);
    assert.ok(hot.uColor.value.b > hot.uColor.value.r);
    for (const palette of [cool, hot]) {
        const { x: red, y: green, z: blue } = palette.uLimbDarkening.value;
        assert.ok(red < green && green < blue, 'limb darkens more strongly at shorter wavelengths');
        const coolRatio = palette.uCoolColor.value.b / palette.uCoolColor.value.r;
        const hotRatio = palette.uHotColor.value.b / palette.uHotColor.value.r;
        assert.ok(hotRatio > coolRatio, 'granules and lanes must be different temperatures');
    }
    assert.ok(cool.uLimbDarkening.value.z > hot.uLimbDarkening.value.z, 'hot limbs retain more blue');
});

test('F17: temperature updates reuse objects, ignore invalid input, and stay bounded', () => {
    const uniforms = createStellarSurfaceUniforms(3600);
    const colors = [uniforms.uColor.value, uniforms.uHotColor.value, uniforms.uCoolColor.value];
    const limb = uniforms.uLimbDarkening.value;
    for (const temperature of [1000, 2400, 3600, 5778, 9940, 20000, 40000, 1e9]) {
        updateStellarSurfaceUniforms(uniforms, temperature);
        assert.equal(uniforms.uColor.value, colors[0]);
        assert.equal(uniforms.uHotColor.value, colors[1]);
        assert.equal(uniforms.uCoolColor.value, colors[2]);
        assert.equal(uniforms.uLimbDarkening.value, limb);
        for (const value of [...colors.flatMap(c => c.toArray()), ...limb.toArray()]) {
            assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
        }
        assert.ok(limb.toArray().every(c => c < 1), 'no completely black limb');
    }
    const snapshot = JSON.stringify(uniforms);
    for (const invalid of [NaN, Infinity, -1, 0]) updateStellarSurfaceUniforms(uniforms, invalid);
    assert.equal(JSON.stringify(uniforms), snapshot);
    updateStellarSurfaceUniforms(uniforms, uniforms.uTemperatureK.value);
    assert.equal(JSON.stringify(uniforms), snapshot, 'unchanged temperature is idempotent');
});

test('F17: thermal palette preserves the existing linear-light blackbody colors', () => {
    assert.equal(thermalPalette.colorSpace, THREE.SRGBColorSpace);
    assert.equal(thermalPalette.minFilter, THREE.LinearFilter);
    assert.equal(thermalPalette.image.width, THERMAL_PALETTE_SIZE);
    const bytes = thermalPalette.image.data;
    assert.ok(bytes instanceof Uint8Array);
    for (const i of [0, 8, 20, THERMAL_PALETTE_SIZE - 1]) {
        const temperatureK = THREE.MathUtils.lerp(THERMAL_PALETTE_MIN_K, THERMAL_PALETTE_MAX_K, i / (THERMAL_PALETTE_SIZE - 1));
        const expected = colorTempToRGB(temperatureK);
        const decoded = new THREE.Color().setRGB(bytes[i * 4] / 255, bytes[i * 4 + 1] / 255, bytes[i * 4 + 2] / 255, THREE.SRGBColorSpace);
        for (const channel of ['r', 'g', 'b'] as const) assert.ok(Math.abs(expected[channel] - decoded[channel]) < 0.005);
        assert.equal(bytes[i * 4 + 3], 255);
    }
});

test('F17: both black-hole disk images share the temperature palette and shadow scale', () => {
    const phase = new RemnantPhase(21.2);
    const parent = new THREE.Group();
    phase.init(parent);
    phase.update(0.016, 12, new THREE.Vector3(0, 3, 8), DEFAULT_CONSTANTS, 1.55, false, 1);
    const disk = phase.blackHoleGroup.getObjectByName('bhDisk') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const wrap = phase.blackHoleGroup.getObjectByName('bhWrap') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    for (const mesh of [disk, wrap]) {
        assert.equal(mesh.material.uniforms.uThermalPalette.value, thermalPalette);
        assert.ok(mesh.material.fragmentShader.includes('pow(max(dist / uInner, 1.0), -0.75) * freqShift'));
        assert.ok(mesh.material.fragmentShader.includes('float beaming = pow(delta, 3.2)'));
        assert.ok(mesh.material.fragmentShader.includes('smoothstep(uInner, uInner + 0.05, dist)'));
    }
    assert.equal(disk.scale.x, wrap.scale.x);
    assert.equal(disk.material.blending, THREE.NormalBlending);
    phase.dispose();
    assert.equal(parent.children.length, 0);
});

test('F17: all shared-surface phases wire the temperature palette', () => {
    for (const phase of ['MainSequence', 'RedGiant', 'Protostar']) {
        const code = source(`src/simulation/phases/${phase}Phase.ts`);
        assert.ok(code.includes('...this.surfaceUniforms'));
        assert.ok(code.includes('updateStellarSurfaceUniforms(this.surfaceUniforms,'));
    }
    const shader = source('src/shaders/starSurface.frag.glsl');
    assert.ok(shader.includes('uLimbDarkening * (1.0 - mu)'));
    assert.ok(shader.includes('uHotColor * 1.65'));
});

test('F17: display grade follows output conversion and never lifts the shadow', () => {
    const pipeline = source('src/rendering/pipeline.ts');
    const output = pipeline.indexOf('this.composer.addPass(this.outputPass)');
    const grade = pipeline.indexOf('this.composer.addPass(this.gradePass)');
    assert.ok(output > pipeline.indexOf('this.composer.addPass(this.cinematicPass)'));
    assert.ok(grade > output);
    assert.ok(pipeline.includes('this.gradePass.material.toneMapped = false'));
    assert.ok(pipeline.includes('this.gradePass.dispose()'));
    const cinematic = source('src/shaders/cinematic.frag.glsl');
    assert.ok(!cinematic.includes('color += grain'));
    assert.ok(!cinematic.includes('float vignette'));
    const shader = source('src/shaders/grade.frag.glsl');
    assert.ok(shader.includes('smoothstep(0.02, 0.15,'));
    assert.ok(shader.includes('0.004 * grainMask'));
});
