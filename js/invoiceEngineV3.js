/**
 * Invoice Engine V3 — facade over Universal Document Engine (sales-invoice).
 * @deprecated Direct use of DocumentEngine is preferred for new code.
 */
const InvoiceEngineV3 = {
    COPY_TYPE_KEY: 'gtes_invoice_copy_by_id',
    SETTINGS_KEY: 'gtes_invoice_pdf_settings',
    COPY_TYPES: DocumentSettings.COPY_TYPES,

    getCopyType(invoiceId) {
        const adapter = DocumentTemplates.get('sales-invoice');
        return adapter?.getCopyType(invoiceId) ?? 'original';
    },

    setCopyType(invoiceId, copyType) {
        const adapter = DocumentTemplates.get('sales-invoice');
        return adapter?.setCopyType(invoiceId, copyType);
    },

    formatCopyTypeLine(copyType) {
        return DocumentSettings.formatCopyLine(copyType);
    },

    buildPackage(invoiceId) {
        return DocumentEngine.buildPackage('sales-invoice', invoiceId);
    },

    generatePdfBytes(invoiceId) {
        return DocumentEngine.generatePdfBytes('sales-invoice', invoiceId);
    },

    openPreview(invoiceId) {
        return DocumentEngine.openPreview({ type: 'sales-invoice', id: invoiceId });
    },

    downloadPdf(invoiceId) {
        return DocumentEngine.download({ type: 'sales-invoice', id: invoiceId });
    },

    printPdf(invoiceId) {
        return DocumentEngine.print({ type: 'sales-invoice', id: invoiceId });
    },

    exportInvoice(invoiceId, opts = {}) {
        return DocumentEngine.export({ type: 'sales-invoice', id: invoiceId, action: opts.action });
    }
};

window.InvoiceEngineV3 = InvoiceEngineV3;
window.USE_INVOICE_ENGINE_V3 = true;
