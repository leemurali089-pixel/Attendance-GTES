# MJS Prime Logic — Business Rules

Business rules define how MJS Prime Logic handles real-world business logic for Gas Tech Engineering Service (GTES). These rules must be respected by the ERP, AI, and reporting layers.

---

## 1. Company Profile

| Field | Value |
|-------|-------|
| Company | Gas Tech Engineering Service |
| Registered Address | No.232/233, Nageshwara Road, Athipet, Chennai - 600058 |
| Work Address | 236/1A, 1st Street, Nageshwara Rao Road, Athipet, Chennai - 600058 |
| GSTIN | 33AFXPR3235A3ZF |
| PAN | AFXPR3235A |
| Bank | Indian Overseas Bank, Nolambur (A/C: 213902000002759, IFSC: IOBA0002139) |

---

## 2. Financial Year

- **FY runs April 1 – March 31** (Indian standard)
- All reports, outstanding calculations, GST filing, and salary processing are FY-scoped
- The active FY is set on the dashboard and propagated globally via `window.currentFY`
- Multi-FY data is retained; queries must filter by the correct FY

---

## 3. Employees & Payroll

### 3.1 Employee Lifecycle

| Stage | Field | Rule |
|-------|-------|------|
| Joining | `dateOfJoining` | Required. Employee is active from this date. |
| Active | `status = 'Active'`, no `dateOfRelieving` | Appears in all attendance/payroll queries |
| Resigned | `dateOfRelieving` set | Active up to and including relieving date |
| Inactive | `status = 'Inactive'` | Excluded from active employee lists |

### 3.2 Attendance

| Rule | Detail |
|------|--------|
| Standard shift | 9 hours (configurable per employee) |
| OT threshold | Hours beyond shift hours = OT |
| Overnight shifts | Checkout before checkin → add 24h (next-day shift) |
| Holiday working | All hours count as OT (no shift deduction) |
| Half-day | Counts as 0.5 days present; 0.5 days absent |
| Leave types | Leave, Half Day, On Duty, Weekly Off |
| Attendance source | `'local'` for manual entry; `'bookkeeper'` for BK imports |

### 3.3 Salary Calculation

- Base salary: per employee profile (monthly fixed)
- OT rate: configurable multiplier over base hourly
- Advances: deducted from monthly salary (`gtes_advances`)
- Bonus: separate from monthly salary (`gtes_bonus_payouts`)
- Payout list: generated via `ReportsModule.getSalaryPayoutData()` — requires Admin approval

### 3.4 Salary Advance Rules

- Advances are tracked per employee with `balance` field (remaining unpaid amount)
- Advance deduction happens at month-end salary processing
- AI reads advances from `DataManager.KEYS.ADVANCES` — never computes balances manually

---

## 4. Customers & Outstanding

### 4.1 Customer Types

| Type | Description |
|------|-------------|
| Direct Customer | GST or non-GST; invoiced directly |
| AMC Contract | Annual maintenance contract with renewal dates |
| Supplier / Vendor | Purchase-side party (purchases/expenses) |

### 4.2 Outstanding Balance Rules

- Outstanding = unpaid invoice balance after voucher allocations
- Allocation is party-scoped; a payment from Customer A cannot reduce Customer B's balance
- Outstanding is always sourced from `InvoiceManager.getInvoicesWithBalance()` — never manually computed
- Overdue threshold: configurable (default 30 days from invoice date)
- Credit notes reduce outstanding via negative-value invoice rows

### 4.3 Customer Name Matching

The AI uses fuzzy matching with edit-distance scoring:
- Exact match → score 100
- Compact (no-spaces) match → 95
- Substring match → 50
- Word-level match → 35
- Edit distance ≤ 2 (for names ≤ 7 chars) or ≤ 3 (longer) → scored

If multiple candidates score ≥ 60, the AI presents a disambiguation list — it never silently picks the wrong customer.

### 4.4 AMC / Service Contracts

- Stored in `gtes_services` with `expiryDate` or `nextDueDate`
- Proactive reminders fire when due within N days (configurable, default 30)
- Linked to customer via `customerId` or party name match

---

## 5. Invoices

### 5.1 Invoice Types

| Type | Description |
|------|-------------|
| GST Invoice | With GST line items; used for GSTR-1/3B |
| Plain Invoice | Without GST; service/cash billing |
| Proforma | Estimate; not posted to GST ledger |
| Purchase Invoice | Supplier bill (source: purchase) |

