import * as THREE from 'three';
import noiseGLSL from '../../shaders/utils/noise.glsl?raw';

/**
 * NebulaSystem creates a collection of large, volumetric gaseous cloud formations
 * distributed across the scene using THREE.Points and a custom GLSL shader.
 * It is separate from the hero star specific nebula phases.
 */

const vertexShader = `
    attribute float pSize;
    attribute vec3 pColor;
    varying vec3 vWorldPosition;
    varying vec3 vColor;

    void main() {
        vColor = pColor;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        
        // Size attenuation: scale point size by distance to camera
        gl_PointSize = pSize * (600.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform float uTime;
    varying vec3 vWorldPosition;
    varying vec3 vColor;

    ${noiseGLSL}

    void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv) * 2.0; // 0.0 to 1.0
        
        if (dist > 1.0) discard;

        // Gaussian glow falloff
        float glow = exp(-dist * dist * 4.0);
        
        // Volumetric billowing effect using 3D noise
        // Combining world position with point-local UVs for texture variation across large points
        vec3 noisePos = vWorldPosition * 0.002 + vec3(uv * 0.15, uTime * 0.01) + uTime * 0.03;
        float n1 = fbm(noisePos);
        float n2 = fbm(noisePos * 2.0 - uTime * 0.02);
        
        float density = n1 * 0.6 + n2 * 0.4;
        
        // Apply density to the gaussian glow
        float alpha = glow * density;
        
        // Add subtle color variation based on noise
        vec3 finalColor = mix(vColor, vColor.brg * 1.2, n2 * 0.3);
        
        // Soft edge blending
        alpha *= smoothstep(1.0, 0.4, dist);
        
        gl_FragColor = vec4(finalColor, alpha * 0.18);
    }
`;

export class NebulaSystem {
    private scene: THREE.Scene;
    private points?: THREE.Points;
    private material?: THREE.ShaderMaterial;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.init();
    }

    /**
     * Initializes 8-12 nebula formations distributed in the background, merged into a single draw call.
     */
    private init() {
        const numFormations = 8 + Math.floor(Math.random() * 5); // 8-12 formations
        
        const formations: {
            particlesCount: number;
            cloudRadius: number;
            center: THREE.Vector3;
            color: THREE.Color;
        }[] = [];
        
        let totalParticles = 0;
        const nebulaColors = [
            new THREE.Color(0.1, 0.8, 0.9),   // OIII — teal/cyan
            new THREE.Color(0.9, 0.15, 0.2),  // H-alpha — deep red
            new THREE.Color(0.95, 0.4, 0.1),  // SII — orange
            new THREE.Color(0.4, 0.1, 0.9),   // NII — violet
        ];
        
        for (let i = 0; i < numFormations; i++) {
            const particlesPerCloud = 30 + Math.floor(Math.random() * 40);
            const cloudRadius = 150 + Math.random() * 200;
            
            // Position the entire formation further away (behind hero stars)
            const dist = 1400 + Math.random() * 400;
            const t = Math.random() * Math.PI * 2;
            const p = Math.acos(2 * Math.random() - 1);
            
            const center = new THREE.Vector3(
                dist * Math.sin(p) * Math.cos(t),
                dist * Math.sin(p) * Math.sin(t),
                dist * Math.cos(p)
            );
            
            const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            
            formations.push({
                particlesCount: particlesPerCloud,
                cloudRadius,
                center,
                color
            });
            totalParticles += particlesPerCloud;
        }

        const positions = new Float32Array(totalParticles * 3);
        const pColors = new Float32Array(totalParticles * 3);
        const pSizes = new Float32Array(totalParticles);

        let index = 0;
        for (const formation of formations) {
            for (let j = 0; j < formation.particlesCount; j++) {
                // Distribute particles in a spherical cluster
                const r = Math.pow(Math.random(), 0.7) * formation.cloudRadius;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                
                positions[index * 3]     = formation.center.x + r * Math.sin(phi) * Math.cos(theta);
                positions[index * 3 + 1] = formation.center.y + r * Math.sin(phi) * Math.sin(theta);
                positions[index * 3 + 2] = formation.center.z + r * Math.cos(phi);
                
                pColors[index * 3]     = formation.color.r;
                pColors[index * 3 + 1] = formation.color.g;
                pColors[index * 3 + 2] = formation.color.b;
                
                pSizes[index] = 80 + Math.random() * 160;
                
                index++;
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('pColor', new THREE.BufferAttribute(pColors, 3));
        geometry.setAttribute('pSize', new THREE.BufferAttribute(pSizes, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });

        this.points = new THREE.Points(geometry, this.material);
        this.points.renderOrder = -10;
        
        this.scene.add(this.points);
    }

    /**
     * Updates the animation time for all nebulae.
     * @param _delta Time since last frame (unused but part of signature)
     * @param time Total elapsed time for noise animation
     */
    update(_delta: number, time: number): void {
        if (this.material) {
            this.material.uniforms.uTime.value = time;
        }
    }

    /**
     * Cleans up GPU resources.
     */
    dispose(): void {
        if (this.points) {
            this.scene.remove(this.points);
            this.points.geometry.dispose();
            this.points = undefined;
        }
        if (this.material) {
            this.material.dispose();
            this.material = undefined;
        }
    }
}
