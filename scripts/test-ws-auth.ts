import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { initWebSocketServer, closeWebSocketServer } from '../src/simulation/SimStateSocket';

process.env.WS_TOKEN = 'public_test_token';
process.env.WS_CONTROL_TOKEN = 'private_test_token';
process.env.NODE_ENV = 'production';
const server = http.createServer();
initWebSocketServer(server, ['http://localhost:3000']);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address !== 'string');
const url = `ws://127.0.0.1:${address.port}`;
const browser = new WebSocket(url, 'public_test_token', { origin: 'http://localhost:3000' });
const controller = new WebSocket(url, 'private_test_token');
await Promise.all([once(browser, 'open'), once(controller, 'open')]);
const received: string[] = [];
const controllerReceived: string[] = [];
browser.on('message', data => received.push(data.toString()));
controller.on('message', data => controllerReceived.push(data.toString()));
browser.send(JSON.stringify({ type: 'event', event: 'reset' }));
controller.send(JSON.stringify({ type: 'event', event: 'advance_1gyr' }));
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('control event not delivered')), 2000);
  browser.on('message', () => { clearTimeout(timeout); resolve(); });
});
assert.deepEqual(received.map(value => JSON.parse(value).event), ['advance_1gyr']);
assert.deepEqual(controllerReceived, []);
const mcp = spawn(process.execPath, ['server/mcp/sim-state.mjs'], {
  env: { ...process.env, SIM_HOST: '127.0.0.1', SIM_PORT: String(address.port) },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const lines = readline.createInterface({ input: mcp.stdout });
const connected = new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('MCP WebSocket connection timed out')), 5000);
  mcp.on('exit', code => { clearTimeout(timeout); reject(new Error(`MCP server exited: ${code}`)); });
  mcp.stderr.on('data', data => {
    if (data.toString().includes('Connected to Simulation WebSocket')) { clearTimeout(timeout); resolve(); }
  });
});
const pending = new Map<number, (value: any) => void>();
lines.on('line', line => {
  const message = JSON.parse(line);
  if (typeof message.id === 'number') pending.get(message.id)?.(message);
});
function request(id: number, method: string, params: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), 5000);
    pending.set(id, value => { clearTimeout(timeout); pending.delete(id); resolve(value); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
await request(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
await connected;
const eventReceived = Promise.race([once(browser, 'message'), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('MCP event timed out')), 5000))]);
const result = await request(2, 'tools/call', { name: 'trigger_simulation_event', arguments: { event: 'reset' } });
assert.equal(JSON.parse(result.result.content[0].text).success, true);
const [event] = await eventReceived;
assert.equal(JSON.parse(event.toString()).event, 'reset');
mcp.kill();
const rejected = new WebSocket(url, 'public_test_token');
const [, response] = await once(rejected, 'unexpected-response');
assert.equal((response as http.IncomingMessage).statusCode, 401);
rejected.on('error', () => {});
rejected.terminate();
browser.close();
controller.close();
await closeWebSocketServer();
await new Promise<void>(resolve => server.close(() => resolve()));
console.log('WebSocket control authorization passed');
