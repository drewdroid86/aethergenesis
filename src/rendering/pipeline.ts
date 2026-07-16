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
