# Universal Document Engine V4 — Migration Report & Implementation Plan

**Date:** 2026-06-05  
**Gold standard:** GST Sales Invoice V3 (`adapterSalesInvoice` + `InvoicePdfMakeV3` + `InvoicePreviewV3`)  
**Rule:** One engine only — pdfmake + `DocumentEngine` + shared settings/preview/print. No new PDF stacks.

---

## 1. Executive summary

| Metric | Count |
|--------|------:|
| Document types in `DocumentTemplates` registry | 21 |
| **Native (V3/V4 complete)** | **1** — `sales-invoice` |
| Legacy with working PDF/print path | 14 |
| Registered but no PDF implementation found | 6 |
| User-requested types with **no module yet** | ~25 |
| Legacy engine touchpoints (files) | 12 |
| `html2pdf` call sites | ~35 |
| `window.print` call sites | ~8 |
| `printToPDF` (Electron HTML capture) | 3 IPC handlers + offscreen window |
| `jsPDF` (via html2pdf) | all html2pdf paths |

**V4 is not a new engine.** It is a **rename + completion** of Document Engine V3: every document gets an adapter cloned from the GST invoice pattern, then legacy paths are deleted.

---

## 2. Target architecture (V4)

```
core/document-engine/
  documentEngine.js          — orchestrator (preview / download / print / export)
  documentPreview.js         — shared A4 frames, page nav
  documentPdfGenerator.js    — single pdfmake byte generator
  documentPrintManager.js    — Electron printPdfBuffer + file download
  documentTemplates.js       — type registry
  documentSettings.js        — page size, orientation, margins, scale
  documentCopyPicker.js      — multi-select copy types
  documentDiagnostics.js     — layout debug panel
  documentLegacyBridge.js    — TEMPORARY; shrink to zero adapters
  documentLayout.js          — pagination facade
  pdfmakeInit.js             — font bootstrap
  adapters/
    adapterSalesInvoice.js   — ✅ GOLD STANDARD
    adapter*.js              — one per document type
```

### Per-adapter contract (mandatory)

| Method | Purpose |
|--------|---------|
| `buildDocument(id, settings)` | ERP → normalized doc model |
| `paginate(doc, settings)` | Page model (shared layout rules) |
| `renderPreview(layout)` | HTML page frames aligned to pdfmake |
| `generatePdfBytes(doc, settings)` | pdfmake definition → `Uint8Array` |
| `getCopyTypes` / `setCopyTypes` | When `supportsCopyType` |
| `getFilename(entity)` | Download name |

### Single source of truth pipeline

```
buildDocument → paginate → renderPreview (UI)
                    ↘ generatePdfBytes → DocumentPrintManager (print / save / download)
```

**Forbidden after migration:** `html2pdf`, `window.print`, `jsPDF`, `printToPDF` on HTML, iframe/hidden-window HTML capture for documents.

---

## 3. Legacy engine scan (Step 1)

### 3.1 Engine inventory

| Engine | Location | Used for |
|--------|----------|----------|
| **pdfmake + DocumentEngine** | `core/document-engine/*`, `js/invoicePdfMakeV3.js` | GST sales invoice only |
| **html2pdf + html2canvas + jsPDF** | CDN `index.html`, `deliveryUI.js`, `vouchersUI.js`, `reports.js`, `analyticsUI.js`, `bonus.js` | Challans, job cards, purchases, vouchers, payslips, attendance, ledgers, GST reports |
| **window.print** | `deliveryUI.nativePrint`, `vouchersUI`, ledger button | HTML modal → system print dialog |
| **Electron printToPDF** | `main.js` `invoice-preview-to-pdf`, `invoice-html-to-pdf` | Deprecated HTML invoice capture |
| **Electron printPdfBuffer** | `main.js` `print-pdf-buffer` | ✅ Correct path — pdfmake bytes only |
| **Legacy HTML builders** | `invoicesUI.getInvoiceElement`, `getPurchaseElement`, `vouchersUI.getVoucherElement` | DOM templates for html2pdf / print |

### 3.2 File / function scan table

