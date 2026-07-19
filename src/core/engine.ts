import * as THREE from 'three';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../types/physics';
import { CometSystem } from '../rendering/systems/CometSystem';
import { DysonSwarmSystem } from '../rendering/systems/DysonSwarmSystem';
import { AsteroidBeltSystem } from '../rendering/systems/AsteroidBeltSystem';
import { detectPerformanceTier, getNumStarsForTier } from '../utils/performance';
import { Pipeline } from '../rendering/pipeline';
import { createStellarState, advanceStellarState, StellarState, PhaseTransitionEvent, computeMainSequenceLifetime } from '../simulation/StellarPhysics';
import { PlanetarySystemQueue } from '../rendering/systems/PlanetarySystem';



export class Engine {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    pipeline: Pipeline;
    cometSystem: CometSystem;
    dysonSwarmSystem: DysonSwarmSystem;
    asteroidBeltSystem: AsteroidBeltSystem;
    heroStars: HeroStarSystem[] = [];
    activeHeroStarCount: number = 0;
    appTime: number = 0;
    highestKardashevTier: number = 0;
    isPaused: boolean = false;
    container: HTMLElement;
    private stellarState: StellarState;
    private phaseTransitionLog: PhaseTransitionEvent[] = [];

    // Decoupled Simulation States
    selectedStar: HeroStarSystem | null = null;
    isScrubbing: boolean = false;
    physicsConstants: PhysicsConstants = DEFAULT_CONSTANTS;
    cosmicAge: number = 5.0;
    timeScale: 'cosmic' | 'realtime' = 'cosmic';
    nbodyBuffer: Float32Array | null = null;
    isPlayingCosmic: boolean = true;
    isGlobalScrubbing: boolean = false;

    private _frameId: number | null = null;
    private _lastFrameTime: number = 0;

    // Tick callback for decoupled integrations
    onTick: ((delta: number, appTime: number) => void) | null = null;

    start() {
        if (this._frameId !== null) return;
        this._lastFrameTime = performance.now();
        const loop = () => {
            this._frameId = requestAnimationFrame(loop);
            if (this.renderer) {
                this.renderer.info.reset();
            }
            const now = performance.now();
            const delta = Math.max(0.001, Math.min((now - this._lastFrameTime) / 1000, 0.05));
            this._lastFrameTime = now;
            
            if (this.isPlayingCosmic && !this.isGlobalScrubbing) {
                this.cosmicAge += this.timeScale === 'cosmic' ? delta * 0.2 : (delta / 31557600) / 1e9;
                if (this.cosmicAge > 14) {
                    this.cosmicAge = 0;
                    this.respawnAllStars();
                }
            }

            this.update(delta);

            if (this.onTick) {
                this.onTick(delta, this.appTime);
            }
        };
        this._frameId = requestAnimationFrame(loop);
    }

    stop() {
        if (this._frameId !== null) {
            cancelAnimationFrame(this._frameId);
            this._frameId = null;
        }
    }

    getStellarState() { return this.stellarState; }
    getPhaseHistory() { return this.phaseTransitionLog; }

    forceSupernova() {
        // Ensure mass > 8 so supernova can physically occur, and set age exactly past main sequence lifetime
        const currentMass = this.stellarState.initialMass_solar;
        const mass = Math.max(currentMass, 8.1); 
        const tau_ms = computeMainSequenceLifetime(mass);
        
        this.stellarState = createStellarState(
            this.stellarState.id,
            mass,
            this.stellarState.metallicity_Z,
            tau_ms + 1 // Advance age to immediately trigger supernova phase
        );
    }

    advanceTime(years: number) {
        const result = advanceStellarState(this.stellarState, years);
        this.stellarState = result.state;
        if (result.event) {
            this.phaseTransitionLog.push(result.event);
            if (this.phaseTransitionLog.length > 50) this.phaseTransitionLog.shift();
        }
    }

