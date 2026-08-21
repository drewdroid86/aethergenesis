import * as THREE from 'three';
import { PHASES, STELLAR_CONSTANTS } from '../../core/constants';
import { GEOMETRIES } from '../../simulation/phases/geometries';
import { computeLuminosity } from '../../simulation/StellarPhysics';

/**
 * BOLT: PlanetarySystem manages a collection of orbital bodies
 * utilizing InstancedMesh for performance and custom Shaders for visual variety.
 */

const PLANET_VS = `
attribute float planetType;
attribute float planetSeed;
attribute float biomass;
attribute float civilizationTier;
attribute float scorch;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vType;
varying float vSeed;
varying float vBiomass;
varying float vCivilizationTier;
varying float vScorch;
varying vec3 vLightDir;
varying vec3 vWorldPosition;

void main() {
    vUv = uv;
    vType = planetType;
    vSeed = planetSeed;
    vPosition = position;
    vBiomass = biomass;
    vCivilizationTier = civilizationTier;
    vScorch = scorch;
    
    // Transform normal and position for lighting
    vec4 worldPos = instanceMatrix * vec4(position, 1.0);
    vWorldPosition = (modelMatrix * worldPos).xyz;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vLightDir = normalize(-worldPos.xyz); // Light comes from star at local (0,0,0)
    
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
}
`;

const PLANET_FS = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vType;
varying float vSeed;
varying float vBiomass;
varying float vCivilizationTier;
// Per-instance scorch driven by Red Giant proximity: 0.0 = normal, 1.0 = fully incinerated
varying float vScorch;
varying vec3 vLightDir;
varying vec3 vWorldPosition;
uniform vec3 u_starPosition;
uniform float u_biomass;
uniform int u_kardashevTier;
uniform float uOpacity;

// Hash function for noise
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Simplex 3D Noise by Ashima Arts
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