| File | Function / area | Document type | Current engine | Migration status |
|------|-----------------|---------------|----------------|------------------|
| `core/document-engine/adapters/adapterSalesInvoice.js` | `buildDocument`, `generatePdfBytes` | GST Tax Invoice | **pdfmake / V3 Native** | ✅ **Complete** |
| `js/invoiceDataV3.js` | `build` | Sales invoice model | Native data layer | ✅ Complete |
| `js/invoicePdfMakeV3.js` | `generatePdfBytes` | Sales invoice PDF | pdfmake | ✅ Complete (rename → `documentPdfMake` in V4) |
| `js/invoicePreviewV3.js` | `render` | Sales invoice preview | Page-model HTML | ✅ Complete |
| `js/invoiceLayoutV3.js` | `paginate` | Sales invoice pages | Native layout | ✅ Complete |
| `js/invoicePdfEngine.js` | `exportInvoice`, `downloadPdf` | Sales invoice facade | → DocumentEngine | ✅ Routed |
| `js/invoiceEngineV3.js` | all | Sales invoice facade | → DocumentEngine | ✅ Routed |
| `js/deliveryUI.js` | `viewInvoice`, `exportInvoiceNative` | GST Invoice | → DocumentEngine | ✅ Routed |
| `js/invoicesUI.js` | `previewInvoice`, `generatePDF` | GST Invoice | → DocumentEngine | ✅ Routed |
| `main.js` | `print-pdf-buffer` | All native PDFs | pdfmake bytes | ✅ Keep |
| `main.js` | `save-pdf` | All native PDFs | pdfmake bytes | ✅ Keep |
| `main.js` | `invoice-preview-to-pdf` | Invoice HTML | printToPDF | ❌ **Remove** after full migration |
| `main.js` | `invoice-html-to-pdf` | Invoice HTML | printToPDF offscreen | ❌ **Remove** |
| `main.js` | offscreen `printToPDF` helper | Invoice HTML | printToPDF | ❌ **Remove** |
| `preload.js` | `invoicePreviewToPdf`, `invoiceHtmlToPdf` | Invoice HTML | IPC to printToPDF | ❌ **Remove** |
| `js/invoicesUI.js` | `getInvoiceElement` | GST / CN / DC-as-invoice HTML | Legacy DOM | ⚠️ Keep until CN/DC split adapters |
| `js/invoicesUI.js` | `getPurchaseElement` | Purchase Invoice | HTML → html2pdf | ❌ Pending |
| `js/invoicesUI.js` | `previewPurchase` | Purchase Invoice | HTML preview modal | ❌ Pending |
| `js/deliveryUI.js` | `printChallan` | Delivery / Service Challan | html2pdf | ❌ Pending |
| `js/deliveryUI.js` | `viewChallan` | Delivery / Service Challan | HTML modal | ❌ Pending |
| `js/deliveryUI.js` | `generateJobCardPDF` | Job Card | html2pdf | ❌ Pending |
| `js/deliveryUI.js` | `viewJobCard` | Job Card | HTML modal | ❌ Pending |
| `js/deliveryUI.js` | `downloadVoucherPdf`, `printVoucherPdf` | Vouchers | html2pdf | ❌ Pending |
| `js/deliveryUI.js` | `downloadPurchaseInvoicePdf`, `printPurchase` | Purchase Invoice | html2pdf | ❌ Pending |
| `js/deliveryUI.js` | `nativePrint`, `mountPdfPreview` | Generic HTML preview | window.print | ❌ Remove when unused |
| `js/deliveryUI.js` | `buildGtesHtml2PdfOptions`, `beginPdfClone` | Shared html2pdf util | html2pdf | ❌ Remove last |
| `js/vouchersUI.js` | `getVoucherElement`, `generatePDF` | Receipt / Payment / Expense voucher | html2pdf | ❌ Pending |
| `js/vouchersUI.js` | `previewVoucher` | Vouchers | HTML + window.print | ❌ Pending |
| `js/reports.js` | `generatePayslips` | Salary Slip / Payslip | html2pdf | ❌ Pending |
| `js/reports.js` | `generateMonthlyPDF` | Attendance Report (monthly) | html2pdf | ❌ Pending |
| `js/reports.js` | `generateAnnualPDF` | Attendance Report (annual) | html2pdf | ❌ Pending |
| `js/reports.js` | `generateSalaryPayout`, `viewSalaryPayoutPDF` | Salary payout summary | html2pdf | ❌ Pending |
| `js/bonus.js` | bonus payslip export | Salary / bonus slip | html2pdf | ❌ Pending |
| `js/analyticsUI.js` | `exportGstReportPdf`, `_exportRegisterPdf` | GST Report | html2pdf | ❌ Pending |
| `js/analyticsUI.js` | ledger PDF export | Ledger Report | html2pdf | ❌ Pending |
| `js/analyticsUI.js` | customer statement (if wired) | Customer Statement | html2pdf | ❌ Pending |
| `js/invoicePreviewLayout.js` | page measure / print CSS | Old invoice HTML | printToPDF helper | ❌ Deprecated |
| `index.html` | html2pdf CDN script | Global | html2pdf | ❌ Remove when zero callers |
| `core/document-engine/documentLegacyBridge.js` | `_handler` | 10 bridged types | Routes to legacy | Shrink per adapter |

