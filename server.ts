import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import path from 'path';
import { LRUCache } from 'lru-cache';
import { isOriginAllowed } from './src/utils/security';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Security: Defense in depth - minimize fingerprinting
app.disable('x-powered-by');

// Security: Trust proxy for correct IP detection in rate limiting (e.g., on Render)
app.set('trust proxy', 1);

// Security: Limit payload size to mitigate DoS risks
app.use(express.json({ limit: '10kb' }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(o => o.trim());
if (process.env.APP_URL && !allowedOrigins.includes(process.env.APP_URL)) {
  allowedOrigins.push(process.env.APP_URL);
}

// Security: Set enhanced security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const scriptSrc = process.env.NODE_ENV === 'production' ? "'self'" : "'self' 'unsafe-eval'";

  // Security: Restrict connect-src to self and specific allowed origins for WebSockets
  const wsPort = process.env.SIM_PORT || '3001';
  const wsOrigins = allowedOrigins.map(o => {
    try {
      const url = new URL(o);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      // Map both the base origin and the simulation port specifically
      const baseWs = `${wsProtocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
      const simWs = `${wsProtocol}//${url.hostname}:${wsPort}`;
      return `${baseWs} ${simWs}`;
    } catch {
      return '';
    }
  }).filter(Boolean).join(' ');
  const connectSrc = `'self' ${wsOrigins}`;

  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data: https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;`);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

app.use((req, res, next) => { 
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin; 
    const isDev = process.env.NODE_ENV !== 'production';
    const isAllowed = isOriginAllowed(origin, allowedOrigins, isDev);
    if (origin && isAllowed) { 
        res.setHeader('Access-Control-Allow-Origin', origin); 
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); 
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); 
    } 
    if (req.method === 'OPTIONS') return res.sendStatus(204); 
    next(); 
});

// Security: LRU Cache rate limiting for AI analysis
interface RateLimitData {
  count: number;
  windowStart: number;
}
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

const analysisLimitMap = new LRUCache<string, RateLimitData>({
  max: 1000,
  ttl: RATE_LIMIT_WINDOW
});

const apiRateLimitMap = new LRUCache<string, RateLimitData>({
  max: 1000,
  ttl: RATE_LIMIT_WINDOW
});

function checkApiRateLimit(req: express.Request, res: express.Response, maxRequests = 60): boolean {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = apiRateLimitMap.get(ip) || { count: 0, windowStart: now };
  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    record.count = 0;
    record.windowStart = now;
  }
  if (record.count >= maxRequests) {
    const waitSec = Math.ceil((RATE_LIMIT_WINDOW - (now - record.windowStart)) / 1000);
    res.setHeader('Retry-After', waitSec.toString());
    res.status(429).json({ error: 'Too many requests. Please wait ' + waitSec + 's.' });
    return false;
  }
  record.count++;
  apiRateLimitMap.set(ip, record);
  return true;
}

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Security: Fetch wrapper with timeout to prevent resource exhaustion
 * from slow or unresponsive external APIs.
 */
async function fetchWithTimeout(url: string, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Horizons hardening (F1 e2e stability): JPL occasionally answers a lookup
 * with a transient failure (non-200, `error` payload, or dropped
 * connection). Retry once before surfacing 502/504 so a single hiccup does
 * not fail the suite. Returns the last non-200 response when the server
 * answered; throws only when every attempt failed at the network level.
 */
async function fetchHorizonsWithRetry(url: string, attempts = 2): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.status === 200) return response;
      lastResponse = response;
    } catch (err) {
      lastError = err;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError;
}

/**
 * Horizons signals "this body cannot be resolved" either as a clean index
 * listing with no matches or, for some bodies, as an `error` payload. Map
 * the no-match-shaped errors to 404 (the invalid-body contract) while
 * keeping genuine outages as 502/504 after retries.
 */
function isHorizonsNoMatchError(message: unknown): boolean {
  const text = String(message ?? '').toLowerCase();
  return (
    text.includes('no match') ||
    text.includes('no records') ||
    text.includes('not found') ||
    text.includes('unknown') ||
    text.includes('cannot find') ||
    text.includes('ambiguous')
  );
}

// --- Preset catalog and JPL Horizons search logic ---

interface PlanetPreset {
  name: string;
  distance_au: number;
  mass_earth: number;
  radius_earth: number;
  type: 'rocky' | 'gas_giant';
}

interface StarPreset {
  name: string;
  spectral_class: string;
  mass_solar: number;
  luminosity_solar: number;
  temperature_K: number;
  radius_solar: number;
  metallicity_Z: number;
  distance_ly: number | null;
  age_gyr: number | null;
  known_planets: number;
  habitable_zone_inner_au: number;
  habitable_zone_outer_au: number;
  chandrasekhar_relevant: boolean;
  literature_reference: string;
  planets?: PlanetPreset[];
  phase?: number;
}

// @ts-expect-error missing types
import { PRESETS as _PRESETS, estimateParams as _estimateParams } from "./server/shared/stellarCatalog.mjs";
// @ts-expect-error missing types
import { parseOrbitalElements as _parseOrbitalElements, horizonsRecordMatchesRequest as _horizonsRecordMatchesRequest, parseHorizonsIndexCandidates as _parseHorizonsIndexCandidates, selectHorizonsBestRecord as _selectHorizonsBestRecord } from "./server/shared/horizonsParser.mjs";

const PRESETS = _PRESETS as StarPreset[];
const estimateParams = _estimateParams as (spType: string) => any;

interface HorizonsIndexCandidate {
  record: string;
  label: string;
  // Normalized "match-desig | primary-desig | name" key grouping apparition
  // records of one body (e.g. every Halley apparition shares one key).
  desigKey: string;
  // Solution epoch year from the index row, when parseable.
  epochYear: number | null;
}

const parseOrbitalElements = _parseOrbitalElements as (text: string) => {
  semi_major_axis_au: number;
  eccentricity: number;
  inclination_deg: number;
  longitude_ascending_node_deg: number;
  argument_perihelion_deg: number;
  mean_anomaly_deg: number;
  period_yr: number | null;
  aphelion_au: number;
  perihelion_au: number;
};
const horizonsRecordMatchesRequest = _horizonsRecordMatchesRequest as (
  targetName: string,
  requestedBodyId: string
) => boolean;
const parseHorizonsIndexCandidates = _parseHorizonsIndexCandidates as (
  resultText: string
) => HorizonsIndexCandidate[];
const selectHorizonsBestRecord = _selectHorizonsBestRecord as (
  candidates: HorizonsIndexCandidate[],
  requestedBodyId: string,
  queryYear: number
) => { status: 'ok'; record: string } | { status: 'ambiguous' };

app.get('/api/catalog/presets', (_req, res) => {
  res.json(PRESETS);
});

app.get('/api/catalog/search', async (req, res) => {
  if (!checkApiRateLimit(req, res)) return;
  // Security: Validate query parameter types to prevent array-injection
  const nameRaw = req.query.name;
  const spectralClassRaw = req.query.spectral_class;
  const massMinRaw = req.query.mass_min_solar;
  const massMaxRaw = req.query.mass_max_solar;
  const distMaxRaw = req.query.distance_max_ly;
  const limitRaw = req.query.limit;

  if (nameRaw !== undefined && typeof nameRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid name parameter' });
  }
  if (spectralClassRaw !== undefined && typeof spectralClassRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid spectral_class parameter' });
  }
  if (massMinRaw !== undefined && typeof massMinRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid mass_min_solar parameter' });
  }
  if (massMaxRaw !== undefined && typeof massMaxRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid mass_max_solar parameter' });
  }
  if (distMaxRaw !== undefined && typeof distMaxRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid distance_max_ly parameter' });
  }
  if (limitRaw !== undefined && typeof limitRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid limit parameter' });
  }

  const name = nameRaw as string | undefined;
  const spectralClass = spectralClassRaw as string | undefined;
  const massMin = massMinRaw ? parseFloat(massMinRaw as string) : undefined;
  const massMax = massMaxRaw ? parseFloat(massMaxRaw as string) : undefined;
  const distMax = distMaxRaw ? parseFloat(distMaxRaw as string) : undefined;
  const limit = limitRaw ? Math.min(20, parseInt(limitRaw as string)) : 10;

  // Validation
  if ((massMin !== undefined && (isNaN(massMin) || massMin < 0)) ||
      (massMax !== undefined && (isNaN(massMax) || massMax < 0)) ||
      (distMax !== undefined && (isNaN(distMax) || distMax < 0)) ||
      (isNaN(limit) || limit < 0)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // If search by name
  if (name) {
    // 1. Search presets
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const preset = PRESETS.find(p => {
      const pName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanName.includes(pName) || pName.includes(cleanName);
    });

    if (preset) {
      return res.json([preset]);
    }

    // 2. Query SIMBAD
    try {
      const safeName = name.substring(0, 64).replace(/'/g, "''");
      const adql = `SELECT TOP 1 main_id, sp_type, plx_value FROM basic WHERE main_id = '${safeName}' OR main_id LIKE '% ${safeName}'`;
      const url = `https://simbad.u-strasbg.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=${encodeURIComponent(adql)}`;
      
      const response = await fetchWithTimeout(url);
      if (response.status === 200) {
        const data = await response.json();
        if (data && data.data && data.data.length > 0) {
          const row = data.data[0];
          const mainId = row[0].trim();
          const spType = row[1] || 'G2V';
          const plx = parseFloat(row[2]) || 0;
          
          const distance_ly = plx > 0 ? Number((3261.56 / plx).toFixed(2)) : null;
          const params = estimateParams(spType);
          
          const innerHz = Number(Math.sqrt(params.luminosity_solar / 1.1).toFixed(2));
          const outerHz = Number(Math.sqrt(params.luminosity_solar / 0.53).toFixed(2));
          
          return res.json([{
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
          }]);
        }
      }
    } catch (err) {
      console.error('SIMBAD by name query failed:', err);
    }
    return res.json([]);
  }

  // General search
  // Try SIMBAD
  try {
    const filters = ["sp_type IS NOT NULL", "plx_value IS NOT NULL", "plx_value > 0"];
    if (spectralClass) {
      const safeSp = spectralClass.substring(0, 64).replace(/'/g, "''");
      filters.push(`sp_type LIKE '${safeSp}%'`);
    }
    if (distMax !== undefined && distMax > 0) {
      const plxMin = 3261.56 / distMax;
      filters.push(`plx_value >= ${plxMin}`);
    }

    const adql = `SELECT TOP 50 main_id, sp_type, plx_value FROM basic WHERE ${filters.join(' AND ')}`;
    const url = `https://simbad.u-strasbg.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=${encodeURIComponent(adql)}`;
    
    const response = await fetchWithTimeout(url);
    if (response.status === 200) {
      const data = await response.json();
      if (data && data.data && Array.isArray(data.data)) {
        const results = [];
        for (const row of data.data) {
          const mainId = row[0].trim();
          const spType = row[1];
          const plx = parseFloat(row[2]);

          const distance_ly = Number((3261.56 / plx).toFixed(2));
          const params = estimateParams(spType);

          if (massMin !== undefined && params.mass_solar < massMin) continue;
          if (massMax !== undefined && params.mass_solar > massMax) continue;

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
        return res.json(results);
      }
    }
  } catch (err) {
    console.error('SIMBAD search failed, falling back to presets:', err);
  }

  // Fallback to presets
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

  if (spectralClass) {
    results = results.filter(r => r.spectral_class.toUpperCase().startsWith(spectralClass.toUpperCase()));
  }
  if (massMin !== undefined) {
    results = results.filter(r => r.mass_solar >= massMin);
  }
  if (massMax !== undefined) {
    results = results.filter(r => r.mass_solar <= massMax);
  }
  if (distMax !== undefined) {
    results = results.filter(r => r.distance_ly !== null && r.distance_ly <= distMax);
  }

  return res.json(results.slice(0, limit));
});

