import fs from 'fs';
let code = fs.readFileSync('scripts/e2e/f3_galaxy.test.ts', 'utf8');
code = code.replace("import { physicsTick } from '../../src/simulation/nbodyWorker';", "");
code = code.replace("physicsTick();", "const { physicsTick } = await import('../../src/simulation/nbodyWorker.ts');\n  physicsTick();");
// wait, we call it in a loop too:
code = code.replace("for (let i = 0; i < 365 * 3; i++) {\n    physicsTick();\n  }", "for (let i = 0; i < 365 * 3; i++) {\n    physicsTick();\n  }"); // unchanged
// actually we just need to await import once before the test or at the top of the test
fs.writeFileSync('scripts/e2e/f3_galaxy.test.ts', code);
