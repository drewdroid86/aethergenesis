import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const BANDS = [
    { lo: 2.0, hi: 2.5, mid: 2.25 },
    { lo: 2.5, hi: 3.0, mid: 2.75 },
    { lo: 3.0, hi: 3.5, mid: 3.25 },
];

// Detail 1 is 80 triangles: enough vertices for a stretched, displaced
// silhouette, and well under the detail-2 mesh. Vertices are welded so the
// vertex shader runs once per unique corner. One shared mesh and one shader
// cover every band.
const ASTEROID_RADIUS = 0.02;
const ASTEROID_DETAIL = 1;

// Closed upper bounds of the per-axis stretch in ASTEROID_VS
// (`min + fract(seed) * span`). fract never reaches 1.
const STRETCH_X_MIN = 0.62;
const STRETCH_X_SPAN = 0.76;
const STRETCH_Y_MIN = 0.58;
const STRETCH_Y_SPAN = 0.82;
const STRETCH_Z_MIN = 0.64;
const STRETCH_Z_SPAN = 0.70;
// rockHeight is in [-1, 1]; the vertex offset is rockHeight * this * |basePos|.
const RADIAL_DISPLACEMENT = 0.52;

function glslFloat(n: number): string {
    return n.toFixed(2);
}

function displacedHalfExtent(stretchMin: number, stretchSpan: number): number {
    return ASTEROID_RADIUS * (stretchMin + stretchSpan + RADIAL_DISPLACEMENT);
}

const ASTEROID_VS = `
varying vec3 vWorldPos;
varying vec3 vStarWorld;
varying vec3 vNormal;
varying vec3 vObjDir;
varying float vSeed;
varying float vTint;

float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

// One value-noise sample plus its analytic gradient. Replaces the old
// 2-octave height evaluated three times for finite-difference normals.
void vnoiseGrad(vec3 p, out float value, out vec3 grad) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 s = f * f * (3.0 - 2.0 * f);
    vec3 ds = 6.0 * f * (1.0 - f);

    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, s.x);
    float nx10 = mix(n010, n110, s.x);
    float nx01 = mix(n001, n101, s.x);
    float nx11 = mix(n011, n111, s.x);
    float nxy0 = mix(nx00, nx10, s.y);
    float nxy1 = mix(nx01, nx11, s.y);
    value = mix(nxy0, nxy1, s.z);

    float dnx00 = (n100 - n000) * ds.x;
    float dnx10 = (n110 - n010) * ds.x;
    float dnx01 = (n101 - n001) * ds.x;
    float dnx11 = (n111 - n011) * ds.x;
    grad.x = mix(mix(dnx00, dnx10, s.y), mix(dnx01, dnx11, s.y), s.z);
    grad.y = mix((nx10 - nx00) * ds.y, (nx11 - nx01) * ds.y, s.z);
    grad.z = (nxy1 - nxy0) * ds.z;
}

void main() {
    float seed = instanceColor.r;
    float seedB = instanceColor.g;
    vSeed = seed;
    vTint = instanceColor.b;

    vec3 stretch = vec3(
        ${glslFloat(STRETCH_X_MIN)} + fract(seed * 13.17) * ${glslFloat(STRETCH_X_SPAN)},
        ${glslFloat(STRETCH_Y_MIN)} + fract(seedB * 47.23) * ${glslFloat(STRETCH_Y_SPAN)},
        ${glslFloat(STRETCH_Z_MIN)} + fract(seed * 91.71 + seedB) * ${glslFloat(STRETCH_Z_SPAN)}
    );
    vec3 seedOff = vec3(seed, seedB, fract(seed * 7.0 + seedB)) * 53.0;

    vec3 dir = normalize(position);
    float n1;
    vec3 g1;
    vnoiseGrad(dir * 2.7 + seedOff, n1, g1);
    float height = n1 * 2.0 - 1.0;
    vec3 heightGrad = g1 * 5.4;

    vec3 p = position * stretch;
    p += normalize(p) * height * ${glslFloat(RADIAL_DISPLACEMENT)} * length(position);

    vec3 nEll = normalize(dir / stretch);
    vec3 slope = heightGrad - dir * dot(heightGrad, dir);
    vec3 nObj = normalize(nEll - slope * ${glslFloat(RADIAL_DISPLACEMENT * 0.5)});

    vObjDir = normalize(p);
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorldPos = worldPos.xyz;
    // Uniform instance scale: the 3x3 rotation lights the displaced normal.
    // Belt meshes sit on the host star, matching PlanetarySystem's local light.
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nObj);
    vStarWorld = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const ASTEROID_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vWorldPos;
varying vec3 vStarWorld;
varying vec3 vNormal;
varying vec3 vObjDir;
varying float vSeed;
varying float vTint;

float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}

void main() {
    vec3 sp = vObjDir * 2.4 + vec3(vSeed * 19.0, vTint * 11.0, vSeed * vTint * 6.0);
    // Shared value noise: low octave mottles albedo, one extra octave is the bowl.
    float broad = vnoise(sp);
    float pits = vnoise(sp * 2.2 + vec3(4.2, -2.7, 1.1));
    float n = broad * 2.0 - 1.0;

    float family = vTint;
    vec3 carbon = vec3(0.13, 0.12, 0.11);
    vec3 stony = vec3(0.40, 0.31, 0.23);
    vec3 pale = vec3(0.58, 0.52, 0.44);
    vec3 rust = vec3(0.52, 0.24, 0.11);
    vec3 albedo = mix(carbon, stony, smoothstep(0.06, 0.62, family));
    albedo = mix(albedo, pale, smoothstep(0.72, 0.96, family));
    albedo = mix(albedo, rust, smoothstep(0.55, 0.95, fract(vSeed * 9.13)) * 0.55);
    albedo = mix(albedo * 0.62, albedo, smoothstep(-0.4, 0.45, n));
    albedo *= 0.78 + 0.28 * smoothstep(0.32, 0.70, pits);
    // Soft bowl darkening with a thin raised rim.
    float bowl = smoothstep(0.16, 0.50, pits);
    float rim = smoothstep(0.38, 0.50, pits) * (1.0 - smoothstep(0.50, 0.66, pits));
    albedo = mix(albedo * 0.52, albedo, bowl);
    albedo += vec3(0.08, 0.055, 0.04) * rim;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 N = normalize(vNormal);
    if (dot(N, viewDir) < 0.0) N = -N;

    vec3 lightDir = normalize(vStarWorld - vWorldPos);
    float ndotl = dot(N, lightDir);
    float lambert = max(ndotl, 0.0);
    float wrap = clamp(ndotl * 0.82 + 0.18, 0.0, 1.0);
    float diff = max(mix(lambert, wrap, 0.22), 0.045);

    vec3 sunCol = vec3(1.22, 1.08, 0.90);
    gl_FragColor = vec4(albedo * sunCol * diff, 1.0);
}
`;

