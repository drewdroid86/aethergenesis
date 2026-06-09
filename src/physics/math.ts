import * as THREE from 'three';

// BOLT OPTIMIZATION: Box-Muller transform generates two values at once.
let _nextGaussian: number | null = null;
export function randomGaussian(mean = 0, stdev = 1) {
  if (_nextGaussian !== null) {
    const z = _nextGaussian;
    _nextGaussian = null;
    return z * stdev + mean;
  }
  const u = 1 - Math.random();
  const v = Math.random();
  const r = Math.sqrt(-2.0 * Math.log(u));
  const angle = 2.0 * Math.PI * v;
  const z = r * Math.cos(angle);
  _nextGaussian = r * Math.sin(angle);
  return z * stdev + mean;
}

export function colorTempToRGB(kelvin: number): THREE.Color {
    const temp = kelvin / 100;
    let red, green, blue;

    if (temp <= 66) {
        red = 255;
        green = temp;
        green = 99.4708025861 * Math.log(green) - 161.1195681661;
        if (temp <= 19) blue = 0;
        else {
            blue = temp - 10;
            blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
        }
    } else {
        red = temp - 60;
        red = 329.698727446 * Math.pow(red, -0.1332047592);
        green = temp - 60;
        green = 288.1221695283 * Math.pow(green, -0.0755148492);
        blue = 255;
    }

    return new THREE.Color(
        Math.min(255, Math.max(0, red)) / 255,
        Math.min(255, Math.max(0, green)) / 255,
        Math.min(255, Math.max(0, blue)) / 255
    );
}
