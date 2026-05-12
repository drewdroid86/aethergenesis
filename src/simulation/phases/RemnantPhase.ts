import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { GEOMETRIES } from './geometries';

export class RemnantPhase implements PhaseComponent {
    public neutronStarGroup!: THREE.Group;
    public nsMagneticLines!: THREE.Group;
    public pulsarGroup!: THREE.Group;
    public blackHoleGroup!: THREE.Group;
    
    private parent!: THREE.Group;
    private mass: number;

    constructor(mass: number) {
        this.mass = mass;
    }

    init(parent: THREE.Group): void {
        this.parent = parent;

        // Neutron Star
        this.neutronStarGroup = new THREE.Group();
        const nsMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0});
        this.pulsarGroup = new THREE.Group();
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
        const beam1 = new THREE.Mesh(GEOMETRIES.pulsarBeam, beamMat);
        const beam2 = new THREE.Mesh(GEOMETRIES.pulsarBeam, beamMat);
        beam2.rotation.x = Math.PI;
        this.pulsarGroup.add(beam1);
        this.pulsarGroup.add(beam2);
        this.neutronStarGroup.add(new THREE.Mesh(GEOMETRIES.neutronStar, nsMat));
        this.neutronStarGroup.add(this.pulsarGroup);
        
        const nsMagGroup = new THREE.Group();
        const tubeMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending});
        for(const tubeGeo of GEOMETRIES.magneticTubes) {
            nsMagGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
        }
        
        this.nsMagneticLines = nsMagGroup;
        this.neutronStarGroup.add(this.nsMagneticLines);
        this.parent.add(this.neutronStarGroup);

        // Black Hole
        this.blackHoleGroup = new THREE.Group();
        const bhCore = new THREE.Mesh(
            GEOMETRIES.blackHoleCore,
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        const diskMat = new THREE.MeshBasicMaterial({ 
            color: 0xff8800, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
        });
        const diskMesh = new THREE.Mesh(GEOMETRIES.blackHoleDisk, diskMat);
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);
        this.parent.add(this.blackHoleGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, physics: PhysicsConstants, cameraPos: THREE.Vector3, t: number): void {
        if (this.mass > 15) {
            this.blackHoleGroup.visible = true;
            this.blackHoleGroup.rotation.y += delta;
            this.blackHoleGroup.rotation.z = Math.PI / 8;
        } else if (this.mass > 8) {
            this.pulsarGroup.rotation.y += delta * 5.0;
            this.nsMagneticLines.rotation.y += delta * 2.0;
        } else {
            this.pulsarGroup.visible = false;
            this.nsMagneticLines.visible = false;
        }
    }

    updateRemnantOpacity(delta: number, targetNs: number): void {
        const speed = delta * 4.0;
        const stepOp = (current: number, target: number) => {
            if (current < target) return Math.min(target, current + speed);
            if (current > target) return Math.max(target, current - speed);
            return current;
        };

        const nsMeshMat = (this.neutronStarGroup.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const opNs = stepOp(nsMeshMat.opacity, targetNs);
        nsMeshMat.opacity = opNs;

        const firstMagLine = this.nsMagneticLines.children[0] as THREE.Mesh;
        const currentMagOp = (firstMagLine.material as THREE.MeshBasicMaterial).opacity;
        const opNsLines = stepOp(currentMagOp, targetNs ? 0.3 : 0);

        this.nsMagneticLines.children.forEach(c => {
            ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = opNsLines;
        });
        this.pulsarGroup.children.forEach(c => {
            ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = targetNs ? 0.6 : 0;
        });
        
        this.neutronStarGroup.visible = opNs > 0.01 || opNsLines > 0.01;
    }

    show(): void {
        // Visibility is handled by update logic and updateRemnantOpacity
    }

    hide(): void {
        this.neutronStarGroup.visible = false;
        this.blackHoleGroup.visible = false;
    }

    dispose(): void {
        this.neutronStarGroup.children.forEach(c => {
            if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
            if ((c as THREE.Mesh).material) ((c as THREE.Mesh).material as THREE.Material).dispose();
        });
        this.nsMagneticLines.children.forEach(c => {
            if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
            if ((c as THREE.Mesh).material) ((c as THREE.Mesh).material as THREE.Material).dispose();
        });
        this.blackHoleGroup.children.forEach(c => {
            if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
            if ((c as THREE.Mesh).material) ((c as THREE.Mesh).material as THREE.Material).dispose();
        });
        this.parent.remove(this.neutronStarGroup);
        this.parent.remove(this.blackHoleGroup);
    }
}
