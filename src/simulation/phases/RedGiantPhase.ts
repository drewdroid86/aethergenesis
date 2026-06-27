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
    public flareMesh!: THREE.InstancedMesh;
    public flareMat!: THREE.ShaderMaterial;
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
                uHbar: { value: 1.0 },
                uLowDetail: { value: 0.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.redGiantMesh = new THREE.Mesh(GEOMETRIES.redGiant, this.redGiantMat);
        this.redGiantGroup.add(this.redGiantMesh);

        // Solar Flares
        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0.8, 0, 0),
            new THREE.Vector3(1.5, 1.5, 0),
            new THREE.Vector3(0, 0, 0.8)
        );
        const flareGeo = new THREE.TubeGeometry(curve, 16, 0.05, 4, false);
        this.flareMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff4400) },
                uOpacity: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    float alpha = (sin(uTime * 2.0 + vUv.x * 10.0) * 0.5 + 0.5) * uOpacity;
                    alpha *= sin(vUv.x * 3.14159);
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.flareMesh = new THREE.InstancedMesh(flareGeo, this.flareMat, 4);
        for(let i=0; i<4; i++) {
            const matrix = new THREE.Matrix4();
            matrix.makeRotationFromEuler(new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            ));
            const s = 0.5 + Math.random() * 0.5;
            matrix.scale(new THREE.Vector3(s * this.baseRadius, s * this.baseRadius, s * this.baseRadius));
            this.flareMesh.setMatrixAt(i, matrix);
        }
        this.redGiantGroup.add(this.flareMesh);

        this.parent.add(this.redGiantGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean): void {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        const giantScale = this.baseRadius * (1.0 + normT * STELLAR_CONSTANTS.VISUALS.RED_GIANT_MAX_SCALE_FACTOR) + Math.sin(appTime * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PULSATION_SPEED) * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PULSATION_AMP;
        this.redGiantMesh.scale.setScalar(giantScale);
        
        this.redGiantMat.uniforms.uTime.value = appTime;
        this.redGiantMat.uniforms.uHbar.value = physics.hbar || 1.0;
        this.redGiantMat.uniforms.uLowDetail.value = (lowDetail || false) ? 1.0 : 0.0;
        this.flareMat.uniforms.uTime.value = appTime;

        if (!lowDetail) {
            for (let i = 0; i < this.planetsInfo.length; i++) {
                const p = this.planetsInfo[i];
                p.pivot.visible = true;
                p.pivot.rotation.y += p.speed * delta;
                if (p.dist < giantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_DMG_RADIUS) {
                    const denominator = giantScale * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PLANET_BURN_RADIUS;
                    const dmg = Math.min(1.0, Math.max(0, 1.0 - (p.dist - giantScale) / Math.max(0.001, denominator)));
                    (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x222222);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffaa00);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = dmg;
                    p.mesh.scale.setScalar(Math.max(0.01, 1.0 - dmg));
                } else {
                    p.mesh.scale.setScalar(1.0);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
                }
            }
        }
    }

    getCurrentTemp(t: number): number {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        return this.tHeat - normT * (this.tHeat - STELLAR_CONSTANTS.TEMPERATURES.RED_GIANT_TARGET);
    }

    getCurrentLum(t: number, mass: number): number {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        // BOLT: (x^2 * x * sqrt(x)) is faster than Math.pow(x, 3.5)
        const msLum = (mass * mass) * mass * Math.sqrt(mass);
        return msLum * (1.0 + normT * 5.0);
    }

    setOpacity(opacity: number): void {
        this.redGiantMat.uniforms.uOpacity.value = opacity;
        this.flareMat.uniforms.uOpacity.value = opacity * 0.8;
    }

    show(): void {
        this.redGiantGroup.visible = true;
        for (let i = 0; i < this.planetsInfo.length; i++) {
            this.planetsInfo[i].pivot.visible = true;
        }
    }

    hide(): void {
        this.redGiantGroup.visible = false;
        for (let i = 0; i < this.planetsInfo.length; i++) {
            this.planetsInfo[i].pivot.visible = false;
        }
    }

    dispose(): void {
        // BOLT: redGiantMesh uses shared GEOMETRIES.redGiant, do NOT dispose
        this.redGiantMat.dispose();
        this.flareMat.dispose();
        this.flareMesh.geometry.dispose();
        this.parent.remove(this.redGiantGroup);
    }
}
