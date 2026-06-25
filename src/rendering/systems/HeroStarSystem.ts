import * as THREE from 'three';
import { PHASES, STELLAR_CONSTANTS } from '../../core/constants';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../../types/physics';
import { NebulaPhase } from '../../simulation/phases/NebulaPhase';
import { ProtostarPhase } from '../../simulation/phases/ProtostarPhase';
import { MainSequencePhase } from '../../simulation/phases/MainSequencePhase';
import { RedGiantPhase } from '../../simulation/phases/RedGiantPhase';
import { SupernovaPhase } from '../../simulation/phases/SupernovaPhase';
import { RemnantPhase } from '../../simulation/phases/RemnantPhase';
import { GEOMETRIES } from '../../simulation/phases/geometries';
import { PlanetarySystem } from './PlanetarySystem';
// BOLT: Module-level helper to avoid closure overhead
const stepOp = (current: number, target: number, speed: number) => {
    if (current < target) return Math.min(target, current + speed);
    if (current > target) return Math.max(target, current - speed);
    return current;
};

const getPhaseForT = (t: number): number => {
    if (t < 0.05) return PHASES.NEBULA;
    if (t < 0.15) return PHASES.PROTOSTAR;
    if (t < 0.70) return PHASES.MAIN_SEQUENCE;
    if (t < 0.85) return PHASES.RED_GIANT;
    if (t < 0.90) return PHASES.SUPERNOVA;
    return PHASES.REMNANT;
};

export class HeroStarSystem extends THREE.Group {
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

    private _activePhase: number = -1;
    private _lastL: number = -1;
    private _msLuminosity: number;

    // BOLT: State guards to prevent redundant Three.js updates
    private _lastOpP: number = -1;
    private _lastVisP: boolean = false;
    private _lastOpM: number = -1;
    private _lastVisM: boolean = false;
    private _lastOpR: number = -1;
    private _lastVisR: boolean = false;
    private _lastOpS: number = -1;
    private _lastVisS: boolean = false;

    private _opP: number = 0;
    private _opM: number = 0;
    private _opR: number = 0;
    private _opS: number = 0;
    private _opNs: number = 0;

    private _nebulaPhase?: NebulaPhase;
    private _protostarPhase?: ProtostarPhase;
    private _mainSequencePhase?: MainSequencePhase;
    private _redGiantPhase?: RedGiantPhase;
    private _supernovaPhase?: SupernovaPhase;
    private _remnantPhase?: RemnantPhase;

    private get nebulaPhase(): NebulaPhase {
        if (!this._nebulaPhase) {
            this._nebulaPhase = new NebulaPhase();
            this._nebulaPhase.init(this);
        }
        return this._nebulaPhase;
    }

    private get protostarPhase(): ProtostarPhase {
        if (!this._protostarPhase) {
            this._protostarPhase = new ProtostarPhase(this.baseRadius);
            this._protostarPhase.init(this);
        }
        return this._protostarPhase;
    }

    private get mainSequencePhase(): MainSequencePhase {
        if (!this._mainSequencePhase) {
            this._mainSequencePhase = new MainSequencePhase(this.mass, this.baseRadius);
            this._mainSequencePhase.init(this);
        }
        return this._mainSequencePhase;
    }

    private get redGiantPhase(): RedGiantPhase {
        if (!this._redGiantPhase) {
            this._redGiantPhase = new RedGiantPhase(this.baseRadius, this.tHeat);
            this._redGiantPhase.init(this);
        }
        return this._redGiantPhase;
    }

    private get supernovaPhase(): SupernovaPhase {
        if (!this._supernovaPhase) {
            this._supernovaPhase = new SupernovaPhase(this.mass, this.baseRadius);
            this._supernovaPhase.init(this);
        }
        return this._supernovaPhase;
    }

    private get remnantPhase(): RemnantPhase {
        if (!this._remnantPhase) {
            this._remnantPhase = new RemnantPhase(this.mass);
            this._remnantPhase.init(this);
        }
        return this._remnantPhase;
    }

    public hitMesh: THREE.Mesh;
    public planetarySystem?: PlanetarySystem;

    public baseRadius: number;
    private tHeat: number;
    private birthAge: number;

