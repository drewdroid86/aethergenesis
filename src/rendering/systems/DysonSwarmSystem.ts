import * as THREE from 'three';

export class DysonSwarmSystem {
  private swarm: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    // 200 instanced ring segments orbiting the star
    const geometry = new THREE.TorusGeometry(2.0, 0.02, 4, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.6,
    });

    this.swarm = new THREE.InstancedMesh(geometry, material, 200);

    // Distribute rings at random inclinations around star
    // Each ring gets a random rotation axis
    for (let i = 0; i < 200; i++) {
      const matrix = new THREE.Matrix4();
      matrix.makeRotationFromEuler(
        new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      );
      this.swarm.setMatrixAt(i, matrix);
    }

    this.swarm.visible = false;
    scene.add(this.swarm);
  }

  update(kardashevTier: number, time: number): void {
    this.swarm.visible = kardashevTier >= 2;
    if (this.swarm.visible) {
      // Slowly rotate each segment
      this.swarm.rotation.y = time * 0.01;
      this.swarm.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.swarm.geometry.dispose();
    (this.swarm.material as THREE.Material).dispose();
  }
}