const FALLBACK_SMALL_BODIES: Record<string, {
  body_name: string;
  semi_major_axis_au: number;
  eccentricity: number;
  inclination_deg: number;
  ascending_node_deg: number;
  perihelion_arg_deg: number;
  mean_anomaly_deg: number;
  period_yr: number;
  perihelion_au: number;
  aphelion_au: number;
}> = {
  '1p': {
    body_name: '1P/Halley',
    semi_major_axis_au: 17.834,
    eccentricity: 0.967,
    inclination_deg: 162.26,
    ascending_node_deg: 58.42,
    perihelion_arg_deg: 111.33,
    mean_anomaly_deg: 38.38,
    period_yr: 75.3,
    perihelion_au: 0.586,
    aphelion_au: 35.08,
  },
  'halley': {
    body_name: '1P/Halley',
    semi_major_axis_au: 17.834,
    eccentricity: 0.967,
    inclination_deg: 162.26,
    ascending_node_deg: 58.42,
    perihelion_arg_deg: 111.33,
    mean_anomaly_deg: 38.38,
    period_yr: 75.3,
    perihelion_au: 0.586,
    aphelion_au: 35.08,
  },
  '67p': {
    body_name: '67P/Churyumov-Gerasimenko',
    semi_major_axis_au: 3.463,
    eccentricity: 0.641,
    inclination_deg: 7.04,
    ascending_node_deg: 50.15,
    perihelion_arg_deg: 22.14,
    mean_anomaly_deg: 14.2,
    period_yr: 6.44,
    perihelion_au: 1.24,
    aphelion_au: 5.68,
  },
  'hale-bopp': {
    body_name: 'C/1995 O1 (Hale-Bopp)',
    semi_major_axis_au: 186.0,
    eccentricity: 0.995,
    inclination_deg: 89.4,
    ascending_node_deg: 282.5,
    perihelion_arg_deg: 130.6,
    mean_anomaly_deg: 5.0,
    period_yr: 2534.0,
    perihelion_au: 0.914,
    aphelion_au: 371.1,
  },
  '2p': {
    body_name: '2P/Encke',
    semi_major_axis_au: 2.21,
    eccentricity: 0.848,
    inclination_deg: 11.78,
    ascending_node_deg: 334.57,
    perihelion_arg_deg: 186.55,
    mean_anomaly_deg: 120.0,
    period_yr: 3.3,
    perihelion_au: 0.336,
    aphelion_au: 4.09,
  },
  '9p': {
    body_name: '9P/Tempel 1',
    semi_major_axis_au: 3.12,
    eccentricity: 0.517,
    inclination_deg: 10.5,
    ascending_node_deg: 68.9,
    perihelion_arg_deg: 178.9,
    mean_anomaly_deg: 45.0,
    period_yr: 5.5,
    perihelion_au: 1.5,
    aphelion_au: 4.74,
  },
  'ceres': {
    body_name: '1 Ceres',
    semi_major_axis_au: 2.767,
    eccentricity: 0.076,
    inclination_deg: 10.59,
    ascending_node_deg: 80.3,
    perihelion_arg_deg: 73.6,
    mean_anomaly_deg: 77.4,
    period_yr: 4.6,
    perihelion_au: 2.56,
    aphelion_au: 2.98,
  },
  'pallas': {
    body_name: '2 Pallas',
    semi_major_axis_au: 2.772,
    eccentricity: 0.231,
    inclination_deg: 34.8,
    ascending_node_deg: 173.1,
    perihelion_arg_deg: 310.0,
    mean_anomaly_deg: 60.0,
    period_yr: 4.62,
    perihelion_au: 2.13,
    aphelion_au: 3.41,
  },
  'juno': {
    body_name: '3 Juno',
    semi_major_axis_au: 2.67,
    eccentricity: 0.256,
    inclination_deg: 13.0,
    ascending_node_deg: 169.8,
    perihelion_arg_deg: 248.4,
    mean_anomaly_deg: 25.0,
    period_yr: 4.36,
    perihelion_au: 1.98,
    aphelion_au: 3.35,
  },
  'vesta': {
    body_name: '4 Vesta',
    semi_major_axis_au: 2.36,
    eccentricity: 0.089,
    inclination_deg: 7.14,
    ascending_node_deg: 103.8,
    perihelion_arg_deg: 151.2,
    mean_anomaly_deg: 20.0,
    period_yr: 3.63,
    perihelion_au: 2.15,
    aphelion_au: 2.57,
  },
  'eros': {
    body_name: '433 Eros',
    semi_major_axis_au: 1.458,
    eccentricity: 0.223,
    inclination_deg: 10.83,
    ascending_node_deg: 304.3,
    perihelion_arg_deg: 178.8,
    mean_anomaly_deg: 315.0,
    period_yr: 1.76,
    perihelion_au: 1.13,
    aphelion_au: 1.78,
  }
};