    private _frustum = new THREE.Frustum();
    private _projScreenMatrix = new THREE.Matrix4();
    private _backgroundStarGeo: THREE.BufferGeometry;
    private _backgroundStarMat: THREE.PointsMaterial;
    private _activeStarBuffer: HeroStarSystem[] = []; // BOLT: Persistent buffer to avoid per-frame slice()

    private _insertionSort(arr: HeroStarSystem[]): void {
        const len = arr.length;
        for (let i = 1; i < len; i++) {
            const key = arr[i];
            const keyX = key.position.x;
            let j = i - 1;
            while (j >= 0 && arr[j].position.x > keyX) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;
        }
    }

    constructor(container: HTMLElement) {
        this.container = container;
        this.stellarState = createStellarState('hero_star', 1.0, 0.02, 0);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 8000);
        this.camera.position.z = 5;

        if (typeof window !== 'undefined') {
            const originalCompile = WebGLRenderingContext.prototype.compileShader;
            let isBootstrapped = false;
            // Wait 5 seconds after boot to let legitimate initial shaders load safely
            setTimeout(() => {
                isBootstrapped = true;
                console.log("=== WEBGL INTERCEPTOR ACTIVE: Tracking post-bootstrap leaks ===");
            }, 5000);
            WebGLRenderingContext.prototype.compileShader = function (this: WebGLRenderingContext, ...args: [WebGLShader]) {
                if (isBootstrapped) {
                    console.error(
                        "🚨 LEAK DETECTED: Shader compiled mid-simulation!\n",
                        "Stack Trace:\n",
                        new Error().stack
                    );
                }
                return originalCompile.apply(this, args);
            };
        }

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.info.autoReset = false;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // BOLT: Clamp to 2 for performance
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.shadowMap.enabled = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene.background = new THREE.Color(0x050510);
        this.renderer.setClearColor(0x050510, 1);
        container.appendChild(this.renderer.domElement);

        this._backgroundStarGeo = new THREE.BufferGeometry();
        this._backgroundStarMat = new THREE.PointsMaterial({ vertexColors: true, size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.9 });
        const starVertices: number[] = [];
        const starColors: number[] = [];
        const _bgStarPalette = [
            new THREE.Color(1.00, 1.00, 1.00),  // pure white
            new THREE.Color(0.90, 0.95, 1.00),  // blue-white
            new THREE.Color(1.00, 0.97, 0.88),  // warm white
            new THREE.Color(1.00, 0.88, 0.60),  // yellow
            new THREE.Color(1.00, 0.60, 0.35),  // orange
        ];
        for (let i = 0; i < 5000; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const c = _bgStarPalette[Math.floor(Math.random() * _bgStarPalette.length)];
            starVertices.push(
                4000 * Math.sin(phi) * Math.cos(theta),
                4000 * Math.sin(phi) * Math.sin(theta),
                4000 * Math.cos(phi)
            );
            starColors.push(c.r, c.g, c.b);
        }
        this._backgroundStarGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        this._backgroundStarGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
        this.scene.add(new THREE.Points(this._backgroundStarGeo, this._backgroundStarMat));

        this.pipeline = new Pipeline(this.renderer, this.scene, this.camera);
        this.cometSystem = new CometSystem(this.scene, this.camera);
        this.dysonSwarmSystem = new DysonSwarmSystem(this.scene);
        this.asteroidBeltSystem = new AsteroidBeltSystem(this.scene);
        
