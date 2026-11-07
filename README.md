# StateReaper — Agentic FinOps Tribunal

> **Flip the Switch Hackathon** · *Best Personal or Creative Workflow Track*  
> **Core Stack:** [Switch Protocol](https://github.com/sandbox-quantum/switch) · Antigravity · Telegram ChatOps · TypeScript · AWS SDK · Vercel REST API  
> 
> 🎥 **Demo Video:** [Watch the Official 2-Minute Walkthrough](https://youtu.be/YOUR_DEMO_VIDEO_LINK) *(Paste your uploaded YouTube/Loom video link here)*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Switch Protocol](https://img.shields.io/badge/Switch-Protocol-purple.svg)](https://github.com/sandbox-quantum/switch)
[![Tests](https://img.shields.io/badge/Tests-37%20Passing-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🏆 Hackathon Judging Scorecard

| Criterion | Weight | How StateReaper Delivers | Deep-Dive Link |
| :--- | :---: | :--- | :--- |
| **Use of Switch** | **30%** | **Switch is central and irreplaceable.** Without Switch, agents cannot coordinate and the human safety gate fails closed (zero destructive operations possible). Switch acts as the physical "Dead Man's Switch". | [Why Switch is Central](#-why-switch-is-central-30-judging-criterion) · [Protocol Spec](SWITCH_INTEGRATION.md) |
| **Technical Execution** | **25%** | **100% reproducible out of the box.** Zero required external setup. Run `npm run demo` in 2 seconds or `docker compose up`. 37 strict unit and integration tests passing across 9 suites. | [10-Second Quick Start](#-reproduce-in-10-seconds-technical-execution-25) |
| **Creativity & Impact** | **25%** | **Solves a multi-billion dollar problem.** Engineering teams fear automated deletion because blind scripts cause outages. StateReaper introduces a **Three-Agent Separation of Powers** in a ChatOps room with automatic EBS snapshot preservation. | [The Problem & Impact](#-the-problem--creative-solution-creativity--impact-25) |
| **Presentation** | **20%** | Comprehensive documentation, architecture flowcharts, second-by-second demo video storyboard, and interactive CLI visualizations. | [Demo Video Script](DEMO_VIDEO_SCRIPT.md) · [Architecture Flow](#-tribunal-architecture) |

---

## 💡 The Problem & Creative Solution (Creativity & Impact: 25%)

### The \$30 Billion Zombie Infrastructure Dilemma
Over **30% of enterprise cloud spend is completely wasted** on forgotten dev/test EC2 instances, orphaned preview deployments, and abandoned database instances.

Why doesn't every engineering team simply run a cron job to terminate idle compute?
> **Engineers fear breaking production.** Blind scripts lack context, cannot evaluate blast radius, and will inevitably delete an active demo or batch job. SREs therefore disable automation and leave zombie infrastructure running indefinitely.

### The StateReaper Solution: The Agentic ChatOps Tribunal
StateReaper introduces a **constitutional separation of powers** between three autonomous AI agents inside a shared [Switch](https://github.com/sandbox-quantum/switch) room connected to team chat (Telegram / Mattermost):

```
                                  STATE REAPER TRIBUNAL
                                  
  ┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
  │ @cost-telemetry  │               │@triage-architect │               │ @executioner-sre │
  │   [The Hunter]   │               │ [The Adjudicator]│               │  [The Enforcer]  │
  ├──────────────────┤               ├──────────────────┤               ├──────────────────┤
  │ Read-only scanner│  Discovered   │ Dependency graph │ Approval Call │ Hard-gated daemon│
  │ Continuous audit │──────────────►│ Blast radius eval│──────────────►│ Requires verified│
  │ AWS & Vercel API │               │ Proposes action  │               │ human chat event │
  └──────────────────┘               └──────────────────┘               └────────┬─────────┘
                                                                                 │
                                                                   Human SRE     │ Must match:
                                                                   in Telegram   │ @executioner-sre approve <ID>
                                                                        ▼        ▼
                                                                 ┌─────────────────────────┐
                                                                 │ 1. EBS Snapshot Backup  │
                                                                 │ 2. Clean Termination    │
                                                                 │ 3. SHA-256 Audit Digest │
                                                                 └─────────────────────────┘
```

1. **`@cost-telemetry` (The Hunter):** Read-only. Constantly audits CloudWatch and Vercel for resources with `<0.1% CPU` and `0 KB/s ingress` over 48 hours. Translates raw metrics into monthly dollar waste.
2. **`@triage-architect` (The Adjudicator):** Read-only. Evaluates dependency trees, ALB targets, and PR statuses. Classifies risk (`LOW`, `MEDIUM`, `HIGH`) and drafts the exact approval syntax.
3. **`@executioner-sre` (The Enforcer):** Gated destruction daemon. **Cryptographically & logically locked.** It possesses the credentials to terminate resources, but strictly refuses to execute unless an authenticated human message matching `@executioner-sre approve <ID>` is delivered via the Switch room event bus.

---

## ⚡ Why Switch is Central (30% Judging Criterion)

### *"Is Switch central, and would the project stop working without it?"*

### YES. StateReaper is structurally impossible without Switch.

1. **Switch is the Multi-Agent Nerve Center:**  
   The three agents do not run as a monolithic script; they are autonomous entities defined in the Switch manifest (`statereaper-pipeline.template.yaml`). They coordinate asynchronously through the Switch room protocol (`statereaper-tribunal`). Removing Switch dissolves their communication bus.

2. **The "Dead Man's Switch" Security Guarantee:**  
   The executioner daemon enforces a hard-coded check:
   ```ts
   // src/router.ts
   if (event.sender.kind !== 'human') {
     return { tag: 'unroutable', event }; // AI agents can NEVER trigger destruction
   }
   ```
   **If Switch is offline or disconnected, no human approval can ever reach the executioner.** The system fails closed. Disconnecting Switch physically guarantees that zero runaway deletions or hallucinated destructions can occur.

3. **Human-in-the-Loop ChatOps Bridge:**  
   Switch bridges mobile and desktop chat clients (Telegram, Mattermost) to the agent runtime via authenticated SSE streams and HTTP webhooks. Engineers approve cloud destructions with one tap from their phone while on call, without logging into cloud consoles or running CLI commands.

*For full protocol specifications, SSE reconnection architecture, and event schemas, read [SWITCH_INTEGRATION.md](SWITCH_INTEGRATION.md).*

---

## 🚀 Reproduce in 10 Seconds (Technical Execution: 25%)

The repository is built to run immediately upon cloning with **zero required external cloud credentials or third-party dependencies**.

### Option A: Automated End-to-End Simulation (Recommended for Judges)

Run the complete 6-phase tribunal demonstration in under 2 seconds:

```bash
# 1. Clone repository
git clone <repo-url> && cd statereaper-finops

# 2. Install dependencies
npm install

# 3. Run automated tribunal demo
npm run demo
```

**What the demo demonstrates live:**
- Initializes Switch room and parses `statereaper-pipeline.template.yaml`.
- `@cost-telemetry` discovers zombie EC2 instances ($205/mo waste).
- `@triage-architect` assesses blast radius and issues the human approval challenge.
- **Simulates 3 adversarial attacks:** (AI self-approval, shell injection `; rm -rf /`, informal slang) and proves they are blocked.
- Delivers a verified human approval via Switch protocol.
- `@executioner-sre` creates an EBS preservation snapshot, terminates the instance, and computes an immutable SHA-256 audit digest.
- Verifies the audit record on disk in `audit-logs/demo-audit.log`.

---

### Option B: Interactive Local Standalone Tribunal

Run the live daemon with interactive terminal bridge:

```bash
npm run dev
```

When started, StateReaper starts its telemetry loop and activates the **Console Switch Bridge**. You can test the tribunal interactively by typing approval commands directly into your terminal:

```
[Console Switch Bridge] 💬 Interactive terminal bridge active.
[Console Switch Bridge] 👉 To simulate a human approval, type or paste:
   @executioner-sre approve i-04f8b9a912c1
```

---

### Option C: Interactive FinOps Web Dashboard (New!)

Launch the browser-based visualization and testing console:

```bash
npm run ui
```

Open `http://127.0.0.1:3333` in any browser to:
- Monitor the 3 Antigravity agents in real time (`@cost-telemetry`, `@triage-architect`, `@executioner-sre`).
- View the live Switch room event stream.
- Test one-click human approvals and trigger adversarial injection attacks to observe the safety gate in action.
- View real-time dollar waste savings and cryptographic audit logs.

---

### Option D: Cryptographic Audit Trail Verification

Verify that all teardowns recorded in `finops-audit.log` have valid SHA-256 digests and zero data tampering:

```bash
npm run audit:verify
```

---

### Option E: Standalone Switch Protocol Engine

Run the zero-dependency embedded Switch server locally to test real HTTP POST and SSE network sockets:

```bash
# Terminal 1: Launch Switch Server on port 8080
npm run switch:server

# Terminal 2: Run StateReaper connected to live local Switch socket
SWITCH_DRY_RUN=false npm run dev
```

---

### Option F: Run Full Test Suite

Run all 37 strict unit and integration tests across 9 suites:

```bash
npm run verify
```

```
ℹ tests 37
ℹ suites 9
ℹ pass 37
ℹ fail 0
```

---

### Option G: Docker Container Deployment

StateReaper includes a multi-stage Dockerfile and Docker Compose configuration:

```bash
docker compose up --build
```

---

### Option H: Live Production Deployment (AWS + Vercel + Switch)

To deploy with real AWS CloudWatch, EC2, Vercel, and a live Switch server:

1. Copy configuration:
   ```bash
   cp .env.example .env
   ```
2. Configure `.env`:
   ```ini
   USE_MOCK_TELEMETRY=false
   SWITCH_DRY_RUN=false
   SWITCH_SERVER_URL=https://your-switch-server.com
   SWITCH_ROOM_ID=statereaper-tribunal
   SWITCH_API_KEY=your-switch-api-key
   
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   
   VERCEL_API_TOKEN=...
   ```
3. Build and launch:
   ```bash
   npm run build && npm start
   ```

---

## 🛡️ Safety Architecture: Two-Layer Defense

StateReaper treats cloud deletion as a safety-critical operation:

```
[Inbound Message]
       │
       ▼
[Layer 1: Switch Identity Gate]
  Is sender.kind === 'human'?
       ├── NO  ──► REJECT (AI agents cannot approve their own requests)
       └── YES ──► Pass to Layer 2
                     │
                     ▼
[Layer 2: Strict Regex Lock]
  Matches exact anchor: /^@executioner-sre\s+approve\s+([a-zA-Z0-9_-]+)$/
       ├── NO  ──► REJECT (Blocks CLI flags, shell semicolons, text suffixes)
       └── YES ──► Pass to Executioner
                     │
                     ▼
[Layer 3: Preservation Pipeline]
  1. Create EBS Root Volume Snapshot (instant rollback in <60s)
  2. Terminate EC2 / Delete Vercel deployment
  3. Write SHA-256 Digest to append-only audit log
```

### Snapshot Preservation Guarantee
StateReaper eliminates the fear of wrongful termination:
- Before any EC2 instance is terminated, `@executioner-sre` queries the root volume and invokes `CreateSnapshotCommand` with tags `ManagedBy: StateReaper`.
- If an engineer realizes 3 days later that they needed a file from that machine, the snapshot is already preserved in AWS EBS and can be restored in under 60 seconds.

---

## 📁 Repository Structure

```
statereaper-finops/
├── Dockerfile                         # Production multi-stage Alpine container
├── docker-compose.yml                 # Container orchestration with volume persistence
├── statereaper-pipeline.template.yaml # Switch room manifest & agent system directives
├── SWITCH_INTEGRATION.md              # Deep-dive Switch protocol specification
├── DEMO_VIDEO_SCRIPT.md               # Second-by-second video recording storyboard
├── package.json                       # Scripts: demo, verify, dev, test, build
├── tsconfig.json                      # Strict TypeScript compiler options
├── src/
│   ├── index.ts                       # Entry point, SSE loop, Console Switch Bridge
│   ├── demo.ts                        # 10-second end-to-end judge demonstration
│   ├── types.ts                       # Canonical domain models & Switch event shapes
│   ├── config.ts                      # Validated environment configuration with safe fallbacks
│   ├── switch-client.ts               # Switch SSE stream client with exponential backoff
│   ├── router.ts                      # Type-safe router & anchored regex safety gate
│   ├── agents/
│   │   ├── telemetry.ts               # @cost-telemetry: CloudWatch/EC2 metrics scanner
│   │   ├── triage.ts                  # @triage-architect: Blast radius & risk evaluator
│   │   └── executioner.ts             # @executioner-sre: Gated destruction daemon
│   ├── tools/
│   │   ├── aws-client.ts              # EC2 snapshot & termination wrappers with domain errors
│   │   ├── vercel-client.ts           # Vercel deployment pruning with 403/404 handling
│   │   └── audit-logger.ts            # Append-only SHA-256 cryptographic audit logger
│   └── mock/
│       └── mock-cloudwatch.ts         # Deterministic zombie telemetry generator
└── tests/
    ├── teardown-gate.test.ts          # Regex lock, injection attacks, and router tests
    ├── switch-centrality.test.ts      # Switch centrality & Dead Man's Switch tests
    ├── audit-integrity.test.ts        # Cryptographic SHA-256 audit log tests
    └── live-clients.test.ts           # Production error classification tests
```

---

## 📊 Cryptographic Audit Trail (finops-audit.log)

Every successful or failed teardown produces an append-only JSON record with a cryptographic SHA-256 hash:

```json
{
  "timestamp": "2026-11-07T02:13:12.479Z",
  "eventHash": "ccb73e577acb4bd9e735cb58346bd56e34fe9aa3a616bbfd63edff12d39ecfb6",
  "resourceId": "i-0a3b7c1e5f92d",
  "resourceType": "ec2",
  "approvedBy": "shankar",
  "approvedAt": "2026-11-07T02:13:12.470Z",
  "snapshotId": "snap-0a3b7c1e5f92d-mw5rr5p6",
  "terminatedAt": "2026-11-07T02:13:12.478Z",
  "status": "complete",
  "error": null
}
```

This guarantees complete traceability for SOC2 and ISO27001 FinOps compliance audits.

---

## 📄 License

MIT © [Shankar](https://github.com/shankar)
