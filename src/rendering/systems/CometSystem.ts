import * as THREE from 'three';
import { StellarState } from '../../simulation/StellarPhysics';

const COMET_VS = `
attribute float cScale;
attribute vec3 cColor;
attribute float cActive;

varying vec2 vUv;
varying float vActive;
varying vec3 vColor;

void main() {
    vUv = uv;
    vActive = cActive;
    vColor = cColor;
    
    vec3 cameraRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 cameraUp = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    
    vec3 worldPos = instanceMatrix[3].xyz;
    
    vec3 vertexPos = worldPos 
        + cameraRight * position.x * cScale 
        + cameraUp * position.y * cScale;
        
    gl_Position = projectionMatrix * viewMatrix * vec4(vertexPos, 1.0);
}
`;

const COMET_FS = `
varying vec2 vUv;
varying float vActive;
varying vec3 vColor;

void main() {
    if (vActive < 0.5) discard;
    
    float d = distance(vUv, vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, d);
    
    gl_FragColor = vec4(vColor, alpha * 0.8);
}
`;

const TAIL_VS = `
attribute float cWidth;
attribute float cLength;
attribute vec3 cDir;
attribute vec3 cColor;
attribute float cActive;

varying vec2 vUv;
varying float vActive;
varying vec3 vColor;

void main() {
    vUv = uv;
    vActive = cActive;
    vColor = cColor;
    
    vec3 cameraRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 worldPos = instanceMatrix[3].xyz;
    
    // Stretch along cDir (tail direction), and widen along cameraRight
    vec3 vertexPos = worldPos 
        + cameraRight * position.x * cWidth 
        + cDir * position.y * cLength;
        
    gl_Position = projectionMatrix * viewMatrix * vec4(vertexPos, 1.0);
}
`;

// BOLT: Static scratchpad to eliminate per-frame allocations
const _posV = new THREE.Vector3();
const _dirV = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

export class CometSystem {
    private comaMesh: THREE.InstancedMesh;
    private ionTailMesh: THREE.InstancedMesh;
    private dustTailMesh: THREE.InstancedMesh;
    
    private comaMat: THREE.ShaderMaterial;
    private tailMat: THREE.ShaderMaterial;
    private group: THREE.Group;
    private prevPositions: THREE.Vector3[];

    private _matrix = new THREE.Matrix4();
    private _posV = new THREE.Vector3();
    private _vel = new THREE.Vector3();
    private _ionDir = new THREE.Vector3();
    private _crossVec = new THREE.Vector3();
    private _dustDir = new THREE.Vector3();

