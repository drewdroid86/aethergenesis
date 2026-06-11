import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { StellarState as CoreStellarState } from './StellarPhysics';

export interface StellarState extends Omit<CoreStellarState, 'phase' | 'spectralClass' | 'remnantType'> {
    phase: string;
    spectralClass: string;
    remnantType?: string;
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

// Security: Strict event whitelist to prevent arbitrary command injection
const ALLOWED_EVENTS = ['force_supernova', 'advance_1gyr', 'reset', 'spawn_comet', 'impact_event'];

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

export function unregisterEventHandler(handler: (event: SimEvent) => void): void {
    const index = handlers.indexOf(handler);
    if (index > -1) {
        handlers.splice(index, 1);
    }
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

        // Security: Token authentication
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        const expectedToken = process.env.WS_TOKEN || 'default_secret';

        // Security: Reject insecure 'default_secret' in production
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction && expectedToken === 'default_secret') {
            ws.close(1008, 'Forbidden: WS_TOKEN must be configured in production');
            return;
        }

        if (token !== expectedToken) {
            ws.close(1008, 'Forbidden: Invalid token');
            return;
        }

        // Security: Limit concurrent connections
        if (clients.size >= MAX_CLIENTS) {
            ws.close(1013, 'Server overloaded: Too many connections');
            return;
        }

        clients.add(ws);
        
        ws.on('message', (message: string | Buffer | ArrayBuffer | Buffer[]) => {
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
                let raw: string;
                if (typeof message === 'string') {
                    raw = message;
                } else if (Array.isArray(message)) {
                    raw = Buffer.concat(message).toString('utf-8');
                } else if (message instanceof Buffer) {
                    raw = message.toString('utf-8');
                } else {
                    raw = Buffer.from(message as ArrayBuffer).toString('utf-8');
                }
                const data = JSON.parse(raw);

                // Security: Defensive parsing and structure validation
                if (!data || typeof data !== 'object') return;

                if (data.type === 'state') {
                    // Forward simulation state to all other clients (specifically MCP servers)
                    broadcastSimState(data.data, ws);
                } else if (data.type === 'event' || data.event) {
                    const eventName = data.event || data.data?.event;

                    // Security: Whitelist validation to prevent arbitrary event injection
                    if (typeof eventName !== 'string' || !ALLOWED_EVENTS.includes(eventName)) {
                        return;
                    }

                    const target_id = data.target_id || data.data?.target_id;
                    const parameters = data.parameters || data.data?.parameters;

                    // Security: Type validation for event parameters
                    if (target_id !== undefined && typeof target_id !== 'string') return;
                    if (parameters !== undefined && (typeof parameters !== 'object' || parameters === null)) return;

                    // Dispatch incoming event to handlers
                    const simEvent: SimEvent = {
                        event: eventName,
                        target_id: target_id as string | undefined,
                        parameters: parameters as Record<string, unknown> | undefined
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
