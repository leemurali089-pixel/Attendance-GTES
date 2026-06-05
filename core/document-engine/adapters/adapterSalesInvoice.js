/**
 * Document Engine V3 — Sales Invoice native adapter (pdfmake + shared page model).
 */
(function registerSalesInvoiceAdapter() {
    if (typeof DocumentTemplates === 'undefined') return;

    const TYPE = 'sales-invoice';

    DocumentTemplates.register(TYPE, {
        type: TYPE,
        label: 'Sales Invoice',
        supportsCopyType: true,
        copyTypeKey: 'gtes_invoice_copy_by_id',
        settingsKey: 'gtes_invoice_pdf_settings',
        subfolder: 'Invoices',

        getCopyTypes(invoiceId) {
            try {
                const map = JSON.parse(localStorage.getItem(this.copyTypeKey) || '{}');
                const entry = map[String(invoiceId)];
                if (entry) {
                    return DocumentSettings.normalizeCopyTypes(entry);
                }
            } catch (_) { /* ignore */ }
            const inv = typeof InvoiceManager !== 'undefined' ? InvoiceManager.getInvoice(invoiceId) : null;
            if (inv?.copyTypes) return DocumentSettings.normalizeCopyTypes(inv.copyTypes);
            if (inv?.copyType) return DocumentSettings.normalizeCopyTypes([inv.copyType]);
            return ['original'];
        },

        getCopyType(invoiceId) {
            return this.getCopyTypes(invoiceId)[0] || 'original';
        },

        async setCopyTypes(invoiceId, copyTypes) {
            const values = DocumentSettings.normalizeCopyTypes(copyTypes);
            try {
                const map = JSON.parse(localStorage.getItem(this.copyTypeKey) || '{}');
                map[String(invoiceId)] = values;
                localStorage.setItem(this.copyTypeKey, JSON.stringify(map));
            } catch (_) { /* ignore */ }
            if (typeof InvoiceManager !== 'undefined' && InvoiceManager.updateInvoice) {
                try {
                    await InvoiceManager.updateInvoice(invoiceId, {
                        copyTypes: values,
                        copyType: values[0]
                    });
                } catch (e) {
                    console.warn('[adapterSalesInvoice] copyTypes save:', e);
                }
            }
        },

        async setCopyType(invoiceId, copyType) {
            return this.setCopyTypes(invoiceId, [copyType || 'original']);
        },

        async getEntity(id) {
            return typeof InvoiceManager !== 'undefined' ? InvoiceManager.getInvoice(id) : null;
        },

        getTitle(entity) {
            return `Invoice — ${entity?.invoiceNo || entity?.id || ''}`;
        },

        getSubtitle(entity) {
            return entity?.customerName || '';
        },

        getFilename(entity) {
            const id = entity?.invoiceNo || entity?.id || 'invoice';
            return `Invoice_${String(id).replace(/[^\w.-]+/g, '_')}.pdf`;
        },

        async buildDocument(id, settings) {
            const doc = await InvoiceDataV3.build(id);
            if (!doc) return null;
            const modalOpen = document.getElementById('pdfPreviewModal')?.classList.contains('show');
            doc.copyTypes = DocumentSettings.resolveCopyTypes(this, id, modalOpen);
            doc.copyType = doc.copyTypes[0] || 'original';
            doc.copyLabel = InvoiceDataV3.copyLabel(doc.copyType);
            return doc;
        },

        paginate(doc, settings) {
            return InvoiceLayoutV3.paginate(doc, settings || {});
        },

        renderPreview(layout) {
            const host = typeof DocumentPreview !== 'undefined' && DocumentPreview._stageEl
                ? DocumentPreview._stageEl()
                : (document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage'));
            return InvoicePreviewV3.render(layout, host);
        },

        async generatePdfBytes(doc, settings) {
            return InvoicePdfMakeV3.generatePdfBytes(doc, settings || {});
        }
    });
})();
