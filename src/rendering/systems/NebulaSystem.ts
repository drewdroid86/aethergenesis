import * as THREE from 'three';
import noiseGLSL from '../../shaders/utils/noise.glsl?raw';

/**
 * NebulaSystem creates a collection of large, volumetric gaseous cloud formations
 * distributed across the scene using THREE.Points and a custom GLSL shader.
 * It is separate from the hero star specific nebula phases.
 */

const vertexShader = `
    attribute float pSize;
    varying vec3 vWorldPosition;
    varying vec3 vColor;
    uniform vec3 uColor;

    void main() {
        vColor = uColor;
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
        
        gl_FragColor = vec4(finalColor, alpha * 0.4);
    }
`;

export class NebulaSystem {
    private scene: THREE.Scene;
    private nebulae: THREE.Points[] = [];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.init();
    }

    /**
     * Initializes 8-12 nebula formations distributed in the background.
     */
    private init() {
        const numFormations = 8 + Math.floor(Math.random() * 5); // 8-12 formations
        
        for (let i = 0; i < numFormations; i++) {
            // Each formation is a cluster of points to create a "volumetric" feel
            const particlesPerCloud = 30 + Math.floor(Math.random() * 40);
            const positions = new Float32Array(particlesPerCloud * 3);
            const pSizes = new Float32Array(particlesPerCloud);
            
            const cloudRadius = 150 + Math.random() * 200;
            
            for (let j = 0; j < particlesPerCloud; j++) {
                // Distribute particles in a spherical cluster
                const r = Math.pow(Math.random(), 0.7) * cloudRadius;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                
                positions[j * 3] = r * Math.sin(phi) * Math.cos(theta);
                positions[j * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
                positions[j * 3 + 2] = r * Math.cos(phi);
                
                // Individual particle sizes for variation
                pSizes[j] = 200 + Math.random() * 400;
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('pSize', new THREE.BufferAttribute(pSizes, 1));

            // Nebula emission line palette — OIII teal, H-alpha red, SII orange
            const nebulaColors = [
                new THREE.Color(0.1, 0.8, 0.9),   // OIII — teal/cyan
                new THREE.Color(0.9, 0.15, 0.2),  // H-alpha — deep red
                new THREE.Color(0.95, 0.4, 0.1),  // SII — orange
                new THREE.Color(0.4, 0.1, 0.9),   // NII — violet
            ];
            const baseColor = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) }
                },
                vertexShader,
                fragmentShader,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: true,
            });

            const points = new THREE.Points(geometry, material);
            
            // Position the entire formation further away (behind hero stars)
            const dist = 800 + Math.random() * 800;
            const t = Math.random() * Math.PI * 2;
            const p = Math.acos(2 * Math.random() - 1);
            
            points.position.set(
                dist * Math.sin(p) * Math.cos(t),
                dist * Math.sin(p) * Math.sin(t),
                dist * Math.cos(p)
            );

            // Ensure they are rendered early or sorted correctly
            points.renderOrder = -10;
            
            this.scene.add(points);
            this.nebulae.push(points);
        }
    }

    /**
     * Updates the animation time for all nebulae.
     * @param _delta Time since last frame (unused but part of signature)
     * @param time Total elapsed time for noise animation
     */
    update(_delta: number, time: number): void {
        for (let i = 0; i < this.nebulae.length; i++) {
            const material = this.nebulae[i].material as THREE.ShaderMaterial;
            material.uniforms.uTime.value = time;
        }
    }

    /**
     * Cleans up GPU resources.
     */
    dispose(): void {
        for (let i = 0; i < this.nebulae.length; i++) {
            const points = this.nebulae[i];
            this.scene.remove(points);
            points.geometry.dispose();
            (points.material as THREE.ShaderMaterial).dispose();
        }
        this.nebulae = [];
    }
}
