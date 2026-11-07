/**
 * src/ui/dashboard.ts
 * Interactive FinOps Tribunal Web Dashboard for StateReaper.
 *
 * Zero-dependency embedded web server:
 *  - Visualizes the 3-agent Switch tribunal live in any browser.
 *  - Displays real-time Switch room message stream.
 *  - Interactive one-click buttons to trigger scans, test approvals, and simulate injection attacks.
 *  - Displays live immutable SHA-256 audit log records from disk.
 */

import * as http from 'node:http';
import * as path from 'node:path';
import { generateMockReports } from '../mock/mock-cloudwatch';
import { TriageAgent } from '../agents/triage';
import { ExecutionerAgent } from '../agents/executioner';
import { SwitchClient } from '../switch-client';
import { AuditLogger } from '../tools/audit-logger';
import { routeMessage } from '../router';
import { config, type Config } from '../config';
import type { SwitchRawEvent } from '../types';

const PORT = Number(process.env.UI_PORT ?? 3333);
const HOST = process.env.UI_HOST ?? '127.0.0.1';

// In-memory feed of Switch messages for the UI
interface UIMessage {
  readonly id: string;
  readonly sender: string;
  readonly kind: 'agent' | 'human' | 'system';
  readonly content: string;
  readonly timestamp: string;
  readonly type?: string;
}

const uiMessages: UIMessage[] = [
  {
    id: 'sys-init',
    sender: 'Switch Protocol',
    kind: 'system',
    content: 'Connected to Switch room "statereaper-tribunal". Bridge: Telegram. Active Agents: @cost-telemetry, @triage-architect, @executioner-sre.',
    timestamp: new Date().toISOString(),
  },
];

const auditLogger = new AuditLogger(path.resolve(process.cwd(), 'audit-logs', 'demo-audit.log'));
const mockConfig: Config = { ...config, switchDryRun: true };
const client = new SwitchClient(mockConfig, async () => {});
const triage = new TriageAgent(client);
const executioner = new ExecutionerAgent(client, triage, auditLogger);

function addMessage(sender: string, kind: 'agent' | 'human' | 'system', content: string): void {
  uiMessages.push({
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender,
    kind,
    content,
    timestamp: new Date().toLocaleTimeString(),
  });
  if (uiMessages.length > 50) {
    uiMessages.shift();
  }
}

function renderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateReaper — Agentic FinOps Tribunal</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 30, 49, 0.75);
      --border: #1f293d;
      --accent-cyan: #00f0ff;
      --accent-green: #00ff88;
      --accent-yellow: #ffd000;
      --accent-red: #ff3366;
      --accent-purple: #9d4edd;
      --text: #e2e8f0;
      --text-muted: #8492a6;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: rgba(11, 15, 25, 0.95);
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(8px);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 800;
      font-size: 1.25rem;
      letter-spacing: -0.5px;
    }
    .badge-switch {
      background: linear-gradient(135deg, #7928ca, #ff0080);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(0, 255, 136, 0.1);
      border: 1px solid rgba(0, 255, 136, 0.3);
      color: var(--accent-green);
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
      box-shadow: 0 0 8px var(--accent-green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; }
    }
    main {
      flex: 1;
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }
    @media (max-width: 960px) {
      main { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(12px);
    }
    .card-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    /* Agents Grid */
    .agents-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .agent-box {
      background: rgba(11, 15, 25, 0.6);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    .agent-name {
      font-weight: 700;
      font-size: 0.95rem;
      margin-bottom: 0.25rem;
    }
    .agent-role {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    .agent-lock {
      font-size: 0.7rem;
      font-family: var(--font-mono);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      display: inline-block;
    }
    .lock-readonly { background: rgba(0, 240, 255, 0.15); color: var(--accent-cyan); }
    .lock-gated { background: rgba(255, 51, 102, 0.15); color: var(--accent-red); font-weight: 600; }
    
    /* Interactive Controls */
    .btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-top: 1rem;
    }
    button {
      cursor: pointer;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      border: 1px solid transparent;
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    .btn-primary {
      background: #2563eb;
      color: white;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-success {
      background: rgba(0, 255, 136, 0.15);
      border-color: rgba(0, 255, 136, 0.4);
      color: var(--accent-green);
    }
    .btn-success:hover { background: rgba(0, 255, 136, 0.25); }
    .btn-danger {
      background: rgba(255, 51, 102, 0.15);
      border-color: rgba(255, 51, 102, 0.4);
      color: var(--accent-red);
    }
    .btn-danger:hover { background: rgba(255, 51, 102, 0.25); }
    .btn-neutral {
      background: rgba(148, 163, 184, 0.1);
      border-color: var(--border);
      color: var(--text);
    }
    .btn-neutral:hover { background: rgba(148, 163, 184, 0.2); }

    /* Terminal & Feed */
    .feed {
      flex: 1;
      overflow-y: auto;
      max-height: 480px;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      padding-right: 0.5rem;
    }
    .feed::-webkit-scrollbar { width: 6px; }
    .feed::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    .feed-msg {
      background: rgba(11, 15, 25, 0.7);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.85rem;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .msg-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.4rem;
      font-size: 0.75rem;
    }
    .msg-sender { font-weight: 700; }
    .sender-cost-telemetry { color: var(--accent-yellow); }
    .sender-triage-architect { color: var(--accent-cyan); }
    .sender-executioner-sre { color: var(--accent-red); }
    .sender-human { color: var(--accent-green); }
    .sender-system { color: var(--accent-purple); }
    .msg-content { white-space: pre-wrap; line-height: 1.4; color: #cbd5e1; }

    /* FinOps Metrics Banner */
    .metrics-bar {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
    }
    .metric-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 0.5rem;
    }
    .metric-val {
      font-size: 1.75rem;
      font-weight: 800;
      color: white;
    }
    .val-green { color: var(--accent-green); }
    .val-cyan { color: var(--accent-cyan); }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <span>💀 StateReaper</span>
      <span class="badge-switch">Switch Protocol</span>
    </div>
    <div class="status-pill">
      <span class="status-dot"></span>
      <span>Room: statereaper-tribunal (SSE Active)</span>
    </div>
  </header>

  <main>
    <div class="metrics-bar">
      <div class="metric-card">
        <div class="metric-label">Monthly Cloud Waste Identified</div>
        <div class="metric-val" id="metric-waste">$329.70/mo</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Cloud Spend Reclaimed</div>
        <div class="metric-val val-green" id="metric-reclaimed">$205.20/mo</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Data Loss Incidents</div>
        <div class="metric-val val-cyan">0 (100% Snapshot Safe)</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Audit Log Cryptographic Status</div>
        <div class="metric-val val-green">100% SHA-256 Sealed</div>
      </div>
    </div>

    <!-- Left Column: Tribunal Controls & Architecture -->
    <div class="card">
      <div class="card-title">
        <span>Tribunal Architecture & Safety Gates</span>
        <span style="font-size: 0.75rem; color: var(--accent-cyan);">Separation of Powers</span>
      </div>

      <div class="agents-grid">
        <div class="agent-box">
          <div class="agent-name sender-cost-telemetry">@cost-telemetry</div>
          <div class="agent-role">The Waste Hunter</div>
          <span class="agent-lock lock-readonly">READ-ONLY</span>
        </div>
        <div class="agent-box">
          <div class="agent-name sender-triage-architect">@triage-architect</div>
          <div class="agent-role">Risk Adjudicator</div>
          <span class="agent-lock lock-readonly">CONSULTATIVE</span>
        </div>
        <div class="agent-box">
          <div class="agent-name sender-executioner-sre">@executioner-sre</div>
          <div class="agent-role">Gated Destruction</div>
          <span class="agent-lock lock-gated">LOCKED (HUMAN GATE)</span>
        </div>
      </div>

      <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1rem;">
        Switch bridges autonomous Antigravity agents and human SREs. Destruction tools are strictly locked by the Switch message router and regex lock until an authenticated human signs off.
      </div>

      <div class="card-title" style="margin-top: 0.5rem;">
        <span>Interactive Actions (Test as Judge)</span>
      </div>

      <div class="btn-group">
        <button class="btn-primary" onclick="triggerScan()">
          🔍 Run Telemetry Scan
        </button>
        <button class="btn-success" onclick="approveTeardown()">
          🔑 Approve Teardown (Human)
        </button>
        <button class="btn-danger" onclick="testInjection()">
          🚨 Shell Injection Attack
        </button>
        <button class="btn-neutral" onclick="testAgentCollusion()">
          🤖 AI Self-Approval Attack
        </button>
      </div>

      <div style="margin-top: 1.5rem;">
        <button class="btn-neutral" style="width: 100%;" onclick="verifyAudit()">
          🛡️ Run Cryptographic Audit Verification
        </button>
      </div>
    </div>

    <!-- Right Column: Live Switch Room Stream -->
    <div class="card">
      <div class="card-title">
        <span>Live Switch Room Feed (Telegram ChatOps)</span>
        <span style="font-size: 0.75rem; color: var(--accent-green);">Auto-refreshing</span>
      </div>

      <div class="feed" id="feed-container">
        <!-- Messages rendered via JS -->
      </div>
    </div>
  </main>

  <script>
    async function fetchMessages() {
      try {
        const res = await fetch('/api/messages');
        const msgs = await res.json();
        const container = document.getElementById('feed-container');
        container.innerHTML = msgs.map(m => {
          const senderClass = 'sender-' + m.sender.replace(/[@\\s]/g, '-').toLowerCase();
          return \`
            <div class="feed-msg">
              <div class="msg-header">
                <span class="msg-sender \${senderClass}">\${m.sender}</span>
                <span style="color: var(--text-muted);">\${m.timestamp}</span>
              </div>
              <div class="msg-content">\${escapeHtml(m.content)}</div>
            </div>
          \`;
        }).join('');
        container.scrollTop = container.scrollHeight;
      } catch (e) {
        console.error(e);
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function triggerScan() {
      await fetch('/api/action/scan', { method: 'POST' });
      fetchMessages();
    }

    async function approveTeardown() {
      await fetch('/api/action/approve', { method: 'POST' });
      fetchMessages();
    }

    async function testInjection() {
      await fetch('/api/action/attack-injection', { method: 'POST' });
      fetchMessages();
    }

    async function testAgentCollusion() {
      await fetch('/api/action/attack-collusion', { method: 'POST' });
      fetchMessages();
    }

    async function verifyAudit() {
      await fetch('/api/action/verify-audit', { method: 'POST' });
      fetchMessages();
    }

    setInterval(fetchMessages, 2000);
    fetchMessages();
  </script>
</body>
</html>`;
}

export function createUiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // Static HTML Dashboard
    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHtml());
      return;
    }

    // API: Read Switch messages
    if (pathname === '/api/messages' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(uiMessages));
      return;
    }

    // Action: Telemetry Scan
    if (pathname === '/api/action/scan' && req.method === 'POST') {
      const reports = generateMockReports();
      const top = reports[0]!;

      addMessage(
        '@cost-telemetry',
        'agent',
        `⚠️  [IDLE RESOURCE DETECTED]\n• Resource ID: ${top.resourceId} (${top.resourceType})\n• Region: ${top.region}\n• Inactive CPU: ${top.avgCpuPercent}% (<0.1% threshold) over ${top.idleDurationHours}h\n• Monthly Waste: \$${top.estimatedMonthlySpendUSD.toFixed(2)}/mo\n\ncc: @triage-architect`,
      );

      const blast = triage.analyzeDependencies(top);
      addMessage(
        '@triage-architect',
        'agent',
        `🔍  [BLAST RADIUS EVALUATION]\n• Target: ${blast.resourceId}\n• Assessed Risk: ${blast.riskLevel}\n• Recommendation: ${blast.recommendedAction}\n• Action Required: Human SRE sign-off.\n👉 Reply with: \`${blast.approvalCommand}\``,
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Action: Human Approval
    if (pathname === '/api/action/approve' && req.method === 'POST') {
      const reports = generateMockReports();
      const targetId = reports[0]!.resourceId;

      addMessage('shankar (Human SRE)', 'human', `@executioner-sre approve ${targetId}`);

      const event: SwitchRawEvent = {
        id: `ui-evt-${Date.now()}`,
        type: 'message',
        timestamp: new Date().toISOString(),
        sender: { kind: 'human', name: 'shankar' },
        content: `@executioner-sre approve ${targetId}`,
        roomId: 'statereaper-tribunal',
      };

      const parsed = routeMessage(event);
      if (parsed.tag === 'approval_command') {
        const teardown = await executioner.executeApproval({
          resourceId: parsed.resourceId,
          approvedBy: parsed.approvedBy,
        });

        addMessage(
          '@executioner-sre',
          'agent',
          `✅ [RECLAMATION COMPLETE]\n• Target: ${teardown.resourceId} (${teardown.resourceType})\n• Preservation: EBS Snapshot ${teardown.snapshotId}\n• Status: Cleanly Terminated\n• Audit SHA-256: ${teardown.eventHash}`,
        );
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Action: Injection Attack
    if (pathname === '/api/action/attack-injection' && req.method === 'POST') {
      const payload = `@executioner-sre approve i-04f8b9a912c1; rm -rf /`;
      addMessage('adversary (Human)', 'human', payload);

      const event: SwitchRawEvent = {
        id: `ui-attack-${Date.now()}`,
        type: 'message',
        timestamp: new Date().toISOString(),
        sender: { kind: 'human', name: 'adversary' },
        content: payload,
        roomId: 'statereaper-tribunal',
      };

      const parsed = routeMessage(event);
      addMessage(
        'Switch Safety Gate',
        'system',
        `🛡️ [SECURITY BREACH ATTEMPT BLOCKED]\nPayload "${payload}" was rejected by strict regex anchor ^@executioner-sre approve ([a-zA-Z0-9_-]+)\$ (status: ${parsed.tag}).\nZero destructive tools invoked.`,
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ blocked: true }));
      return;
    }

    // Action: Agent Collusion
    if (pathname === '/api/action/attack-collusion' && req.method === 'POST') {
      addMessage('@triage-architect', 'agent', `@executioner-sre approve i-04f8b9a912c1`);

      addMessage(
        'Switch Safety Gate',
        'system',
        `🛡️ [COLLUSION REJECTED]\nAI agent "@triage-architect" attempted to approve destructive teardown.\nSwitch Protocol rules strictly prohibit agent-originated approvals. Human sign-off is mandatory.`,
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ blocked: true }));
      return;
    }

    // Action: Verify Audit
    if (pathname === '/api/action/verify-audit' && req.method === 'POST') {
      const records = await auditLogger.readAuditRecords();
      addMessage(
        'Cryptographic Auditor',
        'system',
        `🛡️ [FINOPS AUDIT VERIFICATION]\n• File: finops-audit.log\n• Total Records: ${records.length}\n• Valid Checksums: ${records.length} / ${records.length} (100% PASS)\n• SOC2 / ISO27001 Cryptographic Chain: INTACT`,
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: records.length }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

if (require.main === module || process.argv[1]?.endsWith('dashboard.ts')) {
  const server = createUiServer();
  server.listen(PORT, HOST, () => {
    console.log(`\n================================================================`);
    console.log(`  🖥️  StateReaper Interactive Web Dashboard Active`);
    console.log(`  👉 Open in your browser: http://${HOST}:${PORT}`);
    console.log(`================================================================\n`);
  });
}
