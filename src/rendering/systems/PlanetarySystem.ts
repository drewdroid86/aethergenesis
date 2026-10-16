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
    // Local-space light dir; consistent with world-space vNormal only because
    // no ancestor rotates (uniform scale + translation preserve directions).
    vLightDir = normalize(-worldPos.xyz); // Light comes from star at local (0,0,0)
    
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
}
`;

const PLANET_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

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
uniform float uLowDetail;

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

// 3-octave FBM for rich planetary continents, mountain chains, and cloud decks
float pFbm(vec3 p) {
    return snoise(p) * 0.55 + snoise(p * 2.15 + vec3(17.3, -9.1, 13.7)) * 0.30 + snoise(p * 4.5 + vec3(-11.2, 23.4, -7.8)) * 0.15;
}

void main() {
    vec3 color = vec3(0.0);
    float type = floor(vType + 0.5);
    vec3 p = vPosition * 2.5 + vSeed + uTime * 0.06;
    float n = pFbm(p);
    float detailN = snoise(p * 5.5);

    float bumpAmp = 0.12;
    float specStrength = 0.0;
    float specPower = 36.0;
    vec3 atmoColor = vec3(0.35, 0.65, 1.0);
    float atmoStrength = 0.45;
    float lavaGlow = 0.0;

    if (type == 0.0) { // Rocky (Lunar / Mercury / Mars-like highland & mare basins)
        float mare = smoothstep(-0.25, 0.25, n);
        vec3 highlandCol = mix(vec3(0.48, 0.41, 0.35), vec3(0.68, 0.63, 0.58), smoothstep(0.0, 0.7, n));
        vec3 mareCol = vec3(0.24, 0.21, 0.19);
        color = mix(mareCol, highlandCol, mare);
        // Multi-scale crater rings and ejecta rays
        float craters = abs(snoise(p * 5.0)) * 0.65 + abs(snoise(p * 11.0)) * 0.35;
        color *= 0.80 + 0.28 * craters;
        bumpAmp = 0.22;
        atmoColor = vec3(0.75, 0.62, 0.48);
        atmoStrength = 0.22;
    } else if (type == 1.0) { // Gas Giant (Jovian / Saturnian banded zonal jets & storm ovals)
        float warp = pFbm(vPosition * 3.2 + vSeed * 0.5 + vec3(uTime * 0.08, 0.0, 0.0));
        float lat = vPosition.y * 11.0 + warp * 1.65;
        float jetBands = sin(lat) * 0.5 + 0.5;
        float fineBelts = sin(lat * 2.7 + warp * 2.2) * 0.5 + 0.5;
        vec3 zoneCol = vec3(0.96, 0.90, 0.78);
        vec3 beltCol = vec3(0.76, 0.44, 0.20);
        vec3 deepBeltCol = vec3(0.52, 0.26, 0.14);
        color = mix(beltCol, zoneCol, smoothstep(0.2, 0.8, jetBands));
        color = mix(color, deepBeltCol, smoothstep(0.65, 0.95, fineBelts) * 0.55);
        // Anticyclonic storm vortex (Great Red Spot analog)
        vec3 stormCenter = normalize(vec3(cos(vSeed), -0.28, sin(vSeed)));
        float stormDist = length(normalize(vPosition) - stormCenter);
        float stormMask = 1.0 - smoothstep(0.10, 0.24, stormDist);
        float stormSwirl = sin(stormDist * 45.0 - uTime * 1.5 + warp * 4.0) * 0.5 + 0.5;
        color = mix(color, mix(vec3(0.88, 0.26, 0.10), vec3(1.0, 0.68, 0.45), stormSwirl * 0.5), stormMask * 0.85);
        bumpAmp = 0.06;
        atmoColor = vec3(0.95, 0.78, 0.50);
        atmoStrength = 0.50;
    } else if (type == 2.0) { // Ice (Europa / Enceladus subsurface ocean & tectonic linea)
        color = mix(vec3(0.65, 0.85, 0.98), vec3(0.96, 0.99, 1.0), smoothstep(-0.3, 0.5, n));
        float linea1 = 1.0 - smoothstep(0.0, 0.14, abs(snoise(p * 3.8)));
        float linea2 = 1.0 - smoothstep(0.0, 0.10, abs(snoise(p * 7.5 + 4.2)));
        float cracks = clamp(linea1 + linea2 * 0.6, 0.0, 1.0);
        color = mix(color, vec3(0.28, 0.58, 0.82), cracks * 0.75);
        bumpAmp = 0.16;
        specStrength = 0.65;
        specPower = 56.0;
        atmoColor = vec3(0.55, 0.88, 1.0);
        atmoStrength = 0.52;
    } else if (type == 3.0) { // Lava (Tidal-flexed molten magma world)
        vec3 crustCol = mix(vec3(0.09, 0.06, 0.06), vec3(0.18, 0.12, 0.10), smoothstep(-0.3, 0.4, detailN));
        float fissure = pFbm(p * 2.2 + uTime * 0.15);
        float magmaMask = smoothstep(0.12, 0.48, fissure);
        float coreHot = smoothstep(0.35, 0.65, fissure);
        vec3 magmaCol = mix(vec3(0.95, 0.22, 0.0), vec3(1.0, 0.92, 0.35), coreHot);
        color = mix(crustCol, magmaCol, magmaMask);
        lavaGlow = magmaMask * (0.65 + 0.35 * coreHot);
        bumpAmp = 0.18 * (1.0 - magmaMask);
        atmoColor = vec3(1.0, 0.38, 0.08);
        atmoStrength = 0.55;
    } else if (type == 4.0) { // Ocean / Earth-like (Bathymetry, continents, polar caps & clouds)
        float elev = n + detailN * 0.18;
        bool isLand = elev > 0.18;
        if (!isLand) {
            float shelf = smoothstep(-0.25, 0.18, elev);
            color = mix(vec3(0.01, 0.08, 0.32), vec3(0.04, 0.36, 0.62), shelf);
            specStrength = 0.85;
            specPower = 48.0;
            bumpAmp = 0.03;
        } else {
            float landH = clamp((elev - 0.18) / 0.6, 0.0, 1.0);
            vec3 lowland = vec3(0.16, 0.42, 0.14);
            vec3 highland = vec3(0.48, 0.40, 0.28);
            vec3 snowPeak = vec3(0.95, 0.97, 1.0);
            color = mix(lowland, highland, smoothstep(0.0, 0.55, landH));
            color = mix(color, snowPeak, smoothstep(0.60, 0.92, landH));
            bumpAmp = 0.18;
        }
        // Polar ice caps
        float polar = smoothstep(0.68, 0.86, abs(vPosition.y) + n * 0.12);
        color = mix(color, vec3(0.94, 0.98, 1.0), polar);
        // Swirling cyclonic cloud deck
        vec3 cloudPos = vPosition * 3.0 + vSeed * 0.3 + vec3(uTime * 0.12, uTime * 0.04, 0.0);
        float clouds = pFbm(cloudPos + vec3(snoise(cloudPos * 1.5) * 0.4));
        float cloudAlpha = smoothstep(0.15, 0.62, clouds);
        color = mix(color, vec3(0.98, 0.99, 1.0), cloudAlpha * 0.78);
        specStrength *= (1.0 - cloudAlpha * 0.85);
        atmoColor = vec3(0.28, 0.65, 1.0);
        atmoStrength = 0.68;
    } else if (type == 5.0) { // Desert (Arid dune seas & iron-oxide canyons)
        float dunes = sin(vPosition.x * 22.0 + vPosition.z * 18.0 + n * 6.0) * 0.5 + 0.5;
        vec3 sandLight = vec3(0.92, 0.58, 0.28);
        vec3 sandDark  = vec3(0.64, 0.28, 0.10);
        vec3 canyonRock = vec3(0.38, 0.16, 0.07);
        color = mix(sandDark, sandLight, smoothstep(-0.3, 0.45, n));
        color = mix(color, canyonRock, smoothstep(0.35, 0.65, abs(detailN)) * 0.5);
        color *= 0.88 + 0.14 * dunes;
        bumpAmp = 0.18;
        atmoColor = vec3(0.95, 0.62, 0.32);
        atmoStrength = 0.48;
    } else if (type == 6.0) { // Jungle / Super-Earth (Lush archipelago & emerald canopy)
        float water = n + detailN * 0.15;
        if (water < -0.12) {
            float reef = smoothstep(-0.42, -0.12, water);
            color = mix(vec3(0.01, 0.14, 0.38), vec3(0.05, 0.52, 0.58), reef);
            specStrength = 0.80;
            specPower = 44.0;
            bumpAmp = 0.03;
        } else {
            vec3 deepForest = vec3(0.04, 0.30, 0.08);
            vec3 brightCanopy = vec3(0.16, 0.58, 0.14);
            color = mix(deepForest, brightCanopy, smoothstep(-0.12, 0.45, water));
            bumpAmp = 0.15;
        }
        float clouds = pFbm(vPosition * 3.2 + vSeed * 0.4 + uTime * 0.10);
        float cloudAlpha = smoothstep(0.22, 0.68, clouds);
        color = mix(color, vec3(0.95, 0.99, 0.97), cloudAlpha * 0.55);
        specStrength *= (1.0 - cloudAlpha * 0.8);
        atmoColor = vec3(0.22, 0.82, 0.68);
        atmoStrength = 0.62;
    }

    // Red Giant scorch: progressively override toward molten/incinerated surface
    if (vScorch > 0.0) {
        float lava = snoise(p * 2.5 + uTime * 0.15) * 0.5 + 0.5;
        // Phase 1 (0..0.5): surface reddening and drying
        // Phase 2 (0.5..1.0): full magma ocean with glowing cracks
        float earlyScorch = smoothstep(0.0, 0.5, vScorch);
        float lateScorch  = smoothstep(0.5, 1.0, vScorch);
        vec3 scorchedColor = mix(vec3(0.55, 0.18, 0.05), vec3(0.08, 0.03, 0.02), earlyScorch);
        // Glowing magma cracks appear at late scorch (mix factor clamped:
        // lateScorch * crack * 2.0 reaches 2.0 and mix() extrapolates past
        // the hot color into HDR blowout without the clamp).
        float crack = smoothstep(0.55, 0.75, lava);
        scorchedColor = mix(scorchedColor, mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.9, 0.3), crack), min(lateScorch * crack * 2.0, 1.0));
        color = mix(color, scorchedColor, vScorch);
        specStrength *= (1.0 - vScorch);
        atmoColor = mix(atmoColor, vec3(1.0, 0.35, 0.05), vScorch);
    }

    // Biomass overlay (suppressed by scorch)
    float biomassAlive = vBiomass * max(0.0, 1.0 - vScorch * 3.0);
    if (biomassAlive > 0.0 && type != 1.0 && type != 3.0) {
        color = mix(color, vec3(0.1, 0.6, 0.2), biomassAlive * 0.4 * clamp(n * 0.5 + 0.5, 0.0, 1.0));
    }

    // Procedural 3D relief normal perturbation (finite-difference tangent gradient, skipped in low-detail mode)
    vec3 N_smooth = normalize(vNormal);
    vec3 N = N_smooth;
    if (uLowDetail < 0.5) {
        float hx = snoise(p * 3.0 + vec3(0.06, 0.0, 0.0));
        float hy = snoise(p * 3.0 + vec3(0.0, 0.06, 0.0));
        float hz = snoise(p * 3.0 + vec3(0.0, 0.0, 0.06));
        vec3 gradH = vec3(hx - detailN, hy - detailN, hz - detailN);
        gradH -= N_smooth * dot(gradH, N_smooth);
        N = normalize(N_smooth - gradH * bumpAmp);
    }

    // Star direction and view direction for physically-inspired illumination
    vec3 starDir = normalize(u_starPosition - vWorldPosition);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float dayFactor = dot(N_smooth, starDir);
    float bumpedDiff = max(dot(N, starDir), 0.0);
    // Smooth terminator wrap for atmospheric worlds + ambient starlight floor
    float diff = max(mix(max(dayFactor, 0.0), bumpedDiff, 0.75), 0.06);

    // During scorch or on Lava worlds, incandescent magma self-illuminates on the nightside
    float selfEmit = max(lavaGlow, vScorch * (snoise(p * 2.5 + uTime * 0.15) * 0.3 + 0.25));
    vec3 finalColor = color * max(diff, selfEmit);

    // Blinn-Phong solar sunglint on liquid oceans and glacial ice sheets
    if (specStrength > 0.01 && dayFactor > 0.0) {
        vec3 halfVec = normalize(starDir + viewDir);
        float spec = pow(max(dot(N, halfVec), 0.0), specPower) * specStrength * smoothstep(0.0, 0.25, dayFactor);
        finalColor += vec3(1.0, 0.96, 0.88) * spec * 0.65;
    }

    // Rayleigh atmospheric Fresnel rim scattering + warm sunset terminator twilight
    float fresnel = pow(1.0 - max(dot(N_smooth, viewDir), 0.0), 2.8);
    float dayAtmo = smoothstep(-0.28, 0.45, dayFactor);
    float twilight = smoothstep(-0.24, 0.04, dayFactor) * (1.0 - smoothstep(0.04, 0.32, dayFactor));
    vec3 twilightCol = vec3(1.0, 0.42, 0.12);
    vec3 rimLight = mix(atmoColor, twilightCol, twilight * 0.65) * fresnel * dayAtmo * atmoStrength;
    finalColor += rimLight;
    
    // Night side masking
    float nightMask = 1.0 - smoothstep(-0.1, 0.2, dayFactor);
    
    // City lights (Kardashev Type I+) — extinguished by scorch
    if (vCivilizationTier >= 1.0 && type != 1.0 && type != 3.0 && vScorch < 0.8) {
        float cityNoise = hash(floor(vUv * 80.0));
        float cityFade = max(0.0, 1.0 - vScorch * 1.25);
        
        vec3 lightColor = vec3(1.0, 0.85, 0.4); // Type I: Warm golden yellow/orange
        float cityLights = step(0.85, cityNoise) * nightMask;
        
        if (vCivilizationTier >= 2.0) {
            lightColor = vec3(0.2, 0.8, 1.0); // Type II+: High-energy cyan grid
            cityLights = step(0.65, cityNoise) * nightMask; // denser urban clusters
            
            // Glowing planetary energy distribution network for Type II+
            float network = snoise(p * 20.0);
            if (network > 0.6) {
                finalColor += lightColor * (network - 0.6) * 5.0 * nightMask * cityFade;
            }
        }
        
        finalColor += lightColor * cityLights * vBiomass * 2.0 * cityFade;
    }

    gl_FragColor = vec4(finalColor, uOpacity);
}
`;

