/**
 * Document Engine V4 — generic page model + copy-type expansion.
 */
const DocumentPaginate = {
    MM_TO_PT: 2.834645669291,

    paginate(doc, settings = {}, blockHeights = {}) {
        const H = {
            header: blockHeights.header ?? 118,
            prefix: blockHeights.prefix ?? 68,
            party: blockHeights.party ?? 108,
            extra: blockHeights.extra ?? 0,
            tableHeader: blockHeights.tableHeader ?? 28,
            itemRowBase: blockHeights.itemRowBase ?? 18,
            itemDescLine: blockHeights.itemDescLine ?? 10,
            closing: blockHeights.closing ?? 178
        };

        const dims = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.pageDimensionsMm(settings)
            : { w: 210, h: 297 };
        const marginMm = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.marginMm(settings.marginPreset || 'normal')
            : 8;
        const scale = ((settings.scale || 100) / 100);
        const PH = ((dims.h - marginMm * 2) * this.MM_TO_PT) / scale;

        const items = doc.items || [];
        items.forEach((item) => {
            if (!item.rowHeightPt) {
                const desc = String(item.desc || item.description || '').trim();
                const lines = desc ? Math.min(3, Math.ceil(desc.length / 55)) : 0;
                item.rowHeightPt = H.itemRowBase + lines * H.itemDescLine;
            }
        });

        const prefixH = H.header + H.prefix + H.party + H.extra;
        const closingH = H.closing;
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

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
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

        const copyTypes = doc.copyTypes?.length
            ? DocumentSettings.normalizeCopyTypes(doc.copyTypes)
            : DocumentSettings.normalizeCopyTypes([doc.copyType || 'original']);
        const expanded = [];
        let expandedPageNum = 0;
        copyTypes.forEach((copyType) => {
            const copyLabel = copyType === 'none'
                ? ''
                : DocumentBuildCommon.copyLabel(copyType);
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

        return {
            pages: expanded,
            diagnostics: {
                contentHeightPt: Math.round(expanded.length * PH),
                printableHeightPt: Math.round(PH),
                pagesRequired: expanded.length,
                contentPagesPerCopy: pages.length,
                copyTypes,
                pageWidthMm: dims.w,
                pageHeightMm: dims.h,
                marginMm,
                scale: Math.round((scale || 1) * 100)
            },
            doc: { ...doc, copyTypes },
            settings
        };
    }
};

window.DocumentPaginate = DocumentPaginate;