void main() {
    vec3 color = vec3(0.0);
    float type = floor(vType + 0.5);
    vec3 p = vPosition * 2.5 + vSeed + uTime * 0.1;
    float n = snoise(p);

    if (type == 0.0) { // Rocky
        color = mix(vec3(0.4, 0.35, 0.3), vec3(0.6, 0.6, 0.6), n);
        color *= 1.0 - 0.2 * abs(snoise(p * 6.0)); // Crater-like noise
    } else if (type == 1.0) { // Gas Giant
        float bands = snoise(vec3(0.0, vPosition.y * 10.0, 0.0) + vSeed);
        color = mix(vec3(0.8, 0.5, 0.2), vec3(0.95, 0.9, 0.8), bands * 0.5 + 0.5);
        color = mix(color, vec3(0.7, 0.5, 0.4), snoise(p * 1.5) * 0.2);
    } else if (type == 2.0) { // Ice
        color = mix(vec3(0.75, 0.9, 1.0), vec3(1.0, 1.0, 1.0), n);
        float cracks = abs(snoise(p * 4.0));
        if (cracks > 0.75) color = mix(color, vec3(0.5, 0.75, 0.95), (cracks - 0.75) * 2.0);
    } else if (type == 3.0) { // Lava
        color = vec3(0.12, 0.08, 0.08);
        float lava = snoise(p * 2.5 + uTime * 0.2);
        if (lava > 0.4) color = mix(color, vec3(1.0, 0.35, 0.0), (lava - 0.4) * 4.0);
    } else if (type == 4.0) { // Ocean
        color = mix(vec3(0.0, 0.1, 0.5), vec3(0.0, 0.25, 0.65), n);
        float clouds = snoise(p * 2.0 + uTime * 0.5);
        color = mix(color, vec3(1.0, 1.0, 1.0), smoothstep(0.45, 0.75, clouds));
    } else if (type == 5.0) { // Desert
        color = mix(vec3(0.9, 0.5, 0.2), vec3(0.7, 0.3, 0.1), n);
        float dunes = snoise(vec3(vPosition.x * 18.0, vPosition.y * 2.0, vPosition.z * 18.0));
        color *= 0.88 + 0.12 * dunes;
    } else if (type == 6.0) { // Jungle
        color = mix(vec3(0.05, 0.35, 0.05), vec3(0.1, 0.55, 0.1), n);
        float water = snoise(p * 1.5);
        if (water < -0.2) color = vec3(0.0, 0.25, 0.5);
    }

    // Red Giant scorch: progressively override toward molten/incinerated surface
    if (vScorch > 0.0) {
        float lava = snoise(p * 2.5 + uTime * 0.15) * 0.5 + 0.5;
        // Phase 1 (0..0.5): surface reddening and drying
        // Phase 2 (0.5..1.0): full magma ocean with glowing cracks
        float earlyScorch = smoothstep(0.0, 0.5, vScorch);
        float lateScorch  = smoothstep(0.5, 1.0, vScorch);
        vec3 scorchedColor = mix(vec3(0.55, 0.18, 0.05), vec3(0.08, 0.03, 0.02), earlyScorch);
        // Glowing magma cracks appear at late scorch
        float crack = smoothstep(0.55, 0.75, lava);
        scorchedColor = mix(scorchedColor, mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.9, 0.3), crack), lateScorch * crack * 2.0);
        color = mix(color, scorchedColor, vScorch);
    }

    // Biomass overlay (suppressed by scorch)
    float biomassAlive = vBiomass * max(0.0, 1.0 - vScorch * 3.0);
    if (biomassAlive > 0.0 && type != 1.0 && type != 3.0) {
        color = mix(color, vec3(0.1, 0.6, 0.2), biomassAlive * 0.4 * n);
    }

    // Lighting
    float diff = max(dot(normalize(vNormal), vLightDir), 0.1);
    // During scorch, magma self-illuminates slightly
    float selfEmit = vScorch * snoise(p * 2.5 + uTime * 0.15) * 0.3;
    vec3 finalColor = color * max(diff, selfEmit);
    
    // Night side masking
    vec3 starDir = normalize(u_starPosition - vWorldPosition);
    float dayFactor = dot(normalize(vNormal), starDir);
    float nightMask = 1.0 - smoothstep(-0.1, 0.2, dayFactor);
    
    // City lights (Kardashev Type I+) — extinguished by scorch
    if (vCivilizationTier >= 1.0 && type != 1.0 && type != 3.0 && vScorch < 0.8) {
        float cityNoise = hash(floor(vUv * 80.0));
        float cityLights = step(0.85, cityNoise) * nightMask;
        float cityFade = max(0.0, 1.0 - vScorch * 1.25);
        finalColor += vec3(1.0, 0.85, 0.4) * cityLights * vBiomass * 2.0 * cityFade;
    }

    gl_FragColor = vec4(finalColor, uOpacity);
}
`;

interface ProceduralOrbit {
    semiMajorAxis_au: number;
    orbitalSpeed: number;
    phaseOffset: number;
    scale: number;
    type: number;
    seed: number;
}

function hashString(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0);
}

export class PlanetarySystem {
    private instancedMesh: THREE.InstancedMesh;
    public bodies: {
        scale: number;
        type: number;
        seed: number;
    }[] = [];
    public proceduralOrbits: ProceduralOrbit[] = [];
    
    private group: THREE.Group;
    public parent: THREE.Object3D;
    private material: THREE.ShaderMaterial;
    private biomassAttr: THREE.InstancedBufferAttribute;
    private civAttr: THREE.InstancedBufferAttribute;
    private scorchAttr: THREE.InstancedBufferAttribute;
    public renderer?: THREE.WebGLRenderer;

    constructor(star: THREE.Object3D, renderer?: THREE.WebGLRenderer) {
        this.parent = star;
        this.renderer = renderer;
        this.group = new THREE.Group();
        this.parent.add(this.group);

        // Maximum 50 bodies
        const numBodies = 50; 
        
        // BOLT: Clone shared geometry to allow per-system instanced attributes without stomping
        const geometry = GEOMETRIES.planet.clone();
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                u_starPosition: { value: new THREE.Vector3() },
                u_biomass: { value: 0.0 },
                u_kardashevTier: { value: 0 },
                uOpacity: { value: 1.0 }
            },
            transparent: true,
            vertexShader: PLANET_VS,
            fragmentShader: PLANET_FS
        });
        this.material.name = 'InstancedPlanetarySystemMaterial';
        this.material.customProgramCacheKey = () => 'planetary_system_material';

        this.instancedMesh = new THREE.InstancedMesh(geometry, this.material, numBodies);
        
        const types = new Float32Array(numBodies);
        const seeds = new Float32Array(numBodies);

        // Deterministic per-star procedural planetary generation
        const starMass = Math.max(0.08, (star as any).mass || 1.0);
        const physicsId = (star as any).physicsId || `${starMass}_${Math.random()}`;
        let rngState = hashString(physicsId);
        const nextRand = () => {
            rngState = (rngState * 1664525 + 1013904223) >>> 0;
            return rngState / 4294967296;
        };

        const countRoll = nextRand();
        let planetCount: number;
        if (starMass < 0.3) {
            planetCount = 2 + Math.floor(countRoll * 3);
        } else if (starMass > 8.0) {
            planetCount = 2 + Math.floor(countRoll * 3);
        } else {
            planetCount = 3 + Math.floor(countRoll * 4);
        }

        const lum = computeLuminosity(starMass);
        const r_in = Math.sqrt(Math.max(0.001, lum / 1.1));
        const r_out = Math.sqrt(Math.max(0.001, lum / 0.53));

        let currentA = Math.max(0.15, 0.35 * Math.sqrt(starMass)) * (0.85 + nextRand() * 0.3);
        for (let i = 0; i < numBodies; i++) {
            if (i < planetCount) {
                const a = currentA;
                currentA = currentA * (1.35 + nextRand() * 0.35);

                const omega = Math.sqrt((4.0 * Math.PI * Math.PI * starMass) / Math.max(0.001, a * a * a)) * 0.15;
                const phase = nextRand() * Math.PI * 2;
                const pSeed = nextRand() * 1000.0;

                let pType: number;
                if (a >= r_in * 0.85 && a <= r_out * 1.15) {
                    const habRoll = nextRand();
                    pType = habRoll > 0.6 ? 6 : (habRoll > 0.3 ? 4 : 0);
                } else if (a < r_in * 0.85) {
                    const hotRoll = nextRand();
                    pType = hotRoll > 0.5 ? 3 : (hotRoll > 0.2 ? 5 : 0);
                } else {
                    const coldRoll = nextRand();
                    pType = coldRoll > 0.5 ? 1 : 2;
                }

                const isGasGiant = pType === 1;
                const baseScale = 0.08 + nextRand() * 0.12;
                const pScale = isGasGiant ? baseScale * 2.2 : baseScale;

                this.proceduralOrbits.push({
                    semiMajorAxis_au: a,
                    orbitalSpeed: omega,
                    phaseOffset: phase,
                    scale: pScale,
                    type: pType,
                    seed: pSeed
                });

                types[i] = pType;
                seeds[i] = pSeed;
                this.bodies.push({
                    scale: pScale,
                    type: pType,
                    seed: pSeed
                });
            } else {
                types[i] = Math.floor(nextRand() * 7);
                seeds[i] = nextRand() * 1000.0;
                const isGasGiant = types[i] === 1;
                const baseScale = 0.08 + nextRand() * 0.12;
                this.bodies.push({
                    scale: isGasGiant ? baseScale * 2.2 : baseScale,
                    type: types[i],
                    seed: seeds[i]
                });
            }
        }
        
        // BOLT: Initialize count to 0 instead of looping hide matrices
        this.instancedMesh.count = 0;
        
        const biomassArray = new Float32Array(numBodies).fill(0);
        const civArray = new Float32Array(numBodies).fill(0);
        const scorchArray = new Float32Array(numBodies).fill(0);
        
        this.biomassAttr = new THREE.InstancedBufferAttribute(biomassArray, 1);
        this.civAttr = new THREE.InstancedBufferAttribute(civArray, 1);
        this.scorchAttr = new THREE.InstancedBufferAttribute(scorchArray, 1);

        geometry.setAttribute('planetType', new THREE.InstancedBufferAttribute(types, 1));
        geometry.setAttribute('planetSeed', new THREE.InstancedBufferAttribute(seeds, 1));
        geometry.setAttribute('biomass', this.biomassAttr);
        geometry.setAttribute('civilizationTier', this.civAttr);
        geometry.setAttribute('scorch', this.scorchAttr);
        
        this.group.add(this.instancedMesh);
        this.group.add(this.orbitLinesGroup);
    }
    
    public orbitLinesGroup: THREE.Group = new THREE.Group();
    private orbitLinesBuilt = false;
    private orbitLineMat: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({
        color: 0x3399ff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });

    /**
     * Update orbits: evaluates live nbodyBuffer if focused star; evaluates unique procedural Keplerian orbits otherwise.
     */
    update(delta: number, appTime: number, buffer?: Float32Array | null, lowDetail?: boolean, globalFade: number = 1.0, redGiantScale?: number): void {
        const star = this.parent as any;
        const isRedGiant = star.phase === PHASES.RED_GIANT;
        
        if ((star.phase !== PHASES.MAIN_SEQUENCE && !isRedGiant) || lowDetail) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;
        this.material.uniforms.uTime.value += delta;
        this.material.uniforms.uOpacity.value = globalFade;
        this.orbitLinesGroup.visible = !isRedGiant;
        
        this.parent.getWorldPosition(this.material.uniforms.u_starPosition.value);
        
        const matrixArray = this.instancedMesh.instanceMatrix.array;
        const scorchArray = this.scorchAttr.array as Float32Array;
        let scorchDirty = false;

        const isBufferDriven = buffer && buffer.length >= 7;
        const numBodies = isBufferDriven 
            ? Math.min(this.bodies.length, buffer!.length / 7) 
            : this.proceduralOrbits.length;

        // Construct orbit trajectory path lines once
        if (!this.orbitLinesBuilt && numBodies > 0) {
            this.orbitLinesBuilt = true;
            for (let i = 0; i < numBodies; i++) {
                const orbitScale = 12.0;
                let radius: number;
                if (isBufferDriven) {
                    const bx = buffer![i * 7 + 0] * orbitScale;
                    const bz = buffer![i * 7 + 2] * orbitScale;
                    radius = Math.sqrt(bx * bx + bz * bz);
                } else {
                    radius = this.proceduralOrbits[i].semiMajorAxis_au * orbitScale;
                }

                if (radius > 0.1) {
                    const segments = 64;
                    const points: THREE.Vector3[] = [];
                    for (let s = 0; s <= segments; s++) {
                        const theta = (s / segments) * Math.PI * 2;
                        points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
                    }
                    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMesh = new THREE.LineLoop(lineGeo, this.orbitLineMat);
                    this.orbitLinesGroup.add(lineMesh);
                }
            }
        }
        this.orbitLineMat.opacity = 0.35 * globalFade;

        for (let i = 0; i < numBodies; i++) {
            const offset = i * 16;
            let x: number, y: number, z: number, bScale: number, bSeed: number;

            if (isBufferDriven) {
                const b = this.bodies[i];
                bScale = b.scale;
                bSeed = b.seed;
                const orbitScale = 12.0;
                x = buffer![i * 7 + 0] * orbitScale;
                y = buffer![i * 7 + 1] * orbitScale;
                z = buffer![i * 7 + 2] * orbitScale;
            } else {
                const po = this.proceduralOrbits[i];
                bScale = po.scale;
                bSeed = po.seed;
                const theta = po.phaseOffset + appTime * po.orbitalSpeed;
                const r = po.semiMajorAxis_au * 12.0;
                x = Math.cos(theta) * r;
                y = 0.0;
                z = Math.sin(theta) * r;
            }

            // Per-planet scorch from Red Giant proximity
            let newScorch = 0.0;
            if (redGiantScale !== undefined && redGiantScale > 0) {
                const dist = Math.sqrt(x * x + y * y + z * z);
                const dmgRadius = redGiantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_DMG_RADIUS;
                const burnDenom = redGiantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_BURN_RADIUS;
                newScorch = dist < dmgRadius
                    ? Math.min(1.0, Math.max(0.0, 1.0 - (dist - redGiantScale) / Math.max(0.001, burnDenom)))
                    : 0.0;
            }

            if (scorchArray[i] !== newScorch) {
                scorchArray[i] = newScorch;
                scorchDirty = true;
            }

            // Column-major matrix construction (Translation * RotationY * Scale)
            const rotTheta = (x + y) * 0.01 + bSeed;
            const cos = Math.cos(rotTheta);
            const sin = Math.sin(rotTheta);
            const s = bScale * Math.max(0.01, 1.0 - newScorch * 0.8);
            const sc = s * cos;
            const ss = s * sin;

            // Column 0
            matrixArray[offset + 0] = sc;
            matrixArray[offset + 1] = 0;
            matrixArray[offset + 2] = -ss;
            matrixArray[offset + 3] = 0;

            // Column 1
            matrixArray[offset + 4] = 0;
            matrixArray[offset + 5] = s;
            matrixArray[offset + 6] = 0;
            matrixArray[offset + 7] = 0;
            
            // Column 2
            matrixArray[offset + 8] = ss;
            matrixArray[offset + 9] = 0;
            matrixArray[offset + 10] = sc;
            matrixArray[offset + 11] = 0;
            
            // Column 3 (Translation)
            matrixArray[offset + 12] = x;
            matrixArray[offset + 13] = y;
            matrixArray[offset + 14] = z;
            matrixArray[offset + 15] = 1;
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.count = numBodies;
        if (scorchDirty) {
            this.scorchAttr.needsUpdate = true;
        }
    }

    /**
     * Backward-compatible wrapper for updateFromBuffer.
     */
    updateFromBuffer(buffer: Float32Array, delta: number, lowDetail?: boolean, globalFade: number = 1.0, redGiantScale?: number): void {
        this.update(delta, this.material.uniforms.uTime.value, buffer, lowDetail, globalFade, redGiantScale);
    }

    /**
     * GPU cleanup.
     */
    dispose() {
        this.material.dispose();
        // BOLT: Cloned geometry must be disposed to avoid memory leaks
        this.instancedMesh.geometry.dispose();

        for (const child of this.orbitLinesGroup.children) {
            if (child instanceof THREE.LineLoop && child.geometry) {
                child.geometry.dispose();
            }
        }
        this.orbitLineMat.dispose();
        this.orbitLinesGroup.clear();

        if (this.parent) {
            this.parent.remove(this.group);
        }
    }

    /**
     * Updates biosphere shaders based on AstrobiologyEngine output.
     */
    updateAstrobiology(astrobiologyStates: any[]): void {
        const biomassArray = this.biomassAttr.array as Float32Array;
        const civArray = this.civAttr.array as Float32Array;
        
        let maxBiomass = 0;
        let maxCiv = 0;

        const count = Math.min(astrobiologyStates.length, biomassArray.length);
        for (let i = 0; i < count; i++) {
            const state = astrobiologyStates[i];
            const biomass = state.biomass || 0.0;
            const civ = state.civilizationTier || 0.0;

            // BOLT: Direct typed array manipulation to eliminate setX() method call overhead
            biomassArray[i] = biomass;
            civArray[i] = civ;
            
            if (biomass > maxBiomass) maxBiomass = biomass;
            if (civ > maxCiv) maxCiv = civ;
        }

        // Clear tail when astrobiology state count shrinks
        for (let i = count; i < biomassArray.length; i++) {
            biomassArray[i] = 0.0;
            civArray[i] = 0.0;
        }

        this.material.uniforms.u_biomass.value = maxBiomass;
        this.material.uniforms.u_kardashevTier.value = maxCiv;

        this.biomassAttr.needsUpdate = true;
        this.civAttr.needsUpdate = true;
    }
}

export class PlanetarySystemQueue {
    private static pendingCreations: { star: any; renderer?: THREE.WebGLRenderer }[] = [];
    private static pendingDisposals: PlanetarySystem[] = [];
    private static BUDGET_PER_FRAME = 2; // Process at most 2 creations/disposals per frame

    public static enqueueCreation(star: any, renderer?: THREE.WebGLRenderer) {
        // Prevent duplicate queueing
        if (!this.pendingCreations.some(item => item.star === star)) {
            this.pendingCreations.push({ star, renderer });
        }
    }

    public static cancelCreation(star: any) {
        this.pendingCreations = this.pendingCreations.filter(item => item.star !== star);
    }

    public static enqueueDisposal(planetarySystem: PlanetarySystem) {
        // Prevent duplicate queueing
        if (!this.pendingDisposals.includes(planetarySystem)) {
            this.pendingDisposals.push(planetarySystem);
        }
    }

    public static process(renderer?: THREE.WebGLRenderer) {
        // 1. Process disposals first to free up WebGL memory
        let processedDisposals = 0;
        while (this.pendingDisposals.length > 0 && processedDisposals < this.BUDGET_PER_FRAME) {
            const system = this.pendingDisposals.shift();
            if (system) {
                system.dispose();
                processedDisposals++;
            }
        }

        // 2. Process creations
        let processedCreations = 0;
        const remainingBudget = this.BUDGET_PER_FRAME - processedDisposals;
        while (this.pendingCreations.length > 0 && processedCreations < remainingBudget) {
            const item = this.pendingCreations.shift();
            if (item) {
                const { star, renderer: itemRenderer } = item;
                // Double check the star is still in MAIN_SEQUENCE phase
                if (star.phase === PHASES.MAIN_SEQUENCE) {
                    star.planetarySystem = new PlanetarySystem(star, renderer ?? itemRenderer);
                }
                processedCreations++;
            }
        }
    }
}
