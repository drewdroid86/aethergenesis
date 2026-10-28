import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { BH_CORE_RADIUS, BH_DISK_INNER, BH_DISK_OUTER, GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';
import { phaseCounters } from '../../utils/performance';

// BOLT: Module-level helper to avoid closure overhead
const stepOp = (current: number, target: number, speed: number) => {
    if (current < target) return Math.min(target, current + speed);
    if (current > target) return Math.max(target, current - speed);
    return current;
};

export const WHITE_DWARF_SCALE = 3.0;
export const WHITE_DWARF_COLOR = 0xfff6e0;
export const NEUTRON_STAR_COLOR = 0xaaccff;

/**
 * Schwarzschild shadow authority, in scene units.
 *
 * r_g = GM/c². The photon sphere is 3 r_g. A distant observer sees the dark
 * shadow out to the critical impact parameter
 *   b_c = √27 r_g ≈ 5.196 r_g
 * and the knife-edge photon ring sits on that limb.
 *
 * The shared disk mesh is built once with inner radius BH_DISK_INNER, which
 * is b_c at the Cygnus X-1 catalog mass. Per remnant:
 *   b_c(M) = BH_DISK_INNER * (M / 21.2 M☉) ^ 0.35
 *   r_g(M) = b_c(M) / √27
 * The 0.35 exponent is the mild radial scale: 15 M☉ → ~0.88×, 21.2 M☉ → 1×
 * (inner edge stays 1.15), 40 M☉ → ~1.25×. Core sphere, both disk images, and
 * Pipeline uBlackHoleRadius all read b_c(M). Hero groups are unscaled, so the
 * world radius equals b_c.
 */
export const BH_REFERENCE_MASS_SOLAR = 21.2;
export const BH_MASS_EXP = 0.35;
/** Core sphere fills the shadow, a hair inside the post limb. */
export const BH_CORE_FILL = 0.985;
const BH_SQRT27 = Math.sqrt(27);

export function blackHoleShadowRadius(massSolar: number): number {
    const mass = Math.max(1e-3, massSolar);
    return BH_DISK_INNER * Math.pow(mass / BH_REFERENCE_MASS_SOLAR, BH_MASS_EXP);
}

export function blackHoleGravitationalRadius(massSolar: number): number {
    return blackHoleShadowRadius(massSolar) / BH_SQRT27;
}

/**
 * True only when the remnant is in front of the camera.
 * Three.js view space: the camera looks down -Z, so in-front points have viewZ < 0.
 * NDC z outside [-1, 1] is outside the forward frustum (behind-camera perspective
 * divide on this projection lands above +1).
 */
export function blackHoleInFrontOfCamera(viewZ: number, ndcZ: number): boolean {
    return viewZ < 0 && ndcZ >= -1 && ndcZ <= 1;
}

function createBlackHoleDiskMaterial(kind: 'primary' | 'secondary'): THREE.ShaderMaterial {
    const secondary = kind === 'secondary';
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 1.0 },
            uCameraPos: { value: new THREE.Vector3(0, 0, 10) },
            uCameraLocal: { value: new THREE.Vector3(0, 0.4, 8) },
            uBendSign: { value: secondary ? -1.0 : 1.0 },
            uOblique: { value: 0.65 },
            uImageGain: { value: secondary ? 0.62 : 1.0 },
            uFarOnly: { value: secondary ? 1.0 : 0.0 },
            uInner: { value: BH_DISK_INNER },
            uOuter: { value: BH_DISK_OUTER },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        vertexShader: `
            varying vec3 vLocalPos;
            varying vec3 vWorldPos;
            varying float vFacing;
            uniform vec3 uCameraLocal;
            uniform float uBendSign;
            uniform float uOblique;
            uniform float uInner;
            uniform float uOuter;
            void main() {
                vec3 p = position;
                vec2 radial = p.xz;
                float r = length(radial);
                vec2 radN = r > 1e-4 ? radial / r : vec2(1.0, 0.0);
                vec2 camXZ = uCameraLocal.xz;
                float camXZLen = length(camXZ);
                vec2 camAxis = camXZLen > 1e-3 ? camXZ / camXZLen : vec2(0.0, 1.0);
                float facing = dot(radN, camAxis);
                // Far side of the annulus curls over (or under) the shadow.
                // Height ~0.46 at the inner rim clears the limb by ~10% at a
                // three-quarter view and falls off by mid-disk, so this is the
                // same mesh wrapping, not a second ring.
                float far = 1.0 - smoothstep(-0.55, 0.35, facing);
                float falloff = 1.0 - smoothstep(uInner * 1.15, uOuter * 0.8, r);
                // ~0.85 local units at the inner rim. At a three-quarter view that
                // sits just outside the shadow limb instead of a tall second arch.
                float h = uBendSign * 0.85 * far * uOblique * falloff;
                float ang = atan(p.z, p.x);
                float puff = 0.02 * max(r - uInner, 0.0) * sin(ang * 3.0);
                p.y += h + puff;
                vec4 worldPos = modelMatrix * vec4(p, 1.0);
                vLocalPos = p;
                vWorldPos = worldPos.xyz;
                vFacing = facing;
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
            varying float vFacing;
            uniform float uTime;
            uniform float uOpacity;
            uniform vec3 uCameraPos;
            uniform float uOblique;
            uniform float uImageGain;
            uniform float uFarOnly;
            uniform float uInner;
            uniform float uOuter;

            void main() {
                float dist = length(vLocalPos.xz);
                float r = clamp((dist - uInner) / (uOuter - uInner), 0.0, 1.0);
                float angle = atan(vLocalPos.z, vLocalPos.x);

                // Relativistic shading kept: Doppler beaming, gravitational redshift, ISCO.
                float beta = clamp(0.62 / sqrt(dist * 0.8 + 0.35), 0.0, 0.72);
                vec3 tangentDir = normalize(vec3(-sin(angle), 0.0, cos(angle)));
                vec3 viewDir = normalize(uCameraPos - vWorldPos);
                float beta_los = beta * dot(tangentDir, viewDir);
                float gamma = 1.0 / sqrt(max(0.01, 1.0 - beta * beta));
                float delta = 1.0 / max(0.1, gamma * (1.0 - beta_los));
                float beaming = pow(delta, 3.2);
                float g_grav = sqrt(max(0.04, 1.0 - 0.5 / max(0.55, dist)));
                float freqShift = g_grav * delta;

                // Longitudinal filaments: thin across radius, long along the sheared
                // flow (log r from differential rotation). High azimuthal frequency
                // reads as concentric rings; this stays flow-wise. No FBM spots.
                float orbitalFreq = 4.5 / pow(dist + 0.2, 1.5);
                float shear = angle - log(max(dist, 0.55)) * 5.5 - uTime * 0.3 * orbitalFreq;
                float lane = pow(0.5 + 0.5 * sin(dist * 11.0 - shear * 2.4), 4.0);
                float lane2 = pow(0.5 + 0.5 * sin(dist * 19.0 - shear * 1.1 + 2.0), 5.0);
                float wisps = smoothstep(0.22, 0.82, 0.5 + 0.5 * sin(shear * 3.6));
                float threads = clamp(lane * 0.72 + lane2 * 0.48, 0.0, 1.0) * wisps;
                float clumps = pow(max(sin(shear * 2.4 + 0.6) * sin(shear * 0.85), 0.0), 2.6);

                vec3 coreColor = vec3(1.0, 0.98, 0.94);
                vec3 midColor  = vec3(1.0, 0.50, 0.08);
                vec3 outerColor = vec3(0.68, 0.08, 0.01);
                vec3 baseColor = mix(coreColor, midColor, smoothstep(0.0, 0.32, r));
                baseColor = mix(baseColor, outerColor, smoothstep(0.32, 1.0, r));
                // ISCO temperature cue only. The luminous photon ring is the post pass.
                baseColor = mix(baseColor, coreColor, clamp(exp(-r * 9.0), 0.0, 1.0) * 0.42);

                vec3 blueShiftColor = vec3(0.42, 0.88, 1.0);
                vec3 redShiftColor  = vec3(0.55, 0.04, 0.0);
                vec3 spectralColor = baseColor;
                if (freqShift > 1.05) {
                    float bFactor = clamp((freqShift - 1.05) * 0.75, 0.0, 1.0);
                    spectralColor = mix(spectralColor, blueShiftColor, bFactor * 0.60);
                    // Doppler factor above is unchanged. The extra cyan emissive
                    // was painting a prism on the limb; keep a hint only.
                    spectralColor += vec3(0.28, 0.60, 1.0) * bFactor * 0.22;
                } else if (freqShift < 0.95) {
                    float rFactor = clamp((0.95 - freqShift) * 1.6, 0.0, 1.0);
                    spectralColor = mix(spectralColor, redShiftColor, rFactor * 0.70);
                }

                vec3 finalDiskColor = spectralColor * beaming;
                finalDiskColor *= mix(0.16, 1.0, clamp(threads + clumps * 0.45, 0.0, 1.0));
                finalDiskColor = mix(finalDiskColor, vec3(1.0, 0.94, 0.86), clamp(clumps, 0.0, 0.72));

                // Shallow-angle foreground ribbon: the near limb, strongest edge-on.
                float ribbon = uOblique * pow(max(vFacing, 0.0), 1.55);
                ribbon *= 1.0 - smoothstep(0.02, 0.62, r);
                finalDiskColor += vec3(1.0, 0.62, 0.22) * ribbon * 0.55;
                finalDiskColor *= 1.0 + ribbon * 0.85;

                // Exposure lean toward the orange reference. The Doppler ratio is
                // already in beaming; this only stops stacked fragments blooming white.
                finalDiskColor *= 0.62;
                float peak = max(finalDiskColor.r, max(finalDiskColor.g, finalDiskColor.b));
                if (peak > 0.9) {
                    finalDiskColor *= 1.35 / (1.0 + 0.5 * peak);
                }

                // Nothing inside the shadow. The inner edge is b_c in local units.
                float innerCut = smoothstep(uInner, uInner + 0.11, dist);
                float outerCut = 1.0 - smoothstep(0.7, 1.0, r);
                float body = 0.04 * (1.0 - smoothstep(0.05, 1.0, r));
                float density = clamp(body * 0.5 + threads * 0.85 + clumps * 0.65 + ribbon * 0.4, 0.0, 1.0);
                float alpha = density * innerCut * outerCut;
                if (uFarOnly > 0.5) {
                    alpha *= uOblique * (1.0 - smoothstep(-0.7, 0.05, vFacing));
                }
                alpha = clamp(alpha, 0.0, 1.0) * uOpacity * uImageGain;
                gl_FragColor = vec4(finalDiskColor, alpha);
            }
        `,
    });
    mat.name = secondary ? 'RemnantBlackHoleWrapMaterial' : 'RemnantBlackHoleDiskMaterial';
    mat.customProgramCacheKey = () => 'remnant_bh_disk_wrap_v1';
    return mat;
}

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
    private bhWrapMaterial?: THREE.ShaderMaterial;
    private bhDiskMesh?: THREE.Mesh;
    private bhWrapMesh?: THREE.Mesh;
    private bhCoreMesh?: THREE.Mesh;
    private bhJetMaterial?: THREE.ShaderMaterial;
    private _camLocal = new THREE.Vector3();

    private _lensMat?: THREE.ShaderMaterial;
    private _lensMesh?: THREE.Mesh;

    // BOLT: Shared materials cached to eliminate per-frame O(N) loops and lookups
    public nsMat!: THREE.MeshBasicMaterial;
    private tubeMat!: THREE.MeshBasicMaterial;
    private beamMat!: THREE.ShaderMaterial;

    private initialized = false;

    constructor(mass: number) {
        this.mass = mass;
        phaseCounters.inits++;
    }

    setMass(mass: number): void {
        this.mass = mass;
        if (this.bhDiskMesh) this.applyShadowAuthority();
    }

    /** Scale core + both disk images from b_c(M). See blackHoleShadowRadius. */
    private applyShadowAuthority(): void {
        const shadow = blackHoleShadowRadius(this.mass);
        this.bhRadius = shadow;
        if (this.bhCoreMesh) {
            this.bhCoreMesh.scale.setScalar((shadow * BH_CORE_FILL) / BH_CORE_RADIUS);
        }
        const diskScale = shadow / BH_DISK_INNER;
        this.bhDiskMesh?.scale.setScalar(diskScale);
        this.bhWrapMesh?.scale.setScalar(diskScale);
        if (this._lensMesh) {
            this._lensMesh.visible = false;
            this._lensMesh.scale.setScalar(shadow);
        }
    }

    private syncDiskMaterial(
        mat: THREE.ShaderMaterial | undefined,
        appTime: number,
        globalFade: number,
        cameraPos: THREE.Vector3,
        oblique: number,
    ): void {
        if (!mat) return;
        mat.uniforms.uTime.value = appTime;
        mat.uniforms.uOpacity.value = globalFade;
        mat.uniforms.uCameraPos.value.copy(cameraPos);
        mat.uniforms.uCameraLocal.value.copy(this._camLocal);
        mat.uniforms.uOblique.value = oblique;
    }

    init(parent: THREE.Group): void {
        if (this.initialized) {
            phaseCounters.blockedDoubleInits++;
            console.warn('[Diagnostics] RemnantPhase already initialized for this star! Guarding duplicate init.');
            return;
        }
        this.initialized = true;
        this.parent = parent;

        // Neutron Star / White Dwarf
        this.neutronStarGroup = new THREE.Group();
        const initialColor = this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA
            ? NEUTRON_STAR_COLOR
            : WHITE_DWARF_COLOR;
        this.nsMat = new THREE.MeshBasicMaterial({color: initialColor, transparent: true, opacity: 0});
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
        if (this.mass <= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
            this.neutronStarGroup.scale.setScalar(WHITE_DWARF_SCALE);
            this.pulsarGroup.visible = false;
            this.nsMagneticLines.visible = false;
        } else {
            this.neutronStarGroup.scale.setScalar(1.0);
            this.pulsarGroup.visible = true;
            this.nsMagneticLines.visible = true;
        }
        this.parent.add(this.neutronStarGroup);

        // Black Hole
        this.blackHoleGroup = new THREE.Group();
        const bhCoreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        bhCoreMat.name = 'RemnantBlackHoleCoreMaterial';
        const bhCore = new THREE.Mesh(GEOMETRIES.blackHoleCore, bhCoreMat);
        bhCore.name = 'bhCore';
        this.bhCoreMesh = bhCore;

        // One disk shader, two images. Primary curls the far side over the shadow.
        // Secondary is the under-image only (uFarOnly), same filaments, dimmer —
        // not a camera-facing RingGeometry arch.
        const bhDiskGeometry = GEOMETRIES.blackHoleDisk;
        this.bhDiskMaterial = createBlackHoleDiskMaterial('primary');
        this.bhWrapMaterial = createBlackHoleDiskMaterial('secondary');
        const diskMesh = new THREE.Mesh(bhDiskGeometry, this.bhDiskMaterial);
        diskMesh.name = 'bhDisk';
        diskMesh.renderOrder = 2;
        const wrapMesh = new THREE.Mesh(bhDiskGeometry, this.bhWrapMaterial);
        wrapMesh.name = 'bhWrap';
        wrapMesh.renderOrder = 3;
        this.bhDiskMesh = diskMesh;
        this.bhWrapMesh = wrapMesh;
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);
        this.blackHoleGroup.add(wrapMesh);
        this.applyShadowAuthority();


        // Relativistic Blandford-Znajek polar plasma jets launched from the black hole magnetosphere
        this.bhJetMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 1.0 }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
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
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
                #else
                precision mediump float;
                #endif

                varying vec3 vLocalPos;
                varying vec2 vUv;
                uniform float uTime;
                uniform float uOpacity;

                void main() {
                    // vUv.y runs along jet length; vUv.x wraps azimuthally
                    float radialCore = sin(vUv.x * 3.14159265);
                    radialCore = pow(clamp(radialCore, 0.0, 1.0), 2.2);
                    // Helical relativistic synchrotron shock knots streaming outward
                    float helix1 = sin(vUv.y * 22.0 - uTime * 18.0 + vUv.x * 6.28318) * 0.5 + 0.5;
                    float helix2 = sin(vUv.y * 35.0 - uTime * 28.0 - vUv.x * 6.28318) * 0.5 + 0.5;
                    float knots = 0.45 + 0.55 * (helix1 * 0.65 + helix2 * 0.35);

                    float baseFade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
                    vec3 innerJet = vec3(0.75, 0.92, 1.0); // Ultra-relativistic electron-positron core
                    vec3 outerJet = vec3(0.25, 0.45, 1.0); // Synchrotron blue-violet sheath
                    vec3 col = mix(outerJet, innerJet, radialCore * knots);

                    // Dim versus the disk. Same helix knots; the disk and photon ring own the frame.
                    float alpha = radialCore * knots * baseFade * 0.04 * uOpacity;
                    gl_FragColor = vec4(col * 0.12, alpha);
                }
            `
        });
        this.bhJetMaterial.name = 'RemnantBlackHoleJetMaterial';
        this.bhJetMaterial.customProgramCacheKey = () => 'remnant_bh_jet_material';
        const jetNorth = new THREE.Mesh(GEOMETRIES.protostarJet, this.bhJetMaterial);
        jetNorth.position.y = 6.4;
        jetNorth.scale.set(0.28, 0.38, 0.28);
        const jetSouth = new THREE.Mesh(GEOMETRIES.protostarJet, this.bhJetMaterial);
        jetSouth.position.y = -6.4;
        jetSouth.rotation.x = Math.PI;
        jetSouth.scale.set(0.28, 0.38, 0.28);
        this.blackHoleGroup.add(jetNorth);
        this.blackHoleGroup.add(jetSouth);

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
        lensSphere.name = 'bhLocalLens';
        // Cinematic pass owns the photon ring and the screen-space warp.
        // This sphere's rim stacked a second ring and a second lens on top.
        lensSphere.visible = false;
        lensMat.uniforms.uStrength.value = 0;
        lensMat.uniforms.uOpacity.value = 0;
        this._lensMat = lensMat;
        this._lensMesh = lensSphere;
        this.blackHoleGroup.add(lensSphere);
        this.applyShadowAuthority();

        this.parent.add(this.blackHoleGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean, globalFade: number = 1.0): void {
        // M2 fix: boundaries must match StellarPhysics.computeRemnantType. A 15.0 M☉
        // progenitor yields current mass 3.0 M☉ → 'black_hole' (not < 3.0), so the
        // visual BH branch is >=, not >. Likewise an 8.0 M☉ progenitor yields a
        // white dwarf (<= 8 branch), so the pulsar branch is > 8, not >= 8.
        if (this.mass >= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE) {
            this.blackHoleGroup.visible = globalFade > 0.01;
            // Spin axis stays near +Y (jets). The extra X tilt keeps a camera on
            // world +Z out of the disk plane — rotation.z alone put that camera
            // edge-on, which is why the old vertical arch had to face the viewer.
            this.blackHoleGroup.rotation.x = 0.58;
            this.blackHoleGroup.rotation.z = Math.PI / 8;
            this.applyShadowAuthority();
            if (this.bhDiskMesh) {
                this._camLocal.copy(cameraPos);
                this.bhDiskMesh.worldToLocal(this._camLocal);
            }
            const camLen = Math.max(1e-4, this._camLocal.length());
            const mu = Math.abs(this._camLocal.y) / camLen;
            const oblique = 1 - THREE.MathUtils.smoothstep(mu, 0.18, 0.94);
            this.syncDiskMaterial(this.bhDiskMaterial, appTime, globalFade, cameraPos, oblique);
            this.syncDiskMaterial(this.bhWrapMaterial, appTime, globalFade, cameraPos, oblique);

            if (this.bhJetMaterial) {
                this.bhJetMaterial.uniforms.uTime.value = appTime;
                this.bhJetMaterial.uniforms.uOpacity.value = globalFade;
            }

            // Local rim stays muted whenever the cinematic lens can run.
            if (this._lensMesh) this._lensMesh.visible = false;
            if (this._lensMat) {
                this._lensMat.uniforms.uTime.value = appTime;
                this._lensMat.uniforms.uStrength.value = 0;
                this._lensMat.uniforms.uOpacity.value = 0;
            }
        } else if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
            // Neutron Star branch (> 8 Msun): scale 1.0, blue-white color, active beams & magnetic lines
            this.neutronStarGroup.scale.setScalar(1.0);
            this.nsMat.color.setHex(NEUTRON_STAR_COLOR);
            this.pulsarGroup.visible = true;
            this.nsMagneticLines.visible = true;
            if (!lowDetail) {
                this.pulsarGroup.rotation.y += delta * 5.0 * (physics.weakForce || 1.0);
                this.nsMagneticLines.rotation.y += delta * 2.0 * (physics.weakForce || 1.0);
            }
            if (this.beamMat && this.beamMat.uniforms) {
                this.beamMat.uniforms.uTime.value = appTime;
            }
        } else {
            // White Dwarf branch (<= 8 Msun): larger Earth-sized warm-white sphere, no pulsar beams or magnetic lines
            this.neutronStarGroup.scale.setScalar(WHITE_DWARF_SCALE);
            this.nsMat.color.setHex(WHITE_DWARF_COLOR);
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
            if (
                mat instanceof THREE.Material &&
                mat !== this.bhDiskMaterial &&
                mat !== this.bhWrapMaterial &&
                mat !== this.bhJetMaterial
            ) {
                mat.dispose();
            }
        }
        if (this.bhDiskMaterial) this.bhDiskMaterial.dispose();
        if (this.bhWrapMaterial) this.bhWrapMaterial.dispose();
        if (this.bhJetMaterial) this.bhJetMaterial.dispose();
        this.parent.remove(this.neutronStarGroup);
        this.parent.remove(this.blackHoleGroup);
    }
}
