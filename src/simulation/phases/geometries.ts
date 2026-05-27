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

export const GEOMETRIES = {
    nebula: new THREE.SphereGeometry(15, 32, 32),
    protostar: new THREE.SphereGeometry(1, 64, 64),
    protostarDisk: new THREE.TorusGeometry(2, 0.4, 8, 32),
    mainSeq: new THREE.SphereGeometry(1, 64, 64),
    corona: new THREE.SphereGeometry(1.15, 32, 32),
    redGiant: new THREE.SphereGeometry(1, 64, 64),
    supernovaCore: new THREE.SphereGeometry(1, 48, 48),
    habitableZone: new THREE.TorusGeometry(1, 0.05, 8, 64),
    planet: new THREE.SphereGeometry(1, 16, 16),
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
    blackHoleCore: new THREE.SphereGeometry(0.5, 32, 32),
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
