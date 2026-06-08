/**
 * Document Engine V4 — Delivery / Service Challan.
 * Delivery challans use the same print layout as imported BookKeeper DCs (Invoice V3).
 */
const ChallanDataV4 = {
    _lineDesc(item) {
        return typeof DcReturnable !== 'undefined'
            ? DcReturnable.itemLineDescription(item)
            : String(item.itemDescription || item.description || '').trim();
    },

    _resolveReceiptItems(challan) {
        if (Array.isArray(challan.equipmentItems) && challan.equipmentItems.length) {
            return challan.equipmentItems.map((row) => ({
                itemName: (row.itemName || row.name || '').trim(),
                description: (row.description || '').trim(),
                quantity: parseInt(row.quantity, 10) || 1,
                complaint: (row.complaint || '').trim()
            })).filter((row) => row.itemName);
        }
        const items = challan.items || [];
        if (items.some((row) => Object.prototype.hasOwnProperty.call(row, 'complaint'))) {
            return items.map((row) => ({
                itemName: (row.name || '').trim(),
                description: (row.description || '').trim(),
                quantity: parseInt(row.quantity, 10) || 1,
                complaint: (row.complaint || '').trim()
            })).filter((row) => row.itemName);
        }
        if (challan.jobCardId && typeof JobCardManager !== 'undefined') {
            const jobCard = JobCardManager.getJobCard(challan.jobCardId);
            if (jobCard) return JobCardManager.normalizeEquipmentItems(jobCard);
        }
        return [];
    },

    _buildPseudoInvoice(challan, customerName, customerAddress) {
        return {
            customerId: challan.customerId,
            customerName,
            customerAddress,
            poNumber: challan.poNumber || challan.referenceNumber || '',
            narration: challan.narration || challan.remarks || challan.notes || challan.workDone || '',
            placeOfSupply: challan.destination || challan.placeOfSupply || '',
            shipToAddress: challan.shipToAddress || '',
            shipToName: challan.shipToName || '',
            shipSameAsBilling: challan.shipSameAsBilling !== false,
            includeShipToOnPdf: challan.includeShipToOnPdf !== false,
            destination: challan.destination || '',
            dispatchDocumentNo: challan.dispatchDocumentNo || '',
            ewayBillNo: challan.ewayBillNo || challan.eWayBillNo || '',
            dispatchDetails: {
                via: challan.dispatchVia || '',
                lrNo: challan.lrNo || '',
                vehicleNo: challan.vehicleNo || '',
                date: challan.dispatchDate || '',
                documentNo: challan.dispatchDocumentNo || '',
                dispatchThrough: challan.dispatchVia || '',
                destination: challan.destination || '',
                ewayBillNo: challan.ewayBillNo || challan.eWayBillNo || ''
            }
        };
    },

    _buildServiceItems(challan) {
        const receiptItems = this._resolveReceiptItems(challan);
        const source = receiptItems.length
            ? receiptItems
            : (challan.items || []).map((row) => ({
                itemName: (row.name || row.itemName || '').trim(),
                description: (row.description || row.itemDescription || '').trim(),
                quantity: parseInt(row.quantity, 10) || 1,
                complaint: (row.complaint || '').trim()
            })).filter((row) => row.itemName);

        return source.map((row, idx) => {
            const descParts = [];
            if (row.description) descParts.push(row.description);
            if (row.complaint) descParts.push(`Complaint: ${row.complaint}`);
            const desc = descParts.join('\n');
            return {
                sl: idx + 1,
                name: row.itemName || '-',
                desc,
                hsn: '-',
                qty: parseInt(row.quantity, 10) || 1,
                unit: 'nos',
                rate: 0,
                taxPct: '',
                amount: 0,
                rowHeightPt: 20 + (desc ? 10 : 0)
            };
        });
    },

    async _buildDeliveryDcDoc(challan, challanId, docType) {
        const isServiceChallan = challan.type === 'service' || docType === 'service-challan';
        const customer = typeof CustomerManager !== 'undefined'
            ? CustomerManager.getCustomer(challan.customerId)
            : null;
        const partySnap = typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.resolveCustomerSnapshot({
                customerId: challan.customerId,
                customerName: challan.customerName,
                snapshot: {
                    customerName: challan.customerName,
                    customerAddress: challan.customerAddress,
                    customerGstin: challan.customerGstin,
                    customerPan: challan.customerPan,
                    customerPhone: challan.customerPhone
                }
            })
            : {
                name: challan.customerName || customer?.name || 'Walk-in Customer',
                address: challan.customerAddress || customer?.address || '',
                gstin: customer?.gstin || '',
                pan: customer?.pan || ''
            };

        if (!partySnap.address && challan.invoiceId && typeof InvoiceManager !== 'undefined') {
            const inv = InvoiceManager.getInvoice(challan.invoiceId);
            if (inv?.customerAddress) partySnap.address = inv.customerAddress;
            if (inv?.customerName && !partySnap.name) partySnap.name = inv.customerName;
            if (inv?.customerGstin && !partySnap.gstin) partySnap.gstin = inv.customerGstin;
            if (inv?.customerPan && !partySnap.pan) partySnap.pan = inv.customerPan;
        }

        const customerName = partySnap.name || 'Walk-in Customer';
        const customerAddress = partySnap.address || '';

        const company = typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.buildCompany()
            : (typeof InvoiceDataV3 !== 'undefined' ? {} : {});
        const pseudo = this._buildPseudoInvoice(challan, customerName, customerAddress);
        pseudo.customerAddress = customerAddress;
        pseudo.customerGstin = partySnap.gstin || '';
        pseudo.customerPan = partySnap.pan || '';
        const cust = {
            ...(customer || {}),
            name: customerName,
            address: customerAddress,
            gstin: partySnap.gstin || customer?.gstin || '',
            pan: partySnap.pan || customer?.pan || '',
            phone: partySnap.phone || customer?.phone || '',
            state: partySnap.state || customer?.state || '',
            pincode: partySnap.pin || customer?.pincode || '',
            country: partySnap.country || customer?.country || 'India'
        };

        const receiver = typeof InvoiceDataV3 !== 'undefined'
            ? InvoiceDataV3._buildParty(cust, pseudo, 'receiver')
            : { name: customerName, address: customerAddress };
        const consignee = typeof InvoiceDataV3 !== 'undefined'
            ? InvoiceDataV3._buildParty(cust, pseudo, 'consignee')
            : receiver;
        const dispatch = typeof InvoiceDataV3 !== 'undefined'
            ? InvoiceDataV3._buildDispatch(pseudo)
            : {
                poNumber: pseudo.poNumber || '-',
                dispatchDocumentNo: '-',
                dispatchThrough: challan.dispatchVia || '-',
                destination: challan.destination || '-',
                ewayBillNo: '-'
            };

        const isGst = !!challan.gstMode;
        const masterInventory = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
        const cgstPct = parseFloat(challan.cgstPercent) || 0;
        const sgstPct = parseFloat(challan.sgstPercent) || 0;
        const igstPct = parseFloat(challan.igstPercent) || 0;
        const useIgst = isGst && igstPct > 0 && (parseFloat(challan.igst) || 0) > 0;

        const items = isServiceChallan
            ? this._buildServiceItems(challan)
            : (challan.items || []).map((item, idx) => {
                const desc = this._lineDesc(item);
                const invRow = masterInventory.find((m) =>
                    String(m.name || '').toLowerCase() === String(item.name || '').toLowerCase());
                const retBadge = typeof DcReturnable !== 'undefined' && DcReturnable.isReturnable(item)
                    ? ' [Returnable]'
                    : '';
                let taxPct = '';
                if (isGst) {
                    taxPct = useIgst ? `${igstPct}%` : `${parseFloat((cgstPct + sgstPct).toFixed(2))}%`;
                }
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.rate) || 0;
                const amount = parseFloat(item.amount) || (qty * rate);
                return {
                    sl: idx + 1,
                    name: (item.name || item.description || '') + retBadge,
                    desc,
                    hsn: item.hsn || invRow?.hsn || invRow?.hsnCode || '-',
                    qty,
                    unit: item.unit || 'nos',
                    rate,
                    taxPct,
                    amount,
                    rowHeightPt: 20 + (desc ? 10 : 0)
                };
            });

        const subtotal = parseFloat(challan.subtotal) || items.reduce((s, r) => s + r.amount, 0);
        const cgst = parseFloat(challan.cgst) || 0;
        const sgst = parseFloat(challan.sgst) || 0;
        const igst = parseFloat(challan.igst) || 0;
        const roundOff = parseFloat(challan.roundOff) || 0;
        const grandTotal = parseFloat(challan.total) || (subtotal + cgst + sgst + igst + roundOff);
        const amountWords = typeof InvoicesUI !== 'undefined' && InvoicesUI.numberToWords
            ? InvoicesUI.numberToWords(grandTotal)
            : grandTotal.toFixed(2);

        const adapter = typeof DocumentTemplates !== 'undefined'
            ? DocumentTemplates.get(isServiceChallan ? 'service-challan' : 'delivery-challan')
            : null;
        const modalOpen = document.getElementById('pdfPreviewModal')?.classList.contains('show');
        const copyTypes = adapter && typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.resolveCopyTypes(adapter, challanId, modalOpen)
            : ['original'];
        const copyType = copyTypes[0] || 'original';
        const serviceAckText = 'We acknowledge receipt of the following materials with complaints as stated above.';
        let remarks = isServiceChallan
            ? String(challan.narration || challan.remarks || challan.workDone || '').trim()
            : (typeof DocumentBuildCommon !== 'undefined'
                ? DocumentBuildCommon.resolveDocumentRemarks(challan)
                : String(pseudo.narration || '').trim());
        const serviceAck = isServiceChallan
            ? (String(challan.notes || '').trim() || serviceAckText)
            : null;

        const bank = company.bank || {};
        return {
            challanId,
            meta: {
                isGst: isServiceChallan ? false : isGst,
                isPlain: isServiceChallan ? true : !isGst,
                isDc: true,
                isCreditNote: false,
                isInterstate: useIgst,
                isService: false,
                isServiceChallan,
                docTitle: isServiceChallan ? 'SERVICE CHALLAN' : 'DELIVERY CHALLAN',
                docSubtitle: isServiceChallan ? '(Material Received for Service — Customer Copy)' : null
            },
            copyTypes,
            copyType,
            copyLabel: typeof InvoiceDataV3 !== 'undefined'
                ? InvoiceDataV3.copyLabel(copyType)
                : (typeof DocumentBuildCommon !== 'undefined' ? DocumentBuildCommon.copyLabel(copyType) : 'ORIGINAL'),
            company,
            invoice: (() => {
                const dateDisplay = typeof InvoiceDataV3 !== 'undefined'
                    ? InvoiceDataV3._formatDateDisplay(challan.date)
                    : (typeof DocumentBuildCommon !== 'undefined'
                        ? DocumentBuildCommon.formatDateDisplay(challan.date)
                        : challan.date);
                const base = {
                    no: challan.id,
                    date: challan.date || '',
                    dateDisplay,
                    jobCardNo: challan.jobCardId || null
                };
                if (isServiceChallan) {
                    return {
                        ...base,
                        customerRef: challan.referenceNumber || ''
                    };
                }
                return { ...base, ...dispatch };
            })(),
            receiver,
            consignee,
            customer: receiver,
            shipTo: { show: true },
            items,
            summary: {
                subtotal,
                cgst,
                sgst,
                igst,
                roundOff,
                grandTotal,
                amountInWords: `Rupees ${amountWords} Only`
            },
            terms: isServiceChallan
                ? [
                    '1. This document acknowledges receipt of materials for service/repair.',
                    '2. Complaints stated above are as reported by the customer at time of handover.',
                    '3. Subject to Chennai Jurisdiction.'
                ]
                : [
                    '1. Goods once sold will not be taken back.',
                    '2. Subject to Chennai Jurisdiction.'
                ],
            bankLine: `Bank: ${bank.bankName || '-'} | A/c: ${bank.accountNo || '-'} | IFSC: ${bank.ifsc || '-'}`,
            footerNote: isServiceChallan ? 'Computer generated service challan.' : 'Computer generated delivery challan.',
            serviceAck,
            remarks: remarks || null
        };
    },

    async _buildServiceDoc(challan, challanId, docType) {
        const isService = docType === 'service-challan' || challan.type === 'service';
        const customer = typeof CustomerManager !== 'undefined'
            ? CustomerManager.getCustomer(challan.customerId)
            : null;
        let customerName = customer?.name || challan.customerName || '';
        let customerAddress = customer?.address || challan.customerAddress || '';
        if (!customerName) customerName = 'Walk-in Customer';

        const company = DocumentBuildCommon.buildCompany();
        const receiptItems = this._resolveReceiptItems(challan);
        const isReceiptAck = receiptItems.length > 0;
        const items = (challan.items || []).map((item, idx) => {
            const desc = DocumentPdfBase._plainText(this._lineDesc(item));
            const replaced = item.materialChanged
                ? `Replaced: ${item.replacedDescription || 'Replaced'}`
                : '';
            const retBadge = typeof DcReturnable !== 'undefined' && DcReturnable.isReturnable(item)
                ? ' [Returnable]'
                : '';
            return {
                sl: idx + 1,
                name: (item.name || item.description || '') + retBadge,
                desc: [desc, replaced].filter(Boolean).join('\n'),
                qty: item.quantity,
                unit: item.unit || 'pcs',
                rate: parseFloat(item.rate) || 0,
                amount: parseFloat(item.amount) || 0,
                rowHeightPt: DocumentBuildCommon.itemRowHeight({ desc })
            };
        });

        const docInfoRows = [
            ['Date', DocumentBuildCommon.formatDateDisplay(challan.date)]
        ];
        if (challan.jobCardId) docInfoRows.push(['Job Card No', challan.jobCardId]);
        if (challan.referenceNumber) docInfoRows.push(['Customer DC / Ref', challan.referenceNumber]);
        if (challan.dispatchVia) docInfoRows.push(['Dispatch Via', challan.dispatchVia]);
        if (challan.lrNo) docInfoRows.push(['LR / Track No', challan.lrNo]);
        if (challan.vehicleNo) docInfoRows.push(['Vehicle No', challan.vehicleNo]);
        if (challan.dispatchDate) docInfoRows.push(['Dispatch Date', DocumentBuildCommon.formatDateDisplay(challan.dispatchDate)]);
        if (challan.technicianId) docInfoRows.push(['Technician', challan.technicianId]);

        const remarks = DocumentBuildCommon.resolveDocumentRemarks(challan) || null;
        const receiptIntro = isReceiptAck
            ? (challan.notes || 'We acknowledge receipt of the following materials with complaints as stated above.')
            : null;

        return {
            challanId,
            meta: {
                docTitle: isReceiptAck ? 'Material Received Acknowledgment' : (isService ? 'Service Challan' : 'Delivery Challan'),
                docSubtitle: isReceiptAck ? 'Service Challan' : null,
                isService,
                isReceiptAck,
                isGst: !!challan.gstMode,
                gstBadge: challan.gstMode ? 'Taxable Document' : 'Receipt / Acknowledgment'
            },
            company,
            doc: { no: challan.id, date: challan.date, dateDisplay: DocumentBuildCommon.formatDateDisplay(challan.date) },
            customer: {
                name: customerName,
                address: customerAddress,
                phone: customer?.phone || challan.customerPhone || '',
                gstin: customer?.gstin || ''
            },
            docInfoRows,
            receiptIntro,
            receiptItems: receiptItems.map((row, idx) => ({
                sl: idx + 1,
                itemName: row.itemName || '-',
                description: row.description || '',
                quantity: row.quantity ?? 1,
                complaint: row.complaint || '-'
            })),
            serviceLog: {
                show: !isReceiptAck && !!(challan.complaint || challan.workDone || challan.faultReported),
                complaint: challan.complaint || challan.faultReported || '',
                workDone: challan.workDone || ''
            },
            items,
            summary: {
                subtotal: parseFloat(challan.subtotal) || 0,
                tax: (parseFloat(challan.cgst) || 0) + (parseFloat(challan.sgst) || 0) + (parseFloat(challan.igst) || 0),
                total: parseFloat(challan.total) || 0
            },
            terms: isReceiptAck
                ? [
                    'This document acknowledges receipt of materials for service/repair.',
                    'Complaints stated above are as reported by the customer at time of handover.',
                    'Subject to city jurisdiction.'
                ]
                : [
                    'Goods once sold will not be taken back.',
                    'Subject to city jurisdiction.',
                    'Please verify items before project handover.'
                ],
            remarks
        };
    },

    async build(challanId, docType) {
        const challan = typeof DeliveryManager !== 'undefined'
            ? DeliveryManager.getChallan(challanId)
            : null;
        if (!challan) return null;

        return this._buildDeliveryDcDoc(challan, challanId, docType);
    }
};

