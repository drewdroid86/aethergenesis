import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Initialize the server
const server = new Server(
  {
    name: 'nasa-horizons',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const HORIZONS_BASE_URL = process.env.HORIZONS_BASE_URL || 'https://ssd.jpl.nasa.gov/api/horizons.api';

/**
 * Security: Fetch wrapper with timeout to prevent resource exhaustion.
 */
async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Helper to fetch from Horizons, with automatic disambiguation for comets/asteroids index lists.
 */
async function fetchHorizons(url, bodyId) {
  const response = await fetchWithTimeout(url);
  if (response.status !== 200) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `JPL Horizons returned status ${response.status}`);
  }
  
  const data = await response.json();
  if (data.error || !data.result) {
    throw new Error(data.error || 'No result returned from Horizons API');
  }

  // If result is search list (no $$SOE markers)
  if (!data.result.includes('$$SOE')) {
    const lines = data.result.split('\n');
    const recordNumbers = [];
    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(-?\d+)\s+/);
      if (match) {
        recordNumbers.push(match[1]);
      }
    }

    if (recordNumbers.length > 0) {
      // Pick the last record (usually the most recent apparition or primary solution)
      const bestRecord = recordNumbers[recordNumbers.length - 1];
      console.error(`Ambiguous body_id "${bodyId}". Selected record "${bestRecord}" from search results.`);
      console.error(`Original URL: ${url}`);
      
      const urlObj = new URL(url);
      urlObj.searchParams.set('COMMAND', `'${bestRecord};'`);
      const newUrl = urlObj.toString();
      
      console.error(`Retry URL: ${newUrl}`);

      const retryResponse = await fetchWithTimeout(newUrl);
      if (retryResponse.status !== 200) {
        throw new Error(`JPL Horizons returned status ${retryResponse.status} on retry`);
      }
      const retryData = await retryResponse.json();
      if (retryData.error || !retryData.result) {
        throw new Error(retryData.error || 'No result returned after selecting unique record');
      }
      return { resultText: retryData.result, finalUrl: newUrl };
    } else {
      throw new Error('Ambiguous body_id and could not parse record numbers from search list');
    }
  }

  return { resultText: data.result, finalUrl: url };
}

/**
 * Parses plain-text elements block from JPL Horizons response.
 */
