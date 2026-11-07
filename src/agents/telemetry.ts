/**
 * src/agents/telemetry.ts
 * @cost-telemetry — The Waste Hunter.
 *
 * Responsibilities:
 *  - Periodically polls for idle cloud resources (AWS CloudWatch & EC2).
 *  - In mock mode (USE_MOCK_TELEMETRY=true), uses the deterministic simulator.
 *  - In production mode (USE_MOCK_TELEMETRY=false), queries AWS EC2 for all running
 *    instances and retrieves CloudWatch metrics (CPUUtilization and NetworkIn) over 48h.
 *  - Formats each finding as a human-readable message and POSTs to the Switch room.
 *  - Routes detected reports to @triage-architect.
 *  - SAFETY BOUNDARY: Read-only at all times. Strictly prohibited from destructive endpoints.
 */

import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  EC2Client,
  DescribeInstancesCommand,
  type Instance,
} from '@aws-sdk/client-ec2';
import type { IdleResourceReport, ResourceType } from '../types';
import type { SwitchClient } from '../switch-client';
import type { Config } from '../config';
import { generateMockReports } from '../mock/mock-cloudwatch';

// ── Constants ──────────────────────────────────────────────────────────────

const AGENT_NAME = 'cost-telemetry';

const RESOURCE_TYPE_LABELS: Readonly<Record<ResourceType, string>> = {
  ec2: 'AWS EC2 Instance',
  vercel_deployment: 'Vercel Preview Deployment',
  rds: 'AWS RDS Instance',
  lambda: 'AWS Lambda Function',
};

// Common AWS EC2 hourly on-demand rates (USD) for cost projections
const EC2_ESTIMATED_HOURLY_RATES: Readonly<Record<string, number>> = {
  't2.nano': 0.0058,
  't2.micro': 0.0116,
  't2.small': 0.023,
  't2.medium': 0.0464,
  't2.large': 0.0928,
  't3.nano': 0.0052,
  't3.micro': 0.0104,
  't3.small': 0.0208,
  't3.medium': 0.0416,
  't3.large': 0.0832,
  't3.xlarge': 0.1664,
  'm5.large': 0.096,
  'm5.xlarge': 0.192,
  'c5.large': 0.085,
  'c5.xlarge': 0.17,
};

export type ReportDiscoveredCallback = (report: IdleResourceReport) => Promise<void>;

// ── TelemetryAgent ─────────────────────────────────────────────────────────

