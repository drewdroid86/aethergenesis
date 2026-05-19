import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { GEOMETRIES } from './geometries';
import { ejectaVS, ejectaFS } from '../../rendering/shaders/stellar';
import { STELLAR_CONSTANTS } from '../../core/constants';

export class SupernovaPhase implements PhaseComponent {
    public supernovaGroup!: THREE.Group;
    public coreFlashMesh!: THREE.Mesh;
    public snRing!: THREE.Mesh;
    public ejectaMat!: THREE.ShaderMaterial;
    public ejectaMesh!: THREE.Points;
    
    private parent!: THREE.Group;
    private mass: number;
    private baseRadius: number;
    public isFlashing: boolean = false;

    constructor(mass: number, baseRadius: number) {
        this.mass = mass;
        this.baseRadius = baseRadius;
    }

    init(parent: THREE.Group): void {
        this.parent = parent;
        this.supernovaGroup = new THREE.Group();
        this.coreFlashMesh = new THREE.Mesh(
            GEOMETRIES.supernovaCore,
            new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending})
        );
        this.supernovaGroup.add(this.coreFlashMesh);
        this.parent.add(this.supernovaGroup);

        this.snRing = new THREE.Mesh(
            GEOMETRIES.supernovaRing,
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
        );
        this.snRing.rotation.x = Math.PI / 2;
        this.parent.add(this.snRing);
        
        const ejectaGeo = new THREE.BufferGeometry();
        const ejectaPos = new Float32Array(1500 * 3);
        const ejectaVel = new Float32Array(1500 * 3);
        for(let i=0; i<1500; i++) {
            const v = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize();
            const speed = 1.0 + Math.random() * 2.0;
            ejectaVel[i*3] = v.x * speed;
            ejectaVel[i*3+1] = v.y * speed;
            ejectaVel[i*3+2] = v.z * speed;
        }
        ejectaGeo.setAttribute('position', new THREE.BufferAttribute(ejectaPos, 3));
        ejectaGeo.setAttribute('velocity', new THREE.BufferAttribute(ejectaVel, 3));
        this.ejectaMat = new THREE.ShaderMaterial({
            uniforms: { uExp: { value: 0 }, uColor: { value: new THREE.Color(0xff4411) } },
            vertexShader: ejectaVS,
            fragmentShader: ejectaFS,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.ejectaMesh = new THREE.Points(ejectaGeo, this.ejectaMat);
        this.parent.add(this.ejectaMesh);
        
        this.hide();
    }

    update(_: number, __: number, ___: THREE.Vector3, ____: PhysicsConstants, t: number, _____: boolean = false): void {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.SUPERNOVA_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.SUPERNOVA_DURATION;
        if (!this.ejectaMat?.uniforms?.uColor) return;
        this.isFlashing = false;
        
        if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
            if (normT < STELLAR_CONSTANTS.VISUALS.SUPERNOVA_FLASH_DURATION) this.isFlashing = true;

            this.snRing.visible = true;
            this.snRing.scale.setScalar(1.0 + normT * STELLAR_CONSTANTS.VISUALS.SUPERNOVA_RING_SCALE_HIGH_MASS);
            (this.snRing.material as THREE.MeshBasicMaterial).opacity = 1.0 - Math.pow(normT, 2);
            
            this.ejectaMesh.visible = true;
            this.ejectaMat.uniforms.uExp.value = normT;
            this.ejectaMat.uniforms.uColor.value.setHex(normT < 0.2 ? 0xffffff : 0xff4411);

            this.coreFlashMesh.scale.setScalar(this.baseRadius * 7.0 * (1.0 - normT));
        } else {
            this.snRing.visible = true;
            this.snRing.scale.setScalar(1.0 + normT * STELLAR_CONSTANTS.VISUALS.SUPERNOVA_RING_SCALE_LOW_MASS);
            (this.snRing.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1.0 - normT);
            (this.snRing.material as THREE.MeshBasicMaterial).color.setHex(0x00ffaa);
            
            this.ejectaMesh.visible = true;
            this.ejectaMat.uniforms.uExp.value = normT * STELLAR_CONSTANTS.VISUALS.SUPERNOVA_EJECTA_EXP_SPEED;
            this.ejectaMat.uniforms.uColor.value.setHex(0x00ffaa);

            this.coreFlashMesh.scale.setScalar(this.baseRadius * (1.0 - normT * 0.8));
        }
    }

    setOpacity(opacity: number): void {
        const mat = this.coreFlashMesh.material as THREE.MeshBasicMaterial;
        if (mat.opacity !== opacity) {
            mat.opacity = opacity;
        }
    }

    show(): void {
        this.supernovaGroup.visible = true;
        this.snRing.visible = true;
        this.ejectaMesh.visible = true;
    }

    hide(): void {
        this.supernovaGroup.visible = false;
        this.snRing.visible = false;
        this.ejectaMesh.visible = false;
        this.isFlashing = false;
    }

    dispose(): void {
        this.coreFlashMesh.geometry.dispose();
        (this.coreFlashMesh.material as THREE.Material).dispose();
        this.snRing.geometry.dispose();
        (this.snRing.material as THREE.Material).dispose();
        this.ejectaMesh.geometry.dispose();
        this.ejectaMat.dispose();
        this.parent.remove(this.supernovaGroup);
        this.parent.remove(this.snRing);
        this.parent.remove(this.ejectaMesh);
    }
}
