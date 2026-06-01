import * as THREE from 'three';

export function getStellarColor(index: number): THREE.Color {
  const roll = Math.random();
  // Realistic stellar distribution by spectral class
  if (roll < 0.0003) return new THREE.Color(0.6, 0.7, 1.0); // O — blue-white
  if (roll < 0.003) return new THREE.Color(0.7, 0.8, 1.0); // B — blue
  if (roll < 0.006) return new THREE.Color(0.9, 0.95, 1.0); // A — white
  if (roll < 0.03) return new THREE.Color(1.0, 0.97, 0.85); // F — yellow-white
  if (roll < 0.12) return new THREE.Color(1.0, 0.9, 0.6); // G — yellow (Sun-like)
  if (roll < 0.24) return new THREE.Color(1.0, 0.7, 0.3); // K — orange
  return new THREE.Color(1.0, 0.35, 0.15); // M — red dwarf (majority)
}
