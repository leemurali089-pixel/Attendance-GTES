# Universal Document Engine V3

GTES / MJS PrimeLogic uses one document pipeline for preview, PDF, print, and download.

## Architecture

```
/core/document-engine/
  documentEngine.js          — orchestrator (openPreview, download, print, export)
  documentPreview.js         — A4 preview, page nav, IntersectionObserver
  documentPdfGenerator.js    — pdfmake bytes (shared with print/download)
  documentPrintManager.js    — Electron printPdfBuffer + file download
  documentTemplates.js       — document type registry
  documentDiagnostics.js     — layout debug panel
  documentSettings.js        — page size, orientation, margins, scale, copy types
  documentLegacyBridge.js    — unmigrated types → legacy HTML/html2pdf
  adapters/
    adapterSalesInvoice.js   — native pdfmake sales invoice
```

## Flow

```
Data (adapter.buildDocument)
  → Layout (adapter.paginate / DocumentLayout)
  → Preview (adapter.renderPreview / DocumentPreview)
  → PDF (DocumentPdfGenerator → pdfmake)
  → Print / Download (DocumentPrintManager — never raw HTML)
```

## Sales invoice (migrated)

- Entry: `DocumentEngine.openPreview({ type: 'sales-invoice', id })`
- Facades: `InvoicePdfEngine`, `InvoiceEngineV3`, `DeliveryUI.viewInvoice`
- PDF: `InvoicePdfMakeV3` via `adapterSalesInvoice`
- Preview: `InvoicePreviewV3` page model aligned with layout rules

## Diagnostics

Enable with either:

- `localStorage.setItem('gtes_document_engine_diagnostics', '1')`
- URL `?docDiagnostics=1`

## Adding a new document type

1. Create `core/document-engine/adapters/adapterYourType.js`
2. `DocumentTemplates.register('your-type', { buildDocument, paginate, generatePdfBytes, renderPreview, ... })`
3. Load the script in `index.html` after `documentTemplates.js`
4. Call `DocumentEngine.openPreview({ type: 'your-type', id })`
5. Remove the matching handler from `documentLegacyBridge.js`

See [DOCUMENT_ENGINE_V3_MIGRATION.md](./DOCUMENT_ENGINE_V3_MIGRATION.md) for the full legacy → engine mapping.
