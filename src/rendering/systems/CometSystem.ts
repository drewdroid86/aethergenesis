import * as THREE from 'three';
import { StellarState } from '../../simulation/StellarPhysics';
import { solveKepler } from '../../simulation/OrbitalMechanics';

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
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
varying float vActive;
varying vec3 vColor;

void main() {
    if (vActive < 0.5) discard;
    
    float d = distance(vUv, vec2(0.5));
    float alpha = 1.0 - smoothstep(0.0, 0.5, d);
    
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
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
varying float vActive;
varying vec3 vColor;
void main() {
if (vActive < 0.5) discard;
float lengthFade = 1.0 - smoothstep(0.0, 1.0, vUv.y);
float widthFade = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5));
float alpha = lengthFade * widthFade;
gl_FragColor = vec4(vColor, alpha * 0.5);
}
`;

const DEBRIS_VS = `
attribute float dScale;
attribute vec3 dColor;
attribute float dActive;

varying vec2 vUv;
varying float vActive;
varying vec3 vColor;

void main() {
    vUv = uv;
    vActive = dActive;
    vColor = dColor;
    
    vec3 cameraRight = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 cameraUp = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    
    vec3 worldPos = instanceMatrix[3].xyz;
    
    vec3 vertexPos = worldPos 
        + cameraRight * position.x * dScale 
        + cameraUp * position.y * dScale;
        
    gl_Position = projectionMatrix * viewMatrix * vec4(vertexPos, 1.0);
}
`;

const DEBRIS_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
varying float vActive;
varying vec3 vColor;

void main() {
    if (vActive < 0.5) discard;
    
    float d = distance(vUv, vec2(0.5));
    float alpha = (1.0 - smoothstep(0.0, 0.5, d)) * (1.0 - smoothstep(0.1, 0.5, d));
    
    gl_FragColor = vec4(vColor * 1.5, alpha * 0.9);
}
`;

const COMETS_DATA = [
{ a: 8.0,  e: 0.967, i: 162.2, p: 75.3  },
{ a: 2.2,  e: 0.847, i: 11.8,  p: 5.5   },
{ a: 5.5,  e: 0.630, i: 7.1,   p: 14.7  },
{ a: 7.0,  e: 0.920, i: 38.7,  p: 38.5  },
{ a: 12.0, e: 0.995, i: 89.4,  p: 118.4 },
] as const;

// BOLT: Pre-calculated orbital constants to save per-frame Math ops
interface PrecalcComet {
    a: number; e: number; i: number; p: number;
    sqrt1pe: number; sqrt1me: number; pSemiLatus: number;
    incRad: number; twoPiOverP: number;
}

export class CometSystem {
    private comaMesh: THREE.InstancedMesh;
    private ionTailMesh: THREE.InstancedMesh;
    private dustTailMesh: THREE.InstancedMesh;
    private tidalDebrisMesh: THREE.InstancedMesh;
    
    private comaMat: THREE.ShaderMaterial;
    private tailMat: THREE.ShaderMaterial;
    private debrisMat: THREE.ShaderMaterial;
    private group: THREE.Group;
    private prevPositions: THREE.Vector3[];
    private precalcData: PrecalcComet[] = [];

    private _matrix = new THREE.Matrix4();
    private _posV = new THREE.Vector3();
    private _vel = new THREE.Vector3();
    private _ionDir = new THREE.Vector3();
    private _crossVec = new THREE.Vector3();
    private _dustDir = new THREE.Vector3();

