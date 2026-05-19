import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Security: Defense in depth - minimize fingerprinting
app.disable('x-powered-by');

// Security: Trust proxy for correct IP detection in rate limiting (e.g., on Render)
app.set('trust proxy', 1);

// Security: Limit payload size to mitigate DoS risks
app.use(express.json({ limit: '10kb' }));

// Security: Set enhanced security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data: https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');
app.use((req, res, next) => { 
    const origin = req.headers.origin; 
    if (origin && allowedOrigins.includes(origin)) { 
        res.setHeader('Access-Control-Allow-Origin', origin); 
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); 
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); 
    } 
    if (req.method === 'OPTIONS') return res.sendStatus(204); 
    next(); 
});

// Security: Simple in-memory rate limiting for AI analysis
interface RateLimitData {
  count: number;
  windowStart: number;
}
const analysisLimitMap = new Map<string, RateLimitData>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;
const _MAX_ENTRIES = 1000; // Memory protection

// Periodic cleanup to prevent memory exhaustion
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of analysisLimitMap.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW) analysisLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW);

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.post('/api/analyze', async (req, res) => {
  if (!ai) {
    // Security: Generic error message to avoid leaking server config
    return res.status(503).json({ error: 'Analysis service currently unavailable.' });
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
  analysisLimitMap.set(ip, record);

  const { temp, mass, lum, age, phase, G, alpha } = req.body;

  // Security: Input validation and sanitization to prevent prompt injection and malformed requests
  const VALID_PHASES = [
    "Nebula", "Protostar", "Main Sequence",
    "Red Giant", "Supernova", "Remnant"
  ];

  const isValidNumber = (val: any) => typeof val === 'number' && !isNaN(val) && isFinite(val);

  if (!isValidNumber(temp) || temp <= 0 ||
      !isValidNumber(mass) || mass <= 0 ||
      !isValidNumber(lum) || lum < 0 ||
      !isValidNumber(age) || age < 0 ||
      !isValidNumber(G) || G <= 0 ||
      !isValidNumber(alpha) || alpha <= 0 ||
      typeof phase !== 'string' || !VALID_PHASES.includes(phase)) {
    return res.status(400).json({ error: 'Invalid input parameters.' });
  }

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

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an astrobiology analytical engine. Generate creative but scientifically cohesive species and civilizations based on the star's phase, temp, and constants.",
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: 256, // Security: Resource exhaustion protection
      }
    });

    if (!response.text) {
      throw new Error('No response text from Gemini API');
    }

    let data;
    try {
      data = JSON.parse(response.text);
    } catch (parseError) {
      throw new Error('Invalid JSON response from Gemini API');
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
    // Security: Log only essential error message, avoid leaking details
    console.error('Gemini Analysis Error:', error?.message || 'Unknown error');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
