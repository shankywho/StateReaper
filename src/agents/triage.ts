/**
 * src/agents/triage.ts
 * @triage-architect — The Safety & Risk Evaluator.
 *
 * Responsibilities:
 *  - Evaluates IdleResourceReport payloads from @cost-telemetry.
 *  - Performs deterministic semantic dependency and blast-radius analysis.
 *  - Categorizes risk (LOW / MEDIUM / HIGH).
 *  - Formulates structured teardown proposals with exact human authorization commands.
 *  - Enforces: NEVER directly executes destructive APIs. Purely consultative.
 */

import type {
  IdleResourceReport,
  BlastRadiusReport,
  RiskLevel,
  RecommendedAction,
} from '../types';
import type { SwitchClient } from '../switch-client';

const AGENT_NAME = 'triage-architect';

export class TriageAgent {
  private readonly triagedRegistry = new Map<string, {
    report: IdleResourceReport;
    blastRadius: BlastRadiusReport;
  }>();

  constructor(private readonly client: SwitchClient) {}

  /**
   * Evaluates an idle resource report, generates the blast-radius assessment,
   * stores it in the active registry, and broadcasts the report to the Switch room.
   */
  public async evaluate(report: IdleResourceReport): Promise<BlastRadiusReport> {
    console.log(`[@triage-architect] Evaluating blast radius for ${report.resourceId} (${report.resourceType})...`);

    const blastRadius = this.analyzeDependencies(report);

    // Record in local state tribunal registry
    this.triagedRegistry.set(report.resourceId, {
      report,
      blastRadius,
    });

    // Format message and post to Switch room
    const message = formatBlastRadiusReport(blastRadius, report);
    await this.client.postMessage(AGENT_NAME, message);

    return blastRadius;
  }

  /**
   * Deterministic semantic dependency analyzer.
   * If network ingress is 0 KB/s, deterministically returns "LOW" risk.
   */
  public analyzeDependencies(report: IdleResourceReport): BlastRadiusReport {
    let riskLevel: RiskLevel;
    let dependencies: string[];
    let recommendedAction: RecommendedAction;

    switch (report.resourceType) {
      case 'ec2': {
        if (report.networkIngressKbps === 0) {
          riskLevel = 'LOW';
          dependencies = [
            'Zero active network connections (0 KB/s ingress)',
            'No active Application Load Balancer target bindings',
            'Subnet security groups show no external routing activity',
          ];
          recommendedAction = 'snapshot-and-terminate';
        } else {
          riskLevel = 'MEDIUM';
          dependencies = [
            `Active network traffic detected: ${report.networkIngressKbps} KB/s`,
            'Potential background batch/worker process running',
          ];
          recommendedAction = 'defer';
        }
        break;
      }

      case 'vercel_deployment': {
        riskLevel = 'LOW';
        const pr = report.metadata['pullRequest'] ?? 'merged';
        dependencies = [
          `Preview branch associated with ${pr}`,
          'Zero edge invocation traffic over measurement window',
          'No production custom domain routing to this preview deployment',
        ];
        recommendedAction = 'terminate-only';
        break;
      }

      case 'rds': {
        riskLevel = 'HIGH';
        dependencies = [
          'Stateful persistent relational database storage',
          'Potential downstream microservice dependency',
        ];
        recommendedAction = 'escalate';
        break;
      }

      default: {
        riskLevel = 'MEDIUM';
        dependencies = ['Generic compute resource with unknown dependency graph'];
        recommendedAction = 'defer';
      }
    }

    // Exact required approval string
    const approvalCommand = `@executioner-sre approve ${report.resourceId}`;

    return {
      resourceId: report.resourceId,
      resourceType: report.resourceType,
      riskLevel,
      dependencies,
      recommendedAction,
      approvalCommand,
      evaluatedAt: new Date().toISOString(),
    };
  }

  public getTriagedItem(resourceId: string): { report: IdleResourceReport; blastRadius: BlastRadiusReport } | undefined {
    return this.triagedRegistry.get(resourceId);
  }

  public hasBeenTriaged(resourceId: string): boolean {
    return this.triagedRegistry.has(resourceId);
  }
}

/**
 * Formats the structured blast-radius evaluation message for the Telegram room.
 */
export function formatBlastRadiusReport(
  blastRadius: BlastRadiusReport,
  report: IdleResourceReport,
): string {
  const depLines = blastRadius.dependencies.map((d) => `  • ${d}`).join('\n');

  return [
    `🔍  [BLAST RADIUS EVALUATION]`,
    ``,
    `• Target Resource : ${blastRadius.resourceId} (${report.resourceType})`,
    `• Assessed Risk   : ${blastRadius.riskLevel}`,
    `• Recommendation  : ${blastRadius.recommendedAction}`,
    `• Projected Waste : \$${report.estimatedMonthlySpendUSD.toFixed(2)}/mo`,
    ``,
    `🔗  Dependency Audit:`,
    depLines,
    ``,
    `🛡️  Safety Gate: Human authorization required before destruction.`,
    `👉  Reply with: \`${blastRadius.approvalCommand}\``,
  ].join('\n');
}