function parseOrbitalElements(text) {
  const soeIdx = text.indexOf('$$SOE');
  const eoeIdx = text.indexOf('$$EOE');
  if (soeIdx === -1 || eoeIdx === -1) {
    throw new Error('Could not find $$SOE or $$EOE markers in Horizons response');
  }
  const dataBlock = text.substring(soeIdx + 5, eoeIdx).trim();

  // Parse elements using word boundaries to prevent suffix collisions (e.g. TA vs A)
  const ecMatch = dataBlock.match(/\bEC\s*=\s*([0-9E.+-]+)/i);
  const qrMatch = dataBlock.match(/\bQR\s*=\s*([0-9E.+-]+)/i);
  const inMatch = dataBlock.match(/\bIN\s*=\s*([0-9E.+-]+)/i);
  const omMatch = dataBlock.match(/\bOM\s*=\s*([0-9E.+-]+)/i);
  const wMatch = dataBlock.match(/\bW\s*=\s*([0-9E.+-]+)/i);
  const maMatch = dataBlock.match(/\bMA\s*=\s*([0-9E.+-]+)/i);
  const aMatch = dataBlock.match(/\bA\s*=\s*([0-9E.+-]+)/i);
  const adMatch = dataBlock.match(/\bAD\s*=\s*([0-9E.+-]+)/i);
  const prMatch = dataBlock.match(/\bPR\s*=\s*([0-9E.+-]+)/i);

  const eccentricity = ecMatch ? parseFloat(ecMatch[1]) : 0;
  let perihelion_au = qrMatch ? parseFloat(qrMatch[1]) : 0;
  const inclination_deg = inMatch ? parseFloat(inMatch[1]) : 0;
  const longitude_ascending_node_deg = omMatch ? parseFloat(omMatch[1]) : 0;
  const argument_perihelion_deg = wMatch ? parseFloat(wMatch[1]) : 0;
  const mean_anomaly_deg = maMatch ? parseFloat(maMatch[1]) : 0;

  let semi_major_axis_au = aMatch ? parseFloat(aMatch[1]) : 0;
  if (!semi_major_axis_au && eccentricity < 1) {
    semi_major_axis_au = perihelion_au / (1 - eccentricity);
  }

  let aphelion_au = adMatch ? parseFloat(adMatch[1]) : 0;
  if (!aphelion_au && eccentricity < 1) {
    aphelion_au = semi_major_axis_au * (1 + eccentricity);
  }

  // Detect and convert from kilometers if values are extremely large (common for comets in ELEMENTS mode)
  if (perihelion_au > 1000) {
    const kmToAu = 149597870.7;
    perihelion_au = perihelion_au / kmToAu;
    semi_major_axis_au = semi_major_axis_au / kmToAu;
    aphelion_au = aphelion_au / kmToAu;
  }

  let period_yr = null;
  if (prMatch) {
    // PR is usually in days, convert to years. If it's too large (e.g. in seconds), fall back to Kepler's 3rd Law.
    const rawPr = parseFloat(prMatch[1]);
    const parsedPrYr = rawPr / 365.25;
    if (parsedPrYr > 10000 && eccentricity < 1 && semi_major_axis_au > 0) {
      period_yr = Math.pow(semi_major_axis_au, 1.5);
    } else {
      period_yr = parsedPrYr;
    }
  } else if (eccentricity < 1 && semi_major_axis_au > 0) {
    period_yr = Math.pow(semi_major_axis_au, 1.5);
  }

  return {
    semi_major_axis_au,
    eccentricity,
    inclination_deg,
    longitude_ascending_node_deg,
    argument_perihelion_deg,
    mean_anomaly_deg,
    period_yr,
    aphelion_au,
    perihelion_au,
  };
}

/**
 * Parses plain-text vectors block from JPL Horizons response.
 */
function parseVectors(text) {
  const soeIdx = text.indexOf('$$SOE');
  const eoeIdx = text.indexOf('$$EOE');
  if (soeIdx === -1 || eoeIdx === -1) {
    throw new Error('Could not find $$SOE or $$EOE markers in Horizons response');
  }
  const dataBlock = text.substring(soeIdx + 5, eoeIdx).trim();
  const lines = dataBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const records = [];
  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 >= lines.length) break;
    const timeLine = lines[i];
    const posLine = lines[i + 1];
    const velLine = lines[i + 2];

    const dateMatch = timeLine.match(/=\s*(A\.D\.\s*)?([^\n\r]+)/i);
    const dateStr = dateMatch ? dateMatch[2].trim() : 'Unknown';

    const xMatch = posLine.match(/X\s*=\s*([0-9E.+-]+)/i);
    const yMatch = posLine.match(/Y\s*=\s*([0-9E.+-]+)/i);
    const zMatch = posLine.match(/Z\s*=\s*([0-9E.+-]+)/i);

    const vxMatch = velLine.match(/VX\s*=\s*([0-9E.+-]+)/i);
    const vyMatch = velLine.match(/VY\s*=\s*([0-9E.+-]+)/i);
    const vzMatch = velLine.match(/VZ\s*=\s*([0-9E.+-]+)/i);

    if (xMatch && yMatch && zMatch && vxMatch && vyMatch && vzMatch) {
      const x = parseFloat(xMatch[1]);
      const y = parseFloat(yMatch[1]);
      const z = parseFloat(zMatch[1]);

      const vx_au_d = parseFloat(vxMatch[1]);
      const vy_au_d = parseFloat(vyMatch[1]);
      const vz_au_d = parseFloat(vzMatch[1]);

      // Convert AU/day to km/s (1 AU = 1.495978707e8 km, 1 day = 86400 s)
      const vx_km_s = vx_au_d * 1731.456827;
      const vy_km_s = vy_au_d * 1731.456827;
      const vz_km_s = vz_au_d * 1731.456827;

      const delta = Math.sqrt(x * x + y * y + z * z);
      const lighttime = delta * 8.316746; // ~8.3 minutes per AU

      records.push({
        date: dateStr,
        x_au: x,
        y_au: y,
        z_au: z,
        vx_km_s,
        vy_km_s,
        vz_km_s,
        delta_au: delta,
        lighttime_min: lighttime,
      });
    }
  }
  return records;
}

