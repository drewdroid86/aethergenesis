import * as THREE from 'three';

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
