/**
 * src/switch-client.ts
 * Switch HTTP + SSE client.
 *
 * Responsibilities:
 *  1. POST messages to the Switch room on behalf of named agents.
 *  2. Subscribe to the room's SSE stream and deliver typed events to a caller-
 *     supplied handler.
 *  3. Handle connection drops with exponential-backoff reconnection so the
 *     pipeline stays alive across transient network failures.
 */

import { EventSource } from 'eventsource';
import axios, { type AxiosInstance } from 'axios';
import type { SwitchRawEvent } from './types';
import type { Config } from './config';

// ── Reconnect constants ────────────────────────────────────────────────────

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

// ── Public types ───────────────────────────────────────────────────────────

/** Async callback invoked for each validated inbound Switch event. */
export type MessageHandler = (event: SwitchRawEvent) => Promise<void>;

// ── Runtime type guard ─────────────────────────────────────────────────────

/**
 * Validates that a parsed JSON object conforms to the SwitchRawEvent shape.
 * Uses a series of explicit field checks to avoid unsafe `as` casts on the
 * hot path. `noUncheckedIndexedAccess` is satisfied because we access fields
 * via explicit bracket notation on a typed intermediate.
 */
function isSwitchRawEvent(value: unknown): value is SwitchRawEvent {
  if (typeof value !== 'object' || value === null) return false;

  const v = value as Record<string, unknown>;

  if (typeof v['id'] !== 'string') return false;
  if (v['type'] !== 'message' && v['type'] !== 'presence' && v['type'] !== 'system') return false;
  if (typeof v['timestamp'] !== 'string') return false;
  if (typeof v['content'] !== 'string') return false;
  if (typeof v['roomId'] !== 'string') return false;

  const sender = v['sender'];
  if (typeof sender !== 'object' || sender === null) return false;

  const s = sender as Record<string, unknown>;
  if (s['kind'] !== 'agent' && s['kind'] !== 'human') return false;
  if (typeof s['name'] !== 'string') return false;

  return true;
}

// ── SwitchClient ───────────────────────────────────────────────────────────

export class SwitchClient {
  private readonly http: AxiosInstance;
  private readonly sseUrl: string;
  private readonly messagesUrl: string;

  private backoffMs: number = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private es: EventSource | null = null;
  private isShuttingDown: boolean = false;

  constructor(
    private readonly config: Config,
    private readonly onMessage: MessageHandler,
  ) {
    this.sseUrl = `${config.switchServerUrl}/rooms/${config.switchRoomId}/events`;
    this.messagesUrl = `${config.switchServerUrl}/rooms/${config.switchRoomId}/messages`;

    this.http = axios.create({
      baseURL: config.switchServerUrl,
      headers: {
        Authorization: `Bearer ${config.switchApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
  }

  /**
   * Opens the SSE connection and starts listening for room events.
   * Returns a cleanup function that tears down the connection on call.
   */
  connect(): () => void {
    this.isShuttingDown = false;
    this.openConnection();
    return () => {
      this.shutdown();
    };
  }

  /**
   * Posts a message to the Switch room on behalf of `agentName`.
   * In dry-run mode, prints to stdout instead of making a network call.
   */
  async postMessage(agentName: string, content: string): Promise<void> {
    if (this.config.switchDryRun) {
      const border = '─'.repeat(60);
      console.log(`\n[DRY RUN] ┌${border}┐`);
      console.log(`[DRY RUN] │ @${agentName}`);
      console.log(`[DRY RUN] │`);
      content.split('\n').forEach((line) => console.log(`[DRY RUN] │ ${line}`));
      console.log(`[DRY RUN] └${border}┘\n`);
      return;
    }

    try {
      await this.http.post(this.messagesUrl, {
        sender: { kind: 'agent', name: agentName },
        content,
      });
    } catch (err) {
      // Non-fatal: log and continue. The room message failing shouldn't crash
      // the event loop or block the safety gate.
      console.error(`[SwitchClient] Failed to post message as @${agentName}:`, err);
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private openConnection(): void {
    if (this.isShuttingDown) return;

    if (this.config.switchDryRun) {
      console.log('[SwitchClient] DRY RUN mode — SSE subscription skipped.');
      console.log('[SwitchClient] Agent telemetry will post to stdout on each poll cycle.');
      return;
    }

    console.log(`[SwitchClient] Connecting → ${this.sseUrl}`);

    const authKey = this.config.switchApiKey;
    const es = new EventSource(this.sseUrl, {
      // eventsource v3 uses the Fetch API — inject auth header via custom fetch
      fetch: (url, init) =>
        fetch(url as string, {
          ...init,
          headers: {
            ...init.headers,
            Authorization: `Bearer ${authKey}`,
          },
        }),
    });
    this.es = es;

    es.onopen = () => {
      console.log('[SwitchClient] ✅ SSE connection established.');
      this.backoffMs = MIN_BACKOFF_MS; // reset on clean connect
    };

    es.onmessage = (event: MessageEvent) => {
      this.handleRawPayload(event.data as string);
    };

    es.onerror = (_err: Event) => {
      if (this.isShuttingDown) return;
      console.warn(
        `[SwitchClient] SSE error — reconnecting in ${this.backoffMs}ms...`,
      );
      es.close();
      this.es = null;
      this.scheduleReconnect();
    };
  }

  private handleRawPayload(raw: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[SwitchClient] Non-JSON SSE payload received — skipping:', raw);
      return;
    }

    if (!isSwitchRawEvent(parsed)) {
      console.warn('[SwitchClient] Malformed event shape — skipping:', parsed);
      return;
    }

    // Dispatch and swallow unhandled rejections at this boundary
    this.onMessage(parsed).catch((err: unknown) => {
      console.error('[SwitchClient] Unhandled error in message handler:', err);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.isShuttingDown) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoffMs = Math.min(this.backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
      this.openConnection();
    }, this.backoffMs);
  }

  private shutdown(): void {
    this.isShuttingDown = true;
    this.es?.close();
    this.es = null;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    console.log('[SwitchClient] Connection closed.');
  }
}
