import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  parseOrbitalElements,
  horizonsRecordMatchesRequest,
  parseHorizonsIndexCandidates,
} from '../shared/horizonsParser.mjs';

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
 * Helper to fetch from Horizons, with automatic disambiguation for comets/asteroids index lists
 * and wrong-body validation (e.g. preventing '1P' from resolving to 'Kerberos (904)').
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

  const baseUrlObj = new URL(url);
  const startTimeParam = baseUrlObj.searchParams.get('START_TIME') || '2000-01-01';
  const queryYear = parseInt(startTimeParam.substring(0, 4), 10);
  const epochCloseness = (c) =>
    c.epochYear === null || Number.isNaN(queryYear) ? Number.MAX_SAFE_INTEGER : Math.abs(c.epochYear - queryYear);

  let resultText = data.result;
  let finalUrl = url;

  // If result is search list (no $$SOE markers)
  if (!resultText.includes('$$SOE')) {
    const candidates = parseHorizonsIndexCandidates(resultText);
    if (candidates.length === 0) {
      throw new Error('Ambiguous body_id and could not parse record numbers from search list');
    }
    const matching = candidates.filter((c) => horizonsRecordMatchesRequest(c.label, bodyId));
    const distinctDesigs = Array.from(new Set(matching.map((c) => c.desigKey)));
    if (matching.length > 0 && distinctDesigs.length > 1) {
      throw new Error(`Ambiguous body "${bodyId}": multiple Horizons designations match the request`);
    }
    const ordered = matching.length > 0
      ? [...matching].sort((a, b) => epochCloseness(a) - epochCloseness(b))
      : candidates;
    const bestRecord = ordered[0].record;
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
    if (retryData.error || !retryData.result || !retryData.result.includes('$$SOE')) {
      throw new Error(retryData.error || 'No result returned after selecting unique record');
    }
    resultText = retryData.result;
    finalUrl = newUrl;
  }

  const nameMatch = resultText.match(/Target body name:\s*([^\n\r{]*)/i);
  const bodyName = nameMatch ? nameMatch[1].trim() : bodyId;

  // Wrong-body guard: COMMAND='1P' can resolve directly to 'Kerberos (904)'.
  // Retry via the small-body index search form (trailing ';') and pick the
  // unambiguous designation match closest to the requested epoch.
  if (!horizonsRecordMatchesRequest(bodyName, bodyId)) {
    const indexUrlObj = new URL(url);
    indexUrlObj.searchParams.set('COMMAND', `'${bodyId};'`);
    const indexUrl = indexUrlObj.toString();
    const indexRes = await fetchWithTimeout(indexUrl);
    if (indexRes.status !== 200) {
      throw new Error(`Horizons returned '${bodyName}' which does not match requested body '${bodyId}'`);
    }
    const indexData = await indexRes.json();
    const indexCandidates = indexData && !indexData.error && indexData.result
      ? parseHorizonsIndexCandidates(indexData.result)
      : [];
    const matching = indexCandidates.filter((c) => horizonsRecordMatchesRequest(c.label, bodyId));
    const distinctDesigs = Array.from(new Set(matching.map((c) => c.desigKey)));
    if (matching.length === 0 || distinctDesigs.length !== 1) {
      throw new Error(
        matching.length === 0
          ? `Horizons returned '${bodyName}' which does not match requested body '${bodyId}', and index search found no match`
          : `Ambiguous body '${bodyId}': multiple Horizons designations match the request`
      );
    }
    const ordered = [...matching].sort((a, b) => epochCloseness(a) - epochCloseness(b));
    const recordUrlObj = new URL(url);
    recordUrlObj.searchParams.set('COMMAND', `'${ordered[0].record};'`);
    const recordUrl = recordUrlObj.toString();
    const recordRes = await fetchWithTimeout(recordUrl);
    if (recordRes.status !== 200) {
      throw new Error(`JPL Horizons returned status ${recordRes.status} on retry`);
    }
    const recordData = await recordRes.json();
    if (recordData.error || !recordData.result || !recordData.result.includes('$$SOE')) {
      throw new Error(`Ambiguous body or no records found for '${bodyId}'`);
    }
    const retryNameMatch = recordData.result.match(/Target body name:\s*([^\n\r{]*)/i);
    const retryBodyName = retryNameMatch ? retryNameMatch[1].trim() : bodyId;
    if (!horizonsRecordMatchesRequest(retryBodyName, bodyId)) {
      throw new Error(`Horizons returned '${retryBodyName}' which does not match requested body '${bodyId}'`);
    }
    resultText = recordData.result;
    finalUrl = recordUrl;
  }

  return { resultText, finalUrl };
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

      const COMET_FALLBACKS = [
        { naif_id: "1P", name: "1P/Halley", pdes: "1P", type: "comet", period_yr: 75.3, eccentricity: 0.967, perihelion_au: 0.586, inclination_deg: 162.2, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
        { naif_id: "67P", name: "67P/Churyumov-Gerasimenko", pdes: "67P", type: "comet", period_yr: 6.44, eccentricity: 0.641, perihelion_au: 1.24, inclination_deg: 7.04, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
        { naif_id: "Hale-Bopp", name: "C/1995 O1 (Hale-Bopp)", pdes: "C/1995 O1", type: "comet", period_yr: 2534.0, eccentricity: 0.995, perihelion_au: 0.914, inclination_deg: 89.4, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
        { naif_id: "2P", name: "2P/Encke", pdes: "2P", type: "comet", period_yr: 3.3, eccentricity: 0.848, perihelion_au: 0.336, inclination_deg: 11.78, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' },
        { naif_id: "9P", name: "9P/Tempel 1", pdes: "9P", type: "comet", period_yr: 5.5, eccentricity: 0.517, perihelion_au: 1.5, inclination_deg: 10.5, coma_onset_au: 3.0, tail_onset_au: 2.5, source: 'cached_fallback' }
      ];
      const ASTEROID_FALLBACKS = [
        { naif_id: "Ceres", name: "1 Ceres", pdes: "1", type: "asteroid", period_yr: 4.6, eccentricity: 0.076, perihelion_au: 2.56, inclination_deg: 10.6, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
        { naif_id: "Pallas", name: "2 Pallas", pdes: "2", type: "asteroid", period_yr: 4.62, eccentricity: 0.231, perihelion_au: 2.13, inclination_deg: 34.8, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
        { naif_id: "Juno", name: "3 Juno", pdes: "3", type: "asteroid", period_yr: 4.36, eccentricity: 0.256, perihelion_au: 1.98, inclination_deg: 13.0, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
        { naif_id: "Vesta", name: "4 Vesta", pdes: "4", type: "asteroid", period_yr: 3.63, eccentricity: 0.089, perihelion_au: 2.15, inclination_deg: 7.14, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' },
        { naif_id: "Eros", name: "433 Eros", pdes: "433", type: "asteroid", period_yr: 1.76, eccentricity: 0.223, perihelion_au: 1.13, inclination_deg: 10.8, coma_onset_au: null, tail_onset_au: null, source: 'cached_fallback' }
      ];

      const COMET_KINDS = new Set(['c', 'cn', 'cu', 'cp', 'ci', 'cd', 'ce', 'cx']);
      const PERIODIC_COMET_REGEX = /^\d+P(\b|[/-])/i;
      const COMET_DESIG_REGEX = /^(?:\d+P|[CPDI]\/|\d+D(\b|[/-]))/i;

      function classifySmallBody(naif_id, name, pdes, kind) {
        if (type === 'comet') return true;
        if (type === 'asteroid') return false;
        if (pdes) {
          const isPeriodicComet = PERIODIC_COMET_REGEX.test(pdes) || /^\d+P/i.test(pdes);
          const isCometDesig = isPeriodicComet || COMET_DESIG_REGEX.test(pdes);
          const isCometKind = kind ? (COMET_KINDS.has(kind) || kind.startsWith('c')) : false;
          return isPeriodicComet || isCometDesig || isCometKind;
        }
        // Fall back to hardcoded comet list if pdes is unavailable
        const isHardcodedComet = COMET_FALLBACKS.some(
          (c) => c.naif_id === String(naif_id) || c.name === name || name.includes(c.name) || c.name.includes(name)
        );
        const isCometKind = kind ? (COMET_KINDS.has(kind) || kind.startsWith('c')) : false;
        return isCometKind || isHardcodedComet;
      }

      let results = [];
      try {
        let rawRows = [];
        if (type === 'all') {
          const cometLimit = Math.ceil(limit / 2);
          const asteroidLimit = Math.floor(limit / 2);
          const cometUrl = `https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=spkid,full_name,pdes,e,q,i,per,kind&sb-kind=c&limit=${cometLimit}`;
          const asteroidUrl = `https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=spkid,full_name,pdes,e,q,i,per,kind&sb-kind=a&limit=${asteroidLimit}`;

          const [cometRes, asteroidRes] = await Promise.all([
            fetchWithTimeout(cometUrl),
            fetchWithTimeout(asteroidUrl),
          ]);

          if (cometRes.status !== 200 || asteroidRes.status !== 200) {
            throw new Error(`JPL SBDB Query API returned non-200 status (comets: ${cometRes.status}, asteroids: ${asteroidRes.status})`);
          }

          const [cometData, asteroidData] = await Promise.all([
            cometRes.json(),
            asteroidRes.json(),
          ]);

          const cRows = (cometData.data && Array.isArray(cometData.data)) ? cometData.data : [];
          const aRows = (asteroidData.data && Array.isArray(asteroidData.data)) ? asteroidData.data : [];
          rawRows = [...cRows, ...aRows];
        } else {
          let kindParam = '';
          if (type === 'comet') kindParam = '&sb-kind=c';
          if (type === 'asteroid') kindParam = '&sb-kind=a';

          const url = `https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=spkid,full_name,pdes,e,q,i,per,kind${kindParam}&limit=${limit}`;
          const response = await fetchWithTimeout(url);
          if (response.status !== 200) {
            throw new Error(`JPL SBDB Query API returned status ${response.status}`);
          }
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            rawRows = data.data;
          } else {
            throw new Error('Invalid data structure from JPL SBDB API');
          }
        }

        results = rawRows.map((row) => {
          const naif_id = row[0];
          const name = row[1].trim();
          const pdes = row[2] ? String(row[2]).trim() : null;
          const eccentricity = parseFloat(row[3]);
          const perihelion_au = parseFloat(row[4]);
          const inclination_deg = parseFloat(row[5]);
          const period_yr = row[6] ? (parseFloat(row[6]) / 365.25) : null;
          const kind = row[7] ? String(row[7]).toLowerCase().trim() : null;

          const isComet = classifySmallBody(naif_id, name, pdes, kind);
          const coma_onset_au = isComet ? 3.0 : null;
          const tail_onset_au = isComet ? 2.5 : null;

          return {
            naif_id,
            name,
            pdes: pdes || undefined,
            type: isComet ? 'comet' : 'asteroid',
            period_yr,
            eccentricity,
            perihelion_au,
            inclination_deg,
            coma_onset_au,
            tail_onset_au,
          };
        });
      } catch (err) {
        console.error(`JPL SBDB query failed: ${err.message}. Falling back to cached small bodies library.`);
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
