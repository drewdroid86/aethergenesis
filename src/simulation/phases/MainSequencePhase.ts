import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { subtleDisplacementVS, starSurfaceFS } from '../../rendering/shaders/stellar';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';

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
        if (this.mass < 0.3) msColor = 0xcc44bb;        // Brown dwarf — magenta
        else if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) msColor = 0x99aaff; 
        else if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_INTERMEDIATE) msColor = 0xffffdd; 
        
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
        haloMesh.scale.setScalar(this.baseRadius * STELLAR_CONSTANTS.VISUALS.HALO_SCALE_FACTOR);
        
        this.mainSeqGroup.add(this.starMesh);

        // Atmospheric corona glow
        const coronaGeo = new THREE.SphereGeometry(this.baseRadius * 1.15, 32, 32);
        const coronaMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color().setHSL(0.1, 1.0, 0.7) },
                uOpacity: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                void main() {
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);
                    float rim = 1.0 - max(0.0, dot(normalize(vNormal), viewDir));
                    rim = pow(rim, 3.0);
                    gl_FragColor = vec4(uColor, rim * uOpacity * 0.6);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.BackSide
        });
        const corona = new THREE.Mesh(coronaGeo, coronaMat);
        (this as any)._coronaMat = coronaMat;
        (this as any)._coronaMesh = corona;
        this.mainSeqGroup.add(corona);

        this.mainSeqGroup.add(this.coronaMesh);
        this.mainSeqGroup.add(haloMesh);
        this.parent.add(this.mainSeqGroup);

        // Habitable Zone
        const lum = Math.pow(this.mass, STELLAR_CONSTANTS.PHYSICS.MASS_LUMINOSITY_EXPONENT);
        const hzRadius = Math.max(STELLAR_CONSTANTS.VISUALS.HZ_RADIUS_BASE, Math.sqrt(lum) * STELLAR_CONSTANTS.VISUALS.HZ_LUM_FACTOR);
        this.hzMesh = new THREE.Mesh(
            GEOMETRIES.habitableZone,
            new THREE.MeshPhongMaterial({ 
                color: 0x00ff88, 
                transparent: true, 
                opacity: 0.3, 
                shininess: 100,
                emissive: 0x004422,
                side: THREE.DoubleSide
            })
        );
        this.hzMesh.scale.setScalar(hzRadius);
        this.hzMesh.rotation.x = Math.PI / 2;
        this.hzMesh.rotation.y = Math.random() * Math.PI * 0.2;
        this.hzMesh.rotation.z = Math.random() * Math.PI * 0.2;
        this.parent.add(this.hzMesh);

        // Planets
        for(let i=0; i<2; i++) {
            const dist = hzRadius * STELLAR_CONSTANTS.VISUALS.PLANET_HZ_DIST_FACTOR + Math.random() * 8 + (i * 2); 
            const pScale = 0.2 + Math.random() * 0.25;
            const pColor = i === 0 ? 0x8899aa : 0xcc8855;
            const pMesh = new THREE.Mesh(
                GEOMETRIES.planet,
                new THREE.MeshStandardMaterial({color: pColor, roughness: 0.8, metalness: 0.2})
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

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean): void {
        // BOLT: Removed redundant scale assignment
        this.starMat.uniforms.uTime.value = appTime;
        this.starMat.uniforms.uHbar.value = physics.hbar || 1.0;

        if (!lowDetail) {
            this.planetsInfo.forEach(p => {
                // BOLT: Removed redundant visibility and material assignments
                p.pivot.rotation.y += p.speed * delta;
            });
        }

        if (cameraPos) {
            const distToCamera = cameraPos.distanceTo((this as any).parent?.position ?? new THREE.Vector3());
            if (this.hzMesh) this.hzMesh.visible = distToCamera < 35;
        }
    }

    setOpacity(opacity: number): void {
        this.starMat.uniforms.uOpacity.value = opacity;
        (this.coronaMesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.3;
        if ((this as any)._coronaMat) {
            (this as any)._coronaMat.uniforms.uOpacity.value = opacity;
        }
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
        if ((this as any)._coronaMesh) {
            (this as any)._coronaMesh.geometry.dispose();
            (this as any)._coronaMesh.material.dispose();
        }
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
