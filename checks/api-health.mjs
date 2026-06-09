#!/usr/bin/env node
/**
 * Lightweight SIYF-API probes — no test runner required.
 * Used by the 6-hour pulse workflow and the daily makesure run.
 */

const API_BASE = (process.env.SIYF_API_URL ?? 'https://siyf-api.nic-58f.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.SIYF_PROBE_TIMEOUT_MS ?? 12_000);

const PROBES = [
  { id: 'health', path: '/health', expectJson: true },
  { id: 'service-root', path: '/', expectJson: true },
  { id: 'espn-nba-scoreboard', path: '/api/espn/apis/site/v2/sports/basketball/nba/scoreboard', expectJson: true },
  { id: 'espn-nfl-scoreboard', path: '/api/espn/apis/site/v2/sports/football/nfl/scoreboard', expectJson: true },
  { id: 'action-network-nba', path: '/api/action-network/scoreboard/nba', expectJson: true },
  { id: 'action-network-nfl', path: '/api/action-network/scoreboard/nfl', expectJson: true },
  { id: 'espn-tennis-scoreboard', path: '/api/espn/apis/site/v2/sports/tennis/atp/scoreboard', expectJson: true },
];

async function probeOne(def) {
  const url = `${API_BASE}${def.path}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const elapsedMs = Date.now() - started;
    const cache = res.headers.get('x-siyf-cache') ?? null;
    const cacheTier = res.headers.get('x-siyf-cache-tier') ?? null;
    const rateRemaining = res.headers.get('x-ratelimit-remaining') ?? null;
    const paidRemaining = res.headers.get('x-paid-api-daily-remaining') ?? null;

    let bodyOk = true;
    let bodyHint = '';
    if (def.expectJson && res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (def.path.includes('/health')) {
          bodyOk = json.status === 'ok';
          bodyHint = bodyOk ? '' : 'health status not ok';
        } else if (def.path.includes('/api/espn')) {
          bodyOk = json.events != null || json.leagues != null || typeof json === 'object';
          bodyHint = bodyOk ? '' : 'ESPN payload unexpected shape';
        }
      } catch {
        bodyOk = false;
        bodyHint = 'response is not valid JSON';
      }
    }

    const healthy = res.ok && bodyOk;
    return {
      id: def.id,
      path: def.path,
      url,
      healthy,
      status: res.status,
      elapsedMs,
      cache,
      cacheTier,
      rateRemaining,
      paidRemaining,
      error: healthy ? undefined : (bodyHint || `HTTP ${res.status}`),
    };
  } catch (err) {
    return {
      id: def.id,
      path: def.path,
      url,
      healthy: false,
      status: 0,
      elapsedMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runApiHealthChecks() {
  const results = [];
  for (const def of PROBES) {
    results.push(await probeOne(def));
  }

  const healthy = results.every((r) => r.healthy);
  return {
    kind: 'api-health',
    apiBase: API_BASE,
    checkedAt: new Date().toISOString(),
    healthy,
    probes: results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.healthy).length,
      failed: results.filter((r) => !r.healthy).length,
    },
  };
}

const isCli = process.argv[1]?.replace(/\\/g, '/').endsWith('checks/api-health.mjs');
if (isCli) {
  const report = await runApiHealthChecks();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.healthy ? 0 : 1);
}
