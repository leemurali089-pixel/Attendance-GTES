# MJS Prime Logic — AI Rules

These rules govern how the AI Brain, agents, voice assistant, and RAG system must behave. They are **non-negotiable** and apply to every current and future AI component.

---

## 1. Core Data Integrity Rule (Absolute)

> **Every AI response containing a number, amount, count, or entity reference must be sourced from a real ERP manager call. The AI must never estimate, guess, or hallucinate data.**

| Rule | Enforcement |
|------|-------------|
| No fabricated numbers | Every figure traced to a `functionEngine` result or ERP manager call with `sourceRef` |
| No guessed results | If data is missing → reply **"No data found"** — never estimate or infer amounts |
| No LLM arithmetic | LLMs may narrate; ERP managers compute balances, totals, counts |
| Citations required | Responses include entity keys (`invoiceNo`, `customerId`, `employeeId`, `taskId`) |
| Stale data disclosure | If cache TTL exceeded, refresh before answering or state data age |

This rule applies to: voice responses, text responses, dashboard widgets, daily briefings, and proactive alerts.

---

## 2. Write Safety Rules

### 2.1 Approval Gate (Mandatory)

All mutating AI actions must pass through `ApprovalEngine` before execution:

| Action Category | Examples | Approval Required |
|----------------|----------|-------------------|
| Destructive | Delete attendance, delete task | Voice + UI confirmation |
| Financial write | Create voucher, mark invoice paid | UI preview + confirm |
| Financial generate | Salary payout list, payslip batch | Admin confirm |
| Bulk mutating | Bulk attendance mark | Count preview + confirm |

**The AI never bypasses `ApprovalEngine`, even via programmatic/agent calls.**

### 2.2 Sandbox Mode (Preview Before Execute)

Financial and bulk actions run in two stages:

1. **Preview** — `sandboxEngine.preview()` — compute affected rows, totals, warnings. **No ERP writes.**
2. **Execute** — `sandboxEngine.execute()` — real write after `approvalEngine` clears.

Mandatory sandbox functions:
- `payroll.generatePayout`
- `attendance.bulkMark`
- `task.bulkCreate`
- `voucher.create`

### 2.3 Write Path (Strict)

```
OrchestratorAgent → decisionEngine → approvalEngine.request()
  → (if approved) functionEngine.invoke()
  → validate schema + permissions
  → erpBridge → ERP manager
  → DataManager.saveData()
  → AuditManager.log()
  → invalidate caches
```

**AI Brain never calls `DataManager.saveData()` directly.**

---

## 3. Agent Routing Rules

### 3.1 OrchestratorAgent Routing

The `OrchestratorAgent` routes queries using these rules:

| Condition | Action |
|-----------|--------|
| Write/destructive pattern detected | Delegate to legacy `CommandRouter` path |
| `forceOrchestrator: true` in context | Process even if write pattern detected |
| No agents match (score < 0.15) | Return "No data found" |
| Top agent score ≥ 0.15 | Run all agents with score ≥ 60% of top score |

### 3.2 Write Pattern Detection

The following query patterns are **always delegated to the legacy path** (not orchestrator):

```regex
/^(mark|create|delete|update|bulk|generate|save)\b/i
/mark\s+attendance/i
/create\s+(task|voucher|invoice)/i
/bulk\s+/i
/confirm/i
```

### 3.3 Agent Domain Ownership

| Agent | ID | Primary domains |
|-------|----|----------------|
| `HrAgent` | `hrAgent` | Attendance, employees, holidays, dashboard |
| `PayrollAgentBrain` | `payrollAgent` | Salary, advances, dues, bonuses |
| `AccountingAgent` | `accountingAgent` | Invoices, vouchers, outstanding, revenue, GST |
| `WorkflowAgent` | `workflowAgent` | Tasks, delivery, purchases, AMC, service |
| `AdminAgent` | `adminAgent` | Health, backup, sync, audit, RAG status |

Cross-domain queries (e.g., "Avon outstanding + pending tasks") run matching agents **in parallel** and merge their results.

### 3.4 Financial Query Isolation

The `hrAgent` must return score 0 for purely financial queries:

```javascript
// If query matches financial terms AND NOT HR terms → score = 0
/\b(?:pending\s+amount|outstanding|invoice|payment|balance|revenue)\b/i
&& !/\b(?:employee|staff|attendance|absent|present|holiday)\b/i
→ hrAgent.canHandle() = 0
```

---

