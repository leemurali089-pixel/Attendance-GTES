# MJS Prime Logic — Known Bugs & Issues

This document tracks known bugs, workarounds, and deferred issues. Update when a bug is fixed or a new one is found.

**Format:** `[OPEN]` / `[FIXED]` / `[WONT_FIX]` / `[DEFERRED]`

---

## AI & Voice System

### AI-001 `[FIXED]` — Unit test `Cannot find module './data.js'`

**Symptom:** Running `node tests/calcOT.test.js` or `node tests/isActiveOnDate.test.js` fails with `Cannot find module './data.js'`.

**Root cause:**
1. Test files used wrong relative path `./data.js` instead of `../js/data.js`.
2. `js/data.js` executed `DataManager.init()` on load, which crashes in Node.js because `FileStorage` and `localStorage` are browser-only globals.

**Fix applied (2026-06-15):**
- `js/data.js`: Added conditional export at end of file:
  ```js
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
      module.exports = DataManager;
  } else {
      DataManager.init();
  }
  ```
- `tests/calcOT.test.js` and `tests/isActiveOnDate.test.js`: Changed require path to `'../js/data.js'`.

**Test result:** 7/7 tests passing for both suites.

---

### AI-002 `[OPEN]` — Browser Web Speech STT blocked in Electron without API key

**Symptom:** Voice mic button is silently disabled or immediately shows error "Voice input needs Deepgram or OpenAI key" when running the packaged Electron app.

**Root cause:** `SpeechProviderManager.isElectronSttBlocked()` returns `true` when:
- `diagnostics.isElectron === true`
- `speechProvider === 'browser'`
- No Deepgram or OpenAI key is configured

This is by design — browser Web Speech API is unreliable in Electron. However, it surprises users who expect voice to work out-of-the-box.

**Workaround:** Configure a Deepgram or OpenAI API key in **Settings → Voice Health**.

**Possible fix:** Add a "force browser STT" fallback toggle in Settings for users who accept the reliability tradeoff.

**Priority:** Medium. Text input box always works as fallback.

---

### AI-003 `[OPEN]` — Expired Gemini API key in test-gemini.js

**Symptom:** Running `node test-gemini.js` returns `API key expired` or `API key reported as leaked`.

**Root cause:** The hardcoded API key `AIzaSyAVxwf_4EtLu_0BRuU7nO6SvXRinQAQlgQ` in `test-gemini.js` and `test-gemini-models.js` is expired/revoked.

**Fix needed:** Replace with a valid Gemini API key or remove these test scripts from the repo.

**Impact:** Test scripts only — no production impact. AI Brain does not use this key (no LLM calls in Phase 3).

---

### AI-004 `[OPEN]` — `session.defaultSession.setCacheEnabled is not a function`

**Symptom:** Console warning on every dev startup: `Dev cache disable skipped: session.defaultSession.setCacheEnabled is not a function`.

**Root cause:** Electron 39 removed or renamed `session.setCacheEnabled()`. The code in `main.js` attempts this call in dev mode to avoid cache issues.

**Impact:** Low — no functional impact. Dev mode starts and runs normally.

**Fix:** Remove or replace with the correct Electron 39 API call for disabling cache in development.

---

### AI-005 `[OPEN]` — `HrAgent` may overlap with `AccountingAgent` for ambiguous queries

**Symptom:** Queries like "total pending" may score in both `hrAgent` and `accountingAgent`, causing duplicate or conflicting responses in the merged agent output.

**Root cause:** The `hrAgent` financial-query exclusion filter catches most cases, but ambiguous short queries (< 8 chars) may slip through.

**Workaround:** The orchestrator filters by `withData` (agents that returned actual data) before merging.

**Fix planned:** Increase the minimum token length threshold for `hrAgent` domain matching; add more exclusion patterns for financial terms.

---

### AI-006 `[OPEN]` — LanceDB native module may fail after Electron version bump

**Symptom:** `[RAG IPC] LanceDB unavailable, JSON fallback` in console after upgrading Electron.

**Root cause:** `@lancedb/lancedb` is a native Node module. Its prebuilt binaries are tied to a specific Node ABI version. When Electron's Node ABI changes (Electron upgrade), the binary needs to be rebuilt with `@electron/rebuild`.

**Current status:** LanceDB connects successfully on Electron 39. JSON fallback is working.

**Fix when triggered:** Run `npx @electron/rebuild -f -w @lancedb/lancedb` after any Electron version upgrade.

---

### AI-007 `[DEFERRED]` — Tamil TTS not available on all Windows systems

**Symptom:** TTS (text-to-speech) responses are silent or fall back to English voice for Tamil text.

**Root cause:** Tamil voice (`ta-IN`) requires the Microsoft Tamil TTS engine installed via Windows language settings. Not all systems have it.

