import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';

export class RemnantPhase implements PhaseComponent {
    public neutronStarGroup!: THREE.Group;
    public nsMagneticLines!: THREE.Group;
    public pulsarGroup!: THREE.Group;
    public blackHoleGroup!: THREE.Group;
    
    private parent!: THREE.Group;
    private mass: number;
    private _opNs: number = 0;
    private _opNsLines: number = 0;

    // BOLT: Store shared materials to avoid iterating children in hot update path
    private nsMat!: THREE.MeshBasicMaterial;
    private beamMat!: THREE.MeshBasicMaterial;
    private tubeMat!: THREE.MeshBasicMaterial;
    private bhDiskMat!: THREE.MeshBasicMaterial;

    constructor(mass: number) {
        this.mass = mass;
    }

    init(parent: THREE.Group): void {
        this.parent = parent;

        // BOLT: Initialize shared materials
        this.nsMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0});
        this.beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
        this.tubeMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending});
        this.bhDiskMat = new THREE.MeshBasicMaterial({
            color: 0xff8800, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending
        });

        // Neutron Star
        this.neutronStarGroup = new THREE.Group();
        this.pulsarGroup = new THREE.Group();
        const beam1 = new THREE.Mesh(GEOMETRIES.pulsarBeam1, this.beamMat);
        const beam2 = new THREE.Mesh(GEOMETRIES.pulsarBeam2, this.beamMat);
        this.pulsarGroup.add(beam1);
        this.pulsarGroup.add(beam2);
        this.neutronStarGroup.add(new THREE.Mesh(GEOMETRIES.neutronStar, this.nsMat));
        this.neutronStarGroup.add(this.pulsarGroup);
        
        const nsMagGroup = new THREE.Group();
        const tubes = GEOMETRIES.magneticTubes;
        for (let i = 0; i < tubes.length; i++) {
            nsMagGroup.add(new THREE.Mesh(tubes[i], this.tubeMat));
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
        const diskMesh = new THREE.Mesh(GEOMETRIES.blackHoleDisk, this.bhDiskMat);
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);
        this.parent.add(this.blackHoleGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean): void {
        if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE) {
            this.blackHoleGroup.visible = true;
            if (!lowDetail) this.blackHoleGroup.rotation.y += delta;
            this.blackHoleGroup.rotation.z = Math.PI / 8;
        } else if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
            if (!lowDetail) {
                this.pulsarGroup.rotation.y += delta * 5.0;
                this.nsMagneticLines.rotation.y += delta * 2.0;
            }
        } else {
            this.pulsarGroup.visible = false;
            this.nsMagneticLines.visible = false;
        }
    }

    updateRemnantOpacity(delta: number, targetNs: number): void {
        const speed = delta * STELLAR_CONSTANTS.TRANSITIONS.DEFAULT_SPEED;
        const stepOp = (current: number, target: number) => {
            if (current < target) return Math.min(target, current + speed);
            if (current > target) return Math.max(target, current - speed);
            return current;
        };

        const nextOpNs = stepOp(this._opNs, targetNs);
        if (this._opNs !== nextOpNs) {
            this._opNs = nextOpNs;
            this.nsMat.opacity = this._opNs;
        }

        const targetLines = targetNs ? 0.3 : 0;
        const nextOpLines = stepOp(this._opNsLines, targetLines);
        if (this._opNsLines !== nextOpLines) {
            this._opNsLines = nextOpLines;
            this.tubeMat.opacity = this._opNsLines;
        }

        // Pulsar beams are either on or off for simplicity in opacity guarding
        const targetBeam = targetNs ? 0.6 : 0;
        if (this.beamMat.opacity !== targetBeam) {
            this.beamMat.opacity = targetBeam;
        }
        
        const isVisible = this._opNs > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD || this._opNsLines > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD;
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
        // BOLT: Only dispose local materials. Shared geometries are managed globally.
        this.nsMat.dispose();
        this.beamMat.dispose();
        this.tubeMat.dispose();
        this.bhDiskMat.dispose();

        // Dispose bhCore material which is created inline
        const bhCore = this.blackHoleGroup.children[0] as THREE.Mesh;
        if (bhCore && bhCore.material) (bhCore.material as THREE.Material).dispose();

        this.parent.remove(this.neutronStarGroup);
        this.parent.remove(this.blackHoleGroup);
    }
}
