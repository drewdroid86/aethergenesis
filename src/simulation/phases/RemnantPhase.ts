import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { BH_CORE_RADIUS, BH_DISK_INNER, BH_DISK_OUTER, GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';
import { phaseCounters } from '../../utils/performance';
import { thermalPalette, THERMAL_PALETTE_MIN_K, THERMAL_PALETTE_MAX_K, THERMAL_PALETTE_SIZE } from '../../rendering/stellarAppearance';

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
 * (inner edge stays 1.15), 40 M☉ → ~1.25×. Core sphere and both disk images
 * read b_c(M) in the hero group's local space. Pipeline multiplies by the
 * group's expansion scale (physics.lambda) so the post photon ring matches
 * the scaled 3D limb.
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
 * World-space shadow limb. b_c is in the hero group's local space;
 * HeroStarSystem.scale is the cosmological expansion (physics.lambda).
 */
export function blackHoleWorldShadowRadius(massSolar: number, groupScale = 1): number {
    const scale = Number.isFinite(groupScale) ? Math.abs(groupScale) : 1;
    return blackHoleShadowRadius(massSolar) * scale;
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

/** Fraction of viewport width the focused disk (plus its outer rim) should span. */
export const BH_FOCUS_WIDTH_FRACTION = 0.5;
/** Radians above the disk plane. Clear of the plane, still a three-quarter view. */
export const BH_FOCUS_ELEVATION_RAD = 0.48;
/** Lean of the spin axis so jets are not dead vertical. The focus offset is measured from the disk normal, so this does not stack on the elevation. */
export const BH_DISK_TILT_X = 0.22;

const _focusNormal = new THREE.Vector3();
const _focusInPlane = new THREE.Vector3();
const _focusOffset = new THREE.Vector3();

/**
 * World-space camera offset that frames one black hole.
 * `span / frustumWidth` is BH_FOCUS_WIDTH_FRACTION, then clamped so the
 * camera stays outside the shadow and outside the disk body.
 * The direction sits BH_FOCUS_ELEVATION_RAD above `diskNormal`.
 */
export function blackHoleFocusOffsetFromDisk(
    massSolar: number,
    heroScale: number,
    diskNormal: THREE.Vector3,
    fovDeg: number,
    aspect: number,
): THREE.Vector3 {
    const scale = Number.isFinite(heroScale) && heroScale > 0 ? heroScale : 1;
    const shadow = blackHoleShadowRadius(massSolar) * scale;
    const outer = BH_DISK_OUTER * (shadow / BH_DISK_INNER);
    const span = outer * 2;
    const safeAspect = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 1;
    const fov = (Math.min(140, Math.max(10, fovDeg)) * Math.PI) / 180;
    const tanHalf = Math.tan(fov * 0.5);
    let distance = span / (2 * BH_FOCUS_WIDTH_FRACTION * tanHalf * safeAspect);
    const minDistance = Math.max(shadow * 4.5, outer * 1.12);
    if (!Number.isFinite(distance) || distance < minDistance) distance = minDistance;

    const normal = _focusNormal.copy(diskNormal);
    if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
    else normal.normalize();
    const inPlane = _focusInPlane.set(0, 0, 1);
    if (Math.abs(normal.dot(inPlane)) > 0.85) inPlane.set(1, 0, 0);
    inPlane.addScaledVector(normal, -normal.dot(inPlane)).normalize();
    return _focusOffset
        .copy(inPlane)
        .multiplyScalar(Math.cos(BH_FOCUS_ELEVATION_RAD))
        .addScaledVector(normal, Math.sin(BH_FOCUS_ELEVATION_RAD))
        .normalize()
        .multiplyScalar(distance)
        .clone();
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
            uThermalPalette: { value: thermalPalette },
            uPaletteRange: { value: new THREE.Vector2(THERMAL_PALETTE_MIN_K, THERMAL_PALETTE_MAX_K) },
            uPaletteTexelSize: { value: 1 / THERMAL_PALETTE_SIZE },
            // AESTHETIC: not physics-derived, intentional visible-band temperature proxy.
            // No accretion-rate state exists; this is not the disk's X-ray temperature.
            // 9800 K puts the inner rim on the white side of the shared palette;
            // the r^-3/4 falloff then runs through orange before the outer cut.
            uInnerTemperatureK: { value: 9800 },
        },
        transparent: true,
        // The plane composites. Additive overlap was stacking the disk into a
        // white fog. The under-image stays additive and dim.
        blending: secondary ? THREE.AdditiveBlending : THREE.NormalBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        vertexShader: `
            varying vec3 vLocalPos;
            varying vec3 vWorldPos;
            varying vec3 vTangentWorld;
            varying float vFacing;
            varying float vCurl;
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
                float ang = atan(position.z, position.x);
                // AESTHETIC: apparent image, not a geodesic solver.
                // The far inner rim lifts off the plane (primary over the shadow,
                // secondary under it). Radius is only gathered, and never inside
                // the shadow limb — pulling vertices across the hole stretched
                // triangles through the black core and cut a jagged band.
                // Broad far half, so the arc meets the plane at both limbs of the
                // shadow instead of a cap stuck on the back of the hole.
                float far = 1.0 - smoothstep(-0.98, 0.08, facing);
                float inner = 1.0 - smoothstep(uInner * 1.04, uInner * 3.15, r);
                float curl = far * mix(0.5, 1.0, inner);
                float crest = pow(clamp(far, 0.0, 1.0), 1.2) * inner;
                float lift = uBendSign * (0.48 * curl + 1.05 * crest) * uInner * uOblique;
                // Gather stays outside the shadow limb. Crossing that limb is
                // what stretched triangles through the black core.
                float gathered = max(r * (1.0 - 0.05 * curl), uInner * 1.06);
                p.xz = radN * gathered;
                // Integer azimuth harmonic: sin(ang * 2) matches across the atan cut.
                float puff = 0.04 * (0.7 + 0.3 * sin(ang * 2.0));
                p.y += lift + puff * uOblique;
                vec4 worldPos = modelMatrix * vec4(p, 1.0);
                vLocalPos = position;
                vWorldPos = worldPos.xyz;
                vTangentWorld = mat3(modelMatrix) * vec3(-sin(ang), 0.0, cos(ang));
                vFacing = facing;
                vCurl = curl;
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
            varying vec3 vTangentWorld;
            varying float vFacing;
            varying float vCurl;
            uniform float uTime;
            uniform float uOpacity;
            uniform vec3 uCameraPos;
            uniform float uOblique;
            uniform float uImageGain;
            uniform float uFarOnly;
            uniform float uInner;
            uniform float uOuter;
            uniform sampler2D uThermalPalette;
            uniform vec2 uPaletteRange;
            uniform float uPaletteTexelSize;
            uniform float uInnerTemperatureK;

            void main() {
                float dist = length(vLocalPos.xz);
                float r = clamp((dist - uInner) / (uOuter - uInner), 0.0, 1.0);
                float angle = atan(vLocalPos.z, vLocalPos.x);

                // Relativistic shading kept: Doppler beaming, gravitational redshift, ISCO.
                float beta = clamp(0.62 / sqrt(dist * 0.8 + 0.35), 0.0, 0.72);
                // Orbital tangent of the tilted disk. Local XZ is the mesh plane;
                // modelMatrix carries blackHoleGroup's tilt into world space.
                vec3 tangentDir = normalize(vTangentWorld);
                vec3 viewDir = normalize(uCameraPos - vWorldPos);
                float beta_los = beta * dot(tangentDir, viewDir);
                float gamma = 1.0 / sqrt(max(0.01, 1.0 - beta * beta));
                float delta = 1.0 / max(0.1, gamma * (1.0 - beta_los));
                float beaming = pow(delta, 3.2);
                float g_grav = sqrt(max(0.04, 1.0 - 0.5 / max(0.55, dist)));
                float freqShift = g_grav * delta;

                // Longitudinal filaments. Keplerian orbitalFreq shears the lanes
                // (inner gas pulls ahead). Every multiplier of shear is an
                // integer: atan jumps by 2π on the local -X ray, and a
                // non-integer harmonic (the old 2.6 / 1.15 / 3.1) offset the
                // streaks across that ray. dist-only terms are continuous.
                float orbitalFreq = 4.5 / pow(dist + 0.2, 1.5);
                float shear = angle - log(max(dist, 0.55)) * 6.0 - uTime * 0.22 * orbitalFreq;
                float lane = pow(0.5 + 0.5 * sin(shear * 17.0), 18.0);
                float lane2 = pow(0.5 + 0.5 * sin(shear * 29.0 + 1.3), 26.0);
                float lane3 = pow(0.5 + 0.5 * sin(shear * 7.0), 10.0);
                float along = smoothstep(0.22, 0.8, 0.5 + 0.5 * sin(shear * 2.0 + dist * 0.35));
                float threads = clamp(lane * 0.7 + lane2 * 0.62 + lane3 * 0.28, 0.0, 1.0);
                threads *= mix(0.18, 1.0, along);
                float clumps = pow(max(sin(shear * 3.0) * sin(shear * 5.0 + dist * 2.0), 0.0), 2.0);

                // Thin-disk radial temperature shape, with Doppler + gravitational
                // frequency shift applied before sampling the shared blackbody palette.
                // AESTHETIC: visible-band proxy, not a physical accretion simulation.
                float temperatureK = uInnerTemperatureK * pow(max(dist / uInner, 1.0), -0.75) * freqShift;
                float paletteU = clamp((temperatureK - uPaletteRange.x) / (uPaletteRange.y - uPaletteRange.x), 0.0, 1.0);
                paletteU = mix(0.5 * uPaletteTexelSize, 1.0 - 0.5 * uPaletteTexelSize, paletteU);
                vec3 body = texture2D(uThermalPalette, vec2(paletteU, 0.5)).rgb;
                // Orange-white filaments. The palette still tints the grade;
                // a flat beige fill was the opaque mid-temperature plane.
                float heat = clamp((temperatureK - 2200.0) / 9000.0, 0.0, 1.0);
                vec3 ember = mix(vec3(0.62, 0.08, 0.01), vec3(1.0, 0.46, 0.07), smoothstep(0.0, 0.48, heat));
                vec3 spectralColor = mix(ember, vec3(1.0, 0.97, 0.92), smoothstep(0.40, 1.0, heat));
                spectralColor = mix(spectralColor, body, 0.2);

                // Display compress of the kept beaming term so the Doppler limb
                // stays the bright side without flooding the plane.
                float beamed = beaming / (1.0 + 0.62 * max(beaming - 1.0, 0.0));
                vec3 finalDiskColor = spectralColor * beamed;
                finalDiskColor *= mix(0.22, 1.28, clamp(threads, 0.0, 1.0));
                finalDiskColor = mix(finalDiskColor, vec3(1.0, 0.97, 0.92), clamp(clumps * threads * 1.15, 0.0, 0.8));

                // Shallow-angle foreground ribbon: the near limb, strongest edge-on.
                float ribbon = uOblique * pow(max(vFacing, 0.0), 1.35);
                ribbon *= 0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.65, r));
                finalDiskColor += vec3(1.0, 0.72, 0.28) * ribbon * 0.2;
                finalDiskColor *= 1.0 + ribbon * 0.28;

                float peak = max(finalDiskColor.r, max(finalDiskColor.g, finalDiskColor.b));
                // Shoulder anchored at 1.15. Factor is 1 on the threshold and
                // below 1 above it, so the limb is dimmed rather than boosted.
                float excess = max(peak - 1.15, 0.0);
                if (excess > 0.0) {
                    finalDiskColor *= 1.0 / (1.0 + 0.85 * excess / 1.15);
                }

                // Nothing inside the shadow. The inner edge is b_c in local units.
                float innerCut = smoothstep(uInner, uInner + 0.05, dist);
                // Keep the bright streaks just off the shadow limb so an
                // edge-on inner rim does not rule a line across the hole.
                innerCut *= smoothstep(uInner, uInner + 0.14, dist);
                float outerCut = 1.0 - smoothstep(0.78, 1.0, r);
                // The streaks carry the light. A bright floor was the beige cone.
                float veil = uFarOnly > 0.5 ? 0.0 : 0.04 * (1.0 - 0.35 * r);
                float radial = mix(1.2, 0.4, smoothstep(0.0, 0.88, r));
                float density = clamp(veil + threads * radial + ribbon * 0.08, 0.0, 1.0);
                float alpha = density * innerCut * outerCut;
                if (uFarOnly > 0.5) {
                    // Same curl weight that lifts the vertex. Where the surface
                    // is still on the plane, the under-image is gone, so the two
                    // meshes do not share a face and slice the filaments.
                    alpha *= uOblique * smoothstep(0.04, 0.45, vCurl);
                }
                alpha = clamp(alpha, 0.0, 1.0) * uOpacity * uImageGain;
                gl_FragColor = vec4(finalDiskColor, alpha);
            }
        `,
    });
    mat.name = secondary ? 'RemnantBlackHoleWrapMaterial' : 'RemnantBlackHoleDiskMaterial';
    mat.customProgramCacheKey = () => 'remnant_bh_disk_wrap_v6';
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
        this.blackHoleGroup.rotation.x = BH_DISK_TILT_X;
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
            // Spin axis stays near +Y (jets). Focus framing, not this tilt, is
            // what holds the default camera off the disk plane.
            this.blackHoleGroup.rotation.x = BH_DISK_TILT_X;
            this.blackHoleGroup.rotation.z = 0;
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
