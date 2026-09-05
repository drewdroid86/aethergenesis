import * as THREE from 'three';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../types/physics';
import { CometSystem } from '../rendering/systems/CometSystem';
import { DysonSwarmSystem } from '../rendering/systems/DysonSwarmSystem';
import { AsteroidBeltSystem } from '../rendering/systems/AsteroidBeltSystem';
import { detectPerformanceTier, getNumStarsForTier } from '../utils/performance';
import { Pipeline } from '../rendering/pipeline';
import { createStellarState, StellarState, StellarPhase, PhaseTransitionEvent, computeMainSequenceLifetime } from '../simulation/StellarPhysics';
import { STELLAR_CONSTANTS } from './constants';
import { PlanetarySystemQueue } from '../rendering/systems/PlanetarySystem';



/** Maximum number of simultaneous THREE.PointLights allowed in the scene.
 *  Prevents exceeding MAX_FRAGMENT_UNIFORM_VECTORS(1024) on MeshStandardMaterial planets. */
const MAX_ACTIVE_POINT_LIGHTS = 12;

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

    getStellarState(): StellarState {
        const star = this.selectedStar || this.heroStars[0];
        if (star) {
            const state = createStellarState(
                star.physicsId,
                star.mass,
                0.02,
                star.currentRealAge * 1e6
            );
            const phaseStrMap: Record<number, StellarPhase> = {
                0: 'nebula',
                1: 'protostar',
                2: 'main_sequence',
                3: 'red_giant',
                4: 'supernova',
                5: 'remnant'
            };
            if (phaseStrMap[star.phase]) {
                state.phase = phaseStrMap[star.phase];
            }
            return state;
        }
        return createStellarState('hero_star', 1.0, 0.02, 0);
    }
    getPhaseHistory() { return this.phaseTransitionLog; }

    forceSupernova() {
        const star = this.selectedStar || this.heroStars[0];
        if (!star) return;

        // Ensure mass >= 8.1 so supernova can physically occur
        const mass = Math.max(star.mass, 8.1);
        star.mass = mass;
        star.lifespanReal = computeMainSequenceLifetime(mass) / 1e6;
        star.baseRadius = Math.pow(mass, 0.8) * 0.8;
        
        // Advance normalized timeline progress t to supernova phase start (1.2 τ_MS)
        star.t = STELLAR_CONSTANTS.PHASE_BOUNDARIES.SUPERNOVA_START + 0.01;
        star.currentRealAge = star.t * star.lifespanReal;
    }

    advanceTime(years: number) {
        const star = this.selectedStar || this.heroStars[0];
        if (!star) return;

        const deltaMyr = years / 1e6;
        star.currentRealAge += deltaMyr;
        if (star.lifespanReal > 0) {
            star.t = star.currentRealAge / star.lifespanReal;
        }
    }

    private _frustum = new THREE.Frustum();
    private _projScreenMatrix = new THREE.Matrix4();
    private _backgroundStarGeo: THREE.BufferGeometry;
    private _backgroundStarMat: THREE.ShaderMaterial;
    private _activeStarBuffer: HeroStarSystem[] = []; // BOLT: Persistent buffer to avoid per-frame slice()
    private _lightCandidates: HeroStarSystem[] = []; // Scratch buffer for light culling sort

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
        this.scene = new THREE.Scene();
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
        this.scene.add(ambientLight);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 8000);
        this.camera.position.z = 5;



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
        const backgroundStarVS = `
            attribute vec3 color;
            attribute float aSize;
            attribute float aPhase;
            uniform float uTime;
            varying vec3 vColor;
            varying float vTwinkle;
            void main() {
                vColor = color;
                vTwinkle = sin(uTime * 2.5 + aPhase) * 0.35 + 0.65;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = aSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `;

        const backgroundStarFS = `
            uniform float uOpacity;
            varying vec3 vColor;
            varying float vTwinkle;
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float distSq = dot(coord, coord);
                if (distSq > 0.25) discard;
                float gaussian = exp(-distSq * 14.0);
                gl_FragColor = vec4(vColor, gaussian * vTwinkle * uOpacity);
            }
        `;

        this._backgroundStarMat = new THREE.ShaderMaterial({
            vertexShader: backgroundStarVS,
            fragmentShader: backgroundStarFS,
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 0.9 }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this._backgroundStarMat.name = 'BackgroundStarfieldMaterial';
        (this._backgroundStarMat as any).customProgramCacheKey = () => 'background_starfield_material';

        const starVertices: number[] = [];
        const starColors: number[] = [];
        const starSizes: number[] = [];
        const starPhases: number[] = [];
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
            starSizes.push(1.5 + Math.random() * 2.5);
            starPhases.push(Math.random() * Math.PI * 2);
        }
        this._backgroundStarGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        this._backgroundStarGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
        this._backgroundStarGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(starSizes, 1));
        this._backgroundStarGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(starPhases, 1));
        this.scene.add(new THREE.Points(this._backgroundStarGeo, this._backgroundStarMat));

        this.pipeline = new Pipeline(this.renderer, this.scene, this.camera);
        this.cometSystem = new CometSystem(this.scene, this.camera);
        this.dysonSwarmSystem = new DysonSwarmSystem(this.scene);
        this.asteroidBeltSystem = new AsteroidBeltSystem(this.scene);
        
        const initialPhysics = { ...DEFAULT_CONSTANTS };
        this.setHeroStarCount(getNumStarsForTier(detectPerformanceTier()), initialPhysics);
    }

    createHeroStars(count: number, physicsConstants: PhysicsConstants) {
        for (let i = 0; i < count; i++) {
            const star = new HeroStarSystem(this.cosmicAge, physicsConstants);
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
            this.heroStars[i].visible = i < this.activeHeroStarCount && this.heroStars[i].t >= 0;
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
        if (this._backgroundStarMat.uniforms?.uOpacity) {
            this._backgroundStarMat.uniforms.uOpacity.value = Math.min(1.0, Math.max(0.0, 0.1 + (physics.darkMatter || 0) * 2.0));
        }
        if (this._backgroundStarMat.uniforms?.uTime) {
            this._backgroundStarMat.uniforms.uTime.value = this.appTime;
        }

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

            const isFocused = star === selectedStar || (selectedStar === null && i === 0);
            star.update(
                 this.isPaused ? 0 : delta, 
                 this.appTime,
                 this.camera.position, 
                 physics, 
                 star === selectedStar && isScrubbing ? selectedStar!.t : undefined, 
                 cosmicAge,
                 this._frustum,
                 protostarFlicker,
                 isFocused ? nbodyBuffer : null,
                 this.renderer
             );
        }

        // Cull PointLights to top-N nearest to prevent uniform overflow
        this._cullStarLights();

        if (!this.isPaused && !isScrubbing) {
            const deltaTime_yr = timeScale === 'cosmic' ? delta * 200000000 : delta * 1000;
            try {
                const targetStar = this.selectedStar || this.heroStars[0];
                const targetStarPos = targetStar?.position;
                const targetStarMass = targetStar?.mass || 1.0;
                this.cometSystem.update(deltaTime_yr, this.getStellarState(), this.appTime, targetStarPos);
                this.dysonSwarmSystem.update(this.highestKardashevTier, this.appTime, targetStarPos);
                this.asteroidBeltSystem.update(this.appTime, targetStarPos, targetStarMass);
            } catch (error) {
                if (typeof (window as any).emitErrorOverlay === 'function') {
                    (window as any).emitErrorOverlay(error);
                }
            }
        }
        // Process queued planetary systems creation/disposal to prevent stutters
        PlanetarySystemQueue.process(this.renderer);

        // Update post-processing lensing uniforms
        this.pipeline.updateLensing(this.selectedStar, this.camera, delta);

        // Use pipeline for rendering with post-processing - still render when paused for camera movement
        this.pipeline.render(this.appTime, delta);
    }

    respawnAllStars() {
        this.heroStars.forEach(star => {
            star.respawn(this.renderer, this.cosmicAge, this.physicsConstants);
        });
    }

    /**
     * Each frame, collect hero stars that want their PointLight active,
     * sort by distance-to-camera (ascending, with luminosity as tiebreaker),
     * enable only the top MAX_ACTIVE_POINT_LIGHTS, and cull the rest.
     */
    private _cullStarLights(): void {
        const camPos = this.camera.position;
        const candidates = this._lightCandidates;
        let count = 0;
        const activeCount = Math.min(this.activeHeroStarCount, this.heroStars.length);

        // Collect stars that want their light on
        for (let i = 0; i < activeCount; i++) {
            const star = this.heroStars[i];
            if (star.wantsLight && star.visible) {
                candidates[count++] = star;
            } else {
                // Ensure hidden stars have their light off
                star.setLightCulled(true);
            }
        }

        if (count <= MAX_ACTIVE_POINT_LIGHTS) {
            // All candidates fit — enable all, no sorting needed
            for (let i = 0; i < count; i++) {
                candidates[i].setLightCulled(false);
            }
        } else {
            // Sort candidates by distance to camera (ascending).
            // For ties, prefer higher luminosity.
            const cx = camPos.x, cy = camPos.y, cz = camPos.z;
            // Compute distSq inline to avoid allocations
            for (let i = 0; i < count; i++) {
                const s = candidates[i];
                const dx = s.position.x - cx;
                const dy = s.position.y - cy;
                const dz = s.position.z - cz;
                (s as any).__lightDistSq = dx * dx + dy * dy + dz * dz;
            }

            // Partial sort: we only need the top-N, so use selection-style partitioning
            // For simplicity and correctness, full sort by distSq ascending, lum descending as tiebreaker
            const slice = candidates.slice(0, count);
            slice.sort((a, b) => {
                const da = (a as any).__lightDistSq;
                const db = (b as any).__lightDistSq;
                if (da !== db) return da - db;
                return b.currentLum - a.currentLum; // higher lum wins
            });

            for (let i = 0; i < slice.length; i++) {
                slice[i].setLightCulled(i >= MAX_ACTIVE_POINT_LIGHTS);
            }
        }

        // Truncate scratch buffer to avoid retaining stale references
        candidates.length = 0;
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.pipeline.setSize(width, height);
    }

    dispose() {
        this.stop();
        this.onTick = null;
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
