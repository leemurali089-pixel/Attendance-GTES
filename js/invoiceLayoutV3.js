/**
 * Invoice Engine V3 — page model, splitting rules, diagnostics.
 */
const InvoiceLayoutV3 = {
    PAGE_W_MM: 210,
    PAGE_H_MM: 297,
    MARGIN_MM: 8,
    MM_TO_PT: 2.834645669291,

    get printableHeightPt() {
        const pageH = this.PAGE_H_MM * this.MM_TO_PT;
        const margins = this.MARGIN_MM * 2 * this.MM_TO_PT;
        return pageH - margins;
    },

    BLOCK_PT: {
        header: 118,
        invoiceMeta: 68,
        customer: 108,
        shipTo: 0,
        tableHeader: 28,
        itemRowBase: 18,
        itemDescLine: 10,
        closingBlock: 178
    },

    _itemRowHeight(item) {
        const lines = item.desc ? Math.min(3, Math.ceil(item.desc.length / 55)) : 0;
        return this.BLOCK_PT.itemRowBase + lines * this.BLOCK_PT.itemDescLine;
    },

    _resolveMetrics(settings = {}) {
        const dims = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.pageDimensionsMm(settings)
            : { w: this.PAGE_W_MM, h: this.PAGE_H_MM };
        const marginMm = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.marginMm(settings.marginPreset || 'normal')
            : this.MARGIN_MM;
        const scale = ((settings.scale || 100) / 100);
        const printableHeightPt = ((dims.h - marginMm * 2) * this.MM_TO_PT) / scale;
        return { dims, marginMm, scale, printableHeightPt };
    },

    paginate(doc, settings = {}) {
        const { dims, marginMm, scale, printableHeightPt } = this._resolveMetrics(settings);
        const PH = printableHeightPt;
        const H = this.BLOCK_PT;
        const prefixH = H.header + H.invoiceMeta + H.customer;
        const closingH = H.closingBlock + (doc.meta?.isDc ? 28 : 0);

        doc.items.forEach((item) => {
            item.rowHeightPt = this._itemRowHeight(item);
        });

        const pages = [];
        let pageNum = 0;
        let used = 0;
        let itemBuffer = [];

        const pushPage = (opts) => {
            pageNum += 1;
            pages.push({
                pageNumber: pageNum,
                includePrefix: !!opts.includePrefix,
                itemRows: opts.itemRows || [],
                includeClosing: !!opts.includeClosing
            });
        };

        pushPage({ includePrefix: true, itemRows: [] });
        used = prefixH;

        const flushItemsToPage = () => {
            const last = pages[pages.length - 1];
            last.itemRows = itemBuffer.slice();
            itemBuffer = [];
        };

        const startItemOnlyPage = () => {
            if (itemBuffer.length) flushItemsToPage();
            pushPage({ includePrefix: false, itemRows: [] });
            used = 0;
        };

        for (let i = 0; i < doc.items.length; i++) {
            const item = doc.items[i];
            const rowH = item.rowHeightPt;
            const headerCost = itemBuffer.length === 0 ? H.tableHeader : 0;
            const need = headerCost + rowH;

            if (used + need > PH) {
                if (itemBuffer.length) {
                    flushItemsToPage();
                    startItemOnlyPage();
                    used = H.tableHeader + rowH;
                    itemBuffer = [item];
                } else {
                    startItemOnlyPage();
                    used = H.tableHeader + rowH;
                    itemBuffer = [item];
                }
            } else {
                used += need;
                itemBuffer.push(item);
            }
        }
        if (itemBuffer.length) flushItemsToPage();

        const last = pages[pages.length - 1];
        const usedEstimate = last.includePrefix
            ? prefixH + H.tableHeader + last.itemRows.reduce((s, r) => s + r.rowHeightPt, 0)
            : H.tableHeader + last.itemRows.reduce((s, r) => s + r.rowHeightPt, 0);

        if (usedEstimate + closingH > PH && last.itemRows.length) {
            pushPage({ includePrefix: false, itemRows: [], includeClosing: true });
        } else {
            last.includeClosing = true;
        }

        const rowsPerPage = pages.map((p) => p.itemRows.length);
        const contentHeightPt = pages.length * PH;

        const copyTypes = doc.copyTypes?.length
            ? DocumentSettings.normalizeCopyTypes(doc.copyTypes)
            : DocumentSettings.normalizeCopyTypes([doc.copyType || 'original']);
        const expanded = [];
        let expandedPageNum = 0;
        copyTypes.forEach((copyType) => {
            const copyLabel = copyType === 'none'
                ? ''
                : (typeof DocumentSettings !== 'undefined'
                    ? DocumentSettings.copyLabelUpper(copyType)
                    : String(copyType).toUpperCase());
            pages.forEach((bp) => {
                expandedPageNum += 1;
                expanded.push({
                    ...bp,
                    pageNumber: expandedPageNum,
                    copyType,
                    copyLabel
                });
            });
        });

        const diagnostics = {
            contentHeightPt: Math.round(contentHeightPt),
            printableHeightPt: Math.round(PH),
            pagesRequired: expanded.length,
            contentPagesPerCopy: pages.length,
            copyTypes,
            rowsPerPage,
            footerHeightPt: closingH,
            totalsHeightPt: 72,
            headerHeightPt: H.header,
            pageWidthMm: dims.w,
            pageHeightMm: dims.h,
            marginMm,
            scale: Math.round((scale || 1) * 100)
        };

        return { pages: expanded, diagnostics, doc: { ...doc, copyTypes }, settings };
    }
};

window.InvoiceLayoutV3 = InvoiceLayoutV3;
