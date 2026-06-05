/**
 * Document Engine V4 — reusable pdfmake layout blocks (legacy layouts preserved).
 */
const DocumentBlocks = {
    _ctx() {
        return DocumentPdfBase._ctx;
    },

    companyHeaderCenter(doc) {
        const c = doc.company;
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const stack = [
            { text: c.name, fontSize: fs(16), bold: true, alignment: 'center' },
            { text: c.address, fontSize: fs(8), alignment: 'center', margin: [0, sp(2), 0, 0] },
            { text: `Work: ${c.workAddress}`, fontSize: fs(8), alignment: 'center' }
        ];
        if (c.emails) stack.push({ text: `Email: ${c.emails}`, fontSize: fs(8), alignment: 'center' });
        if (c.phones) stack.push({ text: `Ph: ${c.phones}`, fontSize: fs(8), alignment: 'center' });
        stack.push({
            text: `GSTIN: ${c.gstin}  |  PAN: ${c.pan}${c.iec ? `  |  IEC: ${c.iec}` : ''}`,
            fontSize: fs(8),
            alignment: 'center',
            margin: [0, sp(2), 0, 0]
        });
        const titleStack = [
            { stack, margin: [0, 0, 0, sp(6)] },
            { text: doc.meta.docTitle, fontSize: fs(13), bold: true, alignment: 'center' }
        ];
        if (doc.copyLabel) {
            titleStack.push({
                text: `(${doc.copyLabel})`,
                fontSize: fs(9),
                bold: true,
                alignment: 'center',
                margin: [0, sp(2), 0, sp(8)]
            });
        } else {
            titleStack.push({ text: '', margin: [0, sp(2), 0, sp(8)] });
        }
        return { stack: titleStack };
    },

    companyHeaderSplit(doc, rightStackFn) {
        const c = doc.company;
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const left = {
            stack: [
                { text: String(c.name || '').toUpperCase(), fontSize: fs(14), bold: true, color: '#1a5276' },
                { text: c.address, fontSize: fs(8), color: '#555', margin: [0, sp(2), 0, 0] },
                { text: `Work: ${c.workAddress}`, fontSize: fs(7), color: '#555' },
                { text: `Email: ${c.emails} | Ph: ${c.phones}`, fontSize: fs(7), color: '#555' },
                { text: `GSTIN: ${c.gstin} | PAN: ${c.pan}`, fontSize: fs(7), bold: true, color: '#555' }
            ]
        };
        const right = rightStackFn(fs, sp);
        return {
            table: {
                widths: ['58%', '42%'],
                body: [[left, right]]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => sp(8)
            },
            margin: [0, 0, 0, sp(10)]
        };
    },

    companyHeaderPurchase(doc) {
        const c = doc.company;
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        return this.companyHeaderSplit(doc, (f, s) => ({
            stack: [
                { text: doc.meta.docTitle, fontSize: f(14), bold: true, alignment: 'right' },
                doc.copyLabel
                    ? { text: `(${doc.copyLabel})`, fontSize: f(9), bold: true, alignment: 'right', margin: [0, s(2), 0, 0] }
                    : null,
                { text: `Date: ${doc.doc.dateDisplay || doc.doc.date || '-'}`, fontSize: f(8), alignment: 'right', margin: [0, s(4), 0, 0] },
                { text: `${doc.meta.docNoLabel || 'No'}: ${doc.doc.no || '-'}`, fontSize: f(8), alignment: 'right' }
            ].filter(Boolean)
        }));
    },

    partyBox(title, party) {
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const lines = [
            { text: title, fontSize: fs(7), bold: true, margin: [0, 0, 0, sp(4)] },
            { text: party.name || '-', fontSize: fs(11), bold: true, margin: [0, 0, 0, sp(2)] }
        ];
        if (party.address) lines.push({ text: party.address, fontSize: fs(8), color: '#444' });
        if (party.phone) lines.push({ text: `Phone: ${party.phone}`, fontSize: fs(8), color: '#444' });
        if (party.gstin) lines.push({ text: `GSTIN: ${party.gstin}`, fontSize: fs(8), bold: true, margin: [0, sp(4), 0, 0] });
        return {
            stack: lines,
            margin: [sp(8), sp(8), sp(8), sp(8)]
        };
    },

    twoPartyGrid(leftTitle, leftParty, rightTitle, rightRows) {
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const rightBody = rightRows.map(([label, value]) => [
            { text: label, fontSize: fs(8), color: '#666' },
            { text: String(value ?? '-'), fontSize: fs(8), bold: true, alignment: 'right', noWrap: true }
        ]);
        return {
            table: {
                widths: ['50%', '50%'],
                body: [[
                    {
                        stack: [this.partyBox(leftTitle, leftParty)],
                        border: [true, true, true, true]
                    },
                    {
                        stack: [
                            { text: rightTitle, fontSize: fs(7), bold: true, margin: [sp(8), sp(8), sp(8), sp(4)] },
                            {
                                table: {
                                    widths: ['*', 'auto'],
                                    body: rightBody
                                },
                                layout: 'noBorders',
                                margin: [sp(8), 0, sp(8), sp(8)]
                            }
                        ],
                        border: [true, true, true, true]
                    }
                ]]
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => '#ccc',
                vLineColor: () => '#ccc'
            },
            margin: [0, 0, 0, sp(10)]
        };
    },

    vendorBillGrid(doc) {
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const details = doc.billDetails || [];
        const rightBody = details.map(([label, value]) => [
            { text: label, fontSize: fs(8), color: '#444' },
            { text: String(value ?? '-'), fontSize: fs(8), bold: true }
        ]);
        return {
            table: {
                widths: ['50%', '50%'],
                body: [[
                    {
                        stack: [this.partyBox(doc.meta.vendorLabel || 'Bill From (Supplier)', doc.vendor)],
                        margin: [0, 0, sp(4), 0]
                    },
                    {
                        stack: [
                            { text: doc.meta.detailsLabel || 'Bill Details', fontSize: fs(7), bold: true, margin: [sp(8), sp(8), sp(8), sp(4)] },
                            {
                                table: { widths: [sp(90), '*'], body: rightBody },
                                layout: 'noBorders',
                                margin: [sp(8), 0, sp(8), sp(8)]
                            }
                        ],
                        border: [true, true, true, true]
                    }
                ]]
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 0
            },
            margin: [0, 0, 0, sp(10)]
        };
    },

    shipToBlock(doc) {
        if (!doc.shipTo?.show) return null;
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        return {
            table: {
                widths: ['100%'],
                body: [[{
                    stack: [
                        { text: 'Ship To / Delivery Address', fontSize: fs(7), bold: true, margin: [sp(8), sp(8), sp(8), sp(4)] },
                        { text: doc.shipTo.address || '-', fontSize: fs(8), margin: [sp(8), 0, sp(8), sp(8)] }
                    ],
                    border: [true, true, true, true]
                }]]
            },
            layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => '#000', vLineColor: () => '#000' },
            margin: [0, 0, 0, sp(10)]
        };
    },

    serviceLogBlock(doc) {
        if (!doc.serviceLog?.show) return null;
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const rows = [];
        if (doc.serviceLog.complaint) {
            rows.push([
                { text: 'Complaint:', bold: true, fontSize: fs(8) },
                { text: doc.serviceLog.complaint, fontSize: fs(8), color: '#666' }
            ]);
        }
        if (doc.serviceLog.workDone) {
            rows.push([
                { text: 'Work Performed:', bold: true, fontSize: fs(8) },
                { text: doc.serviceLog.workDone, fontSize: fs(8), color: '#666' }
            ]);
        }
        return {
            table: {
                widths: ['100%'],
                body: [[{
                    stack: [
                        { text: 'Service & Maintenance Log', fontSize: fs(8), bold: true, color: '#b8860b', margin: [sp(8), sp(6), sp(8), sp(4)] },
                        { table: { widths: ['auto', '*'], body: rows }, layout: 'noBorders', margin: [sp(8), 0, sp(8), sp(8)] }
                    ],
                    fillColor: '#fffdf5'
                }]]
            },
            layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => '#f0e6c8', vLineColor: () => '#f0e6c8' },
            margin: [0, 0, 0, sp(10)]
        };
    },

    termsSignatureFooter(doc, terms) {
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const termLines = (terms || doc.terms || []).map((t, i) => `${i + 1}. ${t}`);
        return {
            table: {
                widths: ['65%', '35%'],
                body: [[
                    {
                        stack: [
                            { text: 'Terms & Conditions:', fontSize: fs(8), bold: true, margin: [0, 0, 0, sp(4)] },
                            { text: termLines.join('\n'), fontSize: fs(7), color: '#666' }
                        ]
                    },
                    {
                        stack: [
                            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 120, y2: 0, lineWidth: 1, lineColor: '#eee' }], margin: [0, sp(20), 0, sp(4)] },
                            { text: 'Authorized Signatory', fontSize: fs(8), bold: true, alignment: 'center' },
                            { text: `For ${doc.company.name}`, fontSize: fs(7), color: '#666', alignment: 'center', margin: [0, sp(2), 0, 0] }
                        ]
                    }
                ]]
            },
            layout: 'noBorders',
            margin: [0, sp(12), 0, 0]
        };
    },

    setOffReferenceTable(doc) {
        const refs = doc.setOffReferences;
        if (!refs?.rows?.length) return null;
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        const fmt = (n) => (typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.formatMoney(n)
            : (parseFloat(n) || 0).toFixed(2));
        const hdr = (t) => ({
            text: t, bold: true, fontSize: fs(7), alignment: 'center', fillColor: '#e8e8e8'
        });
        const body = [
            [hdr('Invoice No. Reference'), hdr('Date'), hdr('Supplier Invoice No'), hdr('Amount')],
            ...refs.rows.map((r) => [
                { text: r.invoiceNo || '-', fontSize: fs(8), alignment: 'center' },
                { text: r.date || '-', fontSize: fs(8), alignment: 'center' },
                { text: r.supplierInvoiceNo || '', fontSize: fs(8), alignment: 'center' },
                { text: fmt(r.amount), fontSize: fs(8), alignment: 'right', noWrap: true }
            ]),
            [
                { text: 'Total', bold: true, fontSize: fs(8), colSpan: 3 }, {}, {},
                { text: `Rs.${fmt(refs.total)}`, bold: true, fontSize: fs(8), alignment: 'right', noWrap: true }
            ]
        ];
        return {
            table: {
                widths: ['32%', '22%', '28%', '18%'],
                body
            },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#000',
                vLineColor: () => '#000'
            },
            margin: [0, 0, 0, sp(8)]
        };
    },

    dcRemarksRow(doc) {
        const raw = String(doc.remarks || '').trim();
        if (!doc.meta?.isDc && !raw) return null;
        const text = raw || '-';
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        return {
            table: {
                widths: ['100%'],
                body: [[{
                    text: [{ text: 'Remarks: ', bold: true, fontSize: fs(8) }, { text, fontSize: fs(8) }],
                    margin: [sp(4), sp(4), sp(4), sp(4)]
                }]]
            },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#333',
                vLineColor: () => '#333'
            },
            margin: [0, 0, 0, sp(8)]
        };
    },

    purchaseSignatureFooter(doc) {
        const fs = (n) => this._ctx().fs(n);
        const sp = (n) => this._ctx().sp(n);
        return {
            stack: [
                { text: `For ${doc.company.name}`, alignment: 'right', fontSize: fs(9), margin: [0, sp(8), 0, 0] },
                { text: 'Authorized Signatory', alignment: 'right', bold: true, fontSize: fs(9), margin: [0, sp(24), 0, 0] },
                { text: doc.footerNote || '', alignment: 'center', fontSize: fs(7), color: '#64748b', margin: [0, sp(8), 0, 0] }
            ]
        };
    }
};

window.DocumentBlocks = DocumentBlocks;