const PLANET_RING_VS = `
attribute float planetSeed;
attribute float scorch;
varying vec3 vLocalPos;
varying vec3 vWorldPosition;
varying float vSeed;
varying float vScorch;
varying vec3 vPlanetCenterWorld;
varying float vRingScale;

void main() {
    vLocalPos = position;
    vSeed = planetSeed;
    vScorch = scorch;
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vPlanetCenterWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vRingScale = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const PLANET_RING_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vLocalPos;
varying vec3 vWorldPosition;
varying float vSeed;
varying float vScorch;
varying vec3 vPlanetCenterWorld;
varying float vRingScale;
uniform vec3 u_starPosition;
uniform float uOpacity;

void main() {
    if (vRingScale < 0.001) discard;
    float dist = length(vLocalPos.xz);
    // Normalized radial coordinate across ring (1.38 .. 2.45)
    float r = clamp((dist - 1.38) / (2.45 - 1.38), 0.0, 1.0);

    // Concentric ringlets + Cassini & Encke division gaps
    float ringlets = sin(r * 68.0 + vSeed) * 0.35 + sin(r * 150.0 - vSeed * 2.0) * 0.20 + 0.55;
    float cassiniGap = 1.0 - (smoothstep(0.46, 0.50, r) * (1.0 - smoothstep(0.54, 0.58, r)) * 0.88);
    float enckeGap = 1.0 - (smoothstep(0.80, 0.82, r) * (1.0 - smoothstep(0.83, 0.85, r)) * 0.70);
    float edgeFade = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.88, 1.0, r));

    vec3 innerRingCol = vec3(0.92, 0.82, 0.66);
    vec3 outerRingCol = vec3(0.74, 0.82, 0.90);
    vec3 ringCol = mix(innerRingCol, outerRingCol, smoothstep(0.15, 0.85, r));
    ringCol = mix(ringCol, vec3(0.45, 0.15, 0.05), vScorch);

    // Cylindrical planetary shadow cast across the back of the ring
    vec3 toStar = normalize(u_starPosition - vPlanetCenterWorld);
    vec3 fragOffset = vWorldPosition - vPlanetCenterWorld;
    float alongStar = dot(fragOffset, toStar);
    float perpDist = length(fragOffset - toStar * alongStar);
    float shadow = 1.0;
    if (alongStar < 0.0) {
        shadow = smoothstep(vRingScale * 0.88, vRingScale * 1.05, perpDist);
    }

    float density = clamp(ringlets * cassiniGap * enckeGap * edgeFade, 0.0, 1.0);
    vec3 finalCol = ringCol * (0.18 + 0.82 * shadow);
    float alpha = density * 0.68 * (1.0 - vScorch * 0.85) * uOpacity;
    gl_FragColor = vec4(finalCol, alpha);
}
`;

