/**
 * Document Engine V4 — Purchase Invoice (legacy Purchase Bill layout + pdfmake).
 */
const PurchaseDataV4 = {
    async build(purchaseId) {
        const purchases = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const p = purchases.find((pur) => pur.id === purchaseId);
        if (!p) return null;

        const company = DocumentBuildCommon.buildCompany();
        const isDebitNote = typeof InvoicesUI !== 'undefined' && InvoicesUI._isDebitNotePurchaseDoc
            ? InvoicesUI._isDebitNotePurchaseDoc(p)
            : false;
        const purchaseRefNo = typeof InvoicesUI !== 'undefined' && InvoicesUI._inferPurchaseReferenceNo
            ? InvoicesUI._inferPurchaseReferenceNo(p)
            : (p.referenceNo || '-');
        const displayVendor = DocumentBuildCommon.cleanVendorName(p.vendor || p.vendorName);
        const purchaseShipAddr = (p.shipToAddress || p.deliveryAddress || '').trim();
        const showPurchaseShipPdf = !!purchaseShipAddr && p.includeShipToOnPdf !== false;

        const masterInventory = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
        const masterServices = DataManager.getData(DataManager.KEYS.SERVICES || 'gtes_services') || [];
        const allMasterItems = [...masterInventory, ...masterServices];

        const dnDocTotal = Math.abs(parseFloat(p.total ?? p.amount ?? p.vch_amt ?? 0) || 0);
        let pdfItems = (p.items && p.items.length) ? JSON.parse(JSON.stringify(p.items)) : [];
        let pdfLineTaxes = null;

        if (isDebitNote && typeof InvoicesUI !== 'undefined' && InvoicesUI._debitNoteUsesFallbackLineItems?.(p)) {
            const basePur = InvoicesUI._findBasePurchaseForDebitNote?.(p, purchases);
            if (basePur?.items?.length) {
                pdfItems = InvoicesUI._pickDebitNoteLinesMatchingTotal?.(
                    JSON.parse(JSON.stringify(basePur.items)),
                    dnDocTotal
                ) || pdfItems;
            }
        }

        if (pdfItems.length > 0 && typeof InvoicesUI !== 'undefined' && InvoicesUI._accumulatePurchasePdfFooterTaxes) {
            pdfLineTaxes = InvoicesUI._accumulatePurchasePdfFooterTaxes(pdfItems, allMasterItems);
        }

        const pdfCgst = pdfLineTaxes ? pdfLineTaxes.cgst : (parseFloat(p.cgst) || 0);
        const pdfSgst = pdfLineTaxes ? pdfLineTaxes.sgst : (parseFloat(p.sgst) || 0);
        const pdfIgst = pdfLineTaxes ? pdfLineTaxes.igst : (parseFloat(p.igst) || 0);
        const pdfTaxableSub = pdfLineTaxes
            ? pdfLineTaxes.taxable
            : (parseFloat(p.subtotal) || (dnDocTotal - pdfCgst - pdfSgst - pdfIgst));

        const docTotal = parseFloat(p.amount) || dnDocTotal;
        let purchaseBalance = docTotal;
        if (!isDebitNote && typeof VoucherManager !== 'undefined') {
            const map = VoucherManager.getVoucherAllocationsMap(null, 'payment');
            purchaseBalance = VoucherManager.getDocumentBalance(
                p.id,
                docTotal,
                map,
                p.billNo || p.vch_no || p.invoiceNo,
                p,
                { allowLooseFallback: false }
            );
            const importedStatus = String(p.status || '').toLowerCase();
            const srcBk = String(p.source || '').toLowerCase() === 'bookkeeper'
                || !!(p.bookkeeperId && String(p.bookkeeperId).trim());
            if (purchaseBalance >= (docTotal - 0.05) && srcBk) {
                if (importedStatus === 'paid') purchaseBalance = 0;
                else if (importedStatus === 'partial') purchaseBalance = Math.max(0.01, docTotal * 0.5);
            }
        }
        const payment = typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.resolvePaymentStatus({
                status: p.status,
                balance: isDebitNote ? 0 : purchaseBalance,
                total: docTotal,
                isPaid: isDebitNote ? true : purchaseBalance <= 0.05,
                skipDisplay: isDebitNote
            })
            : { show: false };

        const items = pdfItems.length > 0
            ? pdfItems.map((item, idx) => {
                const details = InvoicesUI.getItemDisplayDetails(item, allMasterItems, false);
                let cgstR = parseFloat(item.cgstRate) || details.cgstRate || 0;
                let sgstR = parseFloat(item.sgstRate) || details.cgstRate || 0;
                let cgstA = parseFloat(item.cgstAmount || (details.amount * cgstR / 100)) || 0;
                let sgstA = parseFloat(item.sgstAmount || (details.amount * sgstR / 100)) || 0;
                const igstA = parseFloat(item.igst) || parseFloat(item.igstAmount) || 0;
                const igstR = parseFloat(String(item.igstRate || '').replace(/[^0-9.]/g, '')) || 0;
                const gstWhole = parseFloat(String(item.gstRate || '').replace(/[^0-9.]/g, '')) || 0;
                if (igstA > 0.01 && Math.abs(cgstA + sgstA) < 0.01) {
                    cgstA = igstA / 2;
                    sgstA = igstA / 2;
                    const halfRate = igstR > 0 ? igstR / 2 : (gstWhole > 0 ? gstWhole / 2 : 9);
                    cgstR = halfRate;
                    sgstR = halfRate;
                }
                const desc = DocumentPdfBase._plainText(details.displayDesc || '');
                return {
                    sl: idx + 1,
                    name: item.name || '',
                    desc,
                    hsn: details.hsn || '-',
                    qty: details.qty,
                    unit: details.unit || 'nos',
                    rate: details.rate,
                    discount: item.discount || 0,
                    cgstR, cgstA, sgstR, sgstA,
                    amount: details.amount,
                    rowHeightPt: DocumentBuildCommon.itemRowHeight({ desc })
                };
            })
            : [{
                sl: 1,
                name: (p.description || 'Purchase').split('\n')[0].slice(0, 200),
                desc: '',
                hsn: '-',
                qty: 1,
                unit: 'nos',
                rate: parseFloat(p.amount) || 0,
                discount: 0,
                cgstR: 0, cgstA: 0, sgstR: 0, sgstA: 0,
                amount: parseFloat(p.amount) || 0,
                rowHeightPt: 18
            }];

        return {
            purchaseId,
            meta: {
                docTitle: isDebitNote ? 'Debit Note / Purchase Return' : 'Purchase Bill',
                docNoLabel: isDebitNote ? 'Debit Note No' : 'Bill No',
                isDebitNote,
                vendorLabel: 'Bill From (Supplier)',
                detailsLabel: 'Bill Details'
            },
            company,
            doc: {
                no: p.billNo || p.id,
                date: p.date || '',
                dateDisplay: DocumentBuildCommon.formatDateDisplay(p.date)
            },
            vendor: {
                name: displayVendor,
                address: p.vendorAddress || 'Address not available',
                gstin: p.vendorGstin || p.vendorGSTIN || ''
            },
            billDetails: [
                ['Supplier Bill No:', p.supplierBillNo || p.supplierInvoiceNo || p.purchaseInvoiceRef || p.referenceNo || p.billNo || '-'],
                ['Purchase Invoice Ref:', purchaseRefNo],
                ['Ref No / PO:', p.poNumber || '-'],
                isDebitNote
                    ? ['Return Status:', 'POSTED']
                    : ['Payment Status:', payment.label || (p.status || 'pending').toUpperCase()]
            ],
            payment,
            shipTo: {
                show: showPurchaseShipPdf,
                address: purchaseShipAddr,
                gstin: p.shipToGstin || ''
            },
            items,
            summary: {
                subtotal: pdfTaxableSub,
                cgst: pdfCgst,
                sgst: pdfSgst,
                igst: pdfIgst,
                roundOff: parseFloat(p.roundOff) || 0,
                total: parseFloat(p.amount) || dnDocTotal,
                ledgerEffect: isDebitNote
                    ? `Debit (Vendor A/c) ₹${Math.abs(parseFloat(p.amount) || 0).toFixed(2)}`
                    : `Credit (Vendor A/c) ₹${Math.abs(parseFloat(p.amount) || 0).toFixed(2)}`
            },
            footerNote: 'This is a computer generated invoice and does not require a physical signature.',
            declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
            setOffReferences: isDebitNote && typeof DocumentBuildCommon !== 'undefined'
                ? (() => {
                    const refs = DocumentBuildCommon.buildSetOffReferences({
                        noteDoc: p,
                        grandTotal: dnDocTotal,
                        kind: 'purchase'
                    });
                    return refs?.rows?.length ? refs : null;
                })()
                : null
        };
    }
};

