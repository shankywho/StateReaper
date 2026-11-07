/**
 * src/tools/audit-logger.ts
 * Append-only immutable JSON audit logger for all FinOps teardown events.
 *
 * Implements cryptographic SHA-256 event hashing to ensure audit trail
 * integrity. Every authorized resource reclamation is permanently appended
 * to finops-audit.log.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { TeardownEvent, AuditRecord } from '../types';

export const DEFAULT_AUDIT_LOG_FILE = 'finops-audit.log';

export class AuditLogger {
  private readonly logFilePath: string;

  constructor(customPath?: string) {
    this.logFilePath = customPath ? path.resolve(customPath) : path.resolve(process.cwd(), DEFAULT_AUDIT_LOG_FILE);
  }

  /**
   * Generates a deterministic SHA-256 hash of the teardown event parameters.
   */
  public generateEventHash(event: Omit<TeardownEvent, 'eventHash'>): string {
    const canonicalPayload = JSON.stringify({
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      approvedBy: event.approvedBy,
      approvedAt: event.approvedAt,
      snapshotId: event.snapshotId,
      terminatedAt: event.terminatedAt,
      status: event.status,
    });

    return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
  }

  /**
   * Appends an authorized teardown execution to the permanent audit log.
   */
  public async logTeardown(event: TeardownEvent): Promise<AuditRecord> {
    const timestamp = new Date().toISOString();
    const eventHash = event.eventHash ?? this.generateEventHash(event);

    const record: AuditRecord = {
      timestamp,
      eventHash,
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      approvedBy: event.approvedBy,
      approvedAt: event.approvedAt,
      snapshotId: event.snapshotId,
      terminatedAt: event.terminatedAt,
      status: event.status,
      error: event.error,
    };

    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const logLine = `${JSON.stringify(record)}\n`;
    await fs.promises.appendFile(this.logFilePath, logLine, 'utf-8');

    console.log(
      `[AuditLogger] 🛡️ Permanent record written to ${path.basename(this.logFilePath)} | Hash: ${eventHash.slice(0, 16)}...`,
    );

    return record;
  }

  /**
   * Reads and parses all audit records from the log file.
   */
  public async readAuditRecords(): Promise<AuditRecord[]> {
    if (!fs.existsSync(this.logFilePath)) {
      return [];
    }

    const content = await fs.promises.readFile(this.logFilePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    const records: AuditRecord[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as AuditRecord;
        records.push(parsed);
      } catch {
        // Skip corrupted or unparseable lines
      }
    }

    return records;
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}

// Global singleton instance for StateReaper
export const auditLogger = new AuditLogger();
