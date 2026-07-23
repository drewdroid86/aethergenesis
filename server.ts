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
}

const PRESETS: StarPreset[] = [
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
    literature_reference: "Carroll & Ostlie §13.2",
    planets: [
      { name: "Mercury", distance_au: 0.39, mass_earth: 0.055, radius_earth: 0.383, type: "rocky" },
      { name: "Venus", distance_au: 0.72, mass_earth: 0.815, radius_earth: 0.949, type: "rocky" },
      { name: "Earth", distance_au: 1.0, mass_earth: 1.0, radius_earth: 1.0, type: "rocky" },
      { name: "Mars", distance_au: 1.52, mass_earth: 0.107, radius_earth: 0.532, type: "rocky" },
      { name: "Jupiter", distance_au: 5.2, mass_earth: 317.8, radius_earth: 11.2, type: "gas_giant" },
      { name: "Saturn", distance_au: 9.58, mass_earth: 95.2, radius_earth: 9.45, type: "gas_giant" },
      { name: "Uranus", distance_au: 19.2, mass_earth: 14.5, radius_earth: 4.0, type: "gas_giant" },
      { name: "Neptune", distance_au: 30.05, mass_earth: 17.1, radius_earth: 3.88, type: "gas_giant" }
    ]
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
    literature_reference: "Anglada-Escudé et al. 2016",
    planets: [
      { name: "Proxima Centauri b", distance_au: 0.0485, mass_earth: 1.17, radius_earth: 1.03, type: "rocky" },
      { name: "Proxima Centauri c", distance_au: 1.48, mass_earth: 7.0, radius_earth: 2.1, type: "rocky" },
      { name: "Proxima Centauri d", distance_au: 0.029, mass_earth: 0.26, radius_earth: 0.81, type: "rocky" }
    ]
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
    literature_reference: "Torres et al. 2015",
    planets: [
      { name: "Kepler-442b", distance_au: 0.409, mass_earth: 2.3, radius_earth: 1.34, type: "rocky" }
    ]
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
    literature_reference: "Teixeira et al. 2009",
    planets: [
      { name: "Tau Ceti b", distance_au: 0.105, mass_earth: 2.0, radius_earth: 1.2, type: "rocky" },
      { name: "Tau Ceti g", distance_au: 0.133, mass_earth: 1.75, radius_earth: 1.1, type: "rocky" },
      { name: "Tau Ceti h", distance_au: 0.243, mass_earth: 1.83, radius_earth: 1.1, type: "rocky" },
      { name: "Tau Ceti e", distance_au: 0.538, mass_earth: 3.93, radius_earth: 1.5, type: "rocky" },
      { name: "Tau Ceti f", distance_au: 1.334, mass_earth: 3.93, radius_earth: 1.5, type: "rocky" }
    ]
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
  },
  {
    name: "TRAPPIST-1",
    spectral_class: "M8V",
    mass_solar: 0.089,
    luminosity_solar: 0.000553,
    temperature_K: 2566,
    radius_solar: 0.121,
    metallicity_Z: 0.02,
    distance_ly: 40.66,
    age_gyr: 7.6,
    known_planets: 7,
    habitable_zone_inner_au: 0.022,
    habitable_zone_outer_au: 0.038,
    chandrasekhar_relevant: false,
    literature_reference: "Gillon et al. 2017",
    planets: [
      { name: "TRAPPIST-1 b", distance_au: 0.0115, mass_earth: 1.374, radius_earth: 1.116, type: "rocky" },
      { name: "TRAPPIST-1 c", distance_au: 0.0158, mass_earth: 1.308, radius_earth: 1.097, type: "rocky" },
      { name: "TRAPPIST-1 d", distance_au: 0.0223, mass_earth: 0.388, radius_earth: 0.788, type: "rocky" },
      { name: "TRAPPIST-1 e", distance_au: 0.0293, mass_earth: 0.692, radius_earth: 0.920, type: "rocky" },
      { name: "TRAPPIST-1 f", distance_au: 0.0385, mass_earth: 1.039, radius_earth: 1.045, type: "rocky" },
      { name: "TRAPPIST-1 g", distance_au: 0.0469, mass_earth: 1.321, radius_earth: 1.129, type: "rocky" },
      { name: "TRAPPIST-1 h", distance_au: 0.0619, mass_earth: 0.326, radius_earth: 0.755, type: "rocky" }
    ]
  },
  {
    name: "Kepler-186",
    spectral_class: "M",
    mass_solar: 0.54,
    luminosity_solar: 0.055,
    temperature_K: 3788,
    radius_solar: 0.52,
    metallicity_Z: 0.015,
    distance_ly: 582.0,
    age_gyr: 4.0,
    known_planets: 5,
    habitable_zone_inner_au: 0.22,
    habitable_zone_outer_au: 0.43,
    chandrasekhar_relevant: false,
    literature_reference: "Quintana et al. 2014",
    planets: [
      { name: "Kepler-186f", distance_au: 0.432, mass_earth: 1.4, radius_earth: 1.17, type: "rocky" }
    ]
  },
  {
    name: "Kepler-22b",
    spectral_class: "G5V",
    mass_solar: 0.97,
    luminosity_solar: 0.79,
    temperature_K: 5518,
    radius_solar: 0.98,
    metallicity_Z: 0.02,
    distance_ly: 635.0,
    age_gyr: 4.0,
    known_planets: 1,
    habitable_zone_inner_au: 0.85,
    habitable_zone_outer_au: 1.2,
    chandrasekhar_relevant: true,
    literature_reference: "Borucki et al. 2012",
    planets: [
      { name: "Kepler-22b", distance_au: 0.849, mass_earth: 8.3, radius_earth: 2.4, type: "rocky" }
    ]
  }
];

