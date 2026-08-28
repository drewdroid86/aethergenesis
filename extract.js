import fs from 'fs';

const serverTs = fs.readFileSync('server.ts', 'utf-8');
const mcpFile = fs.readFileSync('server/mcp/stellar-catalog.mjs', 'utf-8');

const presetsMatch = serverTs.match(/(const PRESETS: StarPreset\[\] = \[\s*\{[\s\S]*?\n\];)/);
let presetsStr = presetsMatch[1].replace('const PRESETS: StarPreset[] =', 'const PRESETS =');

const exoplanetsMatch = mcpFile.match(/(const EXOPLANETS = \[\s*\{[\s\S]*?\n\];)/);
const exoplanetsStr = exoplanetsMatch[1];

const estimateMatch = mcpFile.match(/(\/\*\*[\s\S]*?function estimateParams[\s\S]*?\n\})/);
const estimateStr = estimateMatch[1];

const outContent = `// Shared stellar catalog and utilities\n\n${presetsStr}\n\n${exoplanetsStr}\n\n${estimateStr}\n\nexport { PRESETS, EXOPLANETS, estimateParams };\n`;

fs.mkdirSync('server/shared', { recursive: true });
fs.writeFileSync('server/shared/stellarCatalog.mjs', outContent);
