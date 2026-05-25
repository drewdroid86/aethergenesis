import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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
            1.6, 0.4, 0.1
        );
        this.bloomPass.strength = 1.2;
        this.bloomPass.radius = 0.6;
        this.bloomPass.threshold = 0.2;
        this.composer.addPass(this.bloomPass);

        this.cinematicPass = new ShaderPass(CinematicPassShader);
        this.composer.addPass(this.cinematicPass);
    }

    public render(appTime: number, delta: number): void {
        if (this.cinematicPass.uniforms.time) this.cinematicPass.uniforms.time.value = appTime;
        this.composer.render();
    }

    setSize(width: number, height: number) {
        this.composer.setSize(width, height);
    }

    setBloomStrength(strength: number) {
        this.bloomPass.strength = strength;
    }
}
