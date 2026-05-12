import * as THREE from 'three';

export interface PhysicsConstants {
    G: number;
    alpha: number;
    lambda: number;
    c: number;
    hbar: number;
    H0: number;
    softening: number;
}

export const DEFAULT_CONSTANTS: PhysicsConstants = {
    G: 1.0,
    alpha: 1.0,
    lambda: 1.0,
    c: 1.0,
    hbar: 1.0,
    H0: 0.01,
    softening: 0.1
};

export interface PhysicalBody extends THREE.Object3D {
    physicsId: string;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    mass: number;
}
