import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CinematicPassShader } from './shaders/stellar';
import { STELLAR_CONSTANTS } from '../core/constants';
import { blackHoleInFrontOfCamera, blackHoleWorldShadowRadius } from '../simulation/phases/RemnantPhase';

export class Pipeline {
    composer: EffectComposer;
    bloomPass: UnrealBloomPass;
    cinematicPass: ShaderPass;
    lensingStrength: number = 0.0;

    // BOLT: Cached vector instances to avoid per-frame allocations during 60/120fps render loop
    private _tempV: THREE.Vector3 = new THREE.Vector3();
    private _screenPos: THREE.Vector2 = new THREE.Vector2(0.5, 0.5);
    // Resting bloom. updateLensing tightens this while a black hole is in front
    // so the photon ring and disk don't bloom into a soft blob.
    private _bloomStrength = 0.85;
    private _bloomRadius = 0.4;
    private _bloomThreshold = 1.0;

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
        this.cinematicPass.material.name = 'CinematicPassMaterial';
        this.cinematicPass.material.customProgramCacheKey = () => 'cinematic_pass_material';
        this.composer.addPass(this.cinematicPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    public updateLensing(selectedStar: any, camera: THREE.PerspectiveCamera, delta: number) {
        this._screenPos.set(0.5, 0.5);
        let screenRadius = 0.0;

        let inFront = false;
        if (selectedStar && selectedStar.phase === 5 && selectedStar.mass >= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE) { // REMNANT = 5
            // View space first: the camera looks down -Z, so in-front points have
            // viewZ < 0. project() alone (`ndc.z <= 1`) still left lensingStrength
            // at 1 when the remnant was behind the camera (radius happened to be 0,
            // but chromatic and any later radius leak stayed live).
            this._tempV.copy(selectedStar.position);
            this._tempV.applyMatrix4(camera.matrixWorldInverse);
            const viewZ = this._tempV.z;
            this._tempV.applyMatrix4(camera.projectionMatrix);
            inFront = blackHoleInFrontOfCamera(viewZ, this._tempV.z);

            if (inFront) {
                this._screenPos.x = (this._tempV.x + 1.0) * 0.5;
                this._screenPos.y = (this._tempV.y + 1.0) * 0.5;

                const dist = Math.max(0.05, camera.position.distanceTo(selectedStar.position));
                const fovRad = (camera.fov * Math.PI) / 180;
                // b_c in the hero group's local space, times that group's expansion
                // scale, so the post ring tracks the scaled 3D shadow.
                const groupScale = selectedStar.scale && Number.isFinite(selectedStar.scale.x)
                    ? selectedStar.scale.x
                    : 1;
                const worldRadius = blackHoleWorldShadowRadius(selectedStar.mass, groupScale);
                const denom = 2 * dist * Math.tan(fovRad * 0.5);
                screenRadius = denom > 0 ? Math.min(0.85, worldRadius / denom) : 0;
            }
        }

        if (!inFront) {
            // Snap. A lerp would leave a frame of warp after the camera turns away.
            this.lensingStrength = 0;
            screenRadius = 0;
            this._screenPos.set(0.5, 0.5);
        } else if (screenRadius < 0.05) {
            // Wide / unfocused: the shadow is a speck. Deflection at this size
            // only reshuffles film grain. Snap the lens off.
            this.lensingStrength = 0;
            screenRadius = 0;
        } else {
            const targetLensing = THREE.MathUtils.smoothstep(screenRadius, 0.05, 0.10);
            this.lensingStrength = THREE.MathUtils.lerp(this.lensingStrength, targetLensing, Math.min(1, delta * 8.0));
        }
        
        if (selectedStar && selectedStar.isSupernovaFlashing) {
            if (this.cinematicPass.uniforms.uShockwave) {
                const currentW = this.cinematicPass.uniforms.uShockwave.value || 0;
                this.cinematicPass.uniforms.uShockwave.value = (currentW + delta * 1.5) % 1.0;
            }
        } else {
            if (this.cinematicPass.uniforms.uShockwave) {
                this.cinematicPass.uniforms.uShockwave.value = THREE.MathUtils.lerp(
                    this.cinematicPass.uniforms.uShockwave.value || 0,
                    0.0,
                    delta * 10.0
                );
            }
        }

        if (this.cinematicPass.uniforms.uLensingStrength) {
            this.cinematicPass.uniforms.uLensingStrength.value = this.lensingStrength;
        }
        if (this.cinematicPass.uniforms.uBlackHoleScreenPos) {
            this.cinematicPass.uniforms.uBlackHoleScreenPos.value.copy(this._screenPos);
        }
        if (this.cinematicPass.uniforms.uBlackHoleRadius) {
            this.cinematicPass.uniforms.uBlackHoleRadius.value = screenRadius;
        }
        if (this.cinematicPass.uniforms.uAspectRatio) {
            this.cinematicPass.uniforms.uAspectRatio.value = window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 1.0;
        }

        // Bloom tightens only while the shadow is large enough to read. A wide
        // speck keeps the resting bloom so the field is not regraded, and the
        // warp itself scales with b_c² so it is already negligible at that size.
        const focus = screenRadius <= 0 ? 0 : THREE.MathUtils.smoothstep(screenRadius, 0.045, 0.11);
        const k = this.lensingStrength * focus;
        // Tight halo on the hottest clumps only. A wide bloom washes the disk plane.
        this.bloomPass.threshold = THREE.MathUtils.lerp(this._bloomThreshold, 1.45, k);
        this.bloomPass.strength = THREE.MathUtils.lerp(this._bloomStrength, 0.12, k);
        this.bloomPass.radius = THREE.MathUtils.lerp(this._bloomRadius, 0.05, k);
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
        this._bloomStrength = strength;
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
