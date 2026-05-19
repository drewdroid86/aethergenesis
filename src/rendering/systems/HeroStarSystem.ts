import * as THREE from 'three';
import { PHASES } from '../../core/constants';
import { PhysicalBody } from '../../types/physics';
import { PhysicsConstants } from '../../types/physics';
import { NebulaPhase } from '../../simulation/phases/NebulaPhase';
import { ProtostarPhase } from '../../simulation/phases/ProtostarPhase';
import { MainSequencePhase } from '../../simulation/phases/MainSequencePhase';
import { RedGiantPhase } from '../../simulation/phases/RedGiantPhase';
import { SupernovaPhase } from '../../simulation/phases/SupernovaPhase';
import { RemnantPhase } from '../../simulation/phases/RemnantPhase';
import { GEOMETRIES } from '../../simulation/phases/geometries';
import { detectPerformanceTier, getNumStarsForTier, setOnTierChangeCallback } from '../../utils/performance';
import { updateNumStars } from '../../constants/simulation';

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
    private __opNs: number = 0;

    private nebulaPhase: NebulaPhase;
    private protostarPhase: ProtostarPhase;
    private mainSequencePhase: MainSequencePhase;
    private redGiantPhase: RedGiantPhase;
    private supernovaPhase: SupernovaPhase;
    private remnantPhase: RemnantPhase;

    private hitMesh: THREE.Mesh;
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

    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, overrideT?: number, cosmicAge?: number) {
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
        
        // BOLT: Determine current phase
        let newPhase = this.phase;
        if (this.t < 0.05) newPhase = PHASES.NEBULA;
        else if (this.t < 0.15) newPhase = PHASES.PROTOSTAR;
        else if (this.t < 0.70) newPhase = PHASES.MAIN_SEQUENCE;
        else if (this.t < 0.85) newPhase = PHASES.RED_GIANT;
        else if (this.t < 0.90) newPhase = PHASES.SUPERNOVA;
        else newPhase = PHASES.REMNANT;

        // BOLT: Guarded phase transition (hide previous, show new)
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

        this.isSupernovaFlashing = false;

        if (this.t < 0.05) {
            this.phase = PHASES.NEBULA;
            this.nebulaPhase.show();
            this.nebulaPhase.update(delta, appTime, physics, cameraPos, this.t);
            
            const normT = this.t / 0.05;
            this.currentTemp = 50 + normT * 1000;
            this.currentLum = normT * 0.1;

        } else if (this.phase === PHASES.PROTOSTAR) {
            targetProto = 1;
            const normT = (this.t - 0.05) / 0.10;
            
            if (normT < 0.8) {
                this.nebulaPhase.updateAsSecondary(delta, appTime, cameraPos, normT);
            }

            this.protostarPhase.show();
            this.protostarPhase.update(delta, appTime, physics, cameraPos, this.t);
            
            this.currentTemp = 1000 + normT * (this.tHeat - 1000);
            this.currentLum = normT * Math.pow(this.mass, 3.5);

        } else if (this.phase === PHASES.MAIN_SEQUENCE) {
            targetMain = 1;
            this.mainSequencePhase.show();
            this.mainSequencePhase.update(delta, appTime, physics, cameraPos, this.t);
            
            this.currentTemp = this.tHeat;
            this.currentLum = Math.pow(this.mass, 3.5);

        } else if (this.phase === PHASES.RED_GIANT) {
            targetRed = 1;
            this.redGiantPhase.show();
            this.redGiantPhase.update(delta, appTime, physics, cameraPos, this.t);
            
            this.currentTemp = this.redGiantPhase.getCurrentTemp(this.t);
            this.currentLum = this.redGiantPhase.getCurrentLum(this.t, this.mass);

        } else if (this.phase === PHASES.SUPERNOVA) {
            targetSuper = 1;
            this.supernovaPhase.show();
            this.supernovaPhase.update(delta, appTime, physics, cameraPos, this.t);
            this.isSupernovaFlashing = this.supernovaPhase.isFlashing;
            if (this.mass > 8) {
                this.currentTemp = 100000;
                this.currentLum = 100000;
            } else {
                this.currentTemp = 20000;
            }

        } else {
            this.phase = PHASES.REMNANT;
            this.remnantPhase.show();
            this.remnantPhase.update(delta, appTime, physics, cameraPos, this.t);
            
            if (this.mass > 15) {
                this.currentTemp = 0;
                this.currentLum = 0;
            } else if (this.mass > 8) {
                targetNs = 1;
                this.currentTemp = 500000;
                this.currentLum = 0.5;
            } else {
                targetNs = 1;
                this.currentTemp = 100000;
                this.currentLum = 0.1;
            }
        }
        
        // BOLT: Optimize transition opacities with caching and guarded assignments
        const speed = delta * 4.0;
        const stepOp = (current: number, target: number) => {
            if (current < target) return Math.min(target, current + speed);
            if (current > target) return Math.max(target, current - speed);
            return current;
        };

        this._opP = stepOp(this._opP, targetProto);
        this.protostarPhase.setOpacity(targetProto > 0 ? this._opP * (0.8 + 0.2 * Math.sin(appTime * 20.0)) : this._opP);
        if (this.protostarPhase.protostarGroup.visible !== this._opP > 0.01) {
            this.protostarPhase.protostarGroup.visible = this._opP > 0.01;
        }

        this._opM = stepOp(this._opM, targetMain);
        this.mainSequencePhase.setOpacity(this._opM);
        if (this.mainSequencePhase.mainSeqGroup.visible !== this._opM > 0.01) {
            this.mainSequencePhase.mainSeqGroup.visible = this._opM > 0.01;
        }

        this._opR = stepOp(this._opR, targetRed);
        this.redGiantPhase.setOpacity(this._opR);
        if (this.redGiantPhase.redGiantGroup.visible !== this._opR > 0.01) {
            this.redGiantPhase.redGiantGroup.visible = this._opR > 0.01;
        }

        this._opS = stepOp(this._opS, targetSuper);
        this.supernovaPhase.setOpacity(this._opS);
        if (this.supernovaPhase.supernovaGroup.visible !== this._opS > 0.01) {
            this.supernovaPhase.supernovaGroup.visible = this._opS > 0.01;
        }

        this.remnantPhase.updateRemnantOpacity(delta, targetNs);
    }
}