        const initialPhysics = { ...DEFAULT_CONSTANTS };
        this.setHeroStarCount(getNumStarsForTier(detectPerformanceTier()), initialPhysics);
    }

    createHeroStars(count: number, _physicsConstants: PhysicsConstants) {
        for (let i = 0; i < count; i++) {
            const star = new HeroStarSystem();
            const _u1 = Math.max(1e-9, Math.random());
            const _u2 = Math.random();
            const _u3 = Math.max(1e-9, Math.random());
            const _u4 = Math.random();
            const _mag1 = Math.sqrt(-2.0 * Math.log(_u1)) * 700;
            const _mag2 = Math.sqrt(-2.0 * Math.log(_u3)) * 700;
            star.position.set(
                _mag1 * Math.cos(2 * Math.PI * _u2),
                _mag2 * Math.sin(2 * Math.PI * _u4) * 0.3,
                _mag1 * Math.sin(2 * Math.PI * _u2)
            );
            this.scene.add(star);
            this.heroStars.push(star);
        }
        // BOLT: Invalidate buffer when stars are added to ensure next update rebuilds it
        this._activeStarBuffer = [];
    }

    setHeroStarCount(count: number, physicsConstants: PhysicsConstants) {
        if (count > this.heroStars.length) {
            this.createHeroStars(count - this.heroStars.length, physicsConstants);
        }
        this.activeHeroStarCount = count;
        
        for (let i = 0; i < this.heroStars.length; i++) {
            this.heroStars[i].visible = i < this.activeHeroStarCount;
        }
    }

    update(delta: number) {
        if (!this.isPaused) {
            this.appTime += delta; 
        }

        const physics = this.physicsConstants;
        const selectedStar = this.selectedStar;
        const isScrubbing = this.isScrubbing;
        const cosmicAge = this.cosmicAge;
        const timeScale = this.timeScale;
        const nbodyBuffer = this.nbodyBuffer;

        const activeCount = Math.min(this.activeHeroStarCount, this.heroStars.length);

        // Dark Matter affects background star visibility
        this._backgroundStarMat.opacity = 0.1 + (physics.darkMatter || 0) * 2.0;

        // BOLT: Sweep and Prune (X-axis spatial pruning) for star repulsion
        const softening = physics.softening || 0.1;
        if (!this.isPaused && !isScrubbing) {
            const minDist = 20 * softening;
            const minDistSq = minDist * minDist;
            const invMinDist = 1.0 / minDist;

            // BOLT: Populate persistent buffer only if count changed or invalidated.
            // Keeping the buffer across frames allows insertion sort to run in O(N).
            if (this._activeStarBuffer.length !== activeCount) {
                this._activeStarBuffer = this.heroStars.slice(0, activeCount);
            }

            // BOLT: Sort active stars by X-axis for Sweep and Prune using custom O(N) insertion sort for nearly-sorted arrays
            this._insertionSort(this._activeStarBuffer);
            for (let i = 0; i < activeCount; i++) {
                const s1 = this._activeStarBuffer[i];
                const p1 = s1.position;
                const p1x = p1.x;
                const p1y = p1.y;
                const p1z = p1.z;

                for (let j = i + 1; j < activeCount; j++) {
                    const s2 = this._activeStarBuffer[j];
                    const p2 = s2.position;

                    // BOLT: X-axis spatial pruning - since we're sorted by X and j > i,
                    // p2.x >= p1x, so dx is p1x - p2.x (negative or zero).
                    const dx = p1x - p2.x;
                    if (dx < -minDist) break; // Break early as all subsequent p2.x will be even further

                    const dy = p1y - p2.y;
                    if (dy > minDist || dy < -minDist) continue;

                    const dz = p1z - p2.z;
                    if (dz > minDist || dz < -minDist) continue;

                    let distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq < minDistSq) {
                        if (distSq === 0) distSq = 1e-6;
                        const dist = Math.sqrt(distSq);
                        const invDist = 1.0 / dist;
                        const rawMag = (minDist - dist) * invMinDist * delta * 30;
                        const f = Math.min(rawMag, 10.0) * invDist;

                        const fx = dx * f;
                        const fy = dy * f;
                        const fz = dz * f;
                        s1.velocity.x += fx;
                        s1.velocity.y += fy;
                        s1.velocity.z += fz;
                        s2.velocity.x -= fx;
                        s2.velocity.y -= fy;
                        s2.velocity.z -= fz;
                    }
                }
            }
        }

        // BOLT: Global frame calculations
        this._frustum.setFromProjectionMatrix(this._projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
        const protostarFlicker = 0.8 + 0.2 * Math.sin(this.appTime * 20.0);

        // BOLT: Constant squared thresholds for zero-sqrt checks
        const MAX_WORLD_RADIUS = 800;
        const MAX_WORLD_RADIUS_SQ = MAX_WORLD_RADIUS * MAX_WORLD_RADIUS;
        const MAX_SPEED = 2.0;
        const MAX_SPEED_SQ = MAX_SPEED * MAX_SPEED;

        for (let i = 0; i < activeCount; i++) {
            const star = this.heroStars[i];
            if (!this.isPaused && !isScrubbing) {
                star.position.x += star.velocity.x * delta;
                star.position.y += star.velocity.y * delta;
                star.position.z += star.velocity.z * delta;

                const lSq = star.position.lengthSq();
                if (lSq > MAX_WORLD_RADIUS_SQ) {
                    // BOLT: Avoid normalize() which does redundant sqrt. Use pre-calc lSq.
                    star.position.multiplyScalar(MAX_WORLD_RADIUS / Math.sqrt(lSq));
                    // Also zero out velocity to prevent bounce oscillation:
                    if (star.velocity) { star.velocity.set(0, 0, 0); }
                }

                star.velocity.multiplyScalar(0.97); // Damping

                const vSq = star.velocity.lengthSq();
                if (vSq > MAX_SPEED_SQ) {
                    // BOLT: Avoid normalize() for speed capping
                    star.velocity.multiplyScalar(MAX_SPEED / Math.sqrt(vSq));
                }
            }

            star.update(
                 this.isPaused ? 0 : delta, 
                 this.appTime,
                 this.camera.position, 
                 physics, 
                 star === selectedStar && isScrubbing ? selectedStar!.t : undefined, 
                 cosmicAge,
                 this._frustum,
                 protostarFlicker,
                 nbodyBuffer,
                 this.renderer
             );
        }

        if (!this.isPaused && !isScrubbing) {
            const deltaTime_yr = timeScale === 'cosmic' ? delta * 200000000 : delta * 1000;
            try {
                const result = advanceStellarState(this.stellarState, deltaTime_yr);
                this.stellarState = result.state;
                if (result.event) {
                    this.phaseTransitionLog.push(result.event);
                    if (this.phaseTransitionLog.length > 50) {
                        this.phaseTransitionLog.shift();
                    }
                }
                this.cometSystem.update(deltaTime_yr, this.stellarState, this.appTime);
                this.dysonSwarmSystem.update(this.highestKardashevTier, this.appTime);
                this.asteroidBeltSystem.update(this.appTime);
            } catch (error) {
                if (typeof (window as any).emitErrorOverlay === 'function') {
                    (window as any).emitErrorOverlay(error);
                }
            }
        }
        // Process queued planetary systems creation/disposal to prevent stutters
        PlanetarySystemQueue.process(this.renderer);

        // Use pipeline for rendering with post-processing - still render when paused for camera movement
        this.pipeline.render(this.appTime, delta);
    }

    respawnAllStars() {
        this.heroStars.forEach(star => {
            star.respawn(this.renderer);
        });
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.pipeline.setSize(width, height);
    }

    dispose() {
        if (this.pipeline) {
            this.pipeline.dispose();
        }
        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();

        for (let i = 0; i < this.heroStars.length; i++) {
            this.heroStars[i].dispose(this.renderer);
        }
        this.cometSystem.dispose();
        this.dysonSwarmSystem.dispose();
        this.asteroidBeltSystem.dispose();
        this._backgroundStarGeo.dispose();
        this._backgroundStarMat.dispose();
        this.heroStars = [];

        this.scene.clear();
    }
}
