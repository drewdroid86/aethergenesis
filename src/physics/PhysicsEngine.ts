import * as THREE from 'three';
import { PhysicsConstants, PhysicalBody, DEFAULT_CONSTANTS } from './types';

/**
 * High-performance modular physics engine for Aethergenesis.
 * 
 * APPROXIMATIONS FOR REAL-TIME 60FPS:
 * 1. Gravitational Softening: Adds a small epsilon (softening^2) to distance squared
 *    to prevent infinite forces during close encounters and maintain numerical stability.
 * 2. Velocity Verlet Integration: A 2nd-order integrator that is more stable and 
 *    energy-conservative than simple Euler integration for orbital mechanics.
 * 3. O(N^2) Hybrid: Direct N-body summation for "Hero Stars" (small N) and 
 *    simplified global field effects for background entities.
 * 4. Hubble Flow: Linear expansion based on distance from origin, integrated
 *    directly into the velocity update.
 */
export class PhysicsEngine {
    constants: PhysicsConstants;
    bodies: PhysicalBody[] = [];
    private _tmpVec1 = new THREE.Vector3();
    private _tmpVec2 = new THREE.Vector3();

    constructor(constants: Partial<PhysicsConstants> = {}) {
        this.constants = { ...DEFAULT_CONSTANTS, ...constants };
    }

    /**
     * Registers a physical body with the engine.
     */
    registerBody(body: PhysicalBody) {
        this.bodies.push(body);
    }

    /**
     * Unregisters a body.
     */
    unregisterBody(physicsId: string) {
        this.bodies = this.bodies.filter(b => b.physicsId !== physicsId);
    }

    /**
     * Main simulation step using Velocity Verlet integration.
     * 1. x(t+dt) = x(t) + v(t)dt + 0.5 * a(t)dt^2
     * 2. Calculate a(t+dt) from new positions
     * 3. v(t+dt) = v(t) + 0.5 * (a(t) + a(t+dt))dt
     */
    step(dt: number) {
        if (dt <= 0) return;

        // 1. Position update & half-step velocity
        for (const body of this.bodies) {
            // Update position
            this._tmpVec1.copy(body.velocity).multiplyScalar(dt);
            this._tmpVec2.copy(body.acceleration).multiplyScalar(0.5 * dt * dt);
            body.position.add(this._tmpVec1).add(this._tmpVec2);
            
            // Store current acceleration for next step and reset for new calculation
            // We use the PhysicalBody object itself to store the 'old' acceleration
            // effectively acting as the a(t) in the v(t+dt) calculation.
        }

        // 2. Calculate new accelerations a(t+dt)
        const oldAccelerations = this.bodies.map(b => b.acceleration.clone());
        this.calculateAccelerations();

        // 3. Final velocity update
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            const oldA = oldAccelerations[i];
            
            this._tmpVec1.copy(oldA).add(body.acceleration).multiplyScalar(0.5 * dt);
            body.velocity.add(this._tmpVec1);

            // Relativistic speed limit (Simple clamping to c)
            const speed = body.velocity.length();
            if (speed > this.constants.c) {
                body.velocity.setLength(this.constants.c);
            }
        }
    }

    /**
     * Calculates gravitational and expansion accelerations for all registered bodies.
     */
    private calculateAccelerations() {
        const softeningSq = this.constants.softening * this.constants.softening;

        for (let i = 0; i < this.bodies.length; i++) {
            const b1 = this.bodies[i];
            b1.acceleration.set(0, 0, 0);

            // N-Body Gravity (Direct Summation O(N^2))
            for (let j = 0; j < this.bodies.length; j++) {
                if (i === j) continue;
                const b2 = this.bodies[j];

                this._tmpVec1.subVectors(b2.position, b1.position);
                const distSq = this._tmpVec1.lengthSq() + softeningSq;
                const dist = Math.sqrt(distSq);
                
                // Force = G * m1 * m2 / r^2 => Accel = G * m2 / r^2
                const magnitude = (this.constants.G * b2.mass) / distSq;
                this._tmpVec1.normalize().multiplyScalar(magnitude);
                b1.acceleration.add(this._tmpVec1);
            }

            // Cosmic Expansion & Dark Energy (Hubble Flow + Lambda)
            // Hubble Accel = H0 * v (simplified) or a = (H0^2 + lambda) * r
            // Here we apply expansion as a force away from origin
            const distFromOrigin = b1.position.length();
            if (distFromOrigin > 0.001) {
                const expansionMagnitude = (Math.pow(this.constants.H0, 2) + this.constants.lambda) * distFromOrigin;
                this._tmpVec1.copy(b1.position).normalize().multiplyScalar(expansionMagnitude);
                b1.acceleration.add(this._tmpVec1);
            }
        }
    }

    /**
     * Efficiently applies cosmic expansion to background entities (like the 50k starfield).
     * This avoids N-body calculations for background objects, treating them as test particles.
     */
    applyExpansionToBuffer(positions: Float32Array, dt: number) {
        const h0 = this.constants.H0;
        const lambda = this.constants.lambda;
        const factor = 1.0 + (h0 + lambda) * dt;

        for (let i = 0; i < positions.length; i++) {
            positions[i] *= factor;
        }
    }
}
