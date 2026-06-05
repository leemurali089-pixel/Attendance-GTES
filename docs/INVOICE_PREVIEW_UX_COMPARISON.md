# GTES Invoice Preview — UX Comparison & Measurements

## Measured widths (96 CSS px/in)

| Reference | mm | px (approx.) |
|-----------|-----|--------------|
| A4 page width | 210 | **794** |
| A4 printable (margin 0) | 210 | **794** |
| A4 content (8mm padding each side) | 194 | **733** |
| Legacy `702px` cap | — | **702** (88% of A4) |
| US Letter width | 215.9 | **816** |

## Why PDF.js looked ~60% width

| Factor | Effect |
|--------|--------|
| Default **Fit Page** | `scale = min(viewportW/pageW, viewportH/pageH)` — height limit wins on wide screens → page shrinks horizontally |
| Grey viewport `#525659` | Full modal width; canvas only ~60% centered → large empty right area |
| Rasterized canvas | Second layout pass; blur + wrong scale vs HTML |
| `max-width: min(702px, 210mm)` | Capped below full A4 on large monitors |

**Example (1400×900 viewport, Fit Page):**

- Page at scale 1: 794×1123 px  
- Scale = min(1376/794, 876/1123) ≈ **0.78**  
- Displayed width ≈ **620 px** → **44%** of viewport (matches “small invoice + grey” report)

## Three approaches compared

### 1. HTML preview (recommended)

| Criteria | Rating |
|----------|--------|
| Layout fidelity | **Best** — same DOM as print |
| Full A4 width | **Yes** — `min(210mm, 92vw)` container, content `width: 100%` |
| Grey waste | **Low** — ~4% side gutter |
| Print preview | **Native Chromium** — full preview, scale, margins |
| Download PDF | `printToPDF` from same HTML (Electron) |
| Daily ERP UX | **Best** — instant open, no rasterize wait |

### 2. Browser / Electron print preview

| Criteria | Rating |
|----------|--------|
| Layout fidelity | **Best** (reference) |
| Full A4 width | **Yes** with `@page margin: 0` + 210mm body |
| Use case | **Print** and “Save as PDF” from dialog |
| Daily UX | Open from HTML preview → **Print** button |

### 3. PDF.js viewer (removed)

| Criteria | Rating |
|----------|--------|
| Layout fidelity | Good for PDFs; **worse** for live HTML invoices |
| Full A4 width | **No** unless user hits Fit Width every time |
| Grey waste | **High** |
| Print | Separate PDF print path; no HTML preview |
| Daily UX | **Poor** for invoice editing workflow |

## Recommendation (professional ERP)

**Use HTML-first preview + Chromium print for printing + `printToPDF` only for file download.**

- **Preview:** HTML in `#pdfPreviewContainer` (WYSIWYG).  
- **Print:** `DeliveryUI.nativePrint()` → system dialog with live preview.  
- **Download:** `InvoicePdfEngine.downloadPdf()` → one `printToPDF` from identical HTML.  
- **Do not use PDF.js** for invoice screen preview.

## Current implementation (v2 engine)

- PDF.js **removed** from `index.html`.  
- `invoicePdfEngine.js` v2: HTML preview only.  
- CSS `gtes-invoice-html-mode`: sheet `min(210mm, 92vw)`, centered, light grey `#e5e5e5`.  
- Off-screen PDF window **794×1123** px for accurate A4 capture.

## Visual reference (ASCII)

**PDF.js (old):**

```
|<<<< grey 40% >>>>|<< invoice 60% >>|<<<< grey >>>>|
```

**HTML preview (new):**

```
|<<g>>|<<<<<<<< invoice 92% vw >>>>>>>>|<<g>>|
```

## Screenshots

Capture locally after reload:

1. **Current (before):** restore PDF.js branch → screenshot modal.  
2. **Proposed:** `npm start` → View invoice → screenshot modal.  
3. **Print preview:** Print → screenshot Chromium dialog.

Files: `docs/screenshots/invoice-pdfjs-old.png`, `invoice-html-new.png`, `invoice-print-dialog.png`.
