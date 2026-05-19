import * as THREE from 'three';

export interface PhysicalBody {
    physicsId: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    mass: number;
}

export interface PhysicsConstants {
    G: number;
    alpha: number;
    lambda: number;
    c: number;
    hbar: number;
    H0: number;
    softening: number;
    strongForce: number;
    weakForce: number;
    darkMatter: number;
    baryon: number;
}
