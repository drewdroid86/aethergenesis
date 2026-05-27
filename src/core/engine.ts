import * as THREE from 'three';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../types/physics';
import { detectPerformanceTier, getNumStarsForTier } from '../utils/performance';
import { Pipeline } from '../rendering/pipeline';
import { createStellarState, advanceStellarState, StellarState, PhaseTransitionEvent } from '../simulation/StellarPhysics';

let stellarState = createStellarState('hero_star', 1.0, 0.02, 0);
const phaseTransitionLog: PhaseTransitionEvent[] = [];

export function getStellarState(): StellarState {
    return stellarState;
}

export function getPhaseHistory(): PhaseTransitionEvent[] {
    return phaseTransitionLog;
}

export class Engine {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    pipeline: Pipeline;
    heroStars: HeroStarSystem[] = [];
    appTime: number = 0;
    isPaused: boolean = false;
    container: HTMLElement;

    private _frustum = new THREE.Frustum();
    private _projScreenMatrix = new THREE.Matrix4();
    private _backgroundStarGeo: THREE.BufferGeometry;
    private _backgroundStarMat: THREE.PointsMaterial;

    constructor(container: HTMLElement) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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
        this._backgroundStarMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
        const starVertices = [];
        for (let i = 0; i < 3000; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const x = 900 * Math.sin(phi) * Math.cos(theta);
            const y = 900 * Math.sin(phi) * Math.sin(theta);
            const z = 900 * Math.cos(phi);
            starVertices.push(x, y, z);
        }
        this._backgroundStarGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        this.scene.add(new THREE.Points(this._backgroundStarGeo, this._backgroundStarMat));

        this.pipeline = new Pipeline(this.renderer, this.scene, this.camera);
        
        const initialPhysics = { ...DEFAULT_CONSTANTS };
        this.createHeroStars(getNumStarsForTier(detectPerformanceTier()), initialPhysics);
    }

    createHeroStars(count: number, physicsConstants: PhysicsConstants) {
        for (let i = 0; i < count; i++) {
            const star = new HeroStarSystem();
            star.position.set(
                (Math.random() - 0.5) * 600,
                (Math.random() - 0.5) * 600,
                (Math.random() - 0.5) * 600
            );
            this.scene.add(star);
            this.heroStars.push(star);
        }
    }

    update(delta: number, selectedStar: HeroStarSystem | null, isScrubbing: boolean, physics: PhysicsConstants, cosmicAge: number, timeScale: 'cosmic' | 'realtime' = 'cosmic', nbodyBuffer: Float32Array | null = null) {
        if (!this.isPaused) {
            this.appTime += delta; 
        }

        // Dark Matter affects background star visibility
        this._backgroundStarMat.opacity = 0.1 + (physics.darkMatter || 0) * 2.0;

        // Repulsion physics using softening
        const softening = physics.softening || 0.1;
        if (!this.isPaused && !isScrubbing) {
            const minDist = 20 * softening;
            const minDistSq = minDist * minDist;

            for (let i = 0; i < this.heroStars.length; i++) {
                const s1 = this.heroStars[i];
                const p1 = s1.position;

                for (let j = i + 1; j < this.heroStars.length; j++) {
                    const s2 = this.heroStars[j];
                    const p2 = s2.position;

                    const dx = p1.x - p2.x;
                    if (Math.abs(dx) > minDist) continue; // Manhattan pruning

                    const dy = p1.y - p2.y;
                    if (Math.abs(dy) > minDist) continue;

                    const dz = p1.z - p2.z;
                    if (Math.abs(dz) > minDist) continue;

                    const distSq = dx*dx + dy*dy + dz*dz;
                    if (distSq < minDistSq && distSq > 0.01) {
                        const dist = Math.sqrt(distSq);
                        const force = (minDist - dist) / minDist * delta * 30;
                        const invDist = 1.0 / dist;
                        const fx = dx * invDist * force;
                        const fy = dy * invDist * force;
                        const fz = dz * invDist * force;
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

        for (let i = 0; i < this.heroStars.length; i++) {
            const star = this.heroStars[i];
            if (!this.isPaused && !isScrubbing) {
                star.position.x += star.velocity.x * delta;
                star.position.y += star.velocity.y * delta;
                star.position.z += star.velocity.z * delta;
                star.velocity.multiplyScalar(0.97); // Damping
            }

            star.update(
                this.isPaused ? 0 : delta, 
                this.appTime,
                this.camera.position, 
                physics, 
                star === selectedStar ? selectedStar!.t : undefined, 
                cosmicAge,
                this._frustum,
                protostarFlicker,
                nbodyBuffer
            );
        }

        if (!this.isPaused && !isScrubbing) {
            const deltaTime_yr = timeScale === 'cosmic' ? delta * 200000000 : delta / 31557600;
            try {
                const result = advanceStellarState(stellarState, deltaTime_yr);
                stellarState = result.state;
                if (result.event) {
                    phaseTransitionLog.push(result.event);
                }
            } catch (error) {
                if (typeof (window as any).emitErrorOverlay === 'function') {
                    (window as any).emitErrorOverlay(error);
                }
            }
        }

        // Use pipeline for rendering with post-processing - still render when paused for camera movement
        this.pipeline.render(this.appTime, delta);
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.pipeline.setSize(width, height);
    }

    dispose() {
        this.pipeline.composer.dispose();
        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();

        for (let i = 0; i < this.heroStars.length; i++) {
            this.heroStars[i].dispose();
        }
        this._backgroundStarGeo.dispose();
        this._backgroundStarMat.dispose();
        this.heroStars = [];

        this.scene.clear();
    }
}
