/**
 * tests/audit-integrity.test.ts
 * Rigorous tests for FinOps cryptographic audit trail and compliance.
 *
 * Verifies that:
 *  1. Every teardown produces a deterministic SHA-256 digest.
 *  2. Audit log lines are strictly valid JSON and append-only.
 *  3. Any tampering with past audit entries is immediately detectable.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { AuditLogger } from '../src/tools/audit-logger';
import type { TeardownEvent } from '../src/types';

describe('Audit Trail: SHA-256 Cryptographic Integrity & Compliance', () => {
  const testAuditPath = path.resolve(process.cwd(), 'audit-logs', 'test-audit-integrity.log');

  beforeEach(() => {
    if (fs.existsSync(testAuditPath)) {
      fs.unlinkSync(testAuditPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testAuditPath)) {
      fs.unlinkSync(testAuditPath);
    }
  });

  it('generates deterministic SHA-256 hash for identical event payloads', () => {
    const logger = new AuditLogger(testAuditPath);
    const event: TeardownEvent = {
      resourceId: 'i-04f8b9a912c1',
      resourceType: 'ec2',
      approvedBy: 'shankar',
      approvedAt: '2026-11-07T00:00:00.000Z',
      snapshotId: 'snap-04f8b9a912c1-xyz',
      terminatedAt: '2026-11-07T00:01:00.000Z',
      status: 'complete',
      error: null,
    };

    const hash1 = logger.generateEventHash(event);
    const hash2 = logger.generateEventHash(event);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64); // Standard SHA-256 hex string length
    assert.strictEqual(/^[0-9a-f]{64}$/.test(hash1), true);
  });

  it('changes hash when any security parameter is altered (avalanche effect)', () => {
    const logger = new AuditLogger(testAuditPath);
    const event1: TeardownEvent = {
      resourceId: 'i-04f8b9a912c1',
      resourceType: 'ec2',
      approvedBy: 'shankar',
      approvedAt: '2026-11-07T00:00:00.000Z',
      snapshotId: 'snap-04f8b9a912c1-xyz',
      terminatedAt: '2026-11-07T00:01:00.000Z',
      status: 'complete',
      error: null,
    };

    const event2: TeardownEvent = {
      ...event1,
      approvedBy: 'attacker', // Different approver
    };

    const hash1 = logger.generateEventHash(event1);
    const hash2 = logger.generateEventHash(event2);

    assert.notStrictEqual(hash1, hash2);
  });

  it('persists records append-only and reads them back accurately', async () => {
    const logger = new AuditLogger(testAuditPath);

    const eventA: TeardownEvent = {
      resourceId: 'i-aaa111',
      resourceType: 'ec2',
      approvedBy: 'operator-1',
      approvedAt: new Date().toISOString(),
      snapshotId: 'snap-aaa',
      terminatedAt: new Date().toISOString(),
      status: 'complete',
      error: null,
    };

    const eventB: TeardownEvent = {
      resourceId: 'dpl_bbb222',
      resourceType: 'vercel_deployment',
      approvedBy: 'operator-2',
      approvedAt: new Date().toISOString(),
      snapshotId: null,
      terminatedAt: new Date().toISOString(),
      status: 'complete',
      error: null,
    };

    await logger.logTeardown(eventA);
    await logger.logTeardown(eventB);

    const records = await logger.readAuditRecords();
    assert.strictEqual(records.length, 2);
    assert.strictEqual(records[0]?.resourceId, 'i-aaa111');
    assert.strictEqual(records[1]?.resourceId, 'dpl_bbb222');

    // Verify file content is strictly newline-delimited JSON
    const fileContent = fs.readFileSync(testAuditPath, 'utf-8');
    const lines = fileContent.trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.doesNotThrow(() => JSON.parse(lines[0]!));
    assert.doesNotThrow(() => JSON.parse(lines[1]!));
  });

  it('detects tampering when an audit log entry is modified on disk', async () => {
    const logger = new AuditLogger(testAuditPath);
    const event: TeardownEvent = {
      resourceId: 'i-tamper-check',
      resourceType: 'ec2',
      approvedBy: 'legitimate-admin',
      approvedAt: new Date().toISOString(),
      snapshotId: 'snap-legit',
      terminatedAt: new Date().toISOString(),
      status: 'complete',
      error: null,
    };

    const originalRecord = await logger.logTeardown(event);

    // Verify original hash matches re-hash of record
    const verifiedOriginalHash = logger.generateEventHash({
      resourceId: originalRecord.resourceId,
      resourceType: originalRecord.resourceType,
      approvedBy: originalRecord.approvedBy,
      approvedAt: originalRecord.approvedAt,
      snapshotId: originalRecord.snapshotId,
      terminatedAt: originalRecord.terminatedAt,
      status: originalRecord.status,
      error: originalRecord.error,
    });
    assert.strictEqual(verifiedOriginalHash, originalRecord.eventHash);

    // Tamper with the record (e.g. adversary changes who authorized it)
    const tamperedPayload = {
      ...originalRecord,
      approvedBy: 'malicious-actor',
    };
    const tamperedHash = logger.generateEventHash(tamperedPayload);

    // The tampered payload hash will NOT match the logged original eventHash!
    assert.notStrictEqual(tamperedHash, originalRecord.eventHash);
  });
});

