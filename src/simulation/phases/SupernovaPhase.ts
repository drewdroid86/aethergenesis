import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { GEOMETRIES } from './geometries';
import { ejectaVS, ejectaFS } from '../../rendering/shaders/stellar';
import { STELLAR_CONSTANTS } from '../../core/constants';
import { phaseCounters } from '../../utils/performance';

export class SupernovaPhase implements PhaseComponent {
    public supernovaGroup!: THREE.Group;
    public coreFlashMesh!: THREE.Mesh;
    public snRing!: THREE.Mesh;
    public ejectaMat!: THREE.ShaderMaterial;
    public ejectaMesh!: THREE.Points;
    
    private parent!: THREE.Group;
    private mass: number;
    private baseRadius: number;
    public isFlashing: boolean = false;

    private initialized = false;

    constructor(mass: number, baseRadius: number) {
        this.mass = mass;
        this.baseRadius = baseRadius;
        phaseCounters.inits++;
    }

    init(parent: THREE.Group): void {
        if (this.initialized) {
            phaseCounters.blockedDoubleInits++;
            console.warn('[Diagnostics] SupernovaPhase already initialized for this star! Guarding duplicate init.');
            return;
        }
        this.initialized = true;
        this.parent = parent;
        this.supernovaGroup = new THREE.Group();
        const coreFlashMat = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending});
        coreFlashMat.name = 'SupernovaPhaseCoreFlashMaterial';
        this.coreFlashMesh = new THREE.Mesh(
            GEOMETRIES.supernovaCore,
            coreFlashMat
        );
        this.supernovaGroup.add(this.coreFlashMesh);
        this.parent.add(this.supernovaGroup);

        const snShellMat = new THREE.ShaderMaterial({
            uniforms: {
                uExp: { value: 0 },
                uColor: { value: new THREE.Color(0xffffff) },
                uOpacity: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vLocalPos;
                varying vec3 vWorldPos;
                void main() {
                    vNormal = normalize(mat3(modelMatrix) * normal);
                    vLocalPos = position;
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uExp;
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec3 vNormal;
                varying vec3 vLocalPos;
                varying vec3 vWorldPos;

                float hash(vec3 p) {
                    p = fract(p * 0.3183099 + .1);
                    p *= 17.0;
                    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                }
                float noise(vec3 x) {
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    f = f*f*(3.0-2.0*f);
                    return mix(mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)),f.x),
                                   mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)),f.x),f.y),
                               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)),f.x),
                                   mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)),f.x),f.y),f.z);
                }
                float fbm(vec3 p) {
                    float f = 0.0;
                    f += 0.5000 * noise(p); p *= 2.02;
                    f += 0.2500 * noise(p); p *= 2.03;
                    f += 0.1250 * noise(p); p *= 2.01;
                    return f;
                }

                void main() {
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);
                    float rim = max(0.0, 1.0 - dot(viewDir, normalize(vNormal)));
                    
                    float n = fbm(vLocalPos * 4.0 - vec3(0.0, uExp * 2.0, 0.0));
                    
                    // Creates a fiery, torn shell structure
                    float shell = pow(rim, 2.0) + n * 0.5;
                    shell *= smoothstep(0.1, 0.5, n);
                    
                    vec3 col = uColor * (1.0 + shell * 2.0);
                    
                    // Fade aggressively at the end of expansion
                    float fade = 1.0 - pow(uExp, 3.0);
                    
                    gl_FragColor = vec4(col, clamp(shell * fade * uOpacity, 0.0, 1.0));
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        snShellMat.name = 'SupernovaPhaseShellMaterial';
        snShellMat.customProgramCacheKey = () => 'supernova_shell_material';
        this.snRing = new THREE.Mesh(
            GEOMETRIES.supernovaCore, // Use sphere for full volumetric shell
            snShellMat
        );
        this.parent.add(this.snRing);
        
        const ejectaGeo = new THREE.BufferGeometry();
        const ejectaPos = new Float32Array(1500 * 3);
        const ejectaVel = new Float32Array(1500 * 3);
        for(let i=0; i<1500; i++) {
            const v = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize();
            const speed = 1.0 + Math.random() * 2.0;
            ejectaVel[i*3] = v.x * speed;
            ejectaVel[i*3+1] = v.y * speed;
            ejectaVel[i*3+2] = v.z * speed;
        }
        ejectaGeo.setAttribute('position', new THREE.BufferAttribute(ejectaPos, 3));
        ejectaGeo.setAttribute('velocity', new THREE.BufferAttribute(ejectaVel, 3));
        this.ejectaMat = new THREE.ShaderMaterial({
            uniforms: { uExp: { value: 0 }, uColor: { value: new THREE.Color(0xff4411) } },
            vertexShader: ejectaVS,
            fragmentShader: ejectaFS,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.ejectaMat.name = 'SupernovaPhaseEjectaMaterial';
        this.ejectaMat.customProgramCacheKey = () => 'supernova_ejecta_material';
        this.ejectaMesh = new THREE.Points(ejectaGeo, this.ejectaMat);
        this.parent.add(this.ejectaMesh);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, _lowDetail?: boolean, globalFade: number = 1.0): void {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.SUPERNOVA_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.SUPERNOVA_DURATION;
        if (!this.ejectaMat?.uniforms?.uColor) return;
        this.isFlashing = false;
        const fade = typeof globalFade === 'number' ? globalFade : 1.0;
        
        if (this.mass >= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
            if (normT < STELLAR_CONSTANTS.VISUALS.SUPERNOVA_FLASH_DURATION) this.isFlashing = true;

            this.snRing.visible = true;
            this.snRing.scale.setScalar((1.0 + normT * STELLAR_CONSTANTS.VISUALS.SUPERNOVA_RING_SCALE_HIGH_MASS) * (physics.strongForce || 1.0));
            const shellMat = this.snRing.material as THREE.ShaderMaterial;
            shellMat.uniforms.uOpacity.value = fade;
            shellMat.uniforms.uExp.value = normT;
            shellMat.uniforms.uColor.value.setHex(normT < 0.2 ? 0xffffff : 0xff5500);
            
            this.ejectaMesh.visible = true;
            this.ejectaMat.uniforms.uExp.value = normT * (physics.strongForce || 1.0);
            this.ejectaMat.uniforms.uColor.value.setHex(normT < 0.2 ? 0xffffff : 0xff4411);

            this.coreFlashMesh.scale.setScalar(this.baseRadius * 7.0 * (1.0 - normT));
        } else {
            this.snRing.visible = true;
            this.snRing.scale.setScalar((1.0 + normT * STELLAR_CONSTANTS.VISUALS.SUPERNOVA_RING_SCALE_LOW_MASS) * (physics.strongForce || 1.0));
            const shellMat = this.snRing.material as THREE.ShaderMaterial;
            shellMat.uniforms.uOpacity.value = 0.5 * fade;
            shellMat.uniforms.uExp.value = normT;
            shellMat.uniforms.uColor.value.setHex(0x00ffaa);
            
            this.ejectaMesh.visible = true;
            this.ejectaMat.uniforms.uExp.value = normT * STELLAR_CONSTANTS.VISUALS.SUPERNOVA_EJECTA_EXP_SPEED * (physics.strongForce || 1.0);
            this.ejectaMat.uniforms.uColor.value.setHex(0x00ffaa);

            this.coreFlashMesh.scale.setScalar(this.baseRadius * (1.0 - normT * 0.8));
        }
    }

    setOpacity(opacity: number): void {
        (this.coreFlashMesh.material as THREE.MeshBasicMaterial).opacity = opacity;
    }

    show(): void {
        this.supernovaGroup.visible = true;
        this.snRing.visible = true;
        this.ejectaMesh.visible = true;
    }

    hide(): void {
        this.supernovaGroup.visible = false;
        this.snRing.visible = false;
        this.ejectaMesh.visible = false;
        this.isFlashing = false;
    }

    dispose(): void {
        phaseCounters.disposals++;
        // BOLT: flash and ring use shared GEOMETRIES, do NOT dispose
        (this.coreFlashMesh.material as THREE.Material).dispose();
        (this.snRing.material as THREE.Material).dispose();
        this.ejectaMesh.geometry.dispose(); // Unique per star
        this.ejectaMat.dispose();
        this.parent.remove(this.supernovaGroup);
        this.parent.remove(this.snRing);
        this.parent.remove(this.ejectaMesh);
    }
}
