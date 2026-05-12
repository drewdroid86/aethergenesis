import * as THREE from 'three';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { Pipeline } from '../rendering/pipeline';
import { 
    NUM_STARS, GALAXY_MAX_RADIUS, GALAXY_ARMS, GALAXY_SPIN, CORE_RADIUS 
} from './constants';
import { randomGaussian, getStellarColor } from '../physics/math';
import { starVertexShader, starFragmentShader } from '../rendering/shaders/stellar';
import { PhysicsEngine } from '../physics/PhysicsEngine';
import { PhysicsConstants } from '../types/physics';

export class Engine {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    pipeline: Pipeline;
    clock: THREE.Clock;
    heroStars: HeroStarSystem[] = [];
    appTime: number = 0;
    isPaused: boolean = false;
    physicsEngine: PhysicsEngine;
    starfieldPositions: Float32Array | null = null;
    starfieldPoints: THREE.Points | null = null;

    constructor(container: HTMLElement) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.FogExp2(0x000000, 0.002);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
        this.camera.position.set(0, 50, 400);

        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(this.renderer.domElement);

        this.pipeline = new Pipeline(this.renderer, this.scene, this.camera);
        this.clock = new THREE.Clock();
        this.physicsEngine = new PhysicsEngine();

        this.initStarfield();
        this.initHeroStars();
    }

    private initStarfield() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(NUM_STARS * 3);
        this.starfieldPositions = positions;
        const colors = new Float32Array(NUM_STARS * 3);
        const sizes = new Float32Array(NUM_STARS);

        for (let i = 0; i < NUM_STARS; i++) {
            const t = Math.pow(Math.random(), 2.5);
            const r = t * GALAXY_MAX_RADIUS;

            const armIndex = Math.floor(Math.random() * GALAXY_ARMS);
            const armOffset = (armIndex / GALAXY_ARMS) * Math.PI * 2;
            const baseAngle = r * GALAXY_SPIN + armOffset;

            const dispersion = randomGaussian(0, Math.max(1, r * 0.12));
            const heightAmp = Math.max(1.0, 30.0 * Math.exp(-r / 40.0));
            const height = randomGaussian(0, heightAmp);

            let x = Math.cos(baseAngle) * r + randomGaussian(0, dispersion);
            let z = Math.sin(baseAngle) * r + randomGaussian(0, dispersion);
            let y = height;

            const ptAngle = Math.atan2(z, x);
            const ptDist = Math.sqrt(x * x + z * z);
            const spiralPhase = ptAngle - ptDist * GALAXY_SPIN;
            const cycle = Math.PI * 2 / GALAXY_ARMS;
            const phaseMod = ((spiralPhase % cycle) + cycle) % cycle;
            const armFraction = phaseMod / cycle; 

            const isDustLane = armFraction > 0.15 && armFraction < 0.35 && ptDist > CORE_RADIUS;
            const color = getStellarColor();
            let size = Math.random() * 1.5 + 0.2;

            if (ptDist < CORE_RADIUS * 1.5) {
                const boost = 1.0 + (CORE_RADIUS * 1.5 - ptDist) / (CORE_RADIUS);
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
        this.starfieldPoints = starfield;
        this.scene.add(starfield);
    }

    private initHeroStars() {
        for(let i=0; i<12; i++) {
            const hs = new HeroStarSystem();
            const r = 10 + Math.random() * 200; 
            const angle = Math.random() * Math.PI * 2;
            hs.position.set(
                Math.cos(angle) * r,
                (Math.random() - 0.5) * (Math.max(5, 50 - r*0.1)),
                Math.sin(angle) * r
            );
            this.scene.add(hs);
            this.heroStars.push(hs);
            this.physicsEngine.registerBody(hs);

            // Give initial orbital velocity
            const dist = hs.position.length();
            const orbitalSpeed = Math.sqrt(this.physicsEngine.constants.G * 100 / dist); 
            const tangent = new THREE.Vector3(-hs.position.z, 0, hs.position.x).normalize();
            hs.velocity.copy(tangent).multiplyScalar(orbitalSpeed);
        }
    }

    update(selectedStar: HeroStarSystem | null, isScrubbing: boolean, physics: PhysicsConstants, cosmicAge: number) {
// ...

        const delta = Math.min(this.clock.getDelta(), 0.05);
        this.physicsEngine.constants = physics;
        
        if (!this.isPaused && !isScrubbing) {
            this.appTime += delta;
            this.physicsEngine.step(delta);
            
            if (this.starfieldPositions && this.starfieldPoints) {
                this.physicsEngine.applyExpansionToBuffer(this.starfieldPositions, delta);
                this.starfieldPoints.geometry.attributes.position.needsUpdate = true;
            }
        }

        let highBloom = false;

        this.heroStars.forEach(hs => {
            if (hs === selectedStar) {
                hs.update(delta, this.appTime, this.camera.position, physics, isScrubbing ? hs.t : undefined);
            } else {
                hs.update(delta, this.appTime, this.camera.position, physics, undefined, cosmicAge);
            }
            if (hs.isSupernovaFlashing) highBloom = true;
        });

        // Global Early Universe Plasma Logic
        if (cosmicAge < 0.2) {
             const tEarly = cosmicAge / 0.2;
             this.scene.background = new THREE.Color(0xffffff).lerp(new THREE.Color(0x000000), tEarly);
             this.pipeline.bloomPass.strength = THREE.MathUtils.lerp(3.0, 1.2, tEarly);
        } else {
            const targetBloom = highBloom ? 3.5 : 1.2;
            const lerpFactor = highBloom ? 0.2 : 0.05;
            this.pipeline.bloomPass.strength = THREE.MathUtils.lerp(
                this.pipeline.bloomPass.strength, 
                targetBloom, 
                lerpFactor
            );
            this.scene.background = new THREE.Color(0x000000);
        }

        // Apply Speed of Light (c) effect on Space
        const currentC = Math.max(0.1, physics.c);
        const targetFov = 60 / currentC;
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, Math.max(10, Math.min(150, targetFov)), 0.05);
        this.camera.updateProjectionMatrix();

        this.pipeline.render(this.appTime);
    }

    resize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.pipeline.setSize(width, height);
    }

    dispose() {
        this.renderer.dispose();
        // Additional cleanup for geometries/materials could be added here
    }
}
