import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Crosshair, Navigation, Scan, Zap, Play, Pause, ChevronRight } from 'lucide-react';

// ---- Constants & Math Utilities ----
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;
const NUM_STARS = IS_MOBILE ? 15000 : 100000;
const HERO_COUNT = IS_MOBILE ? 6 : 12;
const GALAXY_ARMS = 5;
const GALAXY_SPIN = -0.15;
const GALAXY_MAX_RADIUS = 350;
const CORE_RADIUS = 25;

function randomGaussian(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

function getStellarColor() {
  const r = Math.random();
  if (r < 0.00003) return new THREE.Color(0x9db4ff);
  if (r < 0.0013) return new THREE.Color(0xa2b9ff);
  if (r < 0.0073) return new THREE.Color(0xffffff);
  if (r < 0.0373) return new THREE.Color(0xfff4ea);
  if (r < 0.1133) return new THREE.Color(0xffd2a1);
  if (r < 0.2343) return new THREE.Color(0xffa351);
  return new THREE.Color(0xff4422);
}

function colorTempToRGB(kelvin: number): THREE.Color {
    let temp = kelvin / 100;
    let red, green, blue;

    if (temp <= 66) {
        red = 255;
        green = temp;
        green = 99.4708025861 * Math.log(green) - 161.1195681661;
        if (temp <= 19) blue = 0;
        else {
            blue = temp - 10;
            blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
        }
    } else {
        red = temp - 60;
        red = 329.698727446 * Math.pow(red, -0.1332047592);
        green = temp - 60;
        green = 288.1221695283 * Math.pow(green, -0.0755148492);
        blue = 255;
    }

    return new THREE.Color(
        Math.min(255, Math.max(0, red)) / 255,
        Math.min(255, Math.max(0, green)) / 255,
        Math.min(255, Math.max(0, blue)) / 255
    );
}

// ---- Background Star Shaders ----
const starVertexShader = `
  attribute vec3 color;
  attribute float size;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (400.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = `
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float alpha = exp(-dist * dist * 30.0);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const CinematicPass = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;

    float random(vec2 p) {
      return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Chromatic Aberration
      vec2 offset = (uv - 0.5) * 0.002;
      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec3 color = vec3(r, g, b);

      // Dynamic Film Grain
      float grain = (random(uv * mod(time, 100.0)) - 0.5) * 0.04;
      color += grain;

      // Vignette
      float dist = distance(uv, vec2(0.5));
      color *= smoothstep(0.8, 0.2, dist * 1.1);

      gl_FragColor = vec4(color, 1.0);
    }
  `
};

// ---- Hero Star Shaders ----
const nebulaFS = `
uniform float uTime;
uniform vec3 uColor;
uniform float uCollapse;
uniform vec3 uCameraPos;
uniform mat4 uInverseModelMatrix;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0.0,0.0,0.0)),hash(i+vec3(1.0,0.0,0.0)),f.x),mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),
               mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x),mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.5;
    f += 0.2500 * noise(p); 
    return f;
}

void main() {
    vec3 localCam = (uInverseModelMatrix * vec4(uCameraPos, 1.0)).xyz;
    vec3 rayDir = normalize(vLocalPosition - localCam);
    vec3 pos = vLocalPosition;
    
    float stepSize = 0.15;
    float alpha = 0.0;
    vec3 accCol = vec3(0.0);
    
    float progress = smoothstep(0.0, 1.0, uCollapse);
    
    for(int i=0; i<12; i++) {
        float d = length(pos);
        if(d > 1.0) break; // Sphere bounds
        
        // Swirling gas currents
        float angle = (1.0 - d) * 3.0 + uTime * 0.3;
        float s = sin(angle);
        float c = cos(angle);
        vec3 p = pos;
        p.xz = mat2(c, -s, s, c) * p.xz;
        p.xy = mat2(c, s, -s, c) * p.xy;
        
        // Raymarched 3D noise (use lower frequency to help performance)
        float n = fbm(p * 2.0 - rayDir * uTime * 0.1);
        
        // Tiny particle emissions/sparkles (use hash instead of expensive noise)
        float sparkles = pow(hash(p * 15.0 + uTime * 0.5), 8.0) * 1.5;
        
        // Target collapse radius
        float targetR = 1.0 - progress * 0.95; 
        
        // Density calculation
        float density = smoothstep(0.3, 0.7, n + sparkles * 0.1);
        density *= smoothstep(targetR, targetR * 0.6, d); // fade near edge
        
        // Calculate temperatures
        vec3 hotCore = vec3(1.0, 0.8, 0.4);
        vec3 coldGas = uColor;
        
        // Mix heat inside
        float temp = progress * (1.0 - d);
        vec3 heatColor = mix(coldGas, hotCore, temp);
        
        // Realistic light scattering (more light in dense areas near center)
        float scattering = pow(max(0.0, 1.0 - d), 2.0) * density;
        heatColor += hotCore * scattering * progress * 2.5;
        
        alpha += density * stepSize * 2.5;
        accCol += heatColor * density * stepSize * 3.0;
        
        if(alpha > 0.99) {
            alpha = 1.0;
            break;
        }
        
        // Step forward inside the sphere
        pos += rayDir * stepSize;
    }
    
    gl_FragColor = vec4(accCol, alpha * smoothstep(1.0, 0.9, uCollapse));
}
`;

const starSurfaceFS = `
uniform float uTime;
uniform vec3 uColor;
uniform float uTurbulence;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0.0,0.0,0.0)),hash(i+vec3(1.0,0.0,0.0)),f.x),mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),
               mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x),mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.5;
    f += 0.2500 * noise(p); 
    return f;
}

