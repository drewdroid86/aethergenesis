import * as THREE from 'three';
import { PHASES } from '../../core/constants';

/**
 * BOLT: PlanetarySystem manages a collection of orbital bodies
 * utilizing InstancedMesh for performance and custom Shaders for visual variety.
 */

const PLANET_VS = `
attribute float planetType;
attribute float planetSeed;
attribute float biomass;
attribute float civilizationTier;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vType;
varying float vSeed;
varying float vBiomass;
varying float vCivilizationTier;
varying vec3 vLightDir;

void main() {
    vUv = uv;
    vType = planetType;
    vSeed = planetSeed;
    vPosition = position;
    vBiomass = biomass;
    vCivilizationTier = civilizationTier;
    
    // Transform normal and position for lighting
    vec4 worldPos = instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(instanceMatrix) * normal);
    vLightDir = normalize(-worldPos.xyz); // Light comes from star at local (0,0,0)
    
    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
`;

const PLANET_FS = `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vType;
varying float vSeed;
varying float vBiomass;
varying float vCivilizationTier;
varying vec3 vLightDir;

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

    if (vBiomass > 0.0 && type != 1.0 && type != 3.0) {
        color = mix(color, vec3(0.1, 0.6, 0.2), vBiomass * 0.4 * n);
    }

    // Lighting
    float diff = max(dot(vNormal, vLightDir), 0.1);
    vec3 finalColor = color * diff;
    
    // City Lights
    if (vCivilizationTier >= 1.0 && type != 1.0 && type != 3.0) {
        float cityNoise = snoise(p * 8.0);
        float nightSide = smoothstep(0.1, -0.2, dot(vNormal, vLightDir));
        if (cityNoise > 0.5) {
            finalColor += vec3(1.0, 0.85, 0.5) * nightSide * (cityNoise - 0.5) * 3.0;
        }
    }

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export class PlanetarySystem {
    private instancedMesh: THREE.InstancedMesh;
    public bodies: {
        scale: number;
        type: number;
        seed: number;
    }[] = [];
    
    private group: THREE.Group;
    private parent: THREE.Object3D;
    private material: THREE.ShaderMaterial;

    constructor(star: THREE.Object3D) {
        this.parent = star;
        this.group = new THREE.Group();
        this.parent.add(this.group);

        // Maximum 50 bodies
        const numBodies = 50; 
        
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader: PLANET_VS,
            fragmentShader: PLANET_FS
        });

        this.instancedMesh = new THREE.InstancedMesh(geometry, this.material, numBodies);
        
        // Add instance attributes for planet variation
        const types = new Float32Array(numBodies);
        const seeds = new Float32Array(numBodies);
        for (let i = 0; i < numBodies; i++) {
            types[i] = Math.floor(Math.random() * 7);
            seeds[i] = Math.random() * 1000.0;
            
            this.bodies.push({
                scale: 1.5 + Math.random() * 2.0,
                type: types[i],
                seed: seeds[i]
            });
        }
        
        // Hide all initially
        const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        for(let i=0; i<numBodies; i++){
            this.instancedMesh.setMatrixAt(i, hideMatrix);
        }
        
        
        const biomassArray = new Float32Array(numBodies).fill(0);
        const civArray = new Float32Array(numBodies).fill(0);
        
        geometry.setAttribute('planetType', new THREE.InstancedBufferAttribute(types, 1));
        geometry.setAttribute('planetSeed', new THREE.InstancedBufferAttribute(seeds, 1));
        geometry.setAttribute('biomass', new THREE.InstancedBufferAttribute(biomassArray, 1));
        geometry.setAttribute('civilizationTier', new THREE.InstancedBufferAttribute(civArray, 1));
        
        this.group.add(this.instancedMesh);
    }

    /**
     * Update orbits based on Float32Array from nbodyWorker.ts
     */
    updateFromBuffer(buffer: Float32Array, delta: number): void {
        const star = this.parent as any;
        
        if (star.phase !== PHASES.MAIN_SEQUENCE) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;
        this.material.uniforms.uTime.value += delta;
        
        const matrix = new THREE.Matrix4();
        const posV = new THREE.Vector3();
        const scaleV = new THREE.Vector3();
        const rotQ = new THREE.Quaternion();

        // Buffer has 7 floats per body: x, y, z, vx, vy, vz, type
        const numBodies = Math.min(this.bodies.length, buffer.length / 7);

        for (let i = 0; i < numBodies; i++) {
            const b = this.bodies[i];
            
            const x = buffer[i * 7 + 0];
            const y = buffer[i * 7 + 1];
            const z = buffer[i * 7 + 2];
            
            posV.set(x, y, z);
            scaleV.setScalar(b.scale);
            
            // Subtle self-rotation
            rotQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (buffer[i*7+0] + buffer[i*7+1]) * 0.01 + b.seed);
            
            matrix.compose(posV, rotQ, scaleV);
            this.instancedMesh.setMatrixAt(i, matrix);
        }

        // Hide unused instances
        const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = numBodies; i < this.instancedMesh.count; i++) {
            this.instancedMesh.setMatrixAt(i, hideMatrix);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.count = numBodies;
    }

    /**
     * GPU cleanup.
     */
    dispose() {
        this.material.dispose();
        this.instancedMesh.geometry.dispose();
        if (this.parent) {
            this.parent.remove(this.group);
        }
    }

    /**
     * Updates biosphere shaders based on AstrobiologyEngine output
     */
    updateAstrobiology(astrobiologyStates: any[]): void {
        const biomassAttr = this.instancedMesh.geometry.getAttribute('biomass') as THREE.InstancedBufferAttribute;
        const civAttr = this.instancedMesh.geometry.getAttribute('civilizationTier') as THREE.InstancedBufferAttribute;
        
        if (!biomassAttr || !civAttr) return;

        for (let i = 0; i < astrobiologyStates.length; i++) {
            const state = astrobiologyStates[i];
            biomassAttr.setX(i, state.biomass || 0.0);
            civAttr.setX(i, state.civilizationTier || 0.0);
        }

        biomassAttr.needsUpdate = true;
        civAttr.needsUpdate = true;
    }
}