---

## 4. Document type migration matrix (Step 2)

Legend: **✅ Native** | **🟡 Partial** (same entity, shared adapter) | **❌ Legacy** | **⬜ Not in app** (no PDF module found)

### SALES

| Document | Registry type | Data source | Current engine | Status | V4 adapter |
|----------|---------------|-------------|----------------|--------|------------|
| GST Tax Invoice | `sales-invoice` | `InvoiceManager` | pdfmake | ✅ Native | `adapterSalesInvoice` (done) |
| Tax Invoice (alias) | `sales-invoice` | same | pdfmake | ✅ Native | same |
| Credit Note | `sales-invoice` * | `InvoiceManager` (type `credit-note`) | pdfmake via CN title in `InvoiceDataV3` | 🟡 Partial | Extend sales adapter or `adapterCreditNote` |
| Debit Note (customer) | — | `ExpenseManager`? | Not found | ⬜ Not in app | `adapterDebitNote` (new) |
| Delivery Challan | `delivery-challan` | `DeliveryManager` | html2pdf | ❌ Legacy | `adapterDeliveryChallan` |
| Material Dispatch Note | — | Likely challan | html2pdf (challan) | ❌ Legacy | Alias of delivery challan |
| Sales Quotation | `quotation` | Not found | — | ⬜ Not in app | `adapterSalesQuotation` |
| Proforma Invoice | `proforma-invoice` | Not found | — | ⬜ Not in app | `adapterProformaInvoice` |
| Performa Invoice (alias) | `proforma-invoice` | — | — | ⬜ Not in app | same |
| Sales Order | — | BK `sales_order` import only | — | ⬜ Not in app | `adapterSalesOrder` |

### PURCHASE

| Document | Registry type | Data source | Current engine | Status | V4 adapter |
|----------|---------------|-------------|----------------|--------|------------|
| Purchase Invoice | `purchase-invoice` | `ExpenseManager` / purchases | html2pdf | ❌ Legacy | `adapterPurchaseInvoice` |
| Purchase Order | — | BK import | — | ⬜ Not in app | `adapterPurchaseOrder` |
| Purchase Enquiry | — | — | — | ⬜ Not in app | `adapterPurchaseEnquiry` |
| Goods Receipt Note | — | — | — | ⬜ Not in app | `adapterGoodsReceiptNote` |
| Vendor Debit Note | — | expenses `debit-note` | history list only | ⬜ Partial data | `adapterVendorDebitNote` |
| Vendor Credit Note | — | — | — | ⬜ Not in app | `adapterVendorCreditNote` |

### SERVICE

| Document | Registry type | Data source | Current engine | Status | V4 adapter |
|----------|---------------|-------------|----------------|--------|------------|
| Service Challan | `service-challan` | `DeliveryManager` | html2pdf | ❌ Legacy | `adapterServiceChallan` |
| Job Card | `job-card` | `JobCardManager` | html2pdf | ❌ Legacy | `adapterJobCard` |
| Service Report | `service-report` | — | — | ⬜ Not in app | `adapterServiceReport` |
| Installation Report | — | — | — | ⬜ Not in app | `adapterInstallationReport` |
| AMC Report | `amc-report` | — | — | ⬜ Not in app | `adapterAmcReport` |
| Preventive Maintenance Report | — | — | — | ⬜ Not in app | `adapterPmReport` |
| Breakdown Service Report | — | — | — | ⬜ Not in app | `adapterBreakdownReport` |
| Commissioning Report | — | — | — | ⬜ Not in app | `adapterCommissioningReport` |
| Work Completion Certificate | — | — | — | ⬜ Not in app | `adapterWorkCompletion` |

### HRMS

| Document | Registry type | Data source | Current engine | Status | V4 adapter |
|----------|---------------|-------------|----------------|--------|------------|
| Salary Slip / Payslip | `salary-slip` | `Reports.generatePayslips` | html2pdf | ❌ Legacy | `adapterSalarySlip` |
| Attendance Report | `attendance-report` | `Reports.generateMonthlyPDF` | html2pdf | ❌ Legacy | `adapterAttendanceReport` |
| Leave Report | — | embedded in attendance | html2pdf | ❌ Legacy | Part of attendance adapter |
| Employee Summary | — | `generateAnnualPDF` | html2pdf | ❌ Legacy | `adapterEmployeeSummary` |
| Overtime Report | — | part of payslip | html2pdf | ❌ Legacy | Part of salary slip |

