# MJS Prime Logic — ERP Rules

These rules govern how data is stored, read, merged, and protected across the entire ERP. They apply equally to the UI, the AI layer, and any import/sync operations.

---

## 1. Storage Architecture

### 1.1 Dual-Layer Storage

All data lives in **two synchronized layers**:

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Local** | `Data/*.json` files (FileStorage via Electron IPC) | Primary offline store |
| **Cloud** | Firebase Realtime Database | Sync, backup, multi-device |
| **Cache** | `localStorage` (DataManager in-memory cache) | Fast reads, session cache |

**Priority on conflict:** Local `source: 'local'` rows take precedence over Book Keeper (`source: 'bookkeeper'`) rows for the same entity.

### 1.2 Storage Keys

All keys are defined in `DataManager.KEYS`:

| Key | Content |
|-----|---------|
| `gtes_employees` | Employee profiles |
| `gtes_attendance` | Daily attendance records |
| `gtes_advances` | Salary advances |
| `gtes_bonus_payouts` | Bonus records |
| `gtes_settings` | App + AI settings |
| `gtes_admin_password` | Hashed admin password |
| `gtes_holidays` | Holiday calendar |
| `invoices` | Sales invoices + outstanding |
| `vouchers` | Payment/receipt vouchers |
| `purchases` | Purchase expenses |
| `customers` | Customer records |
| `inventory` | Inventory items |
| `inventoryTransactions` | Stock movements |
| `gtes_tasks` | Task/work items |
| `gtes_challans` | Delivery challans |
| `gtes_services` | AMC/service contracts |
| `gtes_bank_alias` | Bank account aliases |
| `gtes_bank_links` | Bank statement → voucher links |
| `gtes_recycle_bin` | Soft-deleted records |
| `jobcards` | Job/service cards |

---

## 2. Data Integrity Rules

### 2.1 Protected Collections

The following collections are **protected from mass wipe**:

```
gtes_attendance, invoices, vouchers, gtes_employees
```

**Guard conditions (enforced by `DataManager._guardProtectedDatasetSave`):**
- If existing count > 0 and new payload = 0 → **REFUSED** (requires `allowProtectedWipe: true`)
- If existing count ≥ 50 and new count < 5% of existing → **REFUSED**

These rules prevent accidental erasure during cloud sync, BK import, or bad restore.

### 2.2 Protected Core Snapshot

Before any Book Keeper reset sweep, the system snapshots:
- Local (non-BK) invoices
- Local (non-BK) vouchers
- Full attendance

Stored in `gtes_protected_core_snapshot` (localStorage + `Data/` disk).  
Restored via `DataManager.restoreProtectedCoreSnapshot()` or Admin UI.

### 2.3 Merge-on-Load Keys

On app load, the following collections are **union-merged** (local + cloud, deduplicated):

```
invoices, vouchers, challans, gtes_challans, customers, purchases, gtes_employees, jobcards
```

Deduplication uses stable merge keys:
- **Invoices:** `bookkeeperId` → `bookkeeperVchNo` → normalized `invoiceNo` + party
- **Vouchers:** `bookkeeperId` → normalized voucher key
- **Customers:** `bookkeeperAccountId` → GSTIN → normalized name

Newest `updatedAt` wins on conflict.

---

## 3. Book Keeper (BK) Import Rules

Book Keeper is an external accounting software. When importing BK data:

| Rule | Detail |
|------|--------|
| BK rows are tagged | `source: 'bookkeeper'` or `bookkeeperId` present |
| BK rows are never overwritten by local saves | `isBookkeeperFinancialRow()` check before update |
| Local rows are never deleted by BK import | Union-merge, not replace |
| BK reset is atomic | Snapshot protected data first, then wipe BK rows only |
| `source: 'local'` or `'mjsprime'` | Protected from BK reset sweep |

**`DataManager.isBookkeeperFinancialRow(row, storageKey)`** — returns `true` if the row originated from BK import.

