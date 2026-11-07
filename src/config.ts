/**
 * src/config.ts
 * Validated, typed configuration loaded from environment variables.
 *
 * Strategy: fail fast at startup with a fatal error if live mode is active
 * (USE_MOCK_TELEMETRY=false) and required production credentials are missing.
 */

import 'dotenv/config';

/**
 * Reads an environment variable. Returns `defaultValue` if the variable is
 * absent or empty. Throws if neither a value nor a default is provided.
 */
function getEnv(key: string, defaultValue?: string): string {
  const val = process.env[key];
  if (val !== undefined && val !== '') return val;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(
    `[Config] Missing required environment variable: "${key}". See .env.example for reference.`,
  );
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.toLowerCase() === 'true';
}

function getEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`[Config] Environment variable "${key}" must be an integer, got: "${raw}"`);
  }
  return n;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    throw new Error(
      `[Config] Environment variable "${key}" must be a decimal number, got: "${raw}"`,
    );
  }
  return n;
}

// ── Live Mode Pre-Validation ───────────────────────────────────────────────
const useMockTelemetry = getEnvBool('USE_MOCK_TELEMETRY', true);

if (!useMockTelemetry) {
  const missingLiveVars: string[] = [];
  if (!process.env['AWS_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY_ID'].trim() === '') {
    missingLiveVars.push('AWS_ACCESS_KEY_ID');
  }
  if (!process.env['AWS_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'].trim() === '') {
    missingLiveVars.push('AWS_SECRET_ACCESS_KEY');
  }
  if (!process.env['AWS_REGION'] || process.env['AWS_REGION'].trim() === '') {
    missingLiveVars.push('AWS_REGION');
  }
  if (!process.env['VERCEL_API_TOKEN'] || process.env['VERCEL_API_TOKEN'].trim() === '') {
    missingLiveVars.push('VERCEL_API_TOKEN');
  }

  if (missingLiveVars.length > 0) {
    throw new Error(
      `[Config] [FATAL] Production mode enabled (USE_MOCK_TELEMETRY=false), but required live credentials are missing: ${missingLiveVars.join(', ')}. Please configure these environment variables or enable mock mode (USE_MOCK_TELEMETRY=true).`,
    );
  }
}

export const config = {
  // ── Switch Protocol ──────────────────────────────────────────────────────
  /** Base URL of the self-hosted Switch server (without trailing slash). */
  switchServerUrl: getEnv('SWITCH_SERVER_URL', 'http://localhost:8080'),
  /** The Switch room name/ID to subscribe to. */
  switchRoomId: getEnv('SWITCH_ROOM_ID', 'statereaper-tribunal'),
  /** Bearer token for Switch API authentication. */
  switchApiKey: getEnv('SWITCH_API_KEY', 'dev-key'),
  /**
   * When true, POSTs to the Switch room are logged to stdout instead.
   * Defaults to true so judges can clone and run locally without requiring an active Switch daemon.
   */
  switchDryRun: getEnvBool('SWITCH_DRY_RUN', true),

  // ── AWS (strictly required when USE_MOCK_TELEMETRY=false) ────────────────
  awsRegion: getEnv('AWS_REGION', 'us-east-1'),
  awsAccessKeyId: getEnv('AWS_ACCESS_KEY_ID', useMockTelemetry ? '' : undefined),
  awsSecretAccessKey: getEnv('AWS_SECRET_ACCESS_KEY', useMockTelemetry ? '' : undefined),

  // ── Vercel (strictly required when USE_MOCK_TELEMETRY=false) ─────────────
  vercelApiToken: getEnv('VERCEL_API_TOKEN', useMockTelemetry ? '' : undefined),
  vercelTeamId: getEnv('VERCEL_TEAM_ID', ''),

  // ── Application ──────────────────────────────────────────────────────────
  /**
   * When true, @cost-telemetry uses mock CloudWatch payloads instead of
   * live AWS/Vercel APIs. Intended for local development and judge review.
   */
  useMockTelemetry,
  /** Filesystem path for the append-only JSON audit log. */
  auditLogPath: getEnv('AUDIT_LOG_PATH', './audit-logs/audit.jsonl'),
  /** How often (ms) the telemetry agent polls for idle resources. */
  telemetryPollIntervalMs: getEnvInt('TELEMETRY_POLL_INTERVAL_MS', 60_000),
  /** CPU percentage below which a resource is classified as idle. */
  idleCpuThresholdPercent: getEnvFloat('IDLE_CPU_THRESHOLD_PERCENT', 0.1),
  /** Hours a resource must be idle before it is flagged for review. */
  idleDurationThresholdHours: getEnvInt('IDLE_DURATION_THRESHOLD_HOURS', 48),
} as const;

export type Config = typeof config;
