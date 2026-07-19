export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface OrbitalBody {
    id: string;
    type: 'star' | 'planet' | 'comet' | 'asteroid';
    mass_solar: number;
    radius_km: number;
    position_au: Vector3;
    velocity_au_yr: Vector3;
    color?: string;
    texture?: string;
    // For comets
    comaActive?: boolean;
    tailActive?: boolean;
}

export interface KeplerianElements {
    semiMajorAxis_au: number;
    eccentricity: number;
    inclination_deg: number;
    longitudeOfAscendingNode_deg: number;
    argumentOfPeriapsis_deg: number;
    meanAnomaly_deg: number;
}

/**
 * Solves Kepler's Equation M = E - e*sin(E) for Eccentric Anomaly (E)
 * using the Newton-Raphson method.
 * @param M Mean Anomaly in radians
 * @param e Eccentricity
 * @param tolerance Max error tolerance
 * @param maxIter Maximum iterations
 * @returns Eccentric Anomaly (E) in radians
 */
export function solveKepler(M: number, e: number, tolerance: number = 1e-6, maxIter: number = 30): number {
    // Initial guess for E
    let E = e < 0.8 ? M : Math.PI;
    let i = 0;

    while (i < maxIter) {
        // BOLT: Compute sin(E) and F once per loop to avoid redundant evaluations
        const sinE = Math.sin(E);
        const F = E - e * sinE - M;
        if (Math.abs(F) <= tolerance) {
            break;
        }
        // BOLT: Avoid extra Math.cos on convergence and remove duplicate code
        E = E - F / (1.0 - e * Math.cos(E));
        i++;
    }

    return E;
}

/**
 * Converts Keplerian orbital elements to Cartesian state vectors (position and velocity).
 * @param elements Keplerian elements (angles in degrees, distance in AU)
 * @param centralMass_solar Mass of the central body in solar masses
 * @returns Object containing position (AU) and velocity (AU/yr) vectors
 */
export function keplerianToCartesian(elements: KeplerianElements, centralMass_solar: number): { position: Vector3, velocity: Vector3 } {
    const a = elements.semiMajorAxis_au;
    const e = Math.max(0, Math.min(0.9999, elements.eccentricity));
    const i = elements.inclination_deg * (Math.PI / 180.0);
    const Omega = elements.longitudeOfAscendingNode_deg * (Math.PI / 180.0);
    const omega = elements.argumentOfPeriapsis_deg * (Math.PI / 180.0);
    const M = elements.meanAnomaly_deg * (Math.PI / 180.0);

    // Standard gravitational parameter in AU^3 / yr^2
    // G = 4 * pi^2 (approx 39.478)
    const mu = 4.0 * Math.PI * Math.PI * centralMass_solar;

    // 1. Solve Kepler's equation for Eccentric Anomaly E
    const E = solveKepler(M, e);

    // 2. Compute True Anomaly nu using stable atan2
    const nu = 2.0 * Math.atan2(Math.sqrt(1.0 + e) * Math.sin(E / 2.0), Math.sqrt(1.0 - e) * Math.cos(E / 2.0));

    // 3. Distance to central body
    const r = a * (1.0 - e * Math.cos(E));

    // 4. Position in orbital plane (P, Q, W)
    // P points towards periapsis, Q is orthogonal in orbital plane
    const p_x = r * Math.cos(nu);
    const p_y = r * Math.sin(nu);

    // Velocity in orbital plane (radial/transverse form via semi-latus rectum)
    const p = a * (1.0 - e * e);
    const v_x = Math.sqrt(mu / p) * -Math.sin(nu);
    const v_y = Math.sqrt(mu / p) * (e + Math.cos(nu));

    // 5. Transform to 3D space (Euler rotations)
    // Rotation matrices: Rz(-Omega) * Rx(-i) * Rz(-omega)
    
    const cosOmega = Math.cos(Omega);
    const sinOmega = Math.sin(Omega);
    const cosomega = Math.cos(omega);
    const sinomega = Math.sin(omega);
    const cosi = Math.cos(i);
    const sini = Math.sin(i);

    // Transformation matrix components
    const Px = cosOmega * cosomega - sinOmega * sinomega * cosi;
    const Py = sinOmega * cosomega + cosOmega * sinomega * cosi;
    const Pz = sinomega * sini;

    const Qx = -cosOmega * sinomega - sinOmega * cosomega * cosi;
    const Qy = -sinOmega * sinomega + cosOmega * cosomega * cosi;
    const Qz = cosomega * sini;

    return {
        position: {
            x: Px * p_x + Qx * p_y,
            y: Py * p_x + Qy * p_y,
            z: Pz * p_x + Qz * p_y
        },
        velocity: {
            x: Px * v_x + Qx * v_y,
            y: Py * v_x + Qy * v_y,
            z: Pz * v_x + Qz * v_y
        }
    };
}

/**
 * Computes Habitable Zone boundaries based on Kopparapu et al. 2013 (simplified).
 * @param luminositySolar Luminosity of the star in solar units
 * @returns Inner and Outer boundaries in AU
 */
export function computeHabitableZone(luminositySolar: number): { innerAU: number, outerAU: number } {
    if (luminositySolar <= 0) return { innerAU: 0, outerAU: 0 };
    return {
        innerAU: Math.sqrt(luminositySolar / 1.1),
        outerAU: Math.sqrt(luminositySolar / 0.53)
    };
}

/**
 * Checks comet activity thresholds based on solar distance.
 * @param distanceAU Distance to the star in AU
 * @returns Coma and Tail activity status
 */
export function computeCometActivity(distanceAU: number): { comaActive: boolean, tailActive: boolean } {
    return {
        comaActive: distanceAU < 3.0,
        tailActive: distanceAU < 2.5
    };
}