**Workaround:** TTS is optional. Voice responses are always shown as text in the conversation panel.

**Deferred:** No cross-platform Tamil TTS without a paid cloud provider (Google TTS / OpenAI TTS).

---

## Build & Distribution

### BUILD-001 `[OPEN]` — `Access is denied` when building installer while app is running

**Symptom:** `electron-builder` fails with:
```
remove C:\Users\Dell\OneDrive\Attendance GTES\dist\win-unpacked\d3dcompiler_47.dll: Access is denied.
```

**Root cause:** The previous build's `dist/win-unpacked/` is locked because the Electron process (or antivirus) holds a file handle.

**Fix:**
1. Close all running instances of MJS PrimeLogic before building.
2. If persists: reboot or manually delete `dist/` folder.

---

### BUILD-002 `[OPEN]` — Build runs from OneDrive path causing lock issues

**Symptom:** Intermittent file lock errors during build or file save operations.

**Root cause:** The project lives in `C:\Users\Dell\OneDrive\Attendance GTES\`. OneDrive sync can hold file handles that conflict with electron-builder's output operations.

**Workaround:** Build from a non-OneDrive path, or pause OneDrive sync before running `npm run build`.

**Long-term fix:** The current workspace (`d:\Attendance GTES TRAIL`) is a separate copy outside OneDrive — use this for development.

---

### BUILD-003 `[OPEN]` — `error.log` contains stale `Cannot find module` entry

**Symptom:** `error.log` file contains:
```
Error: Cannot find module 'c:\Users\Dell\OneDrive\Attendance'
```

**Root cause:** An old attempt to run the app directly with `node` from the wrong path. The log is stale.

**Fix:** No action needed. The Electron app starts correctly with `npm start`.

---

## Data & Storage

### DATA-001 `[OPEN]` — `gtes:data-changed` event storm during BK import

**Symptom:** When importing large Book Keeper datasets, the `gtes:data-changed` event fires hundreds of times, triggering cascading UI refreshes and RAG reindexes.

**Root cause:** Each `DataManager.saveData()` call emits `gtes:data-changed`. BK import calls this per-collection per-batch.

**Current mitigation:** `DataManager._pendingDataChangedEvents` coalesces rapid events with a debounce. RAG reindex debounced at 30s.

**Fix planned:** Batch all BK import saves into a single `saveData` call per collection with a dedicated `skipDataChangedEvent` option during import.

---

### DATA-002 `[OPEN]` — AI RAG JSON files accumulate deleted records

**Symptom:** `Data/ai-rag/*.json` files grow over time and may contain records for employees or customers that have been deleted from the ERP.

**Root cause:** RAG upsert (JSON mode) merges by `id` — it never deletes. When a record is deleted from ERP, its RAG entry persists.

**Fix planned:** Add a `rag:deleteCollection` IPC handler and call it on full reindex (`RagEngine.indexAll()`) to replace rather than merge collections.

---

### DATA-003 `[WONT_FIX]` — Legacy `js/data-MJ.js` shadow file

**Symptom:** `js/data-MJ.js` exists alongside `js/data.js` with similar but older code.

**Status:** `data-MJ.js` is a legacy backup. Not loaded in `index.html`. Not imported anywhere.

**Decision:** Keep as historical reference. Do not delete — contains older business logic that may be referenced during feature work.

---

## UI & UX

### UI-001 `[OPEN]` — Voice panel overlaps content on small screens

**Symptom:** On laptop screens smaller than 1280px width, the voice conversation panel overlaps the main ERP content area.

**Fix planned:** Add responsive CSS breakpoints to the voice panel and AI Command Center.

---

### UI-002 `[OPEN]` — AI Command Center widget counts show stale data after data import

**Symptom:** After importing BK data, the AI Command Center attendance/outstanding counts don't update until page refresh or manual "Refresh" click.

**Root cause:** The Command Center widgets cache their initial data and don't subscribe to `gtes:data-changed` reliably.

**Fix planned:** Add `gtes:data-changed` listener in `aiCommandCenter.js` to trigger a widget refresh on relevant key changes.

---

## Integrations

### INT-001 `[OPEN]` — Gmail sync `invalid_grant` error on token expiry

**Symptom:** Console shows intermittent `invalid_grant` errors from Gmail sync. Throttled to avoid log spam.

**Root cause:** Gmail OAuth refresh token expires if the app hasn't been used for 6+ months or if the Google account's security settings revoke app access.

**Fix:** Re-authorize Gmail in **Settings → Gmail Integration** to generate a new token.

---

*Last updated: 2026-06-15*  
*To add a new bug, copy the template:*
```
### XX-NNN [OPEN] — Short title
**Symptom:**
**Root cause:**
**Fix:**
**Priority:**
```