function estimateParams(spType: string) {
  let mass = 1.0;
  let temp = 5778;
  let rad = 1.0;
  let lum = 1.0;
  const metallicity = 0.02;

  if (!spType) return { mass_solar: mass, temperature_K: temp, radius_solar: rad, luminosity_solar: lum, metallicity_Z: metallicity };

  const cleanSp = spType.trim().toUpperCase();
  const match = cleanSp.match(/^([OBAFGKM])([0-9])?/);
  if (match) {
    const letter = match[1];
    const num = match[2] ? parseInt(match[2], 10) : 5;

    const tempMap: Record<string, [number, number]> = {
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

    const massMap: Record<string, [number, number]> = {
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

    const radMap: Record<string, [number, number]> = {
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

function parseOrbitalElements(text: string) {
  const soeIdx = text.indexOf('$$SOE');
  const eoeIdx = text.indexOf('$$EOE');
  if (soeIdx === -1 || eoeIdx === -1) {
    throw new Error('Could not find $$SOE or $$EOE markers in Horizons response');
  }
  const dataBlock = text.substring(soeIdx + 5, eoeIdx).trim();

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

  if (perihelion_au > 1000) {
    const kmToAu = 149597870.7;
    perihelion_au = perihelion_au / kmToAu;
    semi_major_axis_au = semi_major_axis_au / kmToAu;
    aphelion_au = aphelion_au / kmToAu;
  }

  let period_yr = null;
  if (prMatch) {
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

    try {
      const epoch = '2000-01-01';
      const stopStr = '2000-01-02';
      const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&EPHEM_TYPE=ELEMENTS&COMMAND='${encodeURIComponent(bodyId)}'&MAKE_EPHEM=YES&CENTER=500@10&START_TIME=${epoch}&STOP_TIME=${stopStr}&STEP_SIZE=1d&OBJ_DATA=YES`;
      
      const response = await fetchWithTimeout(url);
      if (response.status !== 200) {
        return res.status(400).json({ error: 'Horizons API returned non-200' });
      }
      const data = await response.json();
      if (data.error || !data.result) {
        return res.status(400).json({ error: data.error || 'No results from Horizons' });
      }
      
      // Check if result is ambiguous/search list
      let resultText = data.result;
      if (!resultText.includes('$$SOE')) {
        // Resolve ambiguous or fallback to error
        const lines = resultText.split('\n');
        const recordNumbers = [];
        for (const line of lines) {
          const match = line.trim().match(/^(\d+)\s+(-?\d+)\s+/);
          if (match) {
            recordNumbers.push(match[1]);
          }
        }
        if (recordNumbers.length > 0) {
          const bestRecord = recordNumbers[recordNumbers.length - 1];
          const retryUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&EPHEM_TYPE=ELEMENTS&COMMAND=${encodeURIComponent("'" + bestRecord + ";'")}&MAKE_EPHEM=YES&CENTER=500@10&START_TIME=${epoch}&STOP_TIME=${stopStr}&STEP_SIZE=1d&OBJ_DATA=YES`;
          const retryRes = await fetchWithTimeout(retryUrl);
          const retryData = await retryRes.json();
          if (retryData.error || !retryData.result) {
            return res.status(400).json({ error: 'Failed on retry' });
          }
          resultText = retryData.result;
        } else {
          return res.status(400).json({ error: 'Ambiguous body' });
        }
      }
      
      const parsed = parseOrbitalElements(resultText);
      const nameMatch = resultText.match(/Target body name:\s*([^\n\r{]*)/i);
      const bodyName = nameMatch ? nameMatch[1].trim() : bodyId;
      
      return res.json({
        body_name: bodyName,
        naif_id: bodyId,
        ...parsed,
        source: 'NASA JPL Horizons',
      });
    } catch (err) {
      // Security: Log detailed error internally, return generic message to client
      console.error('Horizons body lookup error:', err);
      return res.status(400).json({ error: 'Failed to retrieve data from Horizons API.' });
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

import { initWebSocketServer } from './src/simulation/SimStateSocket';

const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port} in ${process.env.NODE_ENV || 'development'} mode`);
});

initWebSocketServer(server, allowedOrigins);

// Graceful shutdown handler to allow active connections to drain
function handleShutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down server gracefully...`);
  server.close(() => {
    console.log('HTTP and WebSocket server closed.');
    process.exit(0);
  });

  // Force close after 10 seconds if connections are keeping server alive
  setTimeout(() => {
    console.error('Forceful shutdown: active connections did not close within timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
