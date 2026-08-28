import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Initialize the server
const server = new Server(
  {
    name: 'stellar-catalog',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const SIMBAD_BASE_URL = process.env.SIMBAD_BASE_URL || 'https://simbad.u-strasbg.fr/simbad/sim-tap/sync';

/**
 * Security: Sanitizes user input for ADQL queries to prevent injection.
 * Escapes single quotes by doubling them and enforces length limits.
 * Note: Truncates BEFORE escaping to prevent splitting an escape pair.
 */
function sanitizeAdql(input, maxLength = 64) {
  if (typeof input !== 'string') return '';
  const truncated = input.substring(0, maxLength);
  return truncated.replace(/'/g, "''");
}

// Preset library: 10 stars from literature
import { PRESETS, estimateParams } from "../shared/stellarCatalog.mjs";

// Confirmed habitable exoplanet systems
const EXOPLANETS = [
  {
    star_name: "Teegarden's Star",
    star_mass_solar: 0.09,
    star_temperature_K: 2990,
    planet_name: "Teegarden's Star b",
    planet_semi_major_axis_au: 0.0252,
    earth_similarity_index: 0.95,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "Kepler-442",
    star_mass_solar: 0.61,
    star_temperature_K: 4402,
    planet_name: "Kepler-442b",
    planet_semi_major_axis_au: 0.409,
    earth_similarity_index: 0.84,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "TRAPPIST-1",
    star_mass_solar: 0.09,
    star_temperature_K: 2566,
    planet_name: "TRAPPIST-1 e",
    planet_semi_major_axis_au: 0.029,
    earth_similarity_index: 0.95,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "TRAPPIST-1",
    star_mass_solar: 0.09,
    star_temperature_K: 2566,
    planet_name: "TRAPPIST-1 d",
    planet_semi_major_axis_au: 0.022,
    earth_similarity_index: 0.90,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "TRAPPIST-1",
    star_mass_solar: 0.09,
    star_temperature_K: 2566,
    planet_name: "TRAPPIST-1 f",
    planet_semi_major_axis_au: 0.038,
    earth_similarity_index: 0.70,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "Proxima Centauri",
    star_mass_solar: 0.122,
    star_temperature_K: 3042,
    planet_name: "Proxima Centauri b",
    planet_semi_major_axis_au: 0.0485,
    earth_similarity_index: 0.87,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "Luyten's Star",
    star_mass_solar: 0.29,
    star_temperature_K: 3150,
    planet_name: "Luyten b",
    planet_semi_major_axis_au: 0.091,
    earth_similarity_index: 0.91,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "Kepler-186",
    star_mass_solar: 0.54,
    star_temperature_K: 3788,
    planet_name: "Kepler-186f",
    planet_semi_major_axis_au: 0.432,
    earth_similarity_index: 0.61,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  },
  {
    star_name: "Kepler-1649",
    star_mass_solar: 0.22,
    star_temperature_K: 3240,
    planet_name: "Kepler-1649c",
    planet_semi_major_axis_au: 0.083,
    earth_similarity_index: 0.92,
    in_habitable_zone: true,
    source: "NASA Exoplanet Archive"
  }
];




/**
 * Estimates stellar physical properties based on spectral class.
 */




/**
 * Security: Strict numeric validation helper.
 */
const isValidNumber = (v) => typeof v === 'number' && !isNaN(v) && isFinite(v);

/**
 * Executes a TAP query on SIMBAD with a 5s timeout.
 */
async function querySimbad(adql) {
  const url = `${SIMBAD_BASE_URL}?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=${encodeURIComponent(adql)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.status !== 200) {
      throw new Error(`SIMBAD TAP returned status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('SIMBAD TAP Error:', err.message);
    throw err;
  }
}

/**
 * Searches local presets library.
 */
function findPresetStar(name) {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRESETS.find(p => {
    const pName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanName.includes(pName) || pName.includes(cleanName);
  });
}

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_stars',
        description: 'Query real stars by physical parameters. Queries SIMBAD TAP and falls back to cached presets. Reference: http://simbad.cds.unistra.fr/simbad/sim-tap',
        inputSchema: {
          type: 'object',
          properties: {
            spectral_class: { type: 'string', description: 'Spectral class prefix (e.g. G2, M5, K5)' },
            mass_min_solar: { type: 'number', description: 'Minimum solar mass' },
            mass_max_solar: { type: 'number', description: 'Maximum solar mass' },
            distance_max_ly: { type: 'number', description: 'Maximum distance in light years' },
            limit: { type: 'integer', description: 'Maximum number of stars to return (default 10, max 20)' },
          },
        },
      },
      {
        name: 'get_star_by_name',
        description: 'Returns a full physical profile for a named star. Sourced from verified literature or SIMBAD TAP. Reference: http://simbad.cds.unistra.fr/simbad/sim-tap',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Common name or designation of the star (e.g. Betelgeuse, Vega)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_exoplanet_systems',
        description: 'Returns confirmed habitable zone exoplanetary systems. Reference: NASA Exoplanet Archive',
        inputSchema: {
          type: 'object',
          properties: {
            esi_min: { type: 'number', description: 'Minimum Earth Similarity Index (0.0-1.0, default 0.7)' },
            limit: { type: 'integer', description: 'Maximum number of systems to return' },
          },
        },
      },
      {
        name: 'get_preset_library',
        description: 'Returns the complete AetherGenesis built-in star preset library, hardcoded from verified astrophysics sources.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'get_preset_library') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(PRESETS),
          },
        ],
      };
    }

    if (name === 'get_exoplanet_systems') {
      const esiMin = args.esi_min !== undefined ? args.esi_min : 0.7;
      const limit = args.limit || 10;
      
      const filtered = EXOPLANETS.filter(p => p.earth_similarity_index >= esiMin).slice(0, limit);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(filtered),
          },
        ],
      };
    }

    if (name === 'get_star_by_name') {
      const starName = args.name;
      if (!starName || typeof starName !== 'string') throw new Error('Invalid star name provided');
      
      // 1. Check presets first
      const preset = findPresetStar(starName);
      if (preset) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...preset,
                source: 'Literature Preset',
              }),
            },
          ],
        };
      }

      // 2. Query SIMBAD TAP
      try {
        // Security: Sanitize only for the ADQL query
        const safeName = sanitizeAdql(starName);

        // Query SIMBAD for the star
        const adql = `SELECT TOP 1 main_id, sp_type, plx_value FROM basic WHERE main_id = '${safeName}' OR main_id LIKE '% ${safeName}'`;
        const data = await querySimbad(adql);
        
        if (data && data.data && data.data.length > 0) {
          const row = data.data[0];
          const mainId = row[0].trim();
          const spType = row[1] || 'G2V';
          const plx = parseFloat(row[2]) || 0;
          
          const distance_ly = plx > 0 ? Number((3261.56 / plx).toFixed(2)) : null;
          const params = estimateParams(spType);
          
          // Calculate Kopparapu habitable zone bounds
          const innerHz = Number(Math.sqrt(params.luminosity_solar / 1.1).toFixed(2));
          const outerHz = Number(Math.sqrt(params.luminosity_solar / 0.53).toFixed(2));
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  name: mainId,
                  hip_id: null,
                  spectral_class: spType,
                  ...params,
                  distance_ly,
                  age_gyr: null,
                  known_planets: 0,
                  habitable_zone_inner_au: innerHz,
                  habitable_zone_outer_au: outerHz,
                  chandrasekhar_relevant: params.mass_solar > 0.8,
                  literature_reference: 'Simbad Database & Observational Catalog',
                  source: 'SIMBAD',
                }),
              },
            ],
          };
        }
      } catch (err) {
        console.error(`get_star_by_name query failed for "${starName}": ${err.message}`);
      }

      // Explicit 404 if not found in presets or SIMBAD
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Star "${starName}" not found in presets or SIMBAD catalog.`,
              code: 404,
            }),
          },
        ],
      };
    }

    if (name === 'search_stars') {
      const spClass = sanitizeAdql(args.spectral_class);

      // Security: Validate numeric inputs
      const isValidNum = (v) => typeof v === 'number' && !isNaN(v) && isFinite(v);
      const massMin = isValidNum(args.mass_min_solar) ? args.mass_min_solar : undefined;
      const massMax = isValidNum(args.mass_max_solar) ? args.mass_max_solar : undefined;
      const distMax = isValidNum(args.distance_max_ly) ? args.distance_max_ly : undefined;
      const limit = Math.min(20, (isValidNum(args.limit) && args.limit > 0) ? args.limit : 10);

      // Try SIMBAD TAP
      try {
        let filters = ["sp_type IS NOT NULL", "plx_value IS NOT NULL", "plx_value > 0"];
        if (spClass) {
          filters.push(`sp_type LIKE '${spClass}%'`);
        }
        // Security: Strict validation for numeric distance parameter
        if (isValidNumber(distMax) && distMax > 0) {
          // plx in mas = 3261.56 / distance_ly
          const plxMin = 3261.56 / distMax;
          filters.push(`plx_value >= ${plxMin}`);
        }

        const adql = `SELECT TOP 50 main_id, sp_type, plx_value FROM basic WHERE ${filters.join(' AND ')}`;
        const data = await querySimbad(adql);

        if (data && data.data && Array.isArray(data.data)) {
          const results = [];
          for (const row of data.data) {
            const mainId = row[0].trim();
            const spType = row[1];
            const plx = parseFloat(row[2]);

            const distance_ly = Number((3261.56 / plx).toFixed(2));
            const params = estimateParams(spType);

            // Mass filters
            if (isValidNumber(massMin) && params.mass_solar < massMin) continue;
            if (isValidNumber(massMax) && params.mass_solar > massMax) continue;

            results.push({
              name: mainId,
              hip_id: null,
              spectral_class: spType,
              ...params,
              distance_ly,
              source: 'SIMBAD',
            });

            if (results.length >= limit) break;
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results),
              },
            ],
          };
        }
      } catch {
        console.error('search_stars failed. Falling back to local presets.');
      }

      // Fallback to local presets
      let results = PRESETS.map(p => ({
        name: p.name,
        hip_id: null,
        spectral_class: p.spectral_class,
        mass_solar: p.mass_solar,
        luminosity_solar: p.luminosity_solar,
        temperature_K: p.temperature_K,
        radius_solar: p.radius_solar,
        distance_ly: p.distance_ly,
        metallicity_Z: p.metallicity_Z,
        source: 'cached_preset',
      }));

      if (spClass) {
        results = results.filter(r => r.spectral_class.toUpperCase().startsWith(spClass.toUpperCase()));
      }
      if (isValidNumber(massMin)) {
        results = results.filter(r => r.mass_solar >= massMin);
      }
      if (isValidNumber(massMax)) {
        results = results.filter(r => r.mass_solar <= massMax);
      }
      if (isValidNumber(distMax)) {
        results = results.filter(r => r.distance_ly <= distMax);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results.slice(0, limit)),
          },
        ],
      };
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
console.error('Stellar Catalog MCP Server running on stdio');
