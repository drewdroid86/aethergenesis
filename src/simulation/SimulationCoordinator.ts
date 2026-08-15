import { Engine } from '../core/engine';
import { AstrobiologyEngine, HabitabilityState } from './AstrobiologyEngine';
import { computeSpectralClass, SpectralClass, StellarPhase } from './StellarPhysics';

export interface StellarStateData {
    id: string;
    initialMass_solar: number;
    metallicity_Z: number;
    age_yr: number;
    mass_solar: number;
    luminosity_solar: number;
    radius_solar: number;
    temperature_K: number;
    phase: StellarPhase;
    spectralClass: SpectralClass;
    absoluteMagnitude: number;
    hrPosition: {
        logT: number;
        logL: number;
    };
    sim_time_yr: number;
}

export interface OrbitalStateData {
    body_id: string;
    body_type: string;
    position_au: { x: number; y: number; z: number };
    velocity_au_yr: { x: number; y: number; z: number };
    semi_major_axis_au: number;
    coma_active: boolean;
    tail_vector: { x: number; y: number; z: number } | null;
}

export interface AstrobiologyStateData extends HabitabilityState {
    sim_time_yr?: number;
}

export interface SimStatePayload {
    timestamp_ms: number;
    stellar: StellarStateData;
    orbital: OrbitalStateData[];
    astrobiology: AstrobiologyStateData[];
}

export class SimulationCoordinator {
    private engine: Engine;
    private astrobiologyEngine: AstrobiologyEngine;
    private lastAnalysisTime: number = 0;
    private lastStateSendTime: number = 0;

    // Callbacks for UI updates
    onAstrobiologyUpdate: ((data: AstrobiologyStateData[]) => void) | null = null;
    onTick: ((cosmicAge: number, delta: number) => void) | null = null;

    wsClient: WebSocket | null = null;

    constructor(engine: Engine, wsClient: WebSocket | null = null) {
        this.engine = engine;
        this.astrobiologyEngine = new AstrobiologyEngine();
        this.wsClient = wsClient;

        // Register to the engine's tick loop
        this.engine.onTick = (delta, appTime) => {
            this.handleTick(delta, appTime);
        };
    }

    private handleTick(delta: number, _appTime: number) {
        const currentTime = performance.now();
        
        // Notify playhead tick
        if (this.onTick) {
            this.onTick(this.engine.cosmicAge, delta);
        }

        // Send simulation state to WebSocket server at 5Hz (every 200ms)
        if (currentTime - this.lastStateSendTime > 200) {
            this.processSimulationState(delta, currentTime);
            this.lastStateSendTime = currentTime;
        }
    }

