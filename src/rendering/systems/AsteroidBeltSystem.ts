import * as THREE from 'three';

const BANDS = [
    { lo: 2.0, hi: 2.5, mid: 2.25 },
    { lo: 2.5, hi: 3.0, mid: 2.75 },
    { lo: 3.0, hi: 3.5, mid: 3.25 },
];

export class AsteroidBeltSystem {
    private rings: { mesh: THREE.InstancedMesh; mid: number }[] = [];
    private geometry: THREE.BufferGeometry;
    private material: THREE.Material;

    constructor(scene: THREE.Scene, count: number = 10000) {
        this.geometry = new THREE.IcosahedronGeometry(0.02, 0);
        this.material = new THREE.MeshStandardMaterial({
            color: 0x80664d, // grey-brown
            roughness: 0.9,
            metalness: 0.1
        });
        this.material.name = 'AsteroidBeltMaterial';

        const matrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const euler = new THREE.Euler();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        const baseCount = Math.floor(count / 3);

        for (let b = 0; b < BANDS.length; b++) {
            const band = BANDS[b];
            const ringCount = (b === BANDS.length - 1) ? count - baseCount * 2 : baseCount;
            const mesh = new THREE.InstancedMesh(this.geometry, this.material, ringCount);

            for (let i = 0; i < ringCount; i++) {
                // Distributed in a torus between lo and hi of band
                const radius = band.lo + Math.random() * (band.hi - band.lo);
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

                quat.setFromEuler(euler);
                matrix.compose(pos, quat, scale);
                mesh.setMatrixAt(i, matrix);
            }

            mesh.instanceMatrix.needsUpdate = true;
            scene.add(mesh);
            this.rings.push({ mesh, mid: band.mid });
        }
    }

    update(time: number, starPosition?: THREE.Vector3, starMass: number = 1.0): void {
        const base = time * 0.05 * Math.sqrt(Math.max(0.01, starMass));
        for (const ring of this.rings) {
            ring.mesh.rotation.y = base * Math.pow(2.75 / ring.mid, 1.5);
            if (starPosition) ring.mesh.position.copy(starPosition);
        }
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
        for (const ring of this.rings) {
            if (ring.mesh.parent) {
                ring.mesh.parent.remove(ring.mesh);
            }
        }
        this.rings = [];
    }
}
