import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CinematicPassShader } from '../shaders/cinematic';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../types/physics';
import { detectPerformanceTier, getNumStarsForTier, setOnTierChangeCallback } from '../utils/performance';
import { updateNumStars } from '../constants/simulation';

export class Engine {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    composer: EffectComposer;
    bloomPass: UnrealBloomPass;
    cinematicPass: ShaderPass;
    heroStars: HeroStarSystem[] = [];
    appTime: number = 0;
    isPaused: boolean = false;

    constructor(container: HTMLElement) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.setClearColor(0x000000, 1);
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 600;
        this.controls.minDistance = 2;

        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight), 
            1.6, 0.4, 0.1
        );
        this.bloomPass.strength = 1.2;
        this.bloomPass.radius = 0.6;
        this.bloomPass.threshold = 0.2;
        this.composer.addPass(this.bloomPass);

        this.cinematicPass = new ShaderPass(CinematicPassShader);
        this.composer.addPass(this.cinematicPass);
        
        // Use physics constants from DEFAULT_CONSTANTS
        const initialPhysics = { ...DEFAULT_CONSTANTS };
        this.createHeroStars(getNumStarsForTier(detectPerformanceTier()), initialPhysics);
    }

    createHeroStars(count: number, physicsConstants: PhysicsConstants) {
        for (let i = 0; i < count; i++) {
            const star = new HeroStarSystem();
            // The physics parameter is not used directly here for star position,
            // but it's important for the star's update method.
            star.position.set(
                (Math.random() - 0.5) * 600,
                (Math.random() - 0.5) * 600,
                (Math.random() - 0.5) * 600
            );
            this.scene.add(star);
            this.heroStars.push(star);
        }
    }

    update(selectedStar: HeroStarSystem | null, isScrubbing: boolean, physics: PhysicsConstants, cosmicAge: number) {
        if (this.isPaused) return;

        this.appTime += 0.016; // Simulates time passing for shaders, adjust as needed

        this.controls.update();
        this.composer.render(this.appTime);

        // Update stars
        this.heroStars.forEach(star => {
            star.update(
                0.016, // delta time (fixed for simulation update consistency)
                this.appTime,
                this.camera.position, // Pass camera position correctly
                physics, // Pass physics constants
                selectedStar?.t, // Override star's internal time if global is scrubbing
                cosmicAge * 1000 // Convert cosmic age to Myr for star's lifespan calculation
            );
        });
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }

    dispose() {
        this.composer.dispose();
        this.controls.dispose();
        this.renderer.dispose();
        this.scene.clear();
    }
}
