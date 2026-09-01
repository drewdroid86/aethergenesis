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
    private bhArchMaterial?: THREE.ShaderMaterial;
    private bhArchMesh?: THREE.Mesh;

    private _lensMat?: THREE.ShaderMaterial;
    private _lensMesh?: THREE.Mesh;

    // BOLT: Shared materials cached to eliminate per-frame O(N) loops and lookups
    private nsMat!: THREE.MeshBasicMaterial;
    private tubeMat!: THREE.MeshBasicMaterial;
    private beamMat!: THREE.ShaderMaterial;

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
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
                #else
                precision mediump float;
                #endif

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
        });
        this.beamMat.name = 'RemnantPulsarBeamMaterial';
        this.beamMat.customProgramCacheKey = () => 'remnant_pulsar_beam_material';
        const beam1 = new THREE.Mesh(GEOMETRIES.pulsarBeam1, this.beamMat);
        const beam2 = new THREE.Mesh(GEOMETRIES.pulsarBeam2, this.beamMat);
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
        // Accretion disk with relativistic Doppler beaming, gravitational redshift & differential Keplerian velocity
        const bhDiskGeometry = GEOMETRIES.blackHoleDisk;
        this.bhDiskMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 1.0 },
                uCameraPos: { value: new THREE.Vector3(0, 0, 10) }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexShader: `
                varying vec3 vLocalPos;
                varying vec3 vWorldPos;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vLocalPos = position;
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPos = worldPos.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
                #else
                precision mediump float;
                #endif

                varying vec3 vLocalPos;
                varying vec3 vWorldPos;
                varying vec2 vUv;
                uniform float uTime;
                uniform float uOpacity;
                uniform vec3 uCameraPos;

                void main() {
                    float dist = length(vLocalPos.xz);
                    // r is normalized from ISCO (1.2) to outer edge (4.0)
                    float r = clamp((dist - 1.2) / (4.0 - 1.2), 0.0, 1.0);
                    
                    // Azimuthal coordinate in disk plane
                    float angle = atan(vLocalPos.z, vLocalPos.x);
                    
                    // Relativistic velocity beta = v/c: ~0.55c at ISCO decaying to ~0.15c at outer edge
                    float beta = clamp(0.60 / sqrt(dist * 0.8 + 0.4), 0.0, 0.70);
                    
                    // Tangential orbital velocity vector in local disk plane
                    vec3 tangentDir = normalize(vec3(-sin(angle), 0.0, cos(angle)));
                    vec3 viewDir = normalize(uCameraPos - vWorldPos);
                    
                    // Line-of-sight velocity component (beta_parallel)
                    float beta_los = beta * dot(tangentDir, viewDir);
                    
                    // Relativistic Lorentz factor: gamma = 1 / sqrt(1 - beta^2)
                    float gamma = 1.0 / sqrt(max(0.01, 1.0 - beta * beta));
                    
                    // Relativistic Doppler factor: delta = 1 / (gamma * (1 - beta_los))
                    float delta = 1.0 / max(0.1, gamma * (1.0 - beta_los));
                    
                    // Relativistic Doppler flux beaming: I_obs = I_0 * delta^(3 + alpha) where alpha ~ 1
                    float beaming = pow(delta, 3.2);
                    
                    // Gravitational redshift factor: g = sqrt(1 - r_s / r) where r_s ~ 0.5
                    float g_grav = sqrt(max(0.04, 1.0 - 0.5 / max(0.55, dist)));
                    
                    // Combined spectral frequency shift ratio
                    float freqShift = g_grav * delta;
                    
                    // Differential Keplerian rotation: Omega(r) ~ r^(-1.5) for swirling magnetohydrodynamic gas
                    float orbitalFreq = 4.5 / pow(dist + 0.2, 1.5);
                    float turbulence = sin(angle * 7.0 - uTime * 8.0 * orbitalFreq + sin(dist * 5.0)) * 0.5 + 0.5;
                    float fineStreams = sin(angle * 14.0 - uTime * 15.0 * orbitalFreq + cos(angle * 3.0)) * 0.35 + 0.65;
                    float gasDensity = (0.35 + 0.65 * turbulence * fineStreams);
                    
                    // Base multi-temperature blackbody color gradient
                    vec3 coreColor = vec3(1.0, 0.98, 0.92); // Ultra-hot white inner edge
                    vec3 midColor  = vec3(1.0, 0.48, 0.06); // High-temperature orange
                    vec3 outerColor = vec3(0.70, 0.10, 0.01); // Cooler crimson outer rim
                    vec3 baseColor = mix(coreColor, midColor, smoothstep(0.0, 0.35, r));
                    baseColor = mix(baseColor, outerColor, smoothstep(0.35, 1.0, r));
                    
                    // Relativistic spectral color shifting:
                    // Blueshift (approaching side): shifts toward radiant electric cyan / UV-white
                    // Redshift (receding side & gravitational plunge): shifts toward deep amber / infrared-crimson
                    vec3 blueShiftColor = vec3(0.40, 0.85, 1.0);
                    vec3 redShiftColor  = vec3(0.50, 0.05, 0.0);
                    
                    vec3 spectralColor = baseColor;
                    if (freqShift > 1.05) {
                        float bFactor = clamp((freqShift - 1.05) * 0.75, 0.0, 1.0);
                        spectralColor = mix(spectralColor, blueShiftColor, bFactor * 0.60);
                        spectralColor += vec3(0.25, 0.55, 1.0) * bFactor * 0.75;
                    } else if (freqShift < 0.95) {
                        float rFactor = clamp((0.95 - freqShift) * 1.6, 0.0, 1.0);
                        spectralColor = mix(spectralColor, redShiftColor, rFactor * 0.70);
                    }
                    
                    // Relativistic intensity modulation
                    vec3 finalDiskColor = spectralColor * beaming;
                    
                    // Accretion disk opacity: sharp cutoff inside ISCO, gradual taper at outer edge
                    float innerCut = smoothstep(0.0, 0.10, r);
                    float outerCut = 1.0 - smoothstep(0.80, 1.0, r);
                    float alpha = gasDensity * innerCut * outerCut * 0.90 * uOpacity;
                    
                    gl_FragColor = vec4(finalDiskColor, alpha);
                }
            `
        });
        this.bhDiskMaterial.name = 'RemnantBlackHoleDiskMaterial';
        this.bhDiskMaterial.customProgramCacheKey = () => 'remnant_bh_disk_material';
        const diskMesh = new THREE.Mesh(bhDiskGeometry, this.bhDiskMaterial);
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);

        // Secondary gravitationally lensed arch: light from the rear of the disk deflected over/under event horizon
        this.bhArchMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 1.0 },
                uCameraPos: { value: new THREE.Vector3(0, 0, 10) }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
            vertexShader: `
                varying vec3 vLocalPos;
                varying vec3 vWorldPos;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vLocalPos = position;
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPos = worldPos.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
                #else
                precision mediump float;
                #endif

                varying vec3 vLocalPos;
                varying vec3 vWorldPos;
                varying vec2 vUv;
                uniform float uTime;
                uniform float uOpacity;
                uniform vec3 uCameraPos;

                void main() {
                    float dist = length(vLocalPos.xy);
                    float r = clamp((dist - 1.02) / (2.7 - 1.02), 0.0, 1.0);
                    
                    float angle = atan(vLocalPos.y, vLocalPos.x);
                    
                    // Gravitationally bent arch from the far side of the accretion disk
                    float orbitalFreq = 3.5 / pow(dist + 0.3, 1.5);
                    float wave = sin(angle * 6.0 - uTime * 7.0 * orbitalFreq) * 0.5 + 0.5;
                    
                    // Asymmetric Doppler brightening on the approaching limb of the lensed arch
                    float dopplerArch = 1.0 + 0.55 * cos(angle);
                    
                    vec3 archCore = vec3(1.0, 0.95, 0.88);
                    vec3 archOuter = vec3(0.95, 0.40, 0.05);
                    vec3 archColor = mix(archCore, archOuter, smoothstep(0.0, 0.6, r)) * dopplerArch;
                    
                    // Thin curved halo profile with highest intensity near the photon sphere
                    float ringFade = (1.0 - smoothstep(0.7, 1.0, r)) * smoothstep(0.0, 0.08, r);
                    float alpha = (0.3 + 0.7 * wave) * ringFade * 0.75 * uOpacity;
                    
                    gl_FragColor = vec4(archColor * 1.5, alpha);
                }
            `
        });
        this.bhArchMaterial.name = 'RemnantBlackHoleArchMaterial';
        this.bhArchMaterial.customProgramCacheKey = () => 'remnant_bh_arch_material';
        this.bhArchMesh = new THREE.Mesh(GEOMETRIES.blackHoleLensedArch, this.bhArchMaterial);
        this.blackHoleGroup.add(this.bhArchMesh);

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
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
                #else
                precision mediump float;
                #endif

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
                this.bhDiskMaterial.uniforms.uCameraPos.value.copy(cameraPos);
            }

            if (this.bhArchMaterial) {
                this.bhArchMaterial.uniforms.uTime.value = appTime;
                this.bhArchMaterial.uniforms.uOpacity.value = globalFade;
                this.bhArchMaterial.uniforms.uCameraPos.value.copy(cameraPos);
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
            if (this.beamMat && this.beamMat.uniforms) {
                this.beamMat.uniforms.uTime.value = appTime;
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
        if (this.beamMat && this.beamMat.uniforms) {
            this.beamMat.uniforms.uOpacity.value = opacityVal;
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
        if (this.bhArchMaterial) this.bhArchMaterial.dispose();
        this.parent.remove(this.neutronStarGroup);
        this.parent.remove(this.blackHoleGroup);
    }
}