export class TelemetryAgent {
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly client: SwitchClient,
    private readonly config: Config,
    private readonly onReportDiscovered?: ReportDiscoveredCallback,
  ) {}

  /**
   * Starts the polling loop.
   * Runs an immediate scan on start, then schedules subsequent runs on interval.
   */
  start(): void {
    console.log(`[@cost-telemetry] Starting. Mode: ${this.config.useMockTelemetry ? 'MOCK' : 'LIVE PRODUCTION'}`);
    console.log(`[@cost-telemetry] Poll interval: ${this.config.telemetryPollIntervalMs}ms`);

    void this.runPoll();
    this.pollTimer = setInterval(() => {
      void this.runPoll();
    }, this.config.telemetryPollIntervalMs);
  }

  /** Stops the polling loop. Idempotent. */
  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log('[@cost-telemetry] Polling stopped.');
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async runPoll(): Promise<void> {
    console.log('[@cost-telemetry] Running telemetry scan...');

    const reports = await this.fetchReports();

    if (reports.length === 0) {
      console.log('[@cost-telemetry] No idle resources detected in this cycle.');
      return;
    }

    console.log(`[@cost-telemetry] Found ${reports.length} idle resource(s). Posting to room...`);

    for (const report of reports) {
      const message = formatTelemetryReport(report);
      await this.client.postMessage(AGENT_NAME, message);

      if (this.onReportDiscovered) {
        await this.onReportDiscovered(report);
      }
    }
  }

  /**
   * Fetches idle resource reports from mock simulator or live AWS CloudWatch.
   */
  private async fetchReports(): Promise<IdleResourceReport[]> {
    if (this.config.useMockTelemetry) {
      return generateMockReports();
    }

    return this.fetchLiveAwsReports();
  }

  /**
   * Live production telemetry collector:
   *  1. Queries AWS EC2 for all running instances.
   *  2. Retrieves CloudWatch metrics (CPUUtilization & NetworkIn) over the last 48 hours.
   *  3. Flags instances with avg CPU < idle threshold (0.1%) and 0 network ingress.
   */
  private async fetchLiveAwsReports(): Promise<IdleResourceReport[]> {
    const credentials = {
      accessKeyId: this.config.awsAccessKeyId,
      secretAccessKey: this.config.awsSecretAccessKey,
    };
    const region = this.config.awsRegion;

    const ec2 = new EC2Client({ region, credentials });
    const cw = new CloudWatchClient({ region, credentials });

    try {
      // 1. Fetch running instances
      console.log('[@cost-telemetry] Querying AWS EC2 for running instances...');
      const descCmd = new DescribeInstancesCommand({
        Filters: [{ Name: 'instance-state-name', Values: ['running'] }],
      });
      const descRes = await ec2.send(descCmd);

      const instances: Instance[] = [];
      for (const res of descRes.Reservations ?? []) {
        for (const inst of res.Instances ?? []) {
          if (inst.InstanceId) {
            instances.push(inst);
          }
        }
      }

      console.log(`[@cost-telemetry] Discovered ${instances.length} running instance(s). Querying CloudWatch...`);

      const idleReports: IdleResourceReport[] = [];
      const endTime = new Date();
      const startTime = new Date(Date.now() - this.config.idleDurationThresholdHours * 3600 * 1000);

      // 2. Query CloudWatch metrics for each running instance
      for (const inst of instances) {
        const instanceId = inst.InstanceId!;

        // CPUUtilization (Average over 1h periods)
        const cpuCmd = new GetMetricStatisticsCommand({
          Namespace: 'AWS/EC2',
          MetricName: 'CPUUtilization',
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Average'],
        });
        const cpuRes = await cw.send(cpuCmd);
        const cpuPoints = cpuRes.Datapoints ?? [];
        const avgCpu = cpuPoints.length > 0
          ? cpuPoints.reduce((acc, p) => acc + (p.Average ?? 0), 0) / cpuPoints.length
          : 0;

        // NetworkIn (Sum in bytes over 1h periods)
        const netCmd = new GetMetricStatisticsCommand({
          Namespace: 'AWS/EC2',
          MetricName: 'NetworkIn',
          Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Sum'],
        });
        const netRes = await cw.send(netCmd);
        const netPoints = netRes.Datapoints ?? [];
        const totalNetBytes = netPoints.reduce((acc, p) => acc + (p.Sum ?? 0), 0);
        const netKbps = totalNetBytes / (this.config.idleDurationThresholdHours * 3600 * 1024);

        // 3. Evaluation Gate: avg CPU < threshold and NetworkIn == 0
        if (avgCpu < this.config.idleCpuThresholdPercent && totalNetBytes === 0) {
          const instanceType = inst.InstanceType ?? 't3.micro';
          const hourlyRate = EC2_ESTIMATED_HOURLY_RATES[instanceType] ?? 0.04;
          const dailySpend = parseFloat((hourlyRate * 24).toFixed(2));
          const monthlySpend = parseFloat((dailySpend * 30).toFixed(2));

          const metadata: Record<string, string> = {
            instanceType,
            launchTime: inst.LaunchTime ? inst.LaunchTime.toISOString() : 'unknown',
          };

          for (const tag of inst.Tags ?? []) {
            if (tag.Key && tag.Value) {
              metadata[tag.Key] = tag.Value;
            }
          }

          idleReports.push({
            resourceId: instanceId,
            resourceType: 'ec2',
            region: this.config.awsRegion,
            idleDurationHours: this.config.idleDurationThresholdHours,
            avgCpuPercent: parseFloat(avgCpu.toFixed(4)),
            networkIngressKbps: parseFloat(netKbps.toFixed(4)),
            estimatedDailySpendUSD: dailySpend,
            estimatedMonthlySpendUSD: monthlySpend,
            metadata,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // Sort descending by monthly waste
      idleReports.sort((a, b) => b.estimatedMonthlySpendUSD - a.estimatedMonthlySpendUSD);
      return idleReports;
    } catch (err) {
      console.error('[@cost-telemetry] Live CloudWatch polling failed:', err);
      return [];
    }
  }
}

// ── Formatters ─────────────────────────────────────────────────────────────

/**
 * Formats an IdleResourceReport into the canonical Telegram chat message.
 */
function formatTelemetryReport(report: IdleResourceReport): string {
  const typeLabel = RESOURCE_TYPE_LABELS[report.resourceType];
  const metaLines = buildMetadataLines(report);

  const lines: string[] = [
    `⚠️  [IDLE RESOURCE DETECTED]`,
    ``,
    `• Resource Type : ${typeLabel}`,
    `• Resource ID   : ${report.resourceId}`,
    `• Region        : ${report.region}`,
    `• Idle Duration : ${report.idleDurationHours}h`,
    `• Avg CPU       : ${report.avgCpuPercent.toFixed(4)}%`,
    `• Net Ingress   : ${report.networkIngressKbps} KB/s`,
    ``,
    `💸  Cost Projection`,
    `• Daily Burn    : \$${report.estimatedDailySpendUSD.toFixed(2)}`,
    `• Monthly Waste : \$${report.estimatedMonthlySpendUSD.toFixed(2)}`,
    ...metaLines,
    ``,
    `🔎  Flagging for blast-radius evaluation.`,
    `    cc: @triage-architect`,
  ];

  return lines.join('\n');
}

/**
 * Produces formatted metadata lines from the report's metadata map.
 */
function buildMetadataLines(report: IdleResourceReport): string[] {
  const entries = Object.entries(report.metadata);
  if (entries.length === 0) return [];

  return [
    ``,
    `🏷️  Metadata`,
    ...entries.map(([k, v]) => `• ${k.padEnd(14)}: ${v}`),
  ];
}
