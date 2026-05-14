import * as THREE from 'three';
import { detectPerformanceTier } from '../utils/performance';

function generateClusteredPositions(spread: number, count: number, center: THREE.Vector3): Float32Array {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // Using spherical distribution for more natural cloud shapes
        const r = Math.random() * spread;
        const phi = Math.acos(2 * Math.random() - 1); // Polar angle
        const theta = Math.random() * Math.PI * 2; // Azimuthal angle
        
        positions[i * 3] = center.x + r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = center.y + r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = center.z + r * Math.cos(phi);
    }
    return positions;
}

export class NebulaSystem {
    private nebulae: THREE.Group[] = [];
    private scene: THREE.Object3D;

    private config = {
        minNebulae: 3,
        maxNebulae: 4,
        minRadius: 2000, // Increased distance for background effect
        maxRadius: 5000,
        minParticles: 80,
        maxParticles: 150,
        sizeRange: [8, 18], // Reduced particle size
        opacity: 0.25, // Lowered opacity for softness
        colors: [
            new THREE.Color(0.3, 0.1, 0.5), // Soft Purple
            new THREE.Color(0.0, 0.4, 0.6), // Soft Cyan
            new THREE.Color(0.4, 0.05, 0.4), // Soft Magenta
            new THREE.Color(0.05, 0.4, 0.3), // Soft Teal
        ],
        rotationSpeedRange: [0.0001, 0.0005], // Subtle, slow rotation
        spreadFactor: 600, // Reduced spread for tighter clouds
    };

    constructor(scene: THREE.Object3D) {
        this.scene = scene;
        console.log('NebulaSystem: Initializing subtle nebula clouds...');
        this.initNebulae();
    }

    private initNebulae() {
        const tier = detectPerformanceTier();
        // Adjust number of nebulae based on performance tier
        const numNebulae = tier === 'ultra' ? this.config.maxNebulae : (tier === 'low' ? 2 : THREE.MathUtils.lerp(this.config.minNebulae, this.config.maxNebulae, Math.random()));
        // Adjust particle count based on performance tier
        const numParticles = tier === 'ultra' ? this.config.maxParticles : (tier === 'low' ? this.config.minParticles : THREE.MathUtils.lerp(this.config.minParticles, this.config.maxParticles, Math.random()));

        for (let i = 0; i < numNebulae; i++) {
            const nebulaGroup = new THREE.Group();
            
            // Position nebulae further out and with more spread
            const radius = THREE.MathUtils.lerp(this.config.minRadius, this.config.maxRadius, Math.random());
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            const nebulaCenter = new THREE.Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );
            nebulaGroup.position.copy(nebulaCenter);

            const geometry = new THREE.BufferGeometry();
            // Use the spread factor for positioning, making clouds softer and larger
            // Fix: Pass (0,0,0) so particles are relative to group origin, avoiding double offset
            const positions = generateClusteredPositions(this.config.spreadFactor, numParticles, new THREE.Vector3(0, 0, 0)); 
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const material = new THREE.PointsMaterial({
                size: THREE.MathUtils.lerp(this.config.sizeRange[0], this.config.sizeRange[1], Math.random()),
                transparent: true,
                opacity: this.config.opacity,
                color: this.config.colors[i % this.config.colors.length],
                blending: THREE.AdditiveBlending, // Keep additive for soft glow, but ensure opacity is low
                sizeAttenuation: true, // Keep size attenuation for depth perception
                depthWrite: false, // Crucial for additive blending and to avoid artifacts
            });

            const points = new THREE.Points(geometry, material);
            nebulaGroup.add(points);
            
            // Subtle, slow rotation
            nebulaGroup.userData.rotationSpeed = THREE.MathUtils.lerp(
                this.config.rotationSpeedRange[0], 
                this.config.rotationSpeedRange[1], 
                Math.random()
            ) * (Math.random() > 0.5 ? 1 : -1);
            nebulaGroup.userData.initialPosition = nebulaGroup.position.clone();
            
            this.nebulae.push(nebulaGroup);
            this.scene.add(nebulaGroup);
        }
    }

    update(deltaTime: number, cameraPosition: THREE.Vector3) {
        const timeScale = deltaTime * 0.001;
        this.nebulae.forEach(group => {
            // Apply subtle, slow rotation
            group.rotation.y += group.userData.rotationSpeed * timeScale * 50; // Reduced multiplier for subtle rotation
            
            // Distance-based fading: implemented indirectly via opacity and sizeAttenuation.
            // For more explicit fading, one might adjust material.opacity based on distance to camera.
            // The current positioning and low opacity already contribute to a sense of distance.
            group.position.copy(group.userData.initialPosition).add(cameraPosition.clone().multiplyScalar(0.05));
        });
    }
}
