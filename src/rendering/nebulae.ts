import * as THREE from 'three';
import { detectPerformanceTier } from '../utils/performance';

function generateClusteredPositions(spread: number, count: number): Float32Array {
    const positions = new Float32Array(count * 3);
    const center = new THREE.Vector3(
        (Math.random() - 0.5) * 1000,
        (Math.random() - 0.5) * 1000,
        (Math.random() - 0.5) * 1000
    );

    for (let i = 0; i < count; i++) {
        const r = Math.random() * spread;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
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
        minNebulae: 4,
        maxNebulae: 6,
        minRadius: 800,
        maxRadius: 2000,
        minParticles: 1500,
        maxParticles: 3000,
        sizeRange: [40, 80],
        opacity: 1.0, // Increased opacity for brightness
        colors: [
            new THREE.Color(0.6, 0.2, 1.0), // Purple
            new THREE.Color(0.0, 0.8, 1.0), // Cyan
            new THREE.Color(0.8, 0.1, 0.8), // Magenta
            new THREE.Color(0.1, 0.9, 0.7), // Teal
            new THREE.Color(1.0, 0.5, 0.0), // Orange (for variation)
            new THREE.Color(0.9, 0.9, 0.9)  // White/Cyan for test (high intensity)
        ],
        rotationSpeedRange: [0.003, 0.01], // Stronger rotation
    };

    constructor(scene: THREE.Object3D) {
        this.scene = scene;
        console.log('NebulaSystem: Initializing VIBRANT nebula clouds...');
        this.initNebulae();
    }

    private initNebulae() {
        const tier = detectPerformanceTier();
        const numNebulae = tier === 'ultra' ? this.config.maxNebulae : (tier === 'low' ? this.config.minNebulae : THREE.MathUtils.lerp(this.config.minNebulae, this.config.maxNebulae, Math.random()));
        const numParticles = tier === 'ultra' ? this.config.maxParticles : (tier === 'low' ? this.config.minParticles : THREE.MathUtils.lerp(this.config.minParticles, this.config.maxParticles, Math.random()));

        for (let i = 0; i < numNebulae; i++) {
            const nebulaGroup = new THREE.Group();
            
            const radius = THREE.MathUtils.lerp(this.config.minRadius, this.config.maxRadius, Math.random());
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            nebulaGroup.position.set(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );

            const geometry = new THREE.BufferGeometry();
            // Adjusted spread for potentially more clustered appearance within the larger radius
            const positions = generateClusteredPositions(radius * 0.4, numParticles); 
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const material = new THREE.PointsMaterial({
                size: THREE.MathUtils.lerp(this.config.sizeRange[0], this.config.sizeRange[1], Math.random()),
                transparent: true,
                opacity: this.config.opacity,
                color: this.config.colors[i % this.config.colors.length],
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true, // Ensure size attenuation is enabled for depth perception
                depthWrite: false, // Crucial for additive blending to layer correctly
            });

            const points = new THREE.Points(geometry, material);
            nebulaGroup.add(points);
            
            // Stronger, more varied rotation
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
            // Apply stronger, more noticeable rotation
            group.rotation.y += group.userData.rotationSpeed * timeScale * 200; // Increased multiplier for noticeable rotation
            
            // Position nebulae relative to camera but maintaining distance
            // This helps them stay in view without seeming to move with the camera directly
            group.position.copy(group.userData.initialPosition).add(cameraPosition.clone().multiplyScalar(0.05));
        });
    }
}
