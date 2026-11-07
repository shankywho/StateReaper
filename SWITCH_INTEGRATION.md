# Switch Integration Architecture & Protocol Specification

> **Flip the Switch Hackathon** · Architectural Evidence for Judging Criterion:  
> **Use of Switch (30%):** *"Is Switch central, and would the project stop working without it?"*

---

## 1. Executive Summary: Why Switch is Irreplaceable

**StateReaper is structurally impossible without Switch.** Switch is not an incidental logging sink or an optional notification channel; it is the **central nervous system and sole security boundary** of the entire application.

If Switch is disconnected, turned off, or removed:
1. **The Agents Cannot Coordinate:** `@cost-telemetry`, `@triage-architect`, and `@executioner-sre` lose their shared message bus and room state.
2. **The Human Cannot Intervene:** SREs on mobile or desktop have no gateway into the autonomous agent loop.
3. **The Gated Destruction Daemon Fails Closed:** `@executioner-sre` is hard-coded to require an authenticated human event emitted from the Switch room SSE stream (`sender.kind === 'human'`). Without Switch, **zero destructive operations can ever occur**.

```
                           ┌────────────────────────────────────────┐
                           │              Switch Server             │
                           │   Room: "statereaper-tribunal"         │
                           └──────────────────┬─────────────────────┘
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      │ SSE Event Stream      │ HTTP Webhook / Post   │ Chat Bridge
                      ▼                       ▼                       ▼
            ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
            │  StateReaper SRE │    │  AI Multi-Agent  │    │  Human Operator  │
            │  Event Listener  │    │  Runtime         │    │  (Telegram)      │
            └─────────┬────────┘    └─────────┬────────┘    └─────────┬────────┘
                      │                       │                       │
                      │                       │  1. Idle Found        │
                      │                       ├──────────────────────►│
                      │                       │  2. Blast Radius      │
                      │                       ├──────────────────────►│
                      │                       │                       │ 3. Sign-Off:
                      │ 4. SSE Delivers Auth  │                       │    @executioner-sre
                      │◄──────────────────────┴───────────────────────┤    approve <ID>
                      ▼
            ┌──────────────────┐
            │ @executioner-sre │
            │ Hardened Gate    │──► Snapshot ──► Terminate ──► SHA-256 Audit Log
            └──────────────────┘
```

---

## 2. The Three Architectural Pillars of Switch in StateReaper

### Pillar A: Multi-Agent Room Protocol & Decoupled State

StateReaper runs three distinct, specialized autonomous agents defined in `statereaper-pipeline.template.yaml`:

| Agent | Addressing Rule | System Directive | Role in Switch Room |
| :--- | :--- | :--- | :--- |
| **`@cost-telemetry`** | `anyone` | Read-only scanner | Continuously inspects AWS CloudWatch and Vercel APIs. Publishes waste reports with technical & cost metrics into the Switch room. |
| **`@triage-architect`** | `owner-agents` | Consultative adjudicator | Consumes waste reports from `@cost-telemetry`, audits dependency blast radius, and formulates the exact human approval command syntax. |
| **`@executioner-sre`** | `owner-agents` | Gated destruction daemon | Subscribes to the Switch room SSE stream. Executes terminations **only** upon matching verified human events. |

By utilizing Switch's room abstraction, agents operate as decoupled micro-services rather than a monolithic script. Any agent can be inspected, audited, or restarted independently without interrupting the tribunal.

### Pillar B: The "Dead Man's Switch" Security Invariant

A central fear in automated FinOps is the **runaway deletion loop** — an AI model hallucinating or autonomously deciding to tear down an active production cluster.

StateReaper solves this via the **Dead Man's Switch Invariant**:
- `@executioner-sre` has no autonomous volition.
- The TypeScript runtime router (`src/router.ts`) strictly enforces:
  ```ts
  if (event.sender.kind !== 'human') {
    return { tag: 'unroutable', event }; // REJECT: Agents cannot approve teardowns!
  }
  ```
- If Switch is disconnected, **no human approval event can enter the system**.
- Therefore, disconnection from Switch renders all teardown endpoints physically unreachable. Switch acts as the physical safety interlock.

### Pillar C: ChatOps Bridge (Telegram / Mattermost)

Engineers do not sit in front of FinOps dashboards or command-line terminals all day. Switch bridges the agent tribunal directly into team chat rooms (Telegram, Mattermost).
- An SRE on call receives the waste alert and blast radius on their phone.
- With one tap or reply (`@executioner-sre approve i-04f8b9a912c1`), the approval flows through Switch into the executioner daemon.
- The confirmation and cryptographic audit digest are reflected back into Telegram immediately.

---

## 3. Protocol Implementation Details

### Server-Sent Events (SSE) Stream

StateReaper subscribes to Switch room events via `SwitchClient` (`src/switch-client.ts`):

```ts
GET /rooms/{switchRoomId}/events
Headers:
  Authorization: Bearer {switchApiKey}
  Accept: text/event-stream
```

Features implemented in StateReaper's Switch client:
- **Exponential Backoff Reconnection:** Automatically recovers from network disconnects (1s → 2s → 4s ... up to 30s) ensuring zero missed approvals.
- **Type-Safe Event Validation:** Runtime schema guards ensure every inbound payload conforms to `SwitchRawEvent` before dispatching.
- **Dry-Run Standalone Mode:** Allows local judge verification without needing a remote Switch daemon.

### Switch Pipeline Manifest (`statereaper-pipeline.template.yaml`)

```yaml
version: "1.0"
room:
  name: "statereaper-tribunal"
  bridge: "mattermost" # or telegram
  agents:
    - "cost-telemetry"
    - "triage-architect"
    - "executioner-sre"
  users:
    - "{$creator}"

agents:
  - name: "cost-telemetry"
    addressing: "anyone"
    provider: "antigravity"
    instructions: |
      You are the Cost Telemetry Scanner for StateReaper. Read-only at all times...
  - name: "triage-architect"
    addressing: "owner-agents"
    provider: "antigravity"
    instructions: |
      You are the Triage Architect. Evaluate dependencies and propose teardown...
  - name: "executioner-sre"
    addressing: "owner-agents"
    provider: "antigravity"
    instructions: |
      You are the Executioner SRE. Gated destruction daemon. Require human approval...
```

---

## 4. Verification & Testing

Switch centrality is verified via automated tests in `tests/switch-centrality.test.ts`:
- **Test 1:** Verifies that absent Switch human events, executioner cannot be triggered.
- **Test 2:** Proves AI agent collusion in Switch room is rejected.
- **Test 3:** Proves Switch is the sole provider of verified human identity (`approvedBy`).
- **Test 4:** Validates manifest syntax and agent addressing constraints.

Run the test suite anytime:
```bash
npm test
```

