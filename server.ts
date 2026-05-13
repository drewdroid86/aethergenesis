import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import path from 'path';
import { rateLimit } from 'express-rate-limit';

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
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;");
  next();
});

// Security: Robust rate limiting for AI analysis
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests. Please slow down.' }
});

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.post('/api/analyze', analysisLimiter, async (req, res) => {
  if (!ai) {
    // Security: Generic error message to avoid leaking server config
    return res.status(503).json({ error: 'Analysis service currently unavailable.' });
  }

  const { temp, mass, lum, age, phase, G, alpha } = req.body;

  // Security: Input validation and sanitization to prevent prompt injection and malformed requests
  const VALID_PHASES = [
    "Nebula Formation", "Protostar Ignition", "Main Sequence",
    "Red Giant", "Supernova", "Stellar Remnant"
  ];

  const isValidNumber = (val: any) => typeof val === 'number' && !isNaN(val) && isFinite(val);

  if (!isValidNumber(temp) || !isValidNumber(mass) || !isValidNumber(lum) ||
      !isValidNumber(age) || !isValidNumber(G) || !isValidNumber(alpha) ||
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
      }
    });

    if (!response.text) {
      throw new Error('No response text from Gemini API');
    }

    const data = JSON.parse(response.text);

    // Security: Strict output sanitization - ensure only expected fields are returned
    const sanitized = {
      planet_name: String(data.planet_name || "Unknown"),
      life_stage: Number(data.life_stage || 0),
      dominant_species: String(data.dominant_species || "Unknown"),
      civilization: String(data.civilization || "Unknown"),
      biome: String(data.biome || "Unknown")
    };

    res.json(sanitized);
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
    // Security: Return generic error without leaking expected data structures
    res.status(500).json({ error: 'Deep scan failed. Please try again later.' });
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
