import * as THREE from 'three';
import { colorTempToRGB, mulberry32 } from '../../physics/math';

/** AESTHETIC: not physics-derived, intentional. Bounded, local-space debris pool.
 * Bodies are retired by the worker; these short-lived fragments only visualize
 * the event and never feed invented forces back into orbital integration.
 */
export class DestructionEffects {
    readonly points: THREE.Points;
    private readonly capacity = 2048;
    private readonly positions = new Float32Array(this.capacity * 3);
    private readonly colors = new Float32Array(this.capacity * 3);
    private readonly velocities = new Float32Array(this.capacity * 3);
    private readonly life = new Float32Array(this.capacity);
    private readonly duration = new Float32Array(this.capacity);
    private readonly inward = new Uint8Array(this.capacity);
    private cursor = 0;
    private serial = 0;
    private color = new THREE.Color();

    constructor(parent: THREE.Object3D) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
        const material = new THREE.ShaderMaterial({
            vertexShader: `
                attribute vec3 color;
                varying vec3 vColor;
                void main() {
                    vColor = color;
                    vec4 view = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * view;
                    gl_PointSize = clamp(180.0 / max(1.0, -view.z), 1.5, 18.0);
                }`,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    vec2 p = gl_PointCoord * 2.0 - 1.0;
                    float r2 = dot(p, p);
                    if (r2 > 1.0) discard;
                    float glow = exp(-r2 * 5.0) * (1.0 - smoothstep(0.6, 1.0, r2));
                    gl_FragColor = vec4(vColor * (1.0 + exp(-r2 * 30.0)), glow);
                }`,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        this.points = new THREE.Points(geometry, material);
        this.points.name = 'PlanetDestructionDebris';
        this.points.frustumCulled = false;
        this.points.visible = false;
        parent.add(this.points);
    }

    burst(x: number, y: number, z: number, capture: boolean, scale = 0.15, count = 128): void {
        const random = mulberry32(++this.serial * 7919);
        const radius = Math.max(0.001, Math.hypot(x, y, z));
        for (let n = 0; n < count; n++) {
            const i = this.cursor++ % this.capacity;
            const k = i * 3;
            const spread = scale * 2;
            this.positions[k] = x + (random() - 0.5) * spread;
            this.positions[k + 1] = y + (random() - 0.5) * spread;
            this.positions[k + 2] = z + (random() - 0.5) * spread;
            const speed = 1.5 + random() * 6;
            this.velocities[k] = x / radius * speed + (random() - 0.5) * 5;
            this.velocities[k + 1] = y / radius * speed + (random() - 0.5) * 5;
            this.velocities[k + 2] = z / radius * speed + (random() - 0.5) * 5;
            this.life[i] = this.duration[i] = capture ? 1.5 + random() : 3 + random() * 4;
            this.inward[i] = capture ? 1 : 0;
        }
    }

    update(delta: number, fade = 1): void {
        let active = false;
        for (let i = 0; i < this.capacity; i++) {
            if (this.life[i] <= 0) continue;
            active = true;
            this.life[i] = Math.max(0, this.life[i] - delta);
            const k = i * 3;
            if (this.inward[i]) {
                const x = this.positions[k], z = this.positions[k + 2];
                const angle = delta * 3.5;
                const shrink = Math.exp(-delta * 1.8);
                this.positions[k] = (x * Math.cos(angle) - z * Math.sin(angle)) * shrink;
                this.positions[k + 2] = (x * Math.sin(angle) + z * Math.cos(angle)) * shrink;
                this.positions[k + 1] *= shrink;
            } else {
                for (let axis = 0; axis < 3; axis++) this.positions[k + axis] += this.velocities[k + axis] * delta;
            }
            const remaining = this.life[i] / this.duration[i];
            colorTempToRGB(1800 + 9000 * remaining, this.color);
            const intensity = remaining * fade * (this.inward[i] ? 4 : 3);
            this.colors[k] = this.color.r * intensity;
            this.colors[k + 1] = this.color.g * intensity;
            this.colors[k + 2] = this.color.b * intensity;
        }
        this.points.visible = active && fade > 0;
        if (active) {
            this.points.geometry.attributes.position.needsUpdate = true;
            this.points.geometry.attributes.color.needsUpdate = true;
        }
    }

    dispose(): void {
        this.points.removeFromParent();
        this.points.geometry.dispose();
        (this.points.material as THREE.Material).dispose();
    }
}
