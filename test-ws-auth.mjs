
import { WebSocket } from 'ws';

const wsUrl = 'ws://localhost:3001';
const wsToken = 'default_secret';

console.log('Testing connection WITH correct subprotocol and Origin...');
const ws = new WebSocket(wsUrl, wsToken, {
    headers: {
        'Origin': 'http://localhost:3000'
    }
});

ws.on('open', () => {
    console.log('SUCCESS: Connected with valid auth and origin');
    ws.close();
});

ws.on('error', (err) => {
    console.error('FAILED: Connection error:', err.message);
});

ws.on('close', (code, reason) => {
    console.log(`Connection closed: code=${code}, reason=${reason}`);
});

setTimeout(() => {
    console.log('Timeout reached');
    process.exit(0);
}, 5000);
