import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

app.post('/api/analyze', async (req, res) => {
  if (!genAI) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const { temp, mass, lum, age, phase, G, alpha } = req.body;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: "You are an astrobiology analytical engine. Generate creative but scientifically cohesive species and civilizations based on the star's phase, temp, and constants.",
    });

    const prompt = `Analyze a generic star based on physical constants (G=${G}, alpha=${alpha}) and its star properties (Temp=${temp}K, Mass=${mass}M, Lum=${lum}L, Age=${age}Myr, Phase=${phase}). Return a JSON with properties: planet_name (string), life_stage (number), dominant_species (string), civilization (string), biome (string).`;

    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        planet_name: { type: SchemaType.STRING },
        life_stage: { type: SchemaType.INTEGER },
        dominant_species: { type: SchemaType.STRING },
        civilization: { type: SchemaType.STRING },
        biome: { type: SchemaType.STRING },
      },
      required: ["planet_name", "life_stage", "dominant_species", "civilization", "biome"],
    };

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const response = result.response;
    const text = response.text();
    res.json(JSON.parse(text));
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
    res.status(500).json({
      planet_name: "Kerath-7",
      life_stage: 4,
      dominant_species: "Silicate Swarm",
      civilization: "Post-Scarcity Hive",
      biome: "Crystalline Deserts",
      note: "Predictive fallback due to server error"
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
