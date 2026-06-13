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

// BOLT: Static scratchpad to eliminate per-frame allocations
const _scratchPos = new THREE.Vector3();

export class MainSequencePhase implements PhaseComponent {
    public mainSeqGroup!: THREE.Group;
    public starMat!: THREE.ShaderMaterial;
    public starMesh!: THREE.Mesh;
    public coronaMesh!: THREE.Mesh;
    public flareMesh!: THREE.InstancedMesh;
    public flareMat!: THREE.ShaderMaterial;
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
        
        let msColor: number;
        if (this.mass < 0.08)      msColor = 0xcc44bb;  // Brown dwarf — magenta
        else if (this.mass < 0.45) msColor = 0xff3300;  // M class — deep red
        else if (this.mass < 0.75) msColor = 0xff7722;  // K class — orange
        else if (this.mass < 1.5)  msColor = 0xfff5cc;  // F class — yellow-white
        else if (this.mass < 2.1)  msColor = 0xddeeff;  // A class — white-blue
        else if (this.mass < STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) msColor = 0xaabbff; // B class — blue-white
        else                       msColor = 0x8899ff;  // O class — deep blue
        
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
                    vNormal = normalize(mat3(modelMatrix) * normal);
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
        
        // Solar Flares
        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0.8, 0, 0),
            new THREE.Vector3(1.5, 1.5, 0),
            new THREE.Vector3(0, 0, 0.8)
        );
        const flareGeo = new THREE.TubeGeometry(curve, 16, 0.05, 4, false);
        this.flareMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(msColor) },
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
        this.mainSeqGroup.add(this.flareMesh);
        
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

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, _t: number, lowDetail?: boolean): void {
        // BOLT: Removed redundant scale assignment
        this.starMat.uniforms.uTime.value = appTime;
        this.starMat.uniforms.uHbar.value = physics.hbar || 1.0;
        this.flareMat.uniforms.uTime.value = appTime;

        if (!lowDetail) {
            for (let i = 0; i < this.planetsInfo.length; i++) {
                this.planetsInfo[i].pivot.rotation.y += this.planetsInfo[i].speed * delta;
            }
        }

        if (cameraPos) {
            const distSq = cameraPos.distanceToSquared((this as any).parent?.position ?? _scratchPos);
            // BOLT: Use distanceToSquared for performance (35 * 35 = 1225)
            if (this.hzMesh) this.hzMesh.visible = distSq < 1225;
        }
    }

    setOpacity(opacity: number): void {
        this.starMat.uniforms.uOpacity.value = opacity;
        (this.coronaMesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.3;
        this.flareMat.uniforms.uOpacity.value = opacity * 0.8;
        if ((this as any)._coronaMat) {
            (this as any)._coronaMat.uniforms.uOpacity.value = opacity;
        }
    }

    show(): void {
        this.mainSeqGroup.visible = true;
        this.hzMesh.visible = true;
        for (let i = 0; i < this.planetsInfo.length; i++) {
            this.planetsInfo[i].pivot.visible = true;
        }
    }

    hide(): void {
        this.mainSeqGroup.visible = false;
        this.hzMesh.visible = false;
        for (let i = 0; i < this.planetsInfo.length; i++) {
            this.planetsInfo[i].pivot.visible = false;
        }
    }

    dispose(): void {
        // BOLT: Star, corona, and HZ use shared GEOMETRIES, do NOT dispose
        this.starMat.dispose();
        this.flareMat.dispose();
        this.flareMesh.geometry.dispose();
        (this.coronaMesh.material as THREE.Material).dispose();
        if ((this as any)._coronaMesh) {
            (this as any)._coronaMesh.material.dispose();
        }
        (this.hzMesh.material as THREE.Material).dispose();
        for (let i = 0; i < this.planetsInfo.length; i++) {
            const p = this.planetsInfo[i];
            // Planet geometry is also shared GEOMETRIES.planet
            (p.mesh.material as THREE.Material).dispose();
            this.parent.remove(p.pivot);
        }
        this.parent.remove(this.mainSeqGroup);
        this.parent.remove(this.hzMesh);
    }
}
