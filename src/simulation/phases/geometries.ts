import * as THREE from 'three';

class MagneticCurve extends THREE.Curve<THREE.Vector3> {
    constructor(public angle: number) { super(); }
    getPoint(t: number, optionalTarget = new THREE.Vector3()) {
        const a = this.angle;
        const th = t * Math.PI;
        const r = 0.5 * Math.sin(th);
        const x = r * Math.cos(a);
        const y = 0.5 * Math.cos(th);
        const z = r * Math.sin(a);
        return optionalTarget.set(x, y, z);
    }
}

/** Shared disk annulus at the Cygnus X-1 shadow limb. Theta segments stay ≤ 96. */
export const BH_DISK_INNER = 1.15;
export const BH_DISK_OUTER = 4.8;
export const BH_DISK_THETA_SEGMENTS = 96;
export const BH_DISK_RADIAL_SEGMENTS = 12;
/** Geometry radius of GEOMETRIES.blackHoleCore before per-mass scale. */
export const BH_CORE_RADIUS = 0.5;

export const GEOMETRIES = {
    nebula: new THREE.SphereGeometry(1, 48, 48),
    protostar: new THREE.SphereGeometry(1, 64, 64),
    protostarDisk: new THREE.TorusGeometry(2, 0.4, 8, 32),
    mainSeq: new THREE.SphereGeometry(1, 64, 64),
    corona: new THREE.SphereGeometry(1.15, 32, 32),
    redGiant: new THREE.SphereGeometry(1, 64, 64),
    supernovaCore: new THREE.SphereGeometry(1, 48, 48),
    habitableZone: new THREE.TorusGeometry(1, 0.05, 8, 64),
    planet: new THREE.SphereGeometry(1, 48, 48),
    planetRing: (() => {
        const geo = new THREE.RingGeometry(1.38, 2.45, 64, 4);
        geo.rotateX(Math.PI / 2);
        return geo;
    })(),
    supernovaRing: new THREE.TorusGeometry(1, 0.1, 16, 64),
    neutronStar: new THREE.SphereGeometry(0.1, 32, 32),
    pulsarBeam1: (() => {
        const geo = new THREE.CylinderGeometry(0.02, 0.02, 3, 8);
        geo.translate(0, 1.5, 0);
        return geo;
    })(),
    pulsarBeam2: (() => {
        const geo = new THREE.CylinderGeometry(0.02, 0.02, 3, 8);
        geo.translate(0, -1.5, 0);
        return geo;
    })(),
    // Shadow authority lives in RemnantPhase.blackHoleShadowRadius. These
    // radii are the Cygnus X-1 (21.2 M☉) mesh: inner edge = b_c, core sphere
    // is scaled per remnant so its limb matches that same b_c.
    blackHoleCore: new THREE.SphereGeometry(BH_CORE_RADIUS, 32, 32),
    blackHoleDisk: (() => {
        const geo = new THREE.RingGeometry(
            BH_DISK_INNER,
            BH_DISK_OUTER,
            BH_DISK_THETA_SEGMENTS,
            BH_DISK_RADIAL_SEGMENTS,
        );
        geo.rotateX(Math.PI / 2);
        // Far-side vertices bend off the plane (see RemnantPhase disk shader).
        // The flat annulus bound would clip that curl at the frustum edge.
        geo.computeBoundingSphere();
        if (geo.boundingSphere) geo.boundingSphere.radius += 0.6;
        geo.computeBoundingBox();
        if (geo.boundingBox) {
            geo.boundingBox.min.y -= 0.6;
            geo.boundingBox.max.y += 0.6;
        }
        return geo;
    })(),
    flare: (() => {
        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0.8, 0, 0),
            new THREE.Vector3(1.5, 1.5, 0),
            new THREE.Vector3(0, 0, 0.8)
        );
        return new THREE.TubeGeometry(curve, 32, 0.045, 12, false);
    })(),
    protostarJet: new THREE.CylinderGeometry(0.05, 0.4, 8.0, 12, 1, true),
    hit: new THREE.SphereGeometry(8, 16, 16),
    magneticTubes: (() => {
        const tubes: THREE.TubeGeometry[] = [];
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            const curve = new MagneticCurve(a);
            tubes.push(new THREE.TubeGeometry(curve, 20, 0.01, 8, false));
        }
        return tubes;
    })()
};