interface ProceduralOrbit {
    semiMajorAxis_au: number;
    baseOmega: number;
    phaseOffset: number;
    scale: number;
    type: number;
    seed: number;
}

/**
 * One worker roster row: stable body id + physics type, in worker buffer order.
 * The worker emits the full roster on every roster change (INIT / ADD_BODY /
 * RESET_BODIES, and any future remove/merge).
 */
export interface BodyRosterEntry {
    id: string;
    type: string;
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
    private ringInstancedMesh: THREE.InstancedMesh;
    private ringMaterial: THREE.ShaderMaterial;
    public bodies: {
        scale: number;
        type: number;
        seed: number;
    }[] = [];
    public proceduralOrbits: ProceduralOrbit[] = [];

    /**
     * Keplerian rate scale (sim-years advanced per real second). Default 0.005 → ~3.3 min/orbit for Earth-analog.
     * Note: 30× slower than CometSystem (0.15 yr/s) — intentional visual design so planetary orbits
     * remain smooth and trackable, while showcase comets sweep at an accelerated rate.
     */
    public orbitSpeedScale: number = 0.005;
    
    private group: THREE.Group;
    public parent: THREE.Object3D;
    private material: THREE.ShaderMaterial;
    private biomassAttr: THREE.InstancedBufferAttribute;
    private civAttr: THREE.InstancedBufferAttribute;
    private scorchAttr: THREE.InstancedBufferAttribute;
    public renderer?: THREE.WebGLRenderer;

