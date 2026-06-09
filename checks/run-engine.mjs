#!/usr/bin/env node
/**
 * Runs siyf-chrome adjuster / engine test rings.
 * Expects SIYF_APP_ROOT to point at the monorepo checkout (contains siyf-chrome/).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.SIYF_APP_ROOT ?? path.join(watchRoot, '..'));
// Supports standalone siyf-engine repo or monorepo layout (siyf-chrome/)
const chromeRoot = [path.join(appRoot, 'siyf-chrome'), appRoot].find((candidate) =>
  fs.existsSync(path.join(candidate, 'package.json')),
) ?? path.join(appRoot, 'siyf-chrome');

const RINGS = [
  { id: 'ring1-adjuster', script: 'drift:check', description: 'Golden fixtures + invariants + kill switch' },
  { id: 'ring2-chaos', script: 'drift:chaos', description: 'Schema chaos simulator' },
  { id: 'ring6-merge', script: 'drift:merge', description: 'Merge + odds normalization' },
  { id: 'ring7-kill', script: 'drift:kill', description: 'Paid API kill switch stress' },
  { id: 'ring3-live', script: 'drift:live', description: 'Live multi-source smoke via SIYF-API', live: true },
];

function runNpm(script) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ...(script === 'drift:live' ? { SIYF_LIVE_DRIFT: '1' } : {}),
    };

    const child = spawn('npm', ['run', script], {
      cwd: chromeRoot,
      shell: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        healthy: code === 0,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      });
    });
  });
}

export async function runEngineChecks(options = {}) {
  const includeLive = options.includeLive !== false
    && process.env.SIYF_WATCH_OFFLINE_ONLY !== '1';
  const rings = includeLive ? RINGS : RINGS.filter((r) => !r.live);

  const results = [];
  for (const ring of rings) {
    const started = Date.now();
    const outcome = await runNpm(ring.script);
    results.push({
      id: ring.id,
      script: ring.script,
      description: ring.description,
      healthy: outcome.healthy,
      elapsedMs: Date.now() - started,
      exitCode: outcome.exitCode,
      stderrTail: outcome.stderr || undefined,
    });
  }

  const healthy = results.every((r) => r.healthy);
  return {
    kind: 'engine-checks',
    chromeRoot,
    checkedAt: new Date().toISOString(),
    healthy,
    rings: results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.healthy).length,
      failed: results.filter((r) => !r.healthy).length,
    },
  };
}

const isCli = process.argv[1]?.replace(/\\/g, '/').endsWith('checks/run-engine.mjs');
if (isCli) {
  const report = await runEngineChecks({
    includeLive: !process.argv.includes('--offline-only'),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.healthy ? 0 : 1);
}
