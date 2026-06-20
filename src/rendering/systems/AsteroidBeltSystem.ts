import * as THREE from 'three';

export class AsteroidBeltSystem {
    private instancedMesh: THREE.InstancedMesh;
    private orbitalPeriods: Float32Array;

    constructor(scene: THREE.Scene) {
        const count = 10000;
        const geometry = new THREE.IcosahedronGeometry(0.02, 0);
        const material = new THREE.MeshStandardMaterial({
            color: 0x80664d, // grey-brown
            roughness: 0.9,
            metalness: 0.1
        });
        
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, count);
        this.orbitalPeriods = new Float32Array(count);
        
        const matrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const euler = new THREE.Euler();
        const scale = new THREE.Vector3();
        
        for (let i = 0; i < count; i++) {
            // Distributed in a torus between 2.0 and 3.5 AU
            const radius = 2.0 + Math.random() * 1.5;
            const angle = Math.random() * Math.PI * 2;
            
            // Random inclination within +/- 5 degrees
            const inc = (Math.random() - 0.5) * 10 * Math.PI / 180;
            
            // Initial pos in x-z plane
            const x = Math.cos(angle) * radius;
            let z = Math.sin(angle) * radius;
            
            // apply inclination + slight thickness offset
            const y = z * Math.sin(inc) + (Math.random() - 0.5) * 0.1;
            z = z * Math.cos(inc);
            
            pos.set(x, y, z);
            
            euler.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            
            const s = 0.5 + Math.random() * 1.5;
            scale.setScalar(s);
            
            matrix.compose(pos, new THREE.Quaternion().setFromEuler(euler), scale);
            this.instancedMesh.setMatrixAt(i, matrix);
            
            // Period scales with sqrt(a^3 / GM)
            // Assuming GM = 1 for simplicity (solar mass)
            this.orbitalPeriods[i] = Math.sqrt(radius * radius * radius);
        }
        
        scene.add(this.instancedMesh);
    }

    update(time: number): void {
        // We will just rotate the entire group slowly for performance, 
        // as updating 10,000 matrices per frame is against Prompt 5 optimization rules
        // "Since this is a background simulation... no physics"
        this.instancedMesh.rotation.y = time * 0.05;
    }

    dispose(): void {
        this.instancedMesh.geometry.dispose();
        (this.instancedMesh.material as THREE.Material).dispose();
        if (this.instancedMesh.parent) {
            this.instancedMesh.parent.remove(this.instancedMesh);
        }
    }
}