## 4. RAG Rules

### 4.1 RAG Collections

| Collection | Indexed from |
|------------|-------------|
| `employees` | `DataManager.KEYS.EMPLOYEES` |
| `attendance` | `DataManager.KEYS.ATTENDANCE` |
| `payroll` | `DataManager.KEYS.ADVANCES` |
| `customers` | `CustomerManager` |
| `invoices` | `InvoiceManager` |
| `vouchers` | `VoucherManager` |
| `tasks` | `DataManager.KEYS.TASKS` |
| `documents` | Upload index + invoice/challan metadata |

### 4.2 RAG Backend Priority

| Environment | Backend |
|-------------|---------|
| Electron + LanceDB available | LanceDB at `Data/ai-rag/` (main process IPC) |
| LanceDB fails to load | JSON files in `Data/ai-rag/*.json` |
| Browser / non-Electron | In-memory + FileStorage JSON vectors |

### 4.3 RAG Auto-Reindex Triggers

RAG automatically re-indexes when `gtes:data-changed` fires for these keys:
```
gtes_employees, gtes_attendance, gtes_advances,
customers, invoices, vouchers, gtes_tasks, gtes_challans, jobcards
```

### 4.4 Embedding Provider

- **Default:** Hash-based embeddings (384-dim) — no API key required
- **Optional:** OpenAI embeddings when `settings.ai.openaiApiKey` is set
- Embedding provider is swappable without changing agents

---

## 5. Knowledge Graph Rules

### 5.1 Supported Relationships

| Edge | From → To | Key |
|------|-----------|-----|
| `customer_has_invoice` | Customer → Invoice | `customerId` or party name |
| `invoice_allocated_payment` | Invoice → Voucher | Party-scoped allocation key |
| `customer_has_task` | Customer → Task | `customerId` or title match |
| `customer_has_service` | Customer → AMC | `gtes_services` |
| `employee_has_attendance` | Employee → Attendance | `employeeId` + date |

### 5.2 Graph Query Rules

- Graph is **in-memory only** — refreshed on `gtes:data-changed`
- `getCustomerChain(name)`: Customer → Invoices → Vouchers → Outstanding
- `getEmployeeChain(name)`: Employee → Attendance → Payroll/Advance
- Cross-entity queries must use the graph — never manually join arrays

---

## 6. Memory & Context Rules

### 6.1 Session Context (Short-Term)

| Key | TTL | Purpose |
|-----|-----|---------|
| `focus.customer` | Session | Last referenced customer |
| `focus.employee` | Session | Last referenced employee |
| `focus.invoice` | Session | Last referenced invoice |
| `pendingClarify` | Until resolved | Disambiguation state |
| `pendingConfirm` | Until resolved | Approval state |
| `turnHistory` | Last 20 turns | Conversation context |

### 6.2 Pronoun/Follow-Up Resolution

When a user says "last invoice kaatu" without naming a customer:
1. `ContextEngine` checks `focus.customer`
2. If set → resolve to `customer.getLastInvoice({customer: focus.customer})`
3. If not set → ask "Which customer?"

### 6.3 Long-Term Memory (Self-Learning)

Stored in `gtes_ai_brain_memory_v1`:
- `freq.customers[]` — top 20 queried customers (auto-prioritized in suggestions)
- `freq.employees[]` — top 20 queried employees
- `freq.reports[]` — top 10 report types
- `aliases.customers{}` — spoken alias → `customerId`
- `aliases.employees{}` — spoken alias → `employeeId`
- `langPreference` — `ta` / `en` / `tanglish`

**Memory rule:** Never store passwords, tokens, PII beyond names, or financial figures in memory.

---

## 7. Language Rules

### 7.1 Language Detection

| Signal | Language |
|--------|---------|
| Unicode Tamil block ratio > 30% | `ta` (Tamil) |
| Tanglish function words: evlo, podu, kaatu, inniku, yaar, pannu | `tanglish` |
| Otherwise | `en` (English) |

### 7.2 Response Language

- Respond in the language of the query
- Tamil UI labels use `ta` locale; English UI uses `en`
- Tanglish queries → respond in Tanglish or Tamil
- Error messages always include both Tamil and English where possible

### 7.3 Core Tamil/Tanglish Vocabulary

| Tanglish | Meaning |
|----------|---------|
| podu | create / set / mark |
| pannu | do / perform |
| kaatu | show / display |
| evlo | how much / how many |
| inniku | today |
| innal / innalai | yesterday |
| yaar | who |
| varala | didn't come / absent |
| seri | ok / yes |
| sollu | tell / say |
| niluvai | outstanding / balance |

