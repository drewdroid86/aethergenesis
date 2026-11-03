import * as THREE from 'three';
import { colorTempToRGB } from '../physics/math';

export interface StellarSurfaceUniforms {
    uColor: { value: THREE.Color };
    uHotColor: { value: THREE.Color };
    uCoolColor: { value: THREE.Color };
    uLimbDarkening: { value: THREE.Vector3 };
    uTemperatureK: { value: number };
}

function limbCoefficient(wavelengthNm: number, temperature: number): number {
    const x = 1.4387769e7 / (wavelengthNm * temperature);
    return THREE.MathUtils.clamp(0.22 + 0.08 * x / (1 - Math.exp(-x)), 0.25, 0.9);
}

function sampleSurfaceColor(temperatureK: number, out: THREE.Color): void {
    colorTempToRGB(temperatureK, out);
    // AESTHETIC: not physics-derived, intentional warm-star contrast to counter ACES
    // desaturation. This is a display palette, not a molecular absorption calculation.
    const warmContrast = 1 - THREE.MathUtils.smoothstep(temperatureK, 3800, 6500);
    out.g *= 1 - 0.35 * warmContrast;
    out.b *= 1 - 0.55 * warmContrast;
}

export const THERMAL_PALETTE_MIN_K = 1000;
export const THERMAL_PALETTE_MAX_K = 20000;
export const THERMAL_PALETTE_SIZE = 64;

// Shared like GEOMETRIES: one immutable palette for every disk and both lensed images.
// Store display-encoded bytes; SRGBColorSpace makes texture samples linear-light RGB.
const paletteData = new Uint8Array(THERMAL_PALETTE_SIZE * 4);
const paletteColor = new THREE.Color();
for (let i = 0; i < THERMAL_PALETTE_SIZE; i++) {
    const temperatureK = THREE.MathUtils.lerp(THERMAL_PALETTE_MIN_K, THERMAL_PALETTE_MAX_K, i / (THERMAL_PALETTE_SIZE - 1));
    colorTempToRGB(temperatureK, paletteColor).convertLinearToSRGB();
    paletteData[i * 4] = Math.round(paletteColor.r * 255);
    paletteData[i * 4 + 1] = Math.round(paletteColor.g * 255);
    paletteData[i * 4 + 2] = Math.round(paletteColor.b * 255);
    paletteData[i * 4 + 3] = 255;
}
export const thermalPalette = new THREE.DataTexture(paletteData, THERMAL_PALETTE_SIZE, 1);
thermalPalette.name = 'SharedThermalPalette';
thermalPalette.colorSpace = THREE.SRGBColorSpace;
thermalPalette.minFilter = THREE.LinearFilter;
thermalPalette.magFilter = THREE.LinearFilter;
thermalPalette.needsUpdate = true;

/** Temperature palettes are sampled on the CPU, never in the fragment hot loop. */
export function createStellarSurfaceUniforms(temperatureK = 5778): StellarSurfaceUniforms {
    const uniforms = {
        uColor: { value: new THREE.Color() },
        uHotColor: { value: new THREE.Color() },
        uCoolColor: { value: new THREE.Color() },
        uLimbDarkening: { value: new THREE.Vector3() },
        uTemperatureK: { value: 0 },
    };
    updateStellarSurfaceUniforms(uniforms, temperatureK);
    return uniforms;
}

/** Mutates existing colors/vectors; stable temperatures require no extra work. */
export function updateStellarSurfaceUniforms(uniforms: StellarSurfaceUniforms, temperatureK: number): void {
    if (!Number.isFinite(temperatureK) || temperatureK <= 0) return;
    const temperature = THREE.MathUtils.clamp(temperatureK, 1000, 40000);
    if (uniforms.uTemperatureK.value === temperature) return;
    uniforms.uTemperatureK.value = temperature;
    sampleSurfaceColor(temperature, uniforms.uColor.value);
    // AESTHETIC: not physics-derived, intentional convection contrast around Teff.
    sampleSurfaceColor(temperature * 1.12, uniforms.uHotColor.value);
    sampleSurfaceColor(temperature * 0.82, uniforms.uCoolColor.value);

    // Planck logarithmic temperature sensitivity at representative R/G/B wavelengths.
    // AESTHETIC: not a fitted stellar-atmosphere model; bounded linear limb coefficients.
    uniforms.uLimbDarkening.value.set(
        limbCoefficient(650, temperature), limbCoefficient(550, temperature), limbCoefficient(450, temperature),
    );
}
