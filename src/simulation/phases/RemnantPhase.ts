import * as THREE from 'three';
import { PhaseComponent } from './types';
import { PhysicsConstants } from '../../types/physics';
import { GEOMETRIES } from './geometries';
import { STELLAR_CONSTANTS } from '../../core/constants';

// BOLT: Module-level helper to avoid closure overhead
const stepOp = (current: number, target: number, speed: number) => {
    if (current < target) return Math.min(target, current + speed);
    if (current > target) return Math.max(target, current - speed);
    return current;
};

export class RemnantPhase implements PhaseComponent {
    public neutronStarGroup!: THREE.Group;
    public nsMagneticLines!: THREE.Group;
    public pulsarGroup!: THREE.Group;
    public blackHoleGroup!: THREE.Group;
    
    private parent!: THREE.Group;
    private mass: number;
    private _opNs: number = 0;
    private _opNsLines: number = 0;
    private bhRadius = 0.5;
    private bhDiskMaterial?: THREE.ShaderMaterial;
    private bhDiskGeometry?: THREE.RingGeometry;

    private _nsMat!: THREE.MeshBasicMaterial;
    private _tubeMat!: THREE.MeshBasicMaterial;
    private _beamMat!: THREE.MeshBasicMaterial;

    constructor(mass: number) {
        this.mass = mass;
    }

