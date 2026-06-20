import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';

// Initialize the server
const server = new Server(
  {
    name: 'aethergenesis-sim',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const SIM_PORT = process.env.SIM_PORT || '3001';
const SIM_HOST = process.env.SIM_HOST || 'localhost';
const WS_TOKEN = process.env.WS_TOKEN || 'default_secret';
const wsUrl = `ws://${SIM_HOST}:${SIM_PORT}`;

let latestState = null;
let phaseHistory = [];
let lastPhase = null;
let lastPhaseStartTime = null;

let ws = null;
let reconnectDelay = 1000;

function connectWebSocket() {
  console.error(`Connecting to Simulation WebSocket at ${wsUrl} (using subprotocol auth)...`);
  ws = new WebSocket(wsUrl, WS_TOKEN);

  ws.on('open', () => {
    console.error('Connected to Simulation WebSocket');
    reconnectDelay = 1000; // Reset delay
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'state') {
        latestState = msg.data;
        
        // Track phase transitions automatically
        if (latestState && latestState.stellar) {
          const currentPhase = latestState.stellar.phase;
          const currentAge = latestState.stellar.age_yr || 0;
          
          if (lastPhase !== null && lastPhase !== currentPhase) {
            const duration = lastPhaseStartTime !== null ? (currentAge - lastPhaseStartTime) : null;
            phaseHistory.push({
              phase: currentPhase,
              triggered_at_yr: currentAge,
              trigger_condition: 'Stellar evolution threshold reached',
              duration_yr: duration,
              sim_time_yr: latestState.stellar.sim_time_yr || 0
            });
            lastPhaseStartTime = currentAge;
          } else if (lastPhase === null) {
            lastPhaseStartTime = currentAge;
          }
          lastPhase = currentPhase;
        }
      }
    } catch (err) {
      console.error('Error parsing WS message:', err.message);
    }
  });

  ws.on('close', () => {
    console.error(`WebSocket closed. Reconnecting in ${reconnectDelay}ms...`);
    setTimeout(() => {
      reconnectDelay = Math.min(30000, reconnectDelay * 2);
      connectWebSocket();
    }, reconnectDelay);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

// Start WebSocket connection
connectWebSocket();

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_stellar_state',
        description: 'Get the live authoritative physics state of the hero star in the simulation.',
        inputSchema: {
          type: 'object',
          properties: {
            star_id: { type: 'string', description: 'ID of the star to query (default: hero_star)' },
          },
        },
      },
      {
        name: 'get_habitability_scores',
        description: 'Get the live AstrobiologyEngine habitability scores for all planets in the system.',
        inputSchema: {
          type: 'object',
          properties: {
            planet_id: { type: 'string', description: 'Specific planet ID, or "all" to get all planets' },
          },
        },
      },
      {
        name: 'get_phase_history',
        description: 'Get the history of all stellar phase transitions recorded during this simulation run.',
        inputSchema: {
          type: 'object',
          properties: {
            star_id: { type: 'string', description: 'Star ID to query' },
          },
        },
      },
      {
        name: 'get_orbital_states',
        description: 'Get the current live positions and velocities of all bodies in the stellar system.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'trigger_simulation_event',
        description: 'Send an event command to the live simulation (disabled by default for safety).',
        inputSchema: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
              enum: ['force_supernova', 'advance_1gyr', 'reset', 'spawn_comet', 'impact_event'],
              description: 'The simulation event to trigger'
            },
            target_id: { type: 'string', description: 'Target body ID (optional)' },
            parameters: { type: 'object', description: 'Additional event parameters' }
          },
          required: ['event'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!latestState) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'No live simulation state available. Make sure the Vite dev server is running and the web page is open.', code: 503 }),
        },
      ],
    };
  }

  try {
    if (name === 'get_stellar_state') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(latestState.stellar),
          },
        ],
      };
    }

    if (name === 'get_habitability_scores') {
      const planetId = args.planet_id || 'all';
      let scores = latestState.astrobiology || [];
      if (planetId !== 'all') {
        scores = scores.filter(p => p.planet_id === planetId);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(scores),
          },
        ],
      };
    }

    if (name === 'get_phase_history') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(phaseHistory),
          },
        ],
      };
    }

    if (name === 'get_orbital_states') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(latestState.orbital || []),
          },
        ],
      };
    }

    if (name === 'trigger_simulation_event') {
      const eventName = args.event;
      const targetId = args.target_id;
      const parameters = args.parameters || {};

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'event',
          event: eventName,
          target_id: targetId,
          parameters: parameters
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Successfully sent event command "${eventName}" to simulation.`,
                new_state_summary: {
                  phase: latestState.stellar.phase,
                  age_yr: latestState.stellar.age_yr,
                  sim_time_yr: latestState.stellar.sim_time_yr
                }
              }),
            },
          ],
        };
      } else {
        throw new Error('WebSocket connection to simulation is not active');
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: error.message, code: 500 }),
        },
      ],
    };
  }
});

// Run server using stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('AetherGenesis Sim State MCP Server running on stdio');