### 5.2 Invoice Numbering

- Format: `GTES/YY-YY/NNN` or custom series
- Numbers are normalized for deduplication (strip prefix, strip leading zeros)
- Same invoice number from different parties = different records (party-scoped)

### 5.3 Invoice Lifecycle

```
Draft → Issued → Partial Payment → Fully Paid / Overdue
```

- `balance > 0` → outstanding
- `balance = 0` → fully collected
- `balance < 0` → overpayment (check allocation)

---

## 6. Vouchers

### 6.1 Voucher Types

| Type | Use |
|------|-----|
| `receipt` | Payment received from customer |
| `payment` | Payment made to supplier |
| `journal` | Internal adjustment |
| `contra` | Bank/cash transfer |

### 6.2 Allocation Rules

- Receipt vouchers allocate against open invoices
- Allocation keys are party-scoped (v1.3.44+)
- BK-imported vouchers retain `source: 'bookkeeper'`
- Local vouchers retain `source: 'local'` or `'mjsprime'`

---

## 7. Tasks & Workflows

### 7.1 Task Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Open, not started |
| `in_progress` | Work has begun |
| `completed` | Done |
| `cancelled` | Dropped |

### 7.2 Task Rules

- Tasks are linked to customers via `customerId` or title pattern matching
- Overdue = `dueDate < today` AND status not completed/cancelled
- AMC service tasks auto-generate from service contract expiry

### 7.3 Delivery Challans

- Linked to invoices via `invoiceId` or customer name
- DC number format: custom series per FY
- Status: `draft`, `issued`, `delivered`, `returned`

---

## 8. Inventory

- Inventory items tracked in `inventory` collection
- Transactions logged in `inventoryTransactions` (in/out with date, qty, reason)
- Stock balance = opening + in - out for a given date range
- AI reads inventory via `DataManager.getData('inventory')` — no manual arithmetic

---

## 9. GST Rules

| Rule | Detail |
|------|--------|
| GST rates | 5%, 12%, 18%, 28% (configured per item/service) |
| GSTIN validation | 15-character format: `{state}{PAN}{entity}{Z}{check}` |
| GSTR-1 | Outward supplies; generated from GST invoices per FY quarter |
| GSTR-3B | Summary; generated from `BusinessAnalytics.generateGSTR3B()` |
| Reverse charge | Flag `reverseCharge: true` on applicable purchase invoices |
| GST-exempt | Invoices without GST lines; separate from GST ledger |

---

## 10. Salary Payout Flow (Business-Critical)

1. Admin triggers "Generate Salary Payout" for a month
2. `ReportsModule.getSalaryPayoutData()` computes net pay per employee
3. Preview shown to admin (sandbox mode) — no writes yet
4. Admin confirms → payout list saved + payslips generated
5. Advance deductions recorded in `gtes_advances`
6. Audit log entry created via `AuditManager.log()`

**AI rule:** This flow requires T4 (Admin) role + `ApprovalEngine` confirmation. The AI never auto-triggers salary payout without explicit admin approval.

---

## 11. Follow-Up & Collections

The proactive AI engine generates follow-up suggestions based on:

| Signal | Threshold |
|--------|-----------|
| Outstanding balance | > ₹0 |
| Overdue age | > 30 days (configurable) |
| Days since last contact | > 14 days |
| AMC expiry approaching | ≤ 30 days |

Follow-up output includes: customer name, outstanding amount, invoice refs, last invoice date, suggested action.

---

## 12. Bank Reconciliation

- Bank statements imported as CSV/Excel into `gtes_bank_import_session`
- Each row is matched to a voucher via `gtes_bank_links`
- Unmatched rows are flagged for manual review
- AI can suggest matches but must not auto-link without user confirmation

---

## 13. Audit Trail

Every write operation (T3/T4) is logged:

```json
{
  "actor": "username",
  "role": "admin",
  "intent": "attendance.mark",
  "args": { "employeeId": "E001", "date": "2026-06-15", "status": "present" },
  "result": { "success": true, "recordId": "..." },
  "ts": "2026-06-15T10:30:00Z"
}
```

AI-specific audit: `ActionReplayEngine` records Who/What/When/Why + `sourceRefs` for every brain action.