void main() {
    float n1 = fbm(vLocalPosition * 5.0 * uTurbulence + uTime * 0.5);
    float n2 = fbm(vLocalPosition * 10.0 * uTurbulence - uTime * 0.8);
    float noiseVal = (n1 + n2) * 0.5;
    
    vec3 finalColor = mix(uColor * 0.5, uColor * 1.5, noiseVal);
    
    // Limb darkening
    float intensity = dot(vNormal, vec3(0.0, 0.0, 1.0));
    finalColor *= smoothstep(0.0, 1.0, intensity * 1.2 + 0.2);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const basicVS = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
void main() {
    vLocalPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PHASES = {
    NEBULA: 0,
    PROTOSTAR: 1,
    MAIN_SEQUENCE: 2,
    RED_GIANT: 3,
    SUPERNOVA: 4,
    REMNANT: 5
};

const PHASE_NAMES = [
    "Nebula Formation",
    "Protostar Ignition",
    "Main Sequence",
    "Red Giant",
    "Supernova",
    "Stellar Remnant"
];

class HeroStarSystem extends THREE.Group {
    mass: number;
    lifespanReal: number;
    loopDuration: number;
    t: number;
    
    currentTemp: number = 3000;
    currentLum: number = 1;
    currentRealAge: number = 0;
    phase: number = 0;
    isSupernovaFlashing: boolean = false;

    nebulaMat: THREE.ShaderMaterial;
    starMat: THREE.ShaderMaterial;
    nebulaMesh: THREE.Mesh;
    starMesh: THREE.Mesh;
    coronaMesh: THREE.Mesh;
    planetsInfo: { pivot: THREE.Group, mesh: THREE.Mesh, dist: number, speed: number }[] = [];
    hzMesh: THREE.Mesh;
    snRing: THREE.Mesh;
    pulsarGroup: THREE.Group;
    blackHoleGroup: THREE.Group;
    hitMesh: THREE.Mesh;
    
    dustCloud: THREE.Points;
    ejectaMat: THREE.ShaderMaterial;
    ejectaMesh: THREE.Points;

    tHeat: number;
    baseRadius: number;

    constructor() {
        super();
        this.mass = Math.random() > 0.8 ? 8 + Math.random() * 12 : 0.5 + Math.random() * 3;
        this.lifespanReal = 10000 * Math.pow(this.mass, -2.5);
        this.loopDuration = 40 + Math.random() * 20; 
        this.t = Math.random();

        this.tHeat = 5778 * Math.pow(this.mass, 0.5);
        this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;

        // 1. Nebula
        this.nebulaMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: nebulaFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x3a0088) },
                uCollapse: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uInverseModelMatrix: { value: new THREE.Matrix4() }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide
        });
        this.nebulaMesh = new THREE.Mesh(new THREE.SphereGeometry(15, 32, 32), this.nebulaMat);
        this.add(this.nebulaMesh);

        // 1b. Dust Cloud
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(500 * 3);
        const dustSize = new Float32Array(500);
        for(let i=0; i<500; i++) {
            const r = 2 + Math.pow(Math.random(), 2) * 15;
            const a = Math.random() * Math.PI * 2;
            const h = (Math.random() - 0.5) * Math.max(0.5, r * 0.2);
            dustPos[i*3] = Math.cos(a) * r;
            dustPos[i*3+1] = h;
            dustPos[i*3+2] = Math.sin(a) * r;
            dustSize[i] = Math.random() * 0.5 + 0.1;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        dustGeo.setAttribute('size', new THREE.BufferAttribute(dustSize, 1));
        this.dustCloud = new THREE.Points(
            dustGeo,
            new THREE.ShaderMaterial({
                uniforms: { uColor: { value: new THREE.Color(0xaa66ff) }, uAlpha: { value: 1.0 } },
                vertexShader: `
                    attribute float size;
                    varying float vAlpha;
                    uniform float uAlpha;
                    void main() {
                        vAlpha = uAlpha;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (200.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    varying float vAlpha;
                    void main() {
                        float d = length(gl_PointCoord - vec2(0.5));
                        if(d > 0.5) discard;
                        gl_FragColor = vec4(uColor, vAlpha * (1.0 - d*2.0));
                    }
                `,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        this.add(this.dustCloud);

        // 2. Star Surface
        this.starMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xffff00) },
                uTurbulence: { value: 1.0 }
            }
        });
        this.starMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), this.starMat);
        this.add(this.starMesh);

        // 3. Corona
        this.coronaMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1.15, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })
        );
        this.starMesh.add(this.coronaMesh);

        // 4. Planets & Habitable Zone
        const lum = Math.pow(this.mass, 3.5);
        const hzRadius = Math.max(4, Math.sqrt(lum) * 2.5);
        
        this.hzMesh = new THREE.Mesh(
            new THREE.TorusGeometry(hzRadius, 0.05, 8, 64),
            new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending })
        );
        this.hzMesh.rotation.x = Math.PI / 2;
        this.add(this.hzMesh);

        for(let i=0; i<4; i++) {
            const dist = 3 + Math.random() * 8 + (i * 2); 
            const pMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.1 + Math.random()*0.15, 16, 16), 
                new THREE.MeshStandardMaterial({color: 0xaaaaaa, roughness: 0.8})
            );
            pMesh.position.x = dist;
            const pivot = new THREE.Group();
            pivot.rotation.y = Math.random() * Math.PI * 2;
            const speed = (0.5 + Math.random()) / Math.sqrt(dist);
            pivot.add(pMesh);
            this.add(pivot);
            this.planetsInfo.push({ pivot, mesh: pMesh, dist, speed });
        }

        // 5. Supernova Ring & Ejecta
        this.snRing = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.1, 16, 64),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
        );
        this.snRing.rotation.x = Math.PI / 2;
        this.add(this.snRing);
        
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
            vertexShader: `
                attribute vec3 velocity;
                uniform float uExp;
                varying float vAlpha;
                void main() {
                    vAlpha = 1.0 - uExp;
                    vec3 p = position + velocity * uExp * 100.0;
                    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
                    gl_PointSize = (150.0 * (1.0 - uExp)) / -mvPos.z;
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if(d > 0.5) discard;
                    gl_FragColor = vec4(uColor, vAlpha * (1.0 - d*2.0));
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.ejectaMesh = new THREE.Points(ejectaGeo, this.ejectaMat);
        this.add(this.ejectaMesh);


        // 6. Remnants (Pulsar & Black Hole)
        this.pulsarGroup = new THREE.Group();
        const beamGeo = new THREE.ConeGeometry(0.2, 20, 16);
        beamGeo.translate(0, 10, 0); 
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
        const beam1 = new THREE.Mesh(beamGeo, beamMat);
        const beam2 = new THREE.Mesh(beamGeo, beamMat);
        beam2.rotation.x = Math.PI;
        this.pulsarGroup.add(beam1);
        this.pulsarGroup.add(beam2);
        this.add(this.pulsarGroup);

        this.blackHoleGroup = new THREE.Group();
        const bhCore = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        const diskGeo = new THREE.TorusGeometry(1.5, 0.4, 16, 64);
        diskGeo.rotateX(Math.PI / 2);
        const diskMat = new THREE.MeshBasicMaterial({ 
            color: 0xff8800, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
        });
        const diskMesh = new THREE.Mesh(diskGeo, diskMat);
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);
        this.add(this.blackHoleGroup);

        // 7. Hit mesh for raycaster
        this.hitMesh = new THREE.Mesh(
            new THREE.SphereGeometry(8, 16, 16),
            new THREE.MeshBasicMaterial({visible: false})
        );
        this.add(this.hitMesh);
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3) {
        this.t += delta / this.loopDuration;
        if (this.t > 1.0) {
            this.t = 0;
            this.isSupernovaFlashing = false;
        }

        this.currentRealAge = this.t * this.lifespanReal;
        
        this.nebulaMesh.visible = false;
        this.starMesh.visible = false;
        this.hzMesh.visible = false;
        this.snRing.visible = false;
        this.ejectaMesh.visible = false;
        this.pulsarGroup.visible = false;
        this.blackHoleGroup.visible = false;
        this.dustCloud.visible = false;
        this.planetsInfo.forEach(p => p.pivot.visible = false);

        if (this.t < 0.1) {
            this.phase = PHASES.NEBULA;
            this.nebulaMesh.visible = true;
            this.dustCloud.visible = true;
            const normT = this.t / 0.1;
            
            this.nebulaMat.uniforms.uTime.value = appTime;
            this.nebulaMat.uniforms.uCollapse.value = normT;
            this.nebulaMat.uniforms.uCameraPos.value.copy(cameraPos);
            this.nebulaMat.uniforms.uInverseModelMatrix.value.copy(this.nebulaMesh.matrixWorld).invert();
            
            this.dustCloud.rotation.y += delta * 0.2;
            (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 1.0;
            this.dustCloud.scale.setScalar(1.0 - normT * 0.5);

            this.currentTemp = 50 + normT * 1000;
            this.currentLum = normT * 0.1;

        } else if (this.t < 0.2) {
            this.phase = PHASES.PROTOSTAR;
            const normT = (this.t - 0.1) / 0.1;
            
            if (normT < 0.8) {
                this.nebulaMesh.visible = true;
                this.nebulaMat.uniforms.uCollapse.value = 1.0;
                this.dustCloud.visible = true;
                this.dustCloud.rotation.y += delta * 0.5;
                (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 1.0 - normT * 1.25;
                this.dustCloud.scale.setScalar(0.5 - normT * 0.2);
            }

            this.starMesh.visible = true;
            const introScale = this.baseRadius * (0.5 + normT * 0.5);
            this.starMesh.scale.setScalar(introScale);
            this.currentTemp = 1000 + normT * (this.tHeat - 1000);
            this.currentLum = normT * Math.pow(this.mass, 3.5);
            
            const col = colorTempToRGB(this.currentTemp);
            this.starMat.uniforms.uColor.value.copy(col);
            this.starMat.uniforms.uTime.value = appTime;
            this.starMat.uniforms.uTurbulence.value = 2.0 - normT; 
            (this.coronaMesh.material as THREE.MeshBasicMaterial).color.copy(col);

        } else if (this.t < 0.8) {
            this.phase = PHASES.MAIN_SEQUENCE;
            this.starMesh.visible = true;
            this.hzMesh.visible = true;
            
            this.starMesh.scale.setScalar(this.baseRadius);
            this.currentTemp = this.tHeat;
            this.currentLum = Math.pow(this.mass, 3.5);
            
            const col = colorTempToRGB(this.currentTemp);
            this.starMat.uniforms.uColor.value.copy(col);
            this.starMat.uniforms.uTime.value = appTime;
            this.starMat.uniforms.uTurbulence.value = 1.0;
            (this.coronaMesh.material as THREE.MeshBasicMaterial).color.copy(col);

            this.planetsInfo.forEach(p => {
                p.pivot.visible = true;
                p.pivot.rotation.y += p.speed * delta;
                (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xaaaaaa);
                (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            });

        } else if (this.t < 0.95) {
            this.phase = PHASES.RED_GIANT;
            this.starMesh.visible = true;
            const normT = (this.t - 0.8) / 0.15;
            
            const giantScale = this.baseRadius * (1.0 + normT * 6.0);
            this.starMesh.scale.setScalar(giantScale);
            
            this.currentTemp = this.tHeat - normT * (this.tHeat - 3000); // Cool to red
            this.currentLum = Math.pow(this.mass, 3.5) * (1.0 + normT * 5.0); // Brighter
            
            const col = colorTempToRGB(this.currentTemp);
            this.starMat.uniforms.uColor.value.copy(col);
            this.starMat.uniforms.uTime.value = appTime;
            this.starMat.uniforms.uTurbulence.value = 0.6; // deeper slow turbulence
            (this.coronaMesh.material as THREE.MeshBasicMaterial).color.copy(col);

            // Destroy inner planets
            this.planetsInfo.forEach(p => {
                p.pivot.visible = true;
                p.pivot.rotation.y += p.speed * delta;
                if (p.dist < giantScale * 1.2) {
                    const dmg = Math.max(0, 1.0 - (p.dist - giantScale) / (giantScale * 0.2));
                    (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x222222);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffaa00);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = dmg;
                    p.mesh.scale.setScalar(Math.max(0.01, 1.0 - dmg));
                } else {
                    p.mesh.scale.setScalar(1.0);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
                }
            });

        } else if (this.t < 0.97) {
            this.phase = PHASES.SUPERNOVA;
            const normT = (this.t - 0.95) / 0.02;
            
            if (this.mass > 8) {
                if (normT < 0.1) this.isSupernovaFlashing = true;

                this.snRing.visible = true;
                this.snRing.scale.setScalar(1.0 + normT * 60.0);
                (this.snRing.material as THREE.MeshBasicMaterial).opacity = 1.0 - Math.pow(normT, 2);
                
                this.ejectaMesh.visible = true;
                this.ejectaMat.uniforms.uExp.value = normT;
                this.ejectaMat.uniforms.uColor.value.setHex(normT < 0.2 ? 0xffffff : 0xff4411);

                this.starMesh.visible = true;
                this.starMesh.scale.setScalar(this.baseRadius * 7.0 * (1.0 - normT));
                this.currentTemp = 100000;
                this.currentLum = 100000;
                this.starMat.uniforms.uColor.value.setHex(0xffffff);
            } else {
                // Planetary Nebula (gentle puff)
                this.snRing.visible = true;
                this.snRing.scale.setScalar(1.0 + normT * 20.0);
                (this.snRing.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1.0 - normT);
                (this.snRing.material as THREE.MeshBasicMaterial).color.setHex(0x00ffaa);
                
                this.ejectaMesh.visible = true;
                this.ejectaMat.uniforms.uExp.value = normT * 0.5;
                this.ejectaMat.uniforms.uColor.value.setHex(0x00ffaa);

                this.starMesh.visible = true;
                this.starMesh.scale.setScalar(this.baseRadius * (1.0 - normT * 0.8));
                this.currentTemp = 20000;
            }

        } else {
            this.phase = PHASES.REMNANT;
            this.isSupernovaFlashing = false;
            
            if (this.mass > 15) {
                // Black Hole
                this.blackHoleGroup.visible = true;
                this.blackHoleGroup.rotation.y += delta;
                this.blackHoleGroup.rotation.z = Math.PI / 8;
                this.currentTemp = 0;
                this.currentLum = 0;
            } else if (this.mass > 8) {
                // Neutron Star / Pulsar
                this.starMesh.visible = true;
                this.starMesh.scale.setScalar(0.15);
                this.currentTemp = 500000;
                this.starMat.uniforms.uColor.value.setHex(0x00aaff);
                
                this.pulsarGroup.visible = true;
                this.pulsarGroup.rotation.z = Math.PI / 6;
                this.pulsarGroup.rotation.y += delta * 20.0; 
                this.currentLum = 100;
            } else {
                // White Dwarf
                this.starMesh.visible = true;
                this.starMesh.scale.setScalar(0.1);
                this.currentTemp = 20000; 
                this.starMat.uniforms.uColor.value.setHex(0xffddff);
                this.currentLum = 0.01;
            }
        }
    }
}

export function AetherGenesis() {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudX = useRef<HTMLSpanElement>(null);
  const hudY = useRef<HTMLSpanElement>(null);
  const hudZ = useRef<HTMLSpanElement>(null);
  const hudAge = useRef<HTMLSpanElement>(null);

  // Focus UI Refs
  const uiPhase = useRef<HTMLSpanElement>(null);
  const uiTemp = useRef<HTMLSpanElement>(null);
  const uiMass = useRef<HTMLSpanElement>(null);
  const uiAge2 = useRef<HTMLSpanElement>(null);
  const uiLum = useRef<HTMLSpanElement>(null);
  const uiTimelineFill = useRef<HTMLDivElement>(null);

  const [selectedStar, setSelectedStarState] = useState<HeroStarSystem | null>(null);
  const selectedStarRef = useRef<HeroStarSystem | null>(null);
  const [heroStars] = useState<HeroStarSystem[]>([]);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 50, 400);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    // --- Galaxy Generation (Background) ---
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(NUM_STARS * 3);
    const colors = new Float32Array(NUM_STARS * 3);
    const sizes = new Float32Array(NUM_STARS);

    for (let i = 0; i < NUM_STARS; i++) {
        const t = Math.pow(Math.random(), 2.5);
        const r = t * GALAXY_MAX_RADIUS;

        const armIndex = Math.floor(Math.random() * GALAXY_ARMS);
        const armOffset = (armIndex / GALAXY_ARMS) * Math.PI * 2;
        const baseAngle = r * GALAXY_SPIN + armOffset;

        const dispersion = randomGaussian(0, Math.max(1, r * 0.12));
        const heightAmp = Math.max(1.0, 30.0 * Math.exp(-r / 40.0));
        const height = randomGaussian(0, heightAmp);

        let x = Math.cos(baseAngle) * r + randomGaussian(0, dispersion);
        let z = Math.sin(baseAngle) * r + randomGaussian(0, dispersion);
        let y = height;

        const ptAngle = Math.atan2(z, x);
        const ptDist = Math.sqrt(x * x + z * z);
        const spiralPhase = ptAngle - ptDist * GALAXY_SPIN;
        const cycle = Math.PI * 2 / GALAXY_ARMS;
        const phaseMod = ((spiralPhase % cycle) + cycle) % cycle;
        const armFraction = phaseMod / cycle; 

        const isDustLane = armFraction > 0.15 && armFraction < 0.35 && ptDist > CORE_RADIUS;
        const color = getStellarColor();
        let size = Math.random() * 1.5 + 0.2;

        if (ptDist < CORE_RADIUS * 1.5) {
            const boost = 1.0 + (CORE_RADIUS * 1.5 - ptDist) / (CORE_RADIUS);
            color.multiplyScalar(boost);
            color.r += 0.2;
            color.g += 0.1;
            size *= 1.5;
        }

        if (isDustLane) {
            const extinction = 0.05 + Math.random() * 0.05;
            color.multiplyScalar(extinction);
            color.g *= 0.6; 
            color.b *= 0.3;
            size *= 0.5; 
        }

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        sizes[i] = size;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        transparent: true,
    });

    const starfield = new THREE.Points(geometry, material);
    scene.add(starfield);

    // --- Hero Stars Initialization ---
    for(let i=0; i<12; i++) {
        const hs = new HeroStarSystem();
        const r = 10 + Math.random() * 200; 
        const angle = Math.random() * Math.PI * 2;
        hs.position.set(
            Math.cos(angle) * r,
            (Math.random() - 0.5) * (Math.max(5, 50 - r*0.1)),
            Math.sin(angle) * r
        );
        scene.add(hs);
        heroStars.push(hs);
    }

    // --- Post-Processing Pipeline ---
    const composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.6, 0.4, 0.1);
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.6;
    bloomPass.threshold = 0.2;
    composer.addPass(bloomPass);

    const cinematicShader = new ShaderPass(CinematicPass);
    composer.addPass(cinematicShader);

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    renderer.domElement.style.touchAction = 'none';
    controls.dampingFactor = 0.05;
    controls.maxDistance = 600;
    controls.minDistance = 2;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let mouseDownPos = {x: 0, y: 0};

    const onPointerDown = (e: PointerEvent) => {
        isDragging = false;
        mouseDownPos = {x: e.clientX, y: e.clientY};
    };

    const onPointerMove = (e: PointerEvent) => {
        if (Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5) {
            isDragging = true;
        }
    };

    const onPointerUp = (e: PointerEvent) => {
        if (isDragging || e.button !== 0) return;
        
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const hitMeshes = heroStars.map(h => h.hitMesh);
        const intersects = raycaster.intersectObjects(hitMeshes);
        
        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const system = hit.parent as HeroStarSystem;
            selectedStarRef.current = system;
            setSelectedStarState(system);
            
            // Smooth zoom to star
            const targetPos = system.position.clone();
            const camOffset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(40);
            camera.position.copy(targetPos).add(camOffset);
            controls.target.copy(targetPos);
        } else {
            selectedStarRef.current = null;
            setSelectedStarState(null);
        }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // --- Animation Loop ---
    let frameId: number;
    let appTime = 0;
    let clock = new THREE.Clock();

    const animate = () => {
        frameId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        appTime += delta;

        // Supernova global flash logic
        let highBloom = false;

        heroStars.forEach(hs => {
            if (hs === selectedStarRef.current && isScrubbingRef.current) {
                // If scrubbing, do not advance time automatically but update visually
                hs.update(0, appTime, camera.position);
            } else {
                hs.update(delta, appTime, camera.position);
            }
            if (hs.isSupernovaFlashing) highBloom = true;
        });

        if (highBloom) {
            bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 3.5, 0.2);
        } else {
            bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 1.2, 0.05);
        }

        controls.update();
        cinematicShader.uniforms.time.value = appTime;

        // Update HUD
        if (hudX.current) hudX.current.innerText = camera.position.x.toFixed(1);
        if (hudY.current) hudY.current.innerText = camera.position.y.toFixed(1);
        if (hudZ.current) hudZ.current.innerText = camera.position.z.toFixed(1);
        if (hudAge.current) hudAge.current.innerText = (13.8 + appTime * 0.0001).toFixed(4);

        // Update Selected Star UI Panel dynamically to save React renders
        if (selectedStarRef.current) {
            const s = selectedStarRef.current;
            if (uiPhase.current) uiPhase.current.innerText = PHASE_NAMES[s.phase];
            if (uiTemp.current) uiTemp.current.innerText = Math.round(s.currentTemp).toLocaleString();
            if (uiMass.current) uiMass.current.innerText = s.mass.toFixed(2);
            if (uiAge2.current) uiAge2.current.innerText = s.currentRealAge.toFixed(1);
            if (uiLum.current) uiLum.current.innerText = s.currentLum.toFixed(3);
            if (uiTimelineFill.current) uiTimelineFill.current.style.width = `${s.t * 100}%`;
        }

        composer.render();
    };

    animate();
    setTimeout(() => { cancelAnimationFrame(frameId); animate(); }, 500);

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 150));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { cancelAnimationFrame(frameId); animate(); } });

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        cancelAnimationFrame(frameId);
        if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
            mountRef.current.removeChild(renderer.domElement);
        }
        geometry.dispose();
        material.dispose();
        renderer.dispose();
    };
  }, []);

  // --- Scrubber Interaction ---
  const isScrubbingRef = useRef(false);
  
  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectedStarRef.current || !isScrubbingRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      selectedStarRef.current.t = percentage;
  };

  return (
    <div 
      className="relative w-full bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none"
      style={{ height: '100dvh' }}
    >
      {/* Galactic Core Background Simulation */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(12deg)',
            width: '800px',
            height: '400px',
            backgroundColor: '#4f46e5', // bg-indigo-600
            borderRadius: '100%',
            filter: 'blur(120px)'
          }}
        />
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-12deg)',
            width: '400px',
            height: '200px',
            backgroundColor: '#d946ef', // bg-fuchsia-500
            borderRadius: '100%',
            filter: 'blur(100px)',
            opacity: 0.6
          }}
        />
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '120px',
            height: '120px',
            backgroundColor: 'white',
            borderRadius: '100%',
            filter: 'blur(60px)',
            opacity: 0.8
          }}
        />
      </div>

      {/* Procedural Starfield (CSS Patterns) */}
      <div className="absolute inset-0 pointer-events-none"
           style={{
             backgroundImage: `
               radial-gradient(1px 1px at 10% 20%, #fff, transparent), 
               radial-gradient(1.5px 1.5px at 50% 50%, #fff, transparent), 
               radial-gradient(1px 1px at 80% 90%, #fff, transparent), 
               radial-gradient(2px 2px at 20% 80%, #fff, transparent),
               radial-gradient(1px 1px at 70% 30%, #fff, transparent)`,
             backgroundSize: '200px 200px'
           }}>
      </div>

      {/* WebGL Mount point */}
      <div 
        ref={mountRef} 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: 'crosshair',
          zIndex: 0,
          touchAction: 'none'
        }} 
      />

      {/* HUD: Top Bar */}
      <nav 
        className="absolute top-0 w-full flex justify-between items-start z-20 pointer-events-none"
        style={{ 
          padding: '2rem',
          paddingTop: 'calc(max(2rem, env(safe-area-inset-top)))'
        }}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_#C084FC]"></div>
            <h1 className="text-xl font-bold tracking-[0.3em] uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              ÆTHERGENESIS
            </h1>
          </div>
          <span className="text-[10px] text-[#7EB8FF]/70 uppercase tracking-[0.2em] ml-6">
            Simulation Phase 02: Stellar Genesis
          </span>
        </div>
        
        <div className="flex items-center gap-12 bg-[rgba(8,8,20,0.6)] backdrop-blur-md border border-[rgba(126,184,255,0.2)] rounded-full px-6 py-3">
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Background Mass</span>
            <span className="font-mono text-sm">50,000 <span className="text-[#C084FC]">★</span></span>
          </div>
          <div className="w-[1px] h-6 bg-[rgba(126,184,255,0.2)]"></div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Simulation Subjects</span>
            <span className="font-mono text-sm">12 Hero Stars</span>
          </div>
        </div>
      </nav>

      {/* Stellar Lifecycle Inspect Panel (Frosted Glass Theme) */}
      {selectedStar && (
        <div 
          className="absolute right-8 w-80 bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto"
          style={{ top: 'calc(max(6rem, env(safe-area-inset-top) + 4rem))' }}
        >
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]">
                <div className="flex items-center gap-3">
                    <Scan size={20} className="text-[#C084FC]" />
                    <h2 className="text-sm font-bold tracking-widest uppercase text-white">Stellar Telemetry</h2>
                </div>
                <button 
                    onClick={() => setSelectedStarState(null)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
                <div className="flex justify-between items-center">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Phase</span>
                    <span ref={uiPhase} className="text-[#C084FC] font-bold text-right">-</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider flex items-center gap-2">
                        <Zap size={14} /> Temp (K)
                    </span>
                    <span ref={uiTemp} className="text-white">-</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Mass (M☉)</span>
                    <span ref={uiMass} className="text-white">-</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Luminosity (L☉)</span>
                    <span ref={uiLum} className="text-white">-</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[#7EB8FF]/70 uppercase tracking-wider">Age (Myr)</span>
                    <span ref={uiAge2} className="text-white">-</span>
                </div>
                
                <div className="mt-8 pt-6 border-t border-[rgba(126,184,255,0.1)]">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] text-[#7EB8FF]/50 uppercase tracking-widest">Time Override</span>
                        <div className="flex gap-2">
                            <button className="text-white/40 hover:text-white transition-colors"><Pause size={12} /></button>
                            <button className="text-white/40 hover:text-white transition-colors"><Play size={12} /></button>
                        </div>
                    </div>
                    {/* Scrubbable Timeline */}
                    <div 
                        className="w-full h-2 bg-white/10 rounded-full overflow-hidden cursor-ew-resize relative group"
                        onPointerDown={(e) => { isScrubbingRef.current = true; handleTimelineScrub(e); }}
                        onPointerMove={(e) => { if(isScrubbingRef.current) handleTimelineScrub(e); }}
                        onPointerUp={() => { isScrubbingRef.current = false; }}
                        onPointerLeave={() => { isScrubbingRef.current = false; }}
                    >
                        <div ref={uiTimelineFill} className="h-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-red-500" style={{width: '0%'}}></div>
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-[#7EB8FF]/40 uppercase tracking-widest">
                        <span>Genesis</span>
                        <span>Terminal</span>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Bottom HUD */}
      <div 
        className="absolute bottom-0 w-full flex justify-between items-end z-20 pointer-events-none"
        style={{ 
          padding: '2rem',
          paddingBottom: 'calc(max(2rem, env(safe-area-inset-bottom)))'
        }}
      >
        <div className="font-mono text-[10px] text-[#7EB8FF]/60 space-y-1 border-l border-[#C084FC]/50 pl-4 bg-[rgba(8,8,20,0.4)] backdrop-blur-md py-3 pr-4 rounded-r border-y-0 border-r-0">
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-[rgba(126,184,255,0.2)]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#C084FC] animate-pulse shadow-[0_0_5px_#C084FC]" />
            <span className="uppercase tracking-widest text-[#7EB8FF]">Location Sensors Active</span>
          </div>
          <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_X:</span><span ref={hudX}>0.0000</span></div>
          <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Y:</span><span ref={hudY}>0.0000</span></div>
          <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Z:</span><span ref={hudZ}>0.0000</span></div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
          <div className="px-12 py-4 bg-[rgba(8,8,20,0.6)] backdrop-blur-2xl border border-[rgba(126,184,255,0.2)] rounded-full flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Global Cosmic Age (Gyr)</span>
            <span className="font-mono text-2xl font-light tracking-wider" ref={hudAge}>13.8000</span>
          </div>
          <p className="text-[10px] text-[#7EB8FF]/50 italic text-center max-w-sm">"Select any anomalous star to inspect its lifecycle. Use mouse to rotate."</p>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <div className="grid grid-cols-2 gap-2 pointer-events-auto">
            <div className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer">
              <Crosshair size={16} className="text-[#7EB8FF]" />
            </div>
            <div className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer">
              <Navigation size={16} className="text-[#C084FC]" />
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]/60 mt-1">Stellar Raycasting Active</span>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,5,0.6)_100%)]"></div>
    </div>
  );
}
