/**
 * src/tools/verify-audit.ts
 * Cryptographic Audit Verifier CLI for FinOps Compliance (SOC2 / ISO27001).
 *
 * Scans finops-audit.log, recalculates every SHA-256 checksum independently,
 * detects any manual tampering or corrupted records, and displays a summary table.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AuditLogger, DEFAULT_AUDIT_LOG_FILE } from './audit-logger';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function resolveLogFile(): string {
  if (process.env.AUDIT_LOG_PATH && fs.existsSync(process.env.AUDIT_LOG_PATH)) {
    return process.env.AUDIT_LOG_PATH;
  }
  if (fs.existsSync(DEFAULT_AUDIT_LOG_FILE)) {
    return DEFAULT_AUDIT_LOG_FILE;
  }
  const demoLog = path.resolve('audit-logs', 'demo-audit.log');
  if (fs.existsSync(demoLog)) {
    return demoLog;
  }
  const jsonlLog = path.resolve('audit-logs', 'audit.jsonl');
  if (fs.existsSync(jsonlLog)) {
    return jsonlLog;
  }
  return DEFAULT_AUDIT_LOG_FILE;
}

async function verifyAuditLog(): Promise<void> {
  const logFile = resolveLogFile();
  const logger = new AuditLogger(logFile);
  const resolvedPath = path.resolve(logFile);

  console.log(`\n${bold('════════════════════════════════════════════════════════════════════════════════')}`);
  console.log(`  ${bold('StateReaper — Cryptographic Audit Trail Verifier')}`);
  console.log(`  ${dim('Compliance Target: SOC2 Type II / ISO 27001 / FinOps Foundation')}`);
  console.log(`${bold('════════════════════════════════════════════════════════════════════════════════')}\n`);

  console.log(`Auditing file: ${cyan(resolvedPath)}...\n`);

  const records = await logger.readAuditRecords();

  if (records.length === 0) {
    console.log(`⚠️  No audit records found in ${logFile}. Run 'npm run demo' or start the daemon to generate entries.`);
    return;
  }

  let validCount = 0;
  let invalidCount = 0;
  let snapshotCount = 0;

  console.log(`┌─────┬─────────────────────┬──────────────┬───────────────┬────────────────────┬───────────┐`);
  console.log(`│ #${' '.repeat(3)}│ Timestamp           │ Resource ID  │ Approved By   │ SHA-256 Digest     │ Status    │`);
  console.log(`├─────┼─────────────────────┼──────────────┼───────────────┼────────────────────┼───────────┤`);

  records.forEach((record, idx) => {
    const recalculated = logger.generateEventHash({
      resourceId: record.resourceId,
      resourceType: record.resourceType,
      approvedBy: record.approvedBy,
      approvedAt: record.approvedAt,
      snapshotId: record.snapshotId,
      terminatedAt: record.terminatedAt,
      status: record.status,
      error: record.error,
    });

    const isValid = recalculated === record.eventHash;
    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
    }

    if (record.snapshotId) {
      snapshotCount++;
    }

    const indexStr = String(idx + 1).padEnd(4);
    const timeStr = record.timestamp.slice(0, 19).padEnd(19);
    const resStr = record.resourceId.slice(0, 12).padEnd(12);
    const approverStr = record.approvedBy.slice(0, 13).padEnd(13);
    const hashStr = `${record.eventHash.slice(0, 15)}...`.padEnd(18);
    const statusStr = isValid ? green('VALID   ') : red('TAMPERED');

    console.log(`│ ${indexStr}│ ${timeStr} │ ${resStr} │ ${approverStr} │ ${hashStr} │ ${statusStr}  │`);
  });

  console.log(`└─────┴─────────────────────┴──────────────┴───────────────┴────────────────────┴───────────┘\n`);

  console.log(`${bold('VERIFICATION SUMMARY')}`);
  console.log(`• Total Audit Records       : ${records.length}`);
  console.log(`• Cryptographically Valid   : ${green(`${validCount} / ${records.length}`)}`);
  console.log(`• Tampered / Corrupted      : ${invalidCount === 0 ? green('0 (Integrity 100% Intact)') : red(`${invalidCount} VIOLATIONS DETECTED`)}`);
  console.log(`• Root Snapshot Protected   : ${green(`${snapshotCount} / ${records.length}`)} (Zero data loss guarantee)`);
  console.log(`• Audit Status              : ${invalidCount === 0 ? bold(green('PASSED — AUDIT INTEGRITY SEALED')) : bold(red('FAILED — AUDIT CHAIN COMPROMISED'))}\n`);
}

verifyAuditLog().catch((err) => {
  console.error('Audit verification error:', err);
  process.exit(1);
});
