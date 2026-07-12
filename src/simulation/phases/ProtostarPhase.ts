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

    private _jetMat1?: THREE.ShaderMaterial;
    private _jetMat2?: THREE.ShaderMaterial;
    private _jetGeo?: THREE.CylinderGeometry;

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
                uHbar: { value: 1.0 },
                uLowDetail: { value: 0.0 }
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

        // Herbig-Haro bipolar jets
        const jetMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uOpacity;
                varying vec2 vUv;
                void main() {
                    float dist = abs(vUv.x - 0.5) * 2.0;
                    float taper = 1.0 - vUv.y;
                    float flow = fract(vUv.y * 4.0 - uTime * 1.5);
                    float knots = sin(vUv.y * 12.0 - uTime * 3.0) * 0.5 + 0.5;
                    float alpha = (1.0 - dist * dist) * taper * (0.6 + knots * 0.4) * uOpacity;
                    vec3 color = mix(vec3(0.2, 0.8, 1.0), vec3(0.8, 0.95, 1.0), 1.0 - vUv.y);
                    gl_FragColor = vec4(color, alpha * 0.85);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const jetGeo = GEOMETRIES.protostarJet;
        const jet1 = new THREE.Mesh(jetGeo, jetMat);
        jet1.position.y = 4.5;
        const jetMat2 = jetMat.clone();
        const jet2 = new THREE.Mesh(jetGeo, jetMat2);
        jet2.position.y = -4.5;
        jet2.rotation.z = Math.PI;
        this.protostarGroup.add(jet1);
        this.protostarGroup.add(jet2);
        
        this._jetMat1 = jetMat;
        this._jetMat2 = jetMat2;
        this._jetGeo = jetGeo;

        this.parent.add(this.protostarGroup);
        
        this.hide();
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, t: number, lowDetail?: boolean): void {
        const normT = (t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.PROTOSTAR_START) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.PROTOSTAR_DURATION;
        const introScale = this.baseRadius * (STELLAR_CONSTANTS.VISUALS.PROTOSTAR_INTRO_SCALE_MIN + normT * (1.0 - STELLAR_CONSTANTS.VISUALS.PROTOSTAR_INTRO_SCALE_MIN));
        this.protostarMesh.scale.setScalar(introScale);
        
        this.protostarMat.uniforms.uTime.value = appTime;
        this.protostarMat.uniforms.uHbar.value = physics.hbar || 1.0;
        this.protostarMat.uniforms.uLowDetail.value = (lowDetail || false) ? 1.0 : 0.0;
        this.protostarDisk.rotation.z += delta;

        const jetOpacity = this.protostarMat.uniforms.uOpacity?.value ?? 0;
        if (this._jetMat1 && this._jetMat2) {
            this._jetMat1.uniforms.uTime.value = appTime;
            this._jetMat1.uniforms.uOpacity.value = jetOpacity;
            this._jetMat2.uniforms.uTime.value = appTime;
            this._jetMat2.uniforms.uOpacity.value = jetOpacity;
        }
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
        // BOLT: protostarMesh, disk, and jets use shared GEOMETRIES, do NOT dispose
        this.protostarMat.dispose();
        (this.protostarDisk.material as THREE.Material).dispose();
        if (this._jetGeo) {
            this._jetGeo.dispose();
        }
        if (this._jetMat1) {
            this._jetMat1.dispose();
        }
        if (this._jetMat2) {
            this._jetMat2.dispose();
        }
        this.parent.remove(this.protostarGroup);
    }
}