    init(parent: THREE.Group): void {
        this.parent = parent;

        // Neutron Star
        this.neutronStarGroup = new THREE.Group();
        this._nsMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0});
        this.pulsarGroup = new THREE.Group();
        this._beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
        const beam1 = new THREE.Mesh(GEOMETRIES.pulsarBeam1, this._beamMat);
        const beam2 = new THREE.Mesh(GEOMETRIES.pulsarBeam2, this._beamMat);
        this.pulsarGroup.add(beam1);
        this.pulsarGroup.add(beam2);
        this.neutronStarGroup.add(new THREE.Mesh(GEOMETRIES.neutronStar, this._nsMat));
        this.neutronStarGroup.add(this.pulsarGroup);
        
        const nsMagGroup = new THREE.Group();
        this._tubeMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending});
        for(const tubeGeo of GEOMETRIES.magneticTubes) {
            nsMagGroup.add(new THREE.Mesh(tubeGeo, this._tubeMat));
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
        
        // Accretion disk with custom shader material for high-quality gradient and animation
        this.bhDiskGeometry = new THREE.RingGeometry(8, 12, 64);
        this.bhDiskGeometry.rotateX(Math.PI / 2);
        this.bhDiskMaterial = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform float uTime;
                void main() {
                    float dist = vUv.y; // Radial distance: 0 (inner) to 1 (outer)
                    vec3 innerColor = vec3(1.0, 1.0, 0.9); // White-ish hot
                    vec3 outerColor = vec3(1.0, 0.4, 0.0); // Orange cool
                    vec3 color = mix(innerColor, outerColor, pow(dist, 1.5));
                    float alpha = (0.7 + 0.3 * sin(uTime * 4.0)) * (1.0 - dist);
                    gl_FragColor = vec4(color, alpha * 0.85);
                }
            `
        });
        const diskMesh = new THREE.Mesh(this.bhDiskGeometry, this.bhDiskMaterial);
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);

        // Gravitational lensing sphere
        const lensGeo = new THREE.SphereGeometry(this.bhRadius * 3.5, 64, 64);
        const lensMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uStrength: { value: 0.0 },
                tBackground: { value: null }
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
                uniform float uTime;
                uniform float uStrength;
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                void main() {
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);
                    float rim = 1.0 - max(0.0, dot(normalize(vNormal), viewDir));
                    float photonRing = pow(rim, 8.0) * uStrength;
                    float innerRing = pow(max(0.0, rim - 0.85), 3.0) * uStrength * 2.0;
                    // Photon ring color — hot plasma orange-white
                    vec3 ringColor = mix(
                        vec3(1.0, 0.5, 0.1),
                        vec3(1.0, 0.95, 0.8),
                        innerRing
                    );
                    // Shadow region — pure black event horizon
                    float shadow = 1.0 - smoothstep(0.0, 0.3, rim);
                    float alpha = (photonRing + innerRing) * (1.0 - shadow * 0.95);
                    gl_FragColor = vec4(ringColor, clamp(alpha, 0.0, 1.0));
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const lensSphere = new THREE.Mesh(lensGeo, lensMat);
        (this as any)._lensMat = lensMat;
        (this as any)._lensMesh = lensSphere;
        this.blackHoleGroup.add(lensSphere);

        this.parent.add(this.blackHoleGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean): void {
        if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE) {
            this.blackHoleGroup.visible = true;
            if (!lowDetail) this.blackHoleGroup.rotation.y += delta;
            this.blackHoleGroup.rotation.z = Math.PI / 8;

            if (this.bhDiskMaterial) {
                this.bhDiskMaterial.uniforms.uTime.value = appTime;
            }

            if ((this as any)._lensMat) {
                (this as any)._lensMat.uniforms.uTime.value = appTime;
                (this as any)._lensMat.uniforms.uStrength.value = THREE.MathUtils.lerp(
                    (this as any)._lensMat.uniforms.uStrength.value,
                    1.0,
                    delta * 2.0
                );
            }
        } else if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
            if (!lowDetail) {
                this.pulsarGroup.rotation.y += delta * 5.0 * (physics.weakForce || 1.0);
                this.nsMagneticLines.rotation.y += delta * 2.0 * (physics.weakForce || 1.0);
            }
        } else {
            this.pulsarGroup.visible = false;
            this.nsMagneticLines.visible = false;
        }
    }

    updateRemnantOpacity(delta: number, targetNs: number): void {
        const speed = delta * STELLAR_CONSTANTS.TRANSITIONS.DEFAULT_SPEED;

        const nextOpNs = stepOp(this._opNs, targetNs, speed);
        if (this._opNs !== nextOpNs) {
            this._opNs = nextOpNs;
            this._nsMat.opacity = this._opNs;
        }

        const targetLines = targetNs ? 0.3 : 0;
        const nextOpLines = stepOp(this._opNsLines, targetLines, speed);
        if (this._opNsLines !== nextOpLines) {
            this._opNsLines = nextOpLines;
            this._tubeMat.opacity = this._opNsLines;
        }

        // Pulsar beams are either on or off for simplicity in opacity guarding
        const targetBeam = targetNs ? 0.6 : 0;
        if (this._beamMat.opacity !== targetBeam) {
            this._beamMat.opacity = targetBeam;
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
        // BOLT: Stop disposing shared global geometries. Only dispose local materials if unique.
        const nsChildren = this.neutronStarGroup.children;
        for (let i = 0; i < nsChildren.length; i++) {
            const c = nsChildren[i] as THREE.Mesh;
            if (c.material) (c.material as THREE.Material).dispose();
        }

        const nsLinesChildren = this.nsMagneticLines.children;
        for (let i = 0; i < nsLinesChildren.length; i++) {
            const c = nsLinesChildren[i] as THREE.Mesh;
            if (c.material) (c.material as THREE.Material).dispose();
        }

        if ((this as any)._lensMesh) {
            (this as any)._lensMesh.geometry.dispose();
        }

        const bhChildren = this.blackHoleGroup.children;
        for (let i = 0; i < bhChildren.length; i++) {
            const c = bhChildren[i] as THREE.Mesh;
            const mat = c.material;
            if (mat instanceof THREE.Material && mat !== this.bhDiskMaterial) mat.dispose();
        }
        if (this.bhDiskGeometry) this.bhDiskGeometry.dispose();
        if (this.bhDiskMaterial) this.bhDiskMaterial.dispose();
        this.parent.remove(this.neutronStarGroup);
        this.parent.remove(this.blackHoleGroup);
    }
}
