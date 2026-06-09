#!/usr/bin/env node
/**
 * Confirms the Cloudflare worker is deployed (uses wrangler CLI).
 * Skips gracefully when CLOUDFLARE_API_TOKEN is not set.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.SIYF_APP_ROOT ?? path.join(watchRoot, '..'));
const apiRoot = path.join(appRoot, 'siyf-api');

function runWrangler(args) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['wrangler', ...args], {
      cwd: apiRoot,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function runWranglerStatus() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    return {
      kind: 'wrangler-status',
      checkedAt: new Date().toISOString(),
      healthy: true,
      skipped: true,
      reason: 'CLOUDFLARE_API_TOKEN not set — skipping deployment check',
    };
  }

  const result = await runWrangler(['deployments', 'list', '--json']);
  const healthy = result.code === 0 && result.stdout.trim().length > 0;

  let deployments = [];
  if (healthy) {
    try {
      deployments = JSON.parse(result.stdout);
    } catch {
      deployments = [{ raw: result.stdout.slice(0, 500) }];
    }
  }

  return {
    kind: 'wrangler-status',
    checkedAt: new Date().toISOString(),
    healthy,
    skipped: false,
    worker: 'siyf-api',
    deployments: Array.isArray(deployments) ? deployments.slice(0, 3) : deployments,
    error: healthy ? undefined : (result.stderr || 'wrangler deployments list failed').slice(0, 500),
  };
}

const isCli = process.argv[1]?.replace(/\\/g, '/').endsWith('checks/wrangler-status.mjs');
if (isCli) {
  const report = await runWranglerStatus();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.skipped || report.healthy ? 0 : 1);
}