const PurchaseLayoutV4 = {
    paginate(doc, settings = {}) {
        return DocumentPaginate.paginate(doc, settings, {
            header: 64,
            prefix: 0,
            party: 100,
            extra: doc.shipTo?.show ? 44 : 0,
            tableHeader: 40,
            closing: doc.setOffReferences?.rows?.length ? 200 : 160
        });
    }
};

const PurchasePdfV4 = {
    _columnWidths() {
        return ['4%', '24%', '9%', '6%', '7%', '5%', '5%', '4%', '5%', '4%', '5%', '13%'];
    },

    _itemsTable(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const head1 = [
            { text: '#', rowSpan: 2, alignment: 'center', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' },
            { text: 'Description', rowSpan: 2, bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' },
            { text: 'HSN', rowSpan: 2, alignment: 'center', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' },
            { text: 'Qty', rowSpan: 2, alignment: 'center', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' },
            { text: 'Rate', rowSpan: 2, alignment: 'right', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' },
            { text: 'Per', rowSpan: 2, alignment: 'center', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' },
            { text: 'Disc', rowSpan: 2, alignment: 'right', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' },
            { text: 'CGST', colSpan: 2, alignment: 'center', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' }, {},
            { text: 'SGST', colSpan: 2, alignment: 'center', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' }, {},
            { text: 'Amount', rowSpan: 2, alignment: 'right', bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff' }
        ];
        const head2 = [
            {}, {}, {}, {}, {}, {}, {},
            { text: '%', alignment: 'center', fontSize: fs(6), fillColor: '#4a5568', color: '#fff' },
            { text: 'Amt', alignment: 'right', fontSize: fs(6), fillColor: '#4a5568', color: '#fff' },
            { text: '%', alignment: 'center', fontSize: fs(6), fillColor: '#4a5568', color: '#fff' },
            { text: 'Amt', alignment: 'right', fontSize: fs(6), fillColor: '#4a5568', color: '#fff' },
            {}
        ];
        const body = [head1, head2];
        doc.items.forEach((row) => {
            const descStack = row.desc
                ? [{ text: row.name, bold: true, fontSize: fs(8) }, { text: row.desc, fontSize: fs(7), italics: true }]
                : [{ text: row.name, bold: true, fontSize: fs(8) }];
            body.push([
                { text: String(row.sl), alignment: 'center', fontSize: fs(8) },
                { stack: descStack },
                { text: row.hsn, alignment: 'center', fontSize: fs(8), noWrap: true },
                DocumentPdfBase._numCell(row.qty, { alignment: 'center' }),
                DocumentPdfBase._numCell(row.rate.toFixed(2)),
                { text: row.unit, alignment: 'center', fontSize: fs(8), noWrap: true },
                DocumentPdfBase._numCell(`${row.discount}%`),
                DocumentPdfBase._numCell(`${row.cgstR.toFixed(1)}%`),
                DocumentPdfBase._numCell(row.cgstA.toFixed(2)),
                DocumentPdfBase._numCell(`${row.sgstR.toFixed(1)}%`),
                DocumentPdfBase._numCell(row.sgstA.toFixed(2)),
                DocumentPdfBase._numCell(row.amount.toFixed(2), { bold: true })
            ]);
        });

        return {
            table: { headerRows: 2, widths: this._columnWidths(), body },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#000',
                vLineColor: () => '#000'
            },
            margin: [0, 0, 0, sp(8)]
        };
    },

    _footerBlock(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const s = doc.summary;
        const taxRows = [
            ['Subtotal', `₹${s.subtotal.toFixed(2)}`],
            ['CGST Total', `₹${s.cgst.toFixed(2)}`],
            ['SGST Total', `₹${s.sgst.toFixed(2)}`]
        ];
        if (s.igst > 0) taxRows.push(['IGST Total', `₹${s.igst.toFixed(2)}`]);
        if (s.roundOff) taxRows.push(['Round Off', `₹${s.roundOff.toFixed(2)}`]);

        return {
            columns: [
                {
                    width: '48%',
                    stack: [
                        { text: `CGST Amt: ${s.cgst.toFixed(2)}`, fontSize: fs(9), margin: [0, 0, 0, sp(2)] },
                        { text: `SGST Amt: ${s.sgst.toFixed(2)}`, fontSize: fs(9), margin: [0, 0, 0, sp(2)] },
                        ...(s.igst > 0 ? [{ text: `IGST Amt: ${s.igst.toFixed(2)}`, fontSize: fs(9), margin: [0, 0, 0, sp(2)] }] : []),
                        { text: `Total Tax: ${(s.cgst + s.sgst + s.igst).toFixed(2)}`, fontSize: fs(9), margin: [0, 0, 0, sp(8)] },
                        { text: doc.declaration, fontSize: fs(7), color: '#666', italics: true, margin: [0, sp(8), 0, sp(4)] },
                        { text: `Ledger Effect: ${s.ledgerEffect}`, fontSize: fs(8), bold: true }
                    ]
                },
                {
                    width: '52%',
                    stack: [
                        {
                            table: {
                                widths: ['*', 'auto'],
                                body: [
                                    ...taxRows.map(([l, v]) => [
                                        { text: l, alignment: 'right', fontSize: fs(9), color: '#334155' },
                                        { text: v, alignment: 'right', fontSize: fs(9), noWrap: true }
                                    ]),
                                    [
                                        { text: 'Total Amount', alignment: 'right', bold: true, fontSize: fs(12), margin: [0, sp(4), 0, 0] },
                                        { text: `₹${s.total.toFixed(2)}`, alignment: 'right', bold: true, fontSize: fs(12), noWrap: true, margin: [0, sp(4), 0, 0] }
                                    ]
                                ]
                            },
                            layout: 'lightHorizontalLines',
                            fillColor: '#f1f3f5',
                            margin: [0, 0, 0, sp(4)]
                        },
                        DocumentBlocks.purchaseSignatureFooter(doc)
                    ]
                }
            ],
            columnGap: sp(10)
        };
    },

    _contentBlocks(doc) {
        const blocks = [
            DocumentBlocks.companyHeaderPurchase(doc),
            DocumentBlocks.vendorBillGrid(doc)
        ];
        const ship = DocumentBlocks.shipToBlock(doc);
        if (ship) blocks.push(ship);
        blocks.push(this._itemsTable(doc));
        const setOff = typeof DocumentBlocks !== 'undefined'
            ? DocumentBlocks.setOffReferenceTable(doc)
            : null;
        if (setOff) blocks.push(setOff);
        blocks.push(this._footerBlock(doc));
        if (doc.payment?.isPaid && typeof DocumentBuildCommon !== 'undefined') {
            blocks.push(DocumentBuildCommon.paidStampPdfBlock());
        }
        return blocks;
    },

    async generatePdfBytes(doc, settings = {}) {
        return DocumentPdfBase.generatePdfBytes(doc, settings, (d) => this._contentBlocks(d));
    }
};

const PurchasePreviewV4 = {
    _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _renderPage(doc, page) {
        const copyLine = page.copyLabel ? `<div style="font-size:9px;font-weight:700;text-align:right;">(${this._esc(page.copyLabel)})</div>` : '';
        const billRows = doc.billDetails.map(([l, v]) => {
            const isPay = l === 'Payment Status:';
            const color = isPay ? (doc.payment?.color || '#111') : '#111';
            return `<tr><td style="color:#444;font-size:9px;padding:2px 0;width:120px;vertical-align:top;">${this._esc(l)}</td><td style="font-size:9px;font-weight:700;padding:2px 0;color:${color};"><strong>${this._esc(v)}</strong></td></tr>`;
        }).join('');

        const itemRows = (page.itemRows.length ? page.itemRows : doc.items).map((r) => `
            <tr style="font-size:9px;">
                <td style="text-align:center;border:1px solid #000;padding:4px;">${r.sl}</td>
                <td style="border:1px solid #000;padding:4px;"><div style="font-weight:700;">${this._esc(r.name)}</div>${r.desc ? `<div style="font-size:8px;font-style:italic;">${this._esc(r.desc)}</div>` : ''}</td>
                <td style="text-align:center;border:1px solid #000;padding:4px;white-space:nowrap;">${this._esc(r.hsn)}</td>
                <td style="text-align:center;border:1px solid #000;padding:4px;white-space:nowrap;">${this._esc(r.qty)}</td>
                <td style="text-align:right;border:1px solid #000;padding:4px;white-space:nowrap;">${r.rate.toFixed(2)}</td>
                <td style="text-align:center;border:1px solid #000;padding:4px;white-space:nowrap;">${this._esc(r.unit)}</td>
                <td style="text-align:right;border:1px solid #000;padding:4px;white-space:nowrap;">${r.discount}%</td>
                <td style="text-align:right;border:1px solid #000;padding:4px;white-space:nowrap;">${r.cgstR.toFixed(1)}%</td>
                <td style="text-align:right;border:1px solid #000;padding:4px;white-space:nowrap;">${r.cgstA.toFixed(2)}</td>
                <td style="text-align:right;border:1px solid #000;padding:4px;white-space:nowrap;">${r.sgstR.toFixed(1)}%</td>
                <td style="text-align:right;border:1px solid #000;padding:4px;white-space:nowrap;">${r.sgstA.toFixed(2)}</td>
                <td style="text-align:right;border:1px solid #000;padding:4px;font-weight:700;white-space:nowrap;">${r.amount.toFixed(2)}</td>
            </tr>`).join('');

        const prefix = page.includePrefix ? `
            <table width="100%" style="border-bottom:2px solid #000;margin-bottom:12px;"><tr>
                <td width="65%" valign="top"><div style="font-size:20px;font-weight:800;text-transform:uppercase;">${this._esc(doc.company.name)}</div>
                    <div style="font-size:9px;line-height:1.4;margin-top:4px;">${this._esc(doc.company.address)}<br><strong>Work:</strong> ${this._esc(doc.company.workAddress)}<br><strong>GSTIN:</strong> ${this._esc(doc.company.gstin)} | <strong>PAN:</strong> ${this._esc(doc.company.pan)}</div></td>
                <td width="35%" valign="top" align="right"><div style="font-size:16px;font-weight:800;text-transform:uppercase;">${this._esc(doc.meta.docTitle)}</div>${copyLine}
                    <div style="font-size:9px;margin-top:6px;">Date: <strong>${this._esc(doc.doc.dateDisplay || doc.doc.date)}</strong><br>${this._esc(doc.meta.docNoLabel)}: <strong>${this._esc(doc.doc.no)}</strong></div></td>
            </tr></table>
            <table width="100%" style="margin-bottom:12px;"><tr>
                <td width="50%" valign="top" style="padding-right:6px;"><div style="border:1px solid #000;padding:8px;"><div style="font-size:8px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:6px;">${this._esc(doc.meta.vendorLabel)}</div>
                    <div style="font-weight:800;font-size:12px;">${this._esc(doc.vendor.name)}</div><div style="font-size:9px;white-space:pre-wrap;">${this._esc(doc.vendor.address)}</div>${doc.vendor.gstin ? `<div style="font-size:9px;margin-top:4px;"><strong>GSTIN:</strong> ${this._esc(doc.vendor.gstin)}</div>` : ''}</div></td>
                <td width="50%" valign="top" style="padding-left:6px;"><div style="border:1px solid #000;padding:8px;"><div style="font-size:8px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:6px;">${this._esc(doc.meta.detailsLabel)}</div><table width="100%">${billRows}</table></div></td>
            </tr></table>
            ${doc.shipTo?.show ? `<div style="border:1px solid #000;padding:8px;margin-bottom:12px;"><div style="font-size:8px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:6px;">Ship To / Delivery Address</div><div style="font-size:9px;white-space:pre-wrap;">${this._esc(doc.shipTo.address)}</div></div>` : ''}` : '';

        const setOffHtml = (page.includeClosing && doc.setOffReferences?.rows?.length) ? (() => {
            const fmt = (n) => (typeof DocumentBuildCommon !== 'undefined'
                ? DocumentBuildCommon.formatMoney(n)
                : (parseFloat(n) || 0).toFixed(2));
            const rows = doc.setOffReferences.rows.map((r) => `
                <tr style="font-size:9px;">
                    <td style="border:1px solid #000;padding:4px;text-align:center;">${this._esc(r.invoiceNo)}</td>
                    <td style="border:1px solid #000;padding:4px;text-align:center;">${this._esc(r.date)}</td>
                    <td style="border:1px solid #000;padding:4px;text-align:center;">${this._esc(r.supplierInvoiceNo)}</td>
                    <td style="border:1px solid #000;padding:4px;text-align:right;white-space:nowrap;">${fmt(r.amount)}</td>
                </tr>`).join('');
            return `<table width="100%" style="border-collapse:collapse;margin:8px 0;">
                <tr style="background:#e8e8e8;font-size:8px;font-weight:700;text-align:center;">
                    <td style="border:1px solid #000;padding:4px;">Invoice No. Reference</td>
                    <td style="border:1px solid #000;padding:4px;">Date</td>
                    <td style="border:1px solid #000;padding:4px;">Supplier Invoice No</td>
                    <td style="border:1px solid #000;padding:4px;">Amount</td>
                </tr>
                ${rows}
                <tr style="font-size:9px;font-weight:700;">
                    <td colspan="3" style="border:1px solid #000;padding:4px;">Total</td>
                    <td style="border:1px solid #000;padding:4px;text-align:right;white-space:nowrap;">Rs.${fmt(doc.setOffReferences.total)}</td>
                </tr>
            </table>`;
        })() : '';

        const closing = page.includeClosing ? `${setOffHtml}<div style="display:flex;gap:12px;margin-top:8px;">
                <div style="width:48%;font-size:10px;">
                    <div><strong>CGST Amt:</strong> ${doc.summary.cgst.toFixed(2)}</div>
                    <div><strong>SGST Amt:</strong> ${doc.summary.sgst.toFixed(2)}</div>
                    ${doc.summary.igst > 0 ? `<div><strong>IGST Amt:</strong> ${doc.summary.igst.toFixed(2)}</div>` : ''}
                    <div style="margin:8px 0;"><strong>Total Tax:</strong> ${(doc.summary.cgst + doc.summary.sgst + doc.summary.igst).toFixed(2)}</div>
                    <div style="font-size:9px;color:#666;font-style:italic;">${this._esc(doc.declaration)}</div>
                    <div style="font-size:9px;margin-top:6px;"><strong>Ledger Effect:</strong> ${this._esc(doc.summary.ledgerEffect)}</div>
                </div>
                <div style="width:52%;">
                    <table width="100%" style="background:#f1f3f5;font-size:11px;border-collapse:collapse;">
                        <tr><td align="right" style="padding:4px;">Subtotal</td><td align="right" style="padding:4px;font-weight:600;">₹${doc.summary.subtotal.toFixed(2)}</td></tr>
                        <tr><td align="right" style="padding:4px;">CGST Total</td><td align="right" style="padding:4px;">₹${doc.summary.cgst.toFixed(2)}</td></tr>
                        <tr><td align="right" style="padding:4px;">SGST Total</td><td align="right" style="padding:4px;">₹${doc.summary.sgst.toFixed(2)}</td></tr>
                        ${doc.summary.igst > 0 ? `<tr><td align="right" style="padding:4px;">IGST Total</td><td align="right" style="padding:4px;">₹${doc.summary.igst.toFixed(2)}</td></tr>` : ''}
                        <tr style="font-weight:800;font-size:14px;"><td align="right" style="padding:8px;border:2px solid #111;background:#fff;">Total Amount</td><td align="right" style="padding:8px;border:2px solid #111;background:#fff;">₹${doc.summary.total.toFixed(2)}</td></tr>
                    </table>
                    <div style="text-align:right;margin-top:12px;font-size:10px;">For <strong>${this._esc(doc.company.name)}</strong><div style="border-top:1px solid #000;display:inline-block;min-width:180px;margin-top:24px;padding-top:4px;font-weight:700;text-transform:uppercase;">Authorized Signatory</div></div>
                    <div style="text-align:center;font-size:8px;color:#64748b;margin-top:6px;">${this._esc(doc.footerNote)}</div>
                </div>
            </div>` : '';

        return `${prefix}<table width="100%" style="border-collapse:collapse;border:1px solid #000;margin-bottom:8px;"><thead>
            <tr style="background:#4a5568;color:#fff;font-size:8px;text-align:center;"><th rowspan="2">#</th><th rowspan="2" align="left">Description</th><th rowspan="2">HSN</th><th rowspan="2">Qty</th><th rowspan="2">Rate</th><th rowspan="2">Per</th><th rowspan="2">Disc</th><th colspan="2">CGST</th><th colspan="2">SGST</th><th rowspan="2">Amount</th></tr>
            <tr style="background:#4a5568;color:#fff;font-size:7px;"><th>%</th><th>Amt</th><th>%</th><th>Amt</th></tr></thead><tbody>${itemRows}</tbody></table>${closing}`;
    },

    render(layoutResult, host) {
        if (!host || !layoutResult?.pages) return;
        const { pages, doc, settings } = layoutResult;
        const paidStamp = doc.payment?.isPaid && typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.paidStampHtml()
            : '';
        host.innerHTML = pages.map((p) => `
            <section class="doc-engine-page-frame inv-v3-page-frame" data-page="${p.pageNumber}" id="doc-engine-page-${p.pageNumber}">
                <div class="inv-v3-page doc-page-root">${paidStamp}${this._renderPage(doc, p)}</div>
            </section>`).join('');
        if (typeof DocumentPreview !== 'undefined') {
            DocumentPreview.applyPageSettings(host, settings || layoutResult.settings || {});
            DocumentPreview.syncPageCount(pages.length);
            DocumentPreview._bindNavOnce();
            host.querySelectorAll('.doc-engine-page-frame').forEach((f) => DocumentPreview._observer?.observe(f));
        }
    }
};

window.PurchaseDataV4 = PurchaseDataV4;
window.PurchaseLayoutV4 = PurchaseLayoutV4;
window.PurchasePdfV4 = PurchasePdfV4;
window.PurchasePreviewV4 = PurchasePreviewV4;
