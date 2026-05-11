import * as THREE from 'three';

export interface PhysicsConstants {
    G: number;            // Gravitational Constant
    c: number;            // Speed of Light
    H0: number;           // Hubble Constant (Expansion rate)
    lambda: number;       // Cosmological Constant (Dark Energy)
    softening: number;    // Gravitational softening epsilon
}

export interface PhysicalBody {
    physicsId: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    mass: number;
}

export const DEFAULT_CONSTANTS: PhysicsConstants = {
    G: 1.0,               // Normalized G
    c: 300.0,             // Normalized speed of light
    H0: 0.01,             // Hubble constant
    lambda: 0.0001,       // Dark energy effect
    softening: 0.5        // Prevents singularities
};
