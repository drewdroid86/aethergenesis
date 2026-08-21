import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class McpTestClient {
  private proc: ChildProcessWithoutNullStreams;
  private messageId: number = 1;
  private pendingRequests: Map<number | string, (response: JsonRpcMessage) => void> = new Map();
  private buffer: string = '';

  constructor(serverScript: string) {
    const fullPath = path.resolve(process.cwd(), serverScript);
    this.proc = spawn('node', [fullPath], {
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JsonRpcMessage;
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const resolve = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);
            resolve(msg);
          }
        } catch {
          // Ignore non-json lines
        }
      }
    });

    this.proc.stderr.on('data', () => {
      // Suppress server logs
    });
  }

  async sendRequest(method: string, params: any = {}): Promise<JsonRpcMessage> {
    const id = this.messageId++;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }) + '\n';

    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      this.proc.stdin.write(payload);
    });
  }

  async sendNotification(method: string, params: any = {}): Promise<void> {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    }) + '\n';
    this.proc.stdin.write(payload);
  }

  async init(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-test-runner', version: '1.0.0' }
    });
    await this.sendNotification('notifications/initialized');
  }

  close(): void {
    this.proc.kill('SIGTERM');
  }
}

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

async function runMcpTests() {
  console.log('🚀 Running Model Context Protocol (MCP) Integration Tests...\n');

  // Test 1: Stellar Catalog MCP Server
  console.log('--- Testing stellar-catalog.mjs ---');
  const catalogClient = new McpTestClient('server/mcp/stellar-catalog.mjs');
  await catalogClient.init();

  // Test 1.1: List Tools
  const catalogTools = await catalogClient.sendRequest('tools/list');
  assert(catalogTools.result?.tools?.length >= 3, 'stellar-catalog should expose at least 3 tools');
  console.log('  ✔ tools/list returns tool schemas');

  // Test 1.2: Get Known Preset Star (Sun)
  const sunRes = await catalogClient.sendRequest('tools/call', {
    name: 'get_star_by_name',
    arguments: { name: 'Sun' }
  });
  const sunData = JSON.parse(sunRes.result.content[0].text);
  assert(sunData.name === 'Sun', 'Sun preset should return name "Sun"');
  assert(sunData.mass_solar === 1.0, 'Sun preset mass should be 1.0');
  console.log('  ✔ get_star_by_name("Sun") returns valid profile');

  // Test 1.3: Get Nonexistent Star (Must return 404, not fallback Sun)
  const notFoundRes = await catalogClient.sendRequest('tools/call', {
    name: 'get_star_by_name',
    arguments: { name: 'TotallyFakeStarName9999' }
  });
  const notFoundData = JSON.parse(notFoundRes.result.content[0].text);
  assert(notFoundData.code === 404, 'Unknown star must return code 404');
  assert(notFoundData.error && notFoundData.error.includes('not found'), 'Unknown star must include descriptive error');
  console.log('  ✔ get_star_by_name("TotallyFakeStarName9999") correctly returns 404 Not Found');

  catalogClient.close();

  // Test 2: NASA Horizons MCP Server
  console.log('\n--- Testing nasa-horizons.mjs ---');
  const horizonsClient = new McpTestClient('server/mcp/nasa-horizons.mjs');
  await horizonsClient.init();

  // Test 2.1: List Tools
  const horizonsTools = await horizonsClient.sendRequest('tools/list');
  assert(horizonsTools.result?.tools?.length >= 3, 'nasa-horizons should expose at least 3 tools');
  console.log('  ✔ tools/list returns tool schemas');

  // Test 2.2: Invalid Epoch Date Handling
  const invalidEpochRes = await horizonsClient.sendRequest('tools/call', {
    name: 'get_orbital_elements',
    arguments: { body_id: '1P', epoch: 'invalid-date-string' }
  });
  const invalidEpochData = JSON.parse(invalidEpochRes.result.content[0].text);
  assert(invalidEpochData.code === 500 && invalidEpochData.error.includes('Invalid epoch date'), 'Invalid epoch date must return clean 500 error');
  console.log('  ✔ get_orbital_elements with malformed epoch handled cleanly');

  // Test 2.3: Small Bodies Search Fallback
  const smallBodiesRes = await horizonsClient.sendRequest('tools/call', {
    name: 'search_small_bodies',
    arguments: { type: 'all', limit: 10 }
  });
  const smallBodiesData = JSON.parse(smallBodiesRes.result.content[0].text);
  assert(Array.isArray(smallBodiesData) && smallBodiesData.length > 0, 'search_small_bodies should return array');
  const hasComet = smallBodiesData.some((b: any) => b.type === 'comet');
  const hasAsteroid = smallBodiesData.some((b: any) => b.type === 'asteroid');
  assert(hasComet, 'search_small_bodies with type="all" must include comets');
  assert(hasAsteroid, 'search_small_bodies with type="all" must include asteroids');
  console.log('  ✔ search_small_bodies with type="all" contains both comets and asteroids');

  horizonsClient.close();

  // Test 3: Sim State MCP Server
  console.log('\n--- Testing sim-state.mjs ---');
  const simClient = new McpTestClient('server/mcp/sim-state.mjs');
  await simClient.init();

  // Test 3.1: List Tools
  const simTools = await simClient.sendRequest('tools/list');
  assert(simTools.result?.tools?.length >= 5, 'sim-state should expose at least 5 tools');
  console.log('  ✔ tools/list returns tool schemas');

  // Test 3.2: 503 Guard when no simulation state is available
  const stateRes = await simClient.sendRequest('tools/call', {
    name: 'get_stellar_state'
  });
  const stateData = JSON.parse(stateRes.result.content[0].text);
  assert(stateData.code === 503, 'get_stellar_state without live WebSocket must return 503');
  console.log('  ✔ get_stellar_state returns 503 when live simulation is offline');

  simClient.close();

  console.log('\n🎉 All Model Context Protocol (MCP) Integration Tests Passed Successfully!\n');
}

runMcpTests().catch((err) => {
  console.error('Fatal MCP test runner error:', err);
  process.exit(1);
});
