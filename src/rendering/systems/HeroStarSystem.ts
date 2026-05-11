import * as THREE from 'three';
import { PHASES } from '../../core/constants';
import { 
    basicVS, nebulaFS, displacementVS, starSurfaceFS, subtleDisplacementVS 
} from '../shaders/stellar';
import { PhysicalBody } from '../../physics/types';

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

// BOLT OPTIMIZATION: Reuse geometries across all HeroStarSystem instances.
const GEOMETRIES = {
    nebula: new THREE.SphereGeometry(15, 32, 32),
    protostar: new THREE.SphereGeometry(1, 64, 64),
    protostarDisk: new THREE.TorusGeometry(2, 0.4, 8, 32),
    mainSeq: new THREE.SphereGeometry(1, 64, 64),
    corona: new THREE.SphereGeometry(1.15, 32, 32),
    redGiant: new THREE.SphereGeometry(1, 64, 64),
    supernovaCore: new THREE.SphereGeometry(1, 48, 48),
    habitableZone: new THREE.TorusGeometry(1, 0.05, 8, 64),
    planet: new THREE.SphereGeometry(1, 16, 16),
    supernovaRing: new THREE.TorusGeometry(1, 0.1, 16, 64),
    neutronStar: new THREE.SphereGeometry(0.1, 32, 32),
    pulsarBeam: (() => {
        const geo = new THREE.ConeGeometry(0.2, 20, 16);
        geo.translate(0, 10, 0);
        return geo;
    })(),
    blackHoleCore: new THREE.SphereGeometry(0.5, 32, 32),
    blackHoleDisk: (() => {
        const geo = new THREE.TorusGeometry(1.5, 0.4, 16, 64);
        geo.rotateX(Math.PI / 2);
        return geo;
    })(),
    hit: new THREE.SphereGeometry(8, 16, 16),
    magneticTubes: (() => {
        const tubes: THREE.TubeGeometry[] = [];
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            const curve = new MagneticCurve(a);
            tubes.push(new THREE.TubeGeometry(curve, 20, 0.01, 8, false));
        }
        return tubes;
    })()
};

export class HeroStarSystem extends THREE.Group implements PhysicalBody {
    physicsId: string;
    velocity: THREE.Vector3 = new THREE.Vector3();
    acceleration: THREE.Vector3 = new THREE.Vector3();
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

