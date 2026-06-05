# Document Engine V3 — Toolbar Bindings

| Control | Handler | File | Line |
|---------|---------|------|------|
| Scale Input (`#gtesInvSetScale`) | `DocumentEngine._onToolbarSettingsChanged` | `core/document-engine/documentToolbar.js` | 28–35 |
| Page Size (`#gtesInvSetPageSize`) | `DocumentEngine._onToolbarSettingsChanged` | `core/document-engine/documentToolbar.js` | 24 |
| Margins (`#gtesInvSetMargin`) | `DocumentEngine._onToolbarSettingsChanged` | `core/document-engine/documentToolbar.js` | 25 |
| Orientation (`#gtesInvSetOrientation`) | `DocumentEngine._onToolbarSettingsChanged` | `core/document-engine/documentToolbar.js` | 24 |
| Copy (`#gtesInvSetCopyType`) | `DocumentEngine._onCopyTypeChanged` | `core/document-engine/documentToolbar.js` | 38 |
| Print (`#pdfPrintBtn`) | `DocumentEngine._handlePrint` → `print()` | `core/document-engine/documentToolbar.js` | 44 |
| Save PDF (`#pdfSaveAsPdfBtn`) | `DocumentEngine._handleSavePdf` → `download()` | `core/document-engine/documentToolbar.js` | 52 |
| Download (`#pdfDownloadBtn`) | `DocumentEngine._handleDownload` → `download()` | `core/document-engine/documentToolbar.js` | 60 |

## Settings flow

1. `DocumentSettings.readFromUi()` — reads toolbar values (`documentSettings.js` ~67)
2. `DocumentSettings.save()` — persists to `localStorage`
3. `DocumentEngine._refreshPreview()` — rebuilds layout + re-renders (`documentEngine.js` ~155)
4. `InvoiceLayoutV3.paginate(doc, settings)` — page count from margin/size/scale
5. `InvoicePreviewV3._applyPageSettings()` — visual margin + scale on preview

## PDF / print flow

1. `DocumentEngine._prefetchPdf()` — generates bytes after preview (`documentEngine.js` ~185)
2. `InvoicePdfMakeV3.generatePdfBytes(doc, settings)` — pdfmake with matching margins/page size
3. `DocumentPrintManager.download()` — `electronAPI.savePdf` + browser download (`documentPrintManager.js` ~5)
4. `DocumentPrintManager.print()` — `electronAPI.printPdfBuffer` (`documentPrintManager.js` ~24)

## Debug footer

`#gtesDocumentEngineDebugFooter` — updated by `DocumentEngine._updateDebugPanel()` on every refresh/PDF prefetch.
