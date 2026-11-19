<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

<div align="center">

# ÆTHERGENESIS

**The Birth of Everything From Nothing.**

*13.8 billion years of cosmic evolution — your rules, your physics, your universe.*

[![Version](https://img.shields.io/badge/version-3.0.0-purple?style=flat-square)](CHANGELOG.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r184-000000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## ✨ What is ÆTHERGENESIS?

ÆTHERGENESIS is a **real-time universe simulation** with physics running in your browser and a backend for catalogs, AI analysis, and live state access. Its visuals combine astrophysical models with artistic approximations; it is not a research-grade cosmology or relativistic ray-tracing solver. Watch ~5,000 decorative background points and up to 600 simulated hero stars ignite at 'ultra' tier, galaxies spiral into being, comets trace Keplerian orbits, and civilizations rise and fall — all driven by real astrophysics and the fundamental constants *you* control.

Powered by **Three.js**, **WebGL/GLSL shaders**, **WebAudio synthesis**, and the **Google Gemini AI API**, it is equal parts simulation engine and interactive art installation.

---

## 🏗️ Architecture Topology

```mermaid
graph TD
    User["👤 Browser Client"] --> UI["⚛️ React 19 UI Layer (Hud, InspectPanel, CatalogPanel)"]
    UI --> Engine["🌌 Engine Core (src/core/engine.ts)"]
    UI --> Worker["⚡ N-Body WebWorker (Velocity-Verlet Integrator)"]
    Engine --> Render["🎨 Rendering Pipeline (EffectComposer + OutputPass ACES ToneMapping)"]
    Render --> Shaders["🔥 Custom GLSL Shaders (Star Surface, Nebula Raymarcher, Doppler Disk, Pulsar Jets)"]
    UI --> Audio["🎵 WebAudio Cosmic Synth Engine (AudioEngine.ts)"]
    Engine --> Server["🔌 Express 5 Backend & WebSocket Server (server.ts)"]
    Server --> Gemini["🤖 Google Gemini AI API (Stellar Telemetry & Analysis)"]
    Server --> SIMBAD["🔭 SIMBAD Astronomical Database API"]
    Server --> Horizons["☄️ NASA JPL Horizons Ephemeris API"]
```

---

## 🚀 Key Features

### 🎨 Cinematic Shaders & Visuals
- 🌟 **Planckian Blackbody Star Colors** — Star surface color continuously updates via physical temperature ($T \in [2,400\text{K}, 40,000\text{K}]$) across the H-R diagram.
- ☀️ **Granulation & Sunspots** — Star surfaces feature domain-warped 5-octave FBM noise with high-frequency granulation detail, and cell-darkened sunspots (`starSurface.frag.glsl`).
- 🌀 **Volumetric Gas Nebula** — Raymarched 3D gas cloud with emission lines, collapse dynamics, and unit-sphere scaling.
- 🕳️ **Relativistic Black Hole Accretion Disk** — Features **Doppler beaming** (approaching edge is Doppler-shifted blue and brightened $1.6\times$, receding edge is redshifted to deep crimson and dimmed $0.4\times$) and screen-space gravitational lensing distortion (`cinematic.frag.glsl`).
- ⚡ **Volumetric Pulsar Beams** — High-energy relativistic jets with 3D noise turbulence, cyan core glow, electric blue outer rims, and periodic time-dependent intensity modulation.
- 💫 **Dynamic Planet Orbit Lines** — Concentric glowing cyan trajectory line loops (`LineLoop`) rendering Keplerian planetary orbits in real time.
- 💥 **Supernova Shockwaves** — Dynamic radial UV wave displacement propagation during stellar supernova explosions.
- ✨ **Twinkling Background Stars** — Custom point shader with Gaussian radial falloff (`exp(-distSq * 14.0)`) and sinusoidal twinkling.

### 💥 Destruction encounters
- **Supernova:** use the HUD button to stage a massive star with four nearby worlds. Its expanding shell destroys reached bodies and leaves cooling debris instead of instantly hiding the planetary system.
- **Feed black hole:** stage four planets on plunging orbits. Watch them heat, stretch, shed glowing trails, and disappear at the visible shadow boundary. Outer stable orbits are not automatically consumed.
- Both buttons replace the selected star (or the first star if none is selected), frame the encounter, and resume playback. Encounter orbital time is slowed for visibility; selecting another star or changing time mode restores normal pacing.
- Destruction and capture remove bodies from the worker roster and enter the action log. Debris, tidal elongation, and the enlarged scene-scale destruction boundaries are cinematic approximations, not hydrodynamics or a relativistic tidal-disruption solver.

### 🎵 Immersive WebAudio Soundscapes
- 🛸 **Native WebAudio Ambient Synthesizer** — Zero-dependency procedural spatial soundscapes featuring multi-oscillator cosmic drones with LFO low-pass filter breathing.
- 🔊 **Stellar SFX** — Sub-bass supernova explosion bursts and subtle UI interaction clicks.
- 🔇 **HUD Audio Controls** — Instant mute/unmute toggle (`Volume2`/`VolumeX`) integrated into the HUD.

### 🤖 AI Telemetry & Real Astronomical Catalogs
- 🤖 **Gemini AI Stellar Analysis** — Click any star to open `InspectPanel` and trigger Google Gemini AI analysis for habitability scoring, civilization projections, and biome classification.
- 🔭 **Real Star Catalog & JPL Horizons Import** — Search SIMBAD TAP database, import NASA JPL Horizons small bodies (Halley, Encke, Ceres), and load famous star presets (TRAPPIST-1, Betelgeuse, Sirius A/B).

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| **3D Rendering** | Three.js r184, WebGL, Custom GLSL Shaders |
| **Post-Processing** | Three.js `EffectComposer`, `UnrealBloomPass`, `OutputPass` (ACES Filmic) |
| **Audio** | Native WebAudio API Synthesizer |
| **Physics** | Custom Velocity Verlet N-Body Sub-Stepped Integrator (Web Worker) |
| **AI Integration** | Google Gemini API (`@google/genai`) |
| **Backend & MCP** | Express 5, WebSocket (`ws`), MCP Servers (`nasa-horizons`, `sim-state`, `stellar-catalog`) |
| **Testing** | Regression suites, WebSocket/MCP checks, and standalone rendered smoke tests |
| **Deployment** | Render full application; GitHub Pages static frontend (see deployment limitations) |

---

## ⚡ Getting Started

### Prerequisites

- **Node.js** 22.13+ on the 22.x line (see [dependency requirements](docs/DEVELOPMENT.md)).
- A **Gemini API key** for optional AI analysis — obtain one at [aistudio.google.com](https://aistudio.google.com/apikey). The simulation does not require it.

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/drewdroid86/aethergenesis.git
   cd aethergenesis
   npm ci
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure the publisher tokens. Add the Gemini key for AI analysis and the separate control token for simulation MCP:
   ```env
   GEMINI_API_KEY="your-key-here"
   WS_TOKEN="a-strong-random-secret"
   VITE_WS_TOKEN="same-strong-random-secret"
   WS_CONTROL_TOKEN="a-different-strong-random-secret"
   ```

   `VITE_WS_TOKEN` is public in the browser bundle and permits state publishing.
   Keep `WS_CONTROL_TOKEN` private; the simulation MCP server uses it for control events.

3. **Run full application (Vite Client + Express WS Server):**
   ```bash
   npm run dev:full
   ```
   Or run in two separate terminals:
   ```bash
   # Terminal 1 — WebSocket & API server
   npm run server

   # Terminal 2 — Vite dev server
   npm run dev
   ```

4. **Open** [http://localhost:3000](http://localhost:3000)

---

## 🧪 Testing & Quality Verification

```bash
npm run lint       # ESLint and TypeScript
npm run build      # Production client bundle
npm test           # Registered suites, WebSocket auth, orbit rendering
npm run test:mcp   # Additional checks for MCP changes
```

Stop the development backend before `npm test`; the test runner starts its own
server on port 3001. Some catalog checks use external services. Browser appearance
and mobile layout checks run separately; see [development and testing](docs/DEVELOPMENT.md).

## 📚 Repository documentation

- [Repository map and architecture](docs/ARCHITECTURE.md): entry points, runtime flow, directory responsibilities, and API surface.
- [Development and operations](docs/DEVELOPMENT.md): environment variables, commands, tests, MCP setup, deployment, and troubleshooting.
- [Project rules](AGENTS.md): coding conventions and required checks.
- [Changelog](CHANGELOG.md) and [project log](PROJECT-LOG.md): release and session history.
- [Historical audits](docs/audits/) and [rendering exploration](docs/plans/RENDERING-MODEL-EXPLORATION.md): dated findings and proposals, not current setup instructions.

The full application expects its frontend, API, and WebSockets on the same
production origin. The GitHub Pages workflow publishes only static assets;
it does not connect them to Render automatically. See [deployment details](docs/DEVELOPMENT.md#deployment).

---

## ⌨️ Keyboard Shortcuts & HUD Controls

| Key | Action |
|-----|--------|
| `T` | Toggle timescale (Cosmic ↔ Realtime) |
| `C` | Open/close Physics Constants panel |
| `R` | Reset camera position and orientation |
| `F` | Focus camera on selected hero star |
| `Escape` | Deselect star / close InspectPanel |
| `Space` | Toggle cosmic time progression (play/pause) |
| `P` | Toggle simulation pause |
| `Alt + R` | Reset physics constants to defaults |
| `←` / `→` | Scrub selected star timeline |
| `Home` / `End` | Jump to start / end of stellar timeline |

> 💡 Hover over any HUD button to reveal tooltip shortcuts. Click the **Search** icon to open the Astronomical Catalog or the **Audio** icon to toggle soundscapes.

---

## 🔌 Antigravity 2.0 Plugin Integration

ÆTHERGENESIS is packaged as a native **Antigravity 2.0 Plugin** under `.agents/plugins/aethergenesis/`:

- **Manifest**: `plugin.json`
- **Agent Skills**:
  - `stellar-physics` — Mass-luminosity scaling, HR diagram mapping, phase transitions
  - `orbital-mechanics` — Keplerian elements, N-body solver, comet trajectories
  - `astrobiology` — Habitability scoring, HZ migration, atmosphere retention
  - `shader-optimization` — WebGL/GLSL cross-platform compliance, raymarching, tone mapping

The checked-in bundle contains the manifest, skills, and rules. MCP servers live in `server/mcp/` and require host configuration; see [MCP setup](docs/DEVELOPMENT.md#mcp-setup). The older [plugin implementation plan](AETHERGENESIS_AGY_PLUGIN.md) includes proposed files that are not currently shipped.

---

## 📄 License

MIT © [drewdroid86](https://github.com/drewdroid86)
