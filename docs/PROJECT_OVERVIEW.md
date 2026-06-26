# MJS Prime Logic — Project Overview

**Version:** 1.3.52  
**App ID:** `com.mjsprimelogic.app`  
**Platform:** Electron (Windows desktop) + Firebase cloud sync  
**AI Brain:** v3.0.0 — Multi-Agent RAG  
**Last Updated:** 2026-06-15

---

## 1. What Is This?

**MJS Prime Logic** is a full-featured **ERP system** built for small-to-medium businesses in India. It manages:

- Employee attendance, salary, payroll
- Customer invoicing, outstanding, and collections
- Purchase vouchers, expenses, bank reconciliation
- Inventory, delivery challans, job cards
- Task management and AMC/service contracts
- Document generation (invoices, quotations, proformas, DCs)
- Book Keeper integration (import from accounting software)
- Gmail integration for document delivery

The system runs **offline-first as an Electron desktop app**, with optional Firebase Realtime Database cloud sync. It supports Tamil, English, and Tanglish throughout the UI and AI layer.

---

## 2. Technology Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron 39 |
| Frontend | HTML5, Vanilla JS, CSS (no framework) |
| Storage (local) | `localStorage` + `Data/*.json` files (FileStorage) |
| Storage (cloud) | Firebase Realtime Database |
| AI Vector store | LanceDB (`@lancedb/lancedb`) — JSON fallback |
| AI embeddings | Hash-based (384-dim) — OpenAI embeddings optional |
| STT | Browser Web Speech API (default), Deepgram, OpenAI Whisper |
| TTS | Browser Speech Synthesis |
| PDF generation | pdfmake |
| Email | nodemailer + Google Gmail API |
| Build | electron-builder |

---

## 3. Repository Structure

```
Attendance GTES TRAIL/
├── main.js               ← Electron main process
├── preload.js            ← Context bridge (IPC to renderer)
├── index.html            ← Single-page app shell (all views)
├── package.json
│
├── js/                   ← Core ERP (browser-loaded scripts)
│   ├── data.js           ← DataManager — all storage read/write
│   ├── app.js            ← App init, auth, view routing
│   ├── invoiceManager.js
│   ├── voucherManager.js
│   ├── customerManager.js
│   └── ...
│
├── ai/                   ← Voice Agent V1 (rule-based, Phase 1)
│   ├── voiceAgent.js
│   ├── speechEngine.js
│   ├── speechProviderManager.js
│   ├── intentEngine.js
│   ├── intentRegistry.js
│   ├── tamilCommandRegistry.js
│   ├── commandRouter.js
│   ├── erpFunctions.js
│   └── speechAdapters/
│
├── ai-brain/             ← AI Brain V2/V3 (multi-agent RAG, Phase 3)
│   ├── brain.js          ← Entry point / orchestrator
│   ├── orchestratorAgent.js
│   ├── reasoningEngine.js
│   ├── knowledgeEngine.js
│   ├── knowledgeGraphEngine.js
│   ├── proactiveEngine.js
│   ├── voiceEngine.js
│   ├── agents/           ← Domain agents (hrAgent, accountingAgent, …)
│   ├── engines/          ← Domain engines (attendanceEngine, …)
│   ├── rag/              ← RAG stack (LanceDB + JSON fallback)
│   ├── bridge/           ← erpBridge.js — thin ERP adapter
│   └── ui/               ← AI Command Center dashboard
│
├── Data/                 ← Live data files (gitignored)
│   ├── gtes_employees.json
│   ├── gtes_attendance.json
│   ├── invoices.json
│   └── ai-rag/           ← Vector store (LanceDB or JSON)
│
├── docs/                 ← Architecture & rules documentation
├── templates/            ← PDF/document templates
├── css/                  ← Stylesheets
├── gmail/                ← Gmail OAuth + IPC
└── tools/                ← Utility scripts (Puppeteer printing, etc.)
```

---

## 4. AI System Overview

The AI system has two generations running in parallel:

### Generation 1 — Voice Agent (`/ai/`)
- Rule-based NLP with `IntentEngine` + `TamilCommandRegistry`
- Handles Tamil/Tanglish voice commands via Browser Web Speech API
- Directly calls ERP via `ErpFunctions` → `DataManager`, `InvoiceManager`, etc.
- Status: **Production-stable. Maintained as compatibility layer.**

### Generation 2/3 — AI Brain (`/ai-brain/`)
- Multi-agent orchestration: `OrchestratorAgent` routes to `hrAgent`, `payrollAgent`, `accountingAgent`, `workflowAgent`, `adminAgent`
- RAG (Retrieval-Augmented Generation) with LanceDB vector store
- Knowledge graph: Customer → Invoice → Voucher → Task chains
- Proactive briefings, daily digest, AMC/follow-up alerts
- Status: **Phase 3 active — no LLM calls. ERP-sourced data only.**

### AI Entry Points

| Trigger | Path |
|---------|------|
| Voice mic | `VoiceAgent.startListening()` → `AIBrain.processTurn()` |
| Text input | `AICommandCenter` text box → `AIBrain.processTurn()` |
| Proactive | `ProactiveEngine` scheduler → `OrchestratorAgent.getProactiveBriefing()` |
| Daily briefing | Dashboard load → `AIBrain.getProactiveBriefing()` |

---

## 5. Core Business Rules Summary

- **No fabricated numbers** — every AI figure is sourced from an ERP manager call
- **No silent writes** — destructive/financial actions require explicit user approval
- **Book Keeper data is never overwritten** — BK rows are protected from local saves
- **Protected collections** — attendance, invoices, vouchers, employees cannot be mass-wiped
- **Data integrity** — save guards prevent accidental drops of >95% of a dataset

---

## 6. Current Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Voice Agent V1 (rule-based) | ✅ Complete |
| 2 | AI Brain skeleton + Command Center | ✅ Complete |
| 3 | Multi-Agent RAG (OrchestratorAgent + LanceDB) | ✅ Active |
| 4 | LLM adapters (OpenAI, Claude, Gemini) | 🔲 Planned |
| 5 | Advanced Tamil NLP + autonomous workflows | 🔲 Planned |

---

## 7. Running the App

```powershell
# Development
npm start

# Build installer
npm run build

# Run unit tests
node tests/calcOT.test.js
node tests/isActiveOnDate.test.js
```

### Voice Assistant — Electron STT Note

Browser Web Speech STT is unreliable inside packaged Electron. For reliable voice input, configure a cloud STT key in **Settings → Voice Health**:
- **Deepgram** (recommended)
- **OpenAI Whisper**

---

## 8. Key Contacts & Links

- **Repository:** `leemurali089-pixel/Attendance-GTES` (GitHub)
- **Author:** Murali D
- **Product:** MJS PrimeLogic
- **Company:** Gas Tech Engineering Service (GTES)

---

*See `docs/AI_BRAIN_V1_ARCHITECTURE.md` for the full AI architecture specification.*  
*See `docs/AI_BRAIN_MULTI_AGENT_RAG.md` for the Phase 3 RAG architecture.*  
*See `docs/VOICE_ERP_AGENT.md` for the V1 voice agent documentation.*
