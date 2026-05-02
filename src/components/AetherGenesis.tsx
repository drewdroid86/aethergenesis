import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ---- Constants & Math Utilities ----
const IS_MOBILE = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const NUM_STARS = IS_MOBILE ? 15000 : 100000;
const HERO_COUNT = IS_MOBILE ? 6 : 12;
const GALAXY_ARMS = 5;
const GALAXY_SPIN = -0.15;
const GALAXY_MAX_RADIUS = 350;
const CORE_RADIUS = 25;

const HERO_NAMES = [
  "Aetherius", "Genesis Prime", "Nova Custos", "Luminalis", "Vespera", "Aethelgard",
  "Chronos Prime", "Helios-9", "Selene Alpha", "Eos Major", "Nyx Minor", "Chaos Core"
];

interface StarInfo {
  name: string;
  distance: string;
  temperature: string;
  magnitude: string;
}

// Box-Muller transform for normal distribution
function randomGaussian(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

// IMF (Initial Mass Function) Color Probability
function getStellarColor(isHero = false) {
  if (isHero) return new THREE.Color(0xffffff); // Hero stars are brilliant white
  const r = Math.random();
  if (r < 0.00003) return new THREE.Color(0x9db4ff); // O-Type (Rare Blue)
  if (r < 0.0013) return new THREE.Color(0xa2b9ff); // B-Type (Blue-White)
  if (r < 0.0073) return new THREE.Color(0xffffff); // A-Type (White)
  if (r < 0.0373) return new THREE.Color(0xfff4ea); // F-Type (Yellow-White)
  if (r < 0.1133) return new THREE.Color(0xffd2a1); // G-Type (Yellow)
  if (r < 0.2343) return new THREE.Color(0xffa351); // K-Type (Orange)
  return new THREE.Color(0xff4422); // M-Type (Red Dwarf)
}

// Custom Shaders
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
    time: { value: 0 },
    uGrain: { value: IS_MOBILE ? 0.0 : 0.04 }
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
    uniform float uGrain;
    varying vec2 vUv;

    // High-frequency random noise generator
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
      float grain = (random(uv + fract(time)) - 0.5) * uGrain;
      color += grain;

      // Vignette
      float dist = distance(uv, vec2(0.5));
      color *= smoothstep(0.8, 0.2, dist * 1.1);

      gl_FragColor = vec4(color, 1.0);
    }
  `
};

export function AetherGenesis() {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudX = useRef<HTMLSpanElement>(null);
  const hudY = useRef<HTMLSpanElement>(null);
  const hudZ = useRef<HTMLSpanElement>(null);
  const hudAge = useRef<HTMLSpanElement>(null);
  const [selectedStar, setSelectedStar] = useState<StarInfo | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 150, 400);

    const renderer = new THREE.WebGLRenderer({ 
        antialias: false, 
        powerPreference: "high-performance",
        precision: IS_MOBILE ? "mediump" : "highp"
    });
    renderer.setPixelRatio(IS_MOBILE ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // --- Galaxy Generation ---
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(NUM_STARS * 3);
    const colors = new Float32Array(NUM_STARS * 3);
    const sizes = new Float32Array(NUM_STARS);

    for (let i = 0; i < NUM_STARS; i++) {
        const isHero = i < HERO_COUNT;
        
        // Density power law: push points towards the center
        const t = Math.pow(Math.random(), 2.5);
        const r = isHero ? (Math.random() * 50 + 20) : (t * GALAXY_MAX_RADIUS);

        // Logarithmic spiral angle + random offset for arms
        const armIndex = Math.floor(Math.random() * GALAXY_ARMS);
        const armOffset = (armIndex / GALAXY_ARMS) * Math.PI * 2;
        const baseAngle = r * GALAXY_SPIN + armOffset;

        // Dispersion based on distance.
        const armDispersion = Math.max(1, r * 0.12);

        // Core bulge (spherical at center, flattening into disk)
        const bulgeAmp = 30.0 * Math.exp(-r / 40.0);
        const xzDispersion = Math.sqrt(armDispersion * armDispersion + bulgeAmp * bulgeAmp);
        const yDispersion = Math.max(1.0, bulgeAmp);

        let x = Math.cos(baseAngle) * r + randomGaussian(0, isHero ? 5 : xzDispersion);
        let z = Math.sin(baseAngle) * r + randomGaussian(0, isHero ? 5 : xzDispersion);
        let y = randomGaussian(0, isHero ? 5 : yDispersion);

        // Calculate phase for dust lanes based on final positions
        const ptAngle = Math.atan2(z, x);
        const ptDist = Math.sqrt(x * x + z * z);
        const spiralPhase = ptAngle - ptDist * GALAXY_SPIN;

        const cycle = Math.PI * 2 / GALAXY_ARMS;
        const phaseMod = ((spiralPhase % cycle) + cycle) % cycle;
        const armFraction = phaseMod / cycle; // 0 to 1

        const isDustLane = !isHero && armFraction > 0.15 && armFraction < 0.35 && ptDist > CORE_RADIUS;

        const color = getStellarColor(isHero);
        let size = isHero ? (Math.random() * 3 + 4) : (Math.random() * 1.5 + 0.2);

        if (!isHero && ptDist < CORE_RADIUS * 1.5) {
            // Intense core glow
            const boost = 1.0 + (CORE_RADIUS * 1.5 - ptDist) / (CORE_RADIUS);
            color.multiplyScalar(boost);
            color.r += 0.2;
            color.g += 0.1;
            size *= 1.5;
        }

        if (isDustLane) {
            // Extinction (darkening and reddening by dust)
            const extinction = 0.05 + Math.random() * 0.05;
            color.multiplyScalar(extinction);
            color.g *= 0.6; // Let red pass through more
            color.b *= 0.3;
            size *= 0.5; // Dust obscures size
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

    // --- Post-Processing Pipeline ---
    const composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.6, 0.4, 0.1);
    bloomPass.strength = IS_MOBILE ? 0.6 : 1.2;
    bloomPass.radius = IS_MOBILE ? 0.3 : 0.6;
    bloomPass.threshold = 0.2;
    composer.addPass(bloomPass);

    const cinematicShader = new ShaderPass(CinematicPass);
    composer.addPass(cinematicShader);

    // --- Controls & Atmosphere ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.03;
    controls.maxDistance = 1000;
    controls.minDistance = 5;

    // Interaction Support
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 2.0;
    const mouse = new THREE.Vector2();

    const onSelect = (event: PointerEvent) => {
        // Standardize coordinates for raycaster
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(starfield);

        if (intersects.length > 0) {
            const index = intersects[0].index;
            if (index !== undefined && index < HERO_COUNT) {
                const pos = intersects[0].point;
                const dist = pos.length().toFixed(2);
                const temp = (Math.random() * 20000 + 3000).toFixed(0);
                const mag = (Math.random() * 5 - 2).toFixed(2);

                setSelectedStar({
                    name: HERO_NAMES[index % HERO_NAMES.length],
                    distance: `${dist} LY`,
                    temperature: `${temp} K`,
                    magnitude: mag
                });
                return;
            }
        }
        setSelectedStar(null);
    };

    renderer.domElement.addEventListener('pointerdown', onSelect);

    let idleTime = 0;
    let clock = new THREE.Clock();

    const resetIdle = () => {
        idleTime = 0;
        controls.autoRotate = false;
    };

    window.addEventListener('pointermove', resetIdle);
    window.addEventListener('wheel', resetIdle);
    window.addEventListener('touchstart', resetIdle);

    // --- Animation Loop ---
    let frameId: number;
    let appTime = 0;
    const animate = () => {
        frameId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        appTime += delta;

        idleTime += delta;
        if (idleTime > 4.0) {
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.3; // Very slow cinematic float
        }

        controls.update();

        // Update Shader Uniform
        cinematicShader.uniforms.time.value = appTime;

        // Update HUD
        if (hudX.current) hudX.current.innerText = camera.position.x.toFixed(4);
        if (hudY.current) hudY.current.innerText = camera.position.y.toFixed(4);
        if (hudZ.current) hudZ.current.innerText = camera.position.z.toFixed(4);
        if (hudAge.current) hudAge.current.innerText = (13.8 + appTime * 0.0001).toFixed(4);

        composer.render();
    };

    animate();

    // --- Resize Handler ---
    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('pointermove', resetIdle);
        window.removeEventListener('wheel', resetIdle);
        window.removeEventListener('touchstart', resetIdle);
        renderer.domElement.removeEventListener('pointerdown', onSelect);
        cancelAnimationFrame(frameId);
        
        if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
            mountRef.current.removeChild(renderer.domElement);
        }
        
        geometry.dispose();
        material.dispose();
        controls.dispose();
        composer.dispose();
        renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none">
      {/* Galactic Core Background Simulation */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-600 rounded-[100%] blur-[120px] rotate-12"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] bg-fuchsia-500 rounded-[100%] blur-[100px] -rotate-12 opacity-60"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120px] h-[120px] bg-white rounded-full blur-[60px] opacity-80"></div>
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
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair z-0 touch-none" />

      {/* HUD: Top Bar */}
      <nav className="absolute top-0 w-full p-8 flex justify-between items-start z-20 pointer-events-none">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse"></div>
            <h1 className="text-xl font-bold tracking-[0.3em] uppercase">ÆTHERGENESIS</h1>
          </div>
          <span className="text-[10px] text-indigo-300/60 uppercase tracking-[0.2em] ml-6">
            Simulation Phase 01: Singularity Initiation
          </span>
        </div>
        
        <div className="flex items-center gap-12 bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-6 py-3">
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-indigo-200/50">Stellar Mass</span>
            <span className="font-mono text-sm">{NUM_STARS.toLocaleString()} <span className="text-indigo-400">★</span></span>
          </div>
          <div className="w-[1px] h-6 bg-white/10"></div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-indigo-200/50">Expansion Rate</span>
            <span className="font-mono text-sm pl-2">H₀: <span className="text-indigo-400">67.4</span></span>
          </div>
          <div className="w-[1px] h-6 bg-white/10"></div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-indigo-200/50">Renderer</span>
            <span className="font-mono text-sm text-indigo-100">WebGL 2.0</span>
          </div>
        </div>
      </nav>

      {/* Star Information HUD */}
      {selectedStar && (
        <div className="absolute top-24 right-8 w-64 p-6 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl z-30 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-indigo-400 mb-1">Celestial Object</div>
                    <div className="text-lg font-bold tracking-tight">{selectedStar.name}</div>
                </div>
                <button 
                    onClick={() => setSelectedStar(null)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-[8px] uppercase tracking-tighter text-white/40 mb-0.5">Distance</div>
                        <div className="text-xs font-mono">{selectedStar.distance}</div>
                    </div>
                    <div>
                        <div className="text-[8px] uppercase tracking-tighter text-white/40 mb-0.5">Temperature</div>
                        <div className="text-xs font-mono">{selectedStar.temperature}</div>
                    </div>
                </div>
                <div>
                    <div className="text-[8px] uppercase tracking-tighter text-white/40 mb-0.5">Absolute Magnitude</div>
                    <div className="text-xs font-mono">{selectedStar.magnitude}</div>
                </div>
                <div className="h-[1px] w-full bg-white/10"></div>
                <p className="text-[9px] text-white/50 leading-relaxed">
                    Classified as a "Hero Star", this entity maintains the structural integrity of the local gravitational field.
                </p>
            </div>
        </div>
      )}

      {/* HUD: Bottom Layout */}
      <div className="absolute bottom-0 w-full p-8 flex justify-between items-end z-20 pointer-events-none">
        {/* Coordinates Display */}
        <div className="font-mono text-[10px] text-white/40 space-y-1 border-l border-indigo-500/50 pl-4 w-48">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_5px_rgba(99,102,241,0.5)]" />
            <span className="uppercase tracking-widest text-white/50 text-[9px] font-sans">Sensors Active</span>
          </div>
          <div>GAL_X: <span ref={hudX} className="text-white/80">0.0000</span></div>
          <div>GAL_Y: <span ref={hudY} className="text-white/80">0.0000</span></div>
          <div>GAL_Z: <span ref={hudZ} className="text-white/80">0.0000</span></div>
        </div>

        {/* Main Action Prompt / Cosmic Age */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
          <div className="px-10 py-4 bg-indigo-600/20 backdrop-blur-2xl border border-indigo-500/50 rounded-full flex flex-col items-center hover:bg-indigo-600/40 transition-all pointer-events-auto cursor-pointer">
            <span className="text-[9px] uppercase tracking-widest text-indigo-200/50 -mt-1 mb-1">Cosmic Age (Gyr)</span>
            <span className="font-mono text-xl font-light tracking-[0.2em]" ref={hudAge}>13.8000</span>
          </div>
          <p className="text-[10px] text-white/30 italic">"Before the first light — there was a choice"</p>
        </div>

        {/* Camera Controls Mockup */}
        <div className="flex flex-col items-end gap-2 text-right pointer-events-none w-48">
          <div className="grid grid-cols-2 gap-2 pointer-events-auto">
            <div className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-md backdrop-blur-md">
              <div className="w-4 h-4 border-2 border-white/40 rounded-full"></div>
            </div>
            <div className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-md backdrop-blur-md">
              <div className="w-1 h-4 bg-white/40"></div>
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-white/40">Camera Damping: Active</span>
        </div>
      </div>

      {/* Vignette Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"></div>
    </div>
  );
}
