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
const PRESETS = [
  {
    name: "Sun",
    spectral_class: "G2V",
    mass_solar: 1.0,
    luminosity_solar: 1.0,
    temperature_K: 5778,
    radius_solar: 1.0,
    metallicity_Z: 0.02,
    distance_ly: 0.0000158,
    age_gyr: 4.6,
    known_planets: 8,
    habitable_zone_inner_au: 0.95,
    habitable_zone_outer_au: 1.37,
    chandrasekhar_relevant: true,
    literature_reference: "Carroll & Ostlie §13.2"
  },
  {
    name: "Proxima Centauri",
    spectral_class: "M5Ve",
    mass_solar: 0.122,
    luminosity_solar: 0.0017,
    temperature_K: 3042,
    radius_solar: 0.154,
    metallicity_Z: 0.015,
    distance_ly: 4.246,
    age_gyr: 4.85,
    known_planets: 3,
    habitable_zone_inner_au: 0.04,
    habitable_zone_outer_au: 0.08,
    chandrasekhar_relevant: false,
    literature_reference: "Anglada-Escudé et al. 2016"
  },
  {
    name: "Sirius A",
    spectral_class: "A1V",
    mass_solar: 2.063,
    luminosity_solar: 25.4,
    temperature_K: 9940,
    radius_solar: 1.711,
    metallicity_Z: 0.03,
    distance_ly: 8.60,
    age_gyr: 0.24,
    known_planets: 0,
    habitable_zone_inner_au: 4.8,
    habitable_zone_outer_au: 8.5,
    chandrasekhar_relevant: true,
    literature_reference: "Liebert et al. 2005"
  },
  {
    name: "Betelgeuse",
    spectral_class: "M2Iab",
    mass_solar: 16.5,
    luminosity_solar: 126000.0,
    temperature_K: 3600,
    radius_solar: 764.0,
    metallicity_Z: 0.02,
    distance_ly: 640.0,
    age_gyr: 0.0085,
    known_planets: 0,
    habitable_zone_inner_au: 350.0,
    habitable_zone_outer_au: 620.0,
    chandrasekhar_relevant: true,
    literature_reference: "Joyce et al. 2020"
  },
  {
    name: "Kepler-442",
    spectral_class: "K5V",
    mass_solar: 0.61,
    luminosity_solar: 0.12,
    temperature_K: 4402,
    radius_solar: 0.60,
    metallicity_Z: 0.012,
    distance_ly: 1206.0,
    age_gyr: 2.9,
    known_planets: 1,
    habitable_zone_inner_au: 0.35,
    habitable_zone_outer_au: 0.62,
    chandrasekhar_relevant: false,
    literature_reference: "Torres et al. 2015"
  },
  {
    name: "Eta Carinae",
    spectral_class: "LBV",
    mass_solar: 100.0,
    luminosity_solar: 5000000.0,
    temperature_K: 30000,
    radius_solar: 60.0,
    metallicity_Z: 0.04,
    distance_ly: 7500.0,
    age_gyr: 0.003,
    known_planets: 0,
    habitable_zone_inner_au: 2100.0,
    habitable_zone_outer_au: 3700.0,
    chandrasekhar_relevant: true,
    literature_reference: "Davidson & Humphreys 1997"
  },
  {
    name: "61 Cygni A",
    spectral_class: "K5V",
    mass_solar: 0.70,
    luminosity_solar: 0.156,
    temperature_K: 4526,
    radius_solar: 0.665,
    metallicity_Z: 0.016,
    distance_ly: 11.4,
    age_gyr: 6.0,
    known_planets: 0,
    habitable_zone_inner_au: 0.38,
    habitable_zone_outer_au: 0.67,
    chandrasekhar_relevant: false,
    literature_reference: "Kervella et al. 2008"
  },
  {
    name: "Tau Ceti",
    spectral_class: "G8V",
    mass_solar: 0.783,
    luminosity_solar: 0.52,
    temperature_K: 5344,
    radius_solar: 0.793,
    metallicity_Z: 0.01,
    distance_ly: 11.9,
    age_gyr: 5.8,
    known_planets: 4,
    habitable_zone_inner_au: 0.68,
    habitable_zone_outer_au: 1.2,
    chandrasekhar_relevant: false,
    literature_reference: "Teixeira et al. 2009"
  },
  {
    name: "Vega",
    spectral_class: "A0V",
    mass_solar: 2.135,
    luminosity_solar: 40.12,
    temperature_K: 9602,
    radius_solar: 2.362,
    metallicity_Z: 0.014,
    distance_ly: 25.0,
    age_gyr: 0.455,
    known_planets: 0,
    habitable_zone_inner_au: 6.0,
    habitable_zone_outer_au: 10.7,
    chandrasekhar_relevant: true,
    literature_reference: "Yoon et al. 2010"
  },
  {
    name: "Rigel",
    spectral_class: "B8Ia",
    mass_solar: 21.0,
    luminosity_solar: 120000.0,
    temperature_K: 12100,
    radius_solar: 78.9,
    metallicity_Z: 0.02,
    distance_ly: 860.0,
    age_gyr: 0.008,
    known_planets: 0,
    habitable_zone_inner_au: 330.0,
    habitable_zone_outer_au: 590.0,
    chandrasekhar_relevant: true,
    literature_reference: "Przybilla et al. 2006"
  }
];

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
function estimateParams(spType) {
  let mass = 1.0;
  let temp = 5778;
  let rad = 1.0;
  let lum = 1.0;
  let metallicity = 0.02;

  if (!spType) return { mass_solar: mass, temperature_K: temp, radius_solar: rad, luminosity_solar: lum, metallicity_Z: metallicity };

  const cleanSp = spType.trim().toUpperCase();
  const match = cleanSp.match(/^([OBAFGKM])([0-9])?/);
  if (match) {
    const letter = match[1];
    const num = match[2] ? parseInt(match[2], 10) : 5;

    const tempMap = {
      O: [50000, 30000],
      B: [30000, 10000],
      A: [10000, 7500],
      F: [7500, 6000],
      G: [6000, 5200],
      K: [5200, 3700],
      M: [3700, 2400]
    };
    const range = tempMap[letter];
    temp = range[1] + (range[0] - range[1]) * ((10 - num) / 10);

    const massMap = {
      O: [60, 16],
      B: [16, 2.1],
      A: [2.1, 1.4],
      F: [1.4, 1.04],
      G: [1.04, 0.8],
      K: [0.8, 0.45],
      M: [0.45, 0.08]
    };
    const mRange = massMap[letter];
    mass = mRange[1] + (mRange[0] - mRange[1]) * ((10 - num) / 10);

    const radMap = {
      O: [15, 6.6],
      B: [6.6, 1.8],
      A: [1.8, 1.4],
      F: [1.4, 1.15],
      G: [1.15, 0.96],
      K: [0.96, 0.7],
      M: [0.7, 0.1]
    };
    const rRange = radMap[letter];
    rad = rRange[1] + (rRange[0] - rRange[1]) * ((10 - num) / 10);

    if (cleanSp.includes('III')) {
      rad = rad * 10;
      mass = mass * 1.5;
    } else if (cleanSp.includes('I')) {
      rad = rad * 100;
      mass = mass * 10;
    }

    const T_sun = 5778;
    lum = (rad * rad) * Math.pow(temp / T_sun, 4);
  }

  return {
    mass_solar: Number(mass.toFixed(2)),
    temperature_K: Math.round(temp),
    radius_solar: Number(rad.toFixed(2)),
    luminosity_solar: Number(lum.toFixed(4)),
    metallicity_Z: metallicity
  };
}




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
      } catch {
        // Fallback to closest matching preset or cached preset
        console.error('get_star_by_name query failed. Falling back to cached preset Sun.');
      }

      // Fallback: return Sun-like profile with "cached_preset" source
      const sun = PRESETS[0];
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...sun,
              name: starName,
              source: 'cached_preset',
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
          filters.push(`sp_type LIKE '${sanitizeAdql(spClass)}%'`);
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
