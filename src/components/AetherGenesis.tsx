import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Crosshair, Navigation, Scan, Zap, Play, Pause, X, Settings2, RotateCcw } from 'lucide-react';

import { 
  IS_MOBILE, NUM_STARS, HERO_COUNT, GALAXY_ARMS, GALAXY_SPIN, 
  GALAXY_MAX_RADIUS, CORE_RADIUS, GALAXY_CYCLE, GALAXY_INV_CYCLE,
  PHASES, PHASE_NAMES 
} from '../constants/simulation';
import { GLSL_NOISE, GLSL_NOISE_SIMPLE } from '../shaders/utils/noise';
import { getStellarColor, randomGaussian } from '../utils/math';

import { starVertexShader, starFragmentShader, nebulaFS, starSurfaceFS } from '../shaders/star';
import HeroStarSystem, { GEOMETRIES } from '../simulation/HeroStarSystem';
import { CinematicPassFragment, CinematicPassVertex } from '../shaders/geometry';

const CinematicPass = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 }
  },
  vertexShader: CinematicPassVertex,
  fragmentShader: CinematicPassFragment
};

export function AetherGenesis() {
  const mountRef = useRef<HTMLDivElement>(null);
  const hudX = useRef<HTMLSpanElement>(null);
  const hudY = useRef<HTMLSpanElement>(null);
  const hudZ = useRef<HTMLSpanElement>(null);
  const hudAge = useRef<HTMLSpanElement>(null);
  const globalTimelineFillRef = useRef<HTMLDivElement>(null);
  const stellarSliderRef = useRef<HTMLDivElement>(null);
  const globalSliderRef = useRef<HTMLDivElement>(null);

  // Focus UI Refs
  const uiPhase = useRef<HTMLSpanElement>(null);
  const uiTemp = useRef<HTMLSpanElement>(null);
  const uiMass = useRef<HTMLSpanElement>(null);
  const uiAge2 = useRef<HTMLSpanElement>(null);
  const uiLum = useRef<HTMLSpanElement>(null);
  const uiTimelineFill = useRef<HTMLDivElement>(null);

  // Physical Constants State
  const [isConstantsOpen, setIsConstantsOpen] = useState(true);
  const [physics, setPhysics] = useState({
      G: 1.0,
      alpha: 1.0,
      lambda: 1.0,
      c: 1.0,
      hbar: 1.0
  });
  const physicsRef = useRef(physics);
  useEffect(() => { physicsRef.current = physics; }, [physics]);

  const [cosmicAge, setCosmicAge] = useState(13.8); // 0 to 14 Gyr
  const cosmicAgeRef = useRef(cosmicAge);
  const isGlobalScrubbingRef = useRef(false);
  const [isPlayingCosmic, setIsPlayingCosmic] = useState(true);
  const isPlayingCosmicRef = useRef(isPlayingCosmic);
  const isStarPlayingRef = useRef(true);
  const isScrubbingRef = useRef(false);
  
  useEffect(() => { cosmicAgeRef.current = cosmicAge; }, [cosmicAge]);
  useEffect(() => { isPlayingCosmicRef.current = isPlayingCosmic; }, [isPlayingCosmic]);

  const [selectedStar, setSelectedStarState] = useState<HeroStarSystem | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const selectedStarRef = useRef<HeroStarSystem | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const heroStarsRef = useRef<HeroStarSystem[]>([]);

  // Palette: Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            selectedStarRef.current = null;
            setSelectedStarState(null);
        }
        if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'BUTTON') {
            e.preventDefault();
            setIsPlayingCosmic(prev => !prev);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 180, 380);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // --- Galaxy Generation (Background) ---
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(NUM_STARS * 3);
    const colors = new Float32Array(NUM_STARS * 3);
    const sizes = new Float32Array(NUM_STARS);

    for (let i = 0; i < NUM_STARS; i++) {
        const t = Math.pow(Math.random(), 2.5);
        const baseR = t * GALAXY_MAX_RADIUS;

        const armIndex = Math.floor(Math.random() * GALAXY_ARMS);
        const armOffset = armIndex * GALAXY_CYCLE;
        const baseAngle = baseR * GALAXY_SPIN + armOffset;

        // BOLT OPTIMIZATION: Polar-Direct distribution.
        // Applying dispersion directly in polar coordinates avoids expensive Cartesian-to-Polar
        // transformations (atan2, sqrt) for all 50,000 stars.
        const rDispersion = randomGaussian(0, Math.max(1, baseR * 0.12));
        // Angle dispersion decreases as we go out to keep arm definition sharp
        const angleDispersion = randomGaussian(0, 0.2 / (1 + baseR * 0.05));

        const r = baseR + rDispersion;
        const angle = baseAngle + angleDispersion;

        const heightAmp = Math.max(1.0, 30.0 * Math.exp(-baseR * 0.025));
        const y = randomGaussian(0, heightAmp);

        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;

        const spiralPhase = angle - r * GALAXY_SPIN;
        const phaseMod = ((spiralPhase % GALAXY_CYCLE) + GALAXY_CYCLE) % GALAXY_CYCLE;
        const armFraction = phaseMod * GALAXY_INV_CYCLE;

        const isDustLane = armFraction > 0.15 && armFraction < 0.35 && r > CORE_RADIUS;
        const color = getStellarColor();
        let size = Math.random() * 1.5 + 0.2;

        if (r < CORE_RADIUS * 1.5) {
            const boost = 1.0 + (CORE_RADIUS * 1.5 - r) / CORE_RADIUS;
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
    const bgAmbientLight = new THREE.AmbientLight(0x222244, 3.0);
    scene.add(bgAmbientLight);
    const sunLight = new THREE.PointLight(0xffeedd, 4.0, 800);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // --- Hero Stars Initialization ---
    for(let i=0; i<HERO_COUNT; i++) {
        const hs = new HeroStarSystem();
        const r = 10 + Math.random() * 200; 
        const angle = Math.random() * Math.PI * 2;
        hs.position.set(
            Math.cos(angle) * r,
            (Math.random() - 0.5) * (Math.max(5, 50 - r*0.1)),
            Math.sin(angle) * r
        );
        scene.add(hs);
        heroStarsRef.current.push(hs);
    }

    // --- Post-Processing Pipeline ---
    const composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(
            IS_MOBILE ? window.innerWidth / 2 : window.innerWidth,
            IS_MOBILE ? window.innerHeight / 2 : window.innerHeight
        ),
        IS_MOBILE ? 0.8 : 1.6,
        IS_MOBILE ? 0.2 : 0.4,
        IS_MOBILE ? 0.4 : 0.1
    );
    bloomPass.strength = IS_MOBILE ? 0.6 : 1.2;
    bloomPass.radius = IS_MOBILE ? 0.4 : 0.6;
    bloomPass.threshold = IS_MOBILE ? 0.4 : 0.2;

    const cinematicShader = new ShaderPass(CinematicPass);

    composer.addPass(bloomPass);
    if (!IS_MOBILE) {
        composer.addPass(cinematicShader);
    }

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
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

        // Palette: Add hover feedback for interactive stars
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(heroStarsRef.current.map(h => h.hitMesh));
        renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'crosshair';
    };

    const onPointerUp = (e: PointerEvent) => {
        if (isDragging || e.button !== 0) return;
        
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const hitMeshes = heroStarsRef.current.map(h => h.hitMesh);
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

    /**
     * BOLT: Utility to update DOM content only when it changes, reducing reflows and repaints.
     * Uses textContent for better performance than innerText.
     */
    const setHUD = (ref: React.RefObject<HTMLElement | null>, value: string | number) => {
        if (!ref.current) return;
        const s = value.toString();
        if (ref.current.textContent !== s) {
            ref.current.textContent = s;
        }
    };

    const animate = () => {
        frameId = requestAnimationFrame(animate);
        let delta = Math.min(clock.getDelta(), 0.05);
        appTime += delta;

        // Auto play cosmic Age if playing
        if (isPlayingCosmicRef.current && !isGlobalScrubbingRef.current) {
            cosmicAgeRef.current += delta * 0.2; // 0.2 Gyr per second
            if (cosmicAgeRef.current > 14) {
                 cosmicAgeRef.current = 0; // Loop universe
            }
            // BOLT OPTIMIZATION: Use direct DOM manipulation for the global timeline to eliminate periodic React re-renders during the simulation loop.
            if (globalTimelineFillRef.current) {
                globalTimelineFillRef.current.style.width = `${(cosmicAgeRef.current / 14.0) * 100}%`;
            }
            if (globalSliderRef.current) {
                globalSliderRef.current.setAttribute('aria-valuenow', cosmicAgeRef.current.toFixed(2));
            }

            // BOLT: Throttled state update (once per second) to keep ARIA attributes and React state in sync without harming performance.
            if (Math.floor(appTime) !== Math.floor(appTime - delta)) {
                setCosmicAge(cosmicAgeRef.current);
            }
        }

        // Supernova global flash logic
        let highBloom = false;

        heroStarsRef.current.forEach(hs => {
            if (hs === selectedStarRef.current) {
                if (!isScrubbingRef.current && isStarPlayingRef.current) {
                    const effG = Math.max(0.01, physicsRef.current.G);
                    hs.t += (delta * 200) / (hs.lifespanReal / effG);
                }
                hs.update(delta, appTime, camera.position, physicsRef.current, hs.t);
            } else {
                hs.update(delta, appTime, camera.position, physicsRef.current, undefined, cosmicAgeRef.current);
            }
            if (hs.isSupernovaFlashing) highBloom = true;
        });

        // Global Early Universe Plasma Logic
        if (cosmicAgeRef.current < 0.2) {
             const tEarly = cosmicAgeRef.current / 0.2;
             scene.background = new THREE.Color(0xffffff).lerp(new THREE.Color(0x000000), tEarly);
             bloomPass.strength = THREE.MathUtils.lerp(3.0, 1.2, tEarly);
        } else if (highBloom) {
            bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 3.5, 0.2);
        } else {
            bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 1.2, 0.05);
            scene.background = new THREE.Color(0x000000);
        }

        controls.update();
        cinematicShader.uniforms.time.value = appTime;

        // Apply Speed of Light (c) effect on Space
        const currentC = Math.max(0.1, physicsRef.current.c);
        const targetFov = 60 / currentC;
        camera.fov = THREE.MathUtils.lerp(camera.fov, Math.max(10, Math.min(150, targetFov)), 0.05);
        camera.updateProjectionMatrix();

        // Update HUD
        if (hudX.current) hudX.current.innerText = camera.position.x.toFixed(4);
        if (hudY.current) hudY.current.innerText = camera.position.y.toFixed(4);
        if (hudZ.current) hudZ.current.innerText = camera.position.z.toFixed(4);
        const cage = cosmicAgeRef.current.toFixed(2);
        if (hudAge.current) hudAge.current.innerText = cage;
        if (globalSliderRef.current) {
            globalSliderRef.current.setAttribute('aria-valuenow', cage);
            globalSliderRef.current.setAttribute('aria-valuetext', `${cage} Gigayears`);
        }

        // Update Selected Star UI Panel dynamically to save React renders
        if (selectedStarRef.current) {
            const s = selectedStarRef.current;
            if (uiPhase.current) uiPhase.current.innerText = PHASE_NAMES[s.phase];
            if (uiTemp.current) uiTemp.current.innerText = Math.round(s.currentTemp).toLocaleString();
            if (uiMass.current) uiMass.current.innerText = s.mass.toFixed(2);
            if (uiAge2.current) uiAge2.current.innerText = s.currentRealAge.toFixed(1);
            if (uiLum.current) uiLum.current.innerText = s.currentLum.toFixed(3);
            const perc = Math.round(s.t * 100);
            if (uiTimelineFill.current) uiTimelineFill.current.style.width = `${perc}%`;
            if (stellarSliderRef.current) {
                stellarSliderRef.current.setAttribute('aria-valuenow', perc.toString());
                stellarSliderRef.current.setAttribute('aria-valuetext', `${PHASE_NAMES[s.phase]}, ${perc}% complete`);
            }
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
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      cancelAnimationFrame(frameId);
      
      composer.dispose();
      controls.dispose();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      scene.clear();

      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }

      heroStarsRef.current.forEach(hs => {
          hs.traverse((child) => {
              if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
                  if (child.geometry && !Object.values(GEOMETRIES).includes(child.geometry as any)) {
                      child.geometry.dispose();
                  }
                  if (Array.isArray(child.material)) {
                      child.material.forEach(m => m.dispose());
                  } else if (child.material) {
                      child.material.dispose();
                  }
              }
          });
      });
    };
  }, []);

  // --- Scrubber Interaction ---
  
  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selectedStarRef.current || !isScrubbingRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      selectedStarRef.current.t = percentage;

      // Update ARIA attributes directly for immediate screen reader feedback
      const slider = e.currentTarget;
      slider.setAttribute('aria-valuenow', Math.round(percentage * 100).toString());
      slider.setAttribute('aria-valuetext', PHASE_NAMES[selectedStarRef.current.phase]);
  };

  const handleGlobalTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isGlobalScrubbingRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      const newAge = percentage * 14.0;
      setCosmicAge(newAge);
      cosmicAgeRef.current = newAge;

      // Update ARIA attributes directly
      e.currentTarget.setAttribute('aria-valuenow', newAge.toFixed(2));
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [geminiData, setGeminiData] = useState<any>(null);
  const lastAnalysisTimeRef = useRef(0);

  const analyzeSystem = async () => {
    if (!selectedStar || isAnalyzing) return;

    // Security: Implement 5s throttle to prevent API abuse
    const now = Date.now();
    if (now - lastAnalysisTimeRef.current < 5000) {
      return;
    }
    lastAnalysisTimeRef.current = now;

    try {
      setIsAnalyzing(true);

      const payload = {
        temp: Math.round(selectedStar.currentTemp),
        mass: parseFloat(selectedStar.mass.toFixed(2)),
        lum: parseFloat(selectedStar.currentLum.toFixed(3)),
        age: parseFloat(selectedStar.currentRealAge.toFixed(1)),
        phase: PHASE_NAMES[selectedStar.phase],
        G: physics.G.toFixed(2),
        alpha: physics.alpha.toFixed(2)
      };

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setGeminiData(data);
      setAnalysisFailed(false);
    } catch (err) {
      // Security: Do not leak raw error details or stack traces to the console in production
      // Using generic logs and mock fallback for resilience
      console.warn("Analysis unavailable - using predictive fallback.");
      setAnalysisFailed(true);

      setGeminiData({
        planet_name: "Kerath-7",
        life_stage: 4,
        dominant_species: "Silicate Swarm",
        civilization: "Post-Scarcity Hive",
        biome: "Crystalline Deserts",
        isFallback: true,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Clear gemini data when star selection changes
  useEffect(() => {
      setGeminiData(null);
      setAnalysisFailed(false);
  }, [selectedStar]);

  return (
    <div className="relative w-full h-screen bg-[#020205] overflow-hidden flex flex-col font-sans text-white select-none">
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair z-0" />

      {/* Top HUD */}
      <nav className="absolute top-0 w-full p-4 md:p-8 flex justify-between items-start z-20 pointer-events-none">
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
            <span className="font-mono text-sm">500,000 <span className="text-[#C084FC]">★</span></span>
          </div>
          <div className="w-[1px] h-6 bg-[rgba(126,184,255,0.2)]"></div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Simulation Subjects</span>
            <span className="font-mono text-sm">{HERO_COUNT} Hero Stars</span>
          </div>
        </div>
      </nav>

      {/* Physical Constants Control Panel */}
      {isConstantsOpen ? (
        <div className="absolute left-8 top-32 w-[min(320px,85vw)] bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto">            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold tracking-widest uppercase text-white flex items-center gap-3">
                        <Settings2 size={20} className="text-[#C084FC]" />
                        Constants
                    </h2>
                    <button
                        onClick={() => setPhysics({ G: 1.0, alpha: 1.0, lambda: 1.0, c: 1.0, hbar: 1.0 })}
                        className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded"
                        aria-label="Reset Physics Constants"
                        title="Reset to Defaults"
                    >
                        <RotateCcw size={16} />
                    </button>
                </div>
                <button
                    onClick={() => setIsConstantsOpen(false)}
                    className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded"
                    aria-label="Close Physical Constants"
                >
                    <X size={20} />
                </button>
            </div>
            <div className="space-y-4 text-xs font-mono">
                {/* G Slider */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-g">Gravitation (G)</label>
                        <span>{physics.G.toFixed(2)}</span>
                    </div>
                    <input id="slider-g" type="range" min="0.1" max="5.0" step="0.1" value={physics.G}
                        onChange={e => setPhysics({...physics, G: parseFloat(e.target.value)})} className="w-full accent-[#C084FC]" />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">G ↑ stars collapse faster, G ↓ cold dwarfs</p>
                </div>
                {/* Alpha */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-alpha">Fine-Structure (α)</label>
                        <span>{physics.alpha.toFixed(2)}</span>
                    </div>
                    <input id="slider-alpha" type="range" min="0.1" max="2.0" step="0.1" value={physics.alpha}
                        onChange={e => setPhysics({...physics, alpha: parseFloat(e.target.value)})} className="w-full accent-[#C084FC]" />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">α ↑ chemistry breaks, α ↓ radiation univ</p>
                </div>
                {/* Lambda */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-lambda">Cosmological (Λ)</label>
                        <span>{physics.lambda.toFixed(2)}</span>
                    </div>
                    <input id="slider-lambda" type="range" min="0.1" max="3.0" step="0.1" value={physics.lambda}
                        onChange={e => setPhysics({...physics, lambda: parseFloat(e.target.value)})} className="w-full accent-[#C084FC]" />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">Λ ↑ space expands, Λ ↓ crunch</p>
                </div>
                {/* c */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-c">Speed of Light (c)</label>
                        <span>{physics.c.toFixed(2)}</span>
                    </div>
                    <input id="slider-c" type="range" min="0.1" max="3.0" step="0.1" value={physics.c}
                        onChange={e => setPhysics({...physics, c: parseFloat(e.target.value)})} className="w-full accent-[#C084FC]" />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">c ↑ universe looks flatter</p>
                </div>
                {/* hbar */}
                <div>
                    <div className="flex justify-between text-[#7EB8FF] mb-2">
                        <label htmlFor="slider-hbar">Planck Constant (ħ)</label>
                        <span>{physics.hbar.toFixed(2)}</span>
                    </div>
                    <input id="slider-hbar" type="range" min="0.0" max="3.0" step="0.1" value={physics.hbar}
                        onChange={e => setPhysics({...physics, hbar: parseFloat(e.target.value)})} className="w-full accent-[#C084FC]" />
                    <p className="text-[9px] text-[#7EB8FF]/50 mt-1">ħ ↑ quantum foam visible</p>
                </div>
            </div>
        </div>
      ) : (
        <button 
            onClick={() => setIsConstantsOpen(true)} 
            className="absolute left-8 top-32 bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-full p-4 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto text-[#7EB8FF]/70 hover:text-white group focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
            title="Open Physical Constants"
            aria-label="Open Physical Constants"
        >
            <Settings2 size={24} className="group-hover:text-[#C084FC] transition-colors" />
        </button>
      )}

      {/* Stellar Lifecycle Inspect Panel (Frosted Glass Theme) */}
      {selectedStar && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-[min(320px,85vw)] overflow-hidden bg-[rgba(14,14,28,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.3)] rounded-2xl p-6 z-30 shadow-[0_0_30px_rgba(0,0,0,0.5)] transform transition-all pointer-events-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[rgba(126,184,255,0.1)]">
                <div className="flex items-center gap-3">
                    <Scan size={20} className="text-[#C084FC]" />
                    <h2 className="text-sm font-bold tracking-widest uppercase text-white">Stellar Telemetry</h2>
                </div>
                <button
                    onClick={() => {
                        selectedStarRef.current = null;
                        setSelectedStarState(null);
                    }}
                    className="text-[#7EB8FF]/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded"
                    aria-label="Close Stellar Telemetry"
                    title="Close Telemetry"
                >
                    <X size={20} />
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
                            <button 
                                onClick={() => isStarPlayingRef.current = false}
                                className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded" 
                                aria-label="Pause star animation"
                                title="Pause Star Animation"
                            >
                                <Pause size={12} />
                            </button>
                            <button 
                                onClick={() => isStarPlayingRef.current = true}
                                className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded" 
                                aria-label="Play star animation"
                                title="Play Star Animation"
                            >
                                <Play size={12} />
                            </button>
                        </div>                    </div>
                    {/* Scrubbable Timeline */}
                    <div 
                        ref={stellarSliderRef}
                        role="slider"
                        tabIndex={0}
                        aria-label="Stellar lifecycle timeline"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={selectedStar ? Math.round(selectedStar.t * 100) : 0}
                        aria-valuetext={selectedStar ? PHASE_NAMES[selectedStar.phase] : ""}
                        className="w-full h-2 bg-white/10 rounded-full overflow-hidden cursor-ew-resize relative group focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
                        onPointerDown={(e) => { isScrubbingRef.current = true; handleTimelineScrub(e); }}
                        onPointerMove={(e) => { if(isScrubbingRef.current) handleTimelineScrub(e); }}
                        onPointerUp={() => { isScrubbingRef.current = false; }}
                        onPointerLeave={() => { isScrubbingRef.current = false; }}
                        onKeyDown={(e) => {
                          if (!selectedStarRef.current) return;
                          if (e.key === 'ArrowRight') {
                            e.preventDefault();
                            selectedStarRef.current.t = Math.min(1, selectedStarRef.current.t + 0.01);
                          }
                          if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            selectedStarRef.current.t = Math.max(0, selectedStarRef.current.t - 0.01);
                          }
                          if (e.key === 'Home') { e.preventDefault(); selectedStarRef.current.t = 0; }
                          if (e.key === 'End') { e.preventDefault(); selectedStarRef.current.t = 1; }
                        }}
                    >
                        <div ref={uiTimelineFill} className="h-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-red-500" style={{width: '0%'}}></div>
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] text-[#7EB8FF]/40 uppercase tracking-widest">
                        <span>Genesis</span>
                        <span>Terminal</span>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[rgba(126,184,255,0.1)]">
                    <button 
                        onClick={analyzeSystem}
                        disabled={isAnalyzing}
                        className="w-full py-2 bg-[#C084FC]/20 hover:bg-[#C084FC]/40 text-[#C084FC] hover:text-white border border-[#C084FC]/30 rounded transition-colors text-[10px] uppercase tracking-widest disabled:opacity-50"
                    >
                        {isAnalyzing ? "Analyzing System..." : "Gemini AI: Deep Scan"}
                    </button>
                    {geminiData && (
                        <div className="mt-4 p-3 bg-black/40 border border-[#7EB8FF]/20 rounded text-[10px] space-y-2">
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Planet:</span> {geminiData.planet_name}</div>
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Biome:</span> {geminiData.biome}</div>
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Species:</span> {geminiData.dominant_species} (Stage {geminiData.life_stage})</div>
                            <div className="text-white"><span className="text-[#7EB8FF]/70">Civilization:</span> {geminiData.civilization}</div>
                            {analysisFailed && (
                              <p className="text-[9px] text-yellow-400/70 mt-3 italic">
                                ⚠ Predictive fallback — AI scan unavailable
                              </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Bottom HUD */}
      <div className="absolute bottom-0 w-full p-8 flex justify-between items-end z-20 pointer-events-none">
        <div className="font-mono text-[10px] text-[#7EB8FF]/60 space-y-1 border-l border-[#C084FC]/50 pl-4 bg-[rgba(8,8,20,0.4)] backdrop-blur-md py-3 pr-4 rounded-r border-y-0 border-r-0">
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-[rgba(126,184,255,0.2)]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#C084FC] animate-pulse shadow-[0_0_5px_#C084FC]" />
            <span className="uppercase tracking-widest text-[#7EB8FF]">Location</span>
          </div>
          <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_X:</span><span ref={hudX}>0.0000</span></div>
          <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Y:</span><span ref={hudY}>0.0000</span></div>
          <div className="text-white"><span className="text-[#7EB8FF]/70 mr-2">POS_Z:</span><span ref={hudZ}>0.0000</span></div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 w-1/3 pointer-events-auto">
          <div className="w-full px-8 py-4 bg-[rgba(8,8,20,0.6)] backdrop-blur-2xl border border-[rgba(126,184,255,0.2)] rounded-2xl flex flex-col items-center group">
            <div className="flex justify-between w-full items-center mb-3">
                <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]">Global Cosmic Age (Gyr)</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsPlayingCosmic(!isPlayingCosmic)}
                        className="text-white/40 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none rounded"
                        aria-label={isPlayingCosmic ? "Pause cosmic simulation" : "Play cosmic simulation"}
                        title={isPlayingCosmic ? "Pause Cosmic Simulation" : "Play Cosmic Simulation"}
                    >
                        {isPlayingCosmic ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                </div>
            </div>
            
            <div 
                ref={globalSliderRef}
                role="slider"
                tabIndex={0}
                aria-label="Global cosmic age timeline"
                aria-valuemin={0}
                aria-valuemax={14}
                aria-valuenow={parseFloat(cosmicAge.toFixed(2))}
                className="w-full h-3 bg-white/10 rounded-full overflow-hidden cursor-ew-resize relative focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
                onPointerDown={(e) => { isGlobalScrubbingRef.current = true; handleGlobalTimelineScrub(e); }}
                onPointerMove={(e) => { if(isGlobalScrubbingRef.current) handleGlobalTimelineScrub(e); }}
                onPointerUp={() => { isGlobalScrubbingRef.current = false; }}
                onPointerLeave={() => { isGlobalScrubbingRef.current = false; }}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') { e.preventDefault(); const v = Math.min(14, cosmicAgeRef.current + 0.1); setCosmicAge(v); cosmicAgeRef.current = v; }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); const v = Math.max(0, cosmicAgeRef.current - 0.1); setCosmicAge(v); cosmicAgeRef.current = v; }
                    if (e.key === 'Home') { e.preventDefault(); setCosmicAge(0); cosmicAgeRef.current = 0; }
                    if (e.key === 'End') { e.preventDefault(); setCosmicAge(14); cosmicAgeRef.current = 14; }
                }}
            >
                <div ref={globalTimelineFillRef} className="h-full bg-gradient-to-r from-[#7EB8FF] to-[#C084FC]" style={{width: `${(cosmicAge / 14.0) * 100}%`}}></div>
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <span className="font-mono text-2xl font-light tracking-wider mt-2" ref={hudAge}>{cosmicAge.toFixed(2)}</span>
          </div>
          <p className="text-[10px] text-[#7EB8FF]/50 italic text-center pointer-events-none">"Scrub to T=0 to observe pre-stellar plasma state."</p>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <div className="grid grid-cols-2 gap-2 pointer-events-auto">
            <button
              aria-label="Reset camera view"
              title="Reset Camera View"
              onClick={() => {
                  controlsRef.current?.reset();
              }}
              className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
            >
              <Crosshair size={16} className="text-[#7EB8FF]" />
            </button>
            <button
              aria-label="Toggle navigation aids"
              title="Navigation Aids (Coming Soon)"
              className="w-10 h-10 flex items-center justify-center bg-[rgba(8,8,20,0.6)] border border-[rgba(126,184,255,0.2)] rounded-md backdrop-blur-md transition-colors hover:bg-[rgba(126,184,255,0.1)] cursor-not-allowed opacity-50 focus-visible:ring-2 focus-visible:ring-[#C084FC] outline-none"
            >
              <Navigation size={16} className="text-[#C084FC]" />
            </button>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-[#7EB8FF]/60 mt-1">Stellar Raycasting Active</span>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,2,5,0.6)_100%)]"></div>
    </div>
  );
}
