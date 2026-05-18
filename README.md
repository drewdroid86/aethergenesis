<div align="center">

# Æ T H E R G E N E S I S

### A Living, Breathing Universe Built on Real and Theoretical Physics

[![Version](https://img.shields.io/badge/version-0.1.0-blueviolet?style=flat-square)](https://github.com/drewdroid86/aethergenesis/releases)
[![Stack](https://img.shields.io/badge/Three.js-r184-blue?style=flat-square)](https://threejs.org)
[![AI](https://img.shields.io/badge/Gemini_2.0_Flash-powered-orange?style=flat-square)](https://ai.google.dev)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Built on](https://img.shields.io/badge/built%20on-a%20phone-purple?style=flat-square)](https://drewdroid86.dev)

*"From the quantum foam of a single constant, entire civilizations rise and fall."*

[**▶ Launch Simulation**](https://aethergenesis.onrender.com) · [**Read the Story**](#the-story) · [**Roadmap**](#roadmap) · [**Join the Community**](#community)

</div>

---

## What Is This?

ÆTHERGENESIS is a real-time interactive universe simulator. You control the fundamental
physical constants — gravity, the fine-structure constant, the cosmological constant,
Planck's constant, the speed of light — and watch an entire cosmos respond.

Stars are born from nebulae. They ignite, stabilize, swell into red giants, detonate
as supernovae, and collapse into neutron stars or black holes. Planets form in habitable
zones. And with a single click, Gemini AI generates the civilizations that might have
evolved around any star you choose — civilizations whose fates are written by the very
constants you set.

Twist gravity too high and every star collapses before life can form.
Lower the fine-structure constant and atomic chemistry unravels.
Push the cosmological constant and the universe tears itself apart before the first sun ignites.

**This is not a game. It is a question: what if the numbers were different?**

---

## Features (v0.1.0)

| System | Status |
|--------|--------|
| 6-Phase Stellar Lifecycle (Nebula → Remnant) | ✅ Live |
| Real-time physics constant manipulation | ✅ Live |
| Performance-adaptive tier system (low → ultra) | ✅ Live |
| Cosmic age timeline scrubbing (0–14 Gyr) | ✅ Live |
| Gemini AI astrobiological civilization generation | ✅ Live |
| Frustum culling + distance LOD | ✅ Live |
| Cinematic bloom post-processing | ✅ Live |
| Neutron stars, pulsars, black holes with accretion disks | ✅ Live |
| Habitable zones + orbiting planets | ✅ Live |
| Galaxy arm spiral distribution | 🔜 Phase 2 |
| N-body gravity (Barnes-Hut) | 🔜 Phase 2 |
| Universe seeds / shareable constants | 🔜 Phase 4 |
| Procedural soundscape | 🔜 Phase 5 |
| WebGPU compute shaders | 🔜 Phase 6 |

---

## The Story

ÆTHERGENESIS was built by a self-taught developer on a single Android phone —
a Pixel 9 Pro running Termux — with no laptop, no desktop, no IDE.
Every line of code written on a 6.8 inch screen.

The architecture that powers it — Crucible — is itself a project:
a mobile-native AI development platform that turns a phone into a full
agentic engineering environment. Claude handles architecture and review.
Gemini CLI handles implementation. llama.cpp runs locally on the device
via Vulkan GPU acceleration.

This project is proof that the barrier to building serious software
is not hardware. It is vision.

---

## Tech Stack

- **Rendering:** Three.js r184 + WebGL 2 + custom GLSL shaders
- **Post-processing:** UnrealBloom + cinematic film grain pass
- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4
- **Backend:** Express + Gemini 2.0 Flash via @google/genai
- **Physics:** Custom stellar evolution engine (Barnes-Hut N-body in development)
- **Deployment:** Render.com (render.yaml configured)

---

## Quick Start

```bash
git clone https://github.com/drewdroid86/aethergenesis.git
cd aethergenesis
cp .env.example .env
# Add your GEMINI_API_KEY to .env
npm install
npm run dev