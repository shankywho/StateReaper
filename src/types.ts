/**
 * src/types.ts
 * Canonical domain types for StateReaper.
 * All agents and infrastructure share these definitions.
 */

// ── Primitives ─────────────────────────────────────────────────────────────

export type ResourceType = 'ec2' | 'vercel_deployment' | 'rds' | 'lambda';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type AgentName = 'cost-telemetry' | 'triage-architect' | 'executioner-sre';
export type SenderKind = 'agent' | 'human';
export type TeardownStatus =
  | 'pending'
  | 'snapshotting'
  | 'terminating'
  | 'complete'
  | 'failed';

export type RecommendedAction =
  | 'snapshot-and-terminate'
  | 'terminate-only'
  | 'defer'
  | 'escalate';

// ── Switch Protocol ────────────────────────────────────────────────────────

/**
 * Raw event shape as emitted by the Switch SSE stream.
 * All fields are readonly — events are immutable once received.
 */
export interface SwitchRawEvent {
  readonly id: string;
  readonly type: 'message' | 'presence' | 'system';
  readonly timestamp: string; // ISO 8601
  readonly sender: {
    readonly kind: SenderKind;
    readonly name: string; // e.g. "cost-telemetry" or "shankar"
  };
  readonly content: string;
  readonly roomId: string;
}

// ── Domain Models ──────────────────────────────────────────────────────────

/**
 * Emitted by @cost-telemetry when an idle/orphaned resource is detected.
 * The source of truth for all downstream triage and teardown decisions.
 */
export interface IdleResourceReport {
  readonly resourceId: string;          // e.g. "i-04f8b9a912c1" or "dpl_xyz"
  readonly resourceType: ResourceType;
  readonly region: string;              // AWS region or "global" for Vercel
  readonly idleDurationHours: number;   // How long it has been idle
  readonly avgCpuPercent: number;       // Rolling average CPU %
  readonly networkIngressKbps: number;  // Current network ingress in KB/s
  readonly estimatedDailySpendUSD: number;
  readonly estimatedMonthlySpendUSD: number;
  readonly metadata: Readonly<Record<string, string>>; // e.g. tags, project name
  readonly detectedAt: string;          // ISO 8601
}

/**
 * Produced by @triage-architect after evaluating an IdleResourceReport.
 * Contains the blast-radius assessment and the human-readable approval command.
 */
export interface BlastRadiusReport {
  readonly resourceId: string;
  readonly resourceType: ResourceType;
  readonly riskLevel: RiskLevel;
  readonly dependencies: readonly string[]; // IDs of dependent resources
  readonly recommendedAction: RecommendedAction;
  /**
   * The exact command string the human must type to authorize teardown.
   * E.g. "@executioner-sre approve i-04f8b9a912c1"
   */
  readonly approvalCommand: string;
  readonly evaluatedAt: string; // ISO 8601
}

/**
 * Written to the append-only audit log whenever @executioner-sre acts.
 * Immutable record of what was destroyed, when, and by whose authority.
 */
export interface TeardownEvent {
  readonly resourceId: string;
  readonly resourceType: ResourceType;
  readonly approvedBy: string;        // human username from Switch room
  readonly approvedAt: string;        // ISO 8601 — when approval was received
  readonly snapshotId: string | null; // EBS snapshot ID or null if not applicable
  readonly terminatedAt: string | null;
  readonly status: TeardownStatus;
  readonly error: string | null;
  readonly eventHash?: string;        // Cryptographic / mock SHA-256 event hash
}

/**
 * Permanent line record written to finops-audit.log
 */
export interface AuditRecord {
  readonly timestamp: string;         // ISO 8601
  readonly eventHash: string;         // SHA-256 digest
  readonly resourceId: string;
  readonly resourceType: ResourceType;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly snapshotId: string | null;
  readonly terminatedAt: string | null;
  readonly status: TeardownStatus;
  readonly error: string | null;
}

// ── Router Discriminated Union ─────────────────────────────────────────────

/**
 * Every inbound Switch event resolves to exactly one of these message kinds.
 * The `tag` field enables exhaustive switch-based dispatch with no fallthrough.
 */
export type ParsedMessage =
  | {
      readonly tag: 'approval_command';
      readonly resourceId: string;
      readonly approvedBy: string; // Switch username of the human who approved
    }
  | {
      readonly tag: 'unroutable';
      readonly event: SwitchRawEvent;
    };

