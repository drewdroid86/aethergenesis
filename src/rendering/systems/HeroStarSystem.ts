import * as THREE from 'three';
import { PHASES, STELLAR_CONSTANTS } from '../../core/constants';
import { PhysicalBody } from '../../physics/types';
import { PhysicsConstants } from '../../types/physics';
import { NebulaPhase } from '../../simulation/phases/NebulaPhase';
import { ProtostarPhase } from '../../simulation/phases/ProtostarPhase';
import { MainSequencePhase } from '../../simulation/phases/MainSequencePhase';
import { RedGiantPhase } from '../../simulation/phases/RedGiantPhase';
import { SupernovaPhase } from '../../simulation/phases/SupernovaPhase';
import { RemnantPhase } from '../../simulation/phases/RemnantPhase';
import { GEOMETRIES } from '../../simulation/phases/geometries';

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

    private _activePhase: number = -1;
    private _lastL: number = -1;
    private _opP: number = 0;
    private _opM: number = 0;
    private _opR: number = 0;
    private _opS: number = 0;
    private _opNs: number = 0;

    private nebulaPhase: NebulaPhase;
    private protostarPhase: ProtostarPhase;
    private mainSequencePhase: MainSequencePhase;
    private redGiantPhase: RedGiantPhase;
    private supernovaPhase: SupernovaPhase;
    private remnantPhase: RemnantPhase;

    public hitMesh: THREE.Mesh;
    private baseRadius: number;
    private tHeat: number;
    private birthAge: number;

    constructor() {
        super();
        this.physicsId = THREE.MathUtils.generateUUID();
        this.mass = Math.random() > 0.8 ? 8 + Math.random() * 12 : 0.5 + Math.random() * 3;
        this.lifespanReal = 10000 * Math.pow(this.mass, -2.5);
        this.loopDuration = 40 + Math.random() * 20; 
        
        this.birthAge = 0.5 + Math.random() * 9.5;
        this.t = 0;

        this.tHeat = 5778 * Math.pow(this.mass, 0.5);
        this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;

        // Initialize Phases
        this.nebulaPhase = new NebulaPhase();
        this.protostarPhase = new ProtostarPhase(this.baseRadius);
        this.mainSequencePhase = new MainSequencePhase(this.mass, this.baseRadius);
        this.redGiantPhase = new RedGiantPhase(this.baseRadius, this.tHeat);
        this.supernovaPhase = new SupernovaPhase(this.mass, this.baseRadius);
        this.remnantPhase = new RemnantPhase(this.mass);

        this.nebulaPhase.init(this);
        this.protostarPhase.init(this);
        this.mainSequencePhase.init(this);
        this.redGiantPhase.init(this);
        this.supernovaPhase.init(this);
        this.remnantPhase.init(this);

        // Connect shared data
        this.redGiantPhase.setPlanets(this.mainSequencePhase.planetsInfo);

        // Hit mesh for raycaster
        this.hitMesh = new THREE.Mesh(
            GEOMETRIES.hit,
            new THREE.MeshBasicMaterial({visible: false})
        );
        this.add(this.hitMesh);
    }

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, overrideT?: number, cosmicAge?: number, frustum?: THREE.Frustum, flicker?: number) {
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
            if (this._activePhase === PHASES.NEBULA) this.nebulaPhase.hide();
            else if (this._activePhase === PHASES.PROTOSTAR) this.protostarPhase.hide();
            else if (this._activePhase === PHASES.MAIN_SEQUENCE) this.mainSequencePhase.hide();
            else if (this._activePhase === PHASES.RED_GIANT) this.redGiantPhase.hide();
            else if (this._activePhase === PHASES.SUPERNOVA) this.supernovaPhase.hide();
            else if (this._activePhase === PHASES.REMNANT) this.remnantPhase.hide();

            if (newPhase === PHASES.NEBULA) this.nebulaPhase.show();
            else if (newPhase === PHASES.PROTOSTAR) this.protostarPhase.show();
            else if (newPhase === PHASES.MAIN_SEQUENCE) this.mainSequencePhase.show();
            else if (newPhase === PHASES.RED_GIANT) this.redGiantPhase.show();
            else if (newPhase === PHASES.SUPERNOVA) this.supernovaPhase.show();
            else if (newPhase === PHASES.REMNANT) this.remnantPhase.show();

            this._activePhase = newPhase;
            this.phase = newPhase;
        }

        // BOLT: Culling & LOD Logic
        const isVisible = frustum ? frustum.containsPoint(this.position) : true;
        const distSq = this.position.distanceToSquared(cameraPos);
        const lowDetail = distSq > STELLAR_CONSTANTS.TRANSITIONS.FADE_THRESHOLD; 

        if (!isVisible && overrideT === undefined) {
            // Note: Phase transitions handled above, ensuring robustness when returning to screen
            return;
        }

        this.isSupernovaFlashing = false;

        if (this.t < STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT) {
            this.phase = PHASES.NEBULA;
            this.nebulaPhase.show();
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

            this.protostarPhase.show();
            this.protostarPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            
            this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.PROTOSTAR_START + normT * (this.tHeat - STELLAR_CONSTANTS.TEMPERATURES.PROTOSTAR_START);
            this.currentLum = normT * Math.pow(this.mass, STELLAR_CONSTANTS.PHYSICS.MASS_LUMINOSITY_EXPONENT);

        } else if (this.phase === PHASES.MAIN_SEQUENCE) {
            targetMain = 1;
            this.mainSequencePhase.show();
            this.mainSequencePhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            
            this.currentTemp = this.tHeat;
            this.currentLum = Math.pow(this.mass, STELLAR_CONSTANTS.PHYSICS.MASS_LUMINOSITY_EXPONENT);

        } else if (this.phase === PHASES.RED_GIANT) {
            targetRed = 1;
            this.redGiantPhase.show();
            this.redGiantPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail);
            
            this.currentTemp = this.redGiantPhase.getCurrentTemp(this.t);
            this.currentLum = this.redGiantPhase.getCurrentLum(this.t, this.mass);

        } else if (this.phase === PHASES.SUPERNOVA) {
            targetSuper = 1;
            this.supernovaPhase.show();
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
            this.remnantPhase.show();
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
        
        // BOLT: Optimize transition opacities with caching and guarded assignments
        const speed = delta * STELLAR_CONSTANTS.TRANSITIONS.DEFAULT_SPEED;
        this._opP = stepOp(this._opP, targetProto, speed);
        this.protostarPhase.setOpacity(targetProto > 0 ? this._opP * (flicker ?? 1.0) : this._opP);
        if (this.protostarPhase.protostarGroup.visible !== this._opP > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            this.protostarPhase.protostarGroup.visible = this._opP > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD;
        }

        this._opM = stepOp(this._opM, targetMain, speed);
        this.mainSequencePhase.setOpacity(this._opM);
        if (this.mainSequencePhase.mainSeqGroup.visible !== this._opM > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            this.mainSequencePhase.mainSeqGroup.visible = this._opM > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD;
        }

        this._opR = stepOp(this._opR, targetRed, speed);
        this.redGiantPhase.setOpacity(this._opR);
        if (this.redGiantPhase.redGiantGroup.visible !== this._opR > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            this.redGiantPhase.redGiantGroup.visible = this._opR > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD;
        }

        this._opS = stepOp(this._opS, targetSuper, speed);
        this.supernovaPhase.setOpacity(this._opS);
        if (this.supernovaPhase.supernovaGroup.visible !== this._opS > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            this.supernovaPhase.supernovaGroup.visible = this._opS > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD;
        }

        this.remnantPhase.updateRemnantOpacity(delta, targetNs);
    }
}
