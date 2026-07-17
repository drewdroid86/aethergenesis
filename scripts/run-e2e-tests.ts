/* eslint-disable */
import { spawn } from 'child_process';
import { createServer } from 'http';
import WebSocket from 'ws';

const PORT = 3001;
const HEALTH_URL = `http://localhost:${PORT}/health`;
const TEST_TOKEN = 'test_secret';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isServerReady(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL);
    if (res.status === 200) {
      const data = await res.json();
      return data.status === 'ok';
    }
  } catch (err) {
    // Ignore connection errors during startup
  }
  return false;
}

async function runTestFile(filePath: string): Promise<boolean> {
  console.log(`\n========================================`);
  console.log(`Running Test Suite: ${filePath}`);
  console.log(`========================================`);

  return new Promise((resolve) => {
    const child = spawn('node', ['node_modules/tsx/dist/cli.mjs', '--test', filePath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WS_TOKEN: TEST_TOKEN,
        PORT: PORT.toString(),
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[PASS] ${filePath}\n`);
        resolve(true);
      } else {
        console.log(`[FAIL] ${filePath} (Exit code: ${code})\n`);
        resolve(false);
      }
    });
  });
}

async function main() {
  console.log('Starting E2E Test Runner...');

  // Start Express/WebSocket Server in background
  const serverProcess = spawn('node', ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    env: {
      ...process.env,
      PORT: PORT.toString(),
      NODE_ENV: 'development',
      WS_TOKEN: TEST_TOKEN,
      ALLOWED_ORIGINS: `http://localhost:3000,http://localhost:5173,http://localhost:${PORT}`,
    }
  });

  // Log server output to console in debug mode
  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (process.env.DEBUG_SERVER) {
        console.log(`[SERVER] ${msg}`);
      }
    });
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (data) => {
      console.error(`[SERVER-ERROR] ${data.toString().trim()}`);
    });
  }

  // Poll server health with timeout of 15 seconds
  let ready = false;
  for (let i = 0; i < 15; i++) {
    ready = await isServerReady();
    if (ready) break;
    await delay(1000);
  }

  if (!ready) {
    console.error('Error: Server failed to start or respond to health checks in time.');
    serverProcess.kill('SIGTERM');
    process.exit(1);
  }

  console.log('Server is online. Executing E2E test suites...');

  const testFiles = [
    'scripts/e2e/f1_presets.test.ts',
    'scripts/e2e/f2_ui_modes.test.ts',
    'scripts/e2e/f3_galaxy.test.ts',
    'scripts/e2e/f4_comet.test.ts',
  ];

  let allPassed = true;
  for (const file of testFiles) {
    const success = await runTestFile(file);
    if (!success) {
      allPassed = false;
    }
  }

  // Graceful shutdown of the server
  console.log('Cleaning up server process...');
  serverProcess.kill('SIGTERM');

  await delay(1000); // Wait for socket cleanup

  if (allPassed) {
    console.log('========================================');
    console.log('ALL E2E TEST SUITES PASSED SUCCESSFULLY');
    console.log('========================================');
    process.exit(0);
  } else {
    console.log('========================================');
    console.log('SOME E2E TEST SUITES FAILED');
    console.log('========================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled runner error:', err);
  process.exit(1);
});
