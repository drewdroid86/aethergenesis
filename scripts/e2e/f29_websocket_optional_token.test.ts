import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveWebSocketToken } from '../../src/utils/hooks/useWebSocket.ts';

test('F29-1: resolveWebSocketToken returns null in production when VITE_WS_TOKEN is missing or blank', () => {
    for (const missing of [undefined, null, '', '   ']) {
        assert.strictEqual(
            resolveWebSocketToken(missing, false),
            null,
            `expected null in production for token=${JSON.stringify(missing)}`
        );
    }
});

test('F29-2: resolveWebSocketToken throws in development when VITE_WS_TOKEN is missing or blank', () => {
    const origError = console.error;
    console.error = () => {};
    try {
        for (const missing of [undefined, null, '', '   ']) {
            assert.throws(
                () => resolveWebSocketToken(missing, true),
                /VITE_WS_TOKEN must be configured in \.env for development/,
                `expected dev error for token=${JSON.stringify(missing)}`
            );
        }
    } finally {
        console.error = origError;
    }
});

test('F29-3: resolveWebSocketToken returns trimmed token when configured', () => {
    assert.strictEqual(resolveWebSocketToken('secret_token', false), 'secret_token');
    assert.strictEqual(resolveWebSocketToken('  secret_token  ', true), 'secret_token');
});

test('F29-4: useWebSocket returns early before connect() when wsToken is null', () => {
    const src = fs.readFileSync('src/utils/hooks/useWebSocket.ts', 'utf8');
    const tokenIdx = src.indexOf('const wsToken = resolveWebSocketToken(');
    const guardIdx = src.indexOf('if (!wsToken) {');
    const connectIdx = src.indexOf('const connect = () => {');
    assert.ok(tokenIdx !== -1, 'useWebSocket must resolve wsToken via resolveWebSocketToken');
    assert.ok(guardIdx > tokenIdx && guardIdx < connectIdx, 'null token guard must precede connect() definition');
    const guardBlock = src.slice(guardIdx, connectIdx);
    assert.ok(guardBlock.includes('wsRef.current = null;'), 'guard must keep wsRef.current null');
    assert.ok(guardBlock.includes('return;'), 'guard must return early before new WebSocket is called');
});
