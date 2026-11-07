/**
 * src/mock/mock-cloudwatch.ts
 * Deterministic idle-resource telemetry simulator.
 *
 * Produces realistic IdleResourceReport payloads for local testing and
 * judge review — no AWS or Vercel credentials required.
 *
 * The mock dataset is seeded with a fixed set of plausible "zombie" resources:
 *  - EC2 instances left over from a prototype sprint
 *  - Orphaned Vercel preview deployments from merged PRs
 *
 * Reports are returned in order of descending estimated monthly spend so the
 * most expensive waste surfaces first in the Telegram room.
 */

import type { IdleResourceReport, ResourceType } from '../types';

// ── Internal seed data types ───────────────────────────────────────────────

interface MockEC2Seed {
  readonly instanceId: string;
  readonly instanceType: string;
  readonly region: string;
  readonly idleHours: number;
  readonly avgCpuPercent: number;
  readonly dailyCostUSD: number;
  readonly tags: Readonly<Record<string, string>>;
}

interface MockVercelSeed {
  readonly deploymentId: string;
  readonly projectName: string;
  readonly idleHours: number;
  readonly dailyCostUSD: number;
  readonly gitBranch: string;
  readonly prNumber: number;
}

interface MockRDSSeed {
  readonly dbInstanceId: string;
  readonly engine: string;
  readonly region: string;
  readonly idleHours: number;
  readonly avgCpuPercent: number;
  readonly dailyCostUSD: number;
  readonly tags: Readonly<Record<string, string>>;
}

// ── Seed datasets ──────────────────────────────────────────────────────────

const MOCK_EC2_SEEDS: readonly MockEC2Seed[] = [
  {
    instanceId: 'i-04f8b9a912c1',
    instanceType: 't3.medium',
    region: 'us-east-1',
    idleHours: 58,
    avgCpuPercent: 0.023,
    dailyCostUSD: 2.15,
    tags: { Name: 'dev-api-server', Project: 'stale-prototype-v2', Owner: 'shankar' },
  },
  {
    instanceId: 'i-0a3b7c1e5f92d',
    instanceType: 'm5.large',
    region: 'eu-west-1',
    idleHours: 112,
    avgCpuPercent: 0.008,
    dailyCostUSD: 6.84,
    tags: { Name: 'load-test-runner', Project: 'q3-perf-sprint', Owner: 'ops-team' },
  },
  {
    instanceId: 'i-0d9f3a2b1c4e',
    instanceType: 't2.small',
    region: 'us-west-2',
    idleHours: 204,
    avgCpuPercent: 0.001,
    dailyCostUSD: 0.92,
    tags: { Name: 'temp-db-migration', Project: 'legacy-migration-q2', Owner: 'backend-team' },
  },
];

const MOCK_VERCEL_SEEDS: readonly MockVercelSeed[] = [
  {
    deploymentId: 'dpl_4kXb9QrTmNpA',
    projectName: 'statereaper-landing',
    idleHours: 73,
    dailyCostUSD: 0.48,
    gitBranch: 'feat/dark-mode-redesign',
    prNumber: 142,
  },
  {
    deploymentId: 'dpl_8wRsL2vYcFqZ',
    projectName: 'api-gateway-v2',
    idleHours: 96,
    dailyCostUSD: 1.20,
    gitBranch: 'fix/auth-token-expiry',
    prNumber: 118,
  },
];

const MOCK_RDS_SEEDS: readonly MockRDSSeed[] = [
  {
    dbInstanceId: 'db-analytics-staging-2024',
    engine: 'postgres',
    region: 'us-east-1',
    idleHours: 168,
    avgCpuPercent: 0.015,
    dailyCostUSD: 5.20,
    tags: { Name: 'analytics-staging', Environment: 'staging', Owner: 'data-platform' },
  },
];

// ── Builders ──────────────────────────────────────────────────────────────

function buildEC2Report(seed: MockEC2Seed): IdleResourceReport {
  return {
    resourceId: seed.instanceId,
    resourceType: 'ec2' satisfies ResourceType,
    region: seed.region,
    idleDurationHours: seed.idleHours,
    avgCpuPercent: seed.avgCpuPercent,
    networkIngressKbps: 0,
    estimatedDailySpendUSD: seed.dailyCostUSD,
    estimatedMonthlySpendUSD: parseFloat((seed.dailyCostUSD * 30).toFixed(2)),
    metadata: {
      instanceType: seed.instanceType,
      ...seed.tags,
    },
    detectedAt: new Date().toISOString(),
  };
}

function buildVercelReport(seed: MockVercelSeed): IdleResourceReport {
  return {
    resourceId: seed.deploymentId,
    resourceType: 'vercel_deployment' satisfies ResourceType,
    region: 'global',
    idleDurationHours: seed.idleHours,
    avgCpuPercent: 0,
    networkIngressKbps: 0,
    estimatedDailySpendUSD: seed.dailyCostUSD,
    estimatedMonthlySpendUSD: parseFloat((seed.dailyCostUSD * 30).toFixed(2)),
    metadata: {
      projectName: seed.projectName,
      gitBranch: seed.gitBranch,
      pullRequest: `#${seed.prNumber}`,
      status: 'READY',
      reason: 'PR merged, preview deployment orphaned',
    },
    detectedAt: new Date().toISOString(),
  };
}

function buildRDSReport(seed: MockRDSSeed): IdleResourceReport {
  return {
    resourceId: seed.dbInstanceId,
    resourceType: 'rds' satisfies ResourceType,
    region: seed.region,
    idleDurationHours: seed.idleHours,
    avgCpuPercent: seed.avgCpuPercent,
    networkIngressKbps: 0,
    estimatedDailySpendUSD: seed.dailyCostUSD,
    estimatedMonthlySpendUSD: parseFloat((seed.dailyCostUSD * 30).toFixed(2)),
    metadata: {
      engine: seed.engine,
      ...seed.tags,
    },
    detectedAt: new Date().toISOString(),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns a deterministic set of idle-resource reports, sorted by descending
 * estimated monthly spend (most expensive zombie first).
 *
 * Called by TelemetryAgent when `USE_MOCK_TELEMETRY=true`.
 */
export function generateMockReports(): IdleResourceReport[] {
  const ec2Reports = MOCK_EC2_SEEDS.map(buildEC2Report);
  const vercelReports = MOCK_VERCEL_SEEDS.map(buildVercelReport);
  const rdsReports = MOCK_RDS_SEEDS.map(buildRDSReport);

  const all = [...ec2Reports, ...vercelReports, ...rdsReports];

  // Sort descending by monthly spend — surface worst offenders first
  all.sort((a, b) => b.estimatedMonthlySpendUSD - a.estimatedMonthlySpendUSD);

  return all;
}

/**
 * Returns a single mock report by resource ID, or null if not found.
 * Used by unit tests to get a predictable known-good report.
 */
export function getMockReportById(resourceId: string): IdleResourceReport | null {
  return generateMockReports().find((r) => r.resourceId === resourceId) ?? null;
}
