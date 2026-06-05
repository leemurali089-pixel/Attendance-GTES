/**
 * Universal Document Engine V3 — pdfmake PDF generation (single path for preview/print/download).
 */
const DocumentPdfGenerator = {
    async generatePdfBytes(doc, adapter, settings) {
        const log = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.toLog(settings, doc?.copyType)
            : settings;
        console.log('[DocumentPdfGenerator] generatePdfBytes', log);
        if (adapter?.generatePdfBytes) {
            return adapter.generatePdfBytes(doc, settings);
        }
        if (typeof InvoicePdfMakeV3 !== 'undefined' && doc?.invoice) {
            return InvoicePdfMakeV3.generatePdfBytes(doc, settings);
        }
        throw new Error('No PDF builder registered for this document type');
    },

    async countPdfPages(doc, adapter, settings) {
        try {
            const bytes = await this.generatePdfBytes(doc, adapter, settings);
            const text = new TextDecoder('latin1').decode(bytes);
            const m = text.match(/\/Type\s*\/Page\b(?!s)/g);
            return m ? m.length : 1;
        } catch (_) {
            return 0;
        }
    },

    bytesToBase64(bytes) {
        let pdfBase64 = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
            pdfBase64 += btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
        }
        return pdfBase64;
    }
};

window.DocumentPdfGenerator = DocumentPdfGenerator;