    constructor() {
        super();
        this.physicsId = THREE.MathUtils.generateUUID();
        this.mass = Math.random() > 0.8 ? 8 + Math.random() * 12 : 0.5 + Math.random() * 3;
        this.lifespanReal = 10000 * Math.pow(this.mass, -2.5);
        this.loopDuration = 40 + Math.random() * 20; 
        this.t = Math.random();

        this.tHeat = 5778 * Math.pow(this.mass, 0.5);
        this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;

        // 1. Nebula
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
        this.nebulaMesh = new THREE.Mesh(GEOMETRIES.nebula, this.nebulaMat);
        this.add(this.nebulaMesh);

        // 1b. Dust Cloud
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

        // 2. PROTOSTAR
        this.protostarGroup = new THREE.Group();
        this.protostarMat = new THREE.ShaderMaterial({
            vertexShader: displacementVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff3300) },
                uTurbulence: { value: 2.0 },
                uOpacity: { value: 0.0 }
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
        this.protostarGroup.visible = false;
        this.add(this.protostarGroup);

        // 3. MAIN SEQUENCE
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
                uOpacity: { value: 0.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.starMesh = new THREE.Mesh(GEOMETRIES.mainSeq, this.starMat);
        this.coronaMesh = new THREE.Mesh(
            GEOMETRIES.corona,
            new THREE.MeshBasicMaterial({ color: msColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
        );
        this.mainSeqGroup.add(this.starMesh);
        this.mainSeqGroup.add(this.coronaMesh);
        this.mainSeqGroup.visible = false;
        this.add(this.mainSeqGroup);

        // 4. RED GIANT
        this.redGiantGroup = new THREE.Group();
        this.redGiantMat = new THREE.ShaderMaterial({
            vertexShader: basicVS,
            fragmentShader: starSurfaceFS,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xff4400) },
                uTurbulence: { value: 0.5 },
                uOpacity: { value: 0.0 }
            },
            transparent: true, blending: THREE.AdditiveBlending
        });
        this.redGiantMesh = new THREE.Mesh(GEOMETRIES.redGiant, this.redGiantMat);
        this.redGiantGroup.add(this.redGiantMesh);
        this.redGiantGroup.visible = false;
        this.add(this.redGiantGroup);

        // 4b. SUPERNOVA CORE
        this.supernovaGroup = new THREE.Group();
        this.coreFlashMesh = new THREE.Mesh(
            GEOMETRIES.supernovaCore,
            new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending})
        );
        this.supernovaGroup.add(this.coreFlashMesh);
        this.supernovaGroup.visible = false;
        this.add(this.supernovaGroup);

        // 4. Planets & Habitable Zone
        const lum = Math.pow(this.mass, 3.5);
        const hzRadius = Math.max(4, Math.sqrt(lum) * 2.5);
        
        this.hzMesh = new THREE.Mesh(
            GEOMETRIES.habitableZone,
            new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending })
        );
        this.hzMesh.scale.setScalar(hzRadius);
        this.hzMesh.rotation.x = Math.PI / 2;
        this.add(this.hzMesh);

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
            this.add(pivot);
            this.planetsInfo.push({ pivot, mesh: pMesh, dist, speed });
        }

        // 5. Supernova Ring & Ejecta
        this.snRing = new THREE.Mesh(
            GEOMETRIES.supernovaRing,
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


        // 6. Remnants (Pulsar & Black Hole)
        this.neutronStarGroup = new THREE.Group();
        const nsMat = new THREE.MeshBasicMaterial({color: 0xaaccff});
        this.pulsarGroup = new THREE.Group();
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
        const beam1 = new THREE.Mesh(GEOMETRIES.pulsarBeam, beamMat);
        const beam2 = new THREE.Mesh(GEOMETRIES.pulsarBeam, beamMat);
        beam2.rotation.x = Math.PI;
        this.pulsarGroup.add(beam1);
        this.pulsarGroup.add(beam2);
        this.neutronStarGroup.add(new THREE.Mesh(GEOMETRIES.neutronStar, nsMat));
        this.neutronStarGroup.add(this.pulsarGroup);
        
        const nsMagGroup = new THREE.Group();
        const tubeMat = new THREE.MeshBasicMaterial({color: 0xaaccff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending});
        for(const tubeGeo of GEOMETRIES.magneticTubes) {
            nsMagGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
        }
        
        this.nsMagneticLines = nsMagGroup as any;
        this.neutronStarGroup.add(this.nsMagneticLines);
        this.neutronStarGroup.visible = false;
        this.add(this.neutronStarGroup);

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
        this.add(this.blackHoleGroup);

        // 7. Hit mesh for raycaster
        this.hitMesh = new THREE.Mesh(
            GEOMETRIES.hit,
            new THREE.MeshBasicMaterial({visible: false})
        );
        this.add(this.hitMesh);
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3) {
        this.t += delta / this.loopDuration;
        if (this.t > 1.0) {
            this.t = 0;
            this.isSupernovaFlashing = false;
        }

        this.currentRealAge = this.t * this.lifespanReal;
        
        this.nebulaMesh.visible = false;
        this.hzMesh.visible = false;
        this.snRing.visible = false;
        this.ejectaMesh.visible = false;
        this.blackHoleGroup.visible = false;
        this.dustCloud.visible = false;
        this.planetsInfo.forEach(p => p.pivot.visible = false);

        let targetProto = 0, targetMain = 0, targetRed = 0, targetSuper = 0, targetNs = 0;

        if (this.t < 0.05) {
            this.phase = PHASES.NEBULA;
            this.nebulaMesh.visible = true;
            this.dustCloud.visible = true;
            const normT = this.t / 0.05;
            
            this.nebulaMat.uniforms.uTime.value = appTime;
            this.nebulaMat.uniforms.uCollapse.value = normT;
            this.nebulaMat.uniforms.uCameraPos.value.copy(cameraPos);
            this.nebulaMat.uniforms.uInverseModelMatrix.value.copy(this.nebulaMesh.matrixWorld).invert();
            
            this.dustCloud.rotation.y += delta * 0.2;
            (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 1.0;
            this.dustCloud.scale.setScalar(1.0 - normT * 0.5);

            this.currentTemp = 50 + normT * 1000;
            this.currentLum = normT * 0.1;

        } else if (this.t < 0.15) {
            this.phase = PHASES.PROTOSTAR;
            targetProto = 1;
            const normT = (this.t - 0.05) / 0.10;
            
            if (normT < 0.8) {
                this.nebulaMesh.visible = true;
                this.nebulaMat.uniforms.uCollapse.value = 1.0;
                this.dustCloud.visible = true;
                this.dustCloud.rotation.y += delta * 0.5;
                (this.dustCloud.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 1.0 - normT * 1.25;
                this.dustCloud.scale.setScalar(0.5 - normT * 0.2);
            }

            const introScale = this.baseRadius * (0.5 + normT * 0.5);
            this.protostarMesh.scale.setScalar(introScale);
            this.currentTemp = 1000 + normT * (this.tHeat - 1000);
            this.currentLum = normT * Math.pow(this.mass, 3.5);
            
            this.protostarMat.uniforms.uTime.value = appTime;
            this.protostarDisk.rotation.z += delta;

        } else if (this.t < 0.70) {
            this.phase = PHASES.MAIN_SEQUENCE;
            targetMain = 1;
            this.hzMesh.visible = true;
            
            this.starMesh.scale.setScalar(this.baseRadius);
            this.currentTemp = this.tHeat;
            this.currentLum = Math.pow(this.mass, 3.5);
            
            this.starMat.uniforms.uTime.value = appTime;

            this.planetsInfo.forEach(p => {
                p.pivot.visible = true;
                p.pivot.rotation.y += p.speed * delta;
                (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xaaaaaa);
                (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            });

        } else if (this.t < 0.85) {
            this.phase = PHASES.RED_GIANT;
            targetRed = 1;
            const normT = (this.t - 0.70) / 0.15;
            
            const giantScale = this.baseRadius * (1.0 + normT * 6.0) + Math.sin(appTime * 2.0) * 0.1;
            this.redGiantMesh.scale.setScalar(giantScale);
            
            this.currentTemp = this.tHeat - normT * (this.tHeat - 3000);
            this.currentLum = Math.pow(this.mass, 3.5) * (1.0 + normT * 5.0);
            
            this.redGiantMat.uniforms.uTime.value = appTime;

            this.planetsInfo.forEach(p => {
                p.pivot.visible = true;
                p.pivot.rotation.y += p.speed * delta;
                if (p.dist < giantScale * 1.2) {
                    const dmg = Math.max(0, 1.0 - (p.dist - giantScale) / (giantScale * 0.2));
                    (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x222222);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xffaa00);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = dmg;
                    p.mesh.scale.setScalar(Math.max(0.01, 1.0 - dmg));
                } else {
                    p.mesh.scale.setScalar(1.0);
                    (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
                }
            });

        } else if (this.t < 0.90) {
            this.phase = PHASES.SUPERNOVA;
            targetSuper = 1;
            const normT = (this.t - 0.85) / 0.05;
            
            if (this.mass > 8) {
                if (normT < 0.1) this.isSupernovaFlashing = true;

                this.snRing.visible = true;
                this.snRing.scale.setScalar(1.0 + normT * 60.0);
                (this.snRing.material as THREE.MeshBasicMaterial).opacity = 1.0 - Math.pow(normT, 2);
                
                this.ejectaMesh.visible = true;
                this.ejectaMat.uniforms.uExp.value = normT;
                this.ejectaMat.uniforms.uColor.value.setHex(normT < 0.2 ? 0xffffff : 0xff4411);

                this.coreFlashMesh.scale.setScalar(this.baseRadius * 7.0 * (1.0 - normT));
                this.currentTemp = 100000;
                this.currentLum = 100000;
            } else {
                this.snRing.visible = true;
                this.snRing.scale.setScalar(1.0 + normT * 20.0);
                (this.snRing.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1.0 - normT);
                (this.snRing.material as THREE.MeshBasicMaterial).color.setHex(0x00ffaa);
                
                this.ejectaMesh.visible = true;
                this.ejectaMat.uniforms.uExp.value = normT * 0.5;
                this.ejectaMat.uniforms.uColor.value.setHex(0x00ffaa);

                this.coreFlashMesh.scale.setScalar(this.baseRadius * (1.0 - normT * 0.8));
                this.currentTemp = 20000;
            }

        } else {
            this.phase = PHASES.REMNANT;
            this.isSupernovaFlashing = false;
            
            if (this.mass > 15) {
                this.blackHoleGroup.visible = true;
                this.blackHoleGroup.rotation.y += delta;
                this.blackHoleGroup.rotation.z = Math.PI / 8;
                this.currentTemp = 0;
                this.currentLum = 0;
            } else if (this.mass > 8) {
                targetNs = 1;
                this.pulsarGroup.rotation.y += delta * 5.0;
                this.nsMagneticLines.rotation.y += delta * 2.0;
                this.currentTemp = 500000;
                this.currentLum = 0.5;
            } else {
                targetNs = 1;
                this.pulsarGroup.visible = false;
                this.nsMagneticLines.visible = false;
                this.currentTemp = 100000;
                this.currentLum = 0.1;
            }
        }
        
        const speed = delta * 4.0;
        const stepOp = (current: number, target: number) => {
            if (current < target) return Math.min(target, current + speed);
            if (current > target) return Math.max(target, current - speed);
            return current;
        };

        const opP = stepOp(this.protostarMat.uniforms.uOpacity.value, targetProto);
        this.protostarMat.uniforms.uOpacity.value = targetProto > 0 ? opP * (0.8 + 0.2 * Math.sin(appTime * 20.0)) : opP;
        (this.protostarDisk.material as THREE.MeshBasicMaterial).opacity = opP * 0.8;
        this.protostarGroup.visible = opP > 0.01;

        const opM = stepOp(this.starMat.uniforms.uOpacity.value, targetMain);
        this.starMat.uniforms.uOpacity.value = opM;
        (this.coronaMesh.material as THREE.MeshBasicMaterial).opacity = opM * 0.3;
        this.mainSeqGroup.visible = opM > 0.01;

        const opR = stepOp(this.redGiantMat.uniforms.uOpacity.value, targetRed);
        this.redGiantMat.uniforms.uOpacity.value = opR;
        this.redGiantGroup.visible = opR > 0.01;

        const opS = stepOp((this.coreFlashMesh.material as THREE.MeshBasicMaterial).opacity, targetSuper);
        (this.coreFlashMesh.material as THREE.MeshBasicMaterial).opacity = opS;
        this.supernovaGroup.visible = opS > 0.01;

        const opNsLines = stepOp(((this.nsMagneticLines.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity, targetNs ? 0.3 : 0);
        this.nsMagneticLines.children.forEach(c => {
            ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = opNsLines;
        });
        this.pulsarGroup.children.forEach(c => {
            ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = targetNs ? 0.6 : 0;
        });
        const nsMeshMat = (this.neutronStarGroup.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        nsMeshMat.opacity = stepOp(nsMeshMat.opacity, targetNs);
        nsMeshMat.transparent = true;
        this.neutronStarGroup.visible = targetNs > 0.01 || opNsLines > 0.01;
    }
}
