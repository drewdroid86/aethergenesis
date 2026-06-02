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

// Security: Max concurrent WebSocket clients to prevent resource exhaustion
const MAX_CLIENTS = 100;

// Security: Per-client rate limiting to prevent message flooding
interface ClientMetadata {
    messageCount: number;
    windowStart: number;
}
const clientMetadataMap = new Map<WebSocket, ClientMetadata>();
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const MAX_MESSAGES_PER_WINDOW = 100;

export function registerEventHandler(handler: (event: SimEvent) => void): void {
    handlers.push(handler);
}

export function broadcastSimState(state: SimBroadcast, exclude?: WebSocket): void {
    if (!wss) return;
    try {
        const payload = JSON.stringify({ type: 'state', data: state });
        for (const client of clients) {
            if (client !== exclude && client.readyState === WebSocket.OPEN) {
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

export function initWebSocketServer(server: http.Server, allowedOrigins: string[]): void {
    wss = new WebSocketServer({
        server,
        maxPayload: 102400 // Security: 100KB limit to prevent DoS
    });
    
    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        // Security: Origin validation to prevent CSWH
        const origin = req.headers.origin;
        if (!origin || !allowedOrigins.includes(origin)) {
            ws.close(1008, 'Forbidden: Unauthorized origin');
            return;
        }

        // Security: Limit concurrent connections
        if (clients.size >= MAX_CLIENTS) {
            ws.close(1013, 'Server overloaded: Too many connections');
            return;
        }

        clients.add(ws);
        
        ws.on('message', (message: string) => {
            // Security: Per-client rate limiting
            const now = Date.now();
            const metadata = clientMetadataMap.get(ws) || { messageCount: 0, windowStart: now };

            if (now - metadata.windowStart > RATE_LIMIT_WINDOW_MS) {
                metadata.messageCount = 0;
                metadata.windowStart = now;
            }

            if (metadata.messageCount >= MAX_MESSAGES_PER_WINDOW) {
                return; // Silently drop abusive messages
            }
            metadata.messageCount++;
            clientMetadataMap.set(ws, metadata);

            try {
                const data = JSON.parse(message);
                if (data.type === 'state') {
                    // Forward simulation state to all other clients (specifically MCP servers)
                    broadcastSimState(data.data, ws);
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
            clientMetadataMap.delete(ws);
        });
        
        ws.on('error', () => {
            clients.delete(ws);
            clientMetadataMap.delete(ws);
        });
    });
}
