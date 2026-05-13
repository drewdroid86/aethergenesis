import * as THREE from 'three';
import { PhysicsConstants } from '../../types/physics';

export interface PhaseComponent {
    init(parent: THREE.Group): void;
    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number): void;
    show(): void;
    hide(): void;
    dispose(): void;
}