app.get('/api/horizons/search', async (req, res) => {
  if (!checkApiRateLimit(req, res)) return;
  // Security: Validate query parameter types to prevent array-injection
  const bodyIdRaw = req.query.body_id;
  const typeRaw = req.query.type;
  const limitRaw = req.query.limit;

  if (bodyIdRaw !== undefined && typeof bodyIdRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid body_id parameter' });
  }
  if (typeRaw !== undefined && typeof typeRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid type parameter' });
  }
  if (limitRaw !== undefined && typeof limitRaw !== 'string') {
    return res.status(400).json({ error: 'Invalid limit parameter' });
  }

  const bodyId = bodyIdRaw as string | undefined;
  const type = typeRaw as string | undefined;
  const limit = limitRaw ? Math.min(50, parseInt(limitRaw as string)) : 20;

  // Security: Validate limit is a sane number
  if (isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: 'Invalid limit parameter' });
  }

  if (bodyId) {
    // Security check: validate body_id format and length
    if (bodyId.length > 100 || new RegExp('[^a-zA-Z0-9\\s/-]').test(bodyId)) {
      return res.status(400).json({ error: 'Invalid body ID format' });
    }

    const normalizedKey = bodyId.trim().toLowerCase();
    const fallback = FALLBACK_SMALL_BODIES[normalizedKey];

    try {
      const epoch = '2000-01-01';
      const stopStr = '2000-01-02';
      const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&EPHEM_TYPE=ELEMENTS&COMMAND='${encodeURIComponent(bodyId)}'&MAKE_EPHEM=YES&CENTER=500@10&START_TIME=${epoch}&STOP_TIME=${stopStr}&STEP_SIZE=1d&OBJ_DATA=YES`;
      
      const response = await fetchHorizonsWithRetry(url);
      if (response.status !== 200) {
        if (fallback) {
          return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
        }
        return res.status(502).json({ error: `Horizons API returned HTTP ${response.status}` });
      }
      const data = await response.json();
      if (data.error || !data.result) {
        if (fallback) {
          return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
        }
        if (isHorizonsNoMatchError(data.error) || !data.result) {
          return res.status(404).json({ error: data.error || `Ambiguous body or no records found for '${bodyId}'` });
        }
        return res.status(502).json({ error: data.error || 'No results from Horizons' });
      }
      
      // Check if result is ambiguous/search list
      let resultText = data.result;
      let candidateLabels: string[] = [];
      if (!resultText.includes('$$SOE')) {
        // Resolve ambiguous or fallback to error
        const candidates = parseHorizonsIndexCandidates(resultText);
        if (candidates.length > 0) {
          candidateLabels = candidates.map((c) => c.label);
          // Ambiguity is judged by distinct designation keys, not record
          // numbers: apparition records of one body (e.g. every Halley
          // return) share one key, so ~30 Halley records are one body, not
          // ambiguous. The epoch-closest apparition is retried; the
          // wrong-body guard below still rejects an unrelated record.
          const queryYear = parseInt(epoch.substring(0, 4), 10);
          const selection = selectHorizonsBestRecord(candidates, bodyId, queryYear);
          if (selection.status === 'ambiguous') {
            if (fallback) {
              return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
            }
            return res.status(404).json({
              error: `Ambiguous body '${bodyId}': multiple Horizons records match the request`,
              candidates: candidateLabels.slice(0, 25),
            });
          }
          const bestRecord = selection.record;
          const retryUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&EPHEM_TYPE=ELEMENTS&COMMAND='${encodeURIComponent(bestRecord + ';')}'&MAKE_EPHEM=YES&CENTER=500@10&START_TIME=${epoch}&STOP_TIME=${stopStr}&STEP_SIZE=1d&OBJ_DATA=YES`;
          const retryRes = await fetchHorizonsWithRetry(retryUrl);
          if (retryRes.status !== 200) {
            if (fallback) {
              return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
            }
            return res.status(502).json({ error: `Horizons retry returned HTTP ${retryRes.status}` });
          }
          const retryData = await retryRes.json();
          if (retryData.error || !retryData.result) {
            if (fallback) {
              return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
            }
            if (isHorizonsNoMatchError(retryData.error)) {
              return res.status(404).json({
                error: retryData.error || `Ambiguous body or no records found for '${bodyId}'`,
                candidates: candidateLabels.slice(0, 25),
              });
            }
            return res.status(502).json({ error: retryData.error || 'Failed on retry' });
          }
          resultText = retryData.result;
          if (!resultText.includes('$$SOE')) {
            if (fallback) {
              return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
            }
            return res.status(404).json({
              error: `Ambiguous body or no records found for '${bodyId}'`,
              candidates: candidateLabels.slice(0, 25),
            });
          }
        } else {
          if (fallback) {
            return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
          }
          return res.status(404).json({ error: `Ambiguous body or no records found for '${bodyId}'` });
        }
      }
      
      const nameMatch = resultText.match(/Target body name:\s*([^\n\r{]*)/i);
      let bodyName = nameMatch ? nameMatch[1].trim() : bodyId;

      // Wrong-body guard: never silently return a record that does not
      // correspond to the requested body (e.g. 'Kerberos (904)' for a '1P'
      // query). A 4xx lets the UI show "no unambiguous match" instead of
      // simulating the wrong object.
      if (!horizonsRecordMatchesRequest(bodyName, bodyId)) {
        // The direct COMMAND lookup resolved to an unrelated body (observed:
        // COMMAND='1P' resolves directly to Kerberos). Retry via the
        // small-body index search form (trailing ';'), which returns a
        // disambiguation list, and select the unambiguous designation match.
        const indexUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&EPHEM_TYPE=ELEMENTS&COMMAND='${encodeURIComponent(bodyId + ';')}'&MAKE_EPHEM=YES&CENTER=500@10&START_TIME=${epoch}&STOP_TIME=${stopStr}&STEP_SIZE=1d&OBJ_DATA=YES`;
        const indexRes = await fetchHorizonsWithRetry(indexUrl);
        if (indexRes.status !== 200) {
          if (fallback) {
            return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
          }
          return res.status(404).json({
            error: `Horizons returned '${bodyName}' which does not match requested body '${bodyId}'`,
          });
        }
        const indexData = await indexRes.json();
        const indexCandidates = indexData && !indexData.error && indexData.result
          ? parseHorizonsIndexCandidates(indexData.result)
          : [];
        const matching = indexCandidates.filter((c) => horizonsRecordMatchesRequest(c.label, bodyId));
        const distinctDesigs = Array.from(new Set(matching.map((c) => c.desigKey)));
        if (matching.length === 0 || distinctDesigs.length !== 1) {
          const labels = indexCandidates.length > 0
            ? indexCandidates.map((c) => c.label)
            : candidateLabels;
          if (fallback) {
            return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
          }
          return res.status(404).json({
            error: matching.length === 0
              ? `Horizons returned '${bodyName}' which does not match requested body '${bodyId}', and index search found no match`
              : `Ambiguous body '${bodyId}': multiple Horizons designations match the request`,
            candidates: labels.slice(0, 25),
          });
        }
        candidateLabels = indexCandidates.map((c) => c.label);
        // One designation may span many apparition records (e.g. Halley):
        // prefer the solution epoch closest to the requested elements epoch.
        const queryYear = parseInt(epoch.substring(0, 4), 10);
        const epochCloseness = (c: HorizonsIndexCandidate) =>
          c.epochYear === null || Number.isNaN(queryYear) ? Number.MAX_SAFE_INTEGER : Math.abs(c.epochYear - queryYear);
        const ordered = [...matching].sort((a, b) => epochCloseness(a) - epochCloseness(b));
        const recordUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&EPHEM_TYPE=ELEMENTS&COMMAND='${encodeURIComponent(ordered[0].record + ';')}'&MAKE_EPHEM=YES&CENTER=500@10&START_TIME=${epoch}&STOP_TIME=${stopStr}&STEP_SIZE=1d&OBJ_DATA=YES`;
        const recordRes = await fetchHorizonsWithRetry(recordUrl);
        if (recordRes.status !== 200) {
          if (fallback) {
            return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
          }
          return res.status(502).json({ error: `Horizons retry returned HTTP ${recordRes.status}` });
        }
        const recordData = await recordRes.json();
        if (recordData.error || !recordData.result || !recordData.result.includes('$$SOE')) {
          if (fallback) {
            return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
          }
          if (!recordData.error || isHorizonsNoMatchError(recordData.error)) {
            return res.status(404).json({
              error: recordData.error || `Ambiguous body or no records found for '${bodyId}'`,
              candidates: candidateLabels.slice(0, 25),
            });
          }
          return res.status(502).json({ error: recordData.error });
        }
        resultText = recordData.result;
        const retryNameMatch = resultText.match(/Target body name:\s*([^\n\r{]*)/i);
        bodyName = retryNameMatch ? retryNameMatch[1].trim() : bodyId;
        if (!horizonsRecordMatchesRequest(bodyName, bodyId)) {
          if (fallback) {
            return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
          }
          return res.status(404).json({
            error: `Horizons returned '${bodyName}' which does not match requested body '${bodyId}'`,
            candidates: candidateLabels.slice(0, 25),
          });
        }
      }

      const parsed = parseOrbitalElements(resultText);
      return res.json({
        body_name: bodyName,
        naif_id: bodyId,
        ...parsed,
        source: 'NASA JPL Horizons',
      });
    } catch (err: any) {
      // Security: Log detailed error internally, return generic message to client
      console.error('Horizons body lookup error:', err);
      if (fallback) {
        return res.json({ ...fallback, naif_id: bodyId, source: 'NASA JPL Horizons (Cached Fallback)' });
      }
      if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
        return res.status(504).json({ error: 'NASA JPL Horizons service timed out.' });
      }
      return res.status(502).json({ error: 'Failed to retrieve data from Horizons API.' });
    }
  }

  if (type) {
    if (type !== 'comet' && type !== 'asteroid') {
      return res.status(400).json({ error: 'Invalid small body type' });
    }

    let kindParam = '';
    if (type === 'comet') kindParam = '&sb-kind=c';
    if (type === 'asteroid') kindParam = '&sb-kind=a';

    const url = `https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=spkid,full_name,e,q,i,per${kindParam}&limit=${limit}&phys-par=0`;

    try {
      const response = await fetchWithTimeout(url);
      if (response.status !== 200) {
        throw new Error('JPL API returned non-200');
      }
      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        const results = data.data.map((row: any) => {
          const naif_id = row[0];
          const name = row[1].trim();
          const eccentricity = parseFloat(row[2]);
          const perihelion_au = parseFloat(row[3]);
          const inclination_deg = parseFloat(row[4]);
          const period_yr = row[5] ? (parseFloat(row[5]) / 365.25) : null;

          // NOTE: a bare 'P' check misclassifies asteroids (e.g. "2 Pallas").
          // Cometary designations carry a '/' ("1P/Halley", "C/1995 O1 ...").
          const isComet = type === 'comet' || name.includes('/');
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
        return res.json(results);
      } else {
        throw new Error('Invalid structure');
      }
    } catch {
      // Fallback to hardcoded data
      let results: any[];
      if (type === 'comet') {
        results = [
          { naif_id: "1P", name: "1P/Halley", type: "comet", period_yr: 75.3, eccentricity: 0.967, perihelion_au: 0.586, inclination_deg: 162.2, coma_onset_au: 3.0, tail_onset_au: 2.5 },
          { naif_id: "67P", name: "67P/Churyumov-Gerasimenko", type: "comet", period_yr: 6.44, eccentricity: 0.641, perihelion_au: 1.24, inclination_deg: 7.04, coma_onset_au: 3.0, tail_onset_au: 2.5 },
          { naif_id: "Hale-Bopp", name: "C/1995 O1 (Hale-Bopp)", type: "comet", period_yr: 2534.0, eccentricity: 0.995, perihelion_au: 0.914, inclination_deg: 89.4, coma_onset_au: 3.0, tail_onset_au: 2.5 },
          { naif_id: "2P", name: "2P/Encke", type: "comet", period_yr: 3.3, eccentricity: 0.848, perihelion_au: 0.336, inclination_deg: 11.78, coma_onset_au: 3.0, tail_onset_au: 2.5 },
          { naif_id: "9P", name: "9P/Tempel 1", type: "comet", period_yr: 5.5, eccentricity: 0.517, perihelion_au: 1.5, inclination_deg: 10.5, coma_onset_au: 3.0, tail_onset_au: 2.5 }
        ];
      } else {
        results = [
          { naif_id: "Ceres", name: "1 Ceres", type: "asteroid", period_yr: 4.6, eccentricity: 0.076, perihelion_au: 2.56, inclination_deg: 10.6, coma_onset_au: null, tail_onset_au: null },
          { naif_id: "Pallas", name: "2 Pallas", type: "asteroid", period_yr: 4.62, eccentricity: 0.231, perihelion_au: 2.13, inclination_deg: 34.8, coma_onset_au: null, tail_onset_au: null },
          { naif_id: "Juno", name: "3 Juno", type: "asteroid", period_yr: 4.36, eccentricity: 0.256, perihelion_au: 1.98, inclination_deg: 13.0, coma_onset_au: null, tail_onset_au: null },
          { naif_id: "Vesta", name: "4 Vesta", type: "asteroid", period_yr: 3.63, eccentricity: 0.089, perihelion_au: 2.15, inclination_deg: 7.14, coma_onset_au: null, tail_onset_au: null },
          { naif_id: "Eros", name: "433 Eros", type: "asteroid", period_yr: 1.76, eccentricity: 0.223, perihelion_au: 1.13, inclination_deg: 10.8, coma_onset_au: null, tail_onset_au: null }
        ];
      }
      return res.json(results.slice(0, limit));
    }
  }

  return res.status(400).json({ error: 'Missing type or body_id parameter' });
});

