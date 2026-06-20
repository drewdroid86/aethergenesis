<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

<div align="center">

# ÆTHERGENESIS

**The Birth of Everything From Nothing.**

*13.8 billion years of cosmic evolution — your rules, your physics, your universe.*

[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r184-000000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## ✨ What is ÆTHERGENESIS?

ÆTHERGENESIS is a **physically accurate, real-time universe simulation** running entirely in your browser. Watch 500,000 stars ignite, galaxies spiral into being, comets trace Keplerian orbits, and civilizations rise and fall — all driven by real astrophysics and the fundamental constants *you* control.

Powered by **Three.js**, **WebGL/GLSL shaders**, and the **Gemini AI API**, it's equal parts simulation engine and interactive art installation.

---

## 🚀 Features

- 🌟 **500,000 Instanced Stars** — Realistic IMF (Initial Mass Function) color distribution across the full HR diagram
- 🌀 **Logarithmic Spiral Galaxy** — Procedurally generated with advanced post-processing bloom and glow
- ⚛️ **Real-time N-body Physics** — Velocity Verlet integrator running in a dedicated Web Worker, optimized with pre-cached inverse masses and softened gravitational force calculations
- ☄️ **Keplerian Comet System** — 5 comets with pre-calculated orbital constants (eccentricity, semi-latus rectum, inclination) for zero per-frame trig overhead
- 🔵 **Dyson Swarm** — Unlocked at Kardashev Tier 2, rendered as an animated instanced mesh
- 🤖 **Gemini AI Stellar Telemetry** — Click any star to open the InspectPanel and get AI-powered stellar classification, habitability analysis, and civilization projections
- 🔌 **Secure WebSocket Sync** — Real-time simulation state synchronization via hardened WebSocket server (wss://, token auth, CSP-restricted)
- ⌨️ **Cinematic HUD** — Keyboard-driven interface with hover-revealed shortcut hints
- ♿ **Full Accessibility** — ARIA labels, `aria-live` regions, semantic roles throughout
- 🎬 **Framer Motion Transitions** — Cinematic slide+blur animations on all floating panels

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 6, Vite 8 |
| **3D Rendering** | Three.js r184, WebGL, Custom GLSL Shaders |
| **Animation** | Framer Motion 12 |
| **Physics** | Custom Velocity Verlet n-body (Web Worker) |
| **AI** | Google Gemini API (`@google/genai`) |
| **Backend** | Express 5, WebSocket (`ws`) |
| **Styling** | Tailwind CSS 4 |
| **Deployment** | GitHub Pages (frontend) + Render (backend) |

---

## ⚡ Getting Started

### Prerequisites

- **Node.js** v20+
- A **Gemini API key** — get one free at [aistudio.google.com](https://aistudio.google.com/apikey)

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/drewdroid86/aethergenesis.git
   cd aethergenesis
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set at minimum:
   ```env
   GEMINI_API_KEY="your-key-here"
   WS_TOKEN="a-strong-random-secret"
   VITE_WS_TOKEN="same-strong-random-secret"
   ```

3. **Run both frontend and server together:**
   ```bash
   npm run dev:full
   ```
   Or in two separate terminals:
   ```bash
   # Terminal 1 — WebSocket simulation server
   npm run server

   # Terminal 2 — Vite dev server
   npm run dev
   ```

4. **Open** [http://localhost:3000](http://localhost:3000)

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `T` | Toggle timescale (Cosmic ↔ Realtime) |
| `C` | Open/close Physics Constants panel |
| `Escape` | Deselect star / close InspectPanel |
| `Alt + R` | Reset simulation |
| `←` / `→` | Scrub selected star timeline |
| `Home` / `End` | Jump to start / end of stellar timeline |

> 💡 Hover over any HUD control to reveal its keyboard shortcut.

---

## 🔧 Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | Gemini AI API key for stellar telemetry |
| `WS_TOKEN` | ✅ Yes (prod) | WebSocket auth token — **never use default in production** |
| `VITE_WS_TOKEN` | ✅ Yes (prod) | Client-side WS token (must match `WS_TOKEN`) |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated allowed CORS origins |
| `APP_URL` | Recommended | Your public app URL |
| `SIM_PORT` | Optional | WebSocket server port (default: `3001`) |
| `NODE_ENV` | Optional | Set to `production` for hardened security checks |

> ⚠️ **Security:** The server will **reject all WebSocket connections** if `WS_TOKEN` is still set to `default_secret` in production mode (`NODE_ENV=production`).

---

## 🚢 Deployment

### GitHub Pages (Frontend)

The frontend deploys automatically via GitHub Actions on every push to `main`. See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### Render (Backend Server)

1. Connect your GitHub repo to [Render](https://render.com)
2. The [`render.yaml`](render.yaml) file handles all build and start configuration automatically
3. Set the following environment variables in the Render dashboard:
   - `GEMINI_API_KEY` — your Gemini API key
   - `WS_TOKEN` — a strong random secret (`openssl rand -hex 32`)
   - `APP_URL` — your Render service URL
   - `NODE_ENV=production`

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repo and create a feature branch
2. Ensure `npm run lint` passes (TypeScript type-check)
3. Ensure `npm run build` succeeds
4. Open a pull request against `main`

---

## 📄 License

MIT © [drewdroid86](https://github.com/drewdroid86)
