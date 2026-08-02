# Rule: TypeScript Hygiene

1. tsc --noEmit must pass with zero errors before every commit.
2. All StellarState numeric fields must have unit suffixes:
   _solar, _K, _yr, _km, _au, _deg
3. No 'any' types in simulation files (src/simulation/, src/core/)
4. MCP server files (server/mcp/*.mjs) are excluded from tsconfig.
5. Web Worker files must never import from src/rendering/ or Three.js.
6. After every Antigravity agent edit session: run tsc --noEmit.
   Do not commit if errors exist.
