import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { displacementVS, starSurfaceFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';

export class ProtostarPhase implements PhaseComponent {
    public protostarGroup!: THREE.Group;
    public protostarMat!: THREE.ShaderMaterial;
    public protostarMesh!: THREE.Mesh;
    public protostarDisk!: THREE.Mesh;
    private parent!: THREE.Group;
    private baseRadius: number;

    constructor(baseRadius: number) {
        this.baseRadius = baseRadius;
    }

    init(parent: THREE.Group): void {
        this.parent = parent;
        this.protostarGroup = new THREE.Group();
        this.protostarMat = new THREE.ShaderMaterial({
            vertexShader: displacementVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff3300) },
                uTurbulence: { value: 2.0 },
                uOpacity: { value: 0.0 },
                uHbar: { value: 1.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.protostarMesh = new THREE.Mesh(GEOMETRIES.protostar, this.protostarMat);
        this.protostarDisk = new THREE.Mesh(
            GEOMETRIES.protostarDisk,
            new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
        );
        this.protostarDisk.rotation.x = Math.PI / 2;
        this.protostarGroup.add(this.protostarMesh);
        this.protostarGroup.add(this.protostarDisk);
        this.parent.add(this.protostarGroup);
        
        this.hide();
    }

    update(delta: number, _appTime: number, __cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number): void {
        const normT = (t - 0.05) / 0.10;
        const introScale = this.baseRadius * (0.5 + normT * 0.5);
        this.protostarMesh.scale.setScalar(introScale);
        
        this.protostarMat.uniforms.uTime.value = _appTime;
        this.protostarMat.uniforms.uHbar.value = physics.hbar || 1.0;
        this.protostarDisk.rotation.z += delta;
    }

    setOpacity(opacity: number): void {
        this.protostarMat.uniforms.uOpacity.value = opacity;
        (this.protostarDisk.material as THREE.MeshBasicMaterial).opacity = opacity * STELLAR_CONSTANTS.VISUALS.PROTOSTAR_DISK_OPACITY;
    }

    show(): void {
        this.protostarGroup.visible = true;
    }

    hide(): void {
        this.protostarGroup.visible = false;
    }

    dispose(): void {
        this.protostarMesh.geometry.dispose();
        this.protostarMat.dispose();
        this.protostarDisk.geometry.dispose();
        (this.protostarDisk.material as THREE.Material).dispose();
        this.parent.remove(this.protostarGroup);
    }
}
