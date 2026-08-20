import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { subtleDisplacementVS, starSurfaceFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';
import { phaseCounters } from '../../utils/performance';
import { colorTempToRGB } from '../../physics/math';
import { computeLuminosity } from '../StellarPhysics';

export class RedGiantPhase implements PhaseComponent {
    public redGiantGroup!: THREE.Group;
    public redGiantMat!: THREE.ShaderMaterial;
    public redGiantMesh!: THREE.Mesh;
    public flareMesh!: THREE.InstancedMesh;
    public flareMat!: THREE.ShaderMaterial;
    private _haloMesh!: THREE.Mesh;
    private _haloMat!: THREE.MeshBasicMaterial;
    private parent!: THREE.Group;
    private baseRadius: number;
    private tHeat: number;

    private initialized = false;

    constructor(baseRadius: number, tHeat: number) {
        this.baseRadius = baseRadius;
        this.tHeat = tHeat;
        phaseCounters.inits++;
    }

    init(parent: THREE.Group): void {
        if (this.initialized) {
            phaseCounters.blockedDoubleInits++;
            console.warn('[Diagnostics] RedGiantPhase already initialized for this star! Guarding duplicate init.');
            return;
        }
        this.initialized = true;
        this.parent = parent;
        this.redGiantGroup = new THREE.Group();
        this.redGiantMat = new THREE.ShaderMaterial({
            vertexShader: subtleDisplacementVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff3300) },
                uTurbulence: { value: 0.8 },
                uOpacity: { value: 0.0 },
                uHbar: { value: 1.0 },
                uLowDetail: { value: 0.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.redGiantMat.name = 'RedGiantPhaseMaterial';
        this.redGiantMat.customProgramCacheKey = () => 'red_giant_star_material';
        this.redGiantMesh = new THREE.Mesh(GEOMETRIES.redGiant, this.redGiantMat);
        this.redGiantGroup.add(this.redGiantMesh);

        // Luminous red atmospheric halo envelope
        this._haloMat = new THREE.MeshBasicMaterial({
            color: 0xff2200,
            transparent: true,
            opacity: 0.0,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        this._haloMat.name = 'RedGiantHaloMeshMaterial';
        this._haloMesh = new THREE.Mesh(GEOMETRIES.redGiant, this._haloMat);
        this.redGiantGroup.add(this._haloMesh);

        // Solar Flares
        const flareGeo = GEOMETRIES.flare;
        this.flareMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff3300) },
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
        this.flareMat.name = 'RedGiantPhaseFlareMaterial';
        this.flareMat.customProgramCacheKey = () => 'red_giant_flare_material';
        
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

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean, currentTemp?: number): void {
        const giantScale = this.getCurrentScale(t, appTime);
        this.redGiantMesh.scale.setScalar(giantScale);
        if (this._haloMesh) {
            this._haloMesh.scale.setScalar(giantScale * 1.35);
        }
        if (this.flareMesh) {
            this.flareMesh.scale.setScalar(giantScale / this.baseRadius);
        }
        
        this.redGiantMat.uniforms.uTime.value = appTime;
        this.redGiantMat.uniforms.uHbar.value = physics.hbar || 1.0;
        this.redGiantMat.uniforms.uLowDetail.value = (lowDetail || false) ? 1.0 : 0.0;
        this.flareMat.uniforms.uTime.value = appTime;

        const effectiveTemp = currentTemp ?? this.getCurrentTemp(t);
        colorTempToRGB(effectiveTemp, this.redGiantMat.uniforms.uColor.value);
        // Titanium oxide & molecular absorption enhances deep red chromatic saturation for red giants
        this.redGiantMat.uniforms.uColor.value.r = Math.max(this.redGiantMat.uniforms.uColor.value.r, 1.0);
        this.redGiantMat.uniforms.uColor.value.g *= 0.45;
        this.redGiantMat.uniforms.uColor.value.b *= 0.15;

        if (this._haloMat) {
            this._haloMat.color.copy(this.redGiantMat.uniforms.uColor.value);
        }
        if (this.flareMat) {
            this.flareMat.uniforms.uColor.value.copy(this.redGiantMat.uniforms.uColor.value);
        }
    }

    /**
     * Returns the current world-space radius of the red giant mesh.
     * Extracted from update() so HeroStarSystem can pass it to
     * PlanetarySystem.updateFromBuffer() without duplicating the formula.
     */
    getCurrentScale(t: number, appTime: number): number {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        return this.baseRadius * (1.0 + normT * STELLAR_CONSTANTS.VISUALS.RED_GIANT_MAX_SCALE_FACTOR)
            + Math.sin(appTime * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PULSATION_SPEED) * STELLAR_CONSTANTS.VISUALS.RED_GIANT_PULSATION_AMP;
    }

    getCurrentTemp(t: number): number {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        return this.tHeat - normT * (this.tHeat - STELLAR_CONSTANTS.TEMPERATURES.RED_GIANT_TARGET);
    }

    getCurrentLum(t: number, mass: number): number {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.RED_GIANT_DURATION;
        return computeLuminosity(mass) * (1.0 + normT * 5.0);
    }

    setOpacity(opacity: number): void {
        this.redGiantMat.uniforms.uOpacity.value = opacity;
        this.flareMat.uniforms.uOpacity.value = opacity * 0.8;
        if (this._haloMat) {
            this._haloMat.opacity = opacity * 0.35;
        }
    }

    show(): void {
        this.redGiantGroup.visible = true;
    }

    hide(): void {
        this.redGiantGroup.visible = false;
    }

    dispose(): void {
        phaseCounters.disposals++;
        // BOLT: redGiantMesh and flareMesh use shared GEOMETRIES, do NOT dispose
        this.redGiantMat.dispose();
        this.flareMat.dispose();
        if (this._haloMat) {
            this._haloMat.dispose();
        }
        this.parent.remove(this.redGiantGroup);
    }
}
