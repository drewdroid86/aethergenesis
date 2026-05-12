import { PhysicsConstants } from '../types/physics';
import { DEFAULT_CONSTANTS } from '../types/physics'; // Import DEFAULT_CONSTANTS

export class PhysicsEngine {
    constants: PhysicsConstants = DEFAULT_CONSTANTS;

    registerBody(_body: THREE.Object3D) {
        // Implementation
    }

    step(_delta: number) {
        // Implementation
    }

    applyExpansionToBuffer(_buffer: Float32Array, _delta: number) {
        // Implementation
    }
}