### ACCOUNTS

| Document | Registry type | Data source | Current engine | Status | V4 adapter |
|----------|---------------|-------------|----------------|--------|------------|
| Ledger Report | `ledger-report` | `BusinessAnalytics.getAccountLedger` | html2pdf | ❌ Legacy | `adapterLedgerReport` |
| Customer Statement | `customer-statement` | `AnalyticsUI` | html2pdf | ❌ Legacy | `adapterCustomerStatement` |
| GST Reports | `gst-report` | `AnalyticsUI.exportGstReportPdf` | html2pdf | ❌ Legacy | `adapterGstReport` |
| Cash Book / Bank Book / Day Book | — | — | — | ⬜ Not in app | `adapterCashBook` etc. |
| Trial Balance / P&L / Balance Sheet | — | — | — | ⬜ Not in app | Phase 5 adapters |

### PROJECTS

| Document | Registry type | Data source | Current engine | Status | V4 adapter |
|----------|---------------|-------------|----------------|--------|------------|
| Work Order | — | — | — | ⬜ Not in app | `adapterWorkOrder` |
| Project / Task / Timesheet Report | — | `tasksUI` (no PDF) | — | ⬜ Not in app | Phase 6 |

### VOUCHERS (accounts)

| Document | Registry type | Data source | Current engine | Status | V4 adapter |
|----------|---------------|-------------|----------------|--------|------------|
| Receipt Voucher | `receipt-voucher` | `VoucherManager` | html2pdf | ❌ Legacy | `adapterReceiptVoucher` |
| Payment Voucher | `payment-voucher` | `VoucherManager` | html2pdf | ❌ Legacy | `adapterPaymentVoucher` |
| Expense Voucher | `expense-voucher` | `VoucherManager` | html2pdf | ❌ Legacy | `adapterExpenseVoucher` |

---

## 5. Gold standard template (clone from GST Invoice)

Extract from current V3 into shared V4 modules:

| Extract | From | To (V4) |
|---------|------|---------|
| Page settings | `documentSettings.js` | unchanged |
| Copy multi-select | `documentCopyPicker.js` | unchanged |
| pdfmake table helpers | `invoicePdfMakeV3.js` | `core/document-engine/documentPdfMake.js` |
| Fixed column widths | `COL` + `%` widths | `documentTableLayout.js` |
| Party blocks | `_receiverConsigneeGrid` | `documentBlocks.partyGrid()` |
| Items table | `_itemsTable` | `documentBlocks.lineItemsTable()` |
| Header / footer | `_headerBlock`, `_closingBlock` | `documentBlocks.*` |
| Pagination | `invoiceLayoutV3.js` | `documentPagination.js` |
| Preview frames | `invoicePreviewV3.js` | `documentPreviewRenderer.js` |

**Table rules (all adapters):**

- Numeric columns: fixed pt or `%` widths, `noWrap: true`, `alignment: 'right'`
- HSN / Amount / Rate / Qty: never `'*'` star columns
- One pdfmake `content[]`; copy types = `pageBreak: 'before'` per copy

---

## 6. Implementation plan (Step 3 & 4)

### Phase 0 — V4 foundation (1–2 days)

- [ ] Rename docs/branding V3 → V4 (code comments only; keep API stable)
- [ ] Extract `documentPdfMake.js` + `documentBlocks.js` from `invoicePdfMakeV3.js`
- [ ] Add `adapterBase.js` mixin: settings, copy types, fingerprint, filename
- [ ] Add `DocumentTemplates.registerAll()` loader for adapters
- [ ] Unit smoke: generate GST invoice PDF in Node (existing tools pattern)

### Phase 1 — Sales documents (high traffic) (1 week)

| Priority | Adapter | Clone from | UI entry points to rewire |
|----------|---------|------------|---------------------------|
| P1 | `adapterCreditNote` | sales-invoice | `previewInvoice` for CN rows |
| P1 | `adapterDeliveryChallan` | sales-invoice layout | `DeliveryUI.printChallan`, `viewChallan` |
| P1 | `adapterServiceChallan` | delivery-challan | service challan paths |
| P2 | `adapterProformaInvoice` | sales-invoice | new UI when module exists |
| P2 | `adapterSalesQuotation` | sales-invoice | new UI when module exists |

