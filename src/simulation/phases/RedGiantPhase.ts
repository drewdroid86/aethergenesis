import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { basicVS, starSurfaceFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';
import { PlanetInfo } from './MainSequencePhase';
import { STELLAR_CONSTANTS } from '../../core/constants';

export class RedGiantPhase implements PhaseComponent {
    public redGiantGroup!: THREE.Group;
    public redGiantMat!: THREE.ShaderMaterial;
    public redGiantMesh!: THREE.Mesh;
    private parent!: THREE.Group;
    private baseRadius: number;
    private tHeat: number;
    private planetsInfo: PlanetInfo[] = [];

    constructor(baseRadius: number, tHeat: number) {
        this.baseRadius = baseRadius;
        this.tHeat = tHeat;
    }

    setPlanets(planets: PlanetInfo[]): void {
        this.planetsInfo = planets;
    }

    init(parent: THREE.Group): void {
        this.parent = parent;
        this.redGiantGroup = new THREE.Group();
        this.redGiantMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff4400) },
                uTurbulence: { value: 0.5 },
                uOpacity: { value: 0.0 },
                uHbar: { value: 1.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.redGiantMesh = new THREE.Mesh(GEOMETRIES.redGiant, this.redGiantMat);
        this.redGiantGroup.add(this.redGiantMesh);
        this.parent.add(this.redGiantGroup);
        
        this.hide();
    }

    update(delta: number, _appTime: number, __cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number): void {
        const normT = (t - 0.70) / 0.15;
        const giantScale = this.baseRadius * (1.0 + normT * 6.0) + Math.sin(_appTime * 2.0) * 0.1;
        this.redGiantMesh.scale.setScalar(giantScale);
        
        this.redGiantMat.uniforms.uTime.value = _appTime;
        this.redGiantMat.uniforms.uHbar.value = physics.hbar || 1.0;

        if (!lowDetail) {
            this.planetsInfo.forEach(p => {
                p.pivot.visible = true;
                p.pivot.rotation.y += p.speed * delta;
                if (p.dist < giantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_DMG_RADIUS) {
                    const dmg = Math.max(0, 1.0 - (p.dist - giantScale) / (giantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_BURN_RADIUS));
                    (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x222222);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffaa00);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = dmg;
                    p.mesh.scale.setScalar(Math.max(0.01, 1.0 - dmg));
                } else {
                    p.mesh.scale.setScalar(1.0);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
                }
            });
        }
    }

    getCurrentTemp(t: number): number {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        return this.tHeat - normT * (this.tHeat - STELLAR_CONSTANTS.TEMPERATURES.RED_GIANT_TARGET);
    }

    getCurrentLum(t: number, mass: number): number {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        return Math.pow(mass, STELLAR_CONSTANTS.PHYSICS.MASS_LUMINOSITY_EXPONENT) * (1.0 + normT * 5.0);
    }

    setOpacity(opacity: number): void {
        this.redGiantMat.uniforms.uOpacity.value = opacity;
    }

    show(): void {
        this.redGiantGroup.visible = true;
        this.planetsInfo.forEach(p => p.pivot.visible = true);
    }

    hide(): void {
        this.redGiantGroup.visible = false;
        this.planetsInfo.forEach(p => p.pivot.visible = false);
    }

    dispose(): void {
        this.redGiantMesh.geometry.dispose();
        this.redGiantMat.dispose();
        this.parent.remove(this.redGiantGroup);
    }
}
