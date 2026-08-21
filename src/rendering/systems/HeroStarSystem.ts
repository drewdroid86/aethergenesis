import * as THREE from 'three';
import { PHASES, STELLAR_CONSTANTS } from '../../core/constants';
import { computeLuminosity } from '../../simulation/StellarPhysics';
import { PhysicsConstants, DEFAULT_CONSTANTS } from '../../types/physics';
import { colorTempToRGB } from '../../physics/math';
import { NebulaPhase } from '../../simulation/phases/NebulaPhase';
import { ProtostarPhase } from '../../simulation/phases/ProtostarPhase';
import { MainSequencePhase } from '../../simulation/phases/MainSequencePhase';
import { RedGiantPhase } from '../../simulation/phases/RedGiantPhase';
import { SupernovaPhase } from '../../simulation/phases/SupernovaPhase';
import { RemnantPhase } from '../../simulation/phases/RemnantPhase';
import { GEOMETRIES } from '../../simulation/phases/geometries';
import { PlanetarySystem, PlanetarySystemQueue } from './PlanetarySystem';
import { audioEngine } from '../../audio/AudioEngine';
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

const _frustumSphere = new THREE.Sphere();

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
    private _wasSupernovaFlashing: boolean = false;
    /** True when this star's phase would normally emit a PointLight */
    wantsLight: boolean = false;
    /** Tracks whether the engine has culled this star's PointLight */
    private _lightCulled: boolean = false;

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

    private _nebulaPhase: NebulaPhase;
    private _protostarPhase: ProtostarPhase;
    private _mainSequencePhase: MainSequencePhase;
    private _redGiantPhase: RedGiantPhase;
    private _supernovaPhase: SupernovaPhase;
    private _remnantPhase: RemnantPhase;

    private get nebulaPhase(): NebulaPhase {
        return this._nebulaPhase;
    }

    private get protostarPhase(): ProtostarPhase {
        return this._protostarPhase;
    }

    private get mainSequencePhase(): MainSequencePhase {
        return this._mainSequencePhase;
    }

    private get redGiantPhase(): RedGiantPhase {
        return this._redGiantPhase;
    }

    private get supernovaPhase(): SupernovaPhase {
        return this._supernovaPhase;
    }

    private get remnantPhase(): RemnantPhase {
        return this._remnantPhase;
    }

    public hitMesh: THREE.Mesh;
    public planetarySystem?: PlanetarySystem;
    public starLight?: THREE.PointLight;

    public baseRadius: number;
    private tHeat: number;
    private birthAge: number;

    constructor(cosmicAge: number = 5.0, physics: PhysicsConstants = DEFAULT_CONSTANTS) {
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
        
        this.birthAge = Math.random() * 13.0;
        this.t = 0;

        // BOLT: Baryon ratio affects base heat distribution
        const baryonFactor = (DEFAULT_CONSTANTS.baryon || 0.05) / 0.05; 
        this.tHeat = 5778 * Math.pow(this.mass, 0.5) * baryonFactor;
        this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;
        this._msLuminosity = computeLuminosity(this.mass);

        // Hit mesh for raycaster
        const hitMat = new THREE.MeshBasicMaterial({visible: false});
        hitMat.name = 'HeroStarHitMeshMaterial';
        this.hitMesh = new THREE.Mesh(
            GEOMETRIES.hit,
            hitMat
        );
        this.add(this.hitMesh);

        // PointLight representing star radiation
        this.starLight = new THREE.PointLight(0xffffff, 1.0, 500);
        this.add(this.starLight);

        // Eagerly initialize all 6 phases
        this._nebulaPhase = new NebulaPhase();
        this._nebulaPhase.init(this);

        this._protostarPhase = new ProtostarPhase(this.baseRadius);
        this._protostarPhase.init(this);

        this._mainSequencePhase = new MainSequencePhase(this.mass, this.baseRadius);
        this._mainSequencePhase.init(this);

        this._redGiantPhase = new RedGiantPhase(this.baseRadius, this.tHeat);
        this._redGiantPhase.init(this);

        this._supernovaPhase = new SupernovaPhase(this.mass, this.baseRadius);
        this._supernovaPhase.init(this);

        this._remnantPhase = new RemnantPhase(this.mass);
        this._remnantPhase.init(this);

        this.applyInitialCosmicAge(cosmicAge, physics);
    }

    applyInitialCosmicAge(cosmicAge: number = 5.0, physics: PhysicsConstants = DEFAULT_CONSTANTS, renderer?: THREE.WebGLRenderer): void {
        const effG = Math.max(0.01, physics.G);
        let globalFade = 1.0;
        if (cosmicAge > 13.0) {
            globalFade = Math.max(0, 1.0 - (cosmicAge - 13.0) / 1.0);
        } else if (cosmicAge < 1.0) {
            globalFade = Math.max(0, cosmicAge / 1.0);
        }

        const ageMyr = (cosmicAge - this.birthAge) * 1000;
        if (ageMyr < 0) {
            this.t = -0.1;
            this.visible = false;
        } else {
            this.t = ageMyr / (this.lifespanReal / effG);
            if (this.t > 1.0) {
                this.t = Math.min(1.05, this.t);
            }
            this.visible = globalFade > 0.01;
        }
        this.currentRealAge = Math.max(0, this.t * this.lifespanReal);

        if (this.t >= 0) {
            const initialPhase = getPhaseForT(this.t);
            this.transitionToPhase(initialPhase, renderer);
        }
    }

    public transitionToPhase(newPhase: number, renderer?: THREE.WebGLRenderer): void {
        if (this._activePhase === newPhase) return;

        // Hide previous active phase (full-reset path: always dispose planets)
        this._exitPhase(this._activePhase, /* keepPlanetsForRedGiant */ false);

        // Show new active phase
        if (newPhase === PHASES.NEBULA) {
            this.nebulaPhase.show();
        } else if (newPhase === PHASES.PROTOSTAR) {
            this.protostarPhase.show();
        } else if (newPhase === PHASES.MAIN_SEQUENCE) {
            this.mainSequencePhase.show();
            PlanetarySystemQueue.enqueueCreation(this, renderer);
        } else if (newPhase === PHASES.RED_GIANT) {
            this.redGiantPhase.show();
        } else if (newPhase === PHASES.SUPERNOVA) {
            this.supernovaPhase.show();
        } else if (newPhase === PHASES.REMNANT) {
            this.remnantPhase.show();
        }

        this._activePhase = newPhase;
        if (newPhase >= 0) {
            this.phase = newPhase;
        }
    }

    /**
     * Hides the visuals for a departing phase and optionally keeps the PlanetarySystem
     * alive when transitioning MAIN_SEQUENCE → RED_GIANT so scorch can render.
     * @param exitingPhase   The phase being left.
     * @param keepPlanetsForRedGiant  When true and exitingPhase is MAIN_SEQUENCE,
     *                                the PlanetarySystem is NOT disposed — it carries
     *                                forward into the Red Giant phase for scorch rendering.
     *                                Always pass false for full-reset code paths (respawn,
     *                                applyPreset, transitionToPhase called externally).
     */
    private _exitPhase(exitingPhase: number, keepPlanetsForRedGiant: boolean): void {
        if (exitingPhase === PHASES.NEBULA) {
            this._nebulaPhase?.hide();
        } else if (exitingPhase === PHASES.PROTOSTAR) {
            this._protostarPhase?.hide();
        } else if (exitingPhase === PHASES.MAIN_SEQUENCE) {
            this._mainSequencePhase?.hide();
            if (!keepPlanetsForRedGiant) {
                PlanetarySystemQueue.cancelCreation(this);
                if (this.planetarySystem) {
                    PlanetarySystemQueue.enqueueDisposal(this.planetarySystem);
                    this.planetarySystem = undefined;
                }
            }
            // If keepPlanetsForRedGiant is true, planetarySystem stays alive intentionally.
        } else if (exitingPhase === PHASES.RED_GIANT) {
            this._redGiantPhase?.hide();
            // Planets are vaporised when Red Giant ends — dispose regardless.
            PlanetarySystemQueue.cancelCreation(this);
            if (this.planetarySystem) {
                PlanetarySystemQueue.enqueueDisposal(this.planetarySystem);
                this.planetarySystem = undefined;
            }
        } else if (exitingPhase === PHASES.SUPERNOVA) {
            this._supernovaPhase?.hide();
        } else if (exitingPhase === PHASES.REMNANT) {
            this._remnantPhase?.hide();
        }
    }

    respawn(renderer?: THREE.WebGLRenderer, cosmicAge: number = 0.0, physics: PhysicsConstants = DEFAULT_CONSTANTS): void {
        this.birthAge = Math.random() * 13.0;
        this.t = -0.1;
        this.visible = false;
        
        this.transitionToPhase(-1, renderer);
        this.phase = 0;
        
        this._opP = 0;
        this._opM = 0;
        this._opR = 0;
        this._opS = 0;
        this._opNs = 0;

        this._lastOpP = -1;
        this._lastOpM = -1;
        this._lastOpR = -1;
        this._lastOpS = -1;

        this._lastVisP = false;
        this._lastVisM = false;
        this._lastVisR = false;
        this.isSupernovaFlashing = false;
        this._wasSupernovaFlashing = false;

        if (this.starLight) {
            this.starLight.visible = false;
        }

        this.applyInitialCosmicAge(cosmicAge, physics, renderer);
    }

    applyPreset(preset: any, renderer?: THREE.WebGLRenderer): void {
        const massVal = preset.mass_solar ?? preset.mass;
        if (typeof massVal === 'number' && Number.isFinite(massVal) && massVal > 0) {
            this.mass = massVal;
        }

        const tempVal = preset.temperature_K ?? preset.temperature;
        if (typeof tempVal === 'number' && Number.isFinite(tempVal) && tempVal > 0) {
            this.tHeat = tempVal;
        } else {
            const baryonFactor = (DEFAULT_CONSTANTS.baryon || 0.05) / 0.05;
            this.tHeat = 5778 * Math.pow(this.mass, 0.5) * baryonFactor;
        }
        this.currentTemp = this.tHeat;

        this.lifespanReal = 10000 * Math.pow(this.mass, -2.5);
        this.baseRadius = Math.pow(this.mass, 0.8) * 0.8;
        this._msLuminosity = preset.luminosity_solar ?? computeLuminosity(this.mass);
        this.currentLum = this._msLuminosity;

        // Dispose old phase components
        this._nebulaPhase?.dispose();
        this._protostarPhase?.dispose();
        this._mainSequencePhase?.dispose();
        this._redGiantPhase?.dispose();
        this._supernovaPhase?.dispose();
        this._remnantPhase?.dispose();

        PlanetarySystemQueue.cancelCreation(this);
        if (this.planetarySystem) {
            PlanetarySystemQueue.enqueueDisposal(this.planetarySystem);
            this.planetarySystem = undefined;
        }

        // Re-initialize phases with updated mass and baseRadius
        this._nebulaPhase = new NebulaPhase();
        this._nebulaPhase.init(this);

        this._protostarPhase = new ProtostarPhase(this.baseRadius);
        this._protostarPhase.init(this);

        this._mainSequencePhase = new MainSequencePhase(this.mass, this.baseRadius);
        this._mainSequencePhase.init(this);

        this._redGiantPhase = new RedGiantPhase(this.baseRadius, this.tHeat);
        this._redGiantPhase.init(this);

        this._supernovaPhase = new SupernovaPhase(this.mass, this.baseRadius);
        this._supernovaPhase.init(this);

        this._remnantPhase = new RemnantPhase(this.mass);
        this._remnantPhase.init(this);

        // Reset phase tracking
        this._activePhase = -1;
        this.phase = 0;
        this._lastVisP = false;
        this._lastVisM = false;
        this._lastVisR = false;
        this._lastVisS = false;
        this._lastOpP = -1;
        this._lastOpM = -1;
        this._lastOpR = -1;
        this._lastOpS = -1;
        this._opP = 0;
        this._opM = 0;
        this._opR = 0;
        this._opS = 0;
        this._opNs = 0;
        this.isSupernovaFlashing = false;
        this._wasSupernovaFlashing = false;

        // Reset real age / progress
        if (typeof preset.age_gyr === 'number' && Number.isFinite(preset.age_gyr)) {
            this.currentRealAge = Math.max(0, preset.age_gyr * 1000);
            this.t = Math.max(0.0, Math.min(1.0, this.currentRealAge / this.lifespanReal));
        } else {
            this.t = 0.2; // Main sequence default
            this.currentRealAge = this.t * this.lifespanReal;
        }

        const initialPhase = getPhaseForT(this.t);
        this.transitionToPhase(initialPhase, renderer);
    }



    update(delta: number, appTime: number, cameraPos: THREE.Vector3, physics: PhysicsConstants, overrideT?: number, cosmicAge?: number, frustum?: THREE.Frustum, flicker: number = 1.0, nbodyBuffer: Float32Array | null = null, renderer?: THREE.WebGLRenderer): void {
        let targetProto = 0, targetMain = 0, targetRed = 0, targetSuper = 0, targetNs = 0;
        const effG = Math.max(0.01, physics.G);
        const expL = Math.max(0.1, physics.lambda);

        // BOLT: Guarded scale update
        if (this._lastL !== expL) {
            this.scale.setScalar(expL);
            this._lastL = expL;
        }
        
        const ignites = effG > 0.3;

        let globalFade = 1.0;
        if (cosmicAge !== undefined) {
            if (cosmicAge > 13.0) {
                globalFade = Math.max(0, 1.0 - (cosmicAge - 13.0) / 1.0);
            } else if (cosmicAge < 1.0) {
                globalFade = Math.max(0, cosmicAge / 1.0);
            }
        }

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
            this.visible = globalFade > 0.01;
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
            // Keep planets alive specifically for MAIN_SEQUENCE → RED_GIANT so scorch can render.
            // All other exits dispose planets unconditionally.
            const keepPlanets = this._activePhase === PHASES.MAIN_SEQUENCE && newPhase === PHASES.RED_GIANT;
            this._exitPhase(this._activePhase, /* keepPlanetsForRedGiant */ keepPlanets);

            if (newPhase === PHASES.NEBULA) this.nebulaPhase.show();
            else if (newPhase === PHASES.PROTOSTAR) this.protostarPhase.show();
            else if (newPhase === PHASES.MAIN_SEQUENCE) {
                this.mainSequencePhase.show();
                PlanetarySystemQueue.enqueueCreation(this, renderer);
            }
            else if (newPhase === PHASES.RED_GIANT) {
                this.redGiantPhase.show();
            }
            else if (newPhase === PHASES.SUPERNOVA) {
                this.supernovaPhase.show();
            }
            else if (newPhase === PHASES.REMNANT) this.remnantPhase.show();

            this._activePhase = newPhase;
            this.phase = newPhase;
        }

        // BOLT: Frustum culling early return with bounding radius padding for expanded phases
        let boundRadius = this.baseRadius * 4.0;
        if (this.phase === PHASES.SUPERNOVA) boundRadius = this.baseRadius * 60.0;
        else if (this.phase === PHASES.NEBULA) boundRadius = 15.0;
        _frustumSphere.center.copy(this.position);
        _frustumSphere.radius = boundRadius * expL;
        const isVisible = frustum ? frustum.intersectsSphere(_frustumSphere) : true;
        if (!isVisible && overrideT === undefined) {
            return;
        }

        // BOLT: LOD Logic (only for visible or selected stars)
        const distSq = this.position.distanceToSquared(cameraPos);
        const lowDetail = distSq > STELLAR_CONSTANTS.TRANSITIONS.FADE_THRESHOLD;

        let isFlashingNow = false;

        if (this.t < STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT) {
            this.phase = PHASES.NEBULA;
            this.nebulaPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail, globalFade);
            
            const normT = this.t / STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT;
            this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.NEBULA_START + normT * STELLAR_CONSTANTS.TEMPERATURES.NEBULA_MAX;
            this.currentLum = normT * STELLAR_CONSTANTS.LUMINOSITY.NEBULA_MAX;

        } else if (this.phase === PHASES.PROTOSTAR) {
            targetProto = 1;
            const normT = (this.t - STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_LIMIT) / STELLAR_CONSTANTS.PHASE_BOUNDARIES.PROTOSTAR_DURATION;
            
            if (normT < STELLAR_CONSTANTS.PHASE_BOUNDARIES.NEBULA_SECONDARY_LIMIT) {
                this.nebulaPhase.updateAsSecondary(delta, appTime, cameraPos, normT, globalFade);
            }

            this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.PROTOSTAR_START + normT * (this.tHeat - STELLAR_CONSTANTS.TEMPERATURES.PROTOSTAR_START);
            this.currentLum = normT * this._msLuminosity;
            this.protostarPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail, this.currentTemp);

        } else if (this.phase === PHASES.MAIN_SEQUENCE) {
            targetMain = 1;
            this.currentTemp = this.tHeat;
            this.currentLum = this._msLuminosity;
            this.mainSequencePhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail, this.currentTemp);
            this.planetarySystem?.update(delta, appTime, nbodyBuffer, lowDetail, globalFade);

        } else if (this.phase === PHASES.RED_GIANT) {
            targetRed = 1;
            this.currentTemp = this.redGiantPhase.getCurrentTemp(this.t);
            this.currentLum = this.redGiantPhase.getCurrentLum(this.t, this.mass);
            this.redGiantPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail, this.currentTemp);
            // Thread the live giant radius into update for per-planet scorch computation.
            if (this.planetarySystem) {
                const redGiantScale = this.redGiantPhase.getCurrentScale(this.t, appTime);
                this.planetarySystem.update(delta, appTime, nbodyBuffer, lowDetail, globalFade, redGiantScale);
            }

        } else if (this.phase === PHASES.SUPERNOVA) {
            targetSuper = 1;
            this.supernovaPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail, globalFade);
            isFlashingNow = this.supernovaPhase?.isFlashing ?? false;
            if (isFlashingNow && !this._wasSupernovaFlashing) {
                audioEngine.playSupernovaSound();
            }

            if (this.mass >= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.SUPERNOVA_HIGH_MASS;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.SUPERNOVA_HIGH_MASS;
            } else {
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.SUPERNOVA_LOW_MASS;
            }

        } else {
            this.phase = PHASES.REMNANT;
            this.remnantPhase.update(delta, appTime, cameraPos, physics, this.t, lowDetail, globalFade);
            
            if (this.mass > STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_BLACK_HOLE) {
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.REMNANT_BH;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.REMNANT_BH;


            } else if (this.mass >= STELLAR_CONSTANTS.PHYSICS.MASS_THRESHOLD_SUPERNOVA) {
                targetNs = 1;
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.REMNANT_NS_HIGH_MASS;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.REMNANT_NS_HIGH_MASS;
            } else {
                targetNs = 1;
                this.currentTemp = STELLAR_CONSTANTS.TEMPERATURES.REMNANT_NS_LOW_MASS;
                this.currentLum = STELLAR_CONSTANTS.LUMINOSITY.REMNANT_NS_LOW_MASS;
            }
        }
        
        this.isSupernovaFlashing = isFlashingNow;
        this._wasSupernovaFlashing = isFlashingNow;
        
        // BOLT: Optimize transition opacities with state-guarded assignments to reduce Three.js overhead
        const speed = delta * STELLAR_CONSTANTS.TRANSITIONS.DEFAULT_SPEED;

        // 1. Protostar Transition
        this._opP = stepOp(this._opP, targetProto, speed);
        if (this._opP > STELLAR_CONSTANTS.TRANSITIONS.VISIBILITY_THRESHOLD) {
            const finalOpP = (targetProto > 0 ? this._opP * (flicker ?? 1.0) : this._opP) * globalFade;
            // Always update if targetProto > 0 because of flicker, else use guard
            if (targetProto > 0 || this._lastOpP !== finalOpP) {
                this.protostarPhase.setOpacity(finalOpP);
                this._lastOpP = finalOpP;
            }
            if (!this._lastVisP) {
                this.protostarPhase.protostarGroup.visible = globalFade > 0.01;
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
            const finalOpM = this._opM * globalFade;
            if (this._lastOpM !== finalOpM) {
                this.mainSequencePhase.setOpacity(finalOpM);
                this._lastOpM = finalOpM;
            }
            if (!this._lastVisM) {
                this.mainSequencePhase.mainSeqGroup.visible = globalFade > 0.01;
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
            const finalOpR = this._opR * globalFade;
            if (this._lastOpR !== finalOpR) {
                this.redGiantPhase.setOpacity(finalOpR);
                this._lastOpR = finalOpR;
            }
            if (!this._lastVisR) {
                this.redGiantPhase.redGiantGroup.visible = globalFade > 0.01;
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
            const finalOpS = this._opS * globalFade;
            if (this._lastOpS !== finalOpS) {
                this.supernovaPhase.setOpacity(finalOpS);
                this._lastOpS = finalOpS;
            }
            if (!this._lastVisS) {
                this.supernovaPhase.supernovaGroup.visible = globalFade > 0.01;
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
            this.remnantPhase.updateRemnantOpacity(delta, targetNs, globalFade);
        }

        // Dynamic update of star light color and intensity based on temperature and luminosity
        // NOTE: starLight.visible is now controlled by Engine._cullStarLights(), not here.
        if (this.starLight) {
            if (this.phase === PHASES.MAIN_SEQUENCE || this.phase === PHASES.RED_GIANT || this.phase === PHASES.PROTOSTAR || this.phase === PHASES.SUPERNOVA) {
                this.starLight.intensity = Math.min(50.0, this.currentLum * 2.0) * globalFade;
                if (this.phase === PHASES.SUPERNOVA) {
                    this.starLight.color.setHex(0xffffff);
                    this.starLight.intensity = 100.0 * globalFade;
                } else {
                    colorTempToRGB(this.currentTemp, this.starLight.color);
                }
                this.wantsLight = globalFade > 0.01;
            } else {
                this.wantsLight = false;
            }
        }

        // Dynamic hitMesh scaling per phase to match visual radius with a minimum click target of 2.0 (GEOMETRIES.hit radius is 8.0)
        if (this.hitMesh) {
            let targetRadius = this.baseRadius;
            if (this.phase === PHASES.RED_GIANT) {
                targetRadius = this.baseRadius * 4.0;
            } else if (this.phase === PHASES.SUPERNOVA) {
                targetRadius = this.baseRadius * 6.0;
            } else if (this.phase === PHASES.REMNANT) {
                targetRadius = Math.max(2.0, this.baseRadius * 0.5);
            } else if (this.phase === PHASES.NEBULA) {
                targetRadius = 15.0;
            }
            const hitScale = Math.max(0.25, targetRadius / 8.0);
            this.hitMesh.scale.setScalar(hitScale);
        }
    }

    /**
     * Called by Engine._cullStarLights() each frame.
     * When culled, the PointLight is hidden.
     */
    setLightCulled(culled: boolean): void {
        if (this._lightCulled === culled) return;
        this._lightCulled = culled;
        if (this.starLight) {
            this.starLight.visible = !culled && this.wantsLight;
        }
    }

    dispose(_renderer?: THREE.WebGLRenderer) {
        this._nebulaPhase?.dispose();
        this._protostarPhase?.dispose();
        this._mainSequencePhase?.dispose();
        this._redGiantPhase?.dispose();
        this._supernovaPhase?.dispose();
        this._remnantPhase?.dispose();

        PlanetarySystemQueue.cancelCreation(this);
        if (this.planetarySystem) {
            PlanetarySystemQueue.enqueueDisposal(this.planetarySystem);
            this.planetarySystem = undefined;
        }

        if (this.hitMesh) {
            if (this.hitMesh.material instanceof THREE.Material) {
                this.hitMesh.material.dispose();
            }
            this.remove(this.hitMesh);
            // hitMesh geometry is GEOMETRIES.hit, do NOT dispose
        }

        if (this.starLight) {
            this.remove(this.starLight);
        }
    }
}
