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
    private _opNs: number = 0;
    private _opNsLines: number = 0;

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
        const beam1 = new THREE.Mesh(GEOMETRIES.pulsarBeam1, beamMat);
        const beam2 = new THREE.Mesh(GEOMETRIES.pulsarBeam2, beamMat);
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

        // Inner hot ring
        const innerRingMat = new THREE.MeshBasicMaterial({
            color: 0xff4400, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending
        });
        const innerRing = new THREE.Mesh(GEOMETRIES.blackHoleDisk, innerRingMat);
        innerRing.scale.setScalar(2.2 / 1.5);
        this.blackHoleGroup.add(innerRing);

        // Outer cool ring
        const outerRingMat = new THREE.MeshBasicMaterial({
            color: 0x4488ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending
        });
        const outerRing = new THREE.Mesh(GEOMETRIES.blackHoleDisk, outerRingMat);
        outerRing.scale.setScalar(3.0 / 1.5);
        this.blackHoleGroup.add(outerRing);

        // Black Hole Light
        const bhLight = new THREE.PointLight(0xff6600, 2, 20);
        this.blackHoleGroup.add(bhLight);

        this.parent.add(this.blackHoleGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number): void {
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

        const nextOpNs = stepOp(this._opNs, targetNs);
        if (this._opNs !== nextOpNs) {
            this._opNs = nextOpNs;
            const nsMeshMat = (this.neutronStarGroup.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
            nsMeshMat.opacity = this._opNs;
        }

        const targetLines = targetNs ? 0.3 : 0;
        const nextOpLines = stepOp(this._opNsLines, targetLines);
        if (this._opNsLines !== nextOpLines) {
            this._opNsLines = nextOpLines;
            this.nsMagneticLines.children.forEach(c => {
                ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = this._opNsLines;
            });
        }

        // Pulsar beams are either on or off for simplicity in opacity guarding
        const targetBeam = targetNs ? 0.6 : 0;
        const firstBeam = this.pulsarGroup.children[0] as THREE.Mesh;
        if ((firstBeam.material as THREE.MeshBasicMaterial).opacity !== targetBeam) {
            this.pulsarGroup.children.forEach(c => {
                ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = targetBeam;
            });
        }
        
        const isVisible = this._opNs > 0.01 || this._opNsLines > 0.01;
        if (this.neutronStarGroup.visible !== isVisible) {
            this.neutronStarGroup.visible = isVisible;
        }
    }

    show(): void {
        // Visibility is handled by update logic and updateRemnantOpacity
    }

    hide(): void {
        this.neutronStarGroup.visible = false;
        this.blackHoleGroup.visible = false;
    }

    dispose(): void {
        // BOLT: Stop disposing shared global geometries. Only dispose local materials if unique.
        this.neutronStarGroup.children.forEach(c => {
            if ((c as THREE.Mesh).material) ((c as THREE.Mesh).material as THREE.Material).dispose();
        });
        this.nsMagneticLines.children.forEach(c => {
            if ((c as THREE.Mesh).material) ((c as THREE.Mesh).material as THREE.Material).dispose();
        });
        this.blackHoleGroup.children.forEach(c => {
            if ((c as THREE.Mesh).material) ((c as THREE.Mesh).material as THREE.Material).dispose();
            if ((c as any).dispose) (c as any).dispose();
        });
        this.parent.remove(this.neutronStarGroup);
        this.parent.remove(this.blackHoleGroup);
    }
}
