import { createServer } from 'vite';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
// Standalone WebGL smoke check. Uses software rendering; timings are not device benchmarks.
// Optional: CHROME_PATH and APPEARANCE_ARTIFACT_DIR. Screenshots use fixed seed/time/cameras.
const root = fileURLToPath(new URL('../', import.meta.url));
const label = 'rendered';
const tmpDir = process.env.TMPDIR || join(root, 'tmp');
mkdirSync(tmpDir, { recursive: true });
const out = process.env.APPEARANCE_ARTIFACT_DIR || mkdtempSync(join(tmpDir, 'aether-appearance-'));
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpDir, 'aether-chrome-'));
const vite = await createServer({ root, server: { port: 4175, host: '127.0.0.1', hmr: false }, plugins: [{ name: 'test-page', configureServer(s) { s.middlewares.use((req, res, next) => { if (req.url !== '/__appearance__') return next(); res.setHeader('Content-Type', 'text/html'); res.end('<html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:black"></body></html>'); }); } }] });
let chrome;
let ws;
try {
await vite.listen();
const transformed = await vite.transformRequest('/src/rendering/stellarAppearance.ts');
const threeUrl = transformed.code.match(/from ["']([^"']*three[^"']*)["']/)?.[1];
assert.ok(threeUrl, 'Vite must resolve the shared Three.js module');
chrome = spawn(process.env.CHROME_PATH || '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=19225', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  chrome.on('error', () => {});
  let target;
  for (let i = 0; i < 100; i++) { try { const res = await fetch('http://127.0.0.1:19225/json/new?about:blank', { method: 'PUT' }); target = await res.json(); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  if (!target) throw new Error('Chromium failed to start; set CHROME_PATH to your Chromium executable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.on('message', bytes => {
    const message = JSON.parse(bytes);
    if (message.id) {
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      }
    } else if (message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      errors.push(message.params);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const callId = ++id; pending.set(callId, {resolve, reject}); ws.send(JSON.stringify({id: callId, method, params})); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 640, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:4175/__appearance__' });
  await new Promise(r => setTimeout(r, 300));
  for (const name of ['betelgeuse', 'sirius', 'protostar', 'black-hole', 'black-hole-face', 'black-hole-edge', 'black-hole-wide', 'black-hole-behind', 'sirius-low']) {
    const result = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const THREE = await import(${JSON.stringify(threeUrl)});
      const { Pipeline } = await import('/src/rendering/pipeline.ts');
      const { MainSequencePhase } = await import('/src/simulation/phases/MainSequencePhase.ts');
      const { RedGiantPhase } = await import('/src/simulation/phases/RedGiantPhase.ts');
      const { ProtostarPhase } = await import('/src/simulation/phases/ProtostarPhase.ts');
      const { RemnantPhase } = await import('/src/simulation/phases/RemnantPhase.ts');
      const { DEFAULT_CONSTANTS } = await import('/src/types/physics.ts');
      const { mulberry32 } = await import('/src/physics/math.ts');
      if (window.cleanup) window.cleanup();
      const originalRandom = Math.random;
      Math.random = mulberry32(1337);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050510);
      const group = new THREE.Group(); scene.add(group);
      const camera = new THREE.PerspectiveCamera(42, 960/640, 0.1, 1000);
      camera.position.set(0, 0, 4.6); camera.lookAt(0,0,0); camera.updateMatrixWorld();
      const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
      renderer.info.autoReset = false; renderer.setSize(960,640); renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2; renderer.outputColorSpace = THREE.SRGBColorSpace;
      document.body.appendChild(renderer.domElement);
      const shaderErrors = []; renderer.debug.onShaderError = (gl, program) => shaderErrors.push(gl.getProgramInfoLog(program));
      const name = ${JSON.stringify(name)};
      const bh = name.startsWith('black-hole');
      const phase = name === 'betelgeuse' ? new RedGiantPhase(1,3600) : name === 'protostar' ? new ProtostarPhase(1) : bh ? new RemnantPhase(21.2) : new MainSequencePhase(2.063,1);
      phase.init(group);
      phase.show(); phase.setOpacity?.(1);
      if (bh) {
        phase.update(0,12,camera.position,DEFAULT_CONSTANTS,1.55,false,1);
        const distance = name.endsWith('wide') ? 34 : 8.4;
        const elevation = name.endsWith('face') ? 1.5 : name.endsWith('edge') ? 0.02 : 0.2;
        camera.position.set(0, Math.sin(elevation)*distance, Math.cos(elevation)*distance).applyEuler(phase.blackHoleGroup.rotation);
        camera.lookAt(0,0,0); if (name.endsWith('behind')) camera.lookAt(camera.position.clone().multiplyScalar(2));
        camera.updateMatrixWorld(); group.updateMatrixWorld(true);
        phase.update(0,12,camera.position,DEFAULT_CONSTANTS,1.55,false,1);
      } else {
        phase.update(0,12,camera.position,DEFAULT_CONSTANTS,name === 'betelgeuse' ? 1.1 : 0.5,name.endsWith('low'),name === 'betelgeuse' ? 3600 : name === 'protostar' ? 4500 : 9940,name === 'betelgeuse' ? 2 : undefined);
        if (phase.hzMesh) phase.hzMesh.visible = false;
      }
      const pipeline = new Pipeline(renderer,scene,camera);
      const star = bh ? {phase:5,mass:21.2,position:group.position,scale:group.scale} : null;
      for(let i=0;i<8;i++) { pipeline.updateLensing(star,camera,0.1); pipeline.render(12,0); }
      const gl = renderer.getContext(); const pixel = new Uint8Array(4); gl.readPixels(480,320,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      const timings = [];
      for (let i=0;i<5;i++) { renderer.info.reset(); const t=performance.now(); pipeline.render(12,0); gl.readPixels(480,320,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel); timings.push(performance.now()-t); }
      timings.sort((a,b)=>a-b);
      const draws = renderer.info.render.calls;
      const passCount = pipeline.composer.passes.length;
      const lens = pipeline.lensingStrength;
      const shaderCount = renderer.info.programs.length;
      const badPrograms = renderer.info.programs.filter(p=>p.diagnostics?.runnable === false).length;
      Math.random = originalRandom;
      window.cleanup = () => { pipeline.dispose(); phase.dispose(); renderer.dispose(); renderer.domElement.remove(); };
      return {name, shaderErrors,badPrograms,shaderCount,draws,passCount,lens,center:Array.from(pixel), medianMs:timings[2],glError:gl.getError()};
    })()` });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    const data = result.result.value;
    console.log(JSON.stringify(data));
    assert.deepEqual(data.shaderErrors, [], `${name}: shader compiler errors`);
    assert.equal(data.badPrograms, 0);
    assert.equal(data.glError, 0, `${name}: WebGL errors`);
    assert.equal(data.passCount, 5, 'scene, bloom, lens, output, display grade');
    if (['black-hole', 'black-hole-face', 'black-hole-edge'].includes(name)) {
      assert.ok(data.lens > 0.9);
      assert.deepEqual(data.center.slice(0, 3), [0, 0, 0], `${name}: shadow stays black`);
    } else {
      assert.equal(data.lens, 0, `${name}: no active lens`);
    }
    if (name === 'betelgeuse') assert.ok(data.center[0] > data.center[1] && data.center[1] > data.center[2]);
    if (name.startsWith('sirius')) assert.ok(data.center[2] > data.center[0]);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${label}-${name}.png`, Buffer.from(shot.data, 'base64'));
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(`All 9 rendered scenarios passed. Screenshots: ${out}`);
} finally {
  ws?.close(); chrome?.kill('SIGKILL'); await vite.close();
  await new Promise(r=>setTimeout(r,200)); rmSync(profile,{recursive:true,force:true});
}
