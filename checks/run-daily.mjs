#!/usr/bin/env node
/**
 * Daily "makesure" — API health + engine rings + worker deployment status.
 * Writes reports/watch-YYYY-MM-DD.json and exits non-zero on any failure.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runApiHealthChecks } from './api-health.mjs';
import { runEngineChecks } from './run-engine.mjs';
import { runWranglerStatus } from './wrangler-status.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(watchRoot, 'reports');

const dateKey = new Date().toISOString().slice(0, 10);

async function main() {
  const includeLive = process.env.SIYF_WATCH_OFFLINE_ONLY !== '1';
  const started = Date.now();

  console.log('SIYF Watch — daily makesure\n');
  console.log(`API: ${process.env.SIYF_API_URL ?? 'https://siyf-api.nic-58f.workers.dev'}`);
  console.log(`App root: ${process.env.SIYF_APP_ROOT ?? '(parent directory)'}`);
  console.log(`Live smoke: ${includeLive ? 'yes' : 'no'}\n`);

  const [api, engine, wrangler] = await Promise.all([
    runApiHealthChecks(),
    runEngineChecks({ includeLive }),
    runWranglerStatus(),
  ]);

  const sections = [api, engine, wrangler];
  const healthy = sections.every((s) => s.skipped || s.healthy);

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    date: dateKey,
    healthy,
    elapsedMs: Date.now() - started,
    apiBase: api.apiBase,
    sections,
    failures: sections
      .filter((s) => !s.skipped && !s.healthy)
      .map((s) => ({ kind: s.kind, error: s.error ?? `${s.summary?.failed ?? '?'} check(s) failed` })),
  };

  await fs.mkdir(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, `watch-${dateKey}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\nReport: ${outPath}`);
  console.log(`Healthy: ${healthy ? 'YES' : 'NO'}`);
  for (const section of sections) {
    const label = section.kind;
    if (section.skipped) {
      console.log(`  ${label}: skipped (${section.reason})`);
    } else {
      console.log(`  ${label}: ${section.healthy ? 'pass' : 'FAIL'}`);
    }
  }

  process.exit(healthy ? 0 : 1);
}

main().catch((err) => {
  console.error('SIYF Watch crashed:', err);
  process.exit(1);
});
