# Document Engine V3 — Migration Report

| Status | Meaning |
|--------|---------|
| **Native** | Uses `DocumentEngine` + pdfmake; preview/print/download share one PDF |
| **Legacy** | Still uses html2pdf, `window.print`, or `printToPDF` on HTML |
| **Bridge** | Routed through `DocumentLegacyBridge` until adapter exists |

## Native (Document Engine V3)

| Document | Old file | Old function | New mapping |
|----------|----------|--------------|-------------|
| Sales Invoice | `js/invoicesUI.js` | `generatePDF` | `DocumentEngine.export({ type: 'sales-invoice', id, action })` |
| Sales Invoice | `js/deliveryUI.js` | `viewInvoice` | `DocumentEngine.openPreview({ type: 'sales-invoice', id })` |
| Sales Invoice | `js/deliveryUI.js` | `exportInvoiceNative` | `InvoicePdfEngine` → `DocumentEngine` |
| Sales Invoice | `js/invoicePdfEngine.js` | `openPreview`, `downloadPdf`, `printHtmlPreview` | `DocumentEngine` + `adapterSalesInvoice` |
| Sales Invoice | `js/invoiceEngineV3.js` | all methods | Facade → `DocumentEngine` |
| Sales Invoice | `main.js` | `print-pdf-buffer`, `save-pdf` | Used by `DocumentPrintManager` (not HTML capture) |

## Legacy — pending native adapters

| Document | Old file | Old function | Bridge / notes |
|----------|----------|--------------|----------------|
| Purchase Invoice | `js/invoicesUI.js` | `getPurchaseElement` | `deliveryUI` purchase PDF helpers, html2pdf |
| Purchase Invoice | `js/deliveryUI.js` | `downloadPurchaseInvoicePdf`, `printPurchaseInvoice` | html2pdf / `window.print` |
| Delivery Challan | `js/deliveryUI.js` | `viewChallan`, challan PDF | html2pdf |
| Service Challan | `js/deliveryUI.js` | service challan paths | html2pdf |
| Job Card | `js/deliveryUI.js` | `viewJobCard`, job card PDF | html2pdf |
| Quotation | `js/deliveryUI.js` | quotation preview | HTML / print |
| Proforma Invoice | `js/deliveryUI.js` | proforma paths | HTML / html2pdf |
| Receipt Voucher | `js/vouchersUI.js` | `generatePDF`, `getVoucherElement` | html2pdf |
| Payment Voucher | `js/vouchersUI.js` | `generatePDF` | html2pdf |
| Expense Voucher | `js/vouchersUI.js` | `generatePDF` | html2pdf |
| Salary Slip | `js/reports.js` | payslip export | html2pdf |
| Salary Slip | `js/bonus.js` | bonus payslip | html2pdf |
| Attendance Report | `js/reports.js` | attendance PDF | html2pdf |
| Ledger Report | `js/deliveryUI.js` | ledger table | `window.print`, html2pdf |
| Ledger Report | `js/analyticsUI.js` | ledger PDF export | html2pdf |
| Customer Statement | `js/analyticsUI.js` | statement PDF | html2pdf |
| Material Issue / Return | `js/deliveryUI.js` | material note PDF | html2pdf |
| Service Report | `js/reports.js` | service reports | html2pdf |
| AMC Report | `js/reports.js` | AMC export | html2pdf |
| Inventory Report | `js/reports.js` | inventory export | html2pdf |
| GST Reports | `js/reports.js` / analytics | GST PDF | html2pdf |
| Book Keeper Reports | `js/bookKeeperImport.js` etc. | export | varies |

## Deprecated (do not extend)

| Old file | Old function | Replacement |
|----------|--------------|-------------|
| `js/invoicePreviewLayout.js` | HTML page measure / printToPDF | `DocumentEngine` + pdfmake |
| `js/invoicePagePreview.js` | DOM page nav on HTML invoice | `DocumentPreview` |
| `main.js` | `invoice-preview-to-pdf`, `invoice-html-to-pdf` | pdfmake for invoices only |

## New engine API

```javascript
// Preview
await DocumentEngine.openPreview({ type: 'sales-invoice', id: invoiceId });

// Download / print (PDF bytes only)
await DocumentEngine.download({ type: 'sales-invoice', id: invoiceId });
await DocumentEngine.print({ type: 'sales-invoice', id: invoiceId });

// Unified export
await DocumentEngine.export({ type: 'sales-invoice', id: invoiceId, action: 'preview' | 'download' | 'print' });
```

## Per-type adapter checklist

For each legacy row above:

1. Add `core/document-engine/adapters/adapter*.js`
2. Register in `DocumentTemplates.register`
3. Implement `buildDocument`, `paginate`, `generatePdfBytes`, `renderPreview`
4. Point UI buttons to `DocumentEngine.export`
5. Remove legacy handler from `documentLegacyBridge.js`
6. Mark row **Native** in this table

## Success criteria (global)

- [x] Sales invoice: one pdfmake path for preview metrics, download, print
- [ ] All 22 document families on native adapters
- [ ] No `html2pdf` for migrated types
- [ ] No `window.print` on preview HTML for migrated types
- [ ] Preview page count matches pdfmake page count
- [ ] No footer-only pages, blank pages, or dark export borders