// Register tools list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_orbital_elements',
        description: 'Returns Keplerian orbital elements for any solar system body by NAIF ID or common name. Reference: https://ssd.jpl.nasa.gov/doc/horizons_api.html',
        inputSchema: {
          type: 'object',
          properties: {
            body_id: { type: 'string', description: 'NAIF ID or name (e.g., 1P, 67P, Ceres, Hale-Bopp)' },
            epoch: { type: 'string', description: 'Epoch ISO date (default: 2000-01-01)' },
          },
          required: ['body_id'],
        },
      },
      {
        name: 'get_ephemeris',
        description: 'Returns time-series position and velocity vectors for a solar system body. Reference: https://ssd.jpl.nasa.gov/doc/horizons_api.html',
        inputSchema: {
          type: 'object',
          properties: {
            body_id: { type: 'string', description: 'NAIF ID or name' },
            start_date: { type: 'string', description: 'Start date ISO (e.g. 2000-01-01)' },
            stop_date: { type: 'string', description: 'Stop date ISO (e.g. 2000-01-10)' },
            step_size: { type: 'string', description: 'Step size (e.g. 1d, 30d, 1y)' },
            center: { type: 'string', description: 'Coordinate center (default: 500@0 = solar system barycenter)' },
          },
          required: ['body_id', 'start_date', 'stop_date'],
        },
      },
      {
        name: 'search_small_bodies',
        description: 'Returns catalog of comets or asteroids for populating the simulation. Reference: https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['comet', 'asteroid', 'all'], description: 'Type of small bodies to search' },
            limit: { type: 'integer', description: 'Maximum number of bodies to return (max 50, default 20)' },
          },
          required: ['type'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'get_orbital_elements') {
      const bodyId = args.body_id;
      const epoch = args.epoch || '2000-01-01';

      // Parse stop date as epoch + 1 day
      const start = new Date(epoch);
      if (isNaN(start.getTime())) {
        throw new Error(`Invalid epoch date: "${epoch}". Expected YYYY-MM-DD format.`);
      }
      const stop = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const stopStr = stop.toISOString().split('T')[0];

      const url = `${HORIZONS_BASE_URL}?format=json&EPHEM_TYPE=ELEMENTS&COMMAND='${encodeURIComponent(bodyId)}'&MAKE_EPHEM=YES&CENTER=500@10&START_TIME=${encodeURIComponent(epoch)}&STOP_TIME=${encodeURIComponent(stopStr)}&STEP_SIZE=1d&OBJ_DATA=YES`;

      const { resultText, finalUrl } = await fetchHorizons(url, bodyId);
      const parsed = parseOrbitalElements(resultText);
      const nameMatch = resultText.match(/Target body name:\s*([^\n\r{]*)/i);
      const bodyName = nameMatch ? nameMatch[1].trim() : bodyId;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              body_name: bodyName,
              naif_id: bodyId,
              ...parsed,
              source: 'NASA JPL Horizons',
              horizons_url: finalUrl,
            }),
          },
        ],
      };
    }

    if (name === 'get_ephemeris') {
      const bodyId = args.body_id;
      const startDate = args.start_date;
      const stopDate = args.stop_date;
      const stepSize = args.step_size || '1d';
      const center = args.center || '500@0';

      const url = `${HORIZONS_BASE_URL}?format=json&EPHEM_TYPE=VECTORS&COMMAND='${encodeURIComponent(bodyId)}'&MAKE_EPHEM=YES&CENTER=${encodeURIComponent(center)}&START_TIME=${encodeURIComponent(startDate)}&STOP_TIME=${encodeURIComponent(stopDate)}&STEP_SIZE=${encodeURIComponent(stepSize)}&OUT_UNITS=AU-D`;

      const { resultText } = await fetchHorizons(url, bodyId);
      const parsed = parseVectors(resultText);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(parsed),
          },
        ],
      };
    }

    if (name === 'search_small_bodies') {
      const type = args.type;
      const limit = Math.min(50, args.limit || 20);

      let kindParam = '';
      if (type === 'comet') kindParam = '&sb-kind=c';
      if (type === 'asteroid') kindParam = '&sb-kind=a';

      const url = `https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=spkid,full_name,e,q,i,per${kindParam}&limit=${limit}&phys-par=0`;

      let results = [];
      try {
        const response = await fetchWithTimeout(url);
        if (response.status !== 200) {
          throw new Error(`JPL SBDB Query API returned status ${response.status}`);
        }
        const data = await response.json();

        if (data.data && Array.isArray(data.data)) {
          results = data.data.map((row) => {
            const naif_id = row[0];
            const name = row[1].trim();
            const eccentricity = parseFloat(row[2]);
            const perihelion_au = parseFloat(row[3]);
            const inclination_deg = parseFloat(row[4]);
            const period_yr = row[5] ? (parseFloat(row[5]) / 365.25) : null;

            const isComet = type === 'comet' || name.includes('/') || name.includes('P');
            const coma_onset_au = isComet ? 3.0 : null;
            const tail_onset_au = isComet ? 2.5 : null;

            return {
              naif_id,
              name,
              type: isComet ? 'comet' : 'asteroid',
              period_yr,
              eccentricity,
              perihelion_au,
              inclination_deg,
              coma_onset_au,
              tail_onset_au,
            };
          });
        } else {
          throw new Error('Invalid data structure from JPL SBDB API');
        }
      } catch (err) {
        console.error(`JPL SBDB query failed: ${err.message}. Falling back to cached small bodies library.`);
        const COMET_FALLBACKS = [
          { naif_id: "1P", name: "1P/Halley", type: "comet", period_yr: 75.3, eccentricity: 0.967, perihelion_au: 0.586, inclination_deg: 162.2, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
          { naif_id: "67P", name: "67P/Churyumov-Gerasimenko", type: "comet", period_yr: 6.44, eccentricity: 0.641, perihelion_au: 1.24, inclination_deg: 7.04, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
          { naif_id: "Hale-Bopp", name: "C/1995 O1 (Hale-Bopp)", type: "comet", period_yr: 2534.0, eccentricity: 0.995, perihelion_au: 0.914, inclination_deg: 89.4, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
          { naif_id: "2P", name: "2P/Encke", type: "comet", period_yr: 3.3, eccentricity: 0.848, perihelion_au: 0.336, inclination_deg: 11.78, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
          { naif_id: "9P", name: "9P/Tempel 1", type: "comet", period_yr: 5.5, eccentricity: 0.517, perihelion_au: 1.5, inclination_deg: 10.5, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' }
        ];
        const ASTEROID_FALLBACKS = [
          { naif_id: "Ceres", name: "1 Ceres", type: "asteroid", period_yr: 4.6, eccentricity: 0.076, perihelion_au: 2.56, inclination_deg: 10.6, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
          { naif_id: "Pallas", name: "2 Pallas", type: "asteroid", period_yr: 4.62, eccentricity: 0.231, perihelion_au: 2.13, inclination_deg: 34.8, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
          { naif_id: "Juno", name: "3 Juno", type: "asteroid", period_yr: 4.36, eccentricity: 0.256, perihelion_au: 1.98, inclination_deg: 13.0, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
          { naif_id: "Vesta", name: "4 Vesta", type: "asteroid", period_yr: 3.63, eccentricity: 0.089, perihelion_au: 2.15, inclination_deg: 7.14, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
          { naif_id: "Eros", name: "433 Eros", type: "asteroid", period_yr: 1.76, eccentricity: 0.223, perihelion_au: 1.13, inclination_deg: 10.8, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' }
        ];

        if (type === 'asteroid') {
          results = ASTEROID_FALLBACKS;
        } else if (type === 'comet') {
          results = COMET_FALLBACKS;
        } else {
          results = [...COMET_FALLBACKS, ...ASTEROID_FALLBACKS];
        }
        results = results.slice(0, limit);
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
console.error('NASA Horizons MCP Server running on stdio');
