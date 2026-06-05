/**
 * Invoice Engine V3 — pdfmake document (Preview / Print / Download share one definition).
 */
const InvoicePdfMakeV3 = {
    marginMm: 8,
    COL: { sl: 10, hsn: 70, qty: 40, unit: 50, rate: 80, tax: 50, amt: 90 },
    _ctx: null,

    _mm(m) {
        return m * 2.834645669291;
    },

    _pdfCtx(settings = {}) {
        const normalized = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.normalize(settings)
            : settings;
        const marginMm = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.marginMm(normalized.marginPreset || 'normal')
            : this.marginMm;
        const scale = (normalized.scale || 100) / 100;
        const dims = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.pageDimensionsMm(normalized)
            : (normalized.orientation === 'landscape'
                ? { w: 297, h: 210 }
                : { w: 210, h: 297 });
        const marginPt = this._mm(marginMm);
        const pageSizePt = { width: this._mm(dims.w), height: this._mm(dims.h) };
        return {
            pageSizeName: normalized.pageSize === 'Letter' ? 'LETTER' : 'A4',
            orientation: normalized.orientation === 'landscape' ? 'landscape' : 'portrait',
            pageSizePt,
            contentWidthPt: pageSizePt.width - (2 * marginPt),
            pageWidthMm: dims.w,
            pageHeightMm: dims.h,
            marginMm,
            marginPreset: normalized.marginPreset || 'normal',
            scale,
            scalePct: normalized.scale || 100,
            fs: (n) => Math.max(5, Math.round(n * scale)),
            sp: (n) => Math.max(1, Math.round(n * scale)),
            marginPt
        };
    },

    /** Percent widths — always sum to 100% so pdfmake cannot star-expand on long descriptions. */
    _itemColumnWidths(isGst) {
        return isGst
            ? ['3%', '44%', '11%', '6%', '7%', '11%', '6%', '12%']
            : ['3%', '48%', '11%', '6%', '7%', '12%', '13%'];
    },

    _halfTableWidths() {
        const half = Math.floor(this._ctx.contentWidthPt / 2);
        return [half, this._ctx.contentWidthPt - half];
    },

    _money(n) {
        return `₹${(parseFloat(n) || 0).toFixed(2)}`;
    },

    _plainText(html) {
        return String(html ?? '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+\n/g, '\n')
            .trim();
    },

    _descStack(row, fs) {
        const desc = this._plainText(row.desc);
        if (!desc) {
            return [{ text: row.name, bold: true, fontSize: fs(8) }];
        }
        return [
            { text: row.name, bold: true, fontSize: fs(8) },
            { text: desc, fontSize: fs(7), italics: true }
        ];
    },

    _numCell(text, opts = {}) {
        const fs = this._ctx?.fs(8) || 8;
        return {
            text: String(text ?? ''),
            fontSize: opts.fontSize || fs,
            noWrap: true,
            alignment: 'right',
            ...opts
        };
    },

    _labelValueRows(rows, fs) {
        return rows.map(([label, value]) => ([
            { text: label, bold: true, fontSize: fs, border: [false, false, false, false] },
            { text: ':', fontSize: fs, border: [false, false, false, false] },
            { text: String(value ?? '-'), fontSize: fs, border: [false, false, false, false] }
        ]));
    },

    _headerBlock(doc) {
        const c = doc.company;
        const fs = (n) => this._ctx.fs(n);
        const sp = (n) => this._ctx.sp(n);
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

    _docForCopy(doc, copyType) {
        const label = copyType === 'none'
            ? ''
            : (typeof InvoiceDataV3 !== 'undefined'
                ? InvoiceDataV3.copyLabel(copyType)
                : String(copyType || '').toUpperCase());
        return { ...doc, copyType, copyLabel: label };
    },

    _contentBlocks(doc) {
        const blocks = [
            this._headerBlock(doc),
            this._infoDispatchGrid(doc),
            this._receiverConsigneeGrid(doc),
            this._itemsTable(doc)
        ];
        const setOff = typeof DocumentBlocks !== 'undefined'
            ? DocumentBlocks.setOffReferenceTable(doc)
            : null;
        if (setOff) blocks.push(setOff);
        blocks.push(this._closingBlock(doc));
        return blocks;
    },

    _infoDispatchGrid(doc) {
        const inv = doc.invoice;
        const fs = (n) => this._ctx.fs(n);
        const sp = (n) => this._ctx.sp(n);
        const line = (text) => ({ text, fontSize: fs(8), margin: [0, 0, 0, sp(2)] });
        const noLabel = doc.meta.isDc ? 'Delivery Challan No' : 'Invoice No';
        const leftStack = [
            line(`${noLabel} : ${inv.no || '-'}`),
            line(`Date : ${inv.dateDisplay || inv.date || '-'}`),
            line(`Purchase Order No : ${inv.poNumber || '-'}`)
        ];
        const rightStack = [
            line(`Dispatch Document No : ${inv.dispatchDocumentNo || '-'}`),
            line(`Dispatch Through : ${inv.dispatchThrough || '-'}`),
            line(`Destination : ${inv.destination || '-'}`),
            line(`e-Way Bill No. : ${inv.ewayBillNo || '-'}`)
        ];
        const pad = sp(6);
        const marginB = sp(8);
        return {
            table: {
                widths: this._halfTableWidths(),
                body: [[
                    { stack: leftStack, margin: [pad, pad, pad, pad] },
                    { stack: rightStack, margin: [pad, pad, pad, pad] }
                ]]
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => '#000',
                vLineColor: () => '#000'
            },
            margin: [0, 0, 0, marginB]
        };
    },

    _partyLines(party, fs) {
        const lines = [
            { text: party.name, bold: true, fontSize: fs(9), margin: [0, 0, 0, 2] }
        ];
        if (party.address) lines.push({ text: party.address, fontSize: fs(8) });
        if (party.state) lines.push({ text: `State: ${party.state}`, fontSize: fs(8) });
        if (party.country) lines.push({ text: `Country: ${party.country}`, fontSize: fs(8) });
        if (party.pin) lines.push({ text: `Pin: ${party.pin}`, fontSize: fs(8) });
        if (party.phone) lines.push({ text: `Phone: ${party.phone}`, fontSize: fs(8) });
        if (party.gstin) lines.push({ text: `GSTIN: ${party.gstin}`, fontSize: fs(8), margin: [0, 2, 0, 0] });
        if (party.pan) lines.push({ text: `PAN: ${party.pan}`, fontSize: fs(8) });
        return lines;
    },

    _receiverConsigneeGrid(doc) {
        const fs = (n) => this._ctx.fs(n);
        const sp = (n) => this._ctx.sp(n);
        const hdrStyle = { bold: true, fontSize: fs(8), alignment: 'center', fillColor: '#e8e8e8' };
        return {
            table: {
                widths: this._halfTableWidths(),
                body: [
                    [
                        { text: 'Details of Receiver (Billed To)', ...hdrStyle },
                        { text: 'Details of Consignee (Shipped To)', ...hdrStyle }
                    ],
                    [
                        { stack: this._partyLines(doc.receiver, fs), margin: [sp(4), sp(4), sp(4), sp(4)] },
                        { stack: this._partyLines(doc.consignee, fs), margin: [sp(4), sp(4), sp(4), sp(4)] }
                    ]
                ]
            },
            layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => '#000',
                vLineColor: () => '#000'
            },
            margin: [0, 0, 0, sp(8)]
        };
    },

    _itemsTable(doc) {
        const isGst = doc.meta.isGst && !doc.meta.isPlain;
        const fs = (n) => this._ctx.fs(n);
        const sp = (n) => this._ctx.sp(n);
        const C = this.COL;
        const header = isGst
            ? ['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Tax %', 'Amount']
            : ['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Amount'];

        const widths = this._itemColumnWidths(isGst);

        const body = [header.map((h) => ({
            text: h, bold: true, fontSize: fs(7), fillColor: '#4a5568', color: '#fff', alignment: 'center', noWrap: true
        }))];

        doc.items.forEach((row) => {
            const cells = [
                { text: String(row.sl), alignment: 'center', fontSize: fs(6), noWrap: true },
                { stack: this._descStack(row, fs) },
                this._numCell(row.hsn),
                this._numCell(row.qty),
                this._numCell(row.unit),
                this._numCell(row.rate.toFixed(2))
            ];
            if (isGst) cells.push(this._numCell(row.taxPct || ''));
            cells.push(this._numCell(row.amount.toFixed(2), { bold: true }));
            body.push(cells);
        });

        if (doc.meta.isDc) {
            const colCount = isGst ? 8 : 7;
            const remarksText = String(doc.remarks || '').trim() || '-';
            const remarksRow = [
                { text: 'Remarks:', bold: true, fontSize: fs(7), alignment: 'left' },
                { text: remarksText, fontSize: fs(7), colSpan: colCount - 1, alignment: 'left' }
            ];
            for (let i = 2; i < colCount; i++) remarksRow.push({});
            body.push(remarksRow);
        }

        return {
            table: { headerRows: 1, widths, dontBreakRows: true, body },
            layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#64748b',
                vLineColor: () => '#64748b',
                paddingLeft: () => 2,
                paddingRight: () => 2
            },
            margin: [0, 0, 0, sp(8)]
        };
    },

    _closingBlock(doc) {
        const s = doc.summary;
        const fs = (n) => this._ctx.fs(n);
        const sp = (n) => this._ctx.sp(n);
        const summaryRows = [
            ['Subtotal', this._money(s.subtotal)],
            ['CGST', this._money(s.cgst)],
            ['SGST', this._money(s.sgst)],
            ['IGST', this._money(s.igst)],
            ['Round Off', this._money(s.roundOff)],
            ['Grand Total', this._money(s.grandTotal)]
        ];

        return {
            table: {
                widths: this._halfTableWidths(),
                body: [[
                    {
                        stack: [
                            ...(doc.meta.isDc ? [{
                                text: 'Received in Good Condition',
                                fontSize: fs(8),
                                bold: true,
                                margin: [0, 0, 0, sp(8)]
                            }] : []),
                            { text: `Amount in Words: ${s.amountInWords}`, fontSize: fs(8), italics: true, margin: [0, 0, 0, sp(8)] },
                            { text: 'Terms & Conditions', bold: true, fontSize: fs(8), margin: [0, 0, 0, sp(4)] },
                            { text: doc.terms.join('\n'), fontSize: fs(8), margin: [0, 0, 0, sp(8)] },
                            { text: doc.bankLine, fontSize: fs(8) }
                        ]
                    },
                    {
                        stack: [
                            {
                                table: {
                                    widths: ['*', sp(70)],
                                    body: summaryRows.map(([l, v]) => [
                                        { text: l, alignment: 'right', fontSize: fs(8) },
                                        { text: v, alignment: 'right', fontSize: fs(8), bold: l === 'Grand Total', noWrap: true }
                                    ])
                                },
                                layout: 'lightHorizontalLines'
                            },
                            { text: `For ${doc.company.name}`, alignment: 'right', margin: [0, sp(12), 0, 0], fontSize: fs(9) },
                            { text: 'Authorized Signatory', alignment: 'right', margin: [0, sp(28), 0, 0], bold: true, fontSize: fs(9) },
                            { text: doc.footerNote, alignment: 'right', fontSize: fs(7), color: '#666', margin: [0, sp(8), 0, 0] }
                        ]
                    }
                ]]
            },
            layout: 'noBorders'
        };
    },

    buildDocumentDefinition(doc, settings = {}) {
        this._ctx = this._pdfCtx(settings);
        const ctx = this._ctx;
        const m = ctx.marginPt;
        const copyTypes = doc.copyTypes?.length
            ? DocumentSettings.normalizeCopyTypes(doc.copyTypes)
            : DocumentSettings.normalizeCopyTypes([doc.copyType || 'original']);
        const content = [];
        copyTypes.forEach((copyType, idx) => {
            const blocks = this._contentBlocks(this._docForCopy(doc, copyType));
            if (idx > 0) blocks[0] = { ...blocks[0], pageBreak: 'before' };
            content.push(...blocks);
        });
        return {
            pageSize: ctx.pageSizeName,
            pageOrientation: ctx.orientation,
            pageMargins: [m, m, m, m],
            defaultStyle: { font: 'Roboto', fontSize: ctx.fs(9), color: '#111' },
            content,
            info: {
                title: `Invoice ${doc.invoice.no}`,
                author: doc.company.name
            }
        };
    },

    _ensurePdfMake() {
        if (typeof PdfMakeInit !== 'undefined') {
            return PdfMakeInit.ensureReady();
        }
        if (typeof pdfMake === 'undefined') {
            throw new Error('pdfmake not loaded — run: npm install pdfmake');
        }
        if (!pdfMake.fonts?.Roboto) {
            throw new Error(
                'pdfmake Roboto font missing — load node_modules/pdfmake/build/fonts/Roboto.js after vfs_fonts.js'
            );
        }
        return pdfMake;
    },

    _base64ToBytes(b64) {
        const binary = atob(b64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    },

    _resolvePdfOutput(pdf, finish, fail) {
        const handleMaybePromise = (result, mapper) => {
            if (result && typeof result.then === 'function') {
                result.then((val) => {
                    try {
                        mapper(val);
                    } catch (e) {
                        fail(e);
                    }
                }).catch(fail);
                return true;
            }
            return false;
        };

        if (typeof pdf.getBase64 === 'function') {
            if (pdf.getBase64.length === 0) {
                const p = pdf.getBase64();
                if (handleMaybePromise(p, (data) => {
                    const raw = String(data || '').replace(/^data:.*?;base64,/, '');
                    finish(this._base64ToBytes(raw));
                })) return;
            } else {
                pdf.getBase64((data) => {
                    const raw = String(data || '').replace(/^data:.*?;base64,/, '');
                    finish(this._base64ToBytes(raw));
                });
                return;
            }
        }

        if (typeof pdf.getBlob === 'function') {
            if (pdf.getBlob.length === 0) {
                const p = pdf.getBlob();
                if (handleMaybePromise(p, (blob) => {
                    if (!blob) throw new Error('pdfmake getBlob returned null');
                    blob.arrayBuffer().then((ab) => finish(new Uint8Array(ab))).catch(fail);
                })) return;
            } else {
                pdf.getBlob((blob) => {
                    if (!blob) {
                        fail(new Error('pdfmake getBlob returned null'));
                        return;
                    }
                    blob.arrayBuffer().then((ab) => finish(new Uint8Array(ab))).catch(fail);
                });
                return;
            }
        }

        if (typeof pdf.getBuffer === 'function') {
            if (pdf.getBuffer.length === 0) {
                const p = pdf.getBuffer();
                if (handleMaybePromise(p, (buffer) => finish(buffer))) return;
            } else {
                pdf.getBuffer((buffer) => finish(buffer));
                return;
            }
        }

        fail(new Error('pdfmake output API unavailable'));
    },

    async generatePdfBytes(doc, settings = {}) {
        this._ensurePdfMake();
        const normalized = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.normalize(settings)
            : settings;
        let def;
        try {
            def = this.buildDocumentDefinition(doc, normalized);
            const ctx = this._ctx;
            console.log('[InvoicePdfMakeV3] Orientation selected:', normalized.orientation);
            console.log('[InvoicePdfMakeV3] Orientation used in PDF:', ctx?.orientation, {
                widthPt: ctx?.pageSizePt?.width,
                heightPt: ctx?.pageSizePt?.height,
                widthMm: ctx?.pageWidthMm,
                heightMm: ctx?.pageHeightMm
            });
            const copyTypes = doc.copyTypes?.length
                ? DocumentSettings.normalizeCopyTypes(doc.copyTypes)
                : DocumentSettings.normalizeCopyTypes([doc.copyType || 'original']);
            console.log('[InvoicePdfMakeV3] buildDocumentDefinition', DocumentSettings?.toLog(normalized, copyTypes.join('+')) || normalized, {
                pageSize: def.pageSize,
                pageOrientation: def.pageOrientation,
                copyTypes,
                contentWidthPt: ctx?.contentWidthPt,
                itemWidths: this._itemColumnWidths(doc.meta?.isGst && !doc.meta?.isPlain),
                pageMargins: def.pageMargins
            });
            return await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('pdfmake timed out after 45s')), 45000);
                const finish = (bytes) => {
                    clearTimeout(timeout);
                    if (!bytes?.length) {
                        reject(new Error('pdfmake returned empty PDF'));
                        return;
                    }
                    console.log('[InvoicePdfMakeV3] PDF bytes', bytes.length);
                    resolve(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
                };
                const fail = (err) => {
                    clearTimeout(timeout);
                    reject(err instanceof Error ? err : new Error(String(err)));
                };
                try {
                    const pdf = pdfMake.createPdf(def);
                    this._resolvePdfOutput(pdf, finish, fail);
                } catch (e) {
                    fail(e);
                }
            });
        } finally {
            this._ctx = null;
        }
    },

    async generatePdfBase64(doc, settings = {}) {
        const bytes = await this.generatePdfBytes(doc, settings);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }
};

window.InvoicePdfMakeV3 = InvoicePdfMakeV3;
