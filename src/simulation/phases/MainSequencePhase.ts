import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { subtleDisplacementVS, starSurfaceFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';

export interface PlanetInfo {
    pivot: THREE.Group;
    mesh: THREE.Mesh;
    dist: number;
    speed: number;
}

export class MainSequencePhase implements PhaseComponent {
    public mainSeqGroup!: THREE.Group;
    public starMat!: THREE.ShaderMaterial;
    public starMesh!: THREE.Mesh;
    public coronaMesh!: THREE.Mesh;
    public hzMesh!: THREE.Mesh;
    public planetsInfo: PlanetInfo[] = [];
    
    private parent!: THREE.Group;
    private mass: number;
    private baseRadius: number;

    constructor(mass: number, baseRadius: number) {
        this.mass = mass;
        this.baseRadius = baseRadius;
    }

    init(parent: THREE.Group): void {
        this.parent = parent;
        this.mainSeqGroup = new THREE.Group();
        
        let msColor = 0xffaa44; 
        if (this.mass > 8) msColor = 0x99aaff; 
        else if (this.mass > 2) msColor = 0xffffdd; 
        
        this.starMat = new THREE.ShaderMaterial({
            vertexShader: subtleDisplacementVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(msColor) },
                uTurbulence: { value: 1.0 },
                uOpacity: { value: 0.0 },
                uHbar: { value: 1.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.starMesh = new THREE.Mesh(GEOMETRIES.mainSeq, this.starMat);
        this.starMesh.scale.setScalar(this.baseRadius); // BOLT: Set scale once
        this.coronaMesh = new THREE.Mesh(
            GEOMETRIES.corona,
            new THREE.MeshBasicMaterial({ color: msColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
        );
        const haloMesh = new THREE.Mesh(
            GEOMETRIES.mainSeq,
            new THREE.MeshBasicMaterial({ color: msColor, transparent: true, opacity: 0.1, side: THREE.BackSide, blending: THREE.AdditiveBlending })
        );
        haloMesh.scale.setScalar(this.baseRadius * 1.4);
        
        this.mainSeqGroup.add(this.starMesh);
        this.mainSeqGroup.add(this.coronaMesh);
        this.mainSeqGroup.add(haloMesh);
        this.parent.add(this.mainSeqGroup);

        // Habitable Zone
        const lum = Math.pow(this.mass, 3.5);
        const hzRadius = Math.max(4, Math.sqrt(lum) * 2.5);
        this.hzMesh = new THREE.Mesh(
            GEOMETRIES.habitableZone,
            new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending })
        );
        this.hzMesh.scale.setScalar(hzRadius);
        this.hzMesh.rotation.x = Math.PI / 2;
        this.hzMesh.rotation.y = Math.random() * Math.PI * 0.2;
        this.hzMesh.rotation.z = Math.random() * Math.PI * 0.2;
        this.parent.add(this.hzMesh);

        // Planets
        for(let i=0; i<4; i++) {
            const dist = 3 + Math.random() * 8 + (i * 2); 
            const pScale = 0.1 + Math.random()*0.15;
            const pMesh = new THREE.Mesh(
                GEOMETRIES.planet,
                new THREE.MeshStandardMaterial({color: 0xaaaaaa, roughness: 0.8})
            );
            pMesh.scale.setScalar(pScale);
            pMesh.position.x = dist;
            const pivot = new THREE.Group();
            pivot.rotation.y = Math.random() * Math.PI * 2;
            const speed = (0.5 + Math.random()) / Math.sqrt(dist);
            pivot.add(pMesh);
            this.parent.add(pivot);
            this.planetsInfo.push({ pivot, mesh: pMesh, dist, speed });
        }
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number): void {
        // BOLT: Removed redundant scale assignment
        this.starMat.uniforms.uTime.value = appTime;
        this.starMat.uniforms.uHbar.value = physics.hbar || 1.0;

        this.planetsInfo.forEach(p => {
            // BOLT: Removed redundant visibility and material assignments
            p.pivot.rotation.y += p.speed * delta;
        });
    }

    setOpacity(opacity: number): void {
        this.starMat.uniforms.uOpacity.value = opacity;
        (this.coronaMesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.3;
    }

    show(): void {
        this.mainSeqGroup.visible = true;
        this.hzMesh.visible = true;
        this.planetsInfo.forEach(p => p.pivot.visible = true);
    }

    hide(): void {
        this.mainSeqGroup.visible = false;
        this.hzMesh.visible = false;
        this.planetsInfo.forEach(p => p.pivot.visible = false);
    }

    dispose(): void {
        this.starMesh.geometry.dispose();
        this.starMat.dispose();
        this.coronaMesh.geometry.dispose();
        (this.coronaMesh.material as THREE.Material).dispose();
        this.hzMesh.geometry.dispose();
        (this.hzMesh.material as THREE.Material).dispose();
        this.planetsInfo.forEach(p => {
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.Material).dispose();
            this.parent.remove(p.pivot);
        });
        this.parent.remove(this.mainSeqGroup);
        this.parent.remove(this.hzMesh);
    }
}
