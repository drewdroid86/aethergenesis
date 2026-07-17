import { Engine } from '../core/engine';
import { AstrobiologyEngine } from './AstrobiologyEngine';
import { computeSpectralClass, StellarPhase } from './StellarPhysics';

export interface SimStatePayload {
    timestamp_ms: number;
    stellar: any;
    orbital: any[];
    astrobiology: any[];
}

// BOLT: Lookup table mapping numerical planetary types to strings in O(1) time
const BODY_TYPE_MAP = ['rocky', 'gas_giant', 'ice', 'lava', 'ocean', 'desert', 'jungle'];

// BOLT: Lookup table of physical constants to eliminate branch-heavy if-else chains
const BODY_TYPE_PROPERTIES: Record<string, { massMul: number; radiusMul: number; albedo: number }> = {
    gas_giant: { massMul: 317, radiusMul: 11, albedo: 0.5 },
    ice: { massMul: 15, radiusMul: 4, albedo: 0.6 },
    lava: { massMul: 0.8, radiusMul: 0.9, albedo: 0.1 },
    desert: { massMul: 0.5, radiusMul: 0.8, albedo: 0.4 },
    ocean: { massMul: 1.2, radiusMul: 1.1, albedo: 0.2 },
    jungle: { massMul: 1.0, radiusMul: 1.0, albedo: 0.18 },
    rocky: { massMul: 0.6, radiusMul: 0.75, albedo: 0.15 },
    comet: { massMul: 0.6, radiusMul: 0.75, albedo: 0.15 }
};

export class SimulationCoordinator {
    private engine: Engine;
    private astrobiologyEngine: AstrobiologyEngine;
    private lastAnalysisTime: number = 0;
    private lastStateSendTime: number = 0;

    // Callbacks for UI updates
    onAstrobiologyUpdate: ((data: any[]) => void) | null = null;
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

    private handleTick(delta: number, appTime: number) {
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
        const orbitalStates: any[] = [];
        const astrobiologyStates: any[] = [];
        let maxK = 0;

        if (buffer) {
            const numBodies = buffer.length / 7;
            const sim_time_yr = this.engine.appTime * 1e6;
            const deltaTime_yr = this.engine.timeScale === 'cosmic' ? delta * 200000000 : delta * 1000;

            const MASS_EARTH = 5.97e24;
            const RADIUS_EARTH = 6371000;
            // BOLT: Hoist loop-invariant Keplerian gravity constant (4 * pi^2 * mass) out of the loop
            const G_M = 39.47841760435743 * perStarState.mass_solar;

            for (let i = 0; i < numBodies; i++) {
                // BOLT: Cache offset multiplication to avoid redundant math
                const offset = i * 7;
                const x = buffer[offset + 0];
                const y = buffer[offset + 1];
                const z = buffer[offset + 2];
                const vx = buffer[offset + 3];
                const vy = buffer[offset + 4];
                const vz = buffer[offset + 5];
                const bodyTypeVal = buffer[offset + 6];
                
                const r = Math.sqrt(x*x + y*y + z*z);
                const vSq = vx*vx + vy*vy + vz*vz;
                
                let a = 1.0;
                if (G_M > 0 && r > 0) {
                    const invA = 2.0 / r - vSq / G_M;
                    a = invA > 0 ? 1.0 / invA : 9999;
                }

                const p = star.planetarySystem?.bodies[i];
                // BOLT: Use static array lookup mapping instead of branch-heavy ternary operators
                const bodyType = p
                    ? (BODY_TYPE_MAP[p.type] || 'rocky')
                    : (bodyTypeVal === 1 ? 'comet' : 'rocky');

                orbitalStates.push({
                    body_id: `body_${i}`,
                    body_type: bodyType,
                    position_au: { x, y, z },
                    velocity_au_yr: { x: vx, y: vy, z: vz },
                    semi_major_axis_au: a,
                    coma_active: bodyType === 'comet' && r < 3.0,
                    tail_vector: bodyType === 'comet' ? { x: x/r, y: y/r, z: z/r } : null
                });

                // BOLT: Use O(1) static properties map to eliminate nested if-else chain branching
                const props = BODY_TYPE_PROPERTIES[bodyType] || BODY_TYPE_PROPERTIES.rocky;
                const mass = MASS_EARTH * props.massMul;
                const radius = RADIUS_EARTH * props.radiusMul;
                const albedo = props.albedo;

                const habState: any = this.astrobiologyEngine.evaluatePlanet(
                    `body_${i}`, a, mass, radius, albedo, perStarState as any, deltaTime_yr, bodyType
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
            this.wsClient.send(JSON.stringify({ type: 'state', data: outPayload }));
        }
    }
}
