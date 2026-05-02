import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { Crosshair, Navigation, Scan, Zap, Play, Pause } from "lucide-react";
const NUM_STARS = 5e5;
const GALAXY_ARMS = 5;
const GALAXY_SPIN = -0.15;
const GALAXY_MAX_RADIUS = 350;
const CORE_RADIUS = 25;
function randomGaussian(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * stdev + mean;
}
function getStellarColor() {
  const r = Math.random();
  if (r < 3e-5) return new THREE.Color(10335487);
  if (r < 13e-4) return new THREE.Color(10664447);
  if (r < 73e-4) return new THREE.Color(16777215);
  if (r < 0.0373) return new THREE.Color(16774378);
  if (r < 0.1133) return new THREE.Color(16765601);
  if (r < 0.2343) return new THREE.Color(16753489);
  return new THREE.Color(16729122);
}
function colorTempToRGB(kelvin) {
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
    f += 0.5000 * noise(p); p *= 2.02;
    f += 0.2500 * noise(p); p *= 2.03;
    f += 0.1250 * noise(p);
    return f;
}

void main() {
    vec3 localCam = (uInverseModelMatrix * vec4(uCameraPos, 1.0)).xyz;
    vec3 rayDir = normalize(vLocalPosition - localCam);
    vec3 pos = vLocalPosition;
    
    float stepSize = 0.05;
    float alpha = 0.0;
    vec3 accCol = vec3(0.0);
    
    for(int i=0; i<40; i++) {
        float d = length(pos);
        if(d > 1.0) break; // Sphere bounds
        
        float n = fbm(pos * 4.0 + uTime * 0.2);
        
        // Collapse to center
        float targetR = 1.0 - uCollapse * 0.95; 
        float density = 0.0;
        
        if (d < targetR) {
            density = smoothstep(0.3, 0.7, n) * (1.0 - d / targetR);
        }
        
        // Heat building up in center
        vec3 heatColor = mix(uColor, vec3(1.0, 0.6, 0.2), uCollapse * (1.0 - d));
        
        alpha += density * stepSize * 4.0;
        accCol += heatColor * density * stepSize * 4.0;
        
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
    f += 0.5000 * noise(p); p *= 2.02;
    f += 0.2500 * noise(p); p *= 2.03;
    f += 0.1250 * noise(p);
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
  constructor() {
    super();
    this.currentTemp = 3e3;
    this.currentLum = 1;
    this.currentRealAge = 0;
    this.phase = 0;
    this.isSupernovaFlashing = false;
    this.planetsInfo = [];
    this.mass = Math.random() > 0.8 ? 8 + Math.random() * 12 : 0.5 + Math.random() * 3;
    this.lifespanReal = 1e4 * Math.pow(this.mass, -2.5);
    this.loopDuration = 40 + Math.random() * 20;
    this.t = Math.random();
    this.tHeat = 5778 * Math.pow(this.mass, 0.5);
    this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;
    this.nebulaMat = new THREE.ShaderMaterial({
      vertexShader: basicVS,
      fragmentShader: nebulaFS,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(3801224) },
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
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: basicVS,
      fragmentShader: starSurfaceFS,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(16776960) },
        uTurbulence: { value: 1 }
      }
    });
    this.starMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), this.starMat);
    this.add(this.starMesh);
    this.coronaMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 32, 32),
      new THREE.MeshBasicMaterial({ color: 16755200, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })
    );
    this.starMesh.add(this.coronaMesh);
    const lum = Math.pow(this.mass, 3.5);
    const hzRadius = Math.max(4, Math.sqrt(lum) * 2.5);
    this.hzMesh = new THREE.Mesh(
      new THREE.TorusGeometry(hzRadius, 0.05, 8, 64),
      new THREE.MeshBasicMaterial({ color: 65416, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending })
    );
    this.hzMesh.rotation.x = Math.PI / 2;
    this.add(this.hzMesh);
    for (let i = 0; i < 4; i++) {
      const dist = 3 + Math.random() * 8 + i * 2;
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: 11184810 })
      );
      pMesh.position.x = dist;
      const pivot = new THREE.Group();
      pivot.rotation.y = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random()) / Math.sqrt(dist);
      pivot.add(pMesh);
      this.add(pivot);
      this.planetsInfo.push({ pivot, dist, speed });
    }
    this.snRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.1, 16, 64),
      new THREE.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
    );
    this.snRing.rotation.x = Math.PI / 2;
    this.add(this.snRing);
    this.pulsarGroup = new THREE.Group();
    const beamGeo = new THREE.ConeGeometry(0.2, 20, 16);
    beamGeo.translate(0, 10, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: 65535, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    const beam1 = new THREE.Mesh(beamGeo, beamMat);
    const beam2 = new THREE.Mesh(beamGeo, beamMat);
    beam2.rotation.x = Math.PI;
    this.pulsarGroup.add(beam1);
    this.pulsarGroup.add(beam2);
    this.add(this.pulsarGroup);
    this.hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.add(this.hitMesh);
  }
  update(delta, appTime, cameraPos) {
    this.t += delta / this.loopDuration;
    if (this.t > 1) {
      this.t = 0;
      this.isSupernovaFlashing = false;
    }
    this.currentRealAge = this.t * this.lifespanReal;
    this.nebulaMesh.visible = false;
    this.starMesh.visible = false;
    this.hzMesh.visible = false;
    this.snRing.visible = false;
    this.pulsarGroup.visible = false;
    this.planetsInfo.forEach((p) => p.pivot.visible = false);
    if (this.t < 0.1) {
      this.phase = PHASES.NEBULA;
      this.nebulaMesh.visible = true;
      const normT = this.t / 0.1;
      this.nebulaMat.uniforms.uTime.value = appTime;
      this.nebulaMat.uniforms.uCollapse.value = normT;
      this.nebulaMat.uniforms.uCameraPos.value.copy(cameraPos);
      this.nebulaMat.uniforms.uInverseModelMatrix.value.copy(this.nebulaMesh.matrixWorld).invert();
      this.currentTemp = 50 + normT * 1e3;
      this.currentLum = normT * 0.1;
    } else if (this.t < 0.2) {
      this.phase = PHASES.PROTOSTAR;
      const normT = (this.t - 0.1) / 0.1;
      if (normT < 0.8) {
        this.nebulaMesh.visible = true;
        this.nebulaMat.uniforms.uCollapse.value = 1;
      }
      this.starMesh.visible = true;
      const introScale = this.baseRadius * (0.5 + normT * 0.5);
      this.starMesh.scale.setScalar(introScale);
      this.currentTemp = 1e3 + normT * (this.tHeat - 1e3);
      this.currentLum = normT * Math.pow(this.mass, 3.5);
      const col = colorTempToRGB(this.currentTemp);
      this.starMat.uniforms.uColor.value.copy(col);
      this.starMat.uniforms.uTime.value = appTime;
      this.starMat.uniforms.uTurbulence.value = 2 - normT;
      this.coronaMesh.material.color.copy(col);
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
      this.starMat.uniforms.uTurbulence.value = 1;
      this.coronaMesh.material.color.copy(col);
      this.planetsInfo.forEach((p) => {
        p.pivot.visible = true;
        p.pivot.rotation.y += p.speed * delta;
      });
    } else if (this.t < 0.95) {
      this.phase = PHASES.RED_GIANT;
      this.starMesh.visible = true;
      const normT = (this.t - 0.8) / 0.15;
      const giantScale = this.baseRadius * (1 + normT * 6);
      this.starMesh.scale.setScalar(giantScale);
      this.currentTemp = this.tHeat - normT * (this.tHeat - 3e3);
      this.currentLum = Math.pow(this.mass, 3.5) * (1 + normT * 5);
      const col = colorTempToRGB(this.currentTemp);
      this.starMat.uniforms.uColor.value.copy(col);
      this.starMat.uniforms.uTime.value = appTime;
      this.starMat.uniforms.uTurbulence.value = 0.6;
      this.coronaMesh.material.color.copy(col);
      this.planetsInfo.forEach((p) => {
        if (p.dist > giantScale) {
          p.pivot.visible = true;
          p.pivot.rotation.y += p.speed * delta;
        }
      });
    } else if (this.t < 0.97) {
      this.phase = PHASES.SUPERNOVA;
      const normT = (this.t - 0.95) / 0.02;
      if (this.mass > 8) {
        if (normT < 0.1) this.isSupernovaFlashing = true;
        this.snRing.visible = true;
        this.snRing.scale.setScalar(1 + normT * 60);
        this.snRing.material.opacity = 1 - Math.pow(normT, 2);
        this.starMesh.visible = true;
        this.starMesh.scale.setScalar(this.baseRadius * 7 * (1 - normT));
        this.currentTemp = 1e5;
        this.currentLum = 1e5;
        this.starMat.uniforms.uColor.value.setHex(16777215);
      } else {
        this.snRing.visible = true;
        this.snRing.scale.setScalar(1 + normT * 20);
        this.snRing.material.opacity = 0.5 * (1 - normT);
        this.snRing.material.color.setHex(65450);
        this.starMesh.visible = true;
        this.starMesh.scale.setScalar(this.baseRadius * (1 - normT * 0.8));
        this.currentTemp = 2e4;
      }
    } else {
      this.phase = PHASES.REMNANT;
      this.isSupernovaFlashing = false;
      this.starMesh.visible = true;
      if (this.mass > 8) {
        this.starMesh.scale.setScalar(0.15);
        this.currentTemp = 5e5;
        this.starMat.uniforms.uColor.value.setHex(43775);
        this.pulsarGroup.visible = true;
        this.pulsarGroup.rotation.z = Math.PI / 6;
        this.pulsarGroup.rotation.y += delta * 20;
        this.currentLum = 100;
      } else {
        this.starMesh.scale.setScalar(0.1);
        this.currentTemp = 2e4;
        this.starMat.uniforms.uColor.value.setHex(16768511);
        this.currentLum = 0.01;
      }
    }
  }
}
export function AetherGenesis() {
  const mountRef = useRef(null);
  const hudX = useRef(null);
  const hudY = useRef(null);
  const hudZ = useRef(null);
  const hudAge = useRef(null);
  const uiPhase = useRef(null);
  const uiTemp = useRef(null);
  const uiMass = useRef(null);
  const uiAge2 = useRef(null);
  const uiLum = useRef(null);
  const uiTimelineFill = useRef(null);
  const [selectedStar, setSelectedStarState] = useState(null);
  const selectedStarRef = useRef(null);
  const [heroStars] = useState([]);
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0);
    scene.fog = new THREE.FogExp2(0, 2e-3);
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2e3);
    camera.position.set(0, 50, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(NUM_STARS * 3);
    const colors = new Float32Array(NUM_STARS * 3);
    const sizes = new Float32Array(NUM_STARS);
    for (let i = 0; i < NUM_STARS; i++) {
      const t = Math.pow(Math.random(), 2.5);
      const r = t * GALAXY_MAX_RADIUS;
      const armIndex = Math.floor(Math.random() * GALAXY_ARMS);
      const armOffset = armIndex / GALAXY_ARMS * Math.PI * 2;
      const baseAngle = r * GALAXY_SPIN + armOffset;
      const dispersion = randomGaussian(0, Math.max(1, r * 0.12));
      const heightAmp = Math.max(1, 30 * Math.exp(-r / 40));
      const height = randomGaussian(0, heightAmp);
      let x = Math.cos(baseAngle) * r + randomGaussian(0, dispersion);
      let z = Math.sin(baseAngle) * r + randomGaussian(0, dispersion);
      let y = height;
      const ptAngle = Math.atan2(z, x);
      const ptDist = Math.sqrt(x * x + z * z);
      const spiralPhase = ptAngle - ptDist * GALAXY_SPIN;
      const cycle = Math.PI * 2 / GALAXY_ARMS;
      const phaseMod = (spiralPhase % cycle + cycle) % cycle;
      const armFraction = phaseMod / cycle;
      const isDustLane = armFraction > 0.15 && armFraction < 0.35 && ptDist > CORE_RADIUS;
      const color = getStellarColor();
      let size = Math.random() * 1.5 + 0.2;
      if (ptDist < CORE_RADIUS * 1.5) {
        const boost = 1 + (CORE_RADIUS * 1.5 - ptDist) / CORE_RADIUS;
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
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true
    });
    const starfield = new THREE.Points(geometry, material);
    scene.add(starfield);
    for (let i = 0; i < 20; i++) {
      const hs = new HeroStarSystem();
      const r = 10 + Math.random() * 200;
      const angle = Math.random() * Math.PI * 2;
      hs.position.set(
        Math.cos(angle) * r,
        (Math.random() - 0.5) * Math.max(5, 50 - r * 0.1),
        Math.sin(angle) * r
      );
      scene.add(hs);
      heroStars.push(hs);
    }
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
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 600;
    controls.minDistance = 2;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let mouseDownPos = { x: 0, y: 0 };
    const onPointerDown = (e) => {
      isDragging = false;
      mouseDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e) => {
      if (Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5) {
        isDragging = true;
      }
    };
    const onPointerUp = (e) => {
      if (isDragging || e.button !== 0) return;
      mouse.x = e.clientX / window.innerWidth * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hitMeshes = heroStars.map((h) => h.hitMesh);
      const intersects = raycaster.intersectObjects(hitMeshes);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const system = hit.parent;
        selectedStarRef.current = system;
        setSelectedStarState(system);
        const targetPos = system.position.clone();
        const camOffset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(40);
        camera.position.copy(targetPos).add(camOffset);
        controls.target.copy(targetPos);
      } else {
        selectedStarRef.current = null;
        setSelectedStarState(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    let frameId;
    let appTime = 0;
    let clock = new THREE.Clock();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      appTime += delta;
      let highBloom = false;
      heroStars.forEach((hs) => {
        if (hs === selectedStarRef.current && isScrubbingRef.current) {
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
      if (hudX.current) hudX.current.innerText = camera.position.x.toFixed(1);
      if (hudY.current) hudY.current.innerText = camera.position.y.toFixed(1);
      if (hudZ.current) hudZ.current.innerText = camera.position.z.toFixed(1);
      if (hudAge.current) hudAge.current.innerText = (13.8 + appTime * 1e-4).toFixed(4);
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
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      cancelAnimationFrame(frameId);
      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);
  const isScrubbingRef = useRef(false);
  const handleTimelineScrub = (e) => {
    if (!selectedStarRef.current || !isScrubbingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    selectedStarRef.current.t = percentage;
  };
  return /* @__PURE__ */ jsxs("div", { className: "relative w-full h-screen bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none", children: [
    /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 opacity-40 pointer-events-none", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-600 rounded-[100%] blur-[120px] rotate-12" }),
      /* @__PURE__ */ jsx("div", { className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] bg-fuchsia-500 rounded-[100%] blur-[100px] -rotate-12 opacity-60" })
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "absolute inset-0 pointer-events-none",
        style: {
          backgroundImage: `
               radial-gradient(1px 1px at 10% 20%, #fff, transparent), 
               radial-gradient(1.5px 1.5px at 50% 50%, #fff, transparent), 
               radial-gradient(1px 1px at 80% 90%, #fff, transparent), 
               radial-gradient(2px 2px at 20% 80%, #fff, transparent),
               radial-gradient(1px 1px at 70% 30%, #fff, transparent)`,
          backgroundSize: "200px 200px"
        }
      }
    ),
    /* @__PURE__ */ jsx("div", { ref: mountRef, className: "absolute inset-0 cursor-crosshair z-0" }),
    /* @__PURE__ */ jsxs("nav", { className: "absolute top-0 w-full p-8 flex justify-between items-start z-20 pointer-events-none", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "w-3 h-3 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_#C084FC]" }),
          /* @__PURE__ */ jsx("h1", { className: "text-xl font-bold tracking-[0.3em] uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]", children: "\xC6THERGENESIS" })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "text-[10px] text-[#7EB8FF]/70 uppercase tracking-[0.2em] ml-6", children: "Simulation Phase 02: Stellar Genesis" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-12 bg-[rgba(8,8,20,0.6)] backdrop-blur-md border border-[rgba(126,184,255,0.2)] rounded-full px-6 py-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[9px] uppercase tracking-widest text-[#7EB8FF]", children: "Background Mass" }),
          /* @__PURE__ */ jsxs("span", { className: "font-mono text-sm", children: [
            "500,000 ",
            /* @__PURE__ */ jsx("span", { className: "text-[#C084FC]", children: "\u2605" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "w-[1px] h-6 bg-[rgba(126,184,255,0.2)]" }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[9px] uppercase tracking-widest text-[#7EB8FF]", children: "Simulation Subjects" }),
          /* @__PURE__ */ jsx("span", { className: "font-mono text-sm", children: "20 Hero Stars" })
        ] })
      ] })
    ] }),
    selectedStar && /* @__PURE__ */ jsxs("div", { className: "absolute right-8 top-1/2 -translate-y-1/2 w-80 bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]", children: [
        /* @__PURE__ */ jsx(Scan, { size: 20, className: "text-[#C084FC]" }),
        /* @__PURE__ */ jsx("h2", { className: "text-sm font-bold tracking-widest uppercase text-white", children: "Stellar Telemetry" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-4 font-mono text-xs", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[#7EB8FF]/70 uppercase tracking-wider", children: "Phase" }),
          /* @__PURE__ */ jsx("span", { ref: uiPhase, className: "text-[#C084FC] font-bold text-right", children: "-" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center bg-white/5 p-2 rounded", children: [
          /* @__PURE__ */ jsxs("span", { className: "text-[#7EB8FF]/70 uppercase tracking-wider flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Zap, { size: 14 }),
            " Temp (K)"
          ] }),
          /* @__PURE__ */ jsx("span", { ref: uiTemp, className: "text-white", children: "-" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[#7EB8FF]/70 uppercase tracking-wider", children: "Mass (M\u2609)" }),
          /* @__PURE__ */ jsx("span", { ref: uiMass, className: "text-white", children: "-" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center bg-white/5 p-2 rounded", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[#7EB8FF]/70 uppercase tracking-wider", children: "Luminosity (L\u2609)" }),
          /* @__PURE__ */ jsx("span", { ref: uiLum, className: "text-white", children: "-" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[#7EB8FF]/70 uppercase tracking-wider", children: "Age (Myr)" }),
          /* @__PURE__ */ jsx("span", { ref: uiAge2, className: "text-white", children: "-" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-8 pt-6 border-t border-[rgba(126,184,255,0.1)]", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-3", children: [
            /* @__PURE__ */ jsx("span", { className: "text-[10px] text-[#7EB8FF]/50 uppercase tracking-widest", children: "Time Override" }),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsx("button", { className: "text-white/40 hover:text-white transition-colors", children: /* @__PURE__ */ jsx(Pause, { size: 12 }) }),
              /* @__PURE__ */ jsx("button", { className: "text-white/40 hover:text-white transition-colors", children: /* @__PURE__ */ jsx(Play, { size: 12 }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: "w-full h-2 bg-white/10 rounded-full overflow-hidden cursor-ew-resize relative group",
              onPointerDown: (e) => {
                isScrubbingRef.current = true;
                handleTimelineScrub(e);
              },
              onPointerMove: (e) => {
                if (isScrubbingRef.current) handleTimelineScrub(e);
              },
              onPointerUp: () => {
                isScrubbingRef.current = false;
              },
              onPointerLeave: () => {
                isScrubbingRef.current = false;
              },
              children: [
                /* @__PURE__ */ jsx("div", { ref: uiTimelineFill, className: "h-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-red-500", style: { width: "0%" } }),
                /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" })
              ]
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between mt-2 text-[9px] text-[#7EB8FF]/40 uppercase tracking-widest", children: [
            /* @__PURE__ */ jsx("span", { children: "Genesis" }),
            /* @__PURE__ */ jsx("span", { children: "Terminal" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "absolute bottom-0 w-full p-8 flex justify-between items-end z-20 pointer-events-none", children: [
      /* @__PURE__ */ jsxs("div", { className: "font-mono text-[10px] text-[#7EB8FF]/60 space-y-1 border-l border-[#C084FC]/50 pl-4 bg-[rgba(8,8,20,0.4)] backdrop-blur-md py-3 pr-4 rounded-r border-y-0 border-r-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-2 pb-1 border-b border-[rgba(126,184,255,0.2)]", children: [
          /* @__PURE__ */ jsx("span", { className: "inline-block w-2 h-2 rounded-full bg-[#C084FC] animate-pulse shadow-[0_0_5px_#C084FC]" }),
          /* @__PURE__ */ jsx("span", { className: "uppercase tracking-widest text-[#7EB8FF]", children: "Location" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-white", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[#7EB8FF]/70 mr-2", children: "POS_X:" }),
          /* @__PURE__ */ jsx("span", { ref: hudX, children: "0.0000" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-white", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[#7EB8FF]/70 mr-2", children: "POS_Y:" }),
          /* @__PURE__ */ jsx("span", { ref: hudY, children: "0.0000" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "text-white", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[#7EB8FF]/70 mr-2", children: "POS_Z:" }),
          /* @__PURE__ */ jsx("span", { ref: hudZ, children: "0.0000" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "px-12 py-4 bg-[rgba(8,8,20,0.6)] backdrop-blur-2xl border border-[rgba(126,184,255,0.2)] rounded-full flex flex-col items-center", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[9px] uppercase tracking-widest text-[#7EB8FF]", children: "Global Cosmic Age (Gyr)" }),
          /* @__PURE__ */ jsx("span", { className: "font-mono text-2xl font-light tracking-wider", ref: hudAge, children: "13.8000" })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-[10px] text-[#7EB8FF]/50 italic text-center max-w-sm", children: '"Select any anomalous star to inspect its lifecycle. Use mouse to rotate."' })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end gap-2 text-right", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2 pointer-events-auto", children: [
          /* @__PURE__ */ jsx("div", { className: "w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer", children: /* @__PURE__ */ jsx(Crosshair, { size: 16, className: "text-[#7EB8FF]" }) }),
          /* @__PURE__ */ jsx("div", { className: "w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer", children: /* @__PURE__ */ jsx(Navigation, { size: 16, className: "text-[#C084FC]" }) })
        ] }),
        /* @__PURE__ */ jsx("span", { className: "text-[9px] uppercase tracking-widest text-[#7EB8FF]/60 mt-1", children: "Stellar Raycasting Active" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,5,0.6)_100%)]" })
  ] });
}