    constructor(scene: THREE.Scene, _camera: THREE.Camera) {
        this.group = new THREE.Group();
        scene.add(this.group);

        const numComets = 5;
        this.prevPositions = Array.from({ length: numComets }, () => new THREE.Vector3());

        // BOLT: Initialize pre-calculated constants
        for (let i = 0; i < numComets; i++) {
            const d = COMETS_DATA[i];
            this.precalcData.push({
                ...d,
                sqrt1pe: Math.sqrt(1 + d.e),
                sqrt1me: Math.sqrt(1 - d.e),
                pSemiLatus: d.a * (1 - d.e * d.e),
                incRad: d.i * Math.PI / 180,
                twoPiOverP: (2 * Math.PI) / d.p
            });
        }

        // Coma Geometry
        const comaGeo = new THREE.PlaneGeometry(1, 1);
        this.comaMat = new THREE.ShaderMaterial({
            vertexShader: COMET_VS,
            fragmentShader: COMET_FS,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.comaMat.name = 'CometComaMaterial';
        this.comaMat.customProgramCacheKey = () => 'comet_coma_material';
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
        this.tailMat.name = 'CometTailMaterial';
        this.tailMat.customProgramCacheKey = () => 'comet_tail_material';
        
        this.ionTailMesh = new THREE.InstancedMesh(tailGeo, this.tailMat, numComets);
        this.dustTailMesh = new THREE.InstancedMesh(tailGeo.clone(), this.tailMat, numComets);
        
        [this.ionTailMesh, this.dustTailMesh].forEach(mesh => {
            mesh.geometry.setAttribute('cWidth', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));
            mesh.geometry.setAttribute('cLength', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));
            mesh.geometry.setAttribute('cDir', new THREE.InstancedBufferAttribute(new Float32Array(numComets * 3), 3));
            mesh.geometry.setAttribute('cColor', new THREE.InstancedBufferAttribute(new Float32Array(numComets * 3), 3));
            mesh.geometry.setAttribute('cActive', new THREE.InstancedBufferAttribute(new Float32Array(numComets), 1));
            mesh.frustumCulled = false;
        });
        this.comaMesh.frustumCulled = false;

        // Tidal Debris Stream Geometry (6 sub-fragment nuclei per comet)
        const totalFragments = numComets * 6;
        const debrisGeo = new THREE.PlaneGeometry(1, 1);
        this.debrisMat = new THREE.ShaderMaterial({
            vertexShader: DEBRIS_VS,
            fragmentShader: DEBRIS_FS,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.debrisMat.name = 'CometDebrisMaterial';
        this.debrisMat.customProgramCacheKey = () => 'comet_debris_material';
        this.tidalDebrisMesh = new THREE.InstancedMesh(debrisGeo, this.debrisMat, totalFragments);
        this.tidalDebrisMesh.geometry.setAttribute('dScale', new THREE.InstancedBufferAttribute(new Float32Array(totalFragments), 1));
        this.tidalDebrisMesh.geometry.setAttribute('dColor', new THREE.InstancedBufferAttribute(new Float32Array(totalFragments * 3), 3));
        this.tidalDebrisMesh.geometry.setAttribute('dActive', new THREE.InstancedBufferAttribute(new Float32Array(totalFragments), 1));
        this.tidalDebrisMesh.frustumCulled = false;

        this.group.add(this.comaMesh);
        this.group.add(this.ionTailMesh);
        this.group.add(this.dustTailMesh);
        this.group.add(this.tidalDebrisMesh);
    }

    update(delta: number, stellarState: StellarState, appTime: number, starPosition?: THREE.Vector3): void {
        if (stellarState.phase !== 'main_sequence') {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;
        if (starPosition) {
            this.group.position.copy(starPosition);
        }
        const comaScales   = this.comaMesh.geometry.attributes.cScale.array  as Float32Array;
        const comaColors   = this.comaMesh.geometry.attributes.cColor.array  as Float32Array;
        const comaActives  = this.comaMesh.geometry.attributes.cActive.array as Float32Array;
        const ionDirs      = this.ionTailMesh.geometry.attributes.cDir.array    as Float32Array;
        const ionWidths    = this.ionTailMesh.geometry.attributes.cWidth.array  as Float32Array;
        const ionLengths   = this.ionTailMesh.geometry.attributes.cLength.array as Float32Array;
        const ionActives   = this.ionTailMesh.geometry.attributes.cActive.array as Float32Array;
        const ionColors    = this.ionTailMesh.geometry.attributes.cColor.array as Float32Array;
        const dustDirs     = this.dustTailMesh.geometry.attributes.cDir.array    as Float32Array;
        const dustWidths   = this.dustTailMesh.geometry.attributes.cWidth.array  as Float32Array;
        const dustLengths  = this.dustTailMesh.geometry.attributes.cLength.array as Float32Array;
        const dustActives  = this.dustTailMesh.geometry.attributes.cActive.array as Float32Array;
        const dustColors   = this.dustTailMesh.geometry.attributes.cColor.array as Float32Array;

        const debrisScales   = this.tidalDebrisMesh.geometry.attributes.dScale.array  as Float32Array;
        const debrisColors   = this.tidalDebrisMesh.geometry.attributes.dColor.array  as Float32Array;
        const debrisActives  = this.tidalDebrisMesh.geometry.attributes.dActive.array as Float32Array;

        for (let i = 0; i < 5; i++) {
            const data = this.precalcData[i];
            // Kepler's equation — solved via standard OrbitalMechanics Kepler solver
            const visualYear = appTime * 100.0;
            const massFactor = Math.sqrt(Math.max(0.01, stellarState.mass_solar || 1.0));
            const M = (visualYear * data.twoPiOverP * massFactor) % (2 * Math.PI);
            const E = solveKepler(M, data.e);
            const theta = 2 * Math.atan2(
                data.sqrt1pe * Math.sin(E / 2),
                data.sqrt1me * Math.cos(E / 2)
            );
            const r = data.pSemiLatus / (1 + data.e * Math.cos(theta));
            const x = r * Math.cos(theta);
            let z = r * Math.sin(theta);
            const y = z * Math.sin(data.incRad);
            z   = z * Math.cos(data.incRad);

            this._posV.set(x, y, z);
            this._matrix.makeTranslation(x, y, z); // Reuse matrix for all 3 meshes
            this.comaMesh.setMatrixAt(i, this._matrix);
            this.ionTailMesh.setMatrixAt(i, this._matrix);
            this.dustTailMesh.setMatrixAt(i, this._matrix);

            // Coma color: blue-white
            comaColors[i * 3 + 0] = 0.8;
            comaColors[i * 3 + 1] = 0.9;
            comaColors[i * 3 + 2] = 1.0;

            const dist = this._posV.length();

            // Calculate velocity direction for dust tail (update prevPosition every frame to avoid staleness)
            const prev = this.prevPositions[i];
            if (prev.lengthSq() > 0) {
                this._vel.set(x - prev.x, y - prev.y, z - prev.z).normalize();
            } else {
                this._vel.set(0, 0, 0);
            }
            prev.set(x, y, z);

            // Stellar Roche limit for volatile small bodies: d_roche ~ 0.85 AU * (M_star)^(1/3)
            const rocheLimitAU = 0.85 * Math.cbrt(Math.max(0.1, stellarState.mass_solar || 1.0));
            const isTidallyDisrupted = dist < rocheLimitAU;
            const tidalShear = isTidallyDisrupted ? Math.min(1.0, (rocheLimitAU - dist) / (rocheLimitAU * 0.7)) : 0.0;

            // Update tidal debris fragment train (Shoemaker-Levy 9 string-of-pearls effect)
            for (let k = 0; k < 6; k++) {
                const fragIdx = i * 6 + k;
                if (isTidallyDisrupted && dist < 3.0) {
                    const longitudinalSpread = (k - 2.5) * 0.04 * (1.0 + tidalShear * 2.5);
                    const fx = x + this._vel.x * longitudinalSpread;
                    const fy = y + this._vel.y * longitudinalSpread;
                    const fz = z + this._vel.z * longitudinalSpread;

                    this._matrix.makeTranslation(fx, fy, fz);
                    this.tidalDebrisMesh.setMatrixAt(fragIdx, this._matrix);

                    debrisActives[fragIdx] = 1.0;
                    debrisScales[fragIdx] = Math.max(0.18, (0.45 - Math.abs(k - 2.5) * 0.05) * (0.6 + tidalShear * 0.8));
                    // Volatile ionization flare: intense cyan/gold ion emission
                    debrisColors[fragIdx * 3 + 0] = 0.6 + 0.4 * Math.sin(k * 1.5 + appTime * 5.0);
                    debrisColors[fragIdx * 3 + 1] = 0.85 + 0.15 * Math.cos(k * 1.2);
                    debrisColors[fragIdx * 3 + 2] = 1.0;
                } else {
                    debrisActives[fragIdx] = 0.0;
                    debrisScales[fragIdx] = 0.0;
                }
            }

            if (dist < 3.0) {
                comaActives[i] = 1.0;
                comaScales[i]  = Math.max(0.5, (3.0 - dist) * 0.8);
                ionActives[i]  = 1.0;
                dustActives[i] = 1.0;

                if (dist < 2.5) {
                    // Ion tail: blue plasma pointing away from star
                    this._ionDir.copy(this._posV).normalize();
                    ionDirs[i * 3]     = this._ionDir.x;
                    ionDirs[i * 3 + 1] = this._ionDir.y;
                    ionDirs[i * 3 + 2] = this._ionDir.z;
                    ionWidths[i]  = 0.05;
                    ionLengths[i] = (2.5 - dist) * 0.8;
                    ionColors[i * 3 + 0] = 0.2;
                    ionColors[i * 3 + 1] = 0.5;
                    ionColors[i * 3 + 2] = 1.0;

                    // Dust tail: slightly offset direction, broader
                    this._dustDir.copy(this._ionDir).addScaledVector(this._vel, -0.5).normalize();
                    dustDirs[i * 3]     = this._dustDir.x;
                    dustDirs[i * 3 + 1] = this._dustDir.y;
                    dustDirs[i * 3 + 2] = this._dustDir.z;
                    dustWidths[i]  = 0.08;
                    dustLengths[i] = (2.5 - dist) * 0.5;
                    dustColors[i * 3 + 0] = 1.0;
                    dustColors[i * 3 + 1] = 0.9;
                    dustColors[i * 3 + 2] = 0.6;
                } else {
                    ionWidths[i]  = 0;  dustWidths[i]  = 0;
                    ionLengths[i] = 0;  dustLengths[i] = 0;
                    ionDirs[i*3] = ionDirs[i*3+1] = ionDirs[i*3+2] = 0;
                    dustDirs[i*3] = dustDirs[i*3+1] = dustDirs[i*3+2] = 0;
                }
            } else {
                comaActives[i] = 0.0;
                comaScales[i]  = 0.0;
                ionActives[i]  = 0.0;
                dustActives[i] = 0.0;
            }
        }

        this.comaMesh.instanceMatrix.needsUpdate       = true;
        this.ionTailMesh.instanceMatrix.needsUpdate    = true;
        this.dustTailMesh.instanceMatrix.needsUpdate   = true;
        this.tidalDebrisMesh.instanceMatrix.needsUpdate = true;

        this.comaMesh.geometry.attributes.cScale.needsUpdate  = true;
        this.comaMesh.geometry.attributes.cColor.needsUpdate  = true;
        this.comaMesh.geometry.attributes.cActive.needsUpdate = true;

        this.ionTailMesh.geometry.attributes.cDir.needsUpdate    = true;
        this.ionTailMesh.geometry.attributes.cWidth.needsUpdate  = true;
        this.ionTailMesh.geometry.attributes.cLength.needsUpdate = true;
        this.ionTailMesh.geometry.attributes.cActive.needsUpdate = true;
        this.ionTailMesh.geometry.attributes.cColor.needsUpdate  = true;

        this.dustTailMesh.geometry.attributes.cDir.needsUpdate    = true;
        this.dustTailMesh.geometry.attributes.cWidth.needsUpdate  = true;
        this.dustTailMesh.geometry.attributes.cLength.needsUpdate = true;
        this.dustTailMesh.geometry.attributes.cActive.needsUpdate = true;
        this.dustTailMesh.geometry.attributes.cColor.needsUpdate  = true;

        this.tidalDebrisMesh.geometry.attributes.dScale.needsUpdate  = true;
        this.tidalDebrisMesh.geometry.attributes.dColor.needsUpdate  = true;
        this.tidalDebrisMesh.geometry.attributes.dActive.needsUpdate = true;

        this.comaMesh.count        = 5;
        this.ionTailMesh.count     = 5;
        this.dustTailMesh.count    = 5;
        this.tidalDebrisMesh.count = 30;
    }

    dispose(): void {
        this.comaMesh.geometry.dispose();
        this.ionTailMesh.geometry.dispose();
        this.dustTailMesh.geometry.dispose();
        this.tidalDebrisMesh.geometry.dispose();
        this.comaMat.dispose();
        this.tailMat.dispose();
        this.debrisMat.dispose();
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}