    // ─── Stable-id roster sync (Phase B) ────────────────────────────────────
    // UPDATE buffer rows are resolved through the worker's roster, never by
    // bare array index: each body id owns a stable instance slot, so
    // add/remove/merge roster changes cannot shift visuals onto the wrong
    // body. Visuals bind to ids (visualsById) — a first-seen id keeps its
    // look across reorders and resets.
    private rosterIds: string[] = [];
    private slotById = new Map<string, number>();
    private visualsById = new Map<string, { scale: number; type: number; seed: number }>();
    /** Last roster version applied; the engine re-applies when its version moves. */
    public rosterVersion = -1;
    private typeAttr!: THREE.InstancedBufferAttribute;
    private seedAttr!: THREE.InstancedBufferAttribute;

    /**
     * Reconcile instance slots with a fresh worker roster. Add-only today;
     * designed for retire+introduce — a future MERGE retires ids here (their
     * slots are freed) and introduces the merged body's id as a new slot.
     */
    public applyRoster(roster: BodyRosterEntry[], version: number): void {
        this.rosterVersion = version;
        this.rosterIds = roster.map((r) => r.id);
        // Compact slots in roster order: every per-instance attribute stays
        // aligned with the buffer/astrobiology row order, while VISUALS bind
        // to ids — a first-seen id keeps its look across reorders and resets.
        this.slotById.clear();
        const seen = new Set<string>();
        let slot = 0;
        for (let i = 0; i < roster.length; i++) {
            const entry = roster[i];
            if (seen.has(entry.id)) continue; // first wins on duplicate ids
            seen.add(entry.id);
            if (slot >= this.bodies.length) break; // instanced capacity guard
            let visuals = this.visualsById.get(entry.id);
            if (!visuals) {
                // Only inherit procedural visuals when entry.id matches the
                // preset pattern ('preset_body_' + i within proceduralOrbits);
                // all spawned/catalog bodies use deterministic hash-derived
                // visuals (never a random gas giant).
                const isPresetSlot = entry.id === `preset_body_${i}` && i < this.proceduralOrbits.length;
                const presetOrbit = isPresetSlot ? this.proceduralOrbits[i] : undefined;
                if (presetOrbit) {
                    visuals = { scale: presetOrbit.scale, type: presetOrbit.type, seed: presetOrbit.seed };
                } else {
                    const h = hashString(entry.id);
                    visuals = {
                        scale: 0.08 + (((h >>> 8) % 1000) / 1000) * 0.12,
                        type: 0,
                        seed: (h % 100000) / 100,
                    };
                }
                // TODO(spawn-phase): roster entries with type 'star' /
                // 'black_hole' participate in worker gravity today but
                // render with the default planet visual above. The rich
                // hookup (HeroStarSystem / RemnantPhase bridging) lands
                // in a later build — do not half-build it here.
                this.visualsById.set(entry.id, visuals);
                // Bound the cache: retired ids stay restorable, but a
                // spawn-spam session must not grow it without limit.
                if (this.visualsById.size > 512) {
                    const oldest = this.visualsById.keys().next();
                    if (!oldest.done) this.visualsById.delete(oldest.value);
                }
            }
            this.slotById.set(entry.id, slot);
            if (this.typeAttr && this.seedAttr) {
                (this.typeAttr.array as Float32Array)[slot] = visuals.type;
                (this.seedAttr.array as Float32Array)[slot] = visuals.seed;
            }
            slot++;
        }
        if (this.typeAttr && this.seedAttr) {
            this.typeAttr.needsUpdate = true;
            this.seedAttr.needsUpdate = true;
        }
        // Retired ids vanish from slotById via the clear() above and their
        // slots compact away; their cached visuals restore the look if an id
        // ever returns. Orbit rings depend on the roster rows — rebuild them.
        this.clearOrbitLines();
    }

