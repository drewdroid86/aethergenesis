import { useEffect, useRef, useState, useCallback } from 'react';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { AstrobiologyEngine, HabitabilityState } from '../../simulation/AstrobiologyEngine';

export function useWebSocketSync(
    engineRef: React.MutableRefObject<Engine | null>,
    selectedStarRef: React.MutableRefObject<HeroStarSystem | null>,
    nbodyBufferRef: React.MutableRefObject<Float32Array | null>,
    timeScaleRef: React.MutableRefObject<'cosmic' | 'realtime'>
) {
    const wsRef = useRef<WebSocket | null>(null);
    const astrobiologyEngineRef = useRef<AstrobiologyEngine | null>(null);
    const [astrobiologyData, setAstrobiologyData] = useState<HabitabilityState[]>([]);
    const lastStateSendTimeRef = useRef(0);
    const lastAnalysisTimeRef = useRef(0);

    useEffect(() => {
        const wsHost = window.location.hostname || 'localhost';
        const wsPort = '3001';
        const wsUrl = `ws://${wsHost}:${wsPort}`;
        let socket: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 10;

        const connect = () => {
            console.log(`Connecting simulation to WebSocket at ${wsUrl}...`);
            socket = new WebSocket(wsUrl);
            wsRef.current = socket;
            
            socket.onopen = () => {
                reconnectAttempts = 0;
            };

            socket.onmessage = (event: MessageEvent) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'event') {
                        console.log('Received event command from WS:', msg);
                        if (msg.event === 'force_supernova' && selectedStarRef.current) {
                            selectedStarRef.current.t = 0.88;
                        } else if (msg.event === 'reset') {
                            window.location.reload();
                        } else if (msg.event === 'advance_1gyr' && selectedStarRef.current) {
                            selectedStarRef.current.currentRealAge += 1000;
                        }
                    }
                } catch (err) {
                    console.error('Error handling WebSocket message:', err);
                }
            };

            socket.onclose = () => {
                if (reconnectAttempts < maxReconnectAttempts) {
                    const backoff = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
                    console.log(`Simulation WebSocket closed. Reconnecting in ${backoff}ms...`);
                    reconnectTimeout = setTimeout(connect, backoff);
                    reconnectAttempts++;
                } else {
                    console.error('Simulation WebSocket max reconnect attempts reached.');
                }
            };

            socket.onerror = (err: Event) => {
                console.error('Simulation WebSocket error:', err);
            };
        };

        connect();

        return () => {
            if (socket) {
                socket.onclose = null;
                socket.close();
            }
            clearTimeout(reconnectTimeout);
        };
    }, [selectedStarRef]);

    const sendSimulationState = useCallback((currentTime: number, delta: number) => {
        if (currentTime - lastStateSendTimeRef.current <= 200) return;
        
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || !engineRef.current) return;

        const engine = engineRef.current;
        const star = selectedStarRef.current || engine.heroStars[0];
        if (!star) return;

        const realStellarState = engine.stellarState;

        // Extract planetary system orbital state
        const orbitalStates: any[] = [];
        const buffer = nbodyBufferRef.current;
        if (buffer) {
            const numBodies = buffer.length / 7;
            const G_M = 4.0 * Math.PI * Math.PI * realStellarState.mass_solar;
            for (let i = 0; i < numBodies; i++) {
                const x = buffer[i * 7 + 0];
                const y = buffer[i * 7 + 1];
                const z = buffer[i * 7 + 2];
                const vx = buffer[i * 7 + 3];
                const vy = buffer[i * 7 + 4];
                const vz = buffer[i * 7 + 5];
                const typeNum = buffer[i * 7 + 6];
                
                const r = Math.sqrt(x*x + y*y + z*z);
                const vSq = vx*vx + vy*vy + vz*vz;
                
                let a = 1.0;
                if (G_M > 0 && r > 0) {
                    const invA = 2.0 / r - vSq / G_M;
                    a = invA > 0 ? 1.0 / invA : 9999;
                }

                const p = star.planetarySystem?.bodies[i];
                const bodyType = p ? (p.type === 1 ? 'gas_giant' : p.type === 2 ? 'ice' : p.type === 3 ? 'lava' : p.type === 4 ? 'ocean' : p.type === 5 ? 'desert' : p.type === 6 ? 'jungle' : 'rocky') : 'rocky';

                orbitalStates.push({
                    body_id: `body_${i}`,
                    body_type: bodyType,
                    position_au: { x, y, z },
                    velocity_au_yr: { vx, vy, vz },
                    semi_major_axis_au: a,
                    hz_status: a < 10 ? 'inside' : a > 25 ? 'outside' : 'in_zone',
                    coma_active: typeNum === 1 && r < 3.0,
                    tail_vector: typeNum === 1 && r < 2.5 ? { x, y, z } : null,
                    sim_time_yr: engine.appTime * 1e6
                });
            }
        }
        
        // Assemble astrobiology states using the AstrobiologyEngine
        if (!astrobiologyEngineRef.current) {
            astrobiologyEngineRef.current = new AstrobiologyEngine();
        }
        
        const astrobiologyStates: HabitabilityState[] = [];
        const deltaTime_yr = timeScaleRef.current === 'cosmic' ? delta * 200000000 : delta / 31557600;
        
        for (let i = 0; i < orbitalStates.length; i++) {
            const o = orbitalStates[i];
            
            // Estimate physical properties based on body type
            const mass_earth = 5.97e24;
            const r_earth = 6371000;
            let mass = mass_earth;
            let radius = r_earth;
            let albedo = 0.3;
            
            if (o.body_type === 'gas_giant') {
                mass *= 317;
                radius *= 11;
                albedo = 0.5;
            } else if (o.body_type === 'ice') {
                mass *= 15;
                radius *= 4;
                albedo = 0.6;
            } else if (o.body_type === 'lava') {
                mass *= 0.8;
                radius *= 0.9;
                albedo = 0.1;
            } else if (o.body_type === 'desert') {
                mass *= 0.5;
                radius *= 0.8;
                albedo = 0.4;
            }
            
            const habState = astrobiologyEngineRef.current.evaluatePlanet(
                o.body_id,
                o.semi_major_axis_au,
                mass,
                radius,
                albedo,
                realStellarState,
                deltaTime_yr
            );
            
            // Make sure sim_time_yr is included
            astrobiologyStates.push({
                ...habState,
                sim_time_yr: engine.appTime * 1e6
            } as HabitabilityState);
        }

        const maxK = astrobiologyStates.reduce((max, s) => Math.max(max, s.civilizationTier), 0);
        engine.highestKardashevTier = maxK;

        // Avoid rapid React state updates by throttling UI state to 1Hz
        if (currentTime - lastAnalysisTimeRef.current > 1000) {
            setAstrobiologyData(astrobiologyStates);
            lastAnalysisTimeRef.current = currentTime;
        }
        
        // Update Biosphere & City Light shaders
        if (star.planetarySystem) {
            star.planetarySystem.updateAstrobiology(astrobiologyStates);
        }

        const statePayload = {
            type: 'state',
            data: {
                timestamp_ms: Date.now(),
                stellar: {
                    ...realStellarState,
                    sim_time_yr: engine.appTime * 1e6
                },
                orbital: orbitalStates,
                astrobiology: astrobiologyStates
            }
        };
        socket.send(JSON.stringify(statePayload));
        lastStateSendTimeRef.current = currentTime;
    }, [engineRef, selectedStarRef, nbodyBufferRef, timeScaleRef]);

    return {
        sendSimulationState,
        astrobiologyData
    };
}
