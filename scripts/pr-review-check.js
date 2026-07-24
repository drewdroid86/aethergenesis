import { execSync } from 'child_process';
import fs from 'fs';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return err.stdout ? err.stdout.trim() : '';
  }
}

function getChangedFiles() {
  let diff = run('git diff --name-only origin/main...HEAD');
  if (!diff) {
    diff = run('git diff --name-only main...HEAD');
  }
  if (!diff) {
    diff = run('git diff --name-only HEAD~1');
  }
  if (!diff) {
    diff = run('git status --porcelain').split('\n').map(l => l.slice(3)).join('\n');
  }
  return diff ? diff.split('\n').filter(Boolean) : [];
}

function checkPrCompliance() {
  console.log('🔍 Running ÆTHERGENESIS Automated PR Review Check...\n');

  const changedFiles = getChangedFiles();
  const fileCount = changedFiles.length;
  const projectLogUpdated = changedFiles.includes('PROJECT-LOG.md');
  const shaderFiles = changedFiles.filter(f => f.endsWith('.glsl') || f.includes('/shaders/'));
  const physicsFiles = changedFiles.filter(f => f.includes('StellarPhysics') || f.includes('OrbitalMechanics'));

  let status = 'PASSED';
  const warnings = [];
  const checks = [];

  // Check 1: File count discipline (Max 5 files recommended)
  if (fileCount > 5) {
    warnings.push(`⚠️ PR changes ${fileCount} files (recommended max is 5 files per branch). Consider splitting into smaller PRs.`);
    checks.push({ name: 'PR Scope Bounds', status: 'WARN', details: `${fileCount} files modified` });
  } else {
    checks.push({ name: 'PR Scope Bounds', status: 'PASS', details: `${fileCount} files modified (within ≤5 bound)` });
  }

  // Check 2: PROJECT-LOG.md update
  if (!projectLogUpdated) {
    warnings.push('⚠️ `PROJECT-LOG.md` was not updated in this PR. Shared state layer update is required.');
    checks.push({ name: 'PROJECT-LOG.md Updated', status: 'WARN', details: 'Missing entry' });
  } else {
    checks.push({ name: 'PROJECT-LOG.md Updated', status: 'PASS', details: 'Entry present' });
  }

  // Check 3: Typecheck verification
  try {
    execSync('node node_modules/typescript/bin/tsc --noEmit', { stdio: ['pipe', 'pipe', 'pipe'] });
    checks.push({ name: 'TypeScript Compilation (`tsc --noEmit`)', status: 'PASS', details: 'No type errors' });
  } catch {
    status = 'FAILED';
    checks.push({ name: 'TypeScript Compilation (`tsc --noEmit`)', status: 'FAIL', details: 'Type errors detected' });
  }

  // Check 4: ESLint verification
  try {
    execSync('node node_modules/eslint/bin/eslint.js .', { stdio: ['pipe', 'pipe', 'pipe'] });
    checks.push({ name: 'ESLint Code Hygiene', status: 'PASS', details: 'Clean lint' });
  } catch {
    warnings.push('⚠️ ESLint detected formatting or hygiene warnings.');
    checks.push({ name: 'ESLint Code Hygiene', status: 'WARN', details: 'Lint warnings present' });
  }

  // Generate Markdown Summary
  let report = `## 🤖 Automated PR Review Report\n\n`;
  report += `**Overall Status:** ${status === 'PASSED' ? '✅ PASSED' : '❌ FAILED'}\n\n`;
  report += `### 📋 Verification Checklist\n\n`;
  report += `| Check | Status | Details |\n`;
  report += `| :--- | :---: | :--- |\n`;
  checks.forEach(c => {
    const icon = c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
    report += `| ${c.name} | ${icon} ${c.status} | ${c.details} |\n`;
  });

  report += `\n### 📁 Changed Files (${fileCount})\n\n`;
  if (changedFiles.length > 0) {
    report += changedFiles.map(f => `- \`${f}\``).join('\n') + '\n\n';
  } else {
    report += `*No changed files detected relative to base branch.*\n\n`;
  }

  if (shaderFiles.length > 0) {
    report += `> 💡 **Shader Files Modified:** ${shaderFiles.map(f => `\`${f}\``).join(', ')}. Ensure WebGL GLSL compliance.\n\n`;
  }

  if (physicsFiles.length > 0) {
    report += `> ⚛️ **Physics Files Modified:** ${physicsFiles.map(f => `\`${f}\``).join(', ')}. Ensure citations are intact.\n\n`;
  }

  if (warnings.length > 0) {
    report += `### ⚠️ Reviewer Recommendations\n\n`;
    warnings.forEach(w => {
      report += `- ${w}\n`;
    });
    report += '\n';
  }

  fs.writeFileSync('pr-review-report.md', report);
  console.log(report);

  if (status === 'FAILED') {
    process.exit(1);
  }
}

checkPrCompliance();
