# StateReaper — Official Demo Video Script & Storyboard

> **Flip the Switch Hackathon** · Presentation Guide for Judging Criterion:  
> **Presentation (20%):** *"Do the demo video and README make clear how Switch is used?"*  
> **Duration Target:** 2 minutes 30 seconds

---

## Video Outline & Scene Timing

| Timestamp | Scene Name | Primary Screen Focus | Core Message / Switch Highlighting |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:30** | The Problem: Zombie Cloud Waste | AWS / Vercel bill & Diagram | Teams waste billions on idle cloud resources because fear of outages prevents automated deletion. |
| **0:30 – 1:00** | The Solution: Switch Tribunal | Switch Room & Architecture | Switch connects 3 specialized AI agents with a human SRE in a Telegram ChatOps tribunal. |
| **1:00 – 1:30** | Waste Detection & Blast Radius | Live Telegram / Switch feed | `@cost-telemetry` spots waste ($205/mo); `@triage-architect` checks dependencies and demands human approval. |
| **1:30 – 2:00** | The Switch Safety Gate in Action | Terminal & Chat | Adversarial injection attempts are blocked. Human signs off; `@executioner-sre` snapshots and terminates. |
| **2:00 – 2:30** | Cryptographic Audit & ROI | `finops-audit.log` & CLI Demo | SHA-256 verifiable audit record logged. Why Switch was irreplaceable for safety. |

---

## Detailed Voiceover Script & Visual Actions

### Scene 1: The Problem — The Cloud FinOps Dilemma (0:00 – 0:30)
- **Visual:** Show an AWS CloudWatch console or billing dashboard showing idle EC2 instances running with 0% CPU, followed by the StateReaper problem slide.
- **Voiceover:**
  > *"Cloud waste costs enterprises over 30 billion dollars every year. Dev servers and preview branches sit completely idle, burning cash 24/7. But why don't SRE teams just write a cron script to delete them? Because engineers fear breaking production. A blind automated script might kill a server someone was actually using. Without a safe, human-in-the-loop ChatOps interface, cloud waste is simply ignored."*

### Scene 2: The Solution — The Switch Multi-Agent Tribunal (0:30 – 1:00)
- **Visual:** Show the Switch protocol architecture diagram and the `statereaper-pipeline.template.yaml` manifest. Highlight the three agents in the Switch room.
- **Voiceover:**
  > *"Enter StateReaper: an autonomous FinOps Tribunal powered by Switch. Instead of a monolithic script, StateReaper deploys three specialized Antigravity AI agents into a shared Switch room connected to our team's Telegram chat.  
  > First, `@cost-telemetry` hunts for idle compute.  
  > Second, `@triage-architect` analyzes dependency blast radius.  
  > And third, `@executioner-sre`—a gated destruction daemon that will NEVER act without explicit human authorization."*

### Scene 3: Switch in Action — Telemetry & Blast Radius (1:00 – 1:30)
- **Visual:** Split screen: Left side shows terminal running `npm run demo` or live daemon; Right side shows Telegram / Switch room receiving agent messages.
- **Voiceover:**
  > *"Watch what happens in our Switch room. `@cost-telemetry` discovers a zombie EC2 instance that has been idle for 112 hours with zero network traffic, burning over 200 dollars a month.  
  > Immediately, `@triage-architect` evaluates the blast radius across load balancers and security groups. It verifies zero active dependencies and rates the risk as LOW. But it cannot delete it. It explicitly prompts the human SRE with the exact approval command needed."*

### Scene 4: The Dead Man's Switch Safety Gate (1:30 – 2:00)
- **Visual:** Show terminal testing malicious inputs: AI agent attempting self-approval, shell injection (`rm -rf /`), and informal phrasing getting blocked. Then show the human typing `@executioner-sre approve i-0a3b7c1e5f92d` in Telegram.
- **Voiceover:**
  > *"Here is where Switch is central. Notice what happens if an AI agent tries to approve itself—Switch blocks it. If someone attempts command injection—it is blocked.  
  > The ONLY thing that can trigger execution is a verified human message across the Switch SSE stream.  
  > Our SRE types the approval directly in Telegram on their phone. Switch routes the event. `@executioner-sre` executes a 3-step safety sequence: it snapshots the EBS volume for instant rollback, cleanly terminates the instance, and writes a cryptographic SHA-256 audit record."*

### Scene 5: Cryptographic Audit Trail & Conclusion (2:00 – 2:30)
- **Visual:** Show `audit-logs/audit.jsonl` with its SHA-256 hash, and the final ROI summary banner ($2,462/year saved on this instance alone).
- **Voiceover:**
  > *"Every single reclamation is permanently sealed in an immutable audit log with a SHA-256 digest, providing complete SOC2 and ISO compliance.  
  > Without Switch, our agents couldn't communicate, our humans couldn't intervene from chat, and our safety gate would have no verified authentication. Switch isn't an add-on—it is the heartbeat of StateReaper.  
  > Zero waste. Zero fear. Powered by Switch."*

---

## Pre-Recording Checklist

- [ ] Run `npm run verify` to ensure all 37 tests pass.
- [ ] Run `npm run demo` in a clear, high-contrast terminal (80-column width recommended).
- [ ] Ensure `statereaper-pipeline.template.yaml` is open in editor.
- [ ] Have Telegram or Switch room web interface open for the ChatOps demonstration.
- [ ] Have `audit-logs/demo-audit.log` open to display the SHA-256 audit record.

