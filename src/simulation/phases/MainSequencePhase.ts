import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { subtleDisplacementVS, starSurfaceFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';
import { phaseCounters } from '../../utils/performance';
import { colorTempToRGB } from '../../physics/math';
import { computeLuminosity } from '../StellarPhysics';

// BOLT: Static scratchpad to eliminate per-frame allocations
const _scratchPos = new THREE.Vector3();

export class MainSequencePhase implements PhaseComponent {
    public mainSeqGroup!: THREE.Group;
    public starMat!: THREE.ShaderMaterial;
    public starMesh!: THREE.Mesh;
    public coronaMesh!: THREE.Mesh;
    public flareMesh!: THREE.InstancedMesh;
    public flareMat!: THREE.ShaderMaterial;
    public hzMesh!: THREE.Mesh;
    
    private parent!: THREE.Group;
    private mass: number;
    private baseRadius: number;

    private _haloMat?: THREE.Material;
    private _coronaMat?: THREE.ShaderMaterial;

    private initialized = false;

    constructor(mass: number, baseRadius: number) {
        this.mass = mass;
        this.baseRadius = baseRadius;
        phaseCounters.inits++;
    }

    init(parent: THREE.Group): void {
        if (this.initialized) {
            phaseCounters.blockedDoubleInits++;
            console.warn('[Diagnostics] MainSequencePhase already initialized for this star! Guarding duplicate init.');
            return;
        }
        this.initialized = true;
        this.parent = parent;
        this.mainSeqGroup = new THREE.Group();
        
        let msColor: number;
        if (this.mass < 0.08)      msColor = 0xcc44bb;  // Brown dwarf — magenta
        else if (this.mass < 0.45) msColor = 0xff3300;  // M class — deep red
        else if (this.mass < 0.75) msColor = 0xff7722;  // K class — orange
        else if (this.mass < 1.5)  msColor = 0xfff5cc;  // F class — yellow-white
        else if (this.mass < 2.1)  msColor = 0xddeeff;  // A class — white-blue
        else if (this.mass < STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) msColor = 0xaabbff; // B class — blue-white
        else                       msColor = 0x8899ff;  // O class — deep blue
        
        this.starMat = new THREE.ShaderMaterial({
            vertexShader: subtleDisplacementVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(msColor) },
                uTurbulence: { value: 1.0 },
                uOpacity: { value: 0.0 },
                uHbar: { value: 1.0 },
                uLowDetail: { value: 0.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.starMat.name = 'MainSequenceStarMaterial';
        this.starMat.customProgramCacheKey = () => 'main_sequence_star_material';
        this.starMesh = new THREE.Mesh(GEOMETRIES.mainSeq, this.starMat);
        this.starMesh.scale.setScalar(this.baseRadius); // BOLT: Set scale once

        const haloMat = new THREE.MeshBasicMaterial({ color: msColor, transparent: true, opacity: 0.1, side: THREE.BackSide, blending: THREE.AdditiveBlending });
        haloMat.name = 'MainSequenceHaloMeshMaterial';
        const haloMesh = new THREE.Mesh(GEOMETRIES.mainSeq, haloMat);
        this._haloMat = haloMat;
        haloMesh.scale.setScalar(this.baseRadius * STELLAR_CONSTANTS.VISUALS.HALO_SCALE_FACTOR);
        
        this.mainSeqGroup.add(this.starMesh);

        // Atmospheric corona glow
        const coronaMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(msColor) },
                uOpacity: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                void main() {
                    vNormal = normalize(mat3(modelMatrix) * normal);
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                void main() {
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);
                    float rim = 1.0 - max(0.0, dot(-normalize(vNormal), viewDir));
                    rim = pow(rim, 3.0);
                    gl_FragColor = vec4(uColor, rim * uOpacity * 0.6);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.BackSide
        });
        coronaMat.name = 'MainSequenceCoronaShaderMaterial';
        coronaMat.customProgramCacheKey = () => 'main_sequence_corona_material';
        this.coronaMesh = new THREE.Mesh(GEOMETRIES.corona, coronaMat);
        this.coronaMesh.scale.setScalar(this.baseRadius);
        this._coronaMat = coronaMat;
        this.mainSeqGroup.add(haloMesh);
        this.mainSeqGroup.add(this.coronaMesh);
        
        // Solar Flares
        const flareGeo = GEOMETRIES.flare;
        this.flareMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(msColor) },
                uOpacity: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    float alpha = (sin(uTime * 2.0 + vUv.x * 10.0) * 0.5 + 0.5) * uOpacity;
                    alpha *= sin(vUv.x * 3.14159);
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.flareMat.name = 'MainSequenceFlareMaterial';
        this.flareMat.customProgramCacheKey = () => 'main_sequence_flare_material';
        
        this.flareMesh = new THREE.InstancedMesh(flareGeo, this.flareMat, 4);
        for(let i=0; i<4; i++) {
            const matrix = new THREE.Matrix4();
            matrix.makeRotationFromEuler(new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            ));
            const s = 0.5 + Math.random() * 0.5;
            matrix.scale(new THREE.Vector3(s * this.baseRadius, s * this.baseRadius, s * this.baseRadius));
            this.flareMesh.setMatrixAt(i, matrix);
        }
        this.flareMesh.instanceMatrix.needsUpdate = true;
        this.mainSeqGroup.add(this.flareMesh);
        
        this.parent.add(this.mainSeqGroup);

        // Habitable Zone
        const lum = computeLuminosity(this.mass);
        const hzRadius = Math.max(STELLAR_CONSTANTS.VISUALS.HZ_RADIUS_BASE, Math.sqrt(lum) * STELLAR_CONSTANTS.VISUALS.HZ_LUM_FACTOR);
        const hzMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ff88, 
            transparent: true, 
            opacity: 0.3, 
            side: THREE.DoubleSide
        });
        hzMat.name = 'MainSequenceHabitableZoneMaterial';
        this.hzMesh = new THREE.Mesh(GEOMETRIES.habitableZone, hzMat);
        this.hzMesh.scale.setScalar(hzRadius);
        this.hzMesh.rotation.x = Math.PI / 2;
        this.hzMesh.rotation.y = Math.random() * Math.PI * 0.2;
        this.hzMesh.rotation.z = Math.random() * Math.PI * 0.2;
        this.parent.add(this.hzMesh);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, _t: number, lowDetail?: boolean, currentTemp?: number): void {
        // BOLT: Removed redundant scale assignment
        this.starMat.uniforms.uTime.value = appTime;
        this.starMat.uniforms.uHbar.value = physics.hbar || 1.0;
        this.starMat.uniforms.uLowDetail.value = (lowDetail || false) ? 1.0 : 0.0;
        this.flareMat.uniforms.uTime.value = appTime;

        // Drive dynamic blackbody star colors from Planckian locus (colorTempToRGB)
        if (currentTemp) {
            colorTempToRGB(currentTemp, this.starMat.uniforms.uColor.value);
            if (this.flareMat) {
                colorTempToRGB(currentTemp, this.flareMat.uniforms.uColor.value);
            }
            if (this._coronaMat) {
                colorTempToRGB(currentTemp, this._coronaMat.uniforms.uColor.value);
            }
            if (this._haloMat instanceof THREE.MeshBasicMaterial) {
                colorTempToRGB(currentTemp, this._haloMat.color);
            }
        }

        if (cameraPos) {
            const distSq = cameraPos.distanceToSquared(this.parent.position ?? _scratchPos);
            // BOLT: Use distanceToSquared for performance (35 * 35 = 1225)
            if (this.hzMesh) this.hzMesh.visible = this.mainSeqGroup.visible && distSq < 1225;
        }
    }

    setOpacity(opacity: number): void {
        this.starMat.uniforms.uOpacity.value = opacity;
        this.flareMat.uniforms.uOpacity.value = opacity * 0.8;
        if (this._coronaMat) {
            this._coronaMat.uniforms.uOpacity.value = opacity;
        }
        if (this._haloMat instanceof THREE.MeshBasicMaterial) {
            this._haloMat.opacity = opacity * 0.1;
        }
    }

    show(): void {
        this.mainSeqGroup.visible = true;
        this.hzMesh.visible = true;
    }

    hide(): void {
        this.mainSeqGroup.visible = false;
        this.hzMesh.visible = false;
    }

    dispose(): void {
        if (!this.initialized) return;
        phaseCounters.disposals++;
        // BOLT: Star, corona, flares, and HZ use shared GEOMETRIES, do NOT dispose
        this.starMat.dispose();
        this.flareMat.dispose();
        if (this._coronaMat) {
            this._coronaMat.dispose();
        }
        if (this._haloMat) {
            this._haloMat.dispose();
        }
        (this.hzMesh.material as THREE.Material).dispose();
        this.parent.remove(this.mainSeqGroup);
        this.parent.remove(this.hzMesh);
    }
}
