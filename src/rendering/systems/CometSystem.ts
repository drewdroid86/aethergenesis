import * as THREE from 'three';
import { PHASES } from '../../core/constants';

const COMET_VS = `
attribute float cScale;
attribute vec3 cDir;
attribute float cActive;

varying vec2 vUv;
varying float vActive;

void main() {
    vUv = uv;
    vActive = cActive;
    
    // Orient the plane to face the camera, but stretch it along cDir
    vec3 vPos = position;
    
    // Very simple billboarding
    vec3 cameraRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 cameraUp = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    
    vec3 worldPos = instanceMatrix[3].xyz;
    
    // Additive tail stretch
    vec3 vertexPos = worldPos 
        + cameraRight * position.x * cScale 
        + cameraUp * position.y * cScale 
        + cDir * position.y * cScale * 5.0; // stretch along solar wind
        
    gl_Position = projectionMatrix * viewMatrix * vec4(vertexPos, 1.0);
}
`;

const COMET_FS = `
varying vec2 vUv;
varying float vActive;

void main() {
    if (vActive < 0.5) discard;
    
    // Radial gradient for coma
    float d = distance(vUv, vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, d);
    
    gl_FragColor = vec4(0.5, 0.8, 1.0, alpha * 0.6);
}
`;

export class CometSystem {
    private instancedMesh: THREE.InstancedMesh;
    private material: THREE.ShaderMaterial;
    private group: THREE.Group;
    private parent: THREE.Object3D;

    constructor(star: THREE.Object3D) {
        this.parent = star;
        this.group = new THREE.Group();
        this.parent.add(this.group);

        const maxComets = 10;
        const geometry = new THREE.PlaneGeometry(1, 1);
        
        this.material = new THREE.ShaderMaterial({
            vertexShader: COMET_VS,
            fragmentShader: COMET_FS,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.instancedMesh = new THREE.InstancedMesh(geometry, this.material, maxComets);
        
        const scales = new Float32Array(maxComets).fill(0);
        const dirs = new Float32Array(maxComets * 3).fill(0);
        const actives = new Float32Array(maxComets).fill(0);
        
        geometry.setAttribute('cScale', new THREE.InstancedBufferAttribute(scales, 1));
        geometry.setAttribute('cDir', new THREE.InstancedBufferAttribute(dirs, 3));
        geometry.setAttribute('cActive', new THREE.InstancedBufferAttribute(actives, 1));
        
        this.group.add(this.instancedMesh);
    }

    updateFromBuffer(buffer: Float32Array, delta: number): void {
        const star = this.parent as any;
        if (star.phase !== PHASES.MAIN_SEQUENCE) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;

        const numBodies = buffer.length / 7;
        const scales = this.instancedMesh.geometry.attributes.cScale.array as Float32Array;
        const dirs = this.instancedMesh.geometry.attributes.cDir.array as Float32Array;
        const actives = this.instancedMesh.geometry.attributes.cActive.array as Float32Array;
        
        let cometIdx = 0;
        const matrix = new THREE.Matrix4();
        const posV = new THREE.Vector3();
        
        for (let i = 0; i < numBodies; i++) {
            const type = buffer[i * 7 + 6];
            if (type === 1) { // Comet
                const x = buffer[i * 7 + 0];
                const y = buffer[i * 7 + 1];
                const z = buffer[i * 7 + 2];
                
                posV.set(x, y, z);
                matrix.makeTranslation(x, y, z);
                this.instancedMesh.setMatrixAt(cometIdx, matrix);
                
                const r = posV.length();
                if (r < 3.0) { // Coma active
                    actives[cometIdx] = 1.0;
                    scales[cometIdx] = 2.0;
                    
                    if (r < 2.5) { // Tail active
                        // Tail points away from star (which is at 0,0,0)
                        const dir = posV.clone().normalize();
                        dirs[cometIdx * 3 + 0] = dir.x;
                        dirs[cometIdx * 3 + 1] = dir.y;
                        dirs[cometIdx * 3 + 2] = dir.z;
                    } else {
                        dirs[cometIdx * 3 + 0] = 0;
                        dirs[cometIdx * 3 + 1] = 0;
                        dirs[cometIdx * 3 + 2] = 0;
                    }
                } else {
                    actives[cometIdx] = 0.0;
                }
                
                cometIdx++;
                if (cometIdx >= this.instancedMesh.count) break;
            }
        }
        
        this.instancedMesh.geometry.attributes.cScale.needsUpdate = true;
        this.instancedMesh.geometry.attributes.cDir.needsUpdate = true;
        this.instancedMesh.geometry.attributes.cActive.needsUpdate = true;
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    dispose(): void {
        this.instancedMesh.geometry.dispose();
        this.material.dispose();
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}
