import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'aether-shaders-'));
const noise = readFileSync('src/shaders/utils/noise.glsl', 'utf8');
const vertexPrefix = 'precision highp float;\nattribute vec3 position;\nattribute vec3 normal;\nattribute vec2 uv;\nuniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform mat4 viewMatrix;\nuniform mat3 normalMatrix;\nuniform vec3 cameraPosition;\n';
const fragmentPrefix = 'precision highp float;\nuniform mat4 viewMatrix;\nuniform vec3 cameraPosition;\n';
try {
  const shaders = readdirSync('src/shaders').filter(name => /\.(vert|frag)\.glsl$/.test(name)).map(file => ({
    file, vertex: file.includes('.vert.'), source: readFileSync(join('src/shaders', file), 'utf8'),
  }));
  const inlinePath = 'src/simulation/phases/RemnantPhase.ts';
  const ast = ts.createSourceFile(inlinePath, readFileSync(inlinePath, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isPropertyAssignment(node) && ['vertexShader', 'fragmentShader'].includes(node.name.getText(ast))) {
      if (!ts.isNoSubstitutionTemplateLiteral(node.initializer) && !ts.isStringLiteral(node.initializer)) {
        throw new Error(`Unsupported shader expression in ${inlinePath}`);
      }
      const vertex = node.name.getText(ast) === 'vertexShader';
      shaders.push({ file: `RemnantPhase-${node.pos}.${vertex ? 'vert' : 'frag'}`, vertex, source: node.initializer.text });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const { file, vertex, source: raw } of shaders) {
    const source = raw.replace(/#include\s+<noise>/g, noise);
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
