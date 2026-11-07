/**
 * tests/teardown-gate.test.ts
 * Strict unit tests for the @executioner-sre safety gate and router dispatch.
 *
 * Verifies that:
 *  1. Exact approval syntax (@executioner-sre approve <RESOURCE_ID>) routes correctly.
 *  2. Informal language, shell injection, SQL-like injection, and malicious payloads are rejected.
 *  3. Agent-originated messages can NEVER approve destruction (only human sign-off allowed).
 *  4. System & presence events are unroutable.
 *  5. Triage semantic risk analysis assigns deterministic LOW risk to 0 KB/s resources.
 *  6. End-to-end executioner flow enforces snapshot -> termination -> SHA-256 audit log.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { routeMessage, _APPROVAL_PATTERN_FOR_TESTING } from '../src/router';
import { TriageAgent } from '../src/agents/triage';
import { ExecutionerAgent } from '../src/agents/executioner';
import { AuditLogger } from '../src/tools/audit-logger';
import { SwitchClient } from '../src/switch-client';
import { config, type Config } from '../src/config';
import type { SwitchRawEvent, IdleResourceReport } from '../src/types';

const testConfig: Config = {
  ...config,
  switchDryRun: true,
};

// Helper to construct a mock Switch event
function makeEvent(overrides: Partial<SwitchRawEvent>): SwitchRawEvent {
  return {
    id: 'evt-test-1',
    type: 'message',
    timestamp: new Date().toISOString(),
    sender: {
      kind: 'human',
      name: 'shankar',
    },
    content: '@executioner-sre approve i-04f8b9a912c1',
    roomId: 'statereaper-tribunal',
    ...overrides,
  };
}

describe('Safety Gate: Regex Lock & Approval Pattern', () => {
  it('accepts exact standard EC2 instance ID', () => {
    const input = '@executioner-sre approve i-04f8b9a912c1';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), true);
  });

  it('accepts exact Vercel deployment ID', () => {
    const input = '@executioner-sre approve dpl_4kXb9QrTmNpA';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), true);
  });

  it('accepts hyphenated and underscored resource identifiers', () => {
    const input = '@executioner-sre approve db_prod-cluster-2024';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), true);
  });

  it('rejects informal destructive phrasing ("just kill it i-12345")', () => {
    const input = 'just kill it i-12345';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects command injection with text suffix ("and drop tables")', () => {
    const input = '@executioner-sre approve i-12345 and drop tables';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects shell injection with semicolons ("; rm -rf /")', () => {
    const input = '@executioner-sre approve i-12345; rm -rf /';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects command injection with bash pipeline or logical operators ("&&")', () => {
    const input = '@executioner-sre approve i-12345 && cat /etc/passwd';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects prefix injection ("Please @executioner-sre approve i-12345")', () => {
    const input = 'Please @executioner-sre approve i-12345';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects CLI flags added to command ("--force")', () => {
    const input = '@executioner-sre approve i-12345 --force';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects missing resource ID ("@executioner-sre approve")', () => {
    const input = '@executioner-sre approve';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects multiple resource IDs in single command ("i-12345 i-67890")', () => {
    const input = '@executioner-sre approve i-12345 i-67890';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });

  it('rejects wrong agent name mention ("@triage-architect approve i-12345")', () => {
    const input = '@triage-architect approve i-12345';
    assert.strictEqual(_APPROVAL_PATTERN_FOR_TESTING.test(input), false);
  });
});

describe('Safety Gate: Switch Message Router Dispatch', () => {
  it('successfully routes a verified human approval command', () => {
    const event = makeEvent({
      sender: { kind: 'human', name: 'shankar' },
      content: '@executioner-sre approve i-04f8b9a912c1',
    });

    const parsed = routeMessage(event);
    assert.strictEqual(parsed.tag, 'approval_command');
    if (parsed.tag === 'approval_command') {
      assert.strictEqual(parsed.resourceId, 'i-04f8b9a912c1');
      assert.strictEqual(parsed.approvedBy, 'shankar');
    }
  });

  it('trims outer whitespace from human command before routing', () => {
    const event = makeEvent({
      sender: { kind: 'human', name: 'shankar' },
      content: '   @executioner-sre approve i-04f8b9a912c1   \n',
    });

    const parsed = routeMessage(event);
    assert.strictEqual(parsed.tag, 'approval_command');
    if (parsed.tag === 'approval_command') {
      assert.strictEqual(parsed.resourceId, 'i-04f8b9a912c1');
    }
  });

  it('strictly REJECTS approvals sent by AI agents (non-human)', () => {
    const event = makeEvent({
      sender: { kind: 'agent', name: 'triage-architect' },
      content: '@executioner-sre approve i-04f8b9a912c1',
    });

    const parsed = routeMessage(event);
    assert.strictEqual(parsed.tag, 'unroutable');
  });

  it('marks conversational or unformatted human messages as unroutable', () => {
    const event = makeEvent({
      sender: { kind: 'human', name: 'shankar' },
      content: 'Can someone check why our AWS bill is high?',
    });

    const parsed = routeMessage(event);
    assert.strictEqual(parsed.tag, 'unroutable');
  });

  it('marks system events as unroutable', () => {
    const event = makeEvent({
      type: 'system',
      content: 'User joined the room',
    });

    const parsed = routeMessage(event);
    assert.strictEqual(parsed.tag, 'unroutable');
  });

  it('marks presence events as unroutable', () => {
    const event = makeEvent({
      type: 'presence',
      content: 'online',
    });

    const parsed = routeMessage(event);
    assert.strictEqual(parsed.tag, 'unroutable');
  });
});

describe('Triage Agent: Semantic Risk & Blast Radius Analyzer', () => {
  it('determines LOW risk and snapshot-and-terminate for 0 KB/s ingress EC2', () => {
    const dummyClient = new SwitchClient(testConfig, async () => {});
    const triage = new TriageAgent(dummyClient);

    const report: IdleResourceReport = {
      resourceId: 'i-04f8b9a912c1',
      resourceType: 'ec2',
      region: 'us-east-1',
      idleDurationHours: 58,
      avgCpuPercent: 0.02,
      networkIngressKbps: 0,
      estimatedDailySpendUSD: 2.15,
      estimatedMonthlySpendUSD: 64.50,
      metadata: { instanceType: 't3.medium' },
      detectedAt: new Date().toISOString(),
    };

    const blastRadius = triage.analyzeDependencies(report);
    assert.strictEqual(blastRadius.riskLevel, 'LOW');
    assert.strictEqual(blastRadius.recommendedAction, 'snapshot-and-terminate');
    assert.strictEqual(blastRadius.approvalCommand, '@executioner-sre approve i-04f8b9a912c1');
    assert.strictEqual(blastRadius.dependencies.length >= 2, true);
  });

  it('determines MEDIUM risk and defers teardown for EC2 with active ingress', () => {
    const dummyClient = new SwitchClient(testConfig, async () => {});
    const triage = new TriageAgent(dummyClient);

    const report: IdleResourceReport = {
      resourceId: 'i-active-test',
      resourceType: 'ec2',
      region: 'us-east-1',
      idleDurationHours: 12,
      avgCpuPercent: 0.05,
      networkIngressKbps: 145.2, // Active traffic!
      estimatedDailySpendUSD: 5.0,
      estimatedMonthlySpendUSD: 150.0,
      metadata: {},
      detectedAt: new Date().toISOString(),
    };

    const blastRadius = triage.analyzeDependencies(report);
    assert.strictEqual(blastRadius.riskLevel, 'MEDIUM');
    assert.strictEqual(blastRadius.recommendedAction, 'defer');
  });

  it('determines LOW risk and terminate-only for orphaned Vercel preview deployments', () => {
    const dummyClient = new SwitchClient(testConfig, async () => {});
    const triage = new TriageAgent(dummyClient);

    const report: IdleResourceReport = {
      resourceId: 'dpl_8wRsL2vYcFqZ',
      resourceType: 'vercel_deployment',
      region: 'global',
      idleDurationHours: 96,
      avgCpuPercent: 0,
      networkIngressKbps: 0,
      estimatedDailySpendUSD: 1.20,
      estimatedMonthlySpendUSD: 36.00,
      metadata: { pullRequest: '#118' },
      detectedAt: new Date().toISOString(),
    };

    const blastRadius = triage.analyzeDependencies(report);
    assert.strictEqual(blastRadius.riskLevel, 'LOW');
    assert.strictEqual(blastRadius.recommendedAction, 'terminate-only');
    assert.strictEqual(blastRadius.approvalCommand, '@executioner-sre approve dpl_8wRsL2vYcFqZ');
  });
});

describe('Executioner Agent: Gated Teardown & Cryptographic Audit Trail', () => {
  const testLogPath = path.resolve(__dirname, 'test-audit.log');
  let testAuditLogger: AuditLogger;

  beforeEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
    testAuditLogger = new AuditLogger(testLogPath);
  });

  afterEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
  });

  it('executes full teardown pipeline and writes SHA-256 hash to audit log', async () => {
    const dummyClient = new SwitchClient(testConfig, async () => {});
    const triage = new TriageAgent(dummyClient);

    // Pre-populate triage registry
    const mockReport: IdleResourceReport = {
      resourceId: 'i-04f8b9a912c1',
      resourceType: 'ec2',
      region: 'us-east-1',
      idleDurationHours: 58,
      avgCpuPercent: 0.02,
      networkIngressKbps: 0,
      estimatedDailySpendUSD: 2.15,
      estimatedMonthlySpendUSD: 64.50,
      metadata: {},
      detectedAt: new Date().toISOString(),
    };
    triage.analyzeDependencies(mockReport);

    const executioner = new ExecutionerAgent(dummyClient, triage, testAuditLogger);

    const result = await executioner.executeApproval({
      resourceId: 'i-04f8b9a912c1',
      approvedBy: 'shankar',
    });

    assert.strictEqual(result.status, 'complete');
    assert.strictEqual(result.resourceId, 'i-04f8b9a912c1');
    assert.strictEqual(result.approvedBy, 'shankar');
    assert.strictEqual(typeof result.snapshotId, 'string');
    assert.strictEqual(result.snapshotId?.startsWith('snap-'), true);
    assert.strictEqual(typeof result.eventHash, 'string');
    assert.strictEqual(result.eventHash?.length, 64); // Valid SHA-256 hex string

    // Verify written file
    const records = await testAuditLogger.readAuditRecords();
    assert.strictEqual(records.length, 1);
    const rec = records[0];
    assert.ok(rec);
    assert.strictEqual(rec.resourceId, 'i-04f8b9a912c1');
    assert.strictEqual(rec.status, 'complete');
    assert.strictEqual(rec.eventHash, result.eventHash);
  });

  it('rejects execution if called with an invalid or injected command', async () => {
    const dummyClient = new SwitchClient(testConfig, async () => {});
    const triage = new TriageAgent(dummyClient);
    const executioner = new ExecutionerAgent(dummyClient, triage, testAuditLogger);

    await assert.rejects(
      async () => {
        await executioner.executeApproval({
          resourceId: 'i-12345; rm -rf /',
          approvedBy: 'attacker',
        });
      },
      {
        message: /\[SECURITY BREACH\] Malformed or injected command rejected/,
      },
    );

    // Audit log should remain empty
    const records = await testAuditLogger.readAuditRecords();
    assert.strictEqual(records.length, 0);
  });
});