app.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    aiEnabled: !!ai
  });
});

app.post('/api/analyze', async (req, res) => {
  if (!ai) {
    // Security: Generic error message to avoid leaking server config
    return res.status(503).json({ error: 'Analysis service currently unavailable.' });
  }

  // Security: Guard against malformed request bodies before processing
  // typeof body === 'object' returns true for arrays, so we must explicitly exclude them.
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  // Security: Rate limiting by IP
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = analysisLimitMap.get(ip) || { count: 0, windowStart: now };

  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    record.count = 0;
    record.windowStart = now;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    const waitSec = Math.ceil((RATE_LIMIT_WINDOW - (now - record.windowStart)) / 1000);
    res.setHeader('Retry-After', waitSec.toString());
    return res.status(429).json({ error: 'Too many requests. Please wait ' + waitSec + 's.' });
  }

  record.count++;

  // Security: Prevent caching of sensitive AI results
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  analysisLimitMap.set(ip, record);

  const { temp, mass, lum, age, phase, G, alpha } = req.body;

  // Security: Input validation and sanitization to prevent prompt injection and malformed requests
  const VALID_PHASES = [
    "Nebula", "Protostar", "Main Sequence",
    "Red Giant", "Supernova", "Remnant"
  ];

  const isValidNumber = (val: any) => typeof val === 'number' && !isNaN(val) && isFinite(val);

  if (!isValidNumber(temp) || temp <= 0 || temp > 1000000 ||
      !isValidNumber(mass) || mass <= 0 || mass > 1000 ||
      !isValidNumber(lum) || lum < 0 || lum > 1000000 ||
      !isValidNumber(age) || age < 0 || age > 20000 ||
      !isValidNumber(G) || G <= 0 || G > 100 ||
      !isValidNumber(alpha) || alpha <= 0 || alpha > 100 ||
      typeof phase !== 'string' || !VALID_PHASES.includes(phase)) {
    return res.status(400).json({ error: 'Invalid input parameters.' });
  }

  if (phase === 'Nebula' || phase === 'Protostar') {
    return res.status(400).json({ error: 'No planets exist in this phase — analysis requires Main Sequence or later.' });
  }

  const GEN_AI_TIMEOUT = 10000;
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('TIMEOUT')), GEN_AI_TIMEOUT);
  });

  try {
    const prompt = `Analyze a generic star based on physical constants (G=${G}, alpha=${alpha}) and its star properties (Temp=${temp}K, Mass=${mass}M, Lum=${lum}L, Age=${age}Myr, Phase=${phase}). Return a JSON with properties: planet_name (string), life_stage (number), dominant_species (string), civilization (string), biome (string).`;

    const schema = {
      type: "object",
      properties: {
        planet_name: { type: "string" },
        life_stage: { type: "integer" },
        dominant_species: { type: "string" },
        civilization: { type: "string" },
        biome: { type: "string" },
      },
      required: ["planet_name", "life_stage", "dominant_species", "civilization", "biome"],
    };

    const aiPromise = ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an astrobiology analytical engine. Generate creative but scientifically cohesive species and civilizations based on the star's phase, temp, and constants.",
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: 256, // Security: Resource exhaustion protection
      }
    });

    const response = await Promise.race([aiPromise, timeoutPromise]) as any;

    if (!response.text) {
      throw new Error('No response text from Gemini API');
    }

    let data;
    try {
      data = JSON.parse(response.text);
    } catch (parseError) {
      throw new Error('Invalid JSON response from Gemini API', { cause: parseError });
    }

    // Security: Strict output sanitization - ensure only expected fields are returned and clamped
    const sanitized = {
      planet_name: String(data?.planet_name || "Unknown").substring(0, 50),
      life_stage: Math.max(0, Math.min(10, Number(data?.life_stage || 0))),
      dominant_species: String(data?.dominant_species || "Unknown").substring(0, 100),
      civilization: String(data?.civilization || "Unknown").substring(0, 100),
      biome: String(data?.biome || "Unknown").substring(0, 100)
    };

    res.json(sanitized);
  } catch (error: any) {
    if (error?.message === 'TIMEOUT') {
      return res.status(504).json({ error: 'Analysis service timed out.' });
    }
    // Security: Log only essential error message, avoid leaking details
    console.error('Gemini Analysis Error:', error?.message || 'Unknown error');
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (timeoutHandle!) clearTimeout(timeoutHandle);
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Unknown /api/* routes return JSON 404 instead of falling through to the
// SPA index.html fallback (which used to answer API typos with HTTP 200 HTML).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Security: Global error handler to prevent implementation detail leakage
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Error:', err?.message || 'Unknown error');
  res.status(500).json({ error: 'Internal Server Error' });
});

import { initWebSocketServer, closeWebSocketServer } from './src/simulation/SimStateSocket';

const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port} in ${process.env.NODE_ENV || 'development'} mode`);
});

initWebSocketServer(server, allowedOrigins);

let isShuttingDown = false;

// Graceful shutdown handler to allow active connections to drain
async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down server gracefully...`);

  try {
    await closeWebSocketServer();
  } catch (err) {
    console.error('Error closing WebSocket server:', err);
  }

  // Drain idle HTTP keep-alive connections so server.close() does not wait indefinitely
  if (typeof (server as any).closeIdleConnections === 'function') {
    (server as any).closeIdleConnections();
  }

  server.close(() => {
    console.log('HTTP and WebSocket server closed.');
    process.exit(0);
  });

  // Force close after 10 seconds if connections are keeping server alive
  setTimeout(() => {
    console.error('Forceful shutdown: active connections did not close within timeout.');
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
