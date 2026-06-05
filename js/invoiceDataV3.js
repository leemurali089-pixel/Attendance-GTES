/**
 * Invoice Engine V3 — normalized invoice document from ERP data.
 */
const InvoiceDataV3 = {
    COPY_TYPES: [
        { value: 'original', label: 'ORIGINAL' },
        { value: 'duplicate', label: 'DUPLICATE' },
        { value: 'triplicate', label: 'TRIPLICATE' },
        { value: 'quadruplicate', label: 'QUADRUPLICATE' },
        { value: 'extra', label: 'EXTRA COPY' },
        { value: 'transporter', label: 'FOR TRANSPORTER' }
    ],

    copyLabel(copyType) {
        if (!copyType || copyType === 'none') return '';
        const row = this.COPY_TYPES.find((t) => t.value === copyType);
        return row ? row.label : 'ORIGINAL';
    },

    getCopyType(invoiceId) {
        const adapter = typeof DocumentTemplates !== 'undefined'
            ? DocumentTemplates.get('sales-invoice')
            : null;
        if (adapter?.getCopyType) return adapter.getCopyType(invoiceId);
        try {
            const map = JSON.parse(localStorage.getItem('gtes_invoice_copy_by_id') || '{}');
            return map[String(invoiceId)] || 'original';
        } catch (_) {
            return 'original';
        }
    },

    _formatDateDisplay(dateStr) {
        const raw = String(dateStr || '').trim();
        if (!raw) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
            const [y, m, d] = raw.slice(0, 10).split('-');
            return `${d}-${m}-${y}`;
        }
        return raw;
    },

    _parseAddressParts(addressStr) {
        let rest = String(addressStr || '').trim();
        if (!rest) return { line: '', state: '', pin: '', country: 'India' };
        let country = 'India';
        if (/\bIndia\s*$/i.test(rest)) {
            rest = rest.replace(/\s*India\s*$/i, '').trim();
            country = 'India';
        }
        let pin = '';
        const pinMatch = rest.match(/\b(\d{6})\b/);
        if (pinMatch) {
            pin = pinMatch[1];
            rest = rest.replace(pinMatch[0], '').trim();
        }
        let state = '';
        const INDIAN_STATES = [
            'Tamil Nadu', 'Karnataka', 'Kerala', 'Andhra Pradesh', 'Telangana', 'Maharashtra',
            'Gujarat', 'Delhi', 'West Bengal', 'Rajasthan', 'Punjab', 'Haryana', 'Uttar Pradesh',
            'Madhya Pradesh', 'Bihar', 'Odisha', 'Assam', 'Jharkhand', 'Chhattisgarh', 'Goa', 'Puducherry'
        ];
        for (const st of INDIAN_STATES) {
            const dup = new RegExp(`(${st.replace(/\s+/g, '\\s+')}\\s*){2,}$`, 'i');
            const single = new RegExp(`${st.replace(/\s+/g, '\\s+')}\\s*$`, 'i');
            if (dup.test(rest)) {
                state = st;
                rest = rest.replace(dup, '').trim();
                break;
            }
            if (single.test(rest)) {
                state = st;
                rest = rest.replace(single, '').trim();
                break;
            }
        }
        return { line: rest.replace(/\s+/g, ' ').trim(), state, pin, country };
    },

    _buildParty(customer, invoice, role) {
        const isConsignee = role === 'consignee';
        const shipAddr = (invoice.shipToAddress || '').trim();
        const useShip = isConsignee && shipAddr && invoice.includeShipToOnPdf !== false;

        const name = useShip
            ? (invoice.shipToName || customer.name || invoice.customerName || '')
            : (customer.name || invoice.customerName || '');
        const addressRaw = useShip
            ? shipAddr
            : (customer.address || invoice.customerAddress || '');
        const parsed = this._parseAddressParts(addressRaw);

        return {
            name,
            address: parsed.line || addressRaw,
            state: customer.state || parsed.state || '',
            country: customer.country || parsed.country || 'India',
            pin: customer.pincode || customer.pin || parsed.pin || '',
            phone: customer.phone || customer.mobile || '',
            gstin: useShip
                ? (invoice.shipToGstin || customer.gstin || invoice.customerGstin || '')
                : (customer.gstin || invoice.customerGstin || ''),
            pan: customer.pan || invoice.customerPan || ''
        };
    },

    _buildDispatch(invoice) {
        const dd = invoice.dispatchDetails || {};
        const pick = (...vals) => {
            for (const v of vals) {
                const s = String(v ?? '').trim();
                if (s) return s;
            }
            return '';
        };
        const dash = (v) => {
            const s = String(v ?? '').trim();
            return s || '-';
        };
        return {
            poNumber: dash(invoice.poNumber),
            dispatchDocumentNo: dash(pick(dd.documentNo, dd.dispatchDocNo, invoice.dispatchDocumentNo, invoice.dispatchDocNo)),
            dispatchThrough: dash(pick(dd.dispatchThrough, dd.via, invoice.dispatchThrough, dd.vehicleNo, invoice.vehicleNo, invoice.transportName)),
            destination: dash(pick(dd.destination, invoice.destination, invoice.placeOfSupply, invoice.shipToState)),
            ewayBillNo: dash(pick(dd.ewayBillNo, dd.eWayBillNo, invoice.ewayBillNo, invoice.eWayBillNo, dd.lrNo, invoice.lrNo))
        };
    },

    async build(invoiceId) {
        const invoice = typeof InvoiceManager !== 'undefined' ? InvoiceManager.getInvoice(invoiceId) : null;
        if (!invoice) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const company = {
            name: settings.companyName || DataManager.COMPANY_PROFILE.name,
            address: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
            workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
            gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
            pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
            iec: settings.iec || DataManager.COMPANY_PROFILE.iec || '',
            emails: [settings.emails].flat().filter(Boolean).join(', '),
            phones: [settings.phones].flat().filter(Boolean).join(', '),
            bank: settings.bankDetails || DataManager.COMPANY_PROFILE.bankDetails || {}
        };

        let customer = typeof CustomerManager !== 'undefined'
            ? (CustomerManager.getCustomer(invoice.customerId) || {
                name: invoice.customerName,
                address: invoice.customerAddress || '',
                gstin: invoice.customerGstin || '',
                pan: invoice.customerPan || ''
            })
            : {
                name: invoice.customerName,
                address: invoice.customerAddress || '',
                gstin: invoice.customerGstin || '',
                pan: invoice.customerPan || ''
            };
        if (typeof DocumentBuildCommon !== 'undefined') {
            const snap = DocumentBuildCommon.resolveCustomerSnapshot({
                customerId: invoice.customerId,
                customerName: invoice.customerName,
                snapshot: {
                    customerName: invoice.customerName,
                    customerAddress: invoice.customerAddress,
                    customerGstin: invoice.customerGstin,
                    customerPan: invoice.customerPan
                }
            });
            customer = {
                ...customer,
                name: snap.name || customer.name || invoice.customerName,
                address: snap.address || customer.address || invoice.customerAddress || '',
                gstin: snap.gstin || customer.gstin || invoice.customerGstin || '',
                pan: snap.pan || customer.pan || invoice.customerPan || '',
                phone: snap.phone || customer.phone || customer.mobile || '',
                state: snap.state || customer.state || '',
                pincode: snap.pin || customer.pincode || customer.pin || '',
                country: snap.country || customer.country || 'India'
            };
        }

        const isPlain = typeof InvoiceManager !== 'undefined' && InvoiceManager.isPlainSalesListRow
            ? InvoiceManager.isPlainSalesListRow(invoice)
            : (invoice.type === 'non-gst-invoice' || invoice.type === 'without-bill');
        const isGst = !isPlain && (invoice.billType === 'gst' || invoice.type === 'with-bill' || invoice.type === 'gst-invoice' || invoice.type === 'sales-gst');
        const isDc = typeof InvoiceManager !== 'undefined' && InvoiceManager.isDcStyleSalesInvoice(invoice);
        const isCreditNote = typeof InvoicesUI !== 'undefined' && InvoicesUI._isCreditNoteSalesDoc
            ? InvoicesUI._isCreditNoteSalesDoc(invoice)
            : false;

        const isInterstate = isGst && typeof InvoicesUI !== 'undefined' && InvoicesUI._isInterstateSalesGst
            ? InvoicesUI._isInterstateSalesGst(invoice, customer, company.gstin)
            : false;

        const masterInventory = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
        const masterServices = DataManager.getData(DataManager.KEYS.SERVICES || 'gtes_services') || [];
        const allMaster = [...masterInventory, ...masterServices];

        const items = (invoice.items || []).map((item, idx) => {
            const details = typeof InvoicesUI !== 'undefined' && InvoicesUI.getItemDisplayDetails
                ? InvoicesUI.getItemDisplayDetails(item, allMaster, isPlain)
                : {
                    qty: parseFloat(item.quantity) || 0,
                    unit: item.unit || 'nos',
                    rate: parseFloat(item.rate) || 0,
                    amount: parseFloat(item.amount) || 0,
                    hsn: item.hsn || '-',
                    displayDesc: item.description || ''
                };
            let taxPct = '';
            if (isGst && !isPlain) {
                if (isInterstate) {
                    const igstR = parseFloat(String(item.igstRate || '').replace(/[^0-9.]/g, '')) || 0;
                    taxPct = `${igstR || 18}%`;
                } else {
                    const cgstR = parseFloat(item.cgstRate) || details.cgstRate || 0;
                    const sgstR = parseFloat(item.sgstRate) || details.sgstRate || cgstR || 0;
                    const totalGst = cgstR + sgstR;
                    taxPct = `${parseFloat(totalGst.toFixed(2))}%`;
                }
            }
            return {
                sl: idx + 1,
                name: item.name || '',
                desc: details.displayDesc
                    || (typeof DcReturnable !== 'undefined' ? DcReturnable.itemLineDescription(item) : '')
                    || item.description
                    || item.itemDescription
                    || '',
                hsn: details.hsn || '-',
                qty: details.qty,
                unit: details.unit || 'nos',
                rate: details.rate,
                taxPct,
                amount: details.amount,
                rowHeightPt: 20 + ((details.displayDesc
                    || (typeof DcReturnable !== 'undefined' ? DcReturnable.itemLineDescription(item) : '')
                    || item.description || item.itemDescription || '') ? 10 : 0)
            };
        });

        let cgst = 0;
        let sgst = 0;
        let igst = 0;
        const subtotal = invoice.subtotal || items.reduce((s, r) => s + r.amount, 0);
        if (isGst && typeof InvoicesUI !== 'undefined') {
            if (isInterstate) {
                const inter = InvoicesUI._accumulateInterstateSalesPdfFooterTaxes(invoice.items || [], allMaster);
                igst = inter.igst;
            } else {
                const taxSum = InvoicesUI._accumulatePurchasePdfFooterTaxes(invoice.items || [], allMaster);
                cgst = taxSum.cgst;
                sgst = taxSum.sgst;
                igst = taxSum.igst;
            }
        }
        const roundOff = parseFloat(invoice.roundOff) || 0;
        const grandTotal = invoice.total != null ? parseFloat(invoice.total) : (subtotal + cgst + sgst + igst + roundOff);

        const docTitle = isCreditNote ? 'CREDIT NOTE' : (isDc ? 'DELIVERY CHALLAN' : (isPlain ? 'INVOICE' : 'TAX INVOICE'));
        const adapter = typeof DocumentTemplates !== 'undefined'
            ? DocumentTemplates.get('sales-invoice')
            : null;
        const modalOpen = document.getElementById('pdfPreviewModal')?.classList.contains('show');
        const copyTypes = adapter
            ? DocumentSettings.resolveCopyTypes(adapter, invoiceId, modalOpen)
            : DocumentSettings.normalizeCopyTypes([this.getCopyType(invoiceId)]);
        const copyType = copyTypes[0] || 'original';
        const dispatch = this._buildDispatch(invoice);
        const receiver = this._buildParty(customer, invoice, 'receiver');
        const consignee = this._buildParty(customer, invoice, 'consignee');
        const amountWords = typeof InvoicesUI !== 'undefined' && InvoicesUI.numberToWords
            ? InvoicesUI.numberToWords(grandTotal)
            : grandTotal.toFixed(2);

        const setOffReferences = isCreditNote && typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.buildSetOffReferences({ noteDoc: invoice, grandTotal, kind: 'sales' })
            : null;
        const remarks = typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.resolveDocumentRemarks(invoice)
            : String(invoice.narration || invoice.remarks || '').trim();

        return {
            invoiceId,
            meta: { isGst, isPlain, isDc, isCreditNote, isInterstate, docTitle },
            copyTypes,
            copyType,
            copyLabel: this.copyLabel(copyType),
            company,
            invoice: {
                no: invoice.invoiceNo || invoice.id,
                date: invoice.date || '',
                dateDisplay: this._formatDateDisplay(invoice.date),
                ...dispatch
            },
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
            terms: [
                '1. Goods once sold will not be taken back.',
                '2. Subject to Chennai Jurisdiction.'
            ],
            bankLine: `Bank: ${company.bank?.bankName || '-'} | A/c: ${company.bank?.accountNo || '-'} | IFSC: ${company.bank?.ifsc || '-'}`,
            footerNote: isDc
                ? 'Computer generated delivery challan.'
                : 'Computer generated invoice — no physical signature required.',
            setOffReferences: setOffReferences?.rows?.length ? setOffReferences : null,
            remarks: remarks || null
        };
    }
};

window.InvoiceDataV3 = InvoiceDataV3;
