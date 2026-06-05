/**
 * Universal Document Engine V3 — pagination via registered adapter.
 */
const DocumentLayout = {
    MM_TO_PT: 2.834645669291,

    paginate(doc, adapter, settings) {
        if (adapter?.paginate) return adapter.paginate(doc, settings);
        if (typeof InvoiceLayoutV3 !== 'undefined' && doc?.items) {
            return InvoiceLayoutV3.paginate(doc, settings);
        }
        return {
            pages: [{ pageNumber: 1, includePrefix: true, itemRows: doc?.items || [], includeClosing: true }],
            diagnostics: { pagesRequired: 1, printableHeightPt: 0, contentHeightPt: 0 },
            doc
        };
    },

    printableHeightPt(settings) {
        const dims = DocumentSettings.pageDimensionsMm(settings || DocumentSettings.defaults());
        const marginMm = DocumentSettings.marginMm(
            (settings || {}).marginPreset || 'normal'
        );
        const pageH = dims.h * this.MM_TO_PT;
        const margins = marginMm * 2 * this.MM_TO_PT;
        return pageH - margins;
    }
};

window.DocumentLayout = DocumentLayout;
