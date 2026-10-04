import * as THREE from 'three';

export interface DysonSwarmOptions {
    count?: number;
    minRadius?: number;
    maxRadius?: number;
    baseSpeed?: number;
}

const UP_Y = new THREE.Vector3(0, 1, 0);
const _ZERO = new THREE.Vector3(0, 0, 0);

export class DysonSwarmSystem {
    private swarm: THREE.InstancedMesh;
    private baseQuats: THREE.Quaternion[];
    private omegas: Float32Array;
    private scales: Float32Array;
    private _opacity: number = 0.0;
    private count: number;

    // Temps hoisted as private fields — no per-frame allocation
    private _q = new THREE.Quaternion();
    private _m = new THREE.Matrix4();
    private _s = new THREE.Vector3();

    constructor(scene: THREE.Scene, opts: DysonSwarmOptions = {}) {
        const count = opts.count ?? 200;
        const minRadius = opts.minRadius ?? 1.5;
        const maxRadius = opts.maxRadius ?? 3.5;
        const baseSpeed = opts.baseSpeed ?? 0.01;

        this.count = count;

        // 200 instanced ring segments orbiting the star
        const geometry = new THREE.TorusGeometry(2.0, 0.02, 4, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
        });
        material.name = 'DysonSwarmMaterial';

        this.swarm = new THREE.InstancedMesh(geometry, material, count);
        this.baseQuats = new Array(count);
        this.omegas = new Float32Array(count);
        this.scales = new Float32Array(count);

        const matrix = new THREE.Matrix4();
        const euler = new THREE.Euler();
        const scale = new THREE.Vector3();

        // Distribute rings at random inclinations around star
        for (let i = 0; i < count; i++) {
            euler.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            const quat = new THREE.Quaternion().setFromEuler(euler);
            this.baseQuats[i] = quat;

            const s = (minRadius + Math.random() * (maxRadius - minRadius)) / 2.0;
            this.scales[i] = s;

            this.omegas[i] = baseSpeed * (0.5 + Math.random());

            matrix.compose(_ZERO, quat, scale.setScalar(s));
            this.swarm.setMatrixAt(i, matrix);
        }

        this.swarm.instanceMatrix.needsUpdate = true;
        this.swarm.visible = false;
        scene.add(this.swarm);
    }

    update(kardashevTier: number, time: number, starPosition?: THREE.Vector3, delta: number = 0): void {
        const target = kardashevTier >= 2 ? 0.6 : 0.0;
        this._opacity += (target - this._opacity) * Math.min(1, delta * 2.0);
        (this.swarm.material as THREE.MeshBasicMaterial).opacity = this._opacity;
        this.swarm.visible = this._opacity > 0.01;

        if (this.swarm.visible) {
            const _q = this._q;
            const _m = this._m;
            const _s = this._s;

            for (let i = 0; i < this.count; i++) {
                _q.setFromAxisAngle(UP_Y, this.omegas[i] * time);
                _q.multiply(this.baseQuats[i]);
                _m.compose(_ZERO, _q, _s.setScalar(this.scales[i]));
                this.swarm.setMatrixAt(i, _m);
            }
            this.swarm.instanceMatrix.needsUpdate = true;
        }

        if (starPosition) {
            this.swarm.position.copy(starPosition);
        }
    }

    dispose(): void {
        this.swarm.geometry.dispose();
        (this.swarm.material as THREE.Material).dispose();
        if (this.swarm.parent) {
            this.swarm.parent.remove(this.swarm);
        }
    }
}
