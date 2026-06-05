/**
 * Document Engine V4 — Purchase Order (purchase-bill layout derivative; no legacy HTML).
 */
const OrderDataV4 = {
    getOrders() {
        return DataManager.getData(DataManager.KEYS.PURCHASE_ORDERS)
            || DataManager.getData('orders')
            || [];
    },

    getOrder(id) {
        return this.getOrders().find((o) => o.id === id) || null;
    },

    async build(orderId) {
        const order = this.getOrder(orderId);
        if (!order) return null;

        const company = DocumentBuildCommon.buildCompany();
        const total = parseFloat(order.total) || 0;
        const items = (order.items || []).map((item, idx) => {
            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            const amount = parseFloat(item.amount) || (qty * rate) || 0;
            const desc = DocumentPdfBase._plainText(item.description || '');
            return {
                sl: idx + 1,
                name: item.name || '',
                desc,
                qty,
                unit: item.unit || 'nos',
                rate,
                amount: amount || (total && order.items.length === 1 ? total : amount),
                rowHeightPt: DocumentBuildCommon.itemRowHeight({ desc })
            };
        });

        if (!items.length) {
            items.push({
                sl: 1, name: 'Purchase Order Items', desc: '', qty: 1, unit: 'nos',
                rate: total, amount: total, rowHeightPt: 18
            });
        }

        const vendorName = order.vendor || order.vendorName || order.supplier || 'Supplier';

        return {
            orderId,
            meta: {
                docTitle: 'Purchase Order',
                docNoLabel: 'PO No',
                vendorLabel: 'Supplier',
                detailsLabel: 'Order Details'
            },
            company,
            doc: {
                no: order.id,
                date: order.date || '',
                dateDisplay: DocumentBuildCommon.formatDateDisplay(order.date)
            },
            vendor: {
                name: vendorName,
                address: order.vendorAddress || '',
                gstin: order.vendorGstin || ''
            },
            billDetails: [
                ['Order Date:', DocumentBuildCommon.formatDateDisplay(order.date)],
                ['Status:', (order.status || 'open').toUpperCase()],
                ['Total Value:', `₹${DocumentBuildCommon.formatMoney(total)}`]
            ],
            shipTo: { show: false },
            items,
            summary: { subtotal: total, total },
            terms: [
                'Delivery as per agreed schedule.',
                'Subject to Chennai jurisdiction.'
            ],
            footerNote: 'Computer generated purchase order.'
        };
    }
};

const OrderLayoutV4 = {
    paginate(doc, settings = {}) {
        return DocumentPaginate.paginate(doc, settings, {
            header: 64,
            party: 96,
            tableHeader: 24,
            closing: 72
        });
    }
};

