#!/usr/bin/env node
/**
 * Opens or updates a GitHub issue when daily makesure fails.
 * Uses gh CLI (available in GitHub Actions by default).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchRoot = path.resolve(__dirname, '..');

function runGh(args) {
  return new Promise((resolve) => {
    const child = spawn('gh', args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function buildBody(report) {
  const lines = [
    '## SIYF Watch — daily makesure failed',
    '',
    `**Date:** ${report.date}`,
    `**Generated:** ${report.generatedAt}`,
    `**API:** ${report.apiBase}`,
    '',
    '### Failed sections',
  ];

  for (const failure of report.failures ?? []) {
    lines.push(`- **${failure.kind}**: ${failure.error}`);
  }

  if (report.sections) {
    lines.push('', '### Section summary');
    for (const section of report.sections) {
      if (section.skipped) {
        lines.push(`- ${section.kind}: skipped`);
        continue;
      }
      const detail = section.summary
        ? `${section.summary.passed}/${section.summary.total} passed`
        : (section.healthy ? 'ok' : 'failed');
      lines.push(`- ${section.kind}: ${detail}`);
    }
  }

  lines.push(
    '',
    '### What to do',
    '1. Open the failed workflow run logs in GitHub Actions',
    '2. Download the `watch-report` artifact',
    '3. Patch `registry.ts` / API / engine as needed',
    '4. Re-run the workflow manually (Actions → Daily makesure → Run workflow)',
    '',
    '_Auto-filed by [siyf-watch](https://github.com) — users never run CLI._',
  );

  return lines.join('\n');
}

async function main() {
  const reportPath = process.argv[2] ?? path.join(
    watchRoot,
    'reports',
    `watch-${new Date().toISOString().slice(0, 10)}.json`,
  );

  const raw = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);

  if (report.healthy) {
    console.log('Report is healthy — no issue needed.');
    return;
  }

  const title = `SIYF Watch failed — ${report.date}`;
  const body = buildBody(report);
  const label = 'siyf-watch';

  await runGh(['label', 'create', label, '--color', 'E11D48', '--description', 'Automated health check failure']).catch(() => {});

  const existing = await runGh(['issue', 'list', '--label', label, '--state', 'open', '--json', 'number,title', '--limit', '5']);
  if (existing.code === 0 && existing.stdout.trim()) {
    const issues = JSON.parse(existing.stdout);
    const match = issues.find((i) => i.title.startsWith('SIYF Watch failed'));
    if (match) {
      await runGh(['issue', 'comment', String(match.number), '--body', body]);
      console.log(`Updated issue #${match.number}`);
      return;
    }
  }

  const created = await runGh(['issue', 'create', '--title', title, '--body', body, '--label', label]);
  if (created.code !== 0) {
    console.error('gh issue create failed:', created.stderr);
    process.exit(1);
  }
  console.log('Created new issue.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
