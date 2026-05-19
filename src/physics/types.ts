import * as THREE from 'three';

export interface PhysicalBody {
    physicsId: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    mass: number;
}