const OrderPdfV4 = {
    _columnWidths() {
        return ['6%', '44%', '12%', '12%', '13%', '13%'];
    },

    _itemsTable(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const head = [
            { text: '#', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Description', bold: true, fontSize: fs(7) },
            { text: 'Qty', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Unit', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Rate', alignment: 'right', bold: true, fontSize: fs(7) },
            { text: 'Amount', alignment: 'right', bold: true, fontSize: fs(7) }
        ];
        const body = [head];
        doc.items.forEach((row) => {
            const stack = row.desc
                ? [{ text: row.name, bold: true, fontSize: fs(8) }, { text: row.desc, fontSize: fs(7), italics: true }]
                : [{ text: row.name, bold: true, fontSize: fs(8) }];
            body.push([
                { text: String(row.sl), alignment: 'center', fontSize: fs(8) },
                { stack },
                DocumentPdfBase._numCell(row.qty, { alignment: 'center' }),
                { text: row.unit, alignment: 'center', fontSize: fs(8), noWrap: true },
                DocumentPdfBase._numCell(row.rate.toFixed(2)),
                DocumentPdfBase._numCell(row.amount.toFixed(2), { bold: true })
            ]);
        });
        body.push([
            { text: '', colSpan: 4, border: [false, false, false, false] }, {}, {}, {},
            { text: 'Total:', alignment: 'right', bold: true, fontSize: fs(10) },
            DocumentPdfBase._numCell(`₹${doc.summary.total.toFixed(2)}`, { bold: true, fontSize: fs(10) })
        ]);
        return {
            table: { headerRows: 1, widths: this._columnWidths(), body },
            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
            margin: [0, 0, 0, sp(8)]
        };
    },

    _contentBlocks(doc) {
        return [
            DocumentBlocks.companyHeaderPurchase(doc),
            DocumentBlocks.vendorBillGrid(doc),
            this._itemsTable(doc),
            DocumentBlocks.termsSignatureFooter(doc)
        ];
    },

    async generatePdfBytes(doc, settings = {}) {
        return DocumentPdfBase.generatePdfBytes(doc, settings, (d) => this._contentBlocks(d));
    }
};

const OrderPreviewV4 = {
    _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _renderPrefix(doc, page) {
        if (!page.includePrefix) return '';
        const copyLine = page.copyLabel ? `<div style="font-size:9px;font-weight:700;text-align:right;">(${this._esc(page.copyLabel)})</div>` : '';
        const billRows = doc.billDetails.map(([l, v]) =>
            `<tr><td style="color:#444;font-size:9px;padding:2px 0;">${this._esc(l)}</td><td style="font-size:9px;font-weight:700;padding:2px 0;"><strong>${this._esc(v)}</strong></td></tr>`
        ).join('');
        return `
            <table width="100%" style="border-bottom:2px solid #000;margin-bottom:12px;"><tr>
                <td width="65%" valign="top"><div style="font-size:20px;font-weight:800;text-transform:uppercase;">${this._esc(doc.company.name)}</div>
                    <div style="font-size:9px;line-height:1.4;">${this._esc(doc.company.address)}<br><strong>Work:</strong> ${this._esc(doc.company.workAddress)}<br><strong>GSTIN:</strong> ${this._esc(doc.company.gstin)}</div></td>
                <td width="35%" valign="top" align="right"><div style="font-size:16px;font-weight:800;">${this._esc(doc.meta.docTitle)}</div>${copyLine}
                    <div style="font-size:9px;margin-top:6px;">Date: <strong>${this._esc(doc.doc.dateDisplay)}</strong><br>${this._esc(doc.meta.docNoLabel)}: <strong>${this._esc(doc.doc.no)}</strong></div></td>
            </tr></table>
            <table width="100%" style="margin-bottom:12px;"><tr>
                <td width="50%" valign="top" style="padding-right:6px;"><div style="border:1px solid #000;padding:8px;"><div style="font-size:8px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;margin-bottom:6px;">${this._esc(doc.meta.vendorLabel)}</div>
                    <div style="font-weight:800;">${this._esc(doc.vendor.name)}</div>${doc.vendor.address ? `<div style="font-size:9px;">${this._esc(doc.vendor.address)}</div>` : ''}</div></td>
                <td width="50%" valign="top" style="padding-left:6px;"><div style="border:1px solid #000;padding:8px;"><div style="font-size:8px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;margin-bottom:6px;">${this._esc(doc.meta.detailsLabel)}</div><table width="100%">${billRows}</table></div></td>
            </tr></table>`;
    },

    render(layoutResult, host) {
        if (!host || !layoutResult?.pages) return;
        const { pages, doc, settings } = layoutResult;
        const dims = DocumentSettings.pageDimensionsMm(settings || {});
        const marginMm = DocumentSettings.marginMm((settings || {}).marginPreset || 'normal');

        host.innerHTML = pages.map((p) => {
            const rows = (p.itemRows.length ? p.itemRows : doc.items).map((r) => `
                <tr style="font-size:9px;"><td style="text-align:center;">${r.sl}</td><td><strong>${this._esc(r.name)}</strong>${r.desc ? `<div style="font-size:8px;font-style:italic;">${this._esc(r.desc)}</div>` : ''}</td>
                <td style="text-align:center;white-space:nowrap;">${this._esc(r.qty)}</td><td style="text-align:center;">${this._esc(r.unit)}</td>
                <td style="text-align:right;white-space:nowrap;">${r.rate.toFixed(2)}</td><td style="text-align:right;font-weight:700;white-space:nowrap;">${r.amount.toFixed(2)}</td></tr>`).join('');
            const prefix = this._renderPrefix(doc, p);
            const table = `<table width="100%" style="border-collapse:collapse;border:1px solid #000;"><thead><tr style="font-size:8px;background:#f8f9fa;"><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th align="right">Rate</th><th align="right">Amount</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4"></td><td align="right"><strong>Total:</strong></td><td align="right"><strong>₹${doc.summary.total.toFixed(2)}</strong></td></tr></tfoot></table>`;
            const closing = p.includeClosing ? `<div style="margin-top:16px;font-size:8px;"><strong>Terms:</strong><ol>${(doc.terms || []).map((t) => `<li>${this._esc(t)}</li>`).join('')}</ol></div>` : '';
            return `<section class="doc-engine-page-frame inv-v3-page-frame" data-page="${p.pageNumber}"><div class="inv-v3-page-sheet" style="width:${dims.w}mm;min-height:${dims.h - marginMm * 2}mm;padding:${marginMm}mm;background:#fff;">${prefix}${table}${closing}</div></section>`;
        }).join('');

        if (typeof DocumentPreview !== 'undefined') {
            DocumentPreview._state.pageCount = pages.length;
            DocumentPreview._state.currentPage = 1;
            DocumentPreview._bindNavOnce();
            host.querySelectorAll('.doc-engine-page-frame').forEach((f) => DocumentPreview._observer?.observe(f));
            DocumentPreview._updateNav();
        }
    }
};

window.OrderDataV4 = OrderDataV4;
window.OrderLayoutV4 = OrderLayoutV4;
window.OrderPdfV4 = OrderPdfV4;
window.OrderPreviewV4 = OrderPreviewV4;
