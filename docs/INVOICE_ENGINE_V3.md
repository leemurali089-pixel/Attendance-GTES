# GTES Invoice Engine V3

Professional ERP-grade invoice pipeline: one **pdfmake** document definition for Preview metrics, Print, Save PDF, and Download PDF. No html2pdf, PDF.js viewer, DOM screenshot, or `window.print()` on HTML.

## File tree (new)

```
templates/
  invoice-template-v3.html      # Reference skeleton (semantic tables)

css/
  invoice-v3.css                # Preview-only chrome (grey workspace, A4 frames)

js/
  invoiceDataV3.js              # Invoice → normalized document
  invoiceLayoutV3.js            # Page model + splitting rules + diagnostics
  invoicePdfMakeV3.js           # pdfmake document definition + PDF bytes
  invoicePreviewV3.js           # A4 HTML preview from page model
  invoiceEngineV3.js            # Orchestrator (preview / print / download)
  invoicePdfEngine.js           # Facade → InvoiceEngineV3 (backward compatible API)

docs/
  INVOICE_ENGINE_V3.md          # This document
```

## Files deprecated (do not extend)

| File | Status |
|------|--------|
| `js/invoicePreviewLayout.js` | Deprecated — HTML/CSS print engine |
| `js/invoicePagePreview.js` | Deprecated — DOM slice preview |
| `js/invoicePdfEngine.js` (old body) | Replaced by V3 facade |

Still loaded: **none** of the above in `index.html` after migration.

## Commands

```bash
cd "d:\Attendance GTES TRAIL"
npm install pdfmake --save
npm start
```

Hard-refresh the app after pull (Ctrl+Shift+R).

## Architecture

```
InvoiceDataV3.build(invoiceId)
        ↓
InvoiceLayoutV3.paginate(doc)     → preview pages + diagnostics
        ↓
InvoicePreviewV3.render()         → A4 HTML (210×297mm, table layout)
InvoicePdfMakeV3.generatePdfBytes() → same business content for PDF
        ↓
Electron savePdf / printPdfBuffer
```

## Page splitting rules (V3)

1. Header — never split (fixed block on first page).
2. Invoice + customer blocks — never split.
3. Only **item rows** may continue on the next page.
4. **Totals + terms + bank + signature** — single unbreakable block in pdfmake (`unbreakable: true`).
5. If closing block does not fit remainder → new page (layout model); pdfmake enforces via unbreakable footer stack.
6. No page with signature only.

## Copy types

Toolbar dropdown → persisted per invoice (`localStorage` + `InvoiceManager.updateInvoice({ copyType })`).

Shown under title as `(ORIGINAL)`, `(DUPLICATE)`, etc. in preview HTML and pdfmake PDF.

## Layout diagnostics

Panel `#gtesInvoiceV3Diagnostics` shows:

- Content Height (pt)
- Printable Height (pt)
- Pages Required
- Rows per page
- Footer / Totals heights

PDF page count from pdfmake is logged when it differs from HTML page model.

## Print

**Not** `window.print()` on HTML.

Uses `electronAPI.printPdfBuffer` with the **same pdfmake bytes** as download.

## Migration plan

### Phase 1 — Done
- Template + data + layout + pdfmake + preview + facade wiring.

### Phase 2 — Optional cleanup
- Remove unused `invoice-preview-to-pdf` IPC from UI paths (keep IPC for vouchers if needed).
- Remove copy-type HTML from `invoicesUI.getInvoiceElement` (legacy DOM PDF) when DOM export is fully retired.

### Phase 3 — Purchase bills
- Extend `InvoiceDataV3` / `InvoicePdfMakeV3` for purchase documents.

## Performance comparison (expected)

| Engine | Preview | PDF | Parity |
|--------|---------|-----|--------|
| V1 HTML + printToPDF | DOM | Chromium layout | Poor |
| V2 Paginated DOM | Sliced HTML | Chromium layout | Poor |
| **V3 pdfmake** | Table HTML model | pdfmake | **Single definition** |

pdfmake generation: ~50–200 ms typical invoice in Electron renderer.

## Screenshots

Capture manually after `npm start`:

1. Invoice preview — Page 1 of N with grey workspace.
2. Downloaded PDF — white page, no dark border.
3. Diagnostics bar visible under toolbar.

## Troubleshooting

- **pdfmake is not loaded** — run `npm install pdfmake`, verify scripts in `index.html`.
- **Blank PDF** — check DevTools console for `InvoiceEngineV3` errors.
- **Font** — uses Roboto from `vfs_fonts.js` (bundled with pdfmake).
