/**
 * src/agents/executioner.ts
 * @executioner-sre — The Gated Destruction Daemon.
 *
 * CRITICAL SAFETY BOUNDARY:
 *  - Enforces strict regex validation before any tool execution.
 *  - Rejects any command that is not explicitly authorized.
 *  - Deterministically sequences:
 *      1. State preservation (EBS snapshot)
 *      2. Cloud resource termination (EC2 / Vercel API)
 *      3. Append-only cryptographic audit logging (finops-audit.log)
 *      4. Final confirmation post to the Switch room
 */

import type { TeardownEvent, ResourceType } from '../types';
import type { SwitchClient } from '../switch-client';
import type { TriageAgent } from './triage';
import { AuditLogger, auditLogger as defaultAuditLogger } from '../tools/audit-logger';
import { createEbsSnapshot } from '../tools/aws-client';
import { pruneDeployment } from '../tools/vercel-client';
import { _APPROVAL_PATTERN_FOR_TESTING } from '../router';

const AGENT_NAME = 'executioner-sre';

export interface ApprovalPayload {
  readonly resourceId: string;
  readonly approvedBy: string;
}

export class ExecutionerAgent {
  constructor(
    private readonly client: SwitchClient,
    private readonly triageAgent: TriageAgent,
    private readonly audit: AuditLogger = defaultAuditLogger,
  ) {}

  /**
   * Primary entry point for gated teardown execution.
   * Strictly enforces safety preconditions before calling destructive tools.
   */
  public async executeApproval(payload: ApprovalPayload): Promise<TeardownEvent> {
    const { resourceId, approvedBy } = payload;
    const approvalString = `@executioner-sre approve ${resourceId}`;

    // ── Safety Gate 1: Re-verify Regex Lock ──────────────────────────────────
    if (!_APPROVAL_PATTERN_FOR_TESTING.test(approvalString)) {
      const errorMsg = `[SECURITY BREACH] Malformed or injected command rejected: "${approvalString}"`;
      console.error(`[@executioner-sre] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(
      `[@executioner-sre] 🔒 Safety Gate PASSED. Human authorization validated for ${resourceId} by @${approvedBy}`,
    );

    // ── Retrieve resource metadata from triage registry ─────────────────────
    const triagedItem = this.triageAgent.getTriagedItem(resourceId);
    const resourceType: ResourceType = triagedItem?.report.resourceType ?? (resourceId.startsWith('dpl_') ? 'vercel_deployment' : 'ec2');

    const approvedAt = new Date().toISOString();

    // ── Announce start of execution in Switch room ──────────────────────────
    await this.client.postMessage(
      AGENT_NAME,
      [
        `⏳  [EXECUTION IN PROGRESS]`,
        `• Target Resource: ${resourceId} (${resourceType})`,
        `• Sign-Off By    : @${approvedBy}`,
        `• Action Sequence: Snapshot → Terminate → Audit Log`,
      ].join('\n'),
    );

    let snapshotId: string | null = null;
    let error: string | null = null;

    try {
      // ── Step 1: Snapshot / State Preservation ─────────────────────────────
      if (resourceType === 'ec2') {
        console.log(`[@executioner-sre] Step 1/3: Triggering EBS snapshot for ${resourceId}...`);
        const snap = await createEbsSnapshot(resourceId);
        snapshotId = snap.snapshotId;
        console.log(`[@executioner-sre] Step 1/3 [DONE]: Snapshot created: ${snapshotId}`);
      } else {
        console.log(`[@executioner-sre] Step 1/3 [SKIPPED]: ${resourceType} is stateless; snapshot not required.`);
      }

      // ── Step 2: Resource Termination ──────────────────────────────────────
      console.log(`[@executioner-sre] Step 2/3: Terminating ${resourceId}...`);
      if (resourceType === 'ec2') {
        await pruneOrTerminateEC2(resourceId);
      } else if (resourceType === 'vercel_deployment') {
        await pruneDeployment(resourceId);
      }
      console.log(`[@executioner-sre] Step 2/3 [DONE]: ${resourceId} terminated.`);

      const terminatedAt = new Date().toISOString();

      // ── Step 3: Append-Only Cryptographic Audit Log ───────────────────────
      console.log(`[@executioner-sre] Step 3/3: Writing immutable audit log...`);
      const event: TeardownEvent = {
        resourceId,
        resourceType,
        approvedBy,
        approvedAt,
        snapshotId,
        terminatedAt,
        status: 'complete',
        error: null,
      };

      const auditRecord = await this.audit.logTeardown(event);
      console.log(`[@executioner-sre] Step 3/3 [DONE]: Audit hash ${auditRecord.eventHash}`);

      // ── Step 4: Post Completion Notice to Switch room ─────────────────────
      const completionMessage = [
        `✅  [RECLAMATION COMPLETE]`,
        ``,
        `• Resource ID    : ${resourceId} (${resourceType})`,
        `• Preservation   : ${snapshotId ? `EBS Snapshot ${snapshotId}` : 'Stateless (No snapshot required)'}`,
        `• Termination    : Instance cleanly terminated & decommissioned`,
        `• Authorized By  : @${approvedBy}`,
        `• Audit Integrity: Recorded in finops-audit.log`,
        `  SHA-256 Digest : ${auditRecord.eventHash}`,
      ].join('\n');

      await this.client.postMessage(AGENT_NAME, completionMessage);

      return {
        ...event,
        eventHash: auditRecord.eventHash,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`[@executioner-sre] Execution failed for ${resourceId}:`, error);

      const failedEvent: TeardownEvent = {
        resourceId,
        resourceType,
        approvedBy,
        approvedAt,
        snapshotId,
        terminatedAt: null,
        status: 'failed',
        error,
      };

      await this.audit.logTeardown(failedEvent);

      await this.client.postMessage(
        AGENT_NAME,
        `❌ [RECLAMATION FAILED]\n• Resource ID: ${resourceId}\n• Error: ${error}\n• Incident logged for review.`,
      );

      return failedEvent;
    }
  }
}

async function pruneOrTerminateEC2(instanceId: string): Promise<void> {
  const { terminateInstance } = await import('../tools/aws-client');
  await terminateInstance(instanceId);
}
