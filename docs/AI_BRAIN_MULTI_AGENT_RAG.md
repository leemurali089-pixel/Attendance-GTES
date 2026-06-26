# MJS PrimeLogic — AI Brain Multi-Agent + RAG Architecture

## Overview

Phase 3 AI Brain routes user queries through **OrchestratorAgent** to five domain agents. Agents read ERP data only via existing managers (`DataManager`, `InvoiceManager`, `CommandRouter`, engines, RAG, knowledge graph). The orchestrator never reads ERP directly.

```
User (voice / text / Command Center)
        │
        ▼
   AIBrain.processTurn()
        │
        ├─► OrchestratorAgent.processQuery()  ──► read / multi-domain queries
        │         │
        │         ├── hrAgent
        │         ├── payrollAgent
        │         ├── accountingAgent
        │         ├── workflowAgent
        │         └── adminAgent
        │
        └─► Legacy path (ReasoningEngine → DecisionEngine → ErpBridge)
                  └── writes, sandbox, destructive intents
```

## Agent responsibilities

| Agent | Domains | ERP sources |
|-------|---------|-------------|
| `hrAgent` | Dashboard, employees, attendance, holidays | `DataManager`, `AttendanceEngine`, `EmployeeEngine`, `CommandRouter` |
| `payrollAgent` | Salary, advances, dues | `DataManager.KEYS.ADVANCES`, `CommandRouter` |
| `accountingAgent` | Invoices, vouchers, outstanding, revenue | `InvoiceManager`, `CustomerAgent`, `BusinessAnalytics`, RAG |
| `workflowAgent` | Tasks, delivery, purchase, service, AMC | `DataManager.KEYS.TASKS`, `TaskEngine`, `KnowledgeGraphEngine` |
| `adminAgent` | Health, backup, sync, audit | `ActionReplayEngine`, `RagEngine`, `SyncManager` |

## Orchestrator

File: `ai-brain/orchestratorAgent.js`

1. Receives natural-language query
2. Scores agents via `canHandle(query)`
3. Runs `execute(query, context)` on matching agents (parallel)
4. Merges messages and `sourceRefs`
5. Appends `[Sources: …]` on financial answers
6. Delegates write/destructive commands to legacy `CommandRouter` path

Proactive dashboard briefing: `getProactiveBriefing()` runs HR + Payroll + Accounting + Workflow agents in `mode: 'briefing'`.

## RAG stack

| Module | Role |
|--------|------|
| `rag/embeddingProvider.js` | Hash embeddings (default); optional OpenAI when `settings.ai.openaiApiKey` set |
| `rag/vectorStore.js` | LanceDB via Electron IPC when available; JSON fallback in `Data/ai-rag/` |
| `rag/documentIndexer.js` | Builds index from MJS JSON data |
| `rag/retriever.js` | Cosine search across collections |
| `rag/ragEngine.js` | Init, full reindex, auto-reindex on `gtes:data-changed` |

**Collections:** employees, attendance, payroll, customers, invoices, vouchers, tasks, documents

**Auto-reindex keys:** `gtes_employees`, `gtes_attendance`, `gtes_advances`, `customers`, `invoices`, `vouchers`, `gtes_tasks`, `gtes_challans`, `jobcards`

## Knowledge graph

File: `ai-brain/knowledgeGraphEngine.js`

Relationships:

- Customer → Invoice → Voucher → Outstanding
- Customer → Task → AMC
- Employee → Attendance → Payroll/Advance

Use `KnowledgeGraphEngine.getCustomerChain(name)` or `getEmployeeChain(name)`.

## Integration points

- **Entry:** `AIBrain.processTurn()` in `ai-brain/brain.js`
- **Voice:** `ai/voiceAgent.js` → `VoiceEngine` / `AIBrain.processTurn`
- **Text Command Center:** `ai-brain/ui/aiCommandCenter.js`
- **Legacy router:** `ai/commandRouter.js` (writes unchanged)
- **Scripts:** `index.html` loads RAG → agents → orchestrator → brain

## No hallucinated numbers

Agents return **"No data found."** when ERP/RAG/graph have no match. Financial figures always include `sourceRefs` from managers (e.g. `InvoiceManager.getInvoicesWithBalance`).

## Testing multi-agent queries

Open app → Dashboard → double-click global AI button (Command Center) or use Voice Assistant text box.

| Query | Expected agents |
|-------|-----------------|
| `daily briefing` | HR + Payroll + Accounting + Workflow (+ revenue line) |
| `today attendance summary` | hrAgent |
| `total outstanding pending invoices` | accountingAgent + source refs |
| `Avon outstanding` | accountingAgent via CustomerAgent |
| `pending tasks` | workflowAgent |
| `show audit trail` | adminAgent |
| `salary advance dues` | payrollAgent |
| `mark attendance for all` | Legacy CommandRouter (write — not orchestrator) |

Console checks:

```javascript
RagEngine.status()
OrchestratorAgent.detectDomains('customer outstanding and pending tasks')
AIBrain.getProactiveBriefing()
```

## LanceDB vs fallback

| Environment | Backend |
|-------------|---------|
| Electron + `@lancedb/lancedb` installed | LanceDB at `Data/ai-rag/` (main process IPC) |
| Electron, LanceDB load fails | JSON files in `Data/ai-rag/*.json` |
| Browser / file:// without IPC | In-memory + `FileStorage` / localStorage JSON vectors |
| Embeddings | Hash (384-dim) default; OpenAI if API key in settings |

## Future providers

`EmbeddingProvider.provider` can be extended for Claude, Gemini, Ollama without changing agents. Swap vector backend in `vectorStore.js` / `ragIpcMain.js`.

## Version

- AIBrain `3.0.0`
- package.json `1.3.52` (+ `@lancedb/lancedb`)
