import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';

export interface StellarState {
    id: string;
    initialMass_solar: number;
    metallicity_Z: number;
    age_yr: number;
    mass_solar: number;
    luminosity_solar: number;
    radius_solar: number;
    temperature_K: number;
    phase: string;
    spectralClass: string;
    absoluteMagnitude: number;
    hrPosition: { logT: number; logL: number };
    remnantType?: string;
    schwarzschildRadius_km?: number;
    sim_time_yr: number;
}

export interface OrbitalState {
    body_id: string;
    body_type: string;
    position_au: { x: number; y: number; z: number };
    velocity_au_yr: { vx: number; vy: number; vz: number };
    semi_major_axis_au: number;
    hz_status: 'inside' | 'outside' | 'in_zone';
    coma_active: boolean;
    tail_vector: { x: number; y: number; z: number } | null;
    sim_time_yr: number;
}

export interface AstrobiologyState {
    planet_id: string;
    orbitalScore: number;
    thermalScore: number;
    atmosphereScore: number;
    stellarActivityScore: number;
    ageScore: number;
    compositeScore: number;
    isInHabitableZone: boolean;
    hasLiquidWater: boolean;
    extinctionRiskLevel: string;
    sim_time_yr: number;
}

export interface SimBroadcast {
    timestamp_ms: number;
    stellar: StellarState;
    orbital: OrbitalState[];
    astrobiology: AstrobiologyState[];
}

export interface SimEvent {
    event: string;
    target_id?: string;
    parameters?: Record<string, unknown>;
}

const handlers: ((event: SimEvent) => void)[] = [];
const clients = new Set<WebSocket>();
let wss: WebSocketServer | null = null;

export function registerEventHandler(handler: (event: SimEvent) => void): void {
    handlers.push(handler);
}

export function broadcastSimState(state: SimBroadcast): void {
    if (!wss) return;
    try {
        const payload = JSON.stringify({ type: 'state', data: state });
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(payload);
                } catch (err) {
                    // Suppressed per rules
                }
            }
        }
    } catch (err) {
        // Suppressed JSON stringify/parse errors per rules
    }
}

export function initWebSocketServer(server: http.Server, allowedOrigins: string[] = []): void {
    // Security: Limit payload size and validate origin to prevent DoS and CSWH
    // Note: maxPayload increased to 100KB to support detailed simulation state broadcasts
    wss = new WebSocketServer({
        server,
        maxPayload: 102400, // 100KB
        verifyClient: (info: { origin: string }) => {
            const origin = info.origin;
            // Allow connection if it's not from a browser (no origin) or if origin is authorized.
            // Development origins (localhost) are typically included in allowedOrigins.
            const isAllowed = !origin || allowedOrigins.includes(origin);
            if (!isAllowed) console.warn(`Blocked WebSocket connection from unauthorized origin: ${origin}`);
            return isAllowed;
        }
    });
    
    wss.on('connection', (ws: WebSocket) => {
        clients.add(ws);
        
        ws.on('message', (message: string) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'state') {
                    // Forward simulation state to all other clients (specifically MCP servers)
                    broadcastSimState(data.data);
                } else if (data.type === 'event' || data.event) {
                    // Dispatch incoming event to handlers
                    const simEvent: SimEvent = {
                        event: data.event || data.data?.event,
                        target_id: data.target_id || data.data?.target_id,
                        parameters: data.parameters || data.data?.parameters
                    };
                    
                    // Trigger registered local handlers
                    handlers.forEach(handler => {
                        try {
                            handler(simEvent);
                        } catch (e) {
                            // Suppressed
                        }
                    });
                    
                    // Broadcast event to all other clients (specifically frontend browser)
                    const eventPayload = JSON.stringify({ type: 'event', ...simEvent });
                    for (const client of clients) {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            try {
                                client.send(eventPayload);
                            } catch (err) {
                                // Suppressed
                            }
                        }
                    }
                }
            } catch (err) {
                // Suppressed JSON stringify/parse errors per rules
            }
        });
        
        ws.on('close', () => {
            clients.delete(ws);
        });
        
        ws.on('error', () => {
            clients.delete(ws);
        });
    });
}