const ChallanLayoutV4 = {
    paginate(doc, settings = {}) {
        if (!doc.meta?.isService && typeof InvoiceLayoutV3 !== 'undefined') {
            return InvoiceLayoutV3.paginate(doc, settings);
        }
        const receiptExtra = doc.meta.isReceiptAck
            ? 24 + (doc.receiptItems?.length || 0) * 16
            : 0;
        return DocumentPaginate.paginate(doc, settings, {
            header: 72,
            prefix: 0,
            party: 96,
            extra: (doc.serviceLog?.show ? 48 : 0) + receiptExtra,
            tableHeader: 24,
            closing: doc.meta.isReceiptAck ? 72 : (doc.meta.isService ? 56 : 88)
        });
    }
};

const ChallanPdfV4 = {
    _descStack(row) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const desc = DocumentPdfBase._plainText(row.desc);
        if (!desc) return [{ text: row.name, bold: true, fontSize: fs(8) }];
        return [
            { text: row.name, bold: true, fontSize: fs(8) },
            { text: desc, fontSize: fs(7), italics: true, color: '#666' }
        ];
    },

    _columnWidths(doc) {
        if (doc.meta.isReceiptAck) return ['6%', '22%', '24%', '10%', '38%'];
        if (doc.meta.isService) return ['6%', '58%', '18%', '18%'];
        return ['6%', '44%', '12%', '12%', '13%', '13%'];
    },

    _receiptItemsTable(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const head = [
            { text: '#', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Item Name', bold: true, fontSize: fs(7) },
            { text: 'Description', bold: true, fontSize: fs(7) },
            { text: 'Qty', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Complaint', bold: true, fontSize: fs(7) }
        ];
        const body = [head];
        (doc.receiptItems || []).forEach((row) => {
            body.push([
                { text: String(row.sl), alignment: 'center', fontSize: fs(8), color: '#666' },
                { text: row.itemName || '-', fontSize: fs(8), bold: true },
                { text: row.description || '—', fontSize: fs(8) },
                DocumentPdfBase._numCell(row.quantity, { alignment: 'center' }),
                { text: row.complaint || '—', fontSize: fs(8) }
            ]);
        });
        body.push([
            {
                text: 'Received by customer — signature & date',
                colSpan: 5,
                alignment: 'center',
                italics: true,
                fontSize: fs(7),
                color: '#666',
                margin: [0, sp(16), 0, sp(8)]
            },
            {}, {}, {}, {}
        ]);
        return {
            table: { headerRows: 1, widths: this._columnWidths(doc), body },
            layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
                vLineWidth: () => 0.5,
                hLineColor: () => '#333',
                vLineColor: () => '#333',
                fillColor: (i) => (i === 0 ? '#f8f9fa' : null)
            },
            margin: [0, 0, 0, sp(10)]
        };
    },

    _receiptSignatureFooter(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const termLines = (doc.terms || []).map((t, i) => `${i + 1}. ${t}`);
        const signLine = (label, sub) => ({
            stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 1, lineColor: '#eee' }], margin: [0, sp(20), 0, sp(4)] },
                { text: label, fontSize: fs(8), bold: true, alignment: 'center' },
                { text: sub, fontSize: fs(7), color: '#666', alignment: 'center', margin: [0, sp(2), 0, 0] }
            ]
        });
        return {
            table: {
                widths: ['50%', '25%', '25%'],
                body: [[
                    {
                        stack: [
                            { text: 'Terms & Conditions:', fontSize: fs(8), bold: true, margin: [0, 0, 0, sp(4)] },
                            { text: termLines.join('\n'), fontSize: fs(7), color: '#666' }
                        ]
                    },
                    signLine('Authorized Signatory', `For ${doc.company.name}`),
                    signLine('Received by Customer', 'Customer signature & date')
                ]]
            },
            layout: 'noBorders',
            margin: [0, sp(12), 0, 0]
        };
    },

    _itemsTable(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const isService = doc.meta.isService;
        const head = isService
            ? [
                { text: '#', alignment: 'center', bold: true, fontSize: fs(7) },
                { text: 'Material / Description', bold: true, fontSize: fs(7) },
                { text: 'Qty', alignment: 'center', bold: true, fontSize: fs(7) },
                { text: 'Unit', alignment: 'center', bold: true, fontSize: fs(7) }
            ]
            : [
                { text: '#', alignment: 'center', bold: true, fontSize: fs(7) },
                { text: 'Material / Description', bold: true, fontSize: fs(7) },
                { text: 'Qty', alignment: 'center', bold: true, fontSize: fs(7) },
                { text: 'Unit', alignment: 'center', bold: true, fontSize: fs(7) },
                { text: 'Rate', alignment: 'right', bold: true, fontSize: fs(7) },
                { text: 'Amount', alignment: 'right', bold: true, fontSize: fs(7) }
            ];

        const body = [head];
        doc.items.forEach((row) => {
            const cells = [
                { text: String(row.sl), alignment: 'center', fontSize: fs(8), color: '#666' },
                { stack: this._descStack(row) },
                DocumentPdfBase._numCell(row.qty, { alignment: 'center' }),
                { text: row.unit, alignment: 'center', fontSize: fs(8), noWrap: true }
            ];
            if (!isService) {
                cells.push(DocumentPdfBase._numCell(DocumentBuildCommon.formatMoney(row.rate)));
                cells.push(DocumentPdfBase._numCell(DocumentBuildCommon.formatMoney(row.amount), { bold: true }));
            }
            body.push(cells);
        });

        if (!isService) {
            const span = 4;
            body.push([
                { text: '', colSpan: span, border: [false, false, false, false] }, {}, {}, {},
                { text: 'Subtotal:', alignment: 'right', fontSize: fs(8), border: [false, false, false, false] },
                DocumentPdfBase._numCell(`₹${DocumentBuildCommon.formatMoney(doc.summary.subtotal)}`, { bold: true })
            ]);
            if (doc.meta.isGst) {
                body.push([
                    { text: '', colSpan: span, border: [false, false, false, false] }, {}, {}, {},
                    { text: 'Tax (GST):', alignment: 'right', fontSize: fs(8), border: [false, false, false, false] },
                    DocumentPdfBase._numCell(`₹${DocumentBuildCommon.formatMoney(doc.summary.tax)}`, { bold: true })
                ]);
            }
            body.push([
                { text: '', colSpan: span, border: [false, false, false, false] }, {}, {}, {},
                { text: 'Total:', alignment: 'right', fontSize: fs(10), bold: true, color: '#1a5276', border: [false, false, false, false] },
                DocumentPdfBase._numCell(`₹${DocumentBuildCommon.formatMoney(doc.summary.total)}`, { fontSize: fs(10), bold: true, color: '#1a5276' })
            ]);
        } else {
            body.push([
                {
                    text: 'Customer acknowledges receipt of the materials listed above with complaints as stated.',
                    colSpan: 4,
                    alignment: 'center',
                    italics: true,
                    fontSize: fs(7),
                    color: '#666',
                    margin: [0, sp(16), 0, sp(16)]
                },
                {}, {}, {}
            ]);
        }

        return {
            table: { headerRows: 1, widths: this._columnWidths(doc), body },
            layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
                vLineWidth: () => 0.5,
                hLineColor: () => '#333',
                vLineColor: () => '#333',
                fillColor: (i) => (i === 0 ? '#f8f9fa' : null)
            },
            margin: [0, 0, 0, sp(10)]
        };
    },

    _contentBlocks(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const header = DocumentBlocks.companyHeaderSplit(doc, (f) => ({
            stack: [
                { text: doc.meta.docTitle.toUpperCase(), fontSize: f(13), bold: true, alignment: 'right', characterSpacing: 1 },
                doc.meta.docSubtitle
                    ? { text: `(${doc.meta.docSubtitle.toUpperCase()})`, fontSize: f(9), bold: true, alignment: 'right', margin: [0, sp(2), 0, 0], color: '#1a5276' }
                    : null,
                doc.copyLabel
                    ? { text: `(${doc.copyLabel})`, fontSize: f(9), bold: true, alignment: 'right', margin: [0, sp(2), 0, 0] }
                    : null,
                { text: `No: #${doc.doc.no}`, fontSize: f(8), alignment: 'right', margin: [0, sp(4), 0, 0] },
                { text: doc.meta.gstBadge, fontSize: f(7), alignment: 'right', margin: [0, sp(4), 0, 0], color: doc.meta.isGst ? '#198754' : '#6c757d' }
            ].filter(Boolean)
        }));

        const party = DocumentBlocks.twoPartyGrid(
            'Billed To / Customer',
            doc.customer,
            'Document Information',
            doc.docInfoRows
        );

        const blocks = [header, party];
        if (doc.receiptIntro) {
            blocks.push({
                text: doc.receiptIntro,
                fontSize: fs(8),
                italics: true,
                color: '#444',
                margin: [0, 0, 0, sp(6)]
            });
        }
        const serviceLog = DocumentBlocks.serviceLogBlock(doc);
        if (serviceLog) blocks.push(serviceLog);
        blocks.push(doc.meta.isReceiptAck ? this._receiptItemsTable(doc) : this._itemsTable(doc));
        const remarks = DocumentBlocks.dcRemarksRow(doc);
        if (remarks) blocks.push(remarks);
        blocks.push(doc.meta.isReceiptAck ? this._receiptSignatureFooter(doc) : DocumentBlocks.termsSignatureFooter(doc));
        return blocks;
    },

    async generatePdfBytes(doc, settings = {}) {
        if (!doc.meta?.isService && typeof InvoicePdfMakeV3 !== 'undefined') {
            return InvoicePdfMakeV3.generatePdfBytes(doc, settings);
        }
        return DocumentPdfBase.generatePdfBytes(doc, settings, (d) => this._contentBlocks(d));
    }
};

