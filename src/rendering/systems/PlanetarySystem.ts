import * as THREE from 'three';
import { GEOMETRIES } from '../../simulation/phases/geometries';

/**
 * BOLT: PlanetarySystem manages a collection of orbital bodies
 * utilizing Keplerian orbit approximations around a central star.
 */
export class PlanetarySystem {
    private bodies: {
        mesh: THREE.Mesh;
        semiMajorAxis: number;
        eccentricity: number;
        inclination: number;
        speed: number;
        angle: number;
    }[] = [];
    
    private group: THREE.Group;
    private parent: THREE.Object3D;

    constructor(star: THREE.Object3D, count?: number) {
        this.parent = star;
        this.group = new THREE.Group();
        this.parent.add(this.group);

        const numBodies = count ?? (3 + Math.floor(Math.random() * 3)); // Spawns 3-5 bodies
        this.initBodies(numBodies);
    }

    private initBodies(count: number): void {
        for (let i = 0; i < count; i++) {
            // Keplerian orbital elements (simplified for visual representation)
            const semiMajorAxis = 8 + i * 6 + Math.random() * 4;
            const eccentricity = Math.random() * 0.12; // Mostly circular orbits
            const inclination = (Math.random() - 0.5) * 0.3; // Slight orbital tilt
            
            // Orbital speed approximation based on distance (v proportional to 1/sqrt(r))
            const speed = (0.4 + Math.random() * 0.4) / Math.sqrt(semiMajorAxis);
            const initialAngle = Math.random() * Math.PI * 2;

            const pScale = 0.2 + Math.random() * 0.3;
            // Generate distinct colors for planets
            const pColor = new THREE.Color().setHSL(Math.random(), 0.5, 0.4);

            const mesh = new THREE.Mesh(
                GEOMETRIES.planet,
                new THREE.MeshStandardMaterial({
                    color: pColor,
                    roughness: 0.7,
                    metalness: 0.3,
                    emissive: pColor.clone().multiplyScalar(0.05)
                })
            );
            mesh.scale.setScalar(pScale);
            
            this.group.add(mesh);

            this.bodies.push({
                mesh,
                semiMajorAxis,
                eccentricity,
                inclination,
                speed,
                angle: initialAngle
            });
        }
    }

    /**
     * Update orbits using Keplerian position approximation:
     * r = a(1 - e^2) / (1 + e * cos(theta))
     */
    update(delta: number): void {
        for (let i = 0; i < this.bodies.length; i++) {
            const b = this.bodies[i];
            b.angle += b.speed * delta;
            
            // Keplerian polar distance formula
            const r = b.semiMajorAxis * (1 - b.eccentricity * b.eccentricity) / (1 + b.eccentricity * Math.cos(b.angle));
            
            // Convert polar to Cartesian (base plane XZ)
            const x = r * Math.cos(b.angle);
            const z = r * Math.sin(b.angle);
            
            // Apply rotation for inclination (tilting the XZ plane around the X axis)
            const sinI = Math.sin(b.inclination);
            const cosI = Math.cos(b.inclination);
            
            // Rotation around X-axis for inclination:
            // x' = x
            // y' = y * cos(i) - z * sin(i) -> since y is 0: y' = -z * sin(i)
            // z' = y * sin(i) + z * cos(i) -> since y is 0: z' = z * cos(i)
            b.mesh.position.set(
                x,
                -z * sinI,
                z * cosI
            );

            // Subtle self-rotation for the planet
            b.mesh.rotation.y += delta * 0.5;
        }
    }

    /**
     * Cleans up GPU resources and removes the system from the star.
     */
    dispose(): void {
        for (let i = 0; i < this.bodies.length; i++) {
            const b = this.bodies[i];
            b.mesh.geometry.dispose();
            if (Array.isArray(b.mesh.material)) {
                b.mesh.material.forEach(m => m.dispose());
            } else {
                b.mesh.material.dispose();
            }
        }
        
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
        this.bodies = [];
    }
}
