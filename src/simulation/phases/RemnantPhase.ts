import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';
import { phaseCounters } from '../../utils/performance';

// BOLT: Module-level helper to avoid closure overhead
const stepOp = (current: number, target: number, speed: number) => {
    if (current < target) return Math.min(target, current + speed);
    if (current > target) return Math.max(target, current - speed);
    return current;
};

export class RemnantPhase implements PhaseComponent {
    public neutronStarGroup!: THREE.Group;
    public nsMagneticLines!: THREE.Group;
    public pulsarGroup!: THREE.Group;
    public blackHoleGroup!: THREE.Group;
    
    private parent!: THREE.Group;
    private mass: number;
    private _opNs: number = 0;
    private _opNsLines: number = 0;
    private bhRadius = 0.5;
    private bhDiskMaterial?: THREE.ShaderMaterial;
    private bhDiskGeometry?: THREE.RingGeometry;

    private _lensMat?: THREE.ShaderMaterial;
    private _lensMesh?: THREE.Mesh;

    // BOLT: Shared materials cached to eliminate per-frame O(N) loops and lookups
    private nsMat!: THREE.MeshBasicMaterial;
    private tubeMat!: THREE.MeshBasicMaterial;
    private beamMat!: THREE.MeshBasicMaterial;

    private initialized = false;

    constructor(mass: number) {
        this.mass = mass;
        phaseCounters.inits++;
    }

