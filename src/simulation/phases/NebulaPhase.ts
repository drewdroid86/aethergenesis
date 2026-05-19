import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { basicVS, nebulaFS, particleVS, particleFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';

export class NebulaPhase implements PhaseComponent {
    private nebulaMat!: THREE.ShaderMaterial;
    private nebulaMesh!: THREE.Mesh;
    private dustCloud!: THREE.Points;
    private parent!: THREE.Group;
    init(parent: THREE.Group): void {
        this.parent = parent;

        this.nebulaMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: nebulaFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x3a0088) },
                uCollapse: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uInverseModelMatrix: { value: new THREE.Matrix4() }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide
        });
        this.nebulaMesh = new THREE.Mesh(GEOMETRIES.nebula, this.nebulaMat);
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
        this.dustCloud = new THREE.Points(
            dustGeo,
            new THREE.ShaderMaterial({
                uniforms: { uColor: { value: new THREE.Color(0xaa66ff) }, uAlpha: { value: 1.0 } },
                vertexShader: particleVS,
                fragmentShader: particleFS,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        this.parent.add(this.dustCloud);
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, _physics: PhysicsConstants, t: number, _lowDetail?: boolean): void {
        const normT = t / STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT;
        
        this.nebulaMat.uniforms.uTime.value = appTime;
        this.nebulaMat.uniforms.uCollapse.value = normT;
        this.nebulaMat.uniforms.uCameraPos.value.copy(cameraPos);

        // Update inverse matrix for local space calculations in the shader
        this.nebulaMesh.updateMatrixWorld(true);
        this.nebulaMat.uniforms.uInverseModelMatrix.value.copy(this.nebulaMesh.matrixWorld).invert();
        
        this.dustCloud.rotation.y += delta * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_ROTATION_SPEED;
        (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 1.0;
        this.dustCloud.scale.setScalar(1.0 - normT * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_SCALE_REDUCTION);
    }

    // Special update for when it's still visible during Protostar phase
    updateAsSecondary(delta: number, _appTime: number, _cameraPos: THREE.Vector3, normT: number): void {
        this.nebulaMesh.visible = true;
        this.nebulaMat.uniforms.uCollapse.value = 1.0;
        this.dustCloud.visible = true;
        this.dustCloud.rotation.y += delta * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_ROTATION_SPEED_SECONDARY;
        (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 1.0 - normT * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_ALPHA_REDUCTION;
        this.dustCloud.scale.setScalar(STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_SCALE_SECONDARY - normT * STELLAR_CONSTANTS.VISUALS.NEBULA_DUST_SCALE_SECONDARY_REDUCTION);
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
        this.nebulaMesh.geometry.dispose();
        this.nebulaMat.dispose();
        this.dustCloud.geometry.dispose();
        (this.dustCloud.material as THREE.Material).dispose();
        this.parent.remove(this.nebulaMesh);
        this.parent.remove(this.dustCloud);
    }
}
