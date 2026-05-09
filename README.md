<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4ce5a106-c948-4883-98a8-53f831cffe75

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy the env file and add your Gemini API key:
   `cp .env.example .env`
   Then edit .env and set GEMINI_API_KEY to your key.
3. Run both frontend and server together:
   `npm run dev:full`
   Or run them separately in two terminals:
   Terminal 1: `npm run server`
   Terminal 2: `npm run dev`
4. Open http://localhost:3000

## Deploy to Render
- Connect your GitHub repo to Render
- The render.yaml file handles all build and start configuration
- Set GEMINI_API_KEY as a secret environment variable in the 
  Render dashboard under Environment settings
