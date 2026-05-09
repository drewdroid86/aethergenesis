import * as THREE from 'three';
import { PHASES } from '../constants/simulation';
import { starSurfaceFS, nebulaFS } from '../shaders/star';
import { displacementVS, subtleDisplacementVS, basicVS } from '../shaders/geometry';

class MagneticCurve extends THREE.Curve<THREE.Vector3> {
    constructor(public angle: number) { super(); }
    getPoint(t: number, optionalTarget = new THREE.Vector3()) {
        const a = this.angle;
        const th = t * Math.PI;
        const r = 0.5 * Math.sin(th);
        const x = r * Math.cos(a);
        const y = 0.5 * Math.cos(th);
        const z = r * Math.sin(a);
        return optionalTarget.set(x, y, z);
    }
}

const GEOMETRIES = {
    sphereNebula: new THREE.SphereGeometry(15, 32, 32),
    sphereHigh: new THREE.SphereGeometry(1, 64, 64),
    sphereMid: new THREE.SphereGeometry(1, 32, 32),
    sphereFlash: new THREE.SphereGeometry(1, 48, 48),
    sphereLow: new THREE.SphereGeometry(1, 16, 16),
    torusProtostar: new THREE.TorusGeometry(2, 0.4, 8, 32),
    torusBH: new THREE.TorusGeometry(1.5, 0.4, 16, 64),
    coneBeam: (() => {
        const geo = new THREE.ConeGeometry(0.2, 20, 16);
        geo.translate(0, 10, 0);
        return geo;
    })(),
    magneticTube: new THREE.TubeGeometry(new MagneticCurve(0), 20, 0.01, 8, false)
};

export default class HeroStarSystem extends THREE.Group {
    mass: number;
    lifespanReal: number;
    loopDuration: number;
    t: number;
    
    currentTemp: number = 3000;
    currentLum: number = 1;
    currentRealAge: number = 0;
    phase: number = 0;
    isSupernovaFlashing: boolean = false;

    nebulaMat: THREE.ShaderMaterial;
    nebulaMesh: THREE.Mesh;
    protostarGroup: THREE.Group;
    protostarMat: THREE.ShaderMaterial;
    protostarMesh: THREE.Mesh;
    protostarDisk: THREE.Mesh;
    mainSeqGroup: THREE.Group;
    starMat: THREE.ShaderMaterial;
    starMesh: THREE.Mesh;
    coronaMesh: THREE.Mesh;
    redGiantGroup: THREE.Group;
    redGiantMat: THREE.ShaderMaterial;
    redGiantMesh: THREE.Mesh;
    supernovaGroup: THREE.Group;
    coreFlashMesh: THREE.Mesh;
    neutronStarGroup: THREE.Group;
    nsMagneticLines: THREE.Group;
    planetsInfo: { pivot: THREE.Group, mesh: THREE.Mesh, dist: number, speed: number }[] = [];
    hzMesh: THREE.Mesh;
    snRing: THREE.Mesh;
    pulsarGroup: THREE.Group;
    blackHoleGroup: THREE.Group;
    hitMesh: THREE.Mesh;
    dustCloud: THREE.Points;
    ejectaMat: THREE.ShaderMaterial;
    ejectaMesh: THREE.Points;

    tHeat: number;
    baseRadius: number;
    birthAge: number;