---

## 8. Intent Confidence Rules

| Confidence | Action |
|------------|--------|
| ≥ 0.85 | Execute or answer directly |
| 0.60–0.84 | Confirm before executing ("Mark Rajesh present for today?") |
| 0.40–0.59 | Ask clarifying question |
| < 0.40 | Refuse with help suggestion |

---

## 9. Proactive Engine Rules

Proactive outputs are **always ERP-sourced**. Payload format:

```json
{
  "type": "outstanding_alert",
  "severity": "high",
  "facts": [{ "customer": "Avon Oxygen", "balance": 45000, "invoiceRef": "INV-001" }],
  "sourceRefs": ["InvoiceManager.getInvoicesWithBalance"],
  "generatedAt": "2026-06-15T08:00:00Z"
}
```

**Rules:**
- No free-text numbers without a `facts[]` array
- No proactive alerts without verifiable `sourceRefs`
- Proactive digest runs on dashboard load and re-runs on `gtes:data-changed` (debounced 30s)
- Severity: `low` / `medium` / `high` / `critical`

---

## 10. LLM Adapter Rules (Phase 4+)

When LLM adapters are enabled:

| Rule | Detail |
|------|--------|
| LLM input | Receives only structured summaries — never raw ERP JSON with PII |
| LLM output | Must be JSON matching `IntentCandidate[]` schema |
| LLM arithmetic | **Forbidden.** Numbers always come from ERP |
| LLM action | **LLMs never directly invoke ERP functions.** Only `functionEngine` does. |
| GSTIN/phone | Redacted before sending to cloud LLM |
| Opt-in | LLM adapters are off by default; user must enable in Settings |
| Validation | `reasoningEngine` validates LLM output against intent registry before accepting |

---

## 11. Security Rules

| Control | Rule |
|---------|------|
| Authentication | Brain inactive if user not logged in |
| Authorization | Intents mapped to `UserManager.hasPermission(view)` |
| T3/T4 audit | All write actions logged to `AuditManager` + `ActionReplayEngine` |
| Financial gate | `approvalEngine` — no bypass via voice, agent, or API |
| Response integrity | Validator rejects responses with unsourced numeric claims |
| Bulk export | Admin role required; AI cannot export bulk data without Admin |
| Prompt injection | Strip ERP JSON from user text before LLM processing |
| Memory | No passwords, tokens, or financial data stored in `memoryEngine` |
| File uploads | MIME validation; max size; sandboxed to `Data/ai_uploads/` |

---

## 12. Action Replay (Audit Trail)

Every brain turn that queries or mutates ERP state is recorded:

| Field | Value |
|-------|-------|
| `who` | `userId`, `username`, `role` |
| `what` | `intent`, `functionName`, `mode` (preview \| execute), sanitized `args` |
| `when` | ISO timestamp + session turn index |
| `why` | User utterance, `decisionPath`, `agentId` |
| `sourceRefs` | Entity keys used (`invoiceNo`, `customerId`, …) |

Stored in `gtes_ai_audit.json` + `localStorage`.  
Read-only replay: `ActionReplayEngine.replay(id)` — shows what would happen, no re-execution of writes.

---

## 13. Forbidden AI Behaviors

The following are **absolutely prohibited**:

1. Returning a financial figure not sourced from an ERP manager
2. Creating, updating, or deleting ERP data without `approvalEngine` confirmation
3. Calling `DataManager.saveData()` directly (must use `functionEngine` + `erpBridge`)
4. Guessing a customer name — always fuzzy-match and confirm if ambiguous
5. Auto-triggering salary payout without Admin role + approval
6. Sending raw employee PII or financial data to a cloud LLM
7. Responding "done" to a write command when `sandboxEngine` preview mode is active
8. Overwriting a `source: 'bookkeeper'` row with local data
9. Returning attendance counts without checking `DataManager.isActiveOnDate()`
10. Claiming a feature works when the relevant ERP module is undefined/unavailable

---

## 14. "No Data Found" Protocol

When the AI cannot find data for a query:

```
"No data found for [query]. [Optional: check if data is loaded / try a different date range]."
```

**Never:**
- Estimate what the data might be
- Return 0 as if it were a confirmed value
- Return a previous turn's data as the current answer
- Say "I don't know" without suggesting the correct ERP path
