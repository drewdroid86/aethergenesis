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
        minNebulae: 3,
        maxNebulae: 4,
        minRadius: 2000,
        maxRadius: 4000,
        minParticles: 300,
        maxParticles: 600,
        sizeRange: [12, 25],
        opacity: 0.9,
        colors: [0x6B46C0, 0x00FFFF, 0xFF00AA, 0x00FFAA],
        rotationSpeedRange: [0.0001, 0.0005],
    };

    constructor(scene: THREE.Object3D) {
        this.scene = scene;
        this.initNebulae();
    }

    private initNebulae() {
        const tier = detectPerformanceTier();
        const count = tier === 'low' ? this.config.minNebulae : this.config.maxNebulae;
        const particles = tier === 'low' ? this.config.minParticles : this.config.maxParticles;

        for (let i = 0; i < count; i++) {
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
            const positions = generateClusteredPositions(800, particles);
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const material = new THREE.PointsMaterial({
                size: THREE.MathUtils.lerp(this.config.sizeRange[0], this.config.sizeRange[1], Math.random()),
                transparent: true,
                opacity: this.config.opacity,
                color: new THREE.Color(this.config.colors[i % this.config.colors.length]),
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true,
                depthWrite: false,
            });

            const points = new THREE.Points(geometry, material);
            nebulaGroup.add(points);
            
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
            group.rotation.y += group.userData.rotationSpeed * timeScale * 100;
            group.position.copy(group.userData.initialPosition).add(cameraPosition.clone().multiplyScalar(0.05));
        });
    }
}
