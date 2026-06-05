# Invoice Print vs Download PDF — Alignment Report

## Root cause (before fix)

| Aspect | Print (`window.print`) | Download (`printToPDF`) |
|--------|------------------------|-------------------------|
| `@page` margin | **8mm** (`style.css` + `gtes-invoice` padding 8mm on root) | **0mm** (`_printStyles` `@page margin: 0`) |
| Body padding | 0 (padding on `.gtes-invoice-print-root`) | **0** (default `marginPreset: none`) |
| Electron `printToPDF` margins | N/A | **`marginType: 'none'`** (no CSS parity) |
| Short invoice layout | Balanced top inset | Content **top-aligned** on full **297mm** page → large **bottom gap** |
| Vertical alignment | ~8mm visual top margin | No centering → signature/footer **higher** on page |

Print and download used **two CSS paths** (`style.css` vs `invoicePdfEngine._printStyles`).

## Unified metrics (after fix)

All paths use **`InvoicePreviewLayout`** (`js/invoicePreviewLayout.js`):

| Metric | A4 (default) |
|--------|----------------|
| Page size | 210 × 297 mm |
| `@page` margin | **8mm** all sides (`marginPreset: normal`) |
| Printable area | **194 × 281 mm** |
| Content width | **100%** of printable (no extra 702px cap) |
| Root padding | **0** (margins only via `@page`) |
| Short page | `min-height: printable area` + **flex center** (print + export) |

Presets:

| Preset | `@page` margin |
|--------|----------------|
| none | 0 mm |
| narrow | 5 mm |
| normal | 8 mm (default) |

## `printToPDF` vs browser print

- **Browser print:** Chromium applies `@page { margin: 8mm }` from injected `#gtes-invoice-layout-print`.
- **Download:** Same HTML via `InvoicePreviewLayout.buildExportHtmlDocument()` with identical `@page` rules.
- **`printToPDF`:** `margins: { marginType: 'none' }` + `preferCSSPageSize: true` so **only CSS `@page`** defines margins (no double 8mm).

## Files

| File | Role |
|------|------|
| `js/invoicePreviewLayout.js` | Single layout engine |
| `js/invoicePdfEngine.js` | Preview / print / download orchestration |
| `main.js` | `invoice-html-to-pdf` loads shared HTML, measures content |
| `css/style.css` | Modal print chrome only; invoice metrics in JS |
| `index.html` | Scripts + default margin **Normal (8mm)** |

## Verification

1. Hard refresh (`Ctrl+Shift+R`).
2. Open invoice → Preview.
3. **Print** → Save as PDF from dialog.
4. **Download PDF** from toolbar.
5. Compare: margins, header position, totals, signatory, footer.

Optional: DevTools → `InvoicePreviewLayout.getPageMetrics(InvoicePdfEngine.getSettings())`.

## Screenshots (capture locally)

| File | Description |
|------|-------------|
| `docs/screenshots/invoice-print-before.png` | Print PDF (reference) |
| `docs/screenshots/invoice-download-before.png` | Download before alignment |
| `docs/screenshots/invoice-download-after.png` | Download after alignment |

Target: **pixel-identical** layout at 100% scale, Normal (8mm) margins.