---

## 4. Attendance Rules

### 4.1 Active Employee Filter

`DataManager.isActiveOnDate(employee, date)`:
- Returns `true` if `date >= dateOfJoining` AND `date <= dateOfRelieving` (or no relieving date)
- Returns `false` for null/missing employees or missing join date

### 4.2 OT Calculation

`DataManager.calcOT(checkin, checkout, isOnDuty, shiftHours)`:
- If either time missing → 0
- Overnight shifts: if `checkout <= checkin` → add 24h to checkout
- `isOnDuty = true`: OT = max(0, hoursWorked − shiftHours)
- `isOnDuty = false` (holiday working): OT = all hours worked
- Result rounded to 2 decimals

### 4.3 Attendance Source Stamping

All locally-created attendance records get `source: 'local'` stamp.  
Book Keeper–imported attendance rows retain `source: 'bookkeeper'` and are excluded from local bulk operations.

---

## 5. Invoice & Voucher Rules

### 5.1 Outstanding Balance

Outstanding = sum of `balance` field across `InvoiceManager.getInvoicesWithBalance()` for a party.  
Allocation is tracked via `VoucherManager.getVoucherAllocationsMap()` — party-scoped allocation keys (v1.3.44+).

**AI Rule:** Never compute outstanding manually. Always call `InvoiceManager.getInvoicesWithBalance()` or `BusinessAnalytics.getOutstandingBalances()`.

### 5.2 Invoice Deduplication

Invoices are deduplicated using `_normalizeDocNumberKey()`:
- Strips `INV-`, `NB-`, `GTES/YY-YY/` prefixes
- Extracts numeric part, strips leading zeros
- Matches party name for same-number resolution

### 5.3 Voucher Allocation Keys

Allocation keys are **party-scoped** to prevent cross-party allocation collisions:
- Format: `{partyId}:{invoiceNo}:{allocationId}`
- BK vouchers: identified by `bookkeeperId` or `vch_bk-` prefix

---

## 6. Settings

Settings are stored under `DataManager.KEYS.SETTINGS` (key: `gtes_settings`).

Key settings consumed by AI:

| Setting Key | Purpose |
|------------|---------|
| `ai.geminiApiKey` | Gemini API key (optional) |
| `ai.openaiApiKey` | OpenAI API key (optional, for Whisper/embeddings) |
| `deepgramApiKey` | Deepgram STT key |
| `speechProvider` | `'browser'` \| `'deepgram'` \| `'whisper'` |
| `listenMode` | `'push_to_talk'` \| `'continuous'` |
| `language` | `'ta'` \| `'en'` |

---

## 7. Financial Year (FY)

- FY runs April–March (Indian standard)
- Dashboard FY context is set globally and passed to all report queries
- AI must read FY from `ContextEngine` or dashboard globals — never hardcode years

---

## 8. Cloud Sync Rules

| Rule | Detail |
|------|--------|
| Writes are debounced | FileStorage queues writes; no double-save spam |
| Conflict during BK import | AI must refuse T3 writes if `SyncManager` is in conflict state |
| Cloud timeout | 5-second timeout for cloud reads at boot; falls back to local cache |
| Pending cloud writes | `FileStorage.flushPendingCloudWrites(5000)` before critical snapshots |

---

## 9. Recycle Bin

Soft-deleted records go to `gtes_recycle_bin` with:
- `deletedAt` timestamp
- `deletedFrom` original collection key
- `deletedBy` user ID

Hard-delete requires Admin role + explicit recycle bin purge.

---

## 10. Forbidden Operations

The following are **never permitted**, even by Admin:

1. Direct JSON mutation of `Data/*.json` files outside `DataManager.saveData()`
2. Wiping a protected collection without `allowProtectedWipe: true`
3. Overwriting a BK row with a local payload
4. Bypassing `ApprovalEngine` for destructive or financial actions
5. Any AI-generated number that is not sourced from an ERP manager call
