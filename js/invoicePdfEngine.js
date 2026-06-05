/**

 * Invoice export facade — delegates to Universal Document Engine V3 (sales-invoice).

 */

const InvoicePdfEngine = {

    COPY_TYPES: DocumentSettings.COPY_TYPES,



    getCopyType(invoiceId) {

        return InvoiceEngineV3.getCopyType(invoiceId);

    },



    async setCopyType(invoiceId, copyType) {

        return InvoiceEngineV3.setCopyType(invoiceId, copyType);

    },



    formatCopyTypeLine(copyType) {

        return InvoiceEngineV3.formatCopyTypeLine(copyType);

    },



    getSettings() {

        return DocumentSettings.get(DocumentTemplates.get('sales-invoice'));

    },



    saveSettings(s) {

        DocumentSettings.save(DocumentTemplates.get('sales-invoice'), s);

    },



    openPreview(invoiceId) {

        return DocumentEngine.openSalesInvoicePreview(invoiceId);

    },



    exportInvoice(invoiceId, opts) {

        return DocumentEngine.export({ type: 'sales-invoice', id: invoiceId, action: opts?.action });

    },



    downloadPdf(invoiceId) {

        return DocumentEngine.download({ type: 'sales-invoice', id: invoiceId });

    },



    printHtmlPreview(invoiceId) {

        return DocumentEngine.print({ type: 'sales-invoice', id: invoiceId });

    },



    _setHtmlPreviewMode() { /* DocumentEngine handles preview mode */ }

};



window.InvoicePdfEngine = InvoicePdfEngine;

