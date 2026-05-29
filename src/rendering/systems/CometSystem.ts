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

const TAIL_FS = `
varying vec2 vUv;
varying float vActive;
varying vec3 vColor;

void main() {
    if (vActive < 0.5) discard;
    
    // Fade out along length (y axis) and edges (x axis)
    // vUv.y goes from 0 to 1 along the tail
    // vUv.x goes from 0 to 1 across the tail width
    
    float edgeFade = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
    float lenFade = smoothstep(1.0, 0.0, vUv.y);
    
    float alpha = edgeFade * lenFade;
    
    gl_FragColor = vec4(vColor, alpha * 0.6);
}
`;

// Real orbital parameters from NASA Horizons
const cometsData = [
  { name: 'Halley', a: 17.8, e: 0.967, i: 162.3, p: 75.3 },
  { name: 'Hale-Bopp', a: 186.0, e: 0.995, i: 89.4, p: 2520.0 },
  { name: 'Churyumov', a: 3.46, e: 0.641, i: 7.04, p: 6.44 },
  { name: 'Encke', a: 2.22, e: 0.848, i: 11.8, p: 3.30 },
  { name: 'Swift-Tuttle', a: 26.0, e: 0.963, i: 113.4, p: 130.0 }
];

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

    update(deltaTime_yr: number, stellarState: StellarState, appTime: number): void {
        if (stellarState.phase !== 'main_sequence') {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;

        const comaScales = this.comaMesh.geometry.attributes.cScale.array as Float32Array;
        const comaColors = this.comaMesh.geometry.attributes.cColor.array as Float32Array;
        const comaActives = this.comaMesh.geometry.attributes.cActive.array as Float32Array;
        
        const ionWidths = this.ionTailMesh.geometry.attributes.cWidth.array as Float32Array;
        const ionLengths = this.ionTailMesh.geometry.attributes.cLength.array as Float32Array;
        const ionDirs = this.ionTailMesh.geometry.attributes.cDir.array as Float32Array;
        const ionColors = this.ionTailMesh.geometry.attributes.cColor.array as Float32Array;
        const ionActives = this.ionTailMesh.geometry.attributes.cActive.array as Float32Array;

        const dustWidths = this.dustTailMesh.geometry.attributes.cWidth.array as Float32Array;
        const dustLengths = this.dustTailMesh.geometry.attributes.cLength.array as Float32Array;
        const dustDirs = this.dustTailMesh.geometry.attributes.cDir.array as Float32Array;
        const dustColors = this.dustTailMesh.geometry.attributes.cColor.array as Float32Array;
        const dustActives = this.dustTailMesh.geometry.attributes.cActive.array as Float32Array;
        
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
                
                const baseScale = 50.0;
                
                comaScales[i] = (1.0 / Math.max(0.5, dist)) * baseScale;
                comaColors[i * 3 + 0] = 0.9;
                comaColors[i * 3 + 1] = 0.95;
                comaColors[i * 3 + 2] = 1.0;
                
                this._vel.copy(this._posV).sub(this.prevPositions[i]).normalize();
                this.prevPositions[i].copy(this._posV);
                
                const windIntensity = 1.0 / (dist * dist);
                
                this._ionDir.copy(this._posV).normalize();
                ionDirs[i * 3 + 0] = this._ionDir.x;
                ionDirs[i * 3 + 1] = this._ionDir.y;
                ionDirs[i * 3 + 2] = this._ionDir.z;
                ionWidths[i] = comaScales[i] * 0.8;
                ionLengths[i] = windIntensity * baseScale * 4.0;
                ionColors[i * 3 + 0] = 0.7;
                ionColors[i * 3 + 1] = 0.8;
                ionColors[i * 3 + 2] = 1.0;
                
                this._crossVec.copy(this._ionDir).cross(this._vel).normalize();
                this._dustDir.copy(this._ionDir).applyAxisAngle(this._crossVec, 15 * Math.PI / 180).normalize();
                dustDirs[i * 3 + 0] = this._dustDir.x;
                dustDirs[i * 3 + 1] = this._dustDir.y;
                dustDirs[i * 3 + 2] = this._dustDir.z;
                dustWidths[i] = comaScales[i];
                dustLengths[i] = windIntensity * baseScale * 3.0;
                dustColors[i * 3 + 0] = 1.0;
                dustColors[i * 3 + 1] = 0.95;
                dustColors[i * 3 + 2] = 0.8;
                
            } else {
                comaActives[i] = 0.0;
                ionActives[i] = 0.0;
                dustActives[i] = 0.0;
                this.prevPositions[i].copy(this._posV);
            }
        }
        
        [this.comaMesh, this.ionTailMesh, this.dustTailMesh].forEach(mesh => {
            Object.values(mesh.geometry.attributes).forEach(attr => attr.needsUpdate = true);
            mesh.instanceMatrix.needsUpdate = true;
        });

        const appTime = stellarState.age_yr * 1e-6;
        const throttledTime = Math.floor(appTime * 15.0) / 15.0;
        this.tailMat.uniforms.uTime.value = throttledTime;
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