    constructor() {
        super();
        this.mass = Math.random() > 0.8 ? 8 + Math.random() * 12 : 0.5 + Math.random() * 3;
        this.lifespanReal = 10000 * Math.pow(this.mass, -2.5);
        this.loopDuration = 40 + Math.random() * 20; 
        
        this.birthAge = 0.5 + Math.random() * 9.5;
        this.t = 0;

        this.tHeat = 5778 * Math.pow(this.mass, 0.5);
        this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;

        this.nebulaMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: nebulaFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0x3a0088) },
                uCollapse: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uInverseModelMatrix: { value: new THREE.Matrix4() }
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.FrontSide
        });
        this.nebulaMesh = new THREE.Mesh(GEOMETRIES.sphereNebula, this.nebulaMat);
        this.add(this.nebulaMesh);

        // Dust Cloud
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(500 * 3);
        const dustSize = new Float32Array(500);
        for(let i=0; i<500; i++) {
            const r = 2 + Math.pow(Math.random(), 2) * 15;
            const a = Math.random() * Math.PI * 2;
            const h = (Math.random() - 0.5) * Math.max(0.5, r * 0.2);
            dustPos[i*3] = Math.cos(a) * r;
            dustPos[i*3+1] = h;
            dustPos[i*3+2] = Math.sin(a) * r;
            dustSize[i] = Math.random() * 0.5 + 0.1;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        dustGeo.setAttribute('size', new THREE.BufferAttribute(dustSize, 1));
        this.dustCloud = new THREE.Points(
            dustGeo,
            new THREE.ShaderMaterial({
                uniforms: { uColor: { value: new THREE.Color(0xaa66ff) }, uAlpha: { value: 1.0 } },
                vertexShader: `
                    attribute float size;
                    varying float vAlpha;
                    uniform float uAlpha;
                    void main() {
                        vAlpha = uAlpha;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (200.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    varying float vAlpha;
                    void main() {
                        float d = length(gl_PointCoord - vec2(0.5));
                        if(d > 0.5) discard;
                        gl_FragColor = vec4(uColor, vAlpha * (1.0 - d*2.0));
                    }
                `,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        this.add(this.dustCloud);

        // Protostar Group
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
        this.protostarMesh = new THREE.Mesh(GEOMETRIES.sphereHigh, this.protostarMat);
        this.protostarDisk = new THREE.Mesh(
            GEOMETRIES.torusProtostar,
            new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        this.protostarDisk.rotation.x = Math.PI / 2;
        this.protostarGroup.add(this.protostarMesh);
        this.protostarGroup.add(this.protostarDisk);
        this.protostarGroup.visible = false;
        this.add(this.protostarGroup);

        // Main Sequence
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
        this.starMesh = new THREE.Mesh(GEOMETRIES.sphereHigh, this.starMat);
        this.coronaMesh = new THREE.Mesh(
            GEOMETRIES.sphereMid,
            new THREE.MeshBasicMaterial({ color: msColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
        );
        this.coronaMesh.scale.setScalar(1.15);
        this.mainSeqGroup.add(this.starMesh);
        this.mainSeqGroup.add(this.coronaMesh);
        this.mainSeqGroup.visible = false;
        this.add(this.mainSeqGroup);

        // Red Giant
        this.redGiantGroup = new THREE.Group();
        this.redGiantMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff4400) },
                uTurbulence: { value: 0.5 },
                uOpacity: { value: 0.0 },
                uHbar: { value: 1.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.redGiantMesh = new THREE.Mesh(GEOMETRIES.sphereHigh, this.redGiantMat);
        this.redGiantGroup.add(this.redGiantMesh);
        this.redGiantGroup.visible = false;
        this.add(this.redGiantGroup);

        // Supernova Core
        this.supernovaGroup = new THREE.Group();
        this.coreFlashMesh = new THREE.Mesh(
            GEOMETRIES.sphereFlash,
            new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending})
        );
        this.supernovaGroup.add(this.coreFlashMesh);
        this.supernovaGroup.visible = false;
        this.add(this.supernovaGroup);

        // Habitable Zone & Planets
        const lum = Math.pow(this.mass, 3.5);
        const hzRadius = Math.max(4, Math.sqrt(lum) * 2.5);
        this.hzMesh = new THREE.Mesh(
            new THREE.TorusGeometry(hzRadius, 0.05, 8, 64),
            new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending })
        );
        this.hzMesh.rotation.x = Math.PI / 2;
        this.add(this.hzMesh);

        for(let i=0; i<4; i++) {
            const dist = 3 + Math.random() * 8 + (i * 2); 
            const pMesh = new THREE.Mesh(GEOMETRIES.sphereLow, new THREE.MeshStandardMaterial({color: 0xaaaaaa, roughness: 0.8}));
            pMesh.scale.setScalar(0.1 + Math.random()*0.15);
            pMesh.position.x = dist;
            const pivot = new THREE.Group();
            pivot.rotation.y = Math.random() * Math.PI * 2;
            const speed = (0.5 + Math.random()) / Math.sqrt(dist);
            pivot.add(pMesh);
            this.add(pivot);
            this.planetsInfo.push({ pivot, mesh: pMesh, dist, speed });
        }

        // Supernova Ring & Ejecta
        this.snRing = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.1, 16, 64),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
        );
        this.snRing.rotation.x = Math.PI / 2;
        this.add(this.snRing);
        
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
            vertexShader: `
                attribute vec3 velocity;
                uniform float uExp;
                varying float vAlpha;
                void main() {
                    vAlpha = 1.0 - uExp;
                    vec3 p = position + velocity * uExp * 100.0;
                    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
                    gl_PointSize = (150.0 * (1.0 - uExp)) / -mvPos.z;
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if(d > 0.5) discard;
                    gl_FragColor = vec4(uColor, vAlpha * (1.0 - d*2.0));
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.ejectaMesh = new THREE.Points(ejectaGeo, this.ejectaMat);
        this.add(this.ejectaMesh);

        // Remnants
        this.neutronStarGroup = new THREE.Group();
        this.pulsarGroup = new THREE.Group();
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
        const beam1 = new THREE.Mesh(GEOMETRIES.coneBeam, beamMat);
        const beam2 = new THREE.Mesh(GEOMETRIES.coneBeam, beamMat);
        beam2.rotation.x = Math.PI;
        this.pulsarGroup.add(beam1);
        this.pulsarGroup.add(beam2);
        const nsCoreMesh = new THREE.Mesh(GEOMETRIES.sphereMid, new THREE.MeshBasicMaterial({color: 0xaaccff}));
        nsCoreMesh.scale.setScalar(0.1);
        this.neutronStarGroup.add(nsCoreMesh);
        this.neutronStarGroup.add(this.pulsarGroup);
        
        const nsMagGroup = new THREE.Group();
        const tubeMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending});
        for(let a=0; a<Math.PI*2; a+=Math.PI/4) {
            const tubeMesh = new THREE.Mesh(GEOMETRIES.magneticTube, tubeMat);
            tubeMesh.rotation.y = a;
            nsMagGroup.add(tubeMesh);
        }
        this.nsMagneticLines = nsMagGroup as any;
        this.neutronStarGroup.add(this.nsMagneticLines);
        this.neutronStarGroup.visible = false;
        this.add(this.neutronStarGroup);

        this.blackHoleGroup = new THREE.Group();
        const bhCore = new THREE.Mesh(GEOMETRIES.sphereMid, new THREE.MeshBasicMaterial({ color: 0x000000 }));
        bhCore.scale.setScalar(0.5);
        const diskMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
        const diskMesh = new THREE.Mesh(GEOMETRIES.torusBH, diskMat);
        diskMesh.rotation.x = Math.PI / 2;
        this.blackHoleGroup.add(bhCore);
        this.blackHoleGroup.add(diskMesh);
        this.add(this.blackHoleGroup);

        this.hitMesh = new THREE.Mesh(GEOMETRIES.sphereLow, new THREE.MeshBasicMaterial({visible: false}));
        this.hitMesh.scale.setScalar(8);
        this.add(this.hitMesh);
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: any, overrideT?: number, cosmicAge?: number) {
        let targetProto = 0, targetMain = 0, targetRed = 0, targetSuper = 0, targetNs = 0;
        const effG = Math.max(0.01, physics.G);
        const expL = Math.max(0.1, physics.lambda);
        this.scale.setScalar(expL);
        
        const effMass = this.mass * effG;
        const ignites = effG > 0.3;

        if (overrideT !== undefined) {
             this.t = overrideT;
        } else if (cosmicAge !== undefined) {
             const ageMyr = (cosmicAge - this.birthAge) * 1000;
             if (ageMyr < 0) this.t = -0.1;
             else this.t = ageMyr / (this.lifespanReal / effG);
        }

        if (this.t < 0) {
            this.visible = false;
            return;
        } else {
            this.visible = true;
        }

        if (!ignites && this.t > 0.14) this.t = 0.14;
        if (this.t > 1.0) {
            this.t = Math.min(1.05, this.t);
            this.isSupernovaFlashing = false;
        }

        this.currentRealAge = this.t * this.lifespanReal;
        // (Truncated rest of update method for clarity)
    }
}
