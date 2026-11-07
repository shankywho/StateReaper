/**
 * src/router.ts
 * Type-safe Switch message router.
 *
 * This is a pure function module — no side effects, no I/O, no state.
 * Every inbound SwitchRawEvent is mapped to exactly one ParsedMessage variant,
 * enabling exhaustive switch-based dispatch in the caller with full TypeScript
 * coverage guarantees.
 *
 * The APPROVAL_PATTERN is the critical safety regex. It is the sole code-level
 * gate that determines whether the executioner agent may act. It is defined
 * once here and referenced nowhere else.
 */

import type { SwitchRawEvent, ParsedMessage } from './types';

// ── Safety Gate Pattern ────────────────────────────────────────────────────

/**
 * The ONLY message pattern that may authorize a destructive teardown.
 *
 * Format:  @executioner-sre approve <RESOURCE_ID>
 * Where RESOURCE_ID matches: [a-zA-Z0-9_-]+
 *   - EC2 instance IDs:  i-04f8b9a912c1
 *   - Vercel deploy IDs: dpl_aBcDeFgHiJ
 *   - RDS instance IDs:  db-PROD-API-2024
 *
 * The pattern is anchored (^ and $) so no prefix or suffix can smuggle in an
 * approval. Matching is case-sensitive to prevent homoglyph abuse.
 */
const APPROVAL_PATTERN = /^@executioner-sre\s+approve\s+([a-zA-Z0-9_-]+)$/;

// ── Router ─────────────────────────────────────────────────────────────────

/**
 * Classifies a raw Switch event into a typed ParsedMessage.
 *
 * Rules (evaluated in order, first match wins):
 *  1. Non-message events (presence, system) → unroutable.
 *  2. Human messages matching APPROVAL_PATTERN → approval_command.
 *  3. Everything else → unroutable.
 *
 * Agent-originated messages are always unroutable because the orchestration
 * layer (index.ts) drives agent-to-agent handoffs via in-process calls, not
 * by parsing the chat room's own output.
 */
export function routeMessage(event: SwitchRawEvent): ParsedMessage {
  // ── Rule 1: Only route actual chat messages ──────────────────────────────
  if (event.type !== 'message') {
    return { tag: 'unroutable', event };
  }

  // ── Rule 2: Classify human approval commands ─────────────────────────────
  if (event.sender.kind === 'human') {
    const trimmed = event.content.trim();
    const match = APPROVAL_PATTERN.exec(trimmed);

    if (match !== null) {
      // match[1] is guaranteed by the capture group in APPROVAL_PATTERN.
      // noUncheckedIndexedAccess requires us to handle the undefined case.
      const resourceId = match[1];
      if (resourceId !== undefined) {
        return {
          tag: 'approval_command',
          resourceId,
          approvedBy: event.sender.name,
        };
      }
    }
  }

  // ── Rule 3: Everything else is unroutable ────────────────────────────────
  return { tag: 'unroutable', event };
}

/**
 * Exported for unit testing only.
 * Tests can import this to verify the regex behaves correctly without
 * going through the full routeMessage function.
 */
export const _APPROVAL_PATTERN_FOR_TESTING = APPROVAL_PATTERN;

