import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'aether-shaders-'));
const noise = readFileSync('src/shaders/utils/noise.glsl', 'utf8');
const vertexPrefix = 'precision highp float;\nattribute vec3 position;\nattribute vec3 normal;\nattribute vec2 uv;\nuniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform mat4 viewMatrix;\nuniform mat3 normalMatrix;\nuniform vec3 cameraPosition;\n';
const fragmentPrefix = 'precision highp float;\nuniform mat4 viewMatrix;\nuniform vec3 cameraPosition;\n';
try {
  for (const file of readdirSync('src/shaders').filter(name => /\.(vert|frag)\.glsl$/.test(name))) {
    const vertex = file.includes('.vert.');
    const source = readFileSync(join('src/shaders', file), 'utf8').replace(/#include\s+<noise>/g, noise);
    const target = join(dir, file);
    writeFileSync(target, (vertex ? vertexPrefix : fragmentPrefix) + source);
    console.log(`Checking ${file}`);
    const result = spawnSync('glslangValidator', ['-S', vertex ? 'vert' : 'frag', target], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