### Phase 2 — Purchase & vouchers (1 week)

| Priority | Adapter | UI rewire |
|----------|---------|-----------|
| P1 | `adapterPurchaseInvoice` | `InvoicesUI.previewPurchase`, `DeliveryUI.printPurchase` |
| P1 | `adapterReceiptVoucher` | `VouchersUI.generatePDF`, `previewVoucher` |
| P1 | `adapterPaymentVoucher` | same |
| P2 | `adapterExpenseVoucher` | same |

### Phase 3 — Service & job cards (3–5 days)

| Priority | Adapter | UI rewire |
|----------|---------|-----------|
| P1 | `adapterJobCard` | `DeliveryUI.generateJobCardPDF`, `viewJobCard` |

### Phase 4 — HRMS (1 week)

| Priority | Adapter | UI rewire |
|----------|---------|-----------|
| P1 | `adapterSalarySlip` | `Reports.generatePayslips`, `bonus.js` |
| P2 | `adapterAttendanceReport` | `generateMonthlyPDF`, `generateAnnualPDF` |
| P2 | `adapterSalaryPayoutSummary` | `generateSalaryPayout` |

### Phase 5 — Accounts & analytics (1–2 weeks)

| Priority | Adapter | UI rewire |
|----------|---------|-----------|
| P1 | `adapterLedgerReport` | `AnalyticsUI` ledger PDF |
| P1 | `adapterGstReport` | `exportGstReportPdf` |
| P2 | `adapterCustomerStatement` | customer statement export |
| P3 | Trial Balance, P&L, Balance Sheet | new screens |

### Phase 6 — Greenfield document types (ongoing)

Types listed in requirements but **not present** in MJS Prime Logic today (Sales Order, Purchase Enquiry, GRN, project reports, etc.):

1. Add ERP data model + UI screen
2. Add adapter using shared blocks
3. Register in `DocumentTemplates`
4. Wire `DocumentEngine.export`

### Phase 7 — Decommission legacy (after each phase)

Per migrated type:

1. Remove handler from `documentLegacyBridge.js`
2. Replace UI `onclick` → `DocumentEngine.export({ type, id, action })`
3. Delete `get*Element` HTML builder when unused
4. Global cleanup when **zero** callers remain:
   - Remove html2pdf CDN from `index.html`
   - Remove `deliveryUI.buildGtesHtml2PdfOptions`, `beginPdfClone`, `nativePrint`
   - Remove `main.js` `invoice-*-to-pdf` IPC handlers
   - Remove `js/invoicePreviewLayout.js`

---

## 7. Per-adapter checklist (copy for each PR)

```
[ ] adapter*.js registered in DocumentTemplates
[ ] buildDocument — normalized model from ERP
[ ] paginate — uses documentPagination / copy expansion
[ ] renderPreview — page-model HTML only (no separate print HTML)
[ ] generatePdfBytes — pdfmake only; % column widths for tables
[ ] Copy types + None — if supportsCopyType
[ ] Settings — portrait/landscape, margins, scale in fingerprint
[ ] UI buttons → DocumentEngine.export
[ ] LegacyBridge handler removed
[ ] Visual parity sign-off: Preview = PDF = Print = Download
[ ] documentEngine.PDF_BYTE_VERSION bumped
```

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| html2pdf layout differs from pdfmake | One-time visual QA per type; keep legacy until sign-off |
| Long reports (ledger, GST) need landscape | Default landscape for wide tables (like GST invoice) |
| Multi-page + multi-copy page count | Reuse `InvoiceLayoutV3` copy expansion pattern |
| BookKeeper-only types (sales order) | Phase 6 — data layer first |
| Electron print window sizing | Already fixed in `print-pdf-buffer`; reuse for all |

---

## 9. Success criteria (final state)

- [ ] **One** pdfmake path for every PDF in the app
- [ ] **Zero** `html2pdf` / `window.print` / `printToPDF` for documents
- [ ] Preview toolbar identical for all types (page size, orientation, margins, scale, copy)
- [ ] `DocumentPrintManager` only input: pdfmake bytes
- [ ] `documentLegacyBridge.js` deleted or empty
- [ ] All financial tables: fixed widths, right-aligned amounts, no wrapped HSN

---

## 10. Recommended next action

**Start Phase 0 + Phase 1 P1:** extract shared pdfmake blocks, then migrate **Delivery Challan** and **Purchase Invoice** (highest legacy traffic after GST invoice).

No new PDF engines. Clone GST Invoice V3 — do not redesign layouts.
