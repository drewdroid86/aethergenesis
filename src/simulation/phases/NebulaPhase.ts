import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { basicVS, nebulaFS, particleVS, particleFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';
import { phaseCounters } from '../../utils/performance';

export class NebulaPhase implements PhaseComponent {
    private nebulaMat!: THREE.ShaderMaterial;
    private nebulaMesh!: THREE.Mesh;
    private dustCloud!: THREE.Points;
    private parent!: THREE.Group;
    private _matrixInitialized: boolean = false;
    private initialized = false;

    constructor() {
        phaseCounters.inits++;
    }

    init(parent: THREE.Group): void {
        if (this.initialized) {
            phaseCounters.blockedDoubleInits++;
            console.warn('[Diagnostics] NebulaPhase already initialized for this star! Guarding duplicate init.');
            return;
        }
        this.initialized = true;
        this.parent = parent;

        this.nebulaMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: nebulaFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x3a0088) },
                uCollapse: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uInverseModelMatrix: { value: new THREE.Matrix4() },
                uOpacity: { value: 1.0 }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide
        });
        this.nebulaMat.name = 'NebulaPhaseMaterial';
        this.nebulaMat.customProgramCacheKey = () => 'nebula_phase_material';
        this.nebulaMesh = new THREE.Mesh(GEOMETRIES.nebula, this.nebulaMat);
        this.nebulaMesh.scale.setScalar(15);
        this.parent.add(this.nebulaMesh);

        // Dust Cloud
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(500 * 3);
        const dustSize = new Float32Array(500);
        for(let i=0; i<500; i++) {
            const r = 2 + Math.pow(Math.random(), 2) * 15;
            const a = Math.random() * Math.PI * 2;
            const h = (Math.random() - 0.5) * Math.max(0.5, r * 0.2);
            dustPos[i*3] = Math.cos(a) * r;
            dustPos[i*3+1] = h;
            dustPos[i*3+2] = Math.sin(a) * r;
            dustSize[i] = Math.random() * 0.5 + 0.1;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        dustGeo.setAttribute('size', new THREE.BufferAttribute(dustSize, 1));
        const dustMat = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(0xaa66ff) }, uAlpha: { value: 1.0 } },
            vertexShader: particleVS,
            fragmentShader: particleFS,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        dustMat.name = 'NebulaPhaseDustCloudMaterial';
        dustMat.customProgramCacheKey = () => 'nebula_dust_cloud_material';
        this.dustCloud = new THREE.Points(dustGeo, dustMat);
        this.parent.add(this.dustCloud);
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, _lowDetail?: boolean, globalFade: number = 1.0): void {
        const normT = t / STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT;
        
        this.nebulaMat.uniforms.uTime.value = appTime;
        this.nebulaMat.uniforms.uCollapse.value = normT;
        this.nebulaMat.uniforms.uCameraPos.value.copy(cameraPos);
        this.nebulaMat.uniforms.uOpacity.value = globalFade;

        // Update inverse matrix for local space calculations in the shader
        this.nebulaMesh.updateMatrixWorld(true);
        this.nebulaMat.uniforms.uInverseModelMatrix.value.copy(this.nebulaMesh.matrixWorld).invert();
        
        this.dustCloud.rotation.y += delta * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_ROTATION_SPEED;
        (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = globalFade;
        this.dustCloud.scale.setScalar(1.0 - normT * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_SCALE_REDUCTION);
    }

    // Special update for when it's still visible during Protostar phase
    updateAsSecondary(delta: number, appTime: number, cameraPos: THREE.Vector3, normT: number, globalFade: number = 1.0): void {
        this.nebulaMesh.visible = globalFade > 0.01;
        this.nebulaMat.uniforms.uCollapse.value = 1.0;
        this.nebulaMat.uniforms.uOpacity.value = globalFade;
        this.dustCloud.visible = globalFade > 0.01;
        this.dustCloud.rotation.y += delta * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_ROTATION_SPEED_SECONDARY;
        (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = (1.0 - normT * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_ALPHA_REDUCTION) * globalFade;
        this.dustCloud.scale.setScalar(STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_SCALE_SECONDARY - normT * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_SCALE_SECONDARY_REDUCTION);
    }

    setOpacity(opacity: number): void {
        if (this.nebulaMat) {
            this.nebulaMat.uniforms.uOpacity.value = opacity;
        }
        if (this.dustCloud) {
            (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = opacity;
        }
    }

    show(): void {
        this.nebulaMesh.visible = true;
        this.dustCloud.visible = true;
    }

    hide(): void {
        this.nebulaMesh.visible = false;
        this.dustCloud.visible = false;
    }

    dispose(): void {
        phaseCounters.disposals++;
        // BOLT: nebulaMesh uses shared GEOMETRIES.nebula, do NOT dispose
        this.nebulaMat.dispose();
        this.dustCloud.geometry.dispose(); // Unique per star
        (this.dustCloud.material as THREE.Material).dispose();
        this.parent.remove(this.nebulaMesh);
        this.parent.remove(this.dustCloud);
    }
}
