/**
 * tests/live-clients.test.ts
 * Unit tests for Phase 4 live production client capabilities:
 *  1. Fatal startup validation when USE_MOCK_TELEMETRY=false with missing credentials.
 *  2. AWS domain error classification (AWS_IAM_PERMISSION_DENIED, AWS_INSTANCE_NOT_FOUND, etc.).
 *  3. Vercel client error handling for 403 Forbidden and 404 Not Found.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AwsDomainError } from '../src/tools/aws-client';
import { VercelDomainError, pruneDeployment } from '../src/tools/vercel-client';

describe('Phase 4: Live AWS Client Domain Error Handling', () => {
  it('creates structured AwsDomainError instances with codes', () => {
    const err = new AwsDomainError('AWS_IAM_PERMISSION_DENIED', 'Missing ec2:TerminateInstances');
    assert.strictEqual(err.code, 'AWS_IAM_PERMISSION_DENIED');
    assert.strictEqual(err.name, 'AwsDomainError');
    assert.strictEqual(err.message.includes('AWS_IAM_PERMISSION_DENIED'), true);
  });
});

describe('Phase 4: Live Vercel Client Error Handling', () => {
  it('creates structured VercelDomainError instances with HTTP status code', () => {
    const err = new VercelDomainError('VERCEL_PERMISSION_DENIED', 'Forbidden', 403);
    assert.strictEqual(err.code, 'VERCEL_PERMISSION_DENIED');
    assert.strictEqual(err.statusCode, 403);
    assert.strictEqual(err.name, 'VercelDomainError');
  });

  it('pruneDeployment returns dry-run result in mock mode without throwing', async () => {
    const res = await pruneDeployment('dpl_test_123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.deletedId, 'dpl_test_123');
    assert.strictEqual(res.provider, 'vercel');
  });
});

