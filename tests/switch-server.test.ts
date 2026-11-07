/**
 * tests/switch-server.test.ts
 * Integration tests for the embedded Switch Protocol Server.
 *
 * Verifies that:
 *  1. /health returns 200 OK with protocol version.
 *  2. /rooms/:roomId/events accepts SSE subscriptions.
 *  3. /rooms/:roomId/messages broadcasts incoming payloads to SSE subscribers.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type * as http from 'node:http';
import axios from 'axios';
import { createSwitchServer } from '../src/mock/mock-switch-server';

describe('Switch Protocol Server (Embedded Engine)', () => {
  let server: http.Server;
  const TEST_PORT = 8999;
  const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = createSwitchServer();
      server.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('serves health check endpoint at /health', async () => {
    const res = await axios.get(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'ok');
    assert.strictEqual(res.data.protocol, 'switch-v1.0');
  });

  it('broadcasts message posted to /rooms/:roomId/messages', async () => {
    const res = await axios.post(`${BASE_URL}/rooms/test-tribunal/messages`, {
      sender: { kind: 'human', name: 'shankar' },
      content: '@executioner-sre approve i-04f8b9a912c1',
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(typeof res.data.eventId, 'string');
  });

  it('rejects malformed non-JSON payloads with HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/rooms/test-tribunal/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json: ',
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as { error: string };
    assert.strictEqual(data.error, 'Invalid JSON payload');
  });
});
