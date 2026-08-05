import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const targetFile = path.join(projectRoot, 'src/simulation/StellarPhysics.ts');

// Check stdin payload from Antigravity PostToolUse hook to filter by modified file path
try {
  if (!process.stdin.isTTY) {
    const stdinData = fs.readFileSync(0, 'utf8');
    if (stdinData.trim()) {
      const payload = JSON.parse(stdinData);
      const modifiedFile = payload?.toolCall?.args?.TargetFile || payload?.toolCall?.args?.AbsolutePath || '';
      if (modifiedFile && !modifiedFile.endsWith('StellarPhysics.ts')) {
        // File modified is not StellarPhysics.ts - skip verification
        process.exit(0);
      }
    }
  }
} catch {
  // If stdin read fails or is not a pipe (e.g., manual execution), continue running full verification
}

console.log('--- Verification Hook: StellarPhysics.ts ---');

if (!fs.existsSync(targetFile)) {
  console.error(`Error: ${targetFile} does not exist.`);
  process.exit(1);
}

const content = fs.readFileSync(targetFile, 'utf8');

// Parse exported compute/physics functions
const functionRegex = /\/\*\*([\s\S]*?)\*\/\s*export\s+function\s+([A-Za-z0-9_]+)/g;
let match;
let missingCitations = [];
let totalFunctionsChecked = 0;

while ((match = functionRegex.exec(content)) !== null) {
  totalFunctionsChecked++;
  const jsdoc = match[1];
  const funcName = match[2];
  
  if (!jsdoc.includes('@citation')) {
    missingCitations.push(funcName);
  }
}

if (missingCitations.length > 0) {
  console.error(`❌ CITATION CHECK FAILED: The following physics equations/functions in StellarPhysics.ts lack @citation docstrings:`);
  missingCitations.forEach(fn => console.error(`  - ${fn}`));
  process.exit(1);
} else {
  console.log(`✅ Citation Check Passed: All ${totalFunctionsChecked} physics compute functions contain literature citations.`);
}

// Run TypeScript type check
console.log('Running tsc --noEmit...');
try {
  execSync('node node_modules/typescript/bin/tsc --noEmit', {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('✅ Typecheck Passed (tsc --noEmit).');
} catch {
  console.error('❌ TYPECHECK FAILED: tsc --noEmit reported errors.');
  process.exit(1);
}

console.log('✅ All StellarPhysics verification checks passed successfully.');
process.exit(0);
