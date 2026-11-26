#!/usr/bin/env sh
# Render build step for the full app (frontend + Express + WebSocket, same origin).
# VITE_WS_TOKEN is baked into the browser bundle at build time and must equal
# WS_TOKEN at runtime. Default it to WS_TOKEN so only one value needs setting.
set -eu

: "${WS_TOKEN:?WS_TOKEN is not set. Set it in the Render dashboard (openssl rand -hex 32).}"

VITE_WS_TOKEN="${VITE_WS_TOKEN:-$WS_TOKEN}"
if [ "$VITE_WS_TOKEN" != "$WS_TOKEN" ]; then
  echo "VITE_WS_TOKEN does not match WS_TOKEN. Remove VITE_WS_TOKEN or make them equal." >&2
  exit 1
fi
export VITE_WS_TOKEN

npm ci --include=dev
npm run build
