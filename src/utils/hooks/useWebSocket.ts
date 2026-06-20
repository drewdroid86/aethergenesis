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

        // Development override: if on port 3000, use 3001 for backend
        if (port === '3000' || !port) {
            port = '3001';
        }

        const wsToken = import.meta.env.VITE_WS_TOKEN || 'default_secret';
        const wsUrl = `${protocol}//${host}${port ? `:${port}` : ''}`;
        let socket: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout>;

        const connect = () => {
            console.log(`Connecting simulation to WebSocket at ${wsUrl} (using subprotocol auth)...`);
            socket = new WebSocket(wsUrl, wsToken);
            wsRef.current = socket;

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'event') {
                        console.log('Received event command from WS:', msg);
                        if (msg.event === 'force_supernova' && selectedStarRef.current) {
                            selectedStarRef.current.t = 0.88;
                            if (engineRef.current) engineRef.current.forceSupernova();
                        } else if (msg.event === 'reset') {
                            window.location.reload();
                        } else if (msg.event === 'advance_1gyr' && selectedStarRef.current) {
                            selectedStarRef.current.currentRealAge += 1000;
                            if (engineRef.current) engineRef.current.advanceTime(1e9);
                        }
                    }
                } catch (err) {
                    console.error('Error handling WebSocket message:', err);
                }
            };

            socket.onclose = () => {
                console.log('Simulation WebSocket closed. Reconnecting in 3s...');
                reconnectTimeout = setTimeout(connect, 3000);
            };

            socket.onerror = (err) => {
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
    }, [engineRef, selectedStarRef]);

    return wsRef;
}
