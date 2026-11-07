/**
 * src/index.ts
 * StateReaper — main entry point.
 *
 * Wires together:
 *  1. Validated config
 *  2. SwitchClient (SSE subscription + HTTP poster)
 *  3. Type-safe message router
 *  4. TelemetryAgent (polling loop)
 *  5. TriageAgent (semantic dependency & risk evaluator)
 *  6. ExecutionerAgent (gated destruction daemon)
 *  7. Graceful shutdown on SIGTERM / SIGINT
 */

import 'dotenv/config';
import * as readline from 'node:readline';
import { config } from './config';
import { SwitchClient } from './switch-client';
import { routeMessage } from './router';
import { TelemetryAgent } from './agents/telemetry';
import { TriageAgent } from './agents/triage';
import { ExecutionerAgent } from './agents/executioner';
import type { SwitchRawEvent, ParsedMessage } from './types';

// ── Boot banner ────────────────────────────────────────────────────────────

function printBanner(): void {
  const lines = [
    ``,
    `  ███████╗████████╗ █████╗ ████████╗███████╗`,
    `  ██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██╔════╝`,
    `  ███████╗   ██║   ███████║   ██║   █████╗  `,
    `  ╚════██║   ██║   ██╔══██║   ██║   ██╔══╝  `,
    `  ███████║   ██║   ██║  ██║   ██║   ███████╗`,
    `  ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚══════╝`,
    `  ██████╗ ███████╗ █████╗ ██████╗ ███████╗██████╗ `,
    `  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗`,
    `  ██████╔╝█████╗  ███████║██████╔╝█████╗  ██████╔╝`,
    `  ██╔══██╗██╔══╝  ██╔══██║██╔═══╝ ██╔══╝  ██╔══██╗`,
    `  ██║  ██║███████╗██║  ██║██║     ███████╗██║  ██║`,
    `  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝`,
    ``,
    `  Agentic FinOps Tribunal — Flip the Switch Hackathon`,
    `  Switch bridge: telegram | Provider: antigravity`,
    ``,
  ];
  lines.forEach((l) => console.log(l));
}

// ── Message dispatcher ─────────────────────────────────────────────────────

/**
 * Builds the inbound message handler that the SwitchClient will invoke for
 * every validated SSE event.
 */
function buildMessageHandler(executioner: ExecutionerAgent): (event: SwitchRawEvent) => Promise<void> {
  return async (event: SwitchRawEvent): Promise<void> => {
    const parsed: ParsedMessage = routeMessage(event);

    switch (parsed.tag) {
      // ── Approval command from human ──────────────────────────────────────
      case 'approval_command': {
        console.log(
          `[Router] 🔑 Approval command received.`,
          `Resource: ${parsed.resourceId} | Approved by: @${parsed.approvedBy}`,
        );
        try {
          await executioner.executeApproval({
            resourceId: parsed.resourceId,
            approvedBy: parsed.approvedBy,
          });
        } catch (err) {
          console.error(`[Router] Executioner error for ${parsed.resourceId}:`, err);
        }
        break;
      }

      // ── Unroutable (agent messages, unrecognised human input) ────────────
      case 'unroutable': {
        const { sender, type, content } = parsed.event;
        if (type === 'message' && sender.kind === 'human') {
          // Surface unrecognised human commands so they don't silently vanish
          console.log(
            `[Router] Unmatched human message from @${sender.name}:`,
            `"${content.slice(0, 120)}"`,
          );
        }
        // Agent messages are intentionally silent — no log spam on high-frequency rooms
        break;
      }

      // ── Exhaustiveness check (compile-time guarantee) ────────────────────
      default: {
        const _exhaustive: never = parsed;
        console.error('[Router] Unhandled message variant:', _exhaustive);
      }
    }
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  printBanner();

  console.log('[StateReaper] Configuration:');
  console.log(`  Switch Server  : ${config.switchServerUrl}`);
  console.log(`  Room ID        : ${config.switchRoomId}`);
  console.log(`  Dry Run        : ${config.switchDryRun}`);
  console.log(`  Mock Telemetry : ${config.useMockTelemetry}`);
  console.log(`  Poll Interval  : ${config.telemetryPollIntervalMs}ms`);
  console.log(`  Idle CPU Gate  : <${config.idleCpuThresholdPercent}%`);
  console.log(`  Idle Duration  : >${config.idleDurationThresholdHours}h`);
  console.log('');

  // Placeholder reference so client can invoke messageHandler before executioner is fully defined
  let executionerRef: ExecutionerAgent | null = null;

  const client = new SwitchClient(config, async (event) => {
    if (executionerRef) {
      await buildMessageHandler(executionerRef)(event);
    }
  });

  // ── Instantiate Agents ───────────────────────────────────────────────────
  const triageAgent = new TriageAgent(client);
  const executionerAgent = new ExecutionerAgent(client, triageAgent);
  executionerRef = executionerAgent;

  // ── Start Switch SSE connection ──────────────────────────────────────────
  const disconnectSSE = client.connect();

  // ── Start @cost-telemetry polling ────────────────────────────────────────
  const telemetryAgent = new TelemetryAgent(client, config, async (report) => {
    // Automatically trigger @triage-architect evaluation for flagged resources
    await triageAgent.evaluate(report);
  });
  telemetryAgent.start();

  // ── Standalone Console Switch Bridge (when running locally in dry-run) ────
  let rl: readline.Interface | null = null;
  if (config.switchDryRun && process.stdin.isTTY) {
    console.log('[Console Switch Bridge] 💬 Interactive terminal bridge active.');
    console.log('[Console Switch Bridge] 👉 To simulate a human approval, type or paste:');
    console.log('   @executioner-sre approve i-04f8b9a912c1\n');

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event: SwitchRawEvent = {
        id: `cli-${Date.now()}`,
        type: 'message',
        timestamp: new Date().toISOString(),
        sender: {
          kind: 'human',
          name: process.env.USER ?? 'operator',
        },
        content: trimmed,
        roomId: config.switchRoomId,
      };
      if (executionerRef) {
        void buildMessageHandler(executionerRef)(event);
      }
    });
  }

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = (signal: string): void => {
    console.log(`\n[StateReaper] Received ${signal} — shutting down gracefully...`);
    if (rl) {
      rl.close();
    }
    telemetryAgent.stop();
    disconnectSSE();
    console.log('[StateReaper] Shutdown complete. Goodbye.');
    process.exit(0);
  };

  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
  process.on('SIGINT', () => { shutdown('SIGINT'); });

  console.log('[StateReaper] ✅ Running. Ctrl+C to stop.\n');
}

main().catch((err: unknown) => {
  console.error('[StateReaper] ❌ Fatal startup error:', err);
  process.exit(1);
});