    constructor() {
        super();
        this.physicsId = THREE.MathUtils.generateUUID();
        const roll = Math.random();
        if (roll > 0.82) {
            this.mass = 8 + Math.random() * 12;         // Massive stars 18%
        } else if (roll < 0.06) {
            this.mass = 0.08 + Math.random() * 0.22;    // Brown dwarfs 6%
        } else {
            this.mass = 0.4 + Math.random() * 3;        // Main sequence 76%
        }
        this.lifespanReal = 10000 * Math.pow(this.mass, -2.5);
        this.loopDuration = 40 + Math.random() * 20; 
        
        this.birthAge = 0.5 + Math.random() * 9.5;
        this.t = 0;

        // BOLT: Baryon ratio affects base heat distribution
        const baryonFactor = (DEFAULT_CONSTANTS.baryon || 0.05) / 0.05; 
        this.tHeat = 5778 * Math.pow(this.mass, 0.5) * baryonFactor;
        this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;
        this._msLuminosity = Math.pow(this.mass, STELLAR_CONSTANTS.PHYSICS.MASS_LUMINOSITY_EXPONENT);

        // Hit mesh for raycaster
        this.hitMesh = new THREE.Mesh(
            GEOMETRIES.hit,
            new THREE.MeshBasicMaterial({visible: false})
        );
        this.add(this.hitMesh);
    }



    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, overrideT?: number, cosmicAge?: number, frustum?: THREE.Frustum, flicker: number = 1.0, nbodyBuffer: Float32Array | null = null): void {
        let targetProto = 0, targetMain = 0, targetRed = 0, targetSuper = 0, targetNs = 0;
        const effG = Math.max(0.01, physics.G);
        const expL = Math.max(0.1, physics.lambda);

        // BOLT: Guarded scale update
        if (this._lastL !== expL) {
            this.scale.setScalar(expL);
            this._lastL = expL;
        }
        
        const ignites = effG > 0.3;

        if (overrideT !== undefined) {
             this.t = overrideT;
        } else if (cosmicAge !== undefined) {
             const ageMyr = (cosmicAge - this.birthAge) * 1000;
             if (ageMyr < 0) this.t = -0.1;
             else this.t = ageMyr / (this.lifespanReal / effG);
        } else {
             this.t += (delta * 200) / (this.lifespanReal / effG);
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

        // BOLT: Determine current phase and handle transitions
        const newPhase = getPhaseForT(this.t);
        if (this._activePhase !== newPhase) {
            if (this._activePhase === PHASES.NEBULA) this._nebulaPhase?.hide();
            else if (this._activePhase === PHASES.PROTOSTAR) this._protostarPhase?.hide();
            else if (this._activePhase === PHASES.MAIN_SEQUENCE) {
                this._mainSequencePhase?.hide();
                if (this.planetarySystem) {
                    this.planetarySystem.dispose();
                    this.planetarySystem = undefined;
                }
            }
            else if (this._activePhase === PHASES.RED_GIANT) this._redGiantPhase?.hide();
            else if (this._activePhase === PHASES.SUPERNOVA) this._supernovaPhase?.hide();
            else if (this._activePhase === PHASES.REMNANT) this._remnantPhase?.hide();

            if (newPhase === PHASES.NEBULA) this.nebulaPhase.show();
            else if (newPhase === PHASES.PROTOSTAR) this.protostarPhase.show();
            else if (newPhase === PHASES.MAIN_SEQUENCE) {
                this.mainSequencePhase.show();
                this.planetarySystem = new PlanetarySystem(this);
            }
            else if (newPhase === PHASES.RED_GIANT) {
                this.redGiantPhase.setPlanets(this.mainSequencePhase.planetsInfo);
                this.redGiantPhase.show();
            }
            else if (newPhase === PHASES.SUPERNOVA) {
                this.supernovaPhase.show();
            }
            else if (newPhase === PHASES.REMNANT) this.remnantPhase.show();

            this._activePhase = newPhase;
            this.phase = newPhase;
        }

        // BOLT: Frustum culling early return (skip distance/LOD math for off-screen stars)
        const isVisible = frustum ? frustum.containsPoint(this.position) : true;
        if (!isVisible && overrideT === undefined) {
            return;
        }

        // BOLT: LOD Logic (only for visible or selected stars)
        const distSq = this.position.distanceToSquared(cameraPos);
        const lowDetail = distSq > STELLAR_CONSTANTS.TRANSITIONS.FADE_THRESHOLD;

        this.isSupernovaFlashing = false;

        if (this.t < STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT) {
            this.phase = PHASES.NEBULA;
            this.nebulaPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            
            const normT = this.t / STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT;
            this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.NEBULA_START + normT * STELLAR_CONSTANTS.TEMPERATURES.NEBULA_MAX;
            this.currentLum = normT * STELLAR_CONSTANTS.LUMINOSITY.NEBULA_MAX;

        } else if (this.phase === PHASES.PROTOSTAR) {
            targetProto = 1;
            const normT = (this.t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.PROTOSTAR_DURATION;
            
            if (normT < STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_SECONDARY_LIMIT) {
                this.nebulaPhase.updateAsSecondary(delta, appTime, cameraPos, normT);
            }

            this.protostarPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            
            this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.PROTOSTAR_START + normT * (this.tHeat - STELLAR_CONSTANTS.TEMPERATURES.PROTOSTAR_START);
            this.currentLum = normT * this._msLuminosity;

        } else if (this.phase === PHASES.MAIN_SEQUENCE) {
            targetMain = 1;
            this.mainSequencePhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            if (nbodyBuffer) {
                // BOLT: Pass lowDetail flag to skip expensive matrix updates for distant planetary systems
                this.planetarySystem?.updateFromBuffer(nbodyBuffer, delta, lowDetail);
            }
            
            this.currentTemp = this.tHeat;
            this.currentLum = this._msLuminosity;

        } else if (this.phase === PHASES.RED_GIANT) {
            targetRed = 1;
            this.redGiantPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            
            this.currentTemp = this.redGiantPhase.getCurrentTemp(this.t);
            this.currentLum = this.redGiantPhase.getCurrentLum(this.t, this.mass);

        } else if (this.phase === PHASES.SUPERNOVA) {
            targetSuper = 1;
            this.supernovaPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            this.isSupernovaFlashing = this.supernovaPhase?.isFlashing ?? false;

            if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.SUPERNOVA_HIGH_MASS;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.SUPERNOVA_HIGH_MASS;
            } else {
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.SUPERNOVA_LOW_MASS;
            }

        } else {
            this.phase = PHASES.REMNANT;
            this.remnantPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            
            if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE) {
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.REMNANT_BH;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.REMNANT_BH;


            } else if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
                targetNs = 1;
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.REMNANT_NS_HIGH_MASS;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.REMNANT_NS_HIGH_MASS;
            } else {
                targetNs = 1;
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.REMNANT_NS_LOW_MASS;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.REMNANT_NS_LOW_MASS;
            }
        }
        
        // BOLT: Optimize transition opacities with state-guarded assignments to reduce Three.js overhead
        const speed = delta * STELLAR_CONSTANTS.TRANSITIONS.DEFAULT_SPEED;

        // 1. Protostar Transition
        this._opP = stepOp(this._opP, targetProto, speed);
        if (this._opP > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            const finalOpP = targetProto > 0 ? this._opP * (flicker ?? 1.0) : this._opP;
            // Always update if targetProto > 0 because of flicker, else use guard
            if (targetProto > 0 || this._lastOpP !== finalOpP) {
                this.protostarPhase.setOpacity(finalOpP);
                this._lastOpP = finalOpP;
            }
            if (!this._lastVisP) {
                this.protostarPhase.protostarGroup.visible = true;
                this._lastVisP = true;
            }
        } else if (this._protostarPhase) {
            if (this._lastOpP !== 0) {
                this.protostarPhase.setOpacity(0);
                this._lastOpP = 0;
            }
            if (this._lastVisP) {
                this.protostarPhase.protostarGroup.visible = false;
                this._lastVisP = false;
            }
        }

        // 2. Main Sequence Transition
        this._opM = stepOp(this._opM, targetMain, speed);
        if (this._opM > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            if (this._lastOpM !== this._opM) {
                this.mainSequencePhase.setOpacity(this._opM);
                this._lastOpM = this._opM;
            }
            if (!this._lastVisM) {
                this.mainSequencePhase.mainSeqGroup.visible = true;
                this._lastVisM = true;
            }
        } else if (this._mainSequencePhase) {
            if (this._lastOpM !== 0) {
                this.mainSequencePhase.setOpacity(0);
                this._lastOpM = 0;
            }
            if (this._lastVisM) {
                this.mainSequencePhase.mainSeqGroup.visible = false;
                this._lastVisM = false;
            }
        }

        // 3. Red Giant Transition
        this._opR = stepOp(this._opR, targetRed, speed);
        if (this._opR > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            if (this._lastOpR !== this._opR) {
                this.redGiantPhase.setOpacity(this._opR);
                this._lastOpR = this._opR;
            }
            if (!this._lastVisR) {
                this.redGiantPhase.redGiantGroup.visible = true;
                this._lastVisR = true;
            }
        } else if (this._redGiantPhase) {
            if (this._lastOpR !== 0) {
                this.redGiantPhase.setOpacity(0);
                this._lastOpR = 0;
            }
            if (this._lastVisR) {
                this.redGiantPhase.redGiantGroup.visible = false;
                this._lastVisR = false;
            }
        }

        // 4. Supernova Transition
        this._opS = stepOp(this._opS, targetSuper, speed);
        if (this._opS > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            if (this._lastOpS !== this._opS) {
                this.supernovaPhase.setOpacity(this._opS);
                this._lastOpS = this._opS;
            }
            if (!this._lastVisS) {
                this.supernovaPhase.supernovaGroup.visible = true;
                this._lastVisS = true;
            }
        } else if (this._supernovaPhase) {
            if (this._lastOpS !== 0) {
                this.supernovaPhase.setOpacity(0);
                this._lastOpS = 0;
            }
            if (this._lastVisS) {
                this.supernovaPhase.supernovaGroup.visible = false;
                this._lastVisS = false;
            }
        }

        if (targetNs > 0 || (this._remnantPhase && this._opNs > 0)) {
            this.remnantPhase.updateRemnantOpacity(delta, targetNs);
        }
    }

    dispose() {
        this._nebulaPhase?.dispose();
        this._protostarPhase?.dispose();
        this._mainSequencePhase?.dispose();
        this._redGiantPhase?.dispose();
        this._supernovaPhase?.dispose();
        this._remnantPhase?.dispose();

        if (this.planetarySystem) {
            this.planetarySystem.dispose();
        }

        if (this.hitMesh) {
            if (this.hitMesh.material instanceof THREE.Material) {
                this.hitMesh.material.dispose();
            }
            // hitMesh geometry is GEOMETRIES.hit, do NOT dispose
        }
    }
}
