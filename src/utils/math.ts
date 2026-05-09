import * as THREE from 'three';

let nextGaussian: number | null = null;
/**
 * Box-Muller transform for generating normally distributed random numbers.
 * Optimized with a stateful cache to halve mathematical operations.
 */
export function randomGaussian(mean = 0, stdev = 1) {
  if (nextGaussian !== null) {
    const z = nextGaussian;
    nextGaussian = null;
    return z * stdev + mean;
  }
  const u = 1 - Math.random();
  const v = Math.random();
  const r = Math.sqrt(-2.0 * Math.log(u));
  const theta = 2.0 * Math.PI * v;
  nextGaussian = r * Math.sin(theta);
  const z = r * Math.cos(theta);
  return z * stdev + mean;
}

// BOLT OPTIMIZATION: Reuse a single Color object and pre-calculated constants to eliminate 50,000 allocations per setup.
const _SHARED_COLOR = new THREE.Color();
export function getStellarColor() {
  const r = Math.random();
  if (r < 0.00003) return _SHARED_COLOR.setHex(0x9db4ff);
  if (r < 0.0013) return _SHARED_COLOR.setHex(0xa2b9ff);
  if (r < 0.0073) return _SHARED_COLOR.setHex(0xffffff);
  if (r < 0.0373) return _SHARED_COLOR.setHex(0xfff4ea);
  if (r < 0.1133) return _SHARED_COLOR.setHex(0xffd2a1);
  if (r < 0.2343) return _SHARED_COLOR.setHex(0xffa351);
  return _SHARED_COLOR.setHex(0xff4422);
}
