import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CinematicPassShader } from './shaders/stellar';

export class Pipeline {
    composer: EffectComposer;
    bloomPass: UnrealBloomPass;
    cinematicPass: ShaderPass;
    lensingStrength: number = 0.0;

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        this.composer = new EffectComposer(renderer);
        this.composer.setPixelRatio(renderer.getPixelRatio());

        const renderPass = new RenderPass(scene, camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight), 
            0.85, 0.4, 1.0
        );
        this.bloomPass.radius = 0.4;
        this.bloomPass.threshold = 1.0;
        this.composer.addPass(this.bloomPass);

        this.cinematicPass = new ShaderPass(CinematicPassShader);
        this.composer.addPass(this.cinematicPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    public updateLensing(selectedStar: any, camera: THREE.PerspectiveCamera, delta: number) {
        let targetLensing = 0.0;
        const screenPos = new THREE.Vector2(0.5, 0.5);
        let screenRadius = 0.0;

        if (selectedStar && selectedStar.phase === 5 && selectedStar.mass > 15.0) { // REMNANT = 5
            targetLensing = 1.0;
            
            // Project black hole position to screen space
            const tempV = new THREE.Vector3();
            tempV.copy(selectedStar.position);
            tempV.project(camera);
            
            // Check if it's in front of the camera
            if (tempV.z <= 1.0) {
                screenPos.x = (tempV.x + 1.0) * 0.5;
                screenPos.y = (tempV.y + 1.0) * 0.5;
                
                // Calculate distance from camera to black hole
                const dist = camera.position.distanceTo(selectedStar.position);
                const fovRad = (camera.fov * Math.PI) / 180;
                
                // Event horizon lensing radius in world units
                const worldRadius = 0.65;
                screenRadius = worldRadius / (dist * Math.tan(fovRad * 0.5));
            }
        }

        this.lensingStrength = THREE.MathUtils.lerp(this.lensingStrength, targetLensing, delta * 8.0);
        
        if (this.cinematicPass.uniforms.uLensingStrength) {
            this.cinematicPass.uniforms.uLensingStrength.value = this.lensingStrength;
        }
        if (this.cinematicPass.uniforms.uBlackHoleScreenPos) {
            this.cinematicPass.uniforms.uBlackHoleScreenPos.value.copy(screenPos);
        }
        if (this.cinematicPass.uniforms.uBlackHoleRadius) {
            this.cinematicPass.uniforms.uBlackHoleRadius.value = Math.min(0.4, screenRadius);
        }
        if (this.cinematicPass.uniforms.uAspectRatio) {
            this.cinematicPass.uniforms.uAspectRatio.value = window.innerWidth / window.innerHeight;
        }
    }

    public render(appTime: number, _delta: number): void {
        if (this.cinematicPass.uniforms.time) this.cinematicPass.uniforms.time.value = appTime;
        this.composer.render();
    }

    setSize(width: number, height: number) {
        this.composer.setSize(width, height);
        this.bloomPass.resolution.set(width, height);
    }

    setBloomStrength(strength: number) {
        this.bloomPass.strength = strength;
    }

    dispose() {
        this.bloomPass.dispose();
        if (this.cinematicPass.material) {
            this.cinematicPass.material.dispose();
        }
        this.cinematicPass.dispose();
        this.composer.dispose();
    }
}