function fract(n: number): number {
    return n - Math.floor(n);
}

export class AsteroidBeltSystem {
    private rings: { mesh: THREE.InstancedMesh; mid: number }[] = [];
    private geometry: THREE.BufferGeometry;
    private material: THREE.ShaderMaterial;

    constructor(scene: THREE.Scene, count: number = 10000) {
        const baseGeometry = new THREE.IcosahedronGeometry(ASTEROID_RADIUS, ASTEROID_DETAIL);
        // UVs would keep face corners from welding. The shader does not sample them.
        baseGeometry.deleteAttribute('uv');
        this.geometry = mergeVertices(baseGeometry, 1e-5);
        baseGeometry.dispose();
        // Object-space bounds of one displaced rock. InstancedMesh unions a copy of
        // these transformed by each instance matrix, and those matrices already store
        // the orbital translation and instance scale. The belt radii stay out of here.
        const hx = displacedHalfExtent(STRETCH_X_MIN, STRETCH_X_SPAN);
        const hy = displacedHalfExtent(STRETCH_Y_MIN, STRETCH_Y_SPAN);
        const hz = displacedHalfExtent(STRETCH_Z_MIN, STRETCH_Z_SPAN);
        this.geometry.boundingBox = new THREE.Box3(
            new THREE.Vector3(-hx, -hy, -hz),
            new THREE.Vector3(hx, hy, hz)
        );
        this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(hx, hy, hz));
        this.geometry.name = 'AsteroidBeltGeometry';

        this.material = new THREE.ShaderMaterial({
            vertexShader: ASTEROID_VS,
            fragmentShader: ASTEROID_FS,
        });
        this.material.name = 'AsteroidBeltMaterial';
        this.material.customProgramCacheKey = () => 'asteroid_belt_material';

        const matrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const euler = new THREE.Euler();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        const baseCount = Math.floor(count / 3);

        for (let b = 0; b < BANDS.length; b++) {
            const band = BANDS[b];
            const ringCount = (b === BANDS.length - 1) ? count - baseCount * 2 : baseCount;
            const mesh = new THREE.InstancedMesh(this.geometry, this.material, ringCount);
            const colors = new Float32Array(ringCount * 3);

            for (let i = 0; i < ringCount; i++) {
                // Distributed in a torus between lo and hi of band
                const radius = band.lo + Math.random() * (band.hi - band.lo);
                const angle = Math.random() * Math.PI * 2;

                // Random inclination within +/- 5 degrees
                const inc = (Math.random() - 0.5) * 10 * Math.PI / 180;

                // Initial pos in x-z plane
                const x = Math.cos(angle) * radius;
                let z = Math.sin(angle) * radius;

                // apply inclination + slight thickness offset
                const y = z * Math.sin(inc) + (Math.random() - 0.5) * 0.1;
                z = z * Math.cos(inc);

                pos.set(x, y, z);

                euler.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );

                const s = 0.5 + Math.random() * 1.5;
                scale.setScalar(s);

                quat.setFromEuler(euler);
                matrix.compose(pos, quat, scale);
                mesh.setMatrixAt(i, matrix);

                // Derived from placement values so shape/tint vary per rock
                // without consuming extra RNG (keeps the orbital layout stable).
                const rockSeed = fract(Math.sin((i + 1) * 12.9898 + (b + 1) * 78.233 + radius * 43.758 + angle) * 43758.5453);
                colors[i * 3] = rockSeed;
                colors[i * 3 + 1] = fract(rockSeed * 17.13 + radius * 0.37 + s);
                colors[i * 3 + 2] = fract(rockSeed * 43.71 + angle * 0.11 + y);
            }

            mesh.instanceMatrix.needsUpdate = true;
            const instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
            instanceColor.setUsage(THREE.StaticDrawUsage);
            mesh.instanceColor = instanceColor;
            scene.add(mesh);
            this.rings.push({ mesh, mid: band.mid });
        }
    }

    update(time: number, starPosition?: THREE.Vector3, starMass: number = 1.0): void {
        const base = time * 0.05 * Math.sqrt(Math.max(0.01, starMass));
        for (const ring of this.rings) {
            ring.mesh.rotation.y = base * Math.pow(2.75 / ring.mid, 1.5);
            if (starPosition) ring.mesh.position.copy(starPosition);
        }
    }

    dispose(): void {
        for (const ring of this.rings) {
            if (ring.mesh.parent) {
                ring.mesh.parent.remove(ring.mesh);
            }
            ring.mesh.dispose();
        }
        this.rings = [];
        this.geometry.dispose();
        this.material.dispose();
    }
}
