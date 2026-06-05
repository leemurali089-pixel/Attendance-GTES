# Document Engine V4 — Layout Baselines

Capture **before** and **after** screenshots for each migrated document. Do not redesign layouts — baselines are the acceptance reference.

## Folder structure

```
docs/document-baselines/
  delivery-challan/
    legacy-preview.png
    v4-preview.png
    v4-print.png
    v4-pdf.png
  service-challan/
    ...
  purchase-invoice/
    ...
  purchase-order/
    ...
  quotation/
    ...
  proforma-invoice/
    ...
```

## Capture procedure (per document)

1. Open a **real customer record** (not empty demo data).
2. Screenshot **legacy preview** (html2pdf modal) before switching to V4 — save as `legacy-preview.png`.
3. Open **Document Engine V4** preview (`DocumentEngine.openPreview`).
4. Screenshot preview at **portrait** and **landscape** — save as `v4-preview-portrait.png`, `v4-preview-landscape.png`.
5. **Save PDF** and **Download PDF** — compare file visually to preview (`v4-save.pdf`, `v4-download.pdf`).
6. **Print** via Electron `printPdfBuffer` — capture output (`v4-print.png`).
7. Compare: Old Layout vs V4 Layout side-by-side.

## Phase 1 reference layouts

| Document | Legacy source | V4 engine |
|----------|---------------|-----------|
| Delivery Challan | `DeliveryUI.viewChallanLegacy` | `challanEngineV4.js` |
| Service Challan | Same template, `type === 'service'` | `challanEngineV4.js` |
| Purchase Invoice | `InvoicesUI.getPurchaseElement` | `purchaseEngineV4.js` |
| Purchase Order | Purchase Bill derivative (no legacy HTML) | `orderEngineV4.js` |
| Sales Quotation | Sales Invoice derivative | `estimateEngineV4.js` + `invoicePdfMakeV3.js` |
| Proforma Invoice | Sales Invoice derivative | `estimateEngineV4.js` + `invoicePdfMakeV3.js` |

## Notes

- PO / Quotation / Proforma had no printable HTML — V4 uses the **closest existing customer layout** (Purchase Bill / Tax Invoice) per Rule 1.
- Legacy engines remain as fallback until validation PASS (Rule 9).