    init(parent: THREE.Group): void {
        if (this.initialized) {
            phaseCounters.blockedDoubleInits++;
            console.warn('[Diagnostics] RemnantPhase already initialized for this star! Guarding duplicate init.');
            return;
        }
        this.initialized = true;
        this.parent = parent;

        // Neutron Star
        this.neutronStarGroup = new THREE.Group();
        this.nsMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0});
        this.nsMat.name = 'RemnantNeutronStarMaterial';
        this.pulsarGroup = new THREE.Group();
        this.beamMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 0.0 }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            vertexShader: `
                varying vec3 vPosition;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vPosition;
                varying vec2 vUv;
                uniform float uTime;
                uniform float uOpacity;

                void main() {
                    float yNorm = clamp(abs(vPosition.y) / 10.0, 0.0, 1.0);
                    float coneWidth = 1.0 - abs(vUv.x - 0.5) * 2.0;
                    coneWidth = pow(clamp(coneWidth, 0.0, 1.0), 1.5);
                    
                    float turbulence = sin(vPosition.y * 12.0 - uTime * 25.0) * 0.2 + 0.8;
                    float beamCore = pow(coneWidth, 2.5) * turbulence;
                    
                    vec3 coreColor = vec3(0.4, 0.9, 1.0); // Cyan-white energy core
                    vec3 outerGlow = vec3(0.0, 0.4, 1.0); // Deep electric blue rim
                    vec3 color = mix(outerGlow, coreColor, beamCore);
                    
                    float alpha = beamCore * (1.0 - smoothstep(0.7, 1.0, yNorm)) * uOpacity;
                    gl_FragColor = vec4(color * 2.0, alpha);
                }
            `
        }) as any;
        this.beamMat.name = 'RemnantPulsarBeamMaterial';
        const beam1 = new THREE.Mesh(GEOMETRIES.pulsarBeam1, this.beamMat as any);
        const beam2 = new THREE.Mesh(GEOMETRIES.pulsarBeam2, this.beamMat as any);
        this.pulsarGroup.add(beam1);
        this.pulsarGroup.add(beam2);
        this.neutronStarGroup.add(new THREE.Mesh(GEOMETRIES.neutronStar, this.nsMat));
        this.neutronStarGroup.add(this.pulsarGroup);
        
        const nsMagGroup = new THREE.Group();
        this.tubeMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending});
        this.tubeMat.name = 'RemnantMagneticTubeMaterial';
        for(const tubeGeo of GEOMETRIES.magneticTubes) {
            nsMagGroup.add(new THREE.Mesh(tubeGeo, this.tubeMat));
        }
        
        this.nsMagneticLines = nsMagGroup;
        this.neutronStarGroup.add(this.nsMagneticLines);
        this.parent.add(this.neutronStarGroup);

        // Black Hole
        this.blackHoleGroup = new THREE.Group();
        const bhCoreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        bhCoreMat.name = 'RemnantBlackHoleCoreMaterial';
        const bhCore = new THREE.Mesh(
            GEOMETRIES.blackHoleCore,
            bhCoreMat
        );
        
        // Accretion disk with custom shader material for high-quality gradient and animation
        const bhDiskGeometry = GEOMETRIES.blackHoleDisk;
        this.bhDiskMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 1.0 }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexShader: `
                varying vec3 vLocalPos;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vLocalPos = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vLocalPos;
                varying vec2 vUv;
                uniform float uTime;
                uniform float uOpacity;
                void main() {
                    float dist = length(vLocalPos.xz);
                    float r = (dist - 1.2) / (4.0 - 1.2);
                    r = clamp(r, 0.0, 1.0);
                    
                    // Doppler beaming: gas on one side of the disk (rotating towards us) is brighter
                    float angle = atan(vLocalPos.z, vLocalPos.x);
                    float doppler = 1.0 + 0.6 * cos(angle);
                    
                    // Orbiting structure: spiral waves with Keplerian-like differential rotation
                    float orbitalSpeed = 4.0 / (dist * dist + 1.0);
                    float wave = sin(angle * 6.0 - uTime * 12.0 * orbitalSpeed) * 0.5 + 0.5;
                    
                    vec3 innerColor = vec3(1.0, 0.95, 0.85); // Ultra-hot white core
                    vec3 midColor = vec3(1.0, 0.45, 0.05);   // High-heat orange
                    vec3 outerColor = vec3(0.8, 0.1, 0.0);   // Cooler red edge
                    
                    vec3 color = mix(innerColor, midColor, smoothstep(0.0, 0.4, r));
                    color = mix(color, outerColor, smoothstep(0.4, 1.0, r));
                    
                    // Accretion disk opacity: hot inner edge, fades out at the outer edge
                    float alpha = (0.2 + 0.8 * wave) * (1.0 - smoothstep(0.8, 1.0, r)) * smoothstep(0.0, 0.15, r);
                    
                    gl_FragColor = vec4(color * doppler, alpha * 0.85 * uOpacity);
                }
            `
        });
        this.bhDiskMaterial.name = 'RemnantBlackHoleDiskMaterial';
        this.bhDiskMaterial.customProgramCacheKey = () => 'remnant_bh_disk_material';
        const diskMesh = new THREE.Mesh(bhDiskGeometry, this.bhDiskMaterial);
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);

        // Gravitational lensing sphere using shared mainSeq geometry scaled
        const lensMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uStrength: { value: 0.0 },
                tBackground: { value: null },
                uOpacity: { value: 1.0 }
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
                uniform float uTime;
                uniform float uStrength;
                uniform float uOpacity;
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                void main() {
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);
                    float rim = 1.0 - max(0.0, dot(normalize(vNormal), viewDir));
                    float photonRing = pow(rim, 8.0) * uStrength;
                    float innerRing = pow(max(0.0, rim - 0.85), 3.0) * uStrength * 2.0;
                    // Photon ring color — hot plasma orange-white
                    vec3 ringColor = mix(
                        vec3(1.0, 0.5, 0.1),
                        vec3(1.0, 0.95, 0.8),
                        innerRing
                    );
                    // Shadow region — pure black event horizon
                    float shadow = 1.0 - smoothstep(0.0, 0.3, rim);
                    float alpha = (photonRing + innerRing) * (1.0 - shadow * 0.95);
                    gl_FragColor = vec4(ringColor, clamp(alpha, 0.0, 1.0) * uOpacity);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        lensMat.name = 'RemnantGravitationalLensingMaterial';
        lensMat.customProgramCacheKey = () => 'remnant_gravitational_lensing_material';
        const lensSphere = new THREE.Mesh(GEOMETRIES.mainSeq, lensMat);
        lensSphere.scale.setScalar(this.bhRadius * 3.5);
        this._lensMat = lensMat;
        this._lensMesh = lensSphere;
        this.blackHoleGroup.add(lensSphere);

        this.parent.add(this.blackHoleGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean, globalFade: number = 1.0): void {
        if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE) {
            this.blackHoleGroup.visible = globalFade > 0.01;
            if (!lowDetail) this.blackHoleGroup.rotation.y += delta;
            this.blackHoleGroup.rotation.z = Math.PI / 8;

            if (this.bhDiskMaterial) {
                this.bhDiskMaterial.uniforms.uTime.value = appTime;
                this.bhDiskMaterial.uniforms.uOpacity.value = globalFade;
            }

            if (this._lensMat) {
                this._lensMat.uniforms.uTime.value = appTime;
                this._lensMat.uniforms.uStrength.value = THREE.MathUtils.lerp(
                    this._lensMat.uniforms.uStrength.value,
                    1.0,
                    delta * 2.0
                );
                this._lensMat.uniforms.uOpacity.value = globalFade;
            }
        } else if (this.mass >= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
            if (!lowDetail) {
                this.pulsarGroup.rotation.y += delta * 5.0 * (physics.weakForce || 1.0);
                this.nsMagneticLines.rotation.y += delta * 2.0 * (physics.weakForce || 1.0);
            }
            if (this.beamMat && (this.beamMat as any).uniforms) {
                (this.beamMat as any).uniforms.uTime.value = appTime;
            }
        } else {
            this.pulsarGroup.visible = false;
            this.nsMagneticLines.visible = false;
        }
    }

    updateRemnantOpacity(delta: number, targetNs: number, globalFade: number = 1.0): void {
        const speed = delta * STELLAR_CONSTANTS.TRANSITIONS.DEFAULT_SPEED;

        const nextOpNs = stepOp(this._opNs, targetNs, speed);
        if (this._opNs !== nextOpNs) {
            this._opNs = nextOpNs;
            // BOLT: O(1) opacity update using cached material reference
            this.nsMat.opacity = this._opNs * globalFade;
        } else {
            this.nsMat.opacity = this._opNs * globalFade;
        }

        const targetLines = targetNs ? 0.3 : 0;
        const nextOpLines = stepOp(this._opNsLines, targetLines, speed);
        if (this._opNsLines !== nextOpLines) {
            this._opNsLines = nextOpLines;
            // BOLT: O(1) opacity update for all magnetic lines via shared material
            this.tubeMat.opacity = this._opNsLines * globalFade;
        } else {
            this.tubeMat.opacity = this._opNsLines * globalFade;
        }

        // Pulsar beams are either on or off for simplicity in opacity guarding
        const targetBeam = targetNs ? 0.6 : 0;
        const opacityVal = targetBeam * globalFade;
        if ((this.beamMat as any).uniforms) {
            (this.beamMat as any).uniforms.uOpacity.value = opacityVal;
        } else {
            this.beamMat.opacity = opacityVal;
        }
        
        const isVisible = (this._opNs > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD || this._opNsLines > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) && globalFade > 0.01;
        if (this.neutronStarGroup.visible !== isVisible) {
            this.neutronStarGroup.visible = isVisible;
        }
    }

    show(): void {
        // Visibility is handled by update logic and updateRemnantOpacity
    }

    hide(): void {
        this.neutronStarGroup.visible = false;
        this.blackHoleGroup.visible = false;
    }

    dispose(): void {
        phaseCounters.disposals++;
        // BOLT: Directly dispose of class material references to ensure complete GPU cleanup
        if (this.nsMat) this.nsMat.dispose();
        if (this.beamMat) this.beamMat.dispose();
        if (this.tubeMat) this.tubeMat.dispose();

        const bhChildren = this.blackHoleGroup.children;
        for (let i = 0; i < bhChildren.length; i++) {
            const c = bhChildren[i] as THREE.Mesh;
            const mat = c.material;
            if (mat instanceof THREE.Material && mat !== this.bhDiskMaterial) mat.dispose();
        }
        if (this.bhDiskMaterial) this.bhDiskMaterial.dispose();
        this.parent.remove(this.neutronStarGroup);
        this.parent.remove(this.blackHoleGroup);
    }
}
