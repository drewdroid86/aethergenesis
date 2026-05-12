import * as THREE from 'three';
import { PhysicsConstants } from '../../types/physics';

export interface PhaseComponent {
    init(parent: THREE.Group): void;
    update(delta: number, appTime: number, physics: PhysicsConstants, cameraPos: THREE.Vector3, t: number): void;
    show(): void;
    hide(): void;
    dispose(): void;
}
