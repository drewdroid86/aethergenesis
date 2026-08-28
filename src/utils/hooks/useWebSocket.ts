import { useEffect, useRef } from 'react';
import { Engine } from '../../core/engine';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';

interface UseWebSocketProps {
    engineRef: React.MutableRefObject<Engine | null>;
    selectedStarRef: React.MutableRefObject<HeroStarSystem | null>;
}

export function useWebSocket({ engineRef, selectedStarRef }: UseWebSocketProps) {
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        let port = window.location.port;

        // Development override: if running on default Vite dev port 3000, connect to backend at 3001
        if (import.meta.env.DEV && (port === '3000' || !port)) {
            port = '3001';
        }

        const wsToken = import.meta.env.VITE_WS_TOKEN;
        if (!wsToken) {
            console.error('VITE_WS_TOKEN is not set. WebSocket connection will fail.');
            if (import.meta.env.DEV) {
                throw new Error('VITE_WS_TOKEN must be configured in .env for development');
            }
        }
        const wsUrl = `${protocol}//${host}${port ? `:${port}` : ''}`;
        let socket: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let reconnectDelay = 3000;
        const maxReconnectDelay = 60000;

        const connect = () => {
            console.log(`Connecting simulation to WebSocket at ${wsUrl} (using subprotocol auth)...`);
            socket = new WebSocket(wsUrl, wsToken);
            wsRef.current = socket;

            socket.onopen = () => {
                console.log('Simulation WebSocket connected.');
                reconnectDelay = 3000; // Reset backoff delay on connection success
            };

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'event') {
                        console.log('Received event command from WS:', msg);
                        if (msg.event === 'force_supernova') {
                            if (engineRef.current) engineRef.current.forceSupernova();
                        } else if (msg.event === 'reset') {
                            window.location.reload();
                        } else if (msg.event === 'advance_1gyr') {
                            if (engineRef.current) engineRef.current.advanceTime(1e9);
                        }
                    }
                } catch (err) {
                    console.error('Error handling WebSocket message:', err);
                }
            };

            socket.onclose = (event: CloseEvent) => {
                console.error(`[WS Diagnostic] Closed. Code: ${event.code}, Reason: "${event.reason || 'None'}", Clean: ${event.wasClean}, readyState: ${socket?.readyState}. Reconnecting in ${reconnectDelay / 1000}s...`);
                reconnectTimeout = setTimeout(connect, reconnectDelay);
                reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay); // Exponential backoff
            };

            socket.onerror = (event: Event) => {
                console.error(`[WS Diagnostic] Error. Event type: ${event.type}, readyState: ${socket?.readyState}, url: ${socket?.url}`);
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
    }, [engineRef, selectedStarRef]);

    return wsRef;
}