const ChallanPreviewV4 = {
    _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _renderPage(doc, page) {
        const isService = doc.meta.isService;
        const isReceiptAck = doc.meta.isReceiptAck;
        const copyLine = page.copyLabel
            ? `<div style="font-size:9px;font-weight:700;text-align:right;">(${this._esc(page.copyLabel)})</div>`
            : '';
        const subtitleLine = doc.meta.docSubtitle
            ? `<div style="font-size:10px;font-weight:700;text-align:right;color:#1a5276;margin-top:2px;">(${this._esc(doc.meta.docSubtitle.toUpperCase())})</div>`
            : '';
        const infoRows = doc.docInfoRows.map(([l, v]) =>
            `<tr><td style="color:#666;font-size:9px;padding:2px 0;">${this._esc(l)}:</td><td style="font-weight:700;font-size:9px;text-align:right;padding:2px 0;">${this._esc(v)}</td></tr>`
        ).join('');

        let itemHead;
        let rows;
        let foot = '';
        if (isReceiptAck) {
            itemHead = '<th style="width:6%;">#</th><th style="width:22%;">Item Name</th><th style="width:24%;">Description</th><th style="width:10%;">Qty</th><th>Complaint</th>';
            rows = (doc.receiptItems || []).map((r) =>
                `<tr style="font-size:9px;"><td style="text-align:center;color:#666;">${r.sl}</td><td style="font-weight:700;">${this._esc(r.itemName)}</td><td>${this._esc(r.description) || '—'}</td><td style="text-align:center;font-family:monospace;">${this._esc(r.quantity)}</td><td>${this._esc(r.complaint) || '—'}</td></tr>`
            ).join('');
            if (page.includeClosing) {
                foot = '<tfoot><tr><td colspan="5" style="text-align:center;font-style:italic;color:#666;padding:24px 0;">Received by customer — signature &amp; date</td></tr></tfoot>';
            }
        } else {
            itemHead = isService
                ? '<th style="width:6%;">#</th><th>Material / Description</th><th style="width:12%;">Qty</th><th style="width:12%;">Unit</th>'
                : '<th style="width:6%;">#</th><th>Material / Description</th><th style="width:10%;">Qty</th><th style="width:10%;">Unit</th><th style="width:13%;text-align:right;">Rate</th><th style="width:13%;text-align:right;">Amount</th>';
            rows = (page.itemRows.length ? page.itemRows : doc.items).map((r) => {
                const desc = r.desc ? `<div style="font-size:8px;color:#666;font-style:italic;">${this._esc(r.desc)}</div>` : '';
                const rateAmt = isService ? '' : `<td style="text-align:right;font-family:monospace;white-space:nowrap;">₹${this._esc(DocumentBuildCommon.formatMoney(r.rate))}</td><td style="text-align:right;font-weight:700;font-family:monospace;white-space:nowrap;">₹${this._esc(DocumentBuildCommon.formatMoney(r.amount))}</td>`;
                return `<tr style="font-size:9px;"><td style="text-align:center;color:#666;">${r.sl}</td><td><div style="font-weight:700;">${this._esc(r.name)}</div>${desc}</td><td style="text-align:center;font-family:monospace;white-space:nowrap;">${this._esc(r.qty)}</td><td style="text-align:center;white-space:nowrap;">${this._esc(r.unit)}</td>${rateAmt}</tr>`;
            }).join('');
            if (!isService && page.includeClosing) {
                foot = `<tfoot><tr><td colspan="4"></td><td style="text-align:right;">Subtotal:</td><td style="text-align:right;font-weight:700;">₹${this._esc(DocumentBuildCommon.formatMoney(doc.summary.subtotal))}</td></tr>`;
                if (doc.meta.isGst) {
                    foot += `<tr><td colspan="4"></td><td style="text-align:right;">Tax (GST):</td><td style="text-align:right;font-weight:700;">₹${this._esc(DocumentBuildCommon.formatMoney(doc.summary.tax))}</td></tr>`;
                }
                foot += `<tr><td colspan="4"></td><td style="text-align:right;font-weight:700;color:#1a5276;">Total:</td><td style="text-align:right;font-weight:700;color:#1a5276;">₹${this._esc(DocumentBuildCommon.formatMoney(doc.summary.total))}</td></tr></tfoot>`;
            } else if (isService && page.includeClosing) {
                foot = '<tfoot><tr><td colspan="4" style="text-align:center;font-style:italic;color:#666;padding:24px 0;">Customer acknowledges receipt of the materials listed above with complaints as stated.</td></tr></tfoot>';
            }
        }

        const serviceLog = (page.includePrefix && doc.serviceLog?.show)
            ? `<div style="border:1px solid #f0e6c8;background:#fffdf5;padding:8px;margin-bottom:10px;font-size:9px;"><strong style="color:#b8860b;">Service & Maintenance Log</strong>${doc.serviceLog.complaint ? `<div><strong>Complaint:</strong> ${this._esc(doc.serviceLog.complaint)}</div>` : ''}${doc.serviceLog.workDone ? `<div><strong>Work Performed:</strong> ${this._esc(doc.serviceLog.workDone)}</div>` : ''}</div>`
            : '';

        const prefix = page.includePrefix ? `
            <div style="display:flex;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:12px;">
                <div style="width:58%;">
                    <div style="font-size:16px;font-weight:800;color:#1a5276;">${this._esc(String(doc.company.name).toUpperCase())}</div>
                    <div style="font-size:9px;color:#555;">${this._esc(doc.company.address)}</div>
                    <div style="font-size:8px;color:#555;">Work: ${this._esc(doc.company.workAddress)}</div>
                    <div style="font-size:8px;color:#555;">Email: ${this._esc(doc.company.emails)} | Ph: ${this._esc(doc.company.phones)}</div>
                    <div style="font-size:8px;font-weight:700;">GSTIN: ${this._esc(doc.company.gstin)} | PAN: ${this._esc(doc.company.pan)}</div>
                </div>
                <div style="width:42%;text-align:right;">
                    <div style="font-size:14px;font-weight:800;letter-spacing:1px;">${this._esc(doc.meta.docTitle.toUpperCase())}</div>
                    ${subtitleLine}
                    ${copyLine}
                    <div style="font-size:9px;margin-top:6px;">No: <strong>#${this._esc(doc.doc.no)}</strong></div>
                    <div style="font-size:8px;margin-top:4px;color:${doc.meta.isGst ? '#198754' : '#6c757d'};">${this._esc(doc.meta.gstBadge)}</div>
                </div>
            </div>
            <table width="100%" style="margin-bottom:10px;border-collapse:separate;border-spacing:8px 0;"><tr>
                <td width="50%" valign="top" style="border:1px solid #ccc;border-radius:4px;padding:8px;background:#fafafa;">
                    <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#666;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px;">Billed To / Customer</div>
                    <div style="font-weight:800;font-size:12px;">${this._esc(doc.customer.name)}</div>
                    ${doc.customer.address ? `<div style="font-size:9px;color:#666;">${this._esc(doc.customer.address)}</div>` : ''}
                    ${doc.customer.phone ? `<div style="font-size:9px;">Phone: ${this._esc(doc.customer.phone)}</div>` : ''}
                    ${doc.customer.gstin ? `<div style="font-size:9px;font-weight:700;margin-top:4px;">GSTIN: ${this._esc(doc.customer.gstin)}</div>` : ''}
                </td>
                <td width="50%" valign="top" style="border:1px solid #ccc;border-radius:4px;padding:8px;background:#fafafa;">
                    <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#666;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px;">Document Information</div>
                    <table width="100%">${infoRows}</table>
                </td>
            </tr></table>
            ${doc.receiptIntro ? `<div style="font-size:9px;font-style:italic;color:#444;margin-bottom:10px;">${this._esc(doc.receiptIntro)}</div>` : ''}
            ${serviceLog}` : '';

        const closing = page.includeClosing
            ? (isReceiptAck
                ? `<div style="display:flex;margin-top:20px;gap:8px;">
                    <div style="width:50%;font-size:8px;color:#666;"><strong>Terms &amp; Conditions:</strong><ol style="margin:4px 0 0 16px;padding:0;">${(doc.terms || []).map((t) => `<li>${this._esc(t)}</li>`).join('')}</ol></div>
                    <div style="width:25%;text-align:center;"><div style="border-bottom:1px solid #eee;height:32px;margin:16px 8px 4px;"></div><div style="font-weight:700;font-size:9px;">Authorized Signatory</div><div style="font-size:8px;color:#666;">For ${this._esc(doc.company.name)}</div></div>
                    <div style="width:25%;text-align:center;"><div style="border-bottom:1px solid #eee;height:32px;margin:16px 8px 4px;"></div><div style="font-weight:700;font-size:9px;">Received by Customer</div><div style="font-size:8px;color:#666;">Customer signature &amp; date</div></div>
                </div>`
                : `<div style="display:flex;margin-top:20px;">
                    <div style="width:65%;font-size:8px;color:#666;"><strong>Terms & Conditions:</strong><ol style="margin:4px 0 0 16px;padding:0;">${(doc.terms || []).map((t) => `<li>${this._esc(t)}</li>`).join('')}</ol></div>
                    <div style="width:35%;text-align:center;"><div style="border-bottom:1px solid #eee;height:32px;margin:16px 12px 4px;"></div><div style="font-weight:700;font-size:9px;">Authorized Signatory</div><div style="font-size:8px;color:#666;">For ${this._esc(doc.company.name)}</div></div>
                </div>`)
            : '';

        return `${prefix}<table width="100%" class="inv-v3-line-items" style="border-collapse:collapse;border:1px solid #333;margin-bottom:10px;"><thead style="background:#f8f9fa;"><tr style="font-size:8px;text-transform:uppercase;">${itemHead}</tr></thead><tbody>${rows}</tbody>${foot}</table>${page.includeClosing && doc.remarks ? `<table width="100%" style="border-collapse:collapse;border:1px solid #333;margin-bottom:10px;"><tr><td style="font-size:9px;padding:6px 8px;"><strong>Remarks:</strong> ${this._esc(doc.remarks)}</td></tr></table>` : ''}${closing}`;
    },

    render(layoutResult, host) {
        if (!layoutResult?.doc) return;
        if (!layoutResult.doc.meta?.isService && typeof InvoicePreviewV3 !== 'undefined') {
            return InvoicePreviewV3.render(layoutResult, host);
        }
        if (!host || !layoutResult?.pages) return;
        const { pages, doc, settings } = layoutResult;
        const dims = DocumentSettings.pageDimensionsMm(settings || {});
        const marginMm = DocumentSettings.marginMm((settings || {}).marginPreset || 'normal');
        host.innerHTML = pages.map((p) => `
            <section class="doc-engine-page-frame inv-v3-page-frame" data-page="${p.pageNumber}" id="doc-engine-page-${p.pageNumber}">
                <div class="inv-v3-page-sheet" style="width:${dims.w}mm;min-height:${dims.h - marginMm * 2}mm;padding:${marginMm}mm;box-sizing:border-box;background:#fff;color:#111;font-family:Roboto,'Segoe UI',sans-serif;">
                    ${this._renderPage(doc, p)}
                </div>
            </section>`).join('');
        if (typeof DocumentPreview !== 'undefined') {
            DocumentPreview._state.pageCount = pages.length;
            DocumentPreview._state.currentPage = 1;
            DocumentPreview._bindNavOnce();
            host.querySelectorAll('.doc-engine-page-frame').forEach((f) => DocumentPreview._observer?.observe(f));
            DocumentPreview._updateNav();
        }
    }
};

window.ChallanDataV4 = ChallanDataV4;
window.ChallanLayoutV4 = ChallanLayoutV4;
window.ChallanPdfV4 = ChallanPdfV4;
window.ChallanPreviewV4 = ChallanPreviewV4;