    constructor(scene: THREE.Scene, camera: THREE.Camera) {
        this.group = new THREE.Group();
        scene.add(this.group);

        const numComets = 5;
        this.prevPositions = Array.from({ length: numComets }, () => new THREE.Vector3());

        // Coma Geometry
        const comaGeo = new THREE.PlaneGeometry(1, 1);
        this.comaMat = new THREE.ShaderMaterial({
            vertexShader: COMET_VS,
            fragmentShader: COMET_FS,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.comaMesh = new THREE.InstancedMesh(comaGeo, this.comaMat, numComets);
        this.comaMesh.geometry.setAttribute('cScale', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));
        this.comaMesh.geometry.setAttribute('cColor', new THREE.InstancedBufferAttribute(new Float32Array(numComets * 3), 3));
        this.comaMesh.geometry.setAttribute('cActive', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));

        // Tail Geometry (starts at 0, extends to y=1)
        const tailGeo = new THREE.PlaneGeometry(1, 1);
        tailGeo.translate(0, 0.5, 0);
        
        this.tailMat = new THREE.ShaderMaterial({
            vertexShader: TAIL_VS,
            fragmentShader: TAIL_FS,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            uniforms: { uTime: { value: 0 } }
        });
        
        this.ionTailMesh = new THREE.InstancedMesh(tailGeo, this.tailMat, numComets);
        this.dustTailMesh = new THREE.InstancedMesh(tailGeo, this.tailMat, numComets);
        
        [this.ionTailMesh, this.dustTailMesh].forEach(mesh => {
            mesh.geometry.setAttribute('cWidth', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));
            mesh.geometry.setAttribute('cLength', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));
            mesh.geometry.setAttribute('cDir', new THREE.InstancedBufferAttribute(new Float32Array(numComets * 3), 3));
            mesh.geometry.setAttribute('cColor', new THREE.InstancedBufferAttribute(new Float32Array(numComets * 3), 3));
            mesh.geometry.setAttribute('cActive', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));
            mesh.frustumCulled = false;
        });
        this.comaMesh.frustumCulled = false;

        this.group.add(this.comaMesh);
        this.group.add(this.ionTailMesh);
        this.group.add(this.dustTailMesh);
    }

    updateFromBuffer(buffer: Float32Array, _delta: number): void {
        const star = this.parent as any;
        if (star.phase !== PHASES.MAIN_SEQUENCE) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;

        const comaScales = this.comaMesh.geometry.attributes.cScale.array as Float32Array;
        const comaColors = this.comaMesh.geometry.attributes.cColor.array as Float32Array;
        const comaActives = this.comaMesh.geometry.attributes.cActive.array as Float32Array;
        
        let cometIdx = 0;
        const maxCount = this.instancedMesh.instanceMatrix.count;
        
        for (let i = 0; i < 5; i++) {
            const data = cometsData[i];
            
            // Use smooth appTime for visual orbiting instead of age_yr which jumps by millions in cosmic scale
            const visualYear = appTime * 100.0; 
            const M = (visualYear / data.p) * 2 * Math.PI;
            let E = M % (2 * Math.PI); // ensure E is within a reasonable range
            for (let j = 0; j < 5; j++) {
                E = E - (E - data.e * Math.sin(E) - M) / (1 - data.e * Math.cos(E));
            }
            const theta = 2 * Math.atan2(Math.sqrt(1 + data.e) * Math.sin(E / 2), Math.sqrt(1 - data.e) * Math.cos(E / 2));
            const r = data.a * (1 - data.e * data.e) / (1 + data.e * Math.cos(theta));
            
            let x = r * Math.cos(theta);
            let z = r * Math.sin(theta);
            let y = 0;
            
            const incRad = data.i * Math.PI / 180;
            y = z * Math.sin(incRad);
            z = z * Math.cos(incRad);
            
            this._posV.set(x, y, z);
            this._matrix.makeTranslation(this._posV.x, this._posV.y, this._posV.z);
            
            this.comaMesh.setMatrixAt(i, this._matrix);
            this.ionTailMesh.setMatrixAt(i, this._matrix);
            this.dustTailMesh.setMatrixAt(i, this._matrix);
            
            const dist = this._posV.length();
            if (dist < 3.0) {
                comaActives[i] = 1.0;
                ionActives[i] = 1.0;
                dustActives[i] = 1.0;
                
                _posV.set(x, y, z);
                _matrix.makeTranslation(x, y, z);
                this.instancedMesh.setMatrixAt(cometIdx, _matrix);
                
                const r = _posV.length();
                if (r < 3.0) { // Coma active
                    actives[cometIdx] = 1.0;
                    scales[cometIdx] = 2.0;
                    
                    if (r < 2.5) { // Tail active
                        // Tail points away from star (which is at 0,0,0)
                        _dirV.copy(_posV).normalize();
                        dirs[cometIdx * 3 + 0] = _dirV.x;
                        dirs[cometIdx * 3 + 1] = _dirV.y;
                        dirs[cometIdx * 3 + 2] = _dirV.z;
                    } else {
                        dirs[cometIdx * 3 + 0] = 0;
                        dirs[cometIdx * 3 + 1] = 0;
                        dirs[cometIdx * 3 + 2] = 0;
                    }
                } else {
                    actives[cometIdx] = 0.0;
                }
                
                cometIdx++;
                if (cometIdx >= maxCount) break;
            }
        }
        
        // BOLT: Only update attributes if we have active comets or count changed
        if (cometIdx > 0 || this.instancedMesh.count > 0) {
            this.instancedMesh.geometry.attributes.cScale.needsUpdate = true;
            this.instancedMesh.geometry.attributes.cDir.needsUpdate = true;
            this.instancedMesh.geometry.attributes.cActive.needsUpdate = true;
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
        this.instancedMesh.count = cometIdx;
    }

    dispose(): void {
        this.comaMesh.geometry.dispose();
        this.ionTailMesh.geometry.dispose();
        this.dustTailMesh.geometry.dispose();
        this.comaMat.dispose();
        this.tailMat.dispose();
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}