    /** Resolve a roster id to its stable instance slot (undefined if unknown). */
    public slotForBodyId(id: string): number | undefined {
        return this.slotById.get(id);
    }

    private clearOrbitLines(): void {
        for (const child of this.orbitLinesGroup.children) {
            if (child instanceof THREE.LineLoop && child.geometry) {
                child.geometry.dispose();
            }
        }
        this.orbitLinesGroup.clear();
        this.orbitLinesBuilt = false;
        this.orbitBuiltBodyCount = -1;
    }

    /**
     * H-N2: optional literature semi-major axes (AU). When present and
     * non-empty, planet slots use these real distances instead of the RNG
     * progression — every other orbital element (period, phase, type, scale)
     * is built exactly the way the procedural path builds it.
     */
    constructor(star: THREE.Object3D, renderer?: THREE.WebGLRenderer, literatureDistances_au?: number[]) {
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
                uOpacity: { value: 1.0 },
                uLowDetail: { value: 0.0 }
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

        // H-N2: literature distances replace the RNG progression (and the
        // RNG planet-count roll) when the caller supplies real catalog data.
        const literatureA = (literatureDistances_au ?? [])
            .filter((d) => typeof d === 'number' && Number.isFinite(d) && d > 0)
            .slice(0, numBodies);
        const useLiterature = literatureA.length > 0;

        const countRoll = nextRand();
        let planetCount: number;
        if (useLiterature) {
            planetCount = literatureA.length;
        } else if (starMass < 0.3) {
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
                // H-N2: real catalog distance; RNG progression untouched otherwise.
                const a = useLiterature ? literatureA[i] : currentA;
                currentA = currentA * (1.35 + nextRand() * 0.35);

                const baseOmega = Math.sqrt((4.0 * Math.PI * Math.PI * starMass) / Math.max(0.001, a * a * a));
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
                    baseOmega,
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

        // Stored as fields: buffer-driven (roster) frames rewrite the slots
        // they use every frame so id-bound visuals survive reorders.
        this.typeAttr = new THREE.InstancedBufferAttribute(types, 1);
        this.seedAttr = new THREE.InstancedBufferAttribute(seeds, 1);
        geometry.setAttribute('planetType', this.typeAttr);
        geometry.setAttribute('planetSeed', this.seedAttr);
        geometry.setAttribute('biomass', this.biomassAttr);
        geometry.setAttribute('civilizationTier', this.civAttr);
        geometry.setAttribute('scorch', this.scorchAttr);

        const ringGeometry = GEOMETRIES.planetRing.clone();
        ringGeometry.setAttribute('planetSeed', this.seedAttr);
        ringGeometry.setAttribute('scorch', this.scorchAttr);
        this.ringMaterial = new THREE.ShaderMaterial({
            uniforms: {
                u_starPosition: this.material.uniforms.u_starPosition,
                uOpacity: this.material.uniforms.uOpacity
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            vertexShader: PLANET_RING_VS,
            fragmentShader: PLANET_RING_FS
        });
        this.ringMaterial.name = 'InstancedPlanetaryRingMaterial';
        this.ringMaterial.customProgramCacheKey = () => 'planetary_ring_material';
        this.ringInstancedMesh = new THREE.InstancedMesh(ringGeometry, this.ringMaterial, numBodies);
        this.ringInstancedMesh.count = 0;
        
        this.group.add(this.instancedMesh);
        this.group.add(this.ringInstancedMesh);
        this.group.add(this.orbitLinesGroup);
    }
    
    public orbitLinesGroup: THREE.Group = new THREE.Group();
    private orbitLinesBuilt = false;
    /**
     * M3: body count the rings were last baked for. The worker roster is
     * re-keyed per star (and INITs empty), so the live body count changes
     * across selections — rings rebuild whenever it does, not just once.
     * (Roster swaps additionally reset via applyRoster → clearOrbitLines.)
     */
    private orbitBuiltBodyCount: number = -1;
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
        this.material.uniforms.uLowDetail.value = lowDetail ? 1.0 : 0.0;
        this.orbitLinesGroup.visible = !isRedGiant;
        
        this.parent.getWorldPosition(this.material.uniforms.u_starPosition.value);
        
        const matrixArray = this.instancedMesh.instanceMatrix.array;
        const ringMatrixArray = this.ringInstancedMesh.instanceMatrix.array;
        const scorchArray = this.scorchAttr.array as Float32Array;
        const typeArray = this.typeAttr.array as Float32Array;
        const seedArray = this.seedAttr.array as Float32Array;
        let scorchDirty = false;
        let visualsDirty = false;

        const isBufferDriven = buffer && buffer.length >= 7;
        const numBodies = isBufferDriven
            ? Math.min(this.bodies.length, Math.floor(buffer!.length / 7))
            : this.proceduralOrbits.length;

        // Construct orbit trajectory path lines once per body generation —
        // rebuild whenever the live body count changes (INIT empty roster,
        // per-star re-key), so the rings always reflect the current roster.
        if ((!this.orbitLinesBuilt || numBodies !== this.orbitBuiltBodyCount) && numBodies > 0) {
            this.clearOrbitLines();
            this.orbitLinesBuilt = true;
            this.orbitBuiltBodyCount = numBodies;
            for (let i = 0; i < numBodies; i++) {
                const orbitScale = 12.0;
                let radius: number;
                if (isBufferDriven) {
                    // Worker emits ecliptic X-Y plane; renderer draws orbit rings in X-Z plane.
                    const bx = buffer![i * 7 + 0] * orbitScale;
                    const by = buffer![i * 7 + 1] * orbitScale;
                    radius = Math.sqrt(bx * bx + by * by);
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
            // Resolve the stable instance slot through the roster: buffer row
            // i belongs to rosterIds[i]; its visuals live under that id.
            // Falls back to bare index when no roster has arrived yet.
            let slot = i;
            let idVisuals: { scale: number; type: number; seed: number } | undefined;
            if (isBufferDriven) {
                const rowId = this.rosterIds[i];
                if (rowId !== undefined) {
                    const mapped = this.slotById.get(rowId);
                    if (mapped !== undefined) slot = mapped;
                    idVisuals = this.visualsById.get(rowId);
                }
            }
            const offset = slot * 16;
            let x: number, y: number, z: number, bScale: number, bSeed: number, bType: number;

            if (isBufferDriven) {
                if (idVisuals) {
                    bScale = idVisuals.scale;
                    bSeed = idVisuals.seed;
                    bType = idVisuals.type;
                } else {
                    const b = this.bodies[i];
                    bScale = b.scale;
                    bSeed = b.seed;
                    bType = b.type;
                }
                const orbitScale = 12.0;
                // Remap worker ecliptic X-Y plane to renderer X-Z plane (y=0).
                x = buffer![i * 7 + 0] * orbitScale;
                y = buffer![i * 7 + 2] * orbitScale;
                z = buffer![i * 7 + 1] * orbitScale;
                // Id-bound visuals survive reorders: rewrite this frame's
                // slot attributes (a reordered roster reuses slots).
                if (typeArray[slot] !== bType) {
                    typeArray[slot] = bType;
                    visualsDirty = true;
                }
                if (seedArray[slot] !== bSeed) {
                    seedArray[slot] = bSeed;
                    visualsDirty = true;
                }
            } else {
                const po = this.proceduralOrbits[i];
                bScale = po.scale;
                bSeed = po.seed;
                bType = po.type;
                const theta = po.phaseOffset + appTime * po.baseOmega * this.orbitSpeedScale;
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

            if (scorchArray[slot] !== newScorch) {
                scorchArray[slot] = newScorch;
                scorchDirty = true;
            }

            // T * Ry * S, column-major, allocation-free — do NOT "simplify" to compose().
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

            // Planetary ring matrix (Gas Giants + ~33% of Ice Worlds)
            const hasRing = bType === 1 || (bType === 2 && (Math.floor(bSeed * 10.0) % 3 === 0));
            const rs = hasRing ? s : 0.0;
            const tiltX = 0.32 + Math.sin(bSeed * 1.7) * 0.18;
            const tiltZ = Math.cos(bSeed * 2.3) * 0.22;
            const cx = Math.cos(tiltX);
            const sx = Math.sin(tiltX);
            const cz = Math.cos(tiltZ);
            const sz = Math.sin(tiltZ);

            ringMatrixArray[offset + 0] = rs * cz;
            ringMatrixArray[offset + 1] = rs * cx * sz;
            ringMatrixArray[offset + 2] = rs * sx * sz;
            ringMatrixArray[offset + 3] = 0;

            ringMatrixArray[offset + 4] = -rs * sz;
            ringMatrixArray[offset + 5] = rs * cx * cz;
            ringMatrixArray[offset + 6] = rs * sx * cz;
            ringMatrixArray[offset + 7] = 0;

            ringMatrixArray[offset + 8] = 0;
            ringMatrixArray[offset + 9] = -rs * sx;
            ringMatrixArray[offset + 10] = rs * cx;
            ringMatrixArray[offset + 11] = 0;

            ringMatrixArray[offset + 12] = x;
            ringMatrixArray[offset + 13] = y;
            ringMatrixArray[offset + 14] = z;
            ringMatrixArray[offset + 15] = 1;
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.count = numBodies;
        this.ringInstancedMesh.instanceMatrix.needsUpdate = true;
        this.ringInstancedMesh.count = numBodies;
        if (scorchDirty) {
            this.scorchAttr.needsUpdate = true;
        }
        if (visualsDirty) {
            this.typeAttr.needsUpdate = true;
            this.seedAttr.needsUpdate = true;
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
        this.ringMaterial.dispose();
        this.ringInstancedMesh.geometry.dispose();

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
