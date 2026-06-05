/**
 * Document Engine V4 — shared company profile and formatting helpers.
 */
const DocumentBuildCommon = {
    buildCompany() {
        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const cp = DataManager.COMPANY_PROFILE || {};
        const emails = [settings.emails || settings.email || cp.emails].flat().filter(Boolean);
        const phones = [settings.phones || settings.phone || cp.phones].flat().filter(Boolean);
        return {
            name: settings.companyName || cp.name || '',
            address: settings.registeredAddress || cp.registeredAddress || '',
            workAddress: settings.workAddress || cp.workAddress || '',
            gstin: settings.gstin || cp.gstin || '',
            pan: settings.pan || cp.pan || '',
            iec: settings.iec || cp.iec || '',
            emails: emails.join(', '),
            phones: phones.join(', '),
            bank: settings.bankDetails || cp.bankDetails || {}
        };
    },

    formatDateDisplay(dateStr) {
        const raw = String(dateStr || '').trim();
        if (!raw) return '';
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
            const [y, m, day] = raw.slice(0, 10).split('-');
            return `${day}-${m}-${y}`;
        }
        return raw;
    },

    formatMoney(n) {
        return (parseFloat(n) || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    },

    copyLabel(copyType) {
        if (typeof InvoiceDataV3 !== 'undefined') return InvoiceDataV3.copyLabel(copyType);
        if (typeof DocumentSettings !== 'undefined') return DocumentSettings.copyLabelUpper(copyType);
        return String(copyType || '').toUpperCase();
    },

    cleanVendorName(val) {
        if (!val) return 'Unknown Vendor';
        if (val.includes(',') && val.length > 50) {
            const parts = val.split(',').map((s) => s.trim());
            if (parts.length > 3) {
                return parts[0].length < 40 ? parts[0] : 'Multiple Items (Vendor Missing)';
            }
        }
        return val;
    },

    itemRowHeight(item, base = 18, descLine = 10) {
        const desc = String(item.desc || item.description || '').trim();
        const lines = desc ? Math.min(3, Math.ceil(desc.length / 55)) : 0;
        return base + lines * descLine;
    },

    resolveDocumentRemarks(src) {
        return String(src?.narration || src?.remarks || src?.notes || src?.workDone || '').trim();
    },

    formatCustomerAddress(customer) {
        if (!customer) return '';
        const parts = [customer.address, customer.address2]
            .map((s) => String(s || '').trim())
            .filter(Boolean);
        return parts.join(', ');
    },

    /**
     * Best-effort customer party for PDFs when the linked customer row has no address
     * (common for BookKeeper-synced stubs). Uses challan/invoice snapshot, address lines,
     * party siblings, and recent sales invoices for the same customer.
     */
    resolveCustomerSnapshot(opts = {}) {
        const { customerId, customerName, snapshot = {} } = opts;
        const cm = typeof CustomerManager !== 'undefined' ? CustomerManager : null;
        const customer = customerId && cm ? cm.getCustomer(customerId) : null;

        const pick = (...vals) => {
            for (const v of vals) {
                const s = String(v ?? '').trim();
                if (s) return s;
            }
            return '';
        };

        let name = pick(snapshot.customerName, customer?.name, customerName, 'Walk-in Customer');
        let address = pick(snapshot.customerAddress, this.formatCustomerAddress(customer));
        let gstin = pick(snapshot.customerGstin, customer?.gstin);
        let pan = pick(snapshot.customerPan, customer?.pan);
        let phone = pick(snapshot.customerPhone, customer?.phone, customer?.mobile);
        let state = pick(snapshot.state, customer?.state);
        let pin = pick(snapshot.pincode, customer?.pincode, customer?.pin);
        let country = pick(snapshot.country, customer?.country, 'India');

        const adopt = (row) => {
            if (!row) return;
            if (!address) address = pick(row.customerAddress, this.formatCustomerAddress(row));
            if (!gstin) gstin = pick(row.customerGstin, row.gstin);
            if (!pan) pan = pick(row.customerPan, row.pan);
            if (!phone) phone = pick(row.phone, row.mobile);
            if (!state) state = pick(row.state);
            if (!pin) pin = pick(row.pincode, row.pin);
            if (!country) country = pick(row.country, 'India');
        };

        if (!address && customer?.partyId && cm) {
            const siblings = cm.getAllCustomers().filter((c) =>
                (c.partyId || '').toString().trim() === String(customer.partyId).trim()
                && this.formatCustomerAddress(c));
            if (siblings.length) adopt(siblings[0]);
        }

        if (!address && customerId && typeof InvoiceManager !== 'undefined') {
            const invs = (InvoiceManager.getAllInvoices() || [])
                .filter((inv) => inv.customerId === customerId && String(inv.customerAddress || '').trim())
                .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
            if (invs.length) adopt(invs[0]);
        }

        if (!address && name && cm) {
            const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const target = norm(name);
            const match = cm.getAllCustomers().find((c) =>
                norm(c.name) === target && this.formatCustomerAddress(c));
            if (match) adopt(match);
        }

        return {
            name,
            address,
            gstin,
            pan,
            phone,
            state,
            pin,
            country,
            partyId: customer?.partyId || snapshot.partyId || ''
        };
    },

    formatSetOffDate(dateStr) {
        const raw = String(dateStr || '').trim();
        if (!raw) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
            const [y, m, d] = raw.slice(0, 10).split('-');
            return `${d}-${m}-${y}`;
        }
        return raw;
    },

    billRefVariants(raw) {
        const t = String(raw ?? '').trim();
        if (!t || t === '-') return [];
        const out = new Set([t]);
        const stripped = t.replace(/^0+/, '') || t;
        if (stripped !== t) out.add(stripped);
        const n = parseInt(t, 10);
        if (!isNaN(n)) out.add(String(n));
        return [...out];
    },

    /**
     * Invoice No. Reference rows for credit / debit notes (set-off against original bill).
     */
    buildSetOffReferences(opts = {}) {
        const { noteDoc, grandTotal, kind } = opts;
        if (!noteDoc) return { rows: [], total: 0 };

        const totalAmt = Math.abs(parseFloat(grandTotal) || parseFloat(noteDoc.total) || parseFloat(noteDoc.amount) || 0);
        const explicit = Array.isArray(noteDoc.setOffAllocations)
            ? noteDoc.setOffAllocations
            : (Array.isArray(noteDoc.setOffReferences) ? noteDoc.setOffReferences : null);

        if (explicit && explicit.length) {
            const rows = explicit.map((a) => ({
                invoiceNo: String(a.invoiceNo || a.invoiceNoRef || a.no || a.ref || '-').trim() || '-',
                date: this.formatSetOffDate(a.date),
                supplierInvoiceNo: String(a.supplierInvoiceNo || a.supplierBillNo || '').trim(),
                amount: Math.abs(parseFloat(a.amount) || 0)
            }));
            const sum = rows.reduce((s, r) => s + r.amount, 0);
            return { rows, total: sum || totalAmt };
        }

        const UI = typeof InvoicesUI !== 'undefined' ? InvoicesUI : null;
        if (kind === 'sales') {
            const refNo = (typeof VoucherManager !== 'undefined' && VoucherManager.resolveCreditNoteSalesRef)
                ? String(VoucherManager.resolveCreditNoteSalesRef(noteDoc) || '').trim()
                : '';
            const inferred = UI && UI._inferSalesReferenceNo
                ? String(UI._inferSalesReferenceNo(noteDoc) || '').trim()
                : '';
            const invoiceNo = (refNo || (inferred !== '-' ? inferred : '')) || '-';
            const invoices = DataManager.getData('invoices') || [];
            const base = UI && UI._findBaseInvoiceForCreditNote
                ? UI._findBaseInvoiceForCreditNote(noteDoc, invoices)
                : null;
            return {
                rows: [{
                    invoiceNo,
                    date: this.formatSetOffDate(base?.date || noteDoc.setOffRefDate || ''),
                    supplierInvoiceNo: String(noteDoc.setOffSupplierBillNo || noteDoc.supplierInvoiceNo || '').trim(),
                    amount: totalAmt
                }],
                total: totalAmt
            };
        }

        const refNo = (typeof VoucherManager !== 'undefined' && VoucherManager.resolveDebitNotePurchaseRef)
            ? String(VoucherManager.resolveDebitNotePurchaseRef(noteDoc) || '').trim()
            : '';
        const inferred = UI && UI._inferPurchaseReferenceNo
            ? String(UI._inferPurchaseReferenceNo(noteDoc) || '').trim()
            : '';
        const invoiceNo = (refNo || (inferred !== '-' ? inferred : '')) || '-';
        const purchases = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const base = UI && UI._findBasePurchaseForDebitNote
            ? UI._findBasePurchaseForDebitNote(noteDoc, purchases)
            : null;
        return {
            rows: [{
                invoiceNo,
                date: this.formatSetOffDate(base?.date || noteDoc.setOffRefDate || noteDoc.date || ''),
                supplierInvoiceNo: String(
                    base?.supplierBillNo || base?.supplierInvoiceNo || noteDoc.setOffSupplierBillNo || ''
                ).trim(),
                amount: totalAmt
            }],
            total: totalAmt
        };
    }
};

window.DocumentBuildCommon = DocumentBuildCommon;
