/**
 * Shared PDF preview modal — keeps engine stages and legacy HTML previews isolated.
 */
const DocumentPreviewHost = {
    CONTAINER_ID: 'pdfPreviewContainer',
    LEGACY_STAGE_ID: 'gtesPdfLegacyStage',

    STAGE_IDS: [
        'gtesDocumentEngineStage',
        'gtesInvoiceV3Stage',
        'gtesInvoiceMeasureHost',
        'gtesInvoicePrintSource',
        'gtesInvoicePagesStage',
        'gtesPdfLegacyStage'
    ],

    container() {
        return document.getElementById(this.CONTAINER_ID);
    },

    ensure() {
        const container = this.container();
        if (!container) return null;

        const defaults = {
            gtesDocumentEngineStage: 'd-none',
            gtesInvoiceV3Stage: 'd-none',
            gtesInvoiceMeasureHost: 'gtes-invoice-measure-host d-none',
            gtesInvoicePrintSource: 'gtes-invoice-print-source d-none',
            gtesInvoicePagesStage: 'gtes-invoice-pages-stage d-none',
            gtesPdfLegacyStage: 'gtes-pdf-legacy-stage d-none'
        };

        this.STAGE_IDS.forEach((id) => {
            if (!document.getElementById(id)) {
                const el = document.createElement('div');
                el.id = id;
                el.className = defaults[id] || 'd-none';
                if (id === 'gtesInvoiceMeasureHost' || id === 'gtesInvoicePrintSource') {
                    el.setAttribute('aria-hidden', 'true');
                }
                container.appendChild(el);
            }
        });

        return container;
    },

    clearLegacy() {
        this.ensure();
        const legacy = document.getElementById(this.LEGACY_STAGE_ID);
        if (legacy) {
            legacy.innerHTML = '';
            legacy.classList.add('d-none');
        }
        this.container()?.querySelectorAll(':scope > .gtes-pdf-document').forEach((node) => node.remove());
    },

    prepareLegacy() {
        this.ensure();
        this.clearLegacy();
        const legacy = document.getElementById(this.LEGACY_STAGE_ID);
        if (legacy) {
            legacy.classList.remove('d-none');
            return legacy;
        }
        const container = this.container();
        if (!container) return null;
        const fallback = document.createElement('div');
        fallback.id = this.LEGACY_STAGE_ID;
        fallback.className = 'gtes-pdf-legacy-stage';
        container.appendChild(fallback);
        return fallback;
    },

    prepareEngine() {
        this.ensure();
        this.clearLegacy();
        const engine = document.getElementById('gtesDocumentEngineStage')
            || document.getElementById('gtesInvoiceV3Stage');
        if (engine) engine.innerHTML = '';
        return engine;
    }
};

window.DocumentPreviewHost = DocumentPreviewHost;
