# Document Engine V4 — Phase 1 Validation Report

**Date:** 2026-06-05  
**PDF byte version:** `2.0`  
**Master reference:** GST Sales Invoice V3 (`adapterSalesInvoice` + `invoicePdfMakeV3.js`)

## Architecture compliance

| Rule | Status |
|------|--------|
| R1 — No layout redesign | PASS — V4 clones legacy HTML structures |
| R2 — Reusable block system | PASS — `documentBlocks.js`, `documentPdfBase.js` |
| R3 — Preview/Print/Save/Download/Orientation/Scale/Margins/Copy/Pages | IMPLEMENTED — manual UI verification required |
| R4 — Single pdfmake definition | PASS — preview mirrors page model; PDF from same adapter |
| R5 — Fixed columns, noWrap numerics | PASS — percent widths, `noWrap: true` on amounts |
| R6 — Baselines folder | PASS — `docs/document-baselines/` |
| R7 — Phase 1 order | PASS — all six types registered |
| R8 — Validation report | THIS DOCUMENT |
| R9 — Legacy fallback retained | PASS — `viewChallanLegacy`, `getPurchaseElement` html2pdf path |

## Per-document status

| Document | Native adapter | Preview | Print | Save PDF | Download | Orientation | Scale | Margins | Copy types | Page count | Overall |
|----------|----------------|---------|-------|----------|----------|-------------|-------|---------|------------|------------|---------|
| Delivery Challan | `adapterPhase1` | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | **PENDING** |
| Service Challan | `adapterPhase1` | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | **PENDING** |
| Purchase Invoice | `adapterPhase1` | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | **PENDING** |
| Purchase Order | `adapterPhase1` | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | **PENDING** |
| Sales Quotation | `adapterPhase1` | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | N/A | PENDING* | **PENDING** |
| Proforma Invoice | `adapterPhase1` | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | PENDING* | **PENDING** |

\* *Requires Electron restart + hard refresh, then operator sign-off with baseline screenshots.*

## How to verify (checklist)

1. Restart Electron app completely.
2. Hard-refresh renderer (close/reopen preview modal clears PDF cache).
3. For each document type, open via:
   - **Challan:** Delivery → View Details
   - **Purchase:** Invoices → Purchase → View
   - **PO:** `DocumentEngine.openPreview({ type: 'purchase-order', id: '<PO_ID>' })` from console
   - **Quotation / Proforma:** `DocumentEngine.openPreview({ type: 'quotation'|'proforma-invoice', id: '<EST_ID>' })` after BookKeeper estimate import
4. Toggle toolbar: Portrait / Landscape, margins, scale 50–150%.
5. Multi-select copy types (where supported) — confirm extra full pages.
6. Save PDF, Download PDF, Print — all must match preview pixel-for-pixel (within pdfmake font metrics).
7. Mark each row PASS/FAIL in this file after sign-off.

## Files added (Phase 1)

- `core/document-engine/documentPdfBase.js`
- `core/document-engine/documentBuildCommon.js`
- `core/document-engine/documentBlocks.js`
- `core/document-engine/documentPaginate.js`
- `core/document-engine/adapterBase.js`
- `core/document-engine/adapters/adapterPhase1.js`
- `js/challanEngineV4.js`
- `js/purchaseEngineV4.js`
- `js/orderEngineV4.js`
- `js/estimateEngineV4.js`

## UI wiring

- `DeliveryUI.viewChallan` → `DocumentEngine.openPreview` (fallback: `viewChallanLegacy`)
- `DeliveryUI.viewPurchaseDetails` → `DocumentEngine.openPreview` (fallback: html2pdf modal)
- Legacy html2pdf / `printChallan` / `downloadPurchasePdf` **unchanged** as fallback

## Known limitations

- **Purchase Order / Quotation / Proforma** had no legacy printable HTML; layout follows Purchase Bill / Tax Invoice structure.
- **Estimates store** may be empty until BookKeeper import — use `EstimateManager` records for quotation/proforma tests.
- **PO data** reads `gtes_purchase_orders` or `orders` key — verify DataManager sync maps `Data/orders.json`.
