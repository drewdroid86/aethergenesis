import * as THREE from 'three';
import { detectPerformanceTier } from '../utils/performance';

function generateClusteredPositions(radius: number, count: number): Float32Array {
    const positions = new Float32Array(count * 3);
    const center = new THREE.Vector3(
        (Math.random() - 0.5) * 500,
        (Math.random() - 0.5) * 500,
        (Math.random() - 0.5) * 500
    );

    for (let i = 0; i < count; i++) {
        const r = Math.random() * radius * 0.3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        const x = center.x + r * Math.sin(phi) * Math.cos(theta);
        const y = center.y + r * Math.sin(phi) * Math.sin(theta);
        const z = center.z + r * Math.cos(phi);
        
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }
    return positions;
}

export class NebulaSystem {
    private nebulae: THREE.Group[] = [];
    private scene: THREE.Object3D;

    private config = {
        minNebulae: 3,
        maxNebulae: 4,
        minRadius: 2000,
        maxRadius: 4000,
        minParticles: 200,
        maxParticles: 400,
        baseSize: 300, 
        opacity: 0.4,
        colors: [0x800080, 0x0000FF, 0xFF00FF, 0x008080], // Deep purple, blue, magenta, teal
        baseRotationSpeed: 0.0001,
    };

    constructor(scene: THREE.Object3D) {
        this.scene = scene;
        this.initNebulae();
    }

    private initNebulae() {
        const tier = detectPerformanceTier();
        const nebulaCount = tier === 'low' ? this.config.minNebulae : this.config.maxNebulae;
        const particles = tier === 'low' ? this.config.minParticles : this.config.maxParticles;

        for (let i = 0; i < nebulaCount; i++) {
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
            const positions = generateClusteredPositions(500, particles);
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const material = new THREE.PointsMaterial({
                size: this.config.baseSize * (0.8 + Math.random() * 0.4),
                transparent: true,
                opacity: this.config.opacity,
                color: new THREE.Color(this.config.colors[i % this.config.colors.length]),
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true,
                depthWrite: false,
            });

            const points = new THREE.Points(geometry, material);
            nebulaGroup.add(points);
            
            nebulaGroup.userData.rotationSpeed = this.config.baseRotationSpeed * (Math.random() - 0.5);
            nebulaGroup.userData.initialPosition = nebulaGroup.position.clone();
            
            this.nebulae.push(nebulaGroup);
            this.scene.add(nebulaGroup);
        }
    }

    update(deltaTime: number, cameraPosition: THREE.Vector3) {
        const timeScale = deltaTime * 0.001;
        this.nebulae.forEach(group => {
            group.rotation.y += group.userData.rotationSpeed * timeScale;
            // Gentle parallax
            group.position.copy(group.userData.initialPosition).add(cameraPosition.clone().multiplyScalar(0.05));
        });
    }
}
