import * as THREE from 'three';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../types/physics';
import { detectPerformanceTier, getNumStarsForTier } from '../utils/performance';
import { NebulaSystem } from '../rendering/nebulae';
import { Pipeline } from '../rendering/pipeline';

export class Engine {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    pipeline: Pipeline;
    nebulaSystem: NebulaSystem;
    heroStars: HeroStarSystem[] = [];
    appTime: number = 0;
    isPaused: boolean = false;
    container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.scene.background = new THREE.Color(0x050510);
        this.renderer.setClearColor(0x050510, 1);
        container.appendChild(this.renderer.domElement);

        const starGeo = new THREE.BufferGeometry();
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
        const starVertices = [];
        for (let i = 0; i < 3000; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const x = 900 * Math.sin(phi) * Math.cos(theta);
            const y = 900 * Math.sin(phi) * Math.sin(theta);
            const z = 900 * Math.cos(phi);
            starVertices.push(x, y, z);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        this.scene.add(new THREE.Points(starGeo, starMat));

        this.pipeline = new Pipeline(this.renderer, this.scene, this.camera);
        this.nebulaSystem = new NebulaSystem(this.scene);
        
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

    update(delta: number, selectedStar: HeroStarSystem | null, isScrubbing: boolean, physics: PhysicsConstants, cosmicAge: number) {
        if (this.isPaused) return;

        this.appTime += delta; 

        this.heroStars.forEach(star => {
            star.update(
                delta, 
                this.appTime,
                this.camera.position, 
                physics, 
                star === selectedStar ? selectedStar!.t : undefined, 
                cosmicAge 
            );
        });

        this.nebulaSystem.update(delta, this.camera.position);

        // Use pipeline for rendering with post-processing
        this.pipeline.render(this.appTime);
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
        this.scene.clear();
    }
}