    private processSimulationState(delta: number, currentTime: number) {
        const star = this.engine.selectedStar || this.engine.heroStars[0];
        if (!star) return;

        const phaseStrMap: Record<number, StellarPhase> = {
            0: 'nebula',
            1: 'protostar',
            2: 'main_sequence',
            3: 'red_giant',
            4: 'supernova',
            5: 'remnant'
        };

        const perStarState = {
            id: star.physicsId,
            initialMass_solar: star.mass,
            metallicity_Z: 0.02,
            age_yr: star.currentRealAge * 1e6,
            mass_solar: star.mass,
            luminosity_solar: star.currentLum,
            radius_solar: Math.pow(star.mass, 0.8),
            temperature_K: star.currentTemp,
            phase: (phaseStrMap[star.phase] || 'main_sequence'),
            spectralClass: computeSpectralClass(star.currentTemp),
            absoluteMagnitude: 4.83 - 2.5 * Math.log10(Math.max(star.currentLum, 1e-10)),
            hrPosition: {
                logT: Math.log10(Math.max(star.currentTemp, 1)),
                logL: Math.log10(Math.max(star.currentLum, 1e-10))
            },
            sim_time_yr: this.engine.appTime * 1e6
        };

        const buffer = this.engine.nbodyBuffer;
        const orbitalStates: OrbitalStateData[] = [];
        const astrobiologyStates: AstrobiologyStateData[] = [];
        let maxK = 0;

        if (buffer) {
            const numBodies = buffer.length / 7;
            const sim_time_yr = this.engine.appTime * 1e6;
            const elapsedWallSec = Math.min(0.5, (currentTime - this.lastStateSendTime) / 1000.0);
            const deltaTime_yr = this.engine.isPaused ? 0 : (this.engine.timeScale === 'cosmic' ? elapsedWallSec * 200000000 : elapsedWallSec * 1000);

            const MASS_EARTH = 5.97e24;
            const RADIUS_EARTH = 6371000;

            for (let i = 0; i < numBodies; i++) {
                const x = buffer[i * 7 + 0];
                const y = buffer[i * 7 + 1];
                const z = buffer[i * 7 + 2];
                const vx = buffer[i * 7 + 3];
                const vy = buffer[i * 7 + 4];
                const vz = buffer[i * 7 + 5];
                const bodyTypeVal = buffer[i * 7 + 6];
                
                const r = Math.sqrt(x*x + y*y + z*z);
                const vSq = vx*vx + vy*vy + vz*vz;
                
                const G_M = 4.0 * Math.PI * Math.PI * perStarState.mass_solar;
                let a = 1.0;
                if (G_M > 0 && r > 0) {
                    const invA = 2.0 / r - vSq / G_M;
                    a = invA > 0 ? 1.0 / invA : 9999;
                }

                const p = star.planetarySystem?.bodies[i];
                const bodyType = p ? (p.type === 1 ? 'gas_giant' : p.type === 2 ? 'ice' : p.type === 3 ? 'lava' : p.type === 4 ? 'ocean' : p.type === 5 ? 'desert' : p.type === 6 ? 'jungle' : 'rocky') : (bodyTypeVal === 1 ? 'comet' : 'rocky');

                orbitalStates.push({
                    body_id: `body_${i}`,
                    body_type: bodyType,
                    position_au: { x, y, z },
                    velocity_au_yr: { x: vx, y: vy, z: vz },
                    semi_major_axis_au: a,
                    coma_active: bodyType === 'comet' && r < 3.0,
                    tail_vector: bodyType === 'comet' ? { x: x/r, y: y/r, z: z/r } : null
                });

                let mass = MASS_EARTH;
                let radius = RADIUS_EARTH;
                let albedo: number;

                if (bodyType === 'gas_giant') {
                    mass *= 317; radius *= 11; albedo = 0.5;
                } else if (bodyType === 'ice') {
                    mass *= 15; radius *= 4; albedo = 0.6;
                } else if (bodyType === 'lava') {
                    mass *= 0.8; radius *= 0.9; albedo = 0.1;
                } else if (bodyType === 'desert') {
                    mass *= 0.5; radius *= 0.8; albedo = 0.4;
                } else if (bodyType === 'ocean') {
                    mass *= 1.2; radius *= 1.1; albedo = 0.2;
                } else if (bodyType === 'jungle') {
                    mass *= 1.0; radius *= 1.0; albedo = 0.18;
                } else {
                    mass *= 0.6; radius *= 0.75; albedo = 0.15;
                }

                const habState: AstrobiologyStateData = this.astrobiologyEngine.evaluatePlanet(
                    `${star.physicsId}:body_${i}`, a, mass, radius, albedo, perStarState, deltaTime_yr, bodyType
                );

                habState.sim_time_yr = sim_time_yr;
                astrobiologyStates.push(habState);

                if (habState.civilizationTier > maxK) {
                    maxK = habState.civilizationTier;
                }
            }
        }

        this.engine.highestKardashevTier = maxK;

        // Throttled UI state callback (1Hz)
        if (currentTime - this.lastAnalysisTime > 1000) {
            if (this.onAstrobiologyUpdate) {
                this.onAstrobiologyUpdate(astrobiologyStates);
            }
            this.lastAnalysisTime = currentTime;
        }

        // Update Biosphere & City Light shaders on the star system
        if (star.planetarySystem) {
            star.planetarySystem.updateAstrobiology(astrobiologyStates);
        }

        // Send to websocket if open
        if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
            const outPayload = {
                timestamp_ms: Date.now(),
                stellar: perStarState,
                orbital: orbitalStates,
                astrobiology: astrobiologyStates
            };
            try {
                this.wsClient.send(JSON.stringify({ type: 'state', data: outPayload }));
            } catch {
                // Suppress socket send failure
            }
        }
    }

    public clearHistory(starPhysicsId?: string): void {
        this.astrobiologyEngine.clearHistory(starPhysicsId);
    }

    public dispose(): void {
        this.onAstrobiologyUpdate = null;
        this.onTick = null;
        this.astrobiologyEngine.clearHistory();
    }
}
