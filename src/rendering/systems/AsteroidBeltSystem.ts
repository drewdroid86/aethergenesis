import * as THREE from 'three';

const BANDS = [
    { lo: 2.0, hi: 2.5, mid: 2.25 },
    { lo: 2.5, hi: 3.0, mid: 2.75 },
    { lo: 3.0, hi: 3.5, mid: 3.25 },
];

// Detail 2 is the cheapest icosahedron that still has enough vertices for a
// per-instance silhouette. One shared mesh and one shader cover every band.
const ASTEROID_RADIUS = 0.02;
const ASTEROID_DETAIL = 2;

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

float rockHeight(vec3 dir, vec3 seedOff) {
    float n1 = vnoise(dir * 2.7 + seedOff);
    float n2 = vnoise(dir * 5.4 + seedOff.zxy + 4.2);
    return (n1 * 0.68 + n2 * 0.32) * 2.0 - 1.0;
}

vec3 rockPoint(vec3 basePos, vec3 stretch, vec3 seedOff) {
    vec3 p = basePos * stretch;
    p += normalize(p) * rockHeight(normalize(basePos), seedOff) * 0.52 * length(basePos);
    return p;
}

void main() {
    float seed = instanceColor.r;
    float seedB = instanceColor.g;
    vSeed = seed;
    vTint = instanceColor.b;

    vec3 stretch = vec3(
        0.62 + fract(seed * 13.17) * 0.76,
        0.58 + fract(seedB * 47.23) * 0.82,
        0.64 + fract(seed * 91.71 + seedB) * 0.70
    );
    vec3 seedOff = vec3(seed, seedB, fract(seed * 7.0 + seedB)) * 53.0;

    vec3 p = rockPoint(position, stretch, seedOff);
    vec3 dir = normalize(position);
    vec3 tang = normalize(cross(dir, abs(dir.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 bit = cross(dir, tang);
    float eps = length(position) * 0.22;
    vec3 pT = rockPoint(position + tang * eps, stretch, seedOff);
    vec3 pB = rockPoint(position + bit * eps, stretch, seedOff);
    vec3 nObj = normalize(cross(pT - p, pB - p));

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

vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
    return snoise(p) * 0.55
        + snoise(p * 2.15 + vec3(17.3, -9.1, 13.7)) * 0.30
        + snoise(p * 4.5 + vec3(-11.2, 23.4, -7.8)) * 0.15;
}

void main() {
    vec3 sp = vObjDir * 2.4 + vec3(vSeed * 19.0, vTint * 11.0, vSeed * vTint * 6.0);
    float n = fbm(sp);
    float pits = fbm(sp * 1.85 + vec3(4.2, -2.7, 1.1));
    float fine = snoise(sp * 3.6 + 8.0);

    float family = vTint;
    vec3 carbon = vec3(0.13, 0.12, 0.11);
    vec3 stony = vec3(0.40, 0.31, 0.23);
    vec3 pale = vec3(0.58, 0.52, 0.44);
    vec3 rust = vec3(0.52, 0.24, 0.11);
    vec3 albedo = mix(carbon, stony, smoothstep(0.06, 0.62, family));
    albedo = mix(albedo, pale, smoothstep(0.72, 0.96, family));
    albedo = mix(albedo, rust, smoothstep(0.55, 0.95, fract(vSeed * 9.13)) * 0.55);
    albedo = mix(albedo * 0.62, albedo, smoothstep(-0.4, 0.45, n));
    albedo *= 0.78 + 0.28 * smoothstep(-0.2, 0.55, pits);
    // Soft bowl darkening with a thin raised rim, not high-frequency salt.
    float bowl = smoothstep(0.05, 0.42, pits);
    float rim = smoothstep(0.02, 0.16, pits) * (1.0 - smoothstep(0.16, 0.38, pits));
    albedo = mix(albedo * 0.55, albedo, bowl);
    albedo += vec3(0.07, 0.05, 0.035) * rim;
    albedo *= 0.92 + 0.10 * fine;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 N = normalize(vNormal);
    if (dot(N, viewDir) < 0.0) N = -N;
    float bump = (pits - 0.15) * 0.55;
    vec3 grad = dFdx(vWorldPos) * dFdx(bump) + dFdy(vWorldPos) * dFdy(bump);
    N = normalize(N - grad);

    vec3 lightDir = normalize(vStarWorld - vWorldPos);
    float ndotl = dot(N, lightDir);
    float lambert = max(ndotl, 0.0);
    float wrap = clamp(ndotl * 0.82 + 0.18, 0.0, 1.0);
    float diff = max(mix(lambert, wrap, 0.22), 0.045);

    vec3 sunCol = vec3(1.22, 1.08, 0.90);
    vec3 color = albedo * sunCol * diff;

    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(N, halfDir), 0.0), 24.0) * smoothstep(0.05, 0.35, ndotl);
    color += vec3(1.0, 0.94, 0.82) * spec * 0.12;

    float fres = pow(1.0 - clamp(dot(N, viewDir), 0.0, 1.0), 2.4);
    color += albedo * fres * 0.05;

    gl_FragColor = vec4(color, 1.0);
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
        this.geometry = new THREE.IcosahedronGeometry(ASTEROID_RADIUS, ASTEROID_DETAIL);
        const extent = BANDS[BANDS.length - 1].hi + 0.5;
        this.geometry.boundingBox = new THREE.Box3(
            new THREE.Vector3(-extent, -extent, -extent),
            new THREE.Vector3(extent, extent, extent)
        );
        this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), extent);
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
