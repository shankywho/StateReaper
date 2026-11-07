# Kill the Zombie, Not the Cluster: Building an Autonomous FinOps Tribunal on the Switch Protocol

> *Built for the **Flip the Switch Hackathon** · Track: Best Personal or Creative Workflow*  
> *Stack: Switch Protocol · Google Antigravity · TypeScript · AWS SDK · Vercel REST API*  
> *GitHub: [github.com/shankywho/StateReaper](https://github.com/shankywho/StateReaper)*

---

Every engineering team has a closet full of digital ghosts.

A `t3.medium` instance launched for a prototype that shipped five months ago. An orphaned `m5.large` runner left over from a perf sprint. A 500GB GP3 volume that was forgotten when someone terminated an EC2 instance without checking *"Delete on termination"*.

According to Gartner and the FinOps Foundation, **over 30% of enterprise cloud spend is completely wasted on abandoned, idle infrastructure**. That’s more than **\$30 billion a year** spent keeping empty virtual machines warm.

So why doesn’t every DevOps team simply run a cron job to kill idle servers?

Because **engineers fear breaking production.**

---

## The SRE Dilemma: Why Janitor Scripts Get Turned Off

Years ago, our team set up an automated cleanup script. It ran every Sunday night at midnight, querying AWS CloudWatch for instances with average CPU utilization under 1%. If an instance stayed quiet for 48 hours, the script terminated it.

It lasted three weeks.

On the third Sunday, it deleted a batch data pipeline that only woke up on the first of the month, taking down our billing reconciliation. The post-mortem was brutal. The script was disabled by Monday morning, and the team went back to the old status quo: **ignoring the AWS bill because manual audits take too long and automated scripts are too reckless.**

Blind automation lacks context. It doesn't know who owns the box, whether a load balancer is routing traffic to it, or if someone was about to demo it to a customer on Monday morning.

To fix cloud waste, you don't need a dumber cron job. You need an **autonomous investigative body with human-in-the-loop governance**.

We built **StateReaper**—an Agentic FinOps Tribunal powered by the [Switch Protocol](https://github.com/sandbox-quantum/switch).

---

## The Concept: A Constitutional Separation of Powers in ChatOps

Instead of building a monolithic script that acts as judge, jury, and executioner, StateReaper deploys **three specialized AI agents** into a shared team chat room (Telegram or Mattermost) via Switch:

```
                              STATE REAPER TRIBUNAL
                              
┌────────────────────┐       ┌────────────────────┐       ┌────────────────────┐
│  @cost-telemetry   │       │ @triage-architect  │       │  @executioner-sre  │
│   (The Hunter)     │       │ (The Adjudicator)  │       │   (The Enforcer)   │
├────────────────────┤       ├────────────────────┤       ├────────────────────┤
│ • Read-only scan   │       │ • Blast radius map │       │ • Hard-gated       │
│ • CloudWatch & API │──────►│ • Risk assessment  │──────►│ • Snapshot backup  │
│ • Detects $ burn   │       │ • Drafts approval  │       │ • Terminate compute│
└────────────────────┘       └────────────────────┘       └─────────┬──────────┘
                                                                    │
                                                      Human SRE     │ Must match:
                                                      in Telegram   │ @executioner-sre approve <ID>
                                                           ▼        ▼
                                                    ┌──────────────────────────┐
                                                    │ 1. EBS Snapshot Backup   │
                                                    │ 2. Clean Termination     │
                                                    │ 3. SHA-256 Audit Record  │
                                                    └──────────────────────────┘
```

1. **`@cost-telemetry` (The Hunter):**  
   A strictly read-only scanner. It polls CloudWatch metrics and Vercel APIs. If a resource runs with `<0.1% CPU` and `0 KB/s network ingress` for >48 hours, it calculates the projected monthly waste and presents the finding to the tribunal room.

2. **`@triage-architect` (The Adjudicator):**  
   It examines dependency trees, active Application Load Balancer target groups, subnet route tables, and PR merge statuses. It assigns a deterministic risk score (`LOW`, `MEDIUM`, or `HIGH`) and drafts the exact approval command syntax the human operator must type.

3. **`@executioner-sre` (The Gated Enforcer):**  
   The executioner possesses cloud teardown credentials, but it is **code-locked and instruction-locked**. It refuses to act on agent recommendations alone. It will only execute when a verified human posts an explicit approval command into the Switch room.

---

## Why Switch is the Irreplaceable Nexus: The "Dead Man's Switch"

When evaluating multi-agent architectures, the biggest risk is the **runaway deletion loop**—an AI agent hallucinating, getting tricked, or autonomously deciding to tear down an entire cluster.

In StateReaper, **Switch is our physical security interlock**. We call this the **Dead Man's Switch Invariant**:

```typescript
// src/router.ts - The Core Code-Level Safety Gate
export function routeMessage(event: SwitchRawEvent): ParsedMessage {
  // Rule 1: Ignore presence/system noise
  if (event.type !== 'message') {
    return { tag: 'unroutable', event };
  }

  // Rule 2: Strictly enforce human origin
  if (event.sender.kind !== 'human') {
    return { tag: 'unroutable', event }; // AI agents can NEVER approve teardowns!
  }

  // Rule 3: Anchored regex lock
  const match = /^@executioner-sre\s+approve\s+([a-zA-Z0-9_-]+)$/.exec(event.content.trim());
  if (match) {
    return { tag: 'approval_command', resourceId: match[1], approvedBy: event.sender.name };
  }

  return { tag: 'unroutable', event };
}
```

Because `@executioner-sre` subscribes to the Switch Server-Sent Events (SSE) stream and requires `sender.kind === 'human'`, **if Switch is disconnected or turned off, zero destructive commands can physically execute.**

Switch provides three things we could not build without it:
1. **Multi-Agent Decoupled State:** Agents communicate through room events rather than shared in-memory variables or direct API calls.
2. **ChatOps Bridge:** SREs receive alerts and authorize destructions directly from Telegram on their phone while commuting or on call.
3. **Identity Verification:** The Switch protocol tags human messages separately from agent messages, preventing AI agents from colluding or self-approving.

---

## Walking Through the Tribunal: Hunting a \$205/mo Zombie

Here is what a live lifecycle looks like when StateReaper is running in our Telegram room:

### 1. Detection
`@cost-telemetry` discovers an idle EC2 instance in `eu-west-1`:
```text
⚠️ [IDLE RESOURCE DETECTED]
• Resource Type : AWS EC2 Instance (m5.large)
• Resource ID   : i-0a3b7c1e5f92d
• Idle Duration : 112h
• Avg CPU       : 0.008% (<0.1% threshold)
• Net Ingress   : 0 KB/s

💸 Cost Projection
• Daily Burn    : $6.84
• Monthly Waste : $205.20
• Tags          : Project=q3-perf-sprint, Owner=ops-team

🔎 Flagging for blast-radius evaluation. cc: @triage-architect
```

### 2. Adjudication
`@triage-architect` automatically inspects the dependency graph:
```text
🔍 [BLAST RADIUS EVALUATION]
• Target Resource : i-0a3b7c1e5f92d (ec2)
• Assessed Risk   : LOW
• Recommendation  : snapshot-and-terminate
• Projected Waste : $205.20/mo

🔗 Dependency Audit:
  • Zero active network connections (0 KB/s ingress)
  • No active Application Load Balancer target bindings
  • Subnet security groups show no external routing activity

🛡️ Safety Gate: Human authorization required before destruction.
👉 Reply with: `@executioner-sre approve i-0a3b7c1e5f92d`
```

### 3. Safety Defense Against Adversarial Payloads
Before testing human approval, we put the safety gate through adversarial stress testing:

* **Attack 1 (AI Agent Collusion):** `@triage-architect` posts `@executioner-sre approve i-0a3b7c1e5f92d`.  
  *Result:* **REJECTED.** Switch router flags `sender.kind !== 'human'`.
* **Attack 2 (Shell Injection):** An attacker posts `@executioner-sre approve i-0a3b7c1e5f92d; rm -rf /`.  
  *Result:* **REJECTED.** Anchored regex `^@executioner-sre approve ([a-zA-Z0-9_-]+)$` rejects the command.
* **Attack 3 (Informal Chat):** Someone says *"Yeah, just delete that server please."*  
  *Result:* **IGNORED.** Executioner stays inert.

### 4. Human Sign-Off & Instant Rollback Protection
An SRE replies from Telegram:
`@executioner-sre approve i-0a3b7c1e5f92d`

Within 1.5 seconds, the executioner runs a three-step safety pipeline:
1. **Preservation:** Calls AWS EC2 `CreateSnapshotCommand` on the root attached volume (`vol-0a3b7c1e5f92d-root`), tagging it `ManagedBy: StateReaper`. If anyone ever needs a file from that machine, it can be restored in **under 60 seconds**.
2. **Reclamation:** Issues `TerminateInstancesCommand` to permanently decommission the compute.
3. **Cryptographic Proof:** Computes a SHA-256 digest of the entire event payload and appends an immutable line to `finops-audit.log`.

```text
✅ [RECLAMATION COMPLETE]
• Resource ID    : i-0a3b7c1e5f92d (ec2)
• Preservation   : EBS Snapshot snap-0a3b7c1e5f92d-mw6jm011
• Termination    : Instance cleanly terminated & decommissioned
• Authorized By  : @shankar
• Audit Integrity: Recorded in finops-audit.log
  SHA-256 Digest : 8c0f9e2df49c09f8ebe690b4805a1f368f4bba5f748466dc4edf07d7b0158e0c
```

---

## Verifying the Cryptographic Audit Trail (SOC2 / ISO 27001)

Enterprise compliance teams hate automated deletion because there's often no tamper-evident record of who authorized what.

StateReaper includes a CLI verifier (`npm run audit:verify`):

```bash
$ npm run audit:verify

Auditing file: /Users/shankar/PROJECTS/StateReaper/statereaper-finops/audit-logs/demo-audit.log...

┌─────┬─────────────────────┬──────────────┬───────────────┬────────────────────┬───────────┐
│ #   │ Timestamp           │ Resource ID  │ Approved By   │ SHA-256 Digest     │ Status    │
├─────┼─────────────────────┼──────────────┼───────────────┼────────────────────┼───────────┤
│ 1   │ 2026-11-07T02:13:12 │ i-0a3b7c1e5f │ shankar       │ ccb73e577acb4bd... │ VALID     │
│ 2   │ 2026-11-07T02:15:28 │ i-0a3b7c1e5f │ shankar       │ 2454de9ee0d11c8... │ VALID     │
│ 3   │ 2026-11-07T02:15:52 │ i-0a3b7c1e5f │ shankar       │ 8f0e0908ebe4a96... │ VALID     │
└─────┴─────────────────────┴──────────────┴───────────────┴────────────────────┴───────────┘

VERIFICATION SUMMARY
• Total Audit Records       : 3
• Cryptographically Valid   : 3 / 3 (100% Intact)
• Root Snapshot Protected   : 3 / 3 (Zero data loss guarantee)
• Audit Status              : PASSED — AUDIT INTEGRITY SEALED
```

If an unauthorized party manually edits an audit log line (e.g. altering who approved a teardown), the SHA-256 avalanche effect immediately flags the record as **TAMPERED**.

---

## What We Learned Building on Switch

1. **Role separation beats single-agent monolithic prompts every time.** Trying to make one LLM scan, evaluate, decide, and delete creates prompt bloat and unpredictable hallucinations. Separating them into isolated personas with strict addressing rules (`statereaper-pipeline.template.yaml`) made behavior deterministic.
2. **`sender.kind` is an underrated security superpower.** By distinguishing between human senders and agent senders at the protocol layer, Switch gives developers a native primitive for building human-in-the-loop safety gates without having to parse usernames.
3. **Local developer experience matters.** To make StateReaper 100% clone-and-run reproducible for judges without requiring an external Go or Rust daemon, we built an embedded Switch server (`npm run switch:server`) directly in Node.js.

---

## Try It in 2 Seconds

You can clone and run the full end-to-end tribunal simulation on your machine without needing AWS credentials or a Switch server:

```bash
git clone https://github.com/shankywho/StateReaper.git && cd StateReaper
npm install

# 1. Run the 2-second automated tribunal walkthrough
npm run demo

# 2. Launch the interactive browser dashboard
npm run ui
# 👉 Open http://127.0.0.1:3333

# 3. Run all 37 unit & integration tests
npm run verify
```

Check out the full repository and architecture docs at **[github.com/shankywho/StateReaper](https://github.com/shankywho/StateReaper)**.

Zero cloud waste. Zero outage anxiety. 100% governed by Switch.
