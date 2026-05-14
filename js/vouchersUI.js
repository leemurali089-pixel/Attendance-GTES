/**
 * Vouchers UI Module
 * Handles display, creation, and printing of Vouchers (Receipts/Payments)
 * Integrated with Synced Data
 */
const VouchersUI = {
    currentMode: 'gst', // 'gst', 'non-gst', 'purchase', 'credit-note', or 'debit-note'
    _voucherFilterDebounceTimer: null,
    BANK_RENDER_CHUNK_SIZE: 250,
    voucherListSortKey: 'voucherNo',
    voucherListSortDir: 'asc',
    noteListSortKey: 'docNo',
    noteListSortDir: 'asc',
    _vouchersListVisibleLimit: 150,
    _voucherSkipLimitReset: false,
    async _yieldToUI() {
        return new Promise((resolve) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => resolve());
            } else {
                setTimeout(resolve, 0);
            }
        });
    },

    /** Indian FY labels (Apr–Mar) from actual row dates only. */
    _indianFySelectOptionsFromDates(dateValues) {
        const seen = new Set();
        (dateValues || []).forEach((d) => {
            if (d == null || d === '') return;
            const fy = DataManager.getFinancialYear(d);
            if (fy) seen.add(fy);
        });
        return [...seen].sort((a, b) => {
            const ya = parseInt(String(a).slice(0, 4), 10);
            const yb = parseInt(String(b).slice(0, 4), 10);
            return yb - ya;
        });
    },

    /** Dates for rows that appear in the current vouchers list mode (vouchers / credit notes / debit notes). */
    _fyDateSourcesForCurrentList() {
        if (this.currentMode === 'credit-note') {
            return (DataManager.getData('invoices') || [])
                .filter((inv) => this._isCreditNoteInvoice(inv))
                .map((inv) => inv.date);
        }
        if (this.currentMode === 'debit-note') {
            return (DataManager.getData(DataManager.KEYS.EXPENSES) || [])
                .filter((exp) => this._isDebitNotePurchase(exp))
                .map((exp) => exp.date);
        }
        let vouchers = DataManager.getData('vouchers') || [];
        if (this.currentMode === 'purchase') {
            vouchers = vouchers.filter((v) => v.type === 'payment');
        } else if (this.currentMode === 'gst') {
            vouchers = vouchers.filter((v) => v.type === 'receipt' && v.hasGst === true);
        } else if (this.currentMode === 'non-gst') {
            vouchers = vouchers.filter((v) => v.type === 'receipt' && v.hasGst === false);
        }
        return (vouchers || []).filter((v) => this._voucherPassesListModeFilter(v)).map((v) => v.date);
    },

    _fyLabelVoucher(fyKey) {
        return (typeof GTESFinancialYearUi !== 'undefined' && GTESFinancialYearUi.fyLabelDisplay)
            ? GTESFinancialYearUi.fyLabelDisplay(fyKey)
            : String(fyKey || '');
    },

    syncVoucherMonthOptions() {
        const fyEl = document.getElementById('filterVoucherFY');
        const mEl = document.getElementById('filterVoucherMonth');
        if (!mEl) return;
        const fy = (fyEl?.value || '').trim();
        const cur = mEl.value;
        if (typeof GTESFinancialYearUi !== 'undefined' && fy) {
            mEl.innerHTML = GTESFinancialYearUi.indianFyMonthOptionsHtml(fy, cur);
            if (cur && ![...mEl.options].some((o) => o.value === cur)) mEl.value = '';
        } else {
            mEl.innerHTML = '<option value="">All months</option>';
        }
    },

    onVoucherFyChange() {
        this.syncVoucherMonthOptions();
        this.filterVouchers();
    },

    _afterRenderVoucherFilters() {
        const fyEl = document.getElementById('filterVoucherFY');
        const mEl = document.getElementById('filterVoucherMonth');
        if (!fyEl || !mEl) return;
        const fyList = [...fyEl.options].map((o) => o.value).filter(Boolean);
        const pref = (typeof GTESFinancialYearUi !== 'undefined' && GTESFinancialYearUi.defaultFyMonthSelectionForUi)
            ? GTESFinancialYearUi.defaultFyMonthSelectionForUi(fyList)
            : { fyKey: '', monthYm: '' };
        if (pref.fyKey && fyList.includes(pref.fyKey)) fyEl.value = pref.fyKey;
        this.syncVoucherMonthOptions();
        if ((fyEl.value || '').trim() && pref.monthYm && [...mEl.options].some((o) => o.value === pref.monthYm)) {
            mEl.value = pref.monthYm;
        }
    },

    loadMoreVouchers() {
        this._vouchersListVisibleLimit = (this._vouchersListVisibleLimit || 150) + 150;
        this._voucherSkipLimitReset = true;
        if (this.currentMode === 'credit-note') this.updateCreditNotesTable();
        else if (this.currentMode === 'debit-note') this.updateDebitNotesTable();
        else this.updateTable();
    },

    _tailNumberFromDocNo(s) {
        const raw = String(s || '').trim();
        const m = raw.match(/(\d{1,12})\s*$/);
        if (m) return parseInt(m[1], 10) || 0;
        const d = raw.replace(/\D/g, '');
        return d ? parseInt(d.slice(-12), 10) || 0 : 0;
    },

    _voucherDisplayNo(v) {
        return String(v.displayVoucherNo || v.voucherNo || '').trim() || String(v.id || '');
    },

    _voucherSettlementAmt(v) {
        if (typeof VoucherManager !== 'undefined' && VoucherManager.resolveSettlementDisplay) {
            return Number(VoucherManager.resolveSettlementDisplay(v).totalSettlement) || 0;
        }
        return (parseFloat(v.amount) || 0) + (parseFloat(v.tdsAmount || 0) || 0) + (parseFloat(v.discountAmount || 0) || 0);
    },

    setVoucherListSort(key) {
        if (this.voucherListSortKey === key) {
            this.voucherListSortDir = this.voucherListSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.voucherListSortKey = key;
            this.voucherListSortDir = 'asc';
        }
        this.updateTable();
    },

    setNoteListSort(key) {
        if (this.noteListSortKey === key) {
            this.noteListSortDir = this.noteListSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.noteListSortKey = key;
            this.noteListSortDir = 'asc';
        }
        if (this.currentMode === 'credit-note') this.updateCreditNotesTable();
        else if (this.currentMode === 'debit-note') this.updateDebitNotesTable();
    },

    _voucherTh(key, label, extraClass = '') {
        const active = this.voucherListSortKey === key;
        const mark = active ? (this.voucherListSortDir === 'asc' ? ' \u2191' : ' \u2193') : '';
        const ec = extraClass ? ` ${extraClass.trim()}` : '';
        return `<th role="button" tabindex="0" class="gtes-sortable-th user-select-none${ec}" style="cursor:pointer" title="Sort" onclick="VouchersUI.setVoucherListSort('${key}')">${label}${mark}</th>`;
    },

    _noteTh(key, label, extraClass = '') {
        const active = this.noteListSortKey === key;
        const mark = active ? (this.noteListSortDir === 'asc' ? ' \u2191' : ' \u2193') : '';
        const ec = extraClass ? ` ${extraClass.trim()}` : '';
        return `<th role="button" tabindex="0" class="gtes-sortable-th user-select-none${ec}" style="cursor:pointer" title="Sort" onclick="VouchersUI.setNoteListSort('${key}')">${label}${mark}</th>`;
    },

    _voucherPassesListModeFilter(v) {
        if (this.currentMode === 'purchase') return true;
        if (v.isPurchase || v.type === 'purchase') return false;
        if (this.currentMode === 'gst') return v.hasGst === true;
        return v.hasGst === false;
    },

    _applyVoucherListSort(rows) {
        const key = this.voucherListSortKey || 'voucherNo';
        const dir = this.voucherListSortDir === 'desc' ? -1 : 1;
        rows.sort((a, b) => {
            let cmp = 0;
            switch (key) {
                case 'date':
                    cmp = (new Date(a.date).getTime() || 0) - (new Date(b.date).getTime() || 0);
                    break;
                case 'voucherNo':
                    cmp = this._tailNumberFromDocNo(this._voucherDisplayNo(a)) - this._tailNumberFromDocNo(this._voucherDisplayNo(b));
                    if (cmp === 0) cmp = String(this._voucherDisplayNo(a)).localeCompare(String(this._voucherDisplayNo(b)), undefined, { numeric: true, sensitivity: 'base' });
                    break;
                case 'type':
                    cmp = String(a.type || '').localeCompare(String(b.type || ''), undefined, { sensitivity: 'base' });
                    break;
                case 'party':
                    cmp = String(a.customerName || a.customerId || '').localeCompare(String(b.customerName || b.customerId || ''), undefined, { sensitivity: 'base' });
                    break;
                case 'amount':
                    cmp = this._voucherSettlementAmt(a) - this._voucherSettlementAmt(b);
                    break;
                case 'mode':
                    cmp = String(a.paymentMode || '').localeCompare(String(b.paymentMode || ''), undefined, { sensitivity: 'base' });
                    break;
                default:
                    cmp = this._tailNumberFromDocNo(this._voucherDisplayNo(a)) - this._tailNumberFromDocNo(this._voucherDisplayNo(b));
            }
            return cmp * dir;
        });
    },

    _creditNoteRef(inv) {
        return (typeof VoucherManager !== 'undefined' && VoucherManager.resolveCreditNoteSalesRef)
            ? (VoucherManager.resolveCreditNoteSalesRef(inv) || '-')
            : (inv.referenceNo || inv.refNo || inv.refInvoiceNo || inv.baseInvoiceNo || inv.originalInvoiceNo || '-');
    },

    _debitNoteRef(p) {
        return (typeof VoucherManager !== 'undefined' && VoucherManager.resolveDebitNotePurchaseRef)
            ? (VoucherManager.resolveDebitNotePurchaseRef(p) || '-')
            : (p.referenceNo || p.refNo || p.purchaseInvoiceRef || p.purchaseInvoiceNo || p.refInvoiceNo || p.baseInvoiceNo || p.originalInvoiceNo || p.supplierInvoiceNo || p.supplierBillNo || '-');
    },

    _applyCreditNoteSort(rows) {
        const key = this.noteListSortKey || 'docNo';
        const dir = this.noteListSortDir === 'desc' ? -1 : 1;
        const num = (x) => parseFloat(x) || 0;
        rows.sort((a, b) => {
            let cmp = 0;
            switch (key) {
                case 'date':
                    cmp = (new Date(a.date || 0).getTime() || 0) - (new Date(b.date || 0).getTime() || 0);
                    break;
                case 'docNo':
                    cmp = this._tailNumberFromDocNo(a.invoiceNo || a.id) - this._tailNumberFromDocNo(b.invoiceNo || b.id);
                    if (cmp === 0) cmp = String(a.invoiceNo || a.id || '').localeCompare(String(b.invoiceNo || b.id || ''), undefined, { numeric: true, sensitivity: 'base' });
                    break;
                case 'party':
                    cmp = String(a.customerName || '').localeCompare(String(b.customerName || ''), undefined, { sensitivity: 'base' });
                    break;
                case 'ref':
                    cmp = String(this._creditNoteRef(a)).localeCompare(String(this._creditNoteRef(b)), undefined, { sensitivity: 'base' });
                    break;
                case 'amount':
                    cmp = num(a.total ?? a.amount) - num(b.total ?? b.amount);
                    break;
                default:
                    cmp = this._tailNumberFromDocNo(a.invoiceNo || a.id) - this._tailNumberFromDocNo(b.invoiceNo || b.id);
            }
            return cmp * dir;
        });
    },

    _applyDebitNoteSort(rows) {
        const key = this.noteListSortKey || 'docNo';
        const dir = this.noteListSortDir === 'desc' ? -1 : 1;
        const num = (x) => parseFloat(x) || 0;
        const docNo = (x) => x.billNo || x.vch_no || x.id || '';
        rows.sort((a, b) => {
            let cmp = 0;
            switch (key) {
                case 'date':
                    cmp = (new Date(a.date || 0).getTime() || 0) - (new Date(b.date || 0).getTime() || 0);
                    break;
                case 'docNo':
                    cmp = this._tailNumberFromDocNo(docNo(a)) - this._tailNumberFromDocNo(docNo(b));
                    if (cmp === 0) cmp = String(docNo(a)).localeCompare(String(docNo(b)), undefined, { numeric: true, sensitivity: 'base' });
                    break;
                case 'party':
                    cmp = String(a.vendor || a.vendorName || '').localeCompare(String(b.vendor || b.vendorName || ''), undefined, { sensitivity: 'base' });
                    break;
                case 'ref':
                    cmp = String(this._debitNoteRef(a)).localeCompare(String(this._debitNoteRef(b)), undefined, { sensitivity: 'base' });
                    break;
                case 'amount':
                    cmp = num(a.total ?? a.amount ?? a.vch_amt) - num(b.total ?? b.amount ?? b.vch_amt);
                    break;
                default:
                    cmp = this._tailNumberFromDocNo(docNo(a)) - this._tailNumberFromDocNo(docNo(b));
            }
            return cmp * dir;
        });
    },
    
    async init() {
        console.log('Vouchers UI Initialized');
    },

    /** Receipt/payment voucher has explicit link to a sales/purchase document. */
    _voucherHasLinkedDocs(v) {
        if (!v || typeof v !== 'object') return false;
        if (v.linkedInvoiceId && String(v.linkedInvoiceId).trim()) return true;
        const li = v.linkedInvoices;
        if (Array.isArray(li) && li.length > 0) {
            for (const x of li) {
                if (x == null) continue;
                if (typeof x === 'string' && String(x).trim()) return true;
                if (typeof x === 'object') {
                    if (x.id || x.invoiceNo || x.billNo) return true;
                }
            }
        }
        const allocs = v.allocations;
        if (Array.isArray(allocs) && allocs.length > 0) {
            for (const a of allocs) {
                if (!a || typeof a !== 'object') continue;
                const refs = [a.id, a.no, a.invoiceNo, a.billNo];
                if (refs.some(x => x != null && String(x).trim() !== '')) return true;
            }
        }
        return false;
    },

    _normPartyName(s) {
        return String(s || '').toLowerCase().replace(/[,\s]+/g, ' ').trim();
    },

    _billRefVariants(raw) {
        const t = String(raw ?? '').trim();
        if (!t || t === '-') return [];
        const out = new Set([t]);
        const stripped = t.replace(/^0+/, '') || t;
        if (stripped !== t) out.add(stripped);
        const n = parseInt(t, 10);
        if (!isNaN(n)) out.add(String(n));
        return [...out];
    },

    _refVariantSet(refStr) {
        return new Set(this._billRefVariants(refStr));
    },

    _invoiceRefMatches(inv, wantSet) {
        if (!wantSet || wantSet.size === 0) return false;
        const keys = [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo];
        for (const k of keys) {
            if (k == null || k === '') continue;
            for (const v of this._billRefVariants(k)) {
                if (wantSet.has(v)) return true;
            }
        }
        return false;
    },

    _purchaseRefMatches(exp, wantSet) {
        if (!wantSet || wantSet.size === 0) return false;
        const keys = [exp.id, exp.billNo, exp.supplierBillNo, exp.vch_no, exp.invoiceNo, exp.bookkeeperVchNo];
        for (const k of keys) {
            if (k == null || k === '') continue;
            for (const v of this._billRefVariants(k)) {
                if (wantSet.has(v)) return true;
            }
        }
        return false;
    },

    _findReferencedSalesInvoice(refStr, cnInv) {
        const want = this._refVariantSet(refStr);
        if (want.size === 0) return null;
        const invoices = DataManager.getData('invoices') || [];
        const partyId = cnInv.partyId || '';
        const partyName = this._normPartyName(cnInv.customerName || '');
        let anyHit = null;
        let partyHit = null;
        for (const inv of invoices) {
            if (this._isCreditNoteInvoice(inv)) continue;
            if (!this._invoiceRefMatches(inv, want)) continue;
            if (!anyHit) anyHit = inv;
            const sameParty = (partyId && inv.partyId === partyId)
                || (partyName && this._normPartyName(inv.customerName) === partyName);
            if (sameParty) {
                partyHit = inv;
                break;
            }
        }
        return partyHit || anyHit;
    },

    _findReferencedPurchaseBill(refStr, dnExp) {
        const want = this._refVariantSet(refStr);
        if (want.size === 0) return null;
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const partyId = dnExp.partyId || '';
        const partyName = this._normPartyName(dnExp.vendor || dnExp.vendorName || '');
        let anyHit = null;
        let partyHit = null;
        for (const exp of expenses) {
            if (this._isDebitNotePurchase(exp)) continue;
            if (!(String(exp.category || '').toLowerCase().includes('purchase'))) continue;
            if (!this._purchaseRefMatches(exp, want)) continue;
            if (!anyHit) anyHit = exp;
            const sameParty = (partyId && exp.partyId === partyId)
                || (partyName && this._normPartyName(exp.vendor || exp.vendorName) === partyName);
            if (sameParty) {
                partyHit = exp;
                break;
            }
        }
        return partyHit || anyHit;
    },

    /**
     * Credit note "linked": referenced sales invoice exists, is paid/partial, and settlements
     * (receipt allocations to that bill + other credit notes against same ref) cover this note amount.
     */
    _creditNoteSettlementLinked(inv) {
        const ref = (typeof VoucherManager !== 'undefined' && VoucherManager.resolveCreditNoteSalesRef)
            ? String(VoucherManager.resolveCreditNoteSalesRef(inv) || '').trim()
            : String(inv.referenceNo || inv.refNo || inv.refInvoiceNo || inv.baseInvoiceNo || inv.originalInvoiceNo || inv.salesInvoiceRef || '').trim();
        if (!ref || ref === '-') return false;
        const base = this._findReferencedSalesInvoice(ref, inv);
        if (!base) return false;
        const st = String(base.status || '').toLowerCase();
        if (st === 'cancelled' || st === 'void' || st === 'canceled') return false;
        if (typeof VoucherManager === 'undefined') return false;
        const docTotal = Math.abs(parseFloat(base.total ?? base.amount ?? 0) || 0);
        const map = VoucherManager.getVoucherAllocationsMap(null, 'receipt');
        const bal = VoucherManager.getDocumentBalance(base.id, docTotal, map, base.invoiceNo, base, { allowLooseFallback: false });
        const applied = docTotal - bal;
        const noteAmt = Math.abs(parseFloat(inv.total ?? inv.amount ?? 0) || 0);
        return applied + 0.05 >= noteAmt;
    },

    /**
     * Debit note "linked": referenced purchase exists, is paid/partial, and settlements
     * (payment allocations + other debit notes for same ref) cover this note amount.
     */
    _debitNoteSettlementLinked(exp) {
        const ref = (typeof VoucherManager !== 'undefined' && VoucherManager.resolveDebitNotePurchaseRef)
            ? String(VoucherManager.resolveDebitNotePurchaseRef(exp) || '').trim()
            : String(exp.referenceNo || exp.refNo || exp.purchaseInvoiceRef || exp.purchaseInvoiceNo || exp.refInvoiceNo || exp.baseInvoiceNo || exp.originalInvoiceNo || exp.supplierInvoiceNo || exp.supplierBillNo || '').trim();
        if (!ref || ref === '-') return false;
        const base = this._findReferencedPurchaseBill(ref, exp);
        if (!base) return false;
        const st = String(base.status || '').toLowerCase();
        if (st === 'cancelled' || st === 'void' || st === 'canceled') return false;
        if (typeof VoucherManager === 'undefined') return false;
        const docTotal = Math.abs(parseFloat(base.total ?? base.amount ?? base.vch_amt ?? 0) || 0);
        const map = VoucherManager.getVoucherAllocationsMap(null, 'payment');
        const bal = VoucherManager.getDocumentBalance(base.id, docTotal, map, base.billNo || base.vch_no || base.invoiceNo, base, { allowLooseFallback: false });
        const applied = docTotal - bal;
        const noteAmt = Math.abs(parseFloat(exp.total ?? exp.amount ?? exp.vch_amt ?? 0) || 0);
        return applied + 0.05 >= noteAmt;
    },

    _creditNoteRowLinkStatus(inv) {
        return this._creditNoteSettlementLinked(inv) ? 'linked' : 'unlinked';
    },

    _debitNoteRowLinkStatus(exp) {
        return this._debitNoteSettlementLinked(exp) ? 'linked' : 'unlinked';
    },

    load(params = {}) {
        // Bank Mail → Create Voucher handoff: the Bank Mail view passes
        // `{ fromBankMail: true, prefill: {...}, mode: 'purchase' | 'gst' | 'non-gst' }`.
        // Pull prefill from sessionStorage as a fallback if the caller didn't
        // include it inline (some navigation paths drop params).
        let prefill = params.prefill || null;
        if (params.fromBankMail && !prefill) {
            try {
                const raw = sessionStorage.getItem('mail_bank_prefill');
                if (raw) prefill = JSON.parse(raw);
            } catch {}
        }

        const mode = params.mode || null;
        if (!mode) {
            this.renderSubSelection();
        } else {
            this.currentMode = mode;
            this.voucherListSortKey = 'voucherNo';
            this.voucherListSortDir = 'asc';
            this.noteListSortKey = 'docNo';
            this.noteListSortDir = 'asc';
            this.renderVouchersList();
        }

        if (params.fromBankMail && prefill) {
            // Clear the session hand-off so re-entering Vouchers later does not
            // re-trigger the create modal with stale data.
            try { sessionStorage.removeItem('mail_bank_prefill'); } catch {}
            setTimeout(() => this.openCreateVoucherFromBankMail(prefill), 250);
        }
    },

    openCreateVoucherFromBankMail(prefill) {
        if (!prefill || typeof prefill !== 'object') return;
        // Debit (bank outflow) → Payment to vendor (Purchase voucher).
        // Credit (bank inflow)  → Receipt from customer (mode already set by caller to gst/non-gst).
        const vtype = prefill.type === 'debit' ? 'payment' : 'receipt';
        this._pendingBankMailLink = {
            messageId: prefill.messageId,
            type: prefill.type,
            bankSender: prefill.bankSender,
            subject: prefill.subject
        };
        this.showCreateModal(vtype);

        // Populate fields once the modal DOM is in place. setupPartyDropdown
        // runs synchronously inside showCreateModal but we still defer so the
        // bootstrap Modal finishes its first frame.
        setTimeout(() => {
            const form = document.getElementById('createVoucherForm');
            if (!form) return;

            if (prefill.amount != null && !isNaN(Number(prefill.amount))) {
                const amountField = form.querySelector('[name="amount"]');
                if (amountField) amountField.value = Number(prefill.amount);
            }

            if (prefill.receivedAt) {
                const dateField = form.querySelector('[name="date"]');
                if (dateField) {
                    const d = new Date(Number(prefill.receivedAt));
                    if (!isNaN(d)) dateField.value = d.toISOString().split('T')[0];
                }
            }

            // Pre-select "Bank Transfer" — a bank-alert email almost always
            // corresponds to a bank-channel movement.
            const paymentModeField = form.querySelector('[name="paymentMode"]');
            if (paymentModeField) {
                paymentModeField.value = 'bank';
                if (typeof this.onPaymentModeChange === 'function') {
                    this.onPaymentModeChange(paymentModeField);
                }
            }

            // Seed party name from the bank sender's display name (e.g.,
            // "HDFC Bank InstaAlerts" out of "HDFC Bank InstaAlerts <alerts@hdfcbank.net>").
            if (prefill.bankSender) {
                const senderName = String(prefill.bankSender).split('<')[0].trim();
                const partySearch = document.getElementById('voucherPartySearch');
                if (partySearch) partySearch.value = senderName;
            }

            if (prefill.subject) {
                const remarksField = form.querySelector('[name="remarks"]');
                if (remarksField && !remarksField.value) remarksField.value = prefill.subject;
            }

            // Visual hint that the voucher was started from a bank email.
            const modalBody = document.querySelector('#createVoucherModal .modal-body');
            if (modalBody && !document.getElementById('bankMailPrefillBanner')) {
                const banner = document.createElement('div');
                banner.id = 'bankMailPrefillBanner';
                banner.className = 'alert alert-info mx-4 mt-2 mb-0 py-2 small';
                banner.innerHTML = `<i class="bi bi-envelope-open"></i>
                    Prefilled from bank email <strong>"${(prefill.subject || '').replace(/</g, '&lt;')}"</strong>
                    — saving will link this voucher back to the bank alert entry.`;
                modalBody.insertBefore(banner, modalBody.firstChild);
            }
        }, 250);
    },

    renderSubSelection() {
        const view = document.getElementById('vouchersView');
        if (!view) return;

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-cash-stack text-info me-2"></i> Vouchers</h2>
                    <button class="btn btn-outline-light btn-sm" onclick="App.showView('accounting')">
                        <i class="bi bi-arrow-left"></i> Back to Accounting
                    </button>
                </div>
                
                <div class="row g-4 justify-content-center pt-5">
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'gst'})" style="cursor:pointer">
                            <i class="bi bi-cash-stack text-success display-1 mb-4"></i>
                            <h3 class="card-title text-white">GST Vouchers</h3>
                            <p class="text-muted">Taxable Receipts/Payments</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'non-gst'})" style="cursor:pointer">
                            <i class="bi bi-wallet2 text-info display-1 mb-4"></i>
                            <h3 class="card-title text-white">Plain Vouchers</h3>
                            <p class="text-muted">Cash/Bank (No GST)</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'purchase'})" style="cursor:pointer">
                            <i class="bi bi-journal-check text-warning display-1 mb-4"></i>
                            <h3 class="card-title text-white">Purchase Vouchers</h3>
                            <p class="text-muted">Expense Tracking</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'credit-note'})" style="cursor:pointer">
                            <i class="bi bi-arrow-counterclockwise text-secondary display-1 mb-4"></i>
                            <h3 class="card-title text-white">Credit Note / Sales Return</h3>
                            <p class="text-muted">Customer Return Notes</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'debit-note'})" style="cursor:pointer">
                            <i class="bi bi-arrow-clockwise text-secondary display-1 mb-4"></i>
                            <h3 class="card-title text-white">Debit Note / Purchase Return</h3>
                            <p class="text-muted">Vendor Return Notes</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderVouchersList() {
        const view = document.getElementById('vouchersView');
        if (!view) return;

        const fyDateSources = this._fyDateSourcesForCurrentList();
        const fyOptList = this._indianFySelectOptionsFromDates(fyDateSources);
        const fyOptionsHtml = fyOptList.map((y) => {
            const v = String(y).replace(/"/g, '&quot;');
            const lab = String(this._fyLabelVoucher(y)).replace(/</g, '&lt;');
            return `<option value="${v}">${lab}</option>`;
        }).join('');
        const isNoteMode = this.currentMode === 'credit-note' || this.currentMode === 'debit-note';
        const typeColClass = isNoteMode ? 'col-md-3 d-none' : 'col-md-3';
        const linkColClass = isNoteMode ? 'col-md-7' : 'col-md-5';

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-cash-stack text-info me-2"></i> ${this.currentMode === 'gst' ? 'GST Vouchers' : (this.currentMode === 'purchase' ? 'Purchase Vouchers' : (this.currentMode === 'credit-note' ? 'Credit Note / Sales Return' : (this.currentMode === 'debit-note' ? 'Debit Note / Purchase Return' : 'Plain Vouchers')))}</h2>
                    <div>
                        <button class="btn btn-secondary btn-sm me-2" onclick="VouchersUI.importBankStatement()">
                            <i class="bi bi-bank"></i> Import Bank Statement
                        </button>
                        <button class="btn btn-outline-info btn-sm me-2" onclick="ExportImportHelper.openImportExport('vouchers')">
                            <i class="bi bi-arrow-left-right me-1"></i> Export/Import
                        </button>
                        <button class="btn btn-primary btn-sm me-2 ${this.currentMode === 'credit-note' || this.currentMode === 'debit-note' ? 'd-none' : ''}" onclick="VouchersUI.showCreateModal('${this.currentMode === 'purchase' ? 'payment' : 'receipt'}')">
                            <i class="bi bi-plus-lg"></i> New ${this.currentMode === 'purchase' ? 'Purchase' : 'Voucher'}
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="VouchersUI.load()">
                            <i class="bi bi-arrow-left"></i> Back to Selection
                        </button>
                    </div>
                </div>

                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                         <div class="row g-2 mb-3">
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Financial year</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterVoucherFY" onchange="VouchersUI.onVoucherFyChange()">
                                    <option value="">All FY</option>
                                    ${fyOptionsHtml}
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small text-muted">Month (within FY)</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterVoucherMonth" onchange="VouchersUI.filterVouchers()">
                                    <option value="">All months</option>
                                </select>
                            </div>
                            <div class="${typeColClass}">
                                <label class="form-label small text-muted">Voucher Type</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterVoucherType" onchange="VouchersUI.filterVouchers()">
                                    <option value="">All Types</option>
                                    <option value="receipt">Receipt (In)</option>
                                    <option value="payment">Payment (Out)</option>
                                    <option value="contra">Contra</option>
                                </select>
                            </div>
                            <div class="${linkColClass}">
                                <label class="form-label small text-muted">Link to bill / invoice</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterVoucherLink" onchange="VouchersUI.filterVouchers()" title="Receipts/payments: allocation lines. Credit/debit notes: referenced bill exists and receipts/payments plus return notes against that ref cover this note (ref may be taken from narration).">
                                    <option value="">All</option>
                                    <option value="linked">Linked</option>
                                    <option value="unlinked">Not linked</option>
                                </select>
                            </div>
                        </div>
                        <p class="small text-muted mb-0">${this.currentMode === 'credit-note' || this.currentMode === 'debit-note' ? 'Linked = sales/purchase invoice ref is resolved (including from narration) and receipts/payments + return notes against that bill cover this note. Not linked = missing ref, cancelled base, or not enough settlement.' : 'Shows vouchers with or without linked invoice/bill lines.'}</p>
                         <div class="input-group">
                            <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                             <input type="text" class="form-control bg-dark text-light border-secondary" id="voucherSearch" placeholder="Search vouchers by number, party, or remarks..." oninput="VouchersUI.filterVouchersDebounced()">
                        </div>
                    </div>
                </div>

                <div class="table-responsive" id="vouchersTableContainer">
                     <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                    </div>
                </div>
            </div>
        `;

        this._afterRenderVoucherFilters();
        this.updateTable();
    },

    updateTable() {
        if (this.currentMode === 'credit-note') {
            this.updateCreditNotesTable();
            return;
        }
        if (this.currentMode === 'debit-note') {
            this.updateDebitNotesTable();
            return;
        }

        if (!this._voucherSkipLimitReset) {
            this._vouchersListVisibleLimit = 150;
        }
        this._voucherSkipLimitReset = false;

        // Fetch vouchers
        let vouchers = DataManager.getData('vouchers') || [];
        
        // Refactored logic based on user feedback:
        // Purchase Vouchers Mode: Show Payments (Out)
        // GST Vouchers Mode: Show Receipts (In)
        
        if (this.currentMode === 'purchase') {
            vouchers = (DataManager.getData('vouchers') || []).filter(v => v.type === 'payment');
        } else if (this.currentMode === 'gst') {
            vouchers = (DataManager.getData('vouchers') || []).filter(v => v.type === 'receipt' && v.hasGst === true);
        } else if (this.currentMode === 'non-gst') {
            vouchers = (DataManager.getData('vouchers') || []).filter(v => v.type === 'receipt' && v.hasGst === false);
        }

        const list = (vouchers || []).filter((v) => this._voucherPassesListModeFilter(v));
        this._applyVoucherListSort(list);

        const fyFilter = (document.getElementById('filterVoucherFY')?.value || '').trim();
        const monthFilter = document.getElementById('filterVoucherMonth')?.value || '';
        const typeFilter = document.getElementById('filterVoucherType')?.value || '';
        const linkFilter = document.getElementById('filterVoucherLink')?.value || '';
        const query = (document.getElementById('voucherSearch')?.value || '').toLowerCase();

        const rowYm = (d) => {
            if (typeof GTESFinancialYearUi !== 'undefined' && GTESFinancialYearUi.ymFromIsoDate) {
                return GTESFinancialYearUi.ymFromIsoDate(d) || '';
            }
            const dt = new Date(d || '');
            return Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        };

        const filtered = list.filter((v) => {
            if (fyFilter && DataManager.getFinancialYear(v.date) !== fyFilter) return false;
            if (monthFilter && rowYm(v.date) !== monthFilter) return false;
            if (typeFilter && String(v.type || '').toLowerCase() !== typeFilter) return false;
            const linkStr = this._voucherHasLinkedDocs(v) ? 'linked' : 'unlinked';
            if (linkFilter && linkStr !== linkFilter) return false;
            const searchStr = `${v.id} ${v.displayVoucherNo || ''} ${v.voucherNo || ''} ${v.customerName || ''} ${v.remarks || ''} ${v.paymentMode || ''}`.toLowerCase();
            if (query && !searchStr.includes(query)) return false;
            return true;
        });

        const container = document.getElementById('vouchersTableContainer');
        if (!container) return;

        if (list.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-wallet2 fs-1 d-block mb-3"></i>
                    No vouchers found.
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-funnel fs-1 d-block mb-3"></i>
                    No vouchers match the current filters.
                </div>
            `;
            return;
        }

        const limit = Math.min(filtered.length, Math.max(50, this._vouchersListVisibleLimit || 150));
        const page = filtered.slice(0, limit);

        const html = `
            <table class="table table-dark table-hover align-middle">
                <thead>
                    <tr>
                        ${this._voucherTh('date', 'Date', '')}
                        ${this._voucherTh('voucherNo', 'Voucher #', '')}
                        ${this._voucherTh('type', 'Type', '')}
                        ${this._voucherTh('party', 'Party / Account', '')}
                        ${this._voucherTh('amount', 'Amount', 'text-end')}
                        ${this._voucherTh('mode', 'Mode', 'text-center')}
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${page.map((v) => {
            const vchLabel = String(v.displayVoucherNo || v.voucherNo || '').trim() || v.id;
            const searchStr = `${v.id} ${v.displayVoucherNo || ''} ${v.voucherNo || ''} ${v.customerName || ''} ${v.remarks || ''} ${v.paymentMode || ''}`.toLowerCase();
            const yearStr = DataManager.getFinancialYear(v.date);
            const dt = new Date(v.date || '');
            const ymd = Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            const ym = Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            const typeStr = (v.type || 'general').toLowerCase();
            const linkStr = this._voucherHasLinkedDocs(v) ? 'linked' : 'unlinked';

            return `
                        <tr data-search="${searchStr}" data-year="${yearStr}" data-month="${ym}" data-date="${ymd}" data-type="${typeStr}" data-link="${linkStr}">
                            <td>${v.date}</td>
                            <td class="fw-bold text-info">${vchLabel}${vchLabel !== v.id ? `<br><small class="text-muted">${v.id}</small>` : ''}</td>
                            <td><span class="badge bg-${v.type === 'receipt' ? 'success' : (v.type === 'payment' ? 'danger' : 'warning')} text-capitalize">${v.type || 'General'}</span></td>
                            <td>
                                ${v.customerName || v.customerId || 'N/A'}
                                ${(() => {
                const lid = v.linkedInvoiceId != null ? String(v.linkedInvoiceId).trim() : '';
                const bad = !lid || lid === '-1';
                const a0 = !bad ? null : (v.allocations && v.allocations[0]);
                const fromAlloc = a0 && (a0.invoiceNo || a0.billNo || a0.no);
                const ref = !bad ? lid : (fromAlloc ? String(fromAlloc).trim() : '');
                if (!ref || ref === '-1') return '';
                return `<br><small class="text-muted"><i class="bi bi-link-45deg"></i> Inv: ${ref}</small>`;
            })()}
                            </td>
                            <td class="text-end">₹${(typeof VoucherManager !== 'undefined' && VoucherManager.resolveSettlementDisplay
                                ? VoucherManager.resolveSettlementDisplay(v).totalSettlement
                                : (parseFloat(v.amount) + parseFloat(v.tdsAmount || 0) + parseFloat(v.discountAmount || 0))).toFixed(2)}</td>
                            <td class="text-center gtes-td-mode">${v.paymentMode || 'Cash'}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-warning" onclick="VouchersUI.showEditVoucherModal('${v.id}')" title="Edit Voucher">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-info ms-1" onclick="VouchersUI.previewVoucher('${v.id}')" title="View Voucher">
                                    <i class="bi bi-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-light ms-1" onclick="VouchersUI.generatePDF('${v.id}')" title="Print/PDF">
                                    <i class="bi bi-printer"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger ms-1" onclick="VouchersUI.deleteVoucher('${v.id}')" title="Delete">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2 px-1 small text-body-secondary">
                <span>Showing ${page.length} of ${filtered.length} vouchers</span>
                ${filtered.length > page.length ? '<button type="button" class="btn btn-sm btn-outline-info" onclick="VouchersUI.loadMoreVouchers()">Load more</button>' : ''}
            </div>
        `;
        container.innerHTML = html;
    },

    _isCreditNoteInvoice(inv) {
        if (!inv) return false;
        if (typeof BusinessAnalytics !== 'undefined' && typeof BusinessAnalytics._isCreditNoteInvoice === 'function') {
            return BusinessAnalytics._isCreditNoteInvoice(inv);
        }
        const t = String(inv.type || '').toLowerCase();
        if (t.includes('credit') && t.includes('note')) return true;
        if (t.includes('sales') && t.includes('return')) return true;
        if (inv.isCreditNote === true) return true;
        const bk = String(inv.bookkeeperVchType || inv.v_type || '').toLowerCase();
        return bk.includes('credit note') || bk.includes('sales return');
    },

    _isDebitNotePurchase(exp) {
        if (!exp) return false;
        if (typeof BusinessAnalytics !== 'undefined' && typeof BusinessAnalytics._isDebitNotePurchase === 'function') {
            return BusinessAnalytics._isDebitNotePurchase(exp);
        }
        const t = String(exp.type || exp.v_type || exp.billType || '').toLowerCase();
        if (t.includes('debit') && t.includes('note')) return true;
        if (t.includes('purchase') && t.includes('return')) return true;
        return exp.isDebitNote === true;
    },

    updateCreditNotesTable() {
        if (!this._voucherSkipLimitReset) {
            this._vouchersListVisibleLimit = 150;
        }
        this._voucherSkipLimitReset = false;

        const container = document.getElementById('vouchersTableContainer');
        if (!container) return;
        let invoices = (DataManager.getData('invoices') || [])
            .filter(inv => this._isCreditNoteInvoice(inv));
        this._applyCreditNoteSort(invoices);

        if (invoices.length === 0) {
            container.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-receipt-cutoff fs-1 d-block mb-3"></i>No credit notes found.</div>`;
            return;
        }

        const fyFilter = (document.getElementById('filterVoucherFY')?.value || '').trim();
        const monthFilter = document.getElementById('filterVoucherMonth')?.value || '';
        const linkFilter = document.getElementById('filterVoucherLink')?.value || '';
        const query = (document.getElementById('voucherSearch')?.value || '').toLowerCase();

        const rowYm = (d) => {
            if (typeof GTESFinancialYearUi !== 'undefined' && GTESFinancialYearUi.ymFromIsoDate) {
                return GTESFinancialYearUi.ymFromIsoDate(d) || '';
            }
            const dt = new Date(d || '');
            return Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        };

        invoices = invoices.filter((inv) => {
            if (fyFilter && DataManager.getFinancialYear(inv.date) !== fyFilter) return false;
            if (monthFilter && rowYm(inv.date) !== monthFilter) return false;
            if (linkFilter && this._creditNoteRowLinkStatus(inv) !== linkFilter) return false;
            const refNo = this._creditNoteRef(inv);
            const search = `${inv.invoiceNo || inv.id} ${inv.customerName || ''} ${refNo}`.toLowerCase();
            if (query && !search.includes(query)) return false;
            return true;
        });

        if (invoices.length === 0) {
            container.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-funnel fs-1 d-block mb-3"></i>No credit notes match the current filters.</div>`;
            return;
        }

        const limit = Math.min(invoices.length, Math.max(50, this._vouchersListVisibleLimit || 150));
        const page = invoices.slice(0, limit);

        container.innerHTML = `
            <table class="table table-dark table-hover align-middle">
                <thead>
                    <tr>
                        ${this._noteTh('date', 'Date', '')}
                        ${this._noteTh('docNo', 'Credit Note #', '')}
                        ${this._noteTh('party', 'Customer', '')}
                        ${this._noteTh('ref', 'Sales Invoice Ref', '')}
                        ${this._noteTh('amount', 'Amount', 'text-end')}
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${page.map(inv => {
            const amount = Math.abs(parseFloat(inv.total ?? inv.amount ?? 0) || 0);
            const refNo = this._creditNoteRef(inv);
            const search = `${inv.invoiceNo || inv.id} ${inv.customerName || ''} ${refNo}`.toLowerCase();
            const linkStr = this._creditNoteRowLinkStatus(inv);
            const dt = new Date(inv.date || '');
            const ymd = Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            const ym = Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            return `
                        <tr data-search="${search}" data-year="${DataManager.getFinancialYear(inv.date)}" data-month="${ym}" data-date="${ymd}" data-type="credit-note" data-link="${linkStr}">
                            <td>${inv.date || ''}</td>
                            <td class="fw-bold text-info">${inv.invoiceNo || inv.id}</td>
                            <td>${inv.customerName || inv.customerId || 'N/A'}</td>
                            <td>${refNo}</td>
                            <td class="text-end">₹${amount.toFixed(2)}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewInvoice('${inv.id}')" title="View"><i class="bi bi-eye"></i></button>
                                <button class="btn btn-sm btn-outline-light ms-1" onclick="InvoicesUI.generatePDF('${inv.id}')" title="Print/PDF"><i class="bi bi-printer"></i></button>
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2 px-1 small text-body-secondary">
                <span>Showing ${page.length} of ${invoices.length} credit notes</span>
                ${invoices.length > page.length ? '<button type="button" class="btn btn-sm btn-outline-info" onclick="VouchersUI.loadMoreVouchers()">Load more</button>' : ''}
            </div>
        `;
    },

    updateDebitNotesTable() {
        if (!this._voucherSkipLimitReset) {
            this._vouchersListVisibleLimit = 150;
        }
        this._voucherSkipLimitReset = false;

        const container = document.getElementById('vouchersTableContainer');
        if (!container) return;
        let purchases = (DataManager.getData(DataManager.KEYS.EXPENSES) || [])
            .filter(exp => this._isDebitNotePurchase(exp));
        this._applyDebitNoteSort(purchases);

        if (purchases.length === 0) {
            container.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-receipt-cutoff fs-1 d-block mb-3"></i>No debit notes found.</div>`;
            return;
        }

        const fyFilter = (document.getElementById('filterVoucherFY')?.value || '').trim();
        const monthFilter = document.getElementById('filterVoucherMonth')?.value || '';
        const linkFilter = document.getElementById('filterVoucherLink')?.value || '';
        const query = (document.getElementById('voucherSearch')?.value || '').toLowerCase();

        const rowYm = (d) => {
            if (typeof GTESFinancialYearUi !== 'undefined' && GTESFinancialYearUi.ymFromIsoDate) {
                return GTESFinancialYearUi.ymFromIsoDate(d) || '';
            }
            const dt = new Date(d || '');
            return Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        };

        purchases = purchases.filter((p) => {
            if (fyFilter && DataManager.getFinancialYear(p.date) !== fyFilter) return false;
            if (monthFilter && rowYm(p.date) !== monthFilter) return false;
            if (linkFilter && this._debitNoteRowLinkStatus(p) !== linkFilter) return false;
            const docNo = p.billNo || p.vch_no || p.id || '';
            const refNo = this._debitNoteRef(p);
            const search = `${docNo} ${p.vendor || ''} ${refNo}`.toLowerCase();
            if (query && !search.includes(query)) return false;
            return true;
        });

        if (purchases.length === 0) {
            container.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-funnel fs-1 d-block mb-3"></i>No debit notes match the current filters.</div>`;
            return;
        }

        const limit = Math.min(purchases.length, Math.max(50, this._vouchersListVisibleLimit || 150));
        const page = purchases.slice(0, limit);

        container.innerHTML = `
            <table class="table table-dark table-hover align-middle">
                <thead>
                    <tr>
                        ${this._noteTh('date', 'Date', '')}
                        ${this._noteTh('docNo', 'Debit Note #', '')}
                        ${this._noteTh('party', 'Vendor', '')}
                        ${this._noteTh('ref', 'Purchase Invoice Ref', '')}
                        ${this._noteTh('amount', 'Amount', 'text-end')}
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${page.map(p => {
            const amount = Math.abs(parseFloat(p.total ?? p.amount ?? p.vch_amt ?? 0) || 0);
            const docNo = p.billNo || p.vch_no || p.id || '';
            const refNo = this._debitNoteRef(p);
            const search = `${docNo} ${p.vendor || ''} ${refNo}`.toLowerCase();
            const linkStr = this._debitNoteRowLinkStatus(p);
            const dt = new Date(p.date || '');
            const ymd = Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            const ym = Number.isNaN(dt.getTime()) ? '' : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            return `
                        <tr data-search="${search}" data-year="${DataManager.getFinancialYear(p.date)}" data-month="${ym}" data-date="${ymd}" data-type="debit-note" data-link="${linkStr}">
                            <td>${p.date || ''}</td>
                            <td class="fw-bold text-info">${docNo}</td>
                            <td>${p.vendor || p.vendorName || 'N/A'}</td>
                            <td>${refNo}</td>
                            <td class="text-end">₹${amount.toFixed(2)}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewPurchase('${p.id}')" title="View"><i class="bi bi-eye"></i></button>
                                <button class="btn btn-sm btn-outline-light ms-1" onclick="DeliveryUI.downloadPurchasePdf('${p.id}')" title="Print/PDF"><i class="bi bi-printer"></i></button>
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2 px-1 small text-body-secondary">
                <span>Showing ${page.length} of ${purchases.length} debit notes</span>
                ${purchases.length > page.length ? '<button type="button" class="btn btn-sm btn-outline-info" onclick="VouchersUI.loadMoreVouchers()">Load more</button>' : ''}
            </div>
        `;
    },

    filterVouchers() {
        if (this.currentMode === 'credit-note') {
            this.updateCreditNotesTable();
            return;
        }
        if (this.currentMode === 'debit-note') {
            this.updateDebitNotesTable();
            return;
        }
        this.updateTable();
    },

    filterVouchersDebounced() {
        if (this._voucherFilterDebounceTimer) clearTimeout(this._voucherFilterDebounceTimer);
        this._voucherFilterDebounceTimer = setTimeout(() => {
            this._voucherFilterDebounceTimer = null;
            this.filterVouchers();
        }, 100);
    },

    showCreateModal(type = 'receipt') {
        // Clear any stale backdrop before opening a fresh voucher modal
        this.cleanupBackdrops();

        let customers = [];
        if (typeof CustomerManager !== 'undefined') {
            customers = CustomerManager.getAllCustomers();
        } else {
            customers = DataManager.getData('customers') || [];
        }

        const customerOptions = customers.map(c => `<option value="${c.name}">${c.phone || ''}</option>`).join('');

        // Define titles based on type
        const isPayment = type === 'payment';
        const title = isPayment ? 'Payment Out (To Supplier)' : 'Receipt In (From Customer)';

        // Cleanup existing modal if any
        const existing = document.getElementById('createVoucherModal');
        if (existing) {
            const inst = bootstrap.Modal.getInstance(existing);
            if (inst) inst.dispose();
            existing.remove();
            this.cleanupBackdrops();
        }

        const modalHtml = `
            <div class="modal fade" id="createVoucherModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable"> <!-- XL modal for more space -->
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title"><i class="bi bi-wallet2 me-2"></i>New Voucher - ${title}</h5>
                            <div>
                                <button type="button" class="btn btn-sm btn-link text-white" onclick="document.querySelector('#createVoucherModal .modal-dialog').classList.toggle('modal-fullscreen')" title="Toggle Fullscreen">
                                    <i class="bi bi-arrows-fullscreen"></i>
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0 bg-dark text-white d-flex flex-column" style="max-height: calc(100vh - 120px); overflow: hidden;">
                            <style>
                                .vch-form-control {
                                    background: #1a1d20 !important;
                                    border: 1px solid #373b3e !important;
                                    color: #fff !important;
                                }
                                .vch-form-control:focus {
                                    background: #212529 !important;
                                    border-color: #0dcaf0 !important;
                                    box-shadow: 0 0 0 0.25rem rgba(13, 202, 240, 0.25) !important;
                                }
                                .highlight-vch {
                                    border: 1px solid #0dcaf0 !important;
                                    background: rgba(13, 202, 240, 0.05) !important;
                                    font-weight: bold;
                                    color: #0dcaf0 !important;
                                }
                                .vch-form-label {
                                    font-size: 0.8rem;
                                    color: #6c757d;
                                    margin-bottom: 0.25rem;
                                    font-weight: 500;
                                }
                            </style>
                            <form id="createVoucherForm" class="d-flex flex-column h-100">
                                <!-- Fixed Top Section -->
                                <div class="p-4 flex-shrink-0" style="background: var(--bs-dark); z-index: 10;">
                                    <div class="row mb-3">
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Type</div>
                                            <select class="form-select vch-form-control" name="type" id="voucherType" onchange="VouchersUI.onVoucherTypeChange(this.value)">
                                                <option value="receipt" ${!isPayment ? 'selected' : ''}>Receipt (From Customer)</option>
                                                <option value="payment" ${isPayment ? 'selected' : ''}>Payment (To Vendor)</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Voucher No.</div>
                                            <input type="text" class="form-control vch-form-control highlight-vch" name="voucherId" id="voucherIdField" value="${VoucherManager.getNextVoucherNumber(type, new Date(), this.currentMode)}" required>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Date</div>
                                            <input type="date" class="form-control vch-form-control" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                                        </div>
                                        <div class="col-md-6 mt-3 mt-md-0" id="invoiceSelectContainer">
                                            <div class="vch-form-label" id="lblParty">Party Name</div>
                                            <div class="position-relative">
                                                <input type="text" class="form-control vch-form-control" id="voucherPartySearch" name="customerName" placeholder="Type to search party..." autocomplete="off" required>
                                                <div id="voucherPartyDropdown" class="list-group position-absolute w-100 shadow d-none" style="z-index: 1050; max-height: 250px; overflow-y: auto;">
                                                    <!-- Dropdown items here -->
                                                </div>
                                            </div>
                                            <input type="hidden" name="customerId" id="voucherCustomerId">
                                            <input type="hidden" name="customerAddress" id="voucherCustomerAddress">
                                        </div>
                                    </div>
                                    <div class="row">
                                         <div class="col-md-3">
                                            <div class="vch-form-label">Amount</div>
                                            <input type="number" class="form-control vch-form-control" name="amount" min="0" step="0.01" required>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Payment Mode</div>
                                            <select class="form-select vch-form-control" name="paymentMode" onchange="VouchersUI.onPaymentModeChange(this)">
                                                <option value="cash">Cash</option>
                                                <option value="bank">Bank Transfer</option>
                                                <option value="cheque">Cheque</option>
                                                <option value="upi">UPI/Online</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3" id="refNoContainer" style="display:none;">
                                            <div class="vch-form-label">Ref/Cheque No.</div>
                                            <input type="text" class="form-control vch-form-control" name="refNo" placeholder="Cheque/Ref No">
                                        </div>
                                        <div class="col-md-2" id="tdsContainer" style="${this.currentMode !== 'gst' ? 'display:none;' : ''}">
                                            <div class="vch-form-label text-warning">TDS Amount</div>
                                            <input type="number" class="form-control bg-dark border-warning text-warning" name="tdsAmount" id="tdsAmount" value="0" min="0" step="0.01" oninput="VouchersUI.calculateTotal()" placeholder="TDS">
                                        </div>
                                        <div class="col-md-2" id="discountContainer">
                                            <div class="vch-form-label text-info">Discount</div>
                                            <input type="number" class="form-control bg-dark border-info text-info" name="discountAmount" id="discountAmount" value="0" min="0" step="0.01" oninput="VouchersUI.calculateTotal()" placeholder="Discount">
                                        </div>
                                        <div class="col-md-2" id="remarksContainer">
                                            <div class="vch-form-label">Remarks</div>
                                            <input type="text" class="form-control vch-form-control" name="remarks" placeholder="Optional remarks">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Scrollable Invoice Linking Section -->
                                <div id="invoiceLinkingSection" class="p-4 pt-1 d-none" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                                    <label class="form-label fw-bold text-info flex-shrink-0"><i class="bi bi-link-45deg"></i> Select Pending Invoices:</label>
                                    <div class="table-responsive border border-secondary rounded" style="background: rgba(0,0,0,0.2); flex: 1; overflow-y: auto;">
                                        <table class="table table-dark table-sm table-bordered border-secondary" id="pendingInvoicesTable">
                                            <thead class="sticky-top bg-secondary">
                                                <tr>
                                                    <th width="30"></th> <!-- Checkbox -->
                                                    <th>Invoice No / Date</th>
                                                    <th class="text-end">Total</th>
                                                    <th class="text-end">Pending</th>
                                                    <th width="120" class="text-end">Amount to Pay</th>
                                                </tr>
                                            </thead>
                                            <tbody id="pendingInvoicesBody">
                                                <!-- Rows injected via JS -->
                                            </tbody>
                                            <tfoot>
                                                <tr class="fw-bold">
                                                    <td colspan="4" class="text-end pe-3">Advance Payment / On Account:</td>
                                                    <td class="p-0"><input type="number" class="form-control form-control-sm bg-dark text-white border-0 text-end" id="advanceAmount" value="0.00" oninput="VouchersUI.calculateTotal()" /></td>
                                                </tr>
                                                <tr class="fw-bold table-active">
                                                    <td colspan="4" class="text-end pe-3">Total Voucher Amount:</td>
                                                    <td class="text-end" id="totalVoucherAmount">0.00</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                     </div>
                                </div>
                                <!-- Hidden Fields -->
                                <input type="hidden" name="bankDescription" id="bankDescription">
                                <input type="hidden" name="bankTxIndex" id="bankTxIndex">
                                <input type="hidden" name="finalAmount" id="finalAmount">
                                <input type="hidden" name="linkedInvoicesJSON" id="linkedInvoicesJSON">

                            </form>
                        </div>
                        <div class="modal-footer border-secondary mt-auto">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="VouchersUI.saveVoucher()">Save Voucher</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('createVoucherModal');
        const modal = new bootstrap.Modal(modalEl);
        
        // Setup the custom dropdown logic
        this.setupPartyDropdown();
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            this.cleanupBackdrops();
            modalEl.remove(); // Self-destruct after hiding to clean up DOM
        });

        modal.show();
    },

    onVoucherTypeChange(type) {
        this.toggleReferenceFields(type);
        
        // Update Voucher No for the new type
        const idField = document.getElementById('voucherIdField');
        if (idField) {
            const dateInput = document.querySelector('#createVoucherForm [name="date"]');
            const d = dateInput && dateInput.value ? new Date(dateInput.value) : new Date();
            idField.value = VoucherManager.getNextVoucherNumber(type, d, this.currentMode);
        }
    },

    toggleReferenceFields(type) {
        // Simple placeholder if needed, current implementation doesn't strictly need logic here 
        // as onVoucherTypeChange handles it, but keeping for compatibility.
    },

    onPaymentModeChange(select) {
        const refContainer = document.getElementById('refNoContainer');
        const remarksContainer = document.getElementById('remarksContainer');
        const discountContainer = document.getElementById('discountContainer');

        if (select.value === 'cheque' || select.value === 'upi' || select.value === 'bank') {
            refContainer.style.display = 'block';
            remarksContainer.className = 'col-md-2';
        } else {
            refContainer.style.display = 'none';
            remarksContainer.className = 'col-md-4';
        }
    },

    // --- Bank Statement Import Logic ---

    async importBankStatement() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv, .xlsx, .xls';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    App.showNotification('Reading bank statement...', 'info');
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Get raw JSON keeping headers intact
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                    if (jsonData.length < 2) {
                        App.showNotification('File is empty or invalid format.', 'error');
                        return;
                    }

                    // Find header row (skip empty top rows)
                    let headerIdx = 0;
                    for (let i = 0; i < jsonData.length; i++) {
                        const row = jsonData[i].filter(cell => cell !== null && cell !== '');
                        if (row.length > 2) {
                            headerIdx = i;
                            break;
                        }
                    }

                    const headers = jsonData[headerIdx].map(h => String(h || '').trim());
                    const rows = jsonData.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));

                    App.showNotification(`Parsing ${rows.length} transactions...`, 'info');
                    const mapping = BankImportHelper.detectColumns(headers);
                    const transactions = (typeof BankImportHelper.mapToTransactionsAsync === 'function')
                        ? await BankImportHelper.mapToTransactionsAsync(rows, mapping)
                        : BankImportHelper.mapToTransactions(rows, mapping);

                    await this.showStatementProcessingModal(transactions);
                } catch (err) {
                    console.error('Bank statement import failed:', err);
                    App.showNotification('Bank statement import failed: ' + err.message, 'error');
                }
            };
            
            reader.readAsArrayBuffer(file);
        };
        fileInput.click();
    },

    renderBankRow(tx, index) {
        const isDebit = tx.type === 'debit';
        const match = VoucherManager.resolveBankParty(tx.description);
        const matchHtml = match ? `<span class="badge bg-primary ms-1"><i class="bi bi-magic"></i> ${match}</span>` : '';

        let actionHtml = '';
        const alreadyVouchered = match && VoucherManager.checkDuplicateVoucher(match, tx.amount, tx.date);

        if (tx.converted || alreadyVouchered) {
            actionHtml = `<span class="badge bg-success p-2"><i class="bi bi-check-circle-fill me-1"></i> ${alreadyVouchered ? 'Already Exists' : 'Imported'}</span>`;
            tx.converted = true;
        } else if (tx.isReady) {
            actionHtml = `
                <div class="d-flex flex-column gap-1">
                    <span class="badge bg-warning p-2 text-dark mb-1"><i class="bi bi-clock-history me-1"></i> Ready to Import</span>
                    <button class="btn btn-sm btn-outline-info" onclick="VouchersUI.convertBankTx(${index})">
                        <i class="bi bi-pencil"></i> Edit Details
                    </button>
                </div>`;
        } else {
            actionHtml = `
                <div class="d-flex gap-1 justify-content-center flex-wrap">
                    <button class="btn btn-sm btn-${isDebit ? 'outline-warning' : 'outline-info'}" 
                            onclick="VouchersUI.convertBankTx(${index})">
                        <i class="bi bi-${isDebit ? 'arrow-up-right' : 'arrow-down-left'}"></i>
                        ${isDebit ? 'Payment' : 'Receipt'}
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" 
                            onclick="VouchersUI.assignBankParty(${index})" title="Link to party name for future auto-matching">
                        <i class="bi bi-person-plus"></i> Assign Party
                    </button>
                    <button class="btn btn-sm btn-outline-primary" 
                            onclick="VouchersUI.showAssignToVoucherModal(${index})" title="Link to an existing voucher (allows amount differences)">
                        <i class="bi bi-link-45deg"></i> Link Voucher
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="VouchersUI.deleteBankRow(${index})" title="Delete this transaction">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>`;
        }

        return `
            <tr class="${tx.converted || alreadyVouchered ? 'bs-imported-row' : (tx.isReady ? 'bs-ready-row' : '')}" data-index="${index}">
                <td class="text-center align-middle">
                    <input type="checkbox" class="form-check-input bs-row-checkbox" value="${index}" onchange="VouchersUI.updateBankSelectionStatus()">
                </td>
                <td class="small">${new Date(tx.date).toLocaleDateString()}</td>
                <td class="small" style="max-width: 300px;">
                    <div class="text-truncate" title="${tx.description}">${tx.description}</div>
                    ${matchHtml}
                </td>
                <td class="text-end text-danger fw-bold">${isDebit ? tx.amount.toFixed(2) : ''}</td>
                <td class="text-end text-success fw-bold">${!isDebit ? tx.amount.toFixed(2) : ''}</td>
                <td class="text-center">
                    ${actionHtml}
                </td>
            </tr>
        `;
    },

    async _renderBankRowsChunked(tbody, transactions) {
        if (!tbody) return;
        tbody.innerHTML = '';
        const list = Array.isArray(transactions) ? transactions : [];
        for (let i = 0; i < list.length; i += this.BANK_RENDER_CHUNK_SIZE) {
            const chunk = list.slice(i, i + this.BANK_RENDER_CHUNK_SIZE);
            const rowsHtml = chunk.map((tx, idx) => this.renderBankRow(tx, i + idx)).join('');
            tbody.insertAdjacentHTML('beforeend', rowsHtml);
            await this._yieldToUI();
        }
    },

    async showStatementProcessingModal(transactions) {
        this.currentBankTransactions = transactions;
        
        // Remove existing to avoid duplicate IDs in DOM
        const existing = document.getElementById('bankStatementModal');
        
        if (existing) {
            // Partial refresh: update only the tbody if modal already open
            const tbody = existing.querySelector('tbody');
            if (tbody) {
                await this._renderBankRowsChunked(tbody, transactions);
                this.filterBankRows();
                return;
            }
        }

        let isFullscreen = false;
        if (existing) {
            isFullscreen = existing.querySelector('.modal-dialog')?.classList.contains('modal-fullscreen');
            const modalInstance = bootstrap.Modal.getInstance(existing);
            if (modalInstance) modalInstance.dispose();
            existing.remove();
        }

        const modalHtml = `
            <div class="modal fade" id="bankStatementModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable ${isFullscreen ? 'modal-fullscreen' : ''}">
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title"><i class="bi bi-bank me-2"></i>Process Bank Statement</h5>
                            <div>
                                <button type="button" class="btn btn-sm btn-link text-white" onclick="document.querySelector('#bankStatementModal .modal-dialog').classList.toggle('modal-fullscreen')" title="Toggle Fullscreen">
                                    <i class="bi bi-arrows-fullscreen"></i>
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0 d-flex flex-column" style="height: ${isFullscreen ? 'calc(100vh - 120px)' : 'auto'}; position: relative;">
                            <style>
                                #bankStatementModal .modal-content {
                                    background: rgba(33, 37, 41, 0.95) !important;
                                    backdrop-filter: blur(10px);
                                    border: 1px solid rgba(255, 255, 255, 0.1);
                                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                                }
                                #bankStatementModal .modal-header, #bankStatementModal .modal-footer {
                                    border-color: rgba(255, 255, 255, 0.1);
                                    background: rgba(0, 0, 0, 0.2);
                                }
                                .btn-premium-import {
                                    background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%);
                                    border: none;
                                    color: white;
                                    padding: 8px 20px;
                                    border-radius: 6px;
                                    font-weight: 600;
                                    transition: all 0.3s ease;
                                    box-shadow: 0 4px 15px rgba(13, 110, 253, 0.3);
                                }
                                .btn-premium-import:hover:not(:disabled) {
                                    transform: translateY(-2px);
                                    box-shadow: 0 6px 20px rgba(13, 110, 253, 0.4);
                                    filter: brightness(1.1);
                                }
                                .btn-premium-import:active:not(:disabled) {
                                    transform: translateY(0);
                                }
                                .btn-premium-import:disabled {
                                    background: #495057;
                                    box-shadow: none;
                                    opacity: 0.6;
                                }
                                .btn-premium-excel {
                                    background: transparent;
                                    border: 1px solid #198754;
                                    color: #198754;
                                    padding: 8px 20px;
                                    border-radius: 6px;
                                    font-weight: 600;
                                    transition: all 0.3s ease;
                                }
                                .btn-premium-excel:hover {
                                    background: rgba(25, 135, 84, 0.1);
                                    color: #198754;
                                    border-color: #198754;
                                    transform: translateY(-2px);
                                }
                                .bs-status-badge {
                                    padding: 6px 12px;
                                    border-radius: 20px;
                                    font-size: 0.75rem;
                                    font-weight: 600;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 6px;
                                }
                                .bs-ready-row {
                                    background: rgba(255, 193, 7, 0.05) !important;
                                }
                                .bs-imported-row {
                                    background: rgba(25, 135, 84, 0.05) !important;
                                    opacity: 0.7;
                                }
                            </style>
                            <div class="alert alert-info mx-3 my-2 py-2 small d-flex align-items-center" style="background: rgba(13, 202, 240, 0.1); border: 1px solid rgba(13, 202, 240, 0.2); color: #0dcaf0;">
                                <i class="bi bi-info-circle-fill me-2 fs-5"></i> 
                                <span>Assign transactions to parties. Once "Ready to Import", use the checkboxes and click the <strong>Import Saved</strong> button.</span>
                            </div>
                            <div class="table-responsive flex-grow-1" style="max-height: ${isFullscreen ? 'calc(100vh - 200px)' : '75vh'};">
                                <table class="table table-dark table-hover table-sm mb-0 align-middle" style="border-collapse: separate; border-spacing: 0;">
                                    <thead class="sticky-top" style="z-index: 10;">
                                        <tr>
                                            <th style="background-color: #1a1d20; color: #adb5bd; border-bottom: 2px solid #343a40; width: 45px;" class="text-center px-3">
                                                <input type="checkbox" class="form-check-input" id="bsSelectAll" onchange="VouchersUI.toggleAllBankRows(this)">
                                            </th>
                                            <th style="background-color: #1a1d20; color: #adb5bd; border-bottom: 2px solid #343a40;">Date</th>
                                            <th style="background-color: #1a1d20; color: #adb5bd; border-bottom: 2px solid #343a40;">Description</th>
                                            <th class="text-end" style="background-color: #1a1d20; color: #adb5bd; border-bottom: 2px solid #343a40;">Debit</th>
                                            <th class="text-end" style="background-color: #1a1d20; color: #adb5bd; border-bottom: 2px solid #343a40;">Credit</th>
                                            <th class="text-center" style="background-color: #1a1d20; color: #adb5bd; border-bottom: 2px solid #343a40;">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody></tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary shadow-lg">
                            <span class="text-muted small me-auto"><i class="bi bi-shield-check me-1"></i> ${transactions.length} transactions loaded for processing.</span>
                            <button type="button" class="btn btn-outline-danger btn-sm me-2" id="btnDeleteSelectedBankTx" onclick="VouchersUI.deleteSelectedBankRows()" disabled>
                                <i class="bi bi-trash"></i> Delete Selected
                            </button>
                            <button type="button" class="btn btn-premium-import me-2" id="btnImportSelectedBankTx" onclick="VouchersUI.importSelectedBankTransactions()" disabled>
                                <i class="bi bi-cloud-arrow-down-fill me-1"></i> Import Saved
                            </button>
                            <button type="button" class="btn btn-premium-excel me-3" onclick="VouchersUI.exportVouchersToExcel()">
                                <i class="bi bi-file-earmark-spreadsheet-fill me-1"></i> Export Excel
                            </button>
                            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Cleanup any stuck backdrops before showing
        this.cleanupBackdrops();

        const modalEl = document.getElementById('bankStatementModal');

        const filters = this.bsFilters || { party: '', type: '', status: '', month: '' };
        const filterBarHtml = `
            <div class="d-flex gap-2 align-items-center flex-wrap px-3 pb-2 pt-0">
                <input type="text" id="bsPartyFilter" class="form-control form-control-sm bg-secondary text-white border-secondary" style="max-width:250px;" placeholder="Filter by party name..." oninput="VouchersUI.filterBankRowsDebounced()" value="${filters.party}">
                <input type="month" id="bsMonthFilter" class="form-control form-control-sm bg-secondary text-white border-secondary" style="max-width:160px;" onchange="VouchersUI.filterBankRows()" value="${filters.month || ''}">
                <select id="bsTypeFilter" class="form-select form-select-sm bg-secondary text-white border-secondary" style="max-width:160px;" onchange="VouchersUI.filterBankRows()">
                    <option value="" ${filters.type === '' ? 'selected' : ''}>All Types</option>
                    <option value="debit" ${filters.type === 'debit' ? 'selected' : ''}>Debit (Payments)</option>
                    <option value="credit" ${filters.type === 'credit' ? 'selected' : ''}>Credit (Receipts)</option>
                </select>
                <select id="bsStatusFilter" class="form-select form-select-sm bg-secondary text-white border-secondary" style="max-width:160px;" onchange="VouchersUI.filterBankRows()">
                    <option value="" ${filters.status === '' ? 'selected' : ''}>All Status</option>
                    <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending (Needs Action)</option>
                    <option value="ready" ${filters.status === 'ready' ? 'selected' : ''}>Ready for Import</option>
                    <option value="imported" ${filters.status === 'imported' ? 'selected' : ''}>Imported (This Session)</option>
                    <option value="matched" ${filters.status === 'matched' ? 'selected' : ''}>Auto-Matched</option>
                    <option value="exists" ${filters.status === 'exists' ? 'selected' : ''}>Already in DB</option>
                </select>
                <span id="bsRowCount" class="text-muted small ms-auto"></span>
            </div>
        `;
        const modalBody = modalEl.querySelector('.modal-body');
        const alertDiv = modalBody.querySelector('.alert');
        alertDiv.insertAdjacentHTML('afterend', filterBarHtml);
        const tbody = modalEl.querySelector('tbody');
        if (tbody) {
            await this._renderBankRowsChunked(tbody, transactions);
        }
        VouchersUI.filterBankRows(); // Init count

        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Ensure clicking close cleans up
        modalEl.addEventListener('hidden.bs.modal', () => {
            this.cleanupBackdrops();
            modalEl.remove(); 
        });

        // Store transactions temporarily
        this.currentBankTransactions = transactions;
    },

    filterBankRowsDebounced() {
        if (this.bsFilterTimeout) clearTimeout(this.bsFilterTimeout);
        this.bsFilterTimeout = setTimeout(() => {
            this.filterBankRows();
        }, 150); // Small delay to catch fast typers
    },

    cleanupBackdrops() {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    },

    filterBankRows() {
        const partyRaw = document.getElementById('bsPartyFilter')?.value || '';
        const partyQ = partyRaw.toLowerCase();
        const typeQ = (document.getElementById('bsTypeFilter')?.value || '');
        const statusQ = (document.getElementById('bsStatusFilter')?.value || '');
        const monthQ = (document.getElementById('bsMonthFilter')?.value || '');
        
        // Save for persistence
        this.bsFilters = { party: partyRaw, type: typeQ, status: statusQ, month: monthQ };

        const rows = document.querySelectorAll('#bankStatementModal tbody tr');
        let visible = 0;

        rows.forEach(row => {
            // Using .cells for slightly better performance than querySelector
            const descTd = row.cells[2];
            const debitTd = row.cells[3];
            
            const desc = (descTd?.textContent || '').toLowerCase();
            const isDebit = debitTd?.textContent.trim() !== '';
            const isImported = row.classList.contains('bs-imported-row') && !descTd?.innerText.includes('Already Exists');
            const isExists = descTd?.innerText.includes('Already Exists');
            const isReady = row.classList.contains('bs-ready-row');
            const hasMatch = descTd?.querySelector('.badge.bg-primary') !== null;
            const idx = parseInt(row.getAttribute('data-index') || '-1', 10);
            const tx = Number.isInteger(idx) && idx >= 0 ? this.currentBankTransactions[idx] : null;
            const txDate = tx && tx.date ? new Date(tx.date) : null;
            const txYm = txDate && !Number.isNaN(txDate.getTime()) ? `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}` : '';

            const partyOk = !partyQ || desc.includes(partyQ);
            const typeOk = !typeQ || (typeQ === 'debit' && isDebit) || (typeQ === 'credit' && !isDebit);
            const monthOk = !monthQ || txYm === monthQ;
            
            let statusOk = true;
            if (statusQ === 'imported') statusOk = isImported;
            else if (statusQ === 'ready') statusOk = isReady;
            else if (statusQ === 'exists') statusOk = isExists;
            else if (statusQ === 'pending') statusOk = !isImported && !isReady && !isExists;
            else if (statusQ === 'matched') statusOk = hasMatch;

            const show = partyOk && typeOk && monthOk && statusOk;
            row.style.display = show ? '' : 'none';
            if (show) visible++;
        });

        const counter = document.getElementById('bsRowCount');
        if (counter) counter.textContent = `${visible} of ${rows.length} transactions`;

        // Sync Select All checkbox and Import button
        this.updateBankSelectionStatus();
    },

    updateBankSelectionStatus() {
        const checkboxes = document.querySelectorAll('.bs-row-checkbox:checked');
        const btnDelete = document.getElementById('btnDeleteSelectedBankTx');
        const btnImport = document.getElementById('btnImportSelectedBankTx');
        
        if (btnDelete) btnDelete.disabled = checkboxes.length === 0;
        
        if (btnImport) {
            // Only enable import if at least one selected row is "Ready"
            let anyReady = false;
            checkboxes.forEach(cb => {
                const idx = parseInt(cb.value);
                const tx = this.currentBankTransactions[idx];
                if (tx && tx.isReady && !tx.converted) anyReady = true;
            });
            btnImport.disabled = !anyReady;
        }
    },

    convertBankTx(index) {
        const tx = this.currentBankTransactions[index];
        if (!tx) return;

        // Hide statement modal momentarily (or keep open behind)
        // bootstrap.Modal.getInstance(document.getElementById('bankStatementModal')).hide();

        // Open generic Voucher Create Modal pre-filled
        this.showCreateModal(tx.type === 'debit' ? 'payment' : 'receipt');

        // Use timeout to allow modal to render
        setTimeout(() => {
            const form = document.getElementById('createVoucherForm');
            if (form) {
                // Pre-fill Amount
                const amtField = form.querySelector('#finalAmount'); // Use the hidden field for final amount
                if (amtField) amtField.value = tx.amount;
                const visibleAmtField = form.querySelector('[name="amount"]');
                if (visibleAmtField) visibleAmtField.value = tx.amount;

                // Pre-fill Date
                const dateField = form.querySelector('[name="date"]');
                if (dateField && tx.date) {
                    dateField.value = tx.date.toISOString().split('T')[0];
                }

                // Restore persistent fields if already mapped in session
                if (tx.mappedVoucher) {
                    const mv = tx.mappedVoucher;
                    if (mv.tdsAmount) {
                        const tdsField = form.querySelector('[name="tdsAmount"]');
                        if (tdsField) tdsField.value = mv.tdsAmount;
                    }
                    if (mv.discountAmount) {
                        const discField = form.querySelector('[name="discountAmount"]');
                        if (discField) discField.value = mv.discountAmount;
                    }
                    if (mv.remarks) {
                        const remarksField = form.querySelector('[name="remarks"]');
                        if (remarksField) remarksField.value = mv.remarks;
                    }
                    if (mv.paymentMode) {
                        const modeField = form.querySelector('[name="paymentMode"]');
                        if (modeField) {
                            modeField.value = mv.paymentMode;
                            VouchersUI.onPaymentModeChange(modeField);
                        }
                    }
                    if (mv.referenceId) {
                        const refField = form.querySelector('[name="refNo"]');
                        if (refField) refField.value = mv.referenceId;
                    }
                } else {
                    // Pre-fill Remarks (only if new)
                    const remarksField = form.querySelector('[name="remarks"]');
                    if (remarksField) remarksField.value = `Bank Import: ${tx.description}`;
                }

                // NEW: Populate Hidden Bank Desc for Learning
                const bankDescField = form.querySelector('#bankDescription');
                if (bankDescField) bankDescField.value = tx.description;

                // NEW: Track Index for 'Imported' Status
                const indexField = form.querySelector('#bankTxIndex');
                if (indexField) indexField.value = index;

                // NEW: Try to Auto-Resolve Party OR restore existing assignment
                if (tx) {
                    const mv = tx.mappedVoucher;
                    const resolvedName = mv ? mv.customerName : VoucherManager.resolveBankParty(tx.description);
                    const resolvedId   = mv ? mv.customerId   : '';

                    if (resolvedName) {
                        // Use the new selectParty to show badge and load invoices
                        setTimeout(() => {
                            VouchersUI.selectParty(resolvedName, resolvedId);
                        }, 350); // Give extra time after the first timeout renders form
                    }
                }
                // Set Payment Mode and Detect Cheque
                const modeField = form.querySelector('[name="paymentMode"]');
                const refField = form.querySelector('[name="refNo"]');

                let mode = 'bank'; // Default to Bank (Transfer)
                let refNo = '';

                // Cheque Detection
                const descUpper = tx.description.toUpperCase();
                if (descUpper.includes('CHQ') || descUpper.includes('CHEQUE') || descUpper.includes('CLG')) {
                    mode = 'cheque';
                    // Extract number: Look for 6 digit number typical of cheques
                    const chqMatch = tx.description.match(/\b\d{6}\b/);
                    if (chqMatch) {
                        refNo = chqMatch[0];
                    } else {
                        // Fallback: finding any number block > 3 digits
                        const anyNum = tx.description.match(/\d{4,}/);
                        if (anyNum) refNo = anyNum[0];
                    }
                }

                if (modeField) {
                    modeField.value = mode;
                    // Trigger UI update to show reference field
                    VouchersUI.onPaymentModeChange(modeField);
                }

                if (refField && refNo) {
                    refField.value = refNo;
                }
            }
        }, 300);
    },

    /**
     * Assign a party name to a bank transaction description without creating a voucher.
     * Saves the mapping to gtes_bank_alias for future auto-matching.
     */
    assignBankParty(index) {
        const tx = this.currentBankTransactions?.[index];
        if (!tx) return;

        // Remove any existing assign modal
        const oldModal = document.getElementById('assignPartyModal');
        if (oldModal) { bootstrap.Modal.getInstance(oldModal)?.dispose(); oldModal.remove(); }

        const amtColor = tx.type === 'debit' ? '#ff6b6b' : '#51cf66';
        const amtSign  = tx.type === 'debit' ? '-' : '+';

        const modalHtml = `
        <div class="modal fade" id="assignPartyModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered" style="max-width:520px;">
                <div class="modal-content border-0 shadow-lg" style="background:#1a1d23;">
                    <div class="modal-header border-0 pb-0 px-4 pt-4">
                        <h5 class="modal-title text-white fw-bold">
                            <i class="bi bi-person-plus me-2 text-info"></i>Assign Party
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body px-4 pt-3 pb-4">
                        <!-- Transaction info card -->
                        <div class="rounded-3 p-3 mb-4" style="background:#0d1117; border:1px solid #30363d;">
                            <div class="small mb-1" style="text-transform:uppercase;letter-spacing:.05em;font-size:.7rem;color:#94a3b8;">Transaction Description</div>
                            <div class="text-white mb-2" style="font-size:.85rem;word-break:break-all;">${tx.description}</div>
                            <div class="d-flex gap-3 small">
                                <span><span style="color:#94a3b8;">Amount:</span> <strong style="color:${amtColor};">${amtSign}₹${tx.amount.toFixed(2)}</strong></span>
                                <span style="color:#30363d;">|</span>
                                <span><span style="color:#94a3b8;">Date:</span> <strong class="text-white">${new Date(tx.date).toLocaleDateString('en-IN')}</strong></span>
                            </div>
                        </div>

                        <!-- Party search -->
                        <div class="mb-1 small fw-bold text-white">Select or type Party Name</div>
                        <div class="position-relative mb-2">
                            <input type="text" id="assignPartySearchInput"
                                class="form-control fw-bold"
                                style="background:#0d1117;border:1px solid #58a6ff;color:#e6edf3;font-size:.95rem;"
                                placeholder="Search party..." autocomplete="off">
                            <div id="assignPartyDropdown"
                                class="list-group position-absolute w-100 shadow-lg d-none"
                                style="z-index:2000;max-height:220px;overflow-y:auto;background:#161b22;border:1px solid #30363d;border-radius:8px;top:calc(100% + 4px);">
                            </div>
                        </div>
                        <div class="small" style="color:#8b949e;">
                            <i class="bi bi-info-circle me-1"></i>Saves the mapping for future auto-matching. <strong class="text-white">No voucher will be created.</strong>
                        </div>
                    </div>
                    <div class="modal-footer border-0 px-4 pb-4 pt-0 d-flex justify-content-between">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" id="assignPartySaveBtn" class="btn btn-info text-dark fw-bold" onclick="VouchersUI.confirmAssignParty(${index})">
                            <i class="bi bi-check2 me-1"></i>Save Mapping
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('assignPartyModal');
        modalEl.addEventListener('hidden.bs.modal', () => {
            this.cleanupBackdrops();
            modalEl.remove();
        });
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Setup custom live-search dropdown with keyboard navigation
        modalEl.addEventListener('shown.bs.modal', () => {
            const searchInput   = document.getElementById('assignPartySearchInput');
            const dropdown      = document.getElementById('assignPartyDropdown');
            if (!searchInput || !dropdown) return;

            let customers = typeof CustomerManager !== 'undefined'
                ? CustomerManager.getAllCustomers()
                : (DataManager.getData('customers') || []);

            let activeIdx = -1;

            const renderDropdown = (query) => {
                const q = (query || '').toLowerCase().trim();
                activeIdx = -1;
                let matches = q
                    ? customers.filter(c =>
                        (c.name || '').toLowerCase().includes(q) ||
                        String(c.phone || '').includes(q))
                    : customers;
                matches = matches.slice(0, 60);

                if (!matches.length) {
                    dropdown.innerHTML = '<div class="px-3 py-2 small" style="color:#8b949e;">No matching parties found</div>';
                    dropdown.classList.remove('d-none');
                    return;
                }

                dropdown.innerHTML = matches.map((c, i) => `
                    <button type="button"
                        class="list-group-item list-group-item-action border-0 d-flex justify-content-between align-items-center assignPartyItem"
                        style="background:#161b22;color:#e6edf3;font-size:.88rem;padding:8px 12px;"
                        data-name="${c.name.replace(/"/g,'&quot;')}"
                        data-idx="${i}"
                        onmouseenter="this.style.background='#1f2937'"
                        onmouseleave="this.style.background=this.classList.contains('active-item')?'#0d47a1':'#161b22'"
                        onclick="VouchersUI._assignPartyPick('${c.name.replace(/'/g,"\\'")}')">
                        <span class="fw-bold text-info">${c.name}</span>
                        <small style="color:#8b949e;">${c.phone || ''}</small>
                    </button>`).join('');
                dropdown.classList.remove('d-none');
            };

            let dropdownTimeout = null;
            searchInput.addEventListener('input', (e) => {
                if (dropdownTimeout) clearTimeout(dropdownTimeout);
                dropdownTimeout = setTimeout(() => {
                    renderDropdown(e.target.value);
                }, 150);
            });
            searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));

            // Keyboard navigation
            searchInput.addEventListener('keydown', (e) => {
                const items = dropdown.querySelectorAll('.assignPartyItem');
                if (!items.length) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    activeIdx = Math.min(activeIdx + 1, items.length - 1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    activeIdx = Math.max(activeIdx - 1, 0);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].click();
                    else if (searchInput.value.trim()) document.getElementById('assignPartySaveBtn')?.click();
                    return;
                } else if (e.key === 'Escape') {
                    dropdown.classList.add('d-none');
                    return;
                } else { return; }

                items.forEach((el, i) => {
                    const active = i === activeIdx;
                    el.classList.toggle('active-item', active);
                    el.style.background = active ? '#0d47a1' : '#161b22';
                    el.style.color = active ? '#fff' : '#e6edf3';
                });
                if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
            });

            // Close dropdown on outside click
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.add('d-none');
                }
            }, { once: false });

            searchInput.focus();
        });
    },

    // Called when user picks a party from the dropdown list
    _assignPartyPick(name) {
        const searchInput = document.getElementById('assignPartySearchInput');
        const dropdown    = document.getElementById('assignPartyDropdown');
        if (searchInput) searchInput.value = name;
        if (dropdown) dropdown.classList.add('d-none');
    },

    async confirmAssignParty(index) {
        const partyName = document.getElementById('assignPartySearchInput')?.value?.trim();
        if (!partyName) {
            App.showNotification('Please select or type a party name.', 'warning');
            return;
        }

        const tx = this.currentBankTransactions?.[index];
        if (!tx) return;

        await VoucherManager.saveBankMapping(tx.description, partyName);
        tx.assignedParty = partyName;

        const modalEl = document.getElementById('assignPartyModal');
        bootstrap.Modal.getInstance(modalEl)?.hide();

        App.showNotification(`"${partyName}" assigned. Future imports will auto-match this description.`, 'success');
        this.showStatementProcessingModal(this.currentBankTransactions);
    },

    // --- Bulk Selection and Deletion Methods ---

    toggleAllBankRows(headerCheckbox) {
        const isChecked = headerCheckbox.checked;
        const rows = document.querySelectorAll('#bankStatementModal tbody tr');
        rows.forEach(row => {
            // Only toggle checkboxes that are VISIBLE (not filtered out)
            if (row.style.display !== 'none') {
                const cb = row.querySelector('.bs-row-checkbox');
                if (cb) cb.checked = isChecked;
            }
        });
        this.updateBankSelectionStatus();
    },

    updateBankSelectionStatus() {
        const allCheckboxes = Array.from(document.querySelectorAll('.bs-row-checkbox'));
        // Filter to only those in VISIBLE rows
        const visibleCheckboxes = allCheckboxes.filter(cb => {
            const row = cb.closest('tr');
            return row && row.style.display !== 'none';
        });

        const checkedVisibleCount = visibleCheckboxes.filter(cb => cb.checked).length;
        const totalVisible = visibleCheckboxes.length;
        
        const selectAllCb = document.getElementById('bsSelectAll');
        if (selectAllCb) {
            selectAllCb.checked = totalVisible > 0 && checkedVisibleCount === totalVisible;
            selectAllCb.indeterminate = checkedVisibleCount > 0 && checkedVisibleCount < totalVisible;
        }

        // Count ALL checked for the delete button (even hidden ones, or we can restrict to visible)
        // User said "delete the selected transaction", usually implies visible ones if following the filter focus.
        const totalCheckedAnywhere = allCheckboxes.filter(cb => cb.checked).length;

        const deleteBtn = document.getElementById('btnDeleteSelectedBankTx');
        if (deleteBtn) {
            deleteBtn.disabled = totalCheckedAnywhere === 0;
            deleteBtn.innerHTML = `<i class="bi bi-trash"></i> Delete Selected (${totalCheckedAnywhere})`;
        }

        // --- NEW: Enable Import Saved button only if READY transactions are selected ---
        const importBtn = document.getElementById('btnImportSelectedBankTx');
        if (importBtn) {
            const readyCheckedCount = allCheckboxes.filter(cb => {
                if (!cb.checked) return false;
                const tx = this.currentBankTransactions[parseInt(cb.value)];
                return tx && tx.isReady && !tx.converted;
            }).length;

            importBtn.disabled = readyCheckedCount === 0;
            importBtn.innerHTML = `<i class="bi bi-cloud-arrow-down-fill me-1"></i> Import Saved ${readyCheckedCount > 0 ? `(${readyCheckedCount})` : ''}`;
        }
    },

    deleteBankRow(index) {
        if (!confirm('Are you sure you want to delete this transaction from the import list?')) return;
        
        this.currentBankTransactions.splice(index, 1);
        this.showStatementProcessingModal(this.currentBankTransactions);
        App.showNotification('Transaction removed.', 'info');
    },

    deleteSelectedBankRows() {
        const checkboxes = document.querySelectorAll('.bs-row-checkbox:checked');
        if (checkboxes.length === 0) return;

        if (!confirm(`Are you sure you want to delete ${checkboxes.length} selected transactions?`)) return;

        // Get indices to delete, sort descending to splice correctly
        const indices = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => b - a);
        
        indices.forEach(idx => {
            this.currentBankTransactions.splice(idx, 1);
        });

        this.showStatementProcessingModal(this.currentBankTransactions);
        App.showNotification(`${indices.length} transactions removed.`, 'info');
    },

    // --- Assign to Existing Voucher Logic ---

    showAssignToVoucherModal(index) {
        const tx = this.currentBankTransactions[index];
        if (!tx) return;

        const resolvedParty = VoucherManager.resolveBankParty(tx.description) || '';
        
        // Fetch all potential documents
        let allVouchers = (VoucherManager.getAllVouchers() || []).map(v => ({
            ...v,
            voucherId: v.voucherId || v.id || 'N/A' // Standarize ID field
        }));
        
        const purchases = DataManager.getData('purchases') || [];
        
        // Combine with purchases if it's a debit (payment)
        if (tx.type === 'debit') {
            const transformedPurchases = purchases.map(p => ({
                voucherId: p.id || p.invoiceNo || p.billNo || 'EXP-N/A',
                date: p.date,
                customerName: p.vendor || p.customerName || p.partyName || 'Unknown Party',
                amount: parseFloat(p.amount || p.total || 0),
                type: 'purchase'
            }));
            allVouchers = [...allVouchers, ...transformedPurchases];
        }

        // NEW: Calculate remaining balance by accounting for other pending transactions in this session
        // Filter out the CURRENT transaction so we don't subtract its own amount if we are re-editing
        const otherPendingTx = (this.currentBankTransactions || []).filter((_, i) => i !== index);
        const sessionAllocationsMap = VoucherManager.getVoucherAllocationsMap(otherPendingTx);
        allVouchers = allVouchers.map(v => {
            const balance = VoucherManager.getDocumentBalance(v.voucherId, v.amount, sessionAllocationsMap);
            return { ...v, amount: balance, originalAmount: v.amount };
        }).filter(v => v.amount > 0.05); // Only show items with actual remaining balance

        const oldModal = document.getElementById('assignToVoucherModal');
        if (oldModal) { bootstrap.Modal.getInstance(oldModal)?.dispose(); oldModal.remove(); }

        const modalHtml = `
        <div class="modal fade" id="assignToVoucherModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content border-0 shadow-lg bg-dark text-white">
                    <div class="modal-header border-secondary p-4">
                        <h5 class="modal-title fw-bold">
                            <i class="bi bi-link-45deg me-2 text-primary"></i>Link to Existing ${tx.type === 'debit' ? 'Purchase/Payment' : 'Receipt'}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4">
                        <div class="bg-black bg-opacity-25 rounded p-3 mb-4 border border-secondary shadow-sm">
                            <div class="row g-2 small text-muted text-uppercase mb-2">
                                <div class="col-6">Bank Transaction</div>
                                <div class="col-3 text-end">Amount</div>
                                <div class="col-3 text-end">Date</div>
                            </div>
                            <div class="row g-2 align-items-center fw-bold">
                                <div class="col-6 text-truncate" title="${tx.description}">${tx.description}</div>
                                <div class="col-3 text-end text-${tx.type === 'debit' ? 'danger' : 'success'}" id="linkBankAmount">₹${tx.amount.toFixed(2)}</div>
                                <div class="col-3 text-end">${new Date(tx.date).toLocaleDateString()}</div>
                            </div>
                        </div>

                        <!-- Adjustment Section (initially hidden) -->
                        <div id="linkAdjustmentContainer" class="mb-4 p-3 bg-secondary bg-opacity-25 rounded border border-info d-none">
                            <h6 class="text-info mb-2 small fw-bold text-uppercase">Amount Difference Detected</h6>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span class="small">Difference to account for:</span>
                                <span class="fw-bold text-warning" id="linkDiffAmount">₹0.00</span>
                            </div>
                            <div class="row g-3 align-items-end">
                                <div class="col-md-5">
                                    <label class="form-label small text-muted">Identify Difference As:</label>
                                    <select id="linkDiffType" class="form-select form-select-sm bg-dark text-white border-secondary">
                                        <option value="discount">Discount Given/Received</option>
                                        <option value="tds">Tax (TDS) Deducted</option>
                                        <option value="other">Other/Ignore</option>
                                    </select>
                                </div>
                                <div class="col-md-7">
                                    <button class="btn btn-sm btn-info w-100" id="btnConfirmWithAdjustment">
                                        <i class="bi bi-check-circle me-1"></i> Apply Adjustment & Link
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label small text-muted">Select an existing voucher to link:</label>
                            <div class="input-group">
                                <span class="input-group-text bg-secondary border-secondary text-white"><i class="bi bi-search"></i></span>
                                <input type="text" id="voucherLinkSearch" class="form-control bg-dark border-secondary text-white" placeholder="Search by Voucher No, Party Name or Amount..." value="${resolvedParty}">
                            </div>
                        </div>

                        <div class="table-responsive" style="max-height: 250px;">
                            <table class="table table-dark table-hover table-sm border-secondary mb-0">
                                <thead class="sticky-top bg-dark">
                                    <tr class="small text-muted">
                                        <th>No</th>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Party</th>
                                        <th class="text-end">Amount</th>
                                    </tr>
                                </thead>
                                <tbody id="voucherLinkResults">
                                    <!-- Search results here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer border-secondary p-3">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('assignToVoucherModal');
        const modal = new bootstrap.Modal(modalEl);
        
        const searchInput = document.getElementById('voucherLinkSearch');
        const resultsTable = document.getElementById('voucherLinkResults');
        const adjContainer = document.getElementById('linkAdjustmentContainer');
        const diffText = document.getElementById('linkDiffAmount');
        const btnAdjust = document.getElementById('btnConfirmWithAdjustment');

        let selectedVoucher = null;

        const renderResults = (query) => {
            const q = (query || '').toLowerCase();
            const matches = allVouchers.filter(v => {
                // Filter by type matching bank transaction direction
                const typeMatches = tx.type === 'debit' ? 
                    (v.type === 'payment' || v.type === 'purchase' || v.isPurchase) : 
                    (v.type === 'receipt');
                
                if (!typeMatches) return false;

                const vId = String(v.voucherId || '').toLowerCase();
                const vName = String(v.customerName || '').toLowerCase();
                const vAmt = String(v.amount || '').toLowerCase();

                return vId.includes(q) || vName.includes(q) || vAmt.includes(q);
            }).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

            if (matches.length === 0) {
                resultsTable.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted small">No matching vouchers found for this type.</td></tr>';
                return;
            }

            resultsTable.innerHTML = matches.map(v => `
                <tr style="cursor: pointer" class="link-row" data-vid="${v.voucherId}" data-amt="${v.amount}">
                    <td class="small opacity-75">${v.voucherId}</td>
                    <td class="small">${new Date(v.date).toLocaleDateString()}</td>
                    <td class="small"><span class="badge bg-outline-secondary border border-secondary text-uppercase" style="font-size:0.6rem;">${v.type || 'VCH'}</span></td>
                    <td class="small text-truncate" style="max-width:150px;">${v.customerName}</td>
                    <td class="text-end fw-bold">₹${v.amount.toFixed(2)}</td>
                </tr>
            `).join('');

            // Add click handlers for selection behavior
            resultsTable.querySelectorAll('.link-row').forEach(row => {
                row.onclick = () => {
                    resultsTable.querySelectorAll('.link-row').forEach(r => r.classList.remove('table-primary'));
                    row.classList.add('table-primary');
                    
                    const vAmt = parseFloat(row.dataset.amt);
                    const vId = row.dataset.vid;
                    selectedVoucher = matches.find(m => m.voucherId === vId);

                    const diff = vAmt - tx.amount;
                    if (Math.abs(diff) > 0.05) {
                        adjContainer.classList.remove('d-none');
                        diffText.textContent = `₹${diff.toFixed(2)} (${diff > 0 ? 'Less received' : 'Over received'})`;
                        adjContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    } else {
                        adjContainer.classList.add('d-none');
                        // If tiny difference, just confirm immediately
                        VouchersUI.confirmAssignToVoucher(index, vId);
                    }
                };
            });
        };

        btnAdjust.onclick = () => {
            if (!selectedVoucher) return;
            const diffType = document.getElementById('linkDiffType').value;
            const diffAmt = selectedVoucher.amount - tx.amount;
            
            VouchersUI.confirmAssignToVoucher(index, selectedVoucher.voucherId, {
                type: diffType,
                amount: diffAmt
            });
        };

        searchInput.addEventListener('input', (e) => {
            if (this._linkSearchTimeout) clearTimeout(this._linkSearchTimeout);
            this._linkSearchTimeout = setTimeout(() => renderResults(e.target.value), 200);
        });
        renderResults(searchInput.value); // Initial load with pre-filled party

        modal.show();
        modalEl.addEventListener('hidden.bs.modal', () => {
            this.cleanupBackdrops();
            modalEl.remove();
        });
    },

    async confirmAssignToVoucher(txIndex, voucherId, adjustment = null) {
        const tx = this.currentBankTransactions[txIndex];
        if (!tx) return;

        if (adjustment) {
            const reason = adjustment.type === 'tds' ? 'Tax (TDS)' : (adjustment.type === 'discount' ? 'Discount' : 'Adjustment');
            if (!confirm(`Linking to ${voucherId} with ${reason} of ₹${adjustment.amount.toFixed(2)}. Correct?`)) return;
            
            try {
                await VoucherManager.updateVoucherAdjustment(voucherId, {
                    tdsAmount: adjustment.type === 'tds' ? adjustment.amount : 0,
                    discountAmount: adjustment.type === 'discount' ? adjustment.amount : 0,
                    remarks: `Linked to bank transaction on ${new Date(tx.date).toLocaleDateString()} (${tx.description})`
                });
            } catch (e) {
                console.error(e);
                App.showNotification('Error updating voucher adjustments.', 'danger');
            }
        } else {
            if (!confirm(`Are you sure you want to link this transaction to Voucher ${voucherId}?`)) return;
        }

        tx.converted = true;
        tx.linkedVoucherId = voucherId;
        
        // Close modal
        const modalEl = document.getElementById('assignToVoucherModal');
        bootstrap.Modal.getInstance(modalEl)?.hide();

        App.showNotification(`Transaction linked to Voucher ${voucherId}.`, 'success');
        this.showStatementProcessingModal(this.currentBankTransactions);
    },

    toggleReferenceFields(type) {
        // Delegate to onTypeChange if passing element, or handle value directly
        const select = document.getElementById('voucherType');
        if (select) this.onTypeChange(select);
    },

    onTypeChange(select) {
        const lbl = document.getElementById('lblParty');
        if (select.value === 'contra') {
            lbl.textContent = 'Deposit/Withdraw To';
            document.getElementById('invoiceSelectContainer').style.display = 'none';
        } else {
            lbl.textContent = 'Party Name';
            document.getElementById('invoiceSelectContainer').style.display = 'block';
        }
    },

    setupPartyDropdown() {
        const input = document.getElementById('voucherPartySearch');
        const dropdown = document.getElementById('voucherPartyDropdown');
        const modalEl = document.getElementById('createVoucherModal');
        if (!input || !dropdown) return;

        // Use AbortController to cleanly remove ALL listeners when modal closes
        const controller = new AbortController();
        const signal = controller.signal;

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        }, { signal });

        // Show/filter dropdown on typing
        input.addEventListener('input', (e) => {
            document.getElementById('voucherCustomerId').value = ''; // Reset ID when typing
            this.handlePartySearch(e.target.value);
            dropdown.classList.remove('d-none');
        }, { signal });

        // Show dropdown on focus
        input.addEventListener('focus', (e) => {
            this.handlePartySearch(e.target.value);
            dropdown.classList.remove('d-none');
        }, { signal });
        
        // Handle explicit clearing
        input.addEventListener('change', () => {
            if (input.value.trim() === '') {
                this.onPartySelect(input);
            }
        }, { signal });

        // Auto-cleanup when modal closes
        if (modalEl) {
            modalEl.addEventListener('hidden.bs.modal', () => {
                controller.abort();
            }, { once: true });
        }
    },

    handlePartySearch(query) {
        const dropdown = document.getElementById('voucherPartyDropdown');
        if (!dropdown) return;

        let customers = [];
        if (typeof CustomerManager !== 'undefined') {
            customers = CustomerManager.getAllCustomers();
        } else {
            customers = DataManager.getData('customers') || [];
        }

        const lowerQuery = query.toLowerCase();
        let matches = customers;

        if (query.trim() !== '') {
            matches = customers.filter(c => 
                (c.name && c.name.toLowerCase().includes(lowerQuery)) || 
                (c.phone && String(c.phone).toLowerCase().includes(lowerQuery))
            );
        }

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="list-group-item bg-dark text-muted border-secondary">No matching accounts found</div>';
            return;
        }

        // Render matches (top 50 max to prevent lag)
        dropdown.innerHTML = matches.slice(0, 50).map(c => `
            <button type="button" class="list-group-item list-group-item-action list-group-item-dark border-secondary d-flex justify-content-between align-items-center"
                    onclick="VouchersUI.selectParty('${c.name.replace(/'/g, "\\'")}', '${c.id}')">
                <span class="fw-bold text-info">${c.name}</span>
                <small class="text-secondary">${c.phone || ''}</small>
            </button>
        `).join('');
    },

    selectParty(name, id) {
        const input = document.getElementById('voucherPartySearch');
        const hiddenId = document.getElementById('voucherCustomerId');
        const dropdown = document.getElementById('voucherPartyDropdown');

        if (input) input.value = name;
        if (hiddenId) hiddenId.value = id;
        if (dropdown) dropdown.classList.add('d-none');

        // Look up customer info (done once at top to avoid reference errors)
        let customers = [];
        if (typeof CustomerManager !== 'undefined') {
            customers = CustomerManager.getAllCustomers();
        } else {
            customers = DataManager.getData('customers') || [];
        }
        const found = customers.find(c => c.id === id);
        const phone = found ? String(found.phone || '') : '';

        // Populate hidden customer address field
        const hiddenAddr = document.getElementById('voucherCustomerAddress');
        if (hiddenAddr) hiddenAddr.value = found?.address || '';

        // Hide search input and show styled badge
        const wrapper = input ? input.closest('.position-relative') : null;
        if (wrapper) {
            // Remove any existing badge
            const existing = document.getElementById('voucherPartyBadge');
            if (existing) existing.remove();

            input.style.display = 'none';

            const badge = document.createElement('div');
            badge.id = 'voucherPartyBadge';
            badge.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#0d47a1,#1565c0);border:1px solid #42a5f5;box-shadow:0 0 12px rgba(66,165,245,0.45);cursor:default;';
            badge.innerHTML = `
                <i class="bi bi-person-fill" style="color:#90caf9;font-size:1.2rem;"></i>
                <div style="flex:1;line-height:1.2;">
                    <div style="font-weight:700;color:#e3f2fd;font-size:1rem;">${name}</div>
                    ${phone ? `<div style="font-size:0.78rem;color:#90caf9;">${phone}</div>` : ''}
                </div>
                <button type="button" title="Change Party" style="background:none;border:none;color:#90caf9;font-size:1.1rem;cursor:pointer;padding:0 4px;" onclick="VouchersUI.clearPartySelection()">
                    <i class="bi bi-x-circle-fill"></i>
                </button>
            `;
            wrapper.insertBefore(badge, wrapper.firstChild);
        }

        // Trigger loading of invoices immediately
        this.onPartySelect(input);
    },

    clearPartySelection() {
        const input = document.getElementById('voucherPartySearch');
        const hiddenId = document.getElementById('voucherCustomerId');
        const badge = document.getElementById('voucherPartyBadge');
        const container = document.getElementById('invoiceLinkingSection');

        if (badge) badge.remove();
        if (input) {
            input.style.display = '';
            input.value = '';
            input.focus();
        }
        if (hiddenId) hiddenId.value = '';
        if (container) container.classList.add('d-none');
        this._editingVoucher = null;
    },

    onPartySelect(input) {
        const name = (input && input.value ? input.value : '').trim();
        const customers = DataManager.getData('customers') || [];
        const customer = customers.find(c => (c.name || '').trim().toLowerCase() === name.toLowerCase());

        const container = document.getElementById('invoiceLinkingSection');
        const tbody = document.getElementById('pendingInvoicesBody');
        const voucherType = document.getElementById('voucherType').value;
        tbody.innerHTML = '';

        // NEW: Filter out the CURRENT transaction so we don't subtract its own amount if already mapped
        const indexField = document.getElementById('bankTxIndex');
        const currentIndex = (indexField && indexField.value !== '') ? parseInt(indexField.value, 10) : -1;
        const otherPendingTx = (VouchersUI.currentBankTransactions || []).filter((_, i) => i !== currentIndex);

        if (!name) {
            if (container) container.classList.add('d-none');
            return;
        }
        if (!container || !tbody) return;

        let pendingDocs = [];
        const isPayment = voucherType === 'payment';

        if (isPayment) {
            // Load Pending Purchase Bills (EXPENSES key is 'purchases'; legacy 'gtes_expenses')
            const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || DataManager.getData('gtes_expenses') || [];
            const purchases = DataManager.getData('purchases') || [];
            
            // Deduplicate by ID to prevent same bill appearing twice
            // Use same priority as line 1554 for the key to ensure consistency
            const uniqueDocsMap = new Map();
            [...expenses, ...purchases].forEach(doc => {
                const key = (doc.invoiceNo || doc.billNo || doc.vch_no || doc.id || '').toString();
                if (key && !uniqueDocsMap.has(key)) {
                    uniqueDocsMap.set(key, doc);
                }
            });
            
            const nameLc = name.toLowerCase();
            pendingDocs = Array.from(uniqueDocsMap.values()).filter(doc => {
                if (this._isDebitNotePurchase(doc)) return false;
                const party = (doc.vendor || doc.customerName || doc.partyName || doc.supplier || '').toString().trim().toLowerCase();
                const partyMatch = party === nameLc;
                const st = (doc.status || '').toLowerCase();
                return partyMatch && st !== 'paid' && st !== 'cancelled';
            });

        } else {
            // Load Pending Sales Invoices (match customer by id or name, case-insensitive)
            const allInvoices = DataManager.getData('invoices') || [];
            const nameLc = name.toLowerCase();
            pendingDocs = allInvoices.filter(inv => {
                if (this._isCreditNoteInvoice(inv)) return false;
                const invName = (inv.customerName || '').toString().trim().toLowerCase();
                const nameMatch = (customer && inv.customerId && inv.customerId === customer.id) ||
                    (invName && invName === nameLc);
                const st = (inv.status || 'pending').toLowerCase();
                const statusMatch = st !== 'cancelled' && st !== 'paid';

                const invType = (inv.type || '').toLowerCase();
                let modeMatch = true;
                if (this.currentMode === 'gst') {
                    modeMatch = !inv.type || invType === 'with-bill' || invType === 'gst-invoice' || invType === 'sales-gst';
                } else if (this.currentMode === 'non-gst') {
                    modeMatch = invType === 'without-bill' || invType === 'sales-non-gst' || invType === 'non-gst-invoice';
                }

                return nameMatch && statusMatch && modeMatch;
            });
        }

        // Sort by date
        pendingDocs.sort((a, b) => new Date(a.date) - new Date(b.date));

        // NEW: Identifying already mapped data to restore UI state
        let tx = null;
        if (currentIndex >= 0 && VouchersUI.currentBankTransactions) {
            tx = VouchersUI.currentBankTransactions[currentIndex];
        }
        const mv = tx ? tx.mappedVoucher : (this._editingVoucher || null);

        if (pendingDocs.length > 0) {
            container.classList.remove('d-none');
            // Update Header Label
            const lbl = container.querySelector('label');
            if (lbl) lbl.textContent = isPayment ? 'Select Pending Purchase Bills:' : 'Select Pending Invoices:';

            pendingDocs.forEach(doc => {
                const tr = document.createElement('tr');
                const docNo = doc.invoiceNo || doc.billNo || doc.vch_no || doc.id;
                const totalAmountNum = parseFloat(doc.total || doc.amount || doc.vch_amt || 0);
                const total = totalAmountNum.toFixed(2);
                
                const allocMap = VoucherManager.getVoucherAllocationsMap(otherPendingTx, isPayment ? 'payment' : 'receipt');
                const pendingNum = VoucherManager.getDocumentBalance(
                    doc.id,
                    totalAmountNum,
                    allocMap,
                    docNo,
                    doc,
                    { allowLooseFallback: false }
                );
                const pending = pendingNum.toFixed(2);
                
                // RESTORE: Check if this doc was already assigned in this session
                let isAssigned = false;
                let assignedAmt = 0;
                if (mv) {
                    if (mv.allocations) {
                        const a = mv.allocations.find(al => al.id === doc.id || al.no === docNo);
                        if (a) { isAssigned = true; assignedAmt = a.amount; }
                    } else if (mv.linkedInvoices && mv.linkedInvoices.includes(doc.id)) {
                        isAssigned = true;
                        // For legacy links with no detailed allocation, we might not know the exact amount easily
                        // but let's assume it was the whole transaction if it's the only one, or 0.
                        assignedAmt = mv.linkedInvoices.length === 1 ? mv.amount : 0;
                    }
                }

                // Skip if practically zero and NOT already assigned to this specific rows
                if (pendingNum <= 0.01 && !isAssigned) return;

                tr.innerHTML = `
                    <td class="text-center align-middle">
                        <input class="form-check-input invoice-check" type="checkbox" 
                               value="${doc.id}" 
                               data-amount="${pending}" 
                               data-no="${docNo}"
                               ${isAssigned ? 'checked' : ''}
                               onchange="VouchersUI.calculateTotal(this)">
                    </td>
                    <td>
                        <div class="fw-bold">${isPayment ? 'Purchase' : 'Sales'}</div>
                        <div class="small text-muted d-flex align-items-center">
                            Bill No: ${docNo}
                            <button type="button" class="btn btn-link btn-sm p-0 ms-2 text-info" 
                                    onclick="${isPayment ? `InvoicesUI.previewPurchase` : `InvoicesUI.previewInvoice`}('${doc.id}')" 
                                    title="View ${isPayment ? 'Bill' : 'Invoice'}">
                                <i class="bi bi-eye"></i>
                            </button>
                        </div>
                        <div class="small text-muted">Date: ${doc.date}</div>
                    </td>
                    <td class="text-end align-middle">${total}</td>
                    <td class="text-end align-middle text-warning">${pending}</td>
                    <td class="align-middle p-1">
                        <input type="number" class="form-control form-control-sm bg-dark text-white border-secondary text-end pay-input" 
                               value="${isAssigned ? assignedAmt : '0'}" min="0" max="${pending}" step="0.01" 
                               oninput="VouchersUI.calculateTotal()" ${isAssigned ? '' : 'disabled'}>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            container.classList.add('d-none');
        }

        // RESTORE: Advance Payment if already set in session / editing voucher
        if (mv && mv.amount !== undefined) {
            const advanceInput = document.getElementById('advanceAmount');
            if (advanceInput) {
                // Advance = total amount - sum of allocations
                const totalAlloc = (mv.allocations || []).reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
                const advance = Math.max(0, mv.amount - totalAlloc);
                advanceInput.value = advance.toFixed(2);
            }
        }

        // Recalculate totals after restoration
        setTimeout(() => this.calculateTotal(), 500);
    },

    calculateTotal(checkbox) {
        // Get the base transaction amount (the bank import / manually entered amount)
        const visibleAmountInput = document.querySelector('#createVoucherForm [name="amount"]');
        const bankAmount = parseFloat(visibleAmountInput ? visibleAmountInput.value : 0) || 0;

        // NEW: Calculate Total Settlement (Gross)
        const tds = parseFloat(document.getElementById('tdsAmount')?.value) || 0;
        const discount = parseFloat(document.getElementById('discountAmount')?.value) || 0;
        const totalSettlement = bankAmount + tds + discount;

        // If a checkbox was toggled
        if (checkbox) {
            const row = checkbox.closest('tr');
            const input = row.querySelector('.pay-input');
            input.disabled = !checkbox.checked;

            if (checkbox.checked) {
                // Calculate how much is already allocated in OTHER checked rows
                let alreadyAllocated = 0;
                document.querySelectorAll('.pay-input:not(:disabled)').forEach(pi => {
                    if (pi !== input) {
                        alreadyAllocated += parseFloat(pi.value) || 0;
                    }
                });
                // Add current advance allocation too
                const advance = parseFloat(document.getElementById('advanceAmount')?.value) || 0;
                alreadyAllocated += advance;

                const remaining = Math.max(0, totalSettlement - alreadyAllocated);
                const billAmount = parseFloat(checkbox.dataset.amount) || 0;

                // Fill min(billAmount, remaining) — partial payment if needed
                input.value = Math.min(billAmount, remaining).toFixed(2);
            } else {
                input.value = 0;
            }
        }

        // Now recalculate totals
        const inputs = document.querySelectorAll('.pay-input:not(:disabled)');
        let allocated = 0;
        const selectedIds = [];
        const invoiceNos = [];

        const allocations = [];

        inputs.forEach(input => {
            const val = parseFloat(input.value) || 0;
            allocated += val;
            if (val > 0) {
                const row = input.closest('tr');
                const cb = row.querySelector('.invoice-check');
                selectedIds.push(cb.value);
                const docNo = cb.dataset.no;
                invoiceNos.push(docNo);
                allocations.push({ id: cb.value, no: docNo, amount: val });
            }
        });

        // Add Advance amount
        const advance = parseFloat(document.getElementById('advanceAmount')?.value) || 0;

        // Proportionally distribute TDS and Discount across allocations
        const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
        if (allocations.length > 0 && totalAllocated > 0) {
            allocations.forEach(a => {
                const ratio = a.amount / totalAllocated;
                a.tdsAmount = parseFloat((tds * ratio).toFixed(2));
                a.discountAmount = parseFloat((discount * ratio).toFixed(2));
            });
        }

        // Store allocations in a hidden field for saveVoucher
        let allocField = document.getElementById('linkedAllocationsJSON');
        if (!allocField) {
            allocField = document.createElement('input');
            allocField.type = 'hidden';
            allocField.id = 'linkedAllocationsJSON';
            allocField.name = 'linkedAllocationsJSON';
            document.getElementById('createVoucherForm').appendChild(allocField);
        }
        allocField.value = JSON.stringify(allocations);

        allocated += advance;
 
        const balance = totalSettlement - allocated;

        // Update the running balance display
        const totalDisplay = document.getElementById('totalVoucherAmount');
        if (totalDisplay) totalDisplay.textContent = allocated.toFixed(2);

        // Show/update balance summary banner
        let banner = document.getElementById('voucherBalanceBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'voucherBalanceBanner';
            const section = document.getElementById('invoiceLinkingSection');
            if (section) section.appendChild(banner);
        }
        banner.className = balance < 0 
            ? 'alert alert-danger py-1 px-2 mt-2 mb-0 small d-flex justify-content-between'
            : balance === 0 
                ? 'alert alert-success py-1 px-2 mt-2 mb-0 small d-flex justify-content-between'
                : 'alert alert-info py-1 px-2 mt-2 mb-0 small d-flex justify-content-between';
        banner.innerHTML = `
            <span><i class="bi bi-wallet2 me-1"></i>Bank/Cash: <strong>₹${bankAmount.toFixed(2)}</strong></span>
            <span>Total Settlement: <strong>₹${totalSettlement.toFixed(2)}</strong> (TDS: ₹${tds.toFixed(2)}, Disc: ₹${discount.toFixed(2)})</span>
            <span ${balance < 0 ? 'class="text-danger fw-bold"' : balance === 0 ? 'class="text-success fw-bold"' : ''}>
                ${balance < 0 ? '⚠️ Over by' : 'Balance'}: <strong>₹${Math.abs(balance).toFixed(2)}</strong>
            </span>
        `;

        // Update hidden fields
        const finalAmt = document.getElementById('finalAmount');
        if (finalAmt) finalAmt.value = allocated.toFixed(2);

        document.getElementById('linkedInvoicesJSON').value = JSON.stringify(selectedIds);

        // Auto narration
        const remarksInput = document.querySelector('#createVoucherForm [name="remarks"]');
        if (remarksInput && (!remarksInput.value || remarksInput.value.startsWith('Payment for Inv:'))) {
            if (invoiceNos.length > 0) {
                remarksInput.value = `Payment for Inv: ${invoiceNos.join(', ')}`;
            } else if (advance > 0) {
                remarksInput.value = "Advance Payment";
            } else {
                remarksInput.value = "";
            }
        }
    },

    async saveVoucher() {
        // Prevent duplicate creation on double-click / repeated taps
        if (this._saveVoucherInProgress) return;
        this._saveVoucherInProgress = true;
        const saveBtn = document.querySelector('#createVoucherModal .btn-primary[onclick*="saveVoucher"]');
        if (saveBtn) saveBtn.disabled = true;

        const form = document.getElementById('createVoucherForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            this._saveVoucherInProgress = false;
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        const formData = new FormData(form);
        const name = formData.get('customerName');

        // Prefer hidden ID from party picker (exact); avoid wrong ID when names differ only by spacing/case
        const customers = DataManager.getData('customers') || [];
        const hiddenId = (formData.get('customerId') || '').toString().trim();
        const found = (hiddenId && customers.find(c => c.id === hiddenId))
            || customers.find(c => (c.name || '').trim() === (name || '').trim());
        const customerId = found ? found.id : null;
        const partyId = (found && found.partyId)
            || ((typeof CustomerManager !== 'undefined' && CustomerManager.resolvePartyId)
                ? CustomerManager.resolvePartyId({ customerId, customerName: name })
                : '');

        if (!(name || '').toString().trim()) {
            App.showNotification('Customer or vendor name is required.', 'error');
            this._saveVoucherInProgress = false;
            if (saveBtn) saveBtn.disabled = false;
            return;
        }
        if (!found || !customerId) {
            App.showNotification('Select a saved customer or vendor from the list (add them under Customers first).', 'error');
            this._saveVoucherInProgress = false;
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        const linkedJson = formData.get('linkedInvoicesJSON');
        const linkedInvoices = linkedJson ? JSON.parse(linkedJson) : [];
        const allocatedAmount = parseFloat(formData.get('amount')) || 0;

        // --- NEW: Strict Bank Transaction Allocation Check ---
        const txIndex = formData.get('bankTxIndex');
        if (txIndex !== null && txIndex !== '' && this.currentBankTransactions) {
            const tx = this.currentBankTransactions[txIndex];
            if (tx) {
                // Allow a small floating point tolerance (e.g., 0.01)
                if (Math.abs(allocatedAmount - tx.amount) > 0.02) {
                    App.showNotification(`Please allocate the exact bank transaction amount (₹${tx.amount.toFixed(2)}) using invoices or the Advance Payment field. Current allocation: ₹${allocatedAmount.toFixed(2)}`, 'warning');
                    this._saveVoucherInProgress = false;
                    if (saveBtn) saveBtn.disabled = false;
                    return; // Block saving
                }
            }
        }

        const allocJson = formData.get('linkedAllocationsJSON');
        const allocations = allocJson ? JSON.parse(allocJson) : [];

        const pm = String(formData.get('paymentMode') || 'cash').toLowerCase();
        const data = {
            id: formData.get('voucherId'),
            type: formData.get('type'),
            date: formData.get('date'),
            customerName: name,
            customerId: customerId,
            partyId: partyId || '',
            amount: allocatedAmount,
            paymentMode: formData.get('paymentMode'),
            /** Book Keeper style: bank vouchers post to Bank A/Cs; cash to Cash-in-hand */
            contraLedgerGroup: pm === 'bank' ? 'Bank A/Cs' : 'Cash-in-hand',
            referenceId: formData.get('refNo'),
            linkedInvoiceId: linkedInvoices.length > 0 ? linkedInvoices[0] : null, // Legacy support
            linkedInvoices: linkedInvoices, // New array support
            allocations: allocations, // Detailed allocations
            tdsAmount: parseFloat(formData.get('tdsAmount') || 0),
            discountAmount: parseFloat(formData.get('discountAmount') || 0),
            remarks: formData.get('remarks'),
            customerAddress: formData.get('customerAddress') || '',
            hasGst: this.currentMode === 'gst',
            isPurchase: this.currentMode === 'purchase'
        };

        try {
            // If it's a bank import mapping, we only SAVE it to the session, not the database yet
            if (txIndex !== null && txIndex !== '' && this.currentBankTransactions) {
                const idx = parseInt(txIndex);
                if (this.currentBankTransactions[idx]) {
                    this.currentBankTransactions[idx].isReady = true;
                    this.currentBankTransactions[idx].mappedVoucher = data; // Unify field naming
                    
                    // Record this serial locally to ensure immediate auto-increment correctness for the next row
                    if (typeof VoucherManager.recordUsedSerial === 'function') {
                        VoucherManager.recordUsedSerial(data.type, data.id);
                    }

                    // --- Learning Mapping ---
                    const bankDesc = formData.get('bankDescription');
                    if (bankDesc && name && (data.paymentMode === 'Bank' || data.paymentMode === 'bank' || data.paymentMode === 'cheque')) {
                        VoucherManager.saveBankMapping(bankDesc, name); // Async update but don't await to block UI
                    }

                    const modalEl = document.getElementById('createVoucherModal');
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modalEl) {
                        modalEl.addEventListener('hidden.bs.modal', () => {
                            this.showStatementProcessingModal(this.currentBankTransactions);
                        }, { once: true });
                        modal.hide();
                    }
                    App.showNotification(`Details for ${data.id} saved to session. Use "Import Saved" to finish.`, 'info');
                    this._saveVoucherInProgress = false;
                    if (saveBtn) saveBtn.disabled = false;
                    return; 
                }
            }

            const newVoucher = await VoucherManager.createVoucher(data);

            // Record this serial locally to ensure immediate auto-increment correctness for the next row
            if (typeof VoucherManager.recordUsedSerial === 'function') {
                VoucherManager.recordUsedSerial(data.type, data.id);
            }

            const modalEl = document.getElementById('createVoucherModal');
            const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;

            if (modalEl) {
                modalEl.addEventListener('hidden.bs.modal', () => {
                    this.cleanupBackdrops();
                    this.updateTable();
                }, { once: true });
                modal?.hide();
            } else {
                this.cleanupBackdrops();
                queueMicrotask(() => this.updateTable());
            }

            if (typeof App !== 'undefined') App.showNotification('Voucher saved successfully!', 'success');

            // Bank Mail link: do not block closing the modal (Electron IPC can be slow)
            void (async () => {
                try {
                    if (this._pendingBankMailLink && this._pendingBankMailLink.messageId
                        && window.electronAPI && window.electronAPI.gmail
                        && typeof window.electronAPI.gmail.queueUpdate === 'function') {
                        const msgId = this._pendingBankMailLink.messageId;
                        await window.electronAPI.gmail.queueUpdate({
                            name: 'bank',
                            messageId: String(msgId).trim(),
                            patch: { linkedVoucherId: newVoucher && newVoucher.id ? newVoucher.id : data.id, status: 'linked' }
                        });
                        try { sessionStorage.setItem('bankMail_nextFilter', 'voucher'); } catch {}
                        if (typeof App !== 'undefined' && App.showNotification) {
                            App.showNotification(`Voucher ${data.id} linked to bank email.`, 'success');
                        }
                    }
                } catch (linkErr) {
                    console.warn('[vouchers] Bank mail link failed:', linkErr && linkErr.message);
                } finally {
                    this._pendingBankMailLink = null;
                }
            })();

        } catch (e) {
            console.error(e);
            if (typeof App !== 'undefined') App.showNotification('Error creating voucher: ' + e.message, 'error');
            else alert('Error creating voucher: ' + e.message);
        } finally {
            this._saveVoucherInProgress = false;
            if (saveBtn) saveBtn.disabled = false;
        }
    },

    async importSelectedBankTransactions() {
        const checkboxes = document.querySelectorAll('.bs-row-checkbox:checked');
        const readyIndices = [];
        checkboxes.forEach(cb => {
            const idx = parseInt(cb.value);
            const tx = this.currentBankTransactions[idx];
            if (tx && tx.isReady && !tx.converted) {
                readyIndices.push(idx);
            }
        });

        if (readyIndices.length === 0) {
            App.showNotification('No transactions "Ready to Import" were selected. Please assign details to a transaction first.', 'warning');
            return;
        }

        if (!confirm(`Import ${readyIndices.length} saved transactions to Vouchers?`)) return;

        const importBtn = document.getElementById('btnImportSelectedBankTx');
        const originalHtml = importBtn.innerHTML;
        importBtn.disabled = true;
        importBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Importing...';

        let successCount = 0;
        let failCount = 0;
        let lastError = null;

        console.log(`Starting bulk import for ${readyIndices.length} transactions...`);

        for (const idx of readyIndices) {
            const tx = this.currentBankTransactions[idx];
            try {
                const voucherData = tx.mappedVoucher || tx.mappedData;
                if (!voucherData) throw new Error('No mapped detail data found for this transaction.');

                const newVoucher = await VoucherManager.createVoucher(voucherData);
                tx.converted = true;
                tx.voucherId = newVoucher.id;
                successCount++;
                console.log(`Success: Imported ${newVoucher.id}`);
            } catch (err) {
                console.error(`Import failed for index ${idx}:`, err);
                failCount++;
                lastError = err.message;
            }
        }

        importBtn.innerHTML = originalHtml;
        importBtn.disabled = false;

        if (successCount > 0) {
            App.showNotification(`Successfully imported ${successCount} vouchers.`, 'success');
        }
        
        if (failCount > 0) {
            App.showNotification(`Failed to import ${failCount} records. Error: ${lastError}`, 'danger');
        }
        
        // Refresh view
        this.updateTable();
        this.showStatementProcessingModal(this.currentBankTransactions);
    },

    async exportVouchersToExcel() {
        if (!this.currentBankTransactions) return;

        // Pull vouchers from both already converted AND ready-to-import rows
        const sessionVouchers = this.currentBankTransactions
            .filter(tx => (tx.converted && tx.voucherId) || (tx.isReady && (tx.mappedVoucher || tx.mappedData)))
            .map(tx => {
                const mv = tx.mappedVoucher || tx.mappedData;
                if (tx.converted && tx.voucherId) {
                    return VoucherManager.getVoucher(tx.voucherId);
                } else if (tx.isReady && mv) {
                    return mv;
                }
                return null;
            })
            .filter(v => v);

        if (sessionVouchers.length === 0) {
            App.showNotification('No vouchers exported yet in this session.', 'warning');
            return;
        }

        try {
            const dataForExport = sessionVouchers.map(v => {
                const isReceipt = v.type === 'receipt';
                const modeRaw = v.paymentMode ? v.paymentMode.trim() : 'Bank';
                
                let paymentModeCol = 'Bank';
                let refCol = v.referenceId || '';

                if (modeRaw.toLowerCase() === 'cash') {
                    paymentModeCol = 'Cash';
                } else {
                    paymentModeCol = 'Bank';
                    // If no specific reference ID, use the payment sub-mode (Rtgs, Upi, etc.) as the reference
                    if (!refCol && modeRaw.toLowerCase() !== 'bank') {
                        refCol = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1).toLowerCase();
                    }
                }

                const receivedInto = (paymentModeCol === 'Cash') ? 'Cash' : 'Bank';
                
                // Format Allocation: "INV1:200;INV2:150;"
                const setOff = v.allocations ? v.allocations.map(a => `${a.no}:${a.amount}`).join(';') + ';' : '';

                return {
                    'Voucher Date (YYYY-MM-DD)': v.date,
                    'Receipt Number': v.id,
                    'Received Into': receivedInto,
                    'Received From': v.customerName || '',
                    'Amount': (parseFloat(v.amount) + parseFloat(v.tdsAmount || 0) + parseFloat(v.discountAmount || 0)),
                    'Narration or Any Other Remarks': v.remarks || '',
                    'Set Off Voucher Number With Amount': setOff,
                    'Discount Account': v.discountAmount > 0 ? 'Discount on Sale' : '',
                    'Discount Amount': v.discountAmount > 0 ? v.discountAmount : '',
                    'Tax Deduction Account': v.tdsAmount > 0 ? 'Tax Deducted Receivable' : '',
                    'Tax Deduction Amount': v.tdsAmount > 0 ? v.tdsAmount : '',
                    'Payment Mode': paymentModeCol,
                    'Debit/Credit/Cheque/Transection/Reference Number': refCol,
                    'Bank Name': '',
                    'Remarks': ''
                };
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dataForExport);
            XLSX.utils.book_append_sheet(wb, ws, "Vouchers");
            XLSX.writeFile(wb, `Voucher_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

            App.showNotification('Vouchers exported successfully!', 'success');
        } catch (error) {
            console.error('Excel Export Error:', error);
            App.showNotification('Export failed: ' + error.message, 'error');
        }
    },

    async pushToBookKeeperBackup() {
        if (typeof ExportImportHelper !== 'undefined') {
            await ExportImportHelper.generateAllInOneXML();
        } else {
            App.showNotification('Export/Import module not loaded', 'error');
        }
    },

    async deleteVoucher(id) {
        if (!confirm('Are you sure you want to delete this voucher?')) return;

        // Before deleting, check which invoices this voucher was linked to
        const voucher = VoucherManager.getVoucher(id);
        const linkedInvoiceIds = [];
        if (voucher) {
            if (voucher.linkedInvoices && Array.isArray(voucher.linkedInvoices)) {
                voucher.linkedInvoices.forEach(link => {
                    const lid = typeof link === 'object' ? link.id : link;
                    if (lid) linkedInvoiceIds.push(lid);
                });
            } else if (voucher.linkedInvoiceId) {
                linkedInvoiceIds.push(voucher.linkedInvoiceId);
            }
        }

        await VoucherManager.deleteVoucher(id);

        // After deletion, recalculate the status of linked invoices
        if (linkedInvoiceIds.length > 0 && typeof InvoiceManager !== 'undefined') {
            const allVouchers = DataManager.getData('vouchers') || [];
            for (const invId of linkedInvoiceIds) {
                const invoice = InvoiceManager.getInvoice(invId);
                if (!invoice) continue;

                const totalPaid = allVouchers
                    .filter(v => v.linkedInvoices?.some(link => {
                        const lid = typeof link === 'object' ? link.id : link;
                        return lid === invId;
                    }) || v.linkedInvoiceId === invId)
                    .reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);

                let newStatus = 'pending';
                const invoiceTotal = parseFloat(invoice.total) || 0;
                if (totalPaid >= invoiceTotal && invoiceTotal > 0) {
                    newStatus = 'paid';
                } else if (totalPaid > 0) {
                    newStatus = 'partial';
                }

                await InvoiceManager.updateInvoice(invId, { status: newStatus });
            }
        }

        this.updateTable();
    },

    _buildLinkedDocIndexes(invoices, expenses) {
        const invById = new Map();
        const invByNo = new Map();
        const invByBkId = new Map();
        const expById = new Map();
        const expByBill = new Map();
        const expByBkId = new Map();
        const invSet = new Set(invoices);
        for (const i of invoices) {
            if (i.id != null && String(i.id).trim() !== '') invById.set(String(i.id).trim(), i);
            const no = (i.invoiceNo || '').toString().trim();
            if (no) invByNo.set(no, i);
            if (i.bookkeeperId) invByBkId.set(String(i.bookkeeperId).trim(), i);
            const bkv = (i.bookkeeperVchNo || '').toString().trim();
            if (bkv) invByBkId.set(bkv, i);
        }
        for (const e of expenses) {
            if (e.id != null && String(e.id).trim() !== '') expById.set(String(e.id).trim(), e);
            const bn = (e.billNo || '').toString().trim();
            if (bn) expByBill.set(bn, e);
            if (e.bookkeeperId) expByBkId.set(String(e.bookkeeperId).trim(), e);
            const bkv = (e.bookkeeperVchNo || '').toString().trim();
            if (bkv) expByBill.set(bkv, e);
        }
        return { invById, invByNo, invByBkId, expById, expByBill, expByBkId, invSet };
    },

    _resolveLinkedRowDoc(docIdStr, idx, invoices, expenses) {
        const s = (docIdStr != null ? docIdStr : '').toString().trim();
        if (!s) return { doc: null, isInvoiceDoc: true };
        let doc = idx.invById.get(s) || idx.expById.get(s);
        if (doc) return { doc, isInvoiceDoc: idx.invSet.has(doc) };
        doc = idx.invByNo.get(s) || idx.expByBill.get(s);
        if (doc) return { doc, isInvoiceDoc: idx.invSet.has(doc) };
        doc = idx.invByBkId.get(s) || idx.expByBkId.get(s);
        if (doc) return { doc, isInvoiceDoc: idx.invSet.has(doc) };
        if (/^\d+$/.test(s)) {
            const n = parseInt(s, 10);
            doc = idx.invByBkId.get(`BK-INV-${s}`) || idx.invByBkId.get(`BK-INV-${n}`)
                || idx.expByBkId.get(`BK-PUR-${s}`) || idx.expByBkId.get(`BK-PUR-${n}`)
                || idx.expByBkId.get(`BK-EXP-${n}`);
            if (doc) return { doc, isInvoiceDoc: idx.invSet.has(doc) };
        }
        const docLc = s.toLowerCase().trim();
        doc = invoices.find(i => (i.invoiceNo || '').toString().toLowerCase().trim() === docLc)
            || expenses.find(e => (e.billNo || '').toString().toLowerCase().trim() === docLc);
        if (doc) return { doc, isInvoiceDoc: idx.invSet.has(doc) };
        doc = expenses.find(e => (e.bookkeeperVchNo || '').toString().toLowerCase().trim() === docLc)
            || invoices.find(i => (i.bookkeeperVchNo || '').toString().toLowerCase().trim() === docLc);
        if (doc) return { doc, isInvoiceDoc: idx.invSet.has(doc) };
        return { doc: null, isInvoiceDoc: true };
    },

    async getVoucherElement(voucherId, options = {}) {
        const voucher = VoucherManager.getVoucher(voucherId);
        if (!voucher) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const esc = typeof InvoicesUI !== 'undefined' && InvoicesUI.escapePdfHtml
            ? (s) => InvoicesUI.escapePdfHtml(s)
            : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const company = {
            name: settings.companyName || DataManager.COMPANY_PROFILE?.name || 'My Company',
            address: settings.registeredAddress || DataManager.COMPANY_PROFILE?.registeredAddress || settings.address || '',
            workAddress: settings.workAddress || DataManager.COMPANY_PROFILE?.workAddress || '',
            gstin: settings.gstin || DataManager.COMPANY_PROFILE?.gstin || '',
            pan: settings.pan || DataManager.COMPANY_PROFILE?.pan || '',
            emails: settings.emails || DataManager.COMPANY_PROFILE?.emails,
            phones: settings.phones || DataManager.COMPANY_PROFILE?.phones,
            bank: settings.bankDetails || DataManager.COMPANY_PROFILE?.bankDetails
        };
        const emailLine = [company.emails].flat().filter(Boolean).join(', ') || '';
        const phoneLine = [company.phones].flat().filter(Boolean).join(', ') || '';
        const upiId = settings.upiId || '';
        const settlement = (typeof VoucherManager !== 'undefined' && VoucherManager.resolveSettlementDisplay)
            ? VoucherManager.resolveSettlementDisplay(voucher)
            : {
                bankAmount: parseFloat(voucher.amount) || 0,
                tdsAmount: parseFloat(voucher.tdsAmount) || 0,
                discountAmount: parseFloat(voucher.discountAmount) || 0,
                totalSettlement: (parseFloat(voucher.amount) || 0) + (parseFloat(voucher.tdsAmount) || 0) + (parseFloat(voucher.discountAmount) || 0)
            };
        const amt = settlement.bankAmount;
        const includeQr = !options.skipQr && upiId;
        const qrUrl = includeQr ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(company.name)}&am=${amt}&cu=INR`)}` : '';

        const pdfW = (typeof DeliveryUI !== 'undefined' && DeliveryUI.GTES_PDF_DOCUMENT_WIDTH_PX) || 760;
        const element = document.createElement('div');
        element.className = 'gtes-pdf-document';
        element.style.width = `${pdfW}px`;
        element.style.padding = '14px';
        element.style.background = 'white';
        element.style.color = '#000';
        element.style.fontFamily = 'Arial, Helvetica, "Liberation Sans", sans-serif';

        const typeLabels = {
            'receipt': 'Receipt Voucher',
            'payment': 'Payment Voucher',
            'contra': 'Contra Voucher',
            'purchase': 'Purchase Voucher'
        };
        const typeLabel = typeLabels[voucher.type] || 'Voucher';
        const partyLabel = voucher.type === 'receipt' ? 'Received From (Party)' : 'Paid To (Party)';
        const modeStr = [voucher.paymentMode || voucher.mode, voucher.referenceId ? `Ref: ${voucher.referenceId}` : ''].filter(Boolean).join(' · ');
        const tds = settlement.tdsAmount;
        const disc = settlement.discountAmount;
        const totalAdj = settlement.totalSettlement;
        const narr = (voucher.remarks || voucher.narration || '').trim();

        element.innerHTML = `
            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: collapse; margin: 0 0 16px 0; border-bottom: 2px solid #000;">
                <tr>
                    <td style="width: 62%; vertical-align: top; padding: 0 12px 12px 0;">
                        <h1 style="margin: 0; color: #000; font-size: 24px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase;">${esc(company.name)}</h1>
                        <div style="font-size: 10px; color: #222; margin-top: 6px; line-height: 1.45;">
                            ${esc(company.address)}<br>
                            ${company.workAddress ? `<strong>Work:</strong> ${esc(company.workAddress)}<br>` : ''}
                            ${emailLine ? `Email: ${esc(emailLine)}<br>` : ''}
                            ${phoneLine ? `Ph: ${esc(phoneLine)}<br>` : ''}
                            ${company.gstin ? `<strong>GSTIN:</strong> ${esc(company.gstin)}` : ''}${company.gstin && company.pan ? ' | ' : ''}${company.pan ? `<strong>PAN:</strong> ${esc(company.pan)}` : ''}
                        </div>
                    </td>
                    <td style="width: 38%; vertical-align: top; text-align: right; padding: 0 0 12px 0;">
                        <div style="font-size: 18px; font-weight: 800; color: #000; text-transform: uppercase; margin-bottom: 8px;">${esc(typeLabel)}</div>
                        <div style="font-size: 10px; color: #222; line-height: 1.5;">
                            <strong>Voucher No:</strong> ${esc(voucher.id)}<br>
                            <strong>Date:</strong> ${esc(voucher.date)}
                        </div>
                    </td>
                </tr>
            </table>

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px;">
                <tr>
                    <td style="width: 50%; vertical-align: top; padding: 0 7px 0 0;">
                        <div style="border: 1px solid #000; padding: 10px;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">${esc(partyLabel)}</div>
                            <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: #111;">${esc(voucher.customerName || 'Unknown Party')}</div>
                            ${voucher.billNo ? `<div style="font-size: 10px; color: #444;"><strong>Bill No:</strong> ${esc(voucher.billNo)}</div>` : ''}
                        </div>
                    </td>
                    <td style="width: 50%; vertical-align: top; padding: 0 0 0 7px;">
                        <div style="border: 1px solid #000; padding: 10px;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">Voucher Details</div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; width: 100px; color: #444;">Mode / Ref:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${esc(modeStr || '-')}</strong></td></tr>
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Type:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${esc(typeLabel)}</strong></td></tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px;">
                <tr>
                    <td style="width: 50%; vertical-align: top; padding: 0 8px 0 0; font-size: 11px;">
                        ${narr ? `
                        <div style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
                            <span style="text-transform: uppercase; font-size: 9px; font-weight: bold; color: #64748b;">Narration</span><br>
                            <span style="font-size: 10px; color: #111; white-space: pre-wrap;">${esc(narr)}</span>
                        </div>` : ''}
                        ${qrUrl ? `
                        <table style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa; border-collapse: collapse;"><tr>
                            <td style="padding: 8px; vertical-align: middle;"><img src="${qrUrl}" alt="UPI" style="width: 72px; height: 72px; display: block;" /></td>
                            <td style="padding: 8px 12px 8px 0; vertical-align: middle;">
                                <div style="font-size: 9px; font-weight: bold; text-transform: uppercase;">Pay via UPI</div>
                                <div style="font-size: 10px; font-weight: bold;">${esc(upiId)}</div>
                            </td>
                        </tr></table>` : ''}
                        <div style="font-size: 10px; line-height: 1.45;">
                            <strong>Bank:</strong> ${esc(company.bank?.bankName || '-')}
                            &nbsp;|&nbsp; <strong>A/c:</strong> ${esc(company.bank?.accountNo || '-')}
                            &nbsp;|&nbsp; <strong>IFSC:</strong> ${esc(company.bank?.ifsc || '-')}
                        </div>
                    </td>
                    <td style="width: 50%; vertical-align: top; padding: 0 0 0 8px;">
                        <div style="border: 1px solid #ddd; border-radius: 4px; padding: 8px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: #f1f3f5;">
                                <tr><td style="padding: 6px 8px; text-align: right; color: #666;">Amount (Bank/Cash)</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; font-weight: 600; min-width: 110px;">₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                <tr><td style="padding: 6px 8px; text-align: right; color: #666;">TDS (Tax deducted)</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; color: #b45309;">₹${tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                <tr><td style="padding: 6px 8px; text-align: right; color: #666;">Discount</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; color: #059669;">₹${disc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                <tr style="border-top: 1px solid #e5e7eb; font-weight: 700;">
                                    <td style="padding: 8px 8px; text-align: right; color: #333;">Total settlement <span style="font-size:9px;font-weight:600;color:#64748b;display:block;">(Bank + TDS + Discount)</span></td>
                                    <td style="padding: 8px 10px 8px 8px; text-align: right; font-size: 15px;">₹${totalAdj.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                <tr><td colspan="2" style="padding: 10px 8px 8px; background: #dfe3e8;">
                                    <table style="width: 100%; border-collapse: collapse; background: #fff; border: 2px solid #111;">
                                        <tr style="font-weight: bold; font-size: 16px;">
                                            <td style="padding: 10px 8px; text-align: right;">Voucher total (full)</td>
                                            <td style="padding: 10px 12px 10px 8px; text-align: right;">₹${totalAdj.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </table>
                                    <div style="font-size: 9px; color: #64748b; text-align: right; padding: 4px 8px 0 0;">Same as total settlement — includes tax deducted &amp; discount.</div>
                                </td></tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>

            ${this.renderLinkedDocuments(voucher, settlement)}

            <table style="width: 100%; margin-top: 36px; border-collapse: collapse;"><tr><td style="text-align: right;">
                <div style="display: inline-block; text-align: right; width: 280px; max-width: 100%;">
                    <div style="font-size: 11px; margin-bottom: 44px;">For <strong style="font-weight: 800;">${esc(company.name)}</strong></div>
                    <div style="border-top: 1px solid #000; padding-top: 8px; text-align: center;">
                        <span style="font-weight: bold; font-size: 12px; text-transform: uppercase;">Authorized Signatory</span>
                    </div>
                </div>
            </td></tr></table>

            <div style="margin-top: 24px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                This is a computer generated document and does not require a physical signature.
            </div>
        `;
        return element;
    },

    renderLinkedDocuments(voucher, settlement) {
        let linked = voucher.linkedInvoices || [];

        // Fallback: If no linkedInvoices, try allocations (common in some imported formats)
        if (linked.length === 0 && voucher.allocations && Array.isArray(voucher.allocations)) {
            linked = voucher.allocations;
        }

        if (linked.length === 0) return '';
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const isReceipt = (voucher.type || '').toLowerCase() === 'receipt';
        const idx = this._buildLinkedDocIndexes(invoices, expenses);
        const settle = settlement || (typeof VoucherManager !== 'undefined' && VoucherManager.resolveSettlementDisplay
            ? VoucherManager.resolveSettlementDisplay(voucher)
            : {
                tdsAmount: parseFloat(voucher.tdsAmount) || 0,
                discountAmount: parseFloat(voucher.discountAmount) || 0
            });
        const tdsAmt = settle.tdsAmount;
        const discAmt = settle.discountAmount;
        const esc = (s) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const allocList = Array.isArray(voucher.allocations) ? voucher.allocations : [];

        const rows = linked.map(link => {
            const docId = typeof link === 'object' ? link.id : link;
            const docIdStr = (docId != null ? docId : '').toString();

            let amount = parseFloat(voucher.amount) || 0;
            if (allocList.length) {
                const alloc = allocList.find(a => (a.id != null && a.id.toString() === docIdStr) ||
                    (a.billNo != null && a.billNo.toString() === docIdStr) ||
                    (a.no != null && a.no.toString() === docIdStr) ||
                    (a.invoiceNo != null && a.invoiceNo.toString() === docIdStr) ||
                    (a.poRef != null && a.poRef.toString() === docIdStr));
                if (alloc) amount = parseFloat(alloc.amount) || 0;
            } else if (typeof link === 'object') {
                amount = parseFloat(link.amount) || 0;
            }

            const { doc, isInvoiceDoc } = this._resolveLinkedRowDoc(docIdStr, idx, invoices, expenses);
            const date = doc ? doc.date : '-';
            let refNo;
            let thirdCol;
            let lineDetails = '';
            if (doc) {
                if (isInvoiceDoc) {
                    refNo = (doc.invoiceNo || doc.id || '').toString().trim();
                    thirdCol = (doc.poNumber || doc.referenceNo || doc.buyerPoNo || '').toString().trim() || '-';
                    if (isReceipt && doc.items && doc.items.length) {
                        const maxItems = 4;
                        lineDetails = doc.items.slice(0, maxItems).map(it => {
                            const bits = [it.name, (it.description || '').trim()].filter(Boolean);
                            return bits.join(' — ');
                        }).filter(Boolean).join('; ');
                        if (lineDetails.length > 200) lineDetails = lineDetails.slice(0, 197) + '…';
                    }
                } else {
                    refNo = (doc.billNo || doc.id || '').toString().trim();
                    thirdCol = (doc.supplierBillNo || doc.supplierInvoiceNo || '').toString().trim() || '-';
                }
            } else {
                refNo = ((typeof link === 'object' && (link.invoiceNo || link.billNo || link.no)) || docId || '').toString();
                thirdCol = (typeof link === 'object' && ((link.poRef || link.supplierBillNo || '') + '').trim()) || '-';
            }

            return `
                <tr style="border: 1px solid #000;">
                    <td style="padding: 8px; border: 1px solid #000; font-family: Arial, Helvetica, sans-serif; font-size: 11px;">${esc(refNo)}</td>
                    <td style="padding: 8px; border: 1px solid #000; font-family: Arial, Helvetica, sans-serif; font-size: 11px;">${esc(date)}</td>
                    ${isReceipt ? `<td style="padding: 8px; border: 1px solid #000; font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #222;">${esc(lineDetails || '—')}</td>` : ''}
                    <td style="padding: 8px; border: 1px solid #000; font-family: Arial, Helvetica, sans-serif; font-size: 11px;">${esc(thirdCol)}</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-family: Arial, Helvetica, sans-serif; font-size: 11px;">₹${amount.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        let adjustmentRows = '';
        if (tdsAmt > 0) {
            if (isReceipt) {
                adjustmentRows += `
                <tr style="border: 1px solid #000; background: #fafafa;">
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px; font-weight: 700;" colspan="3">Tax Deducted Receivable (TDS)</td>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px;">—</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 11px; color: #b45309;">(₹${tdsAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</td>
                </tr>`;
            } else {
                adjustmentRows += `
                <tr style="border: 1px solid #000; background: #fafafa;">
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px; font-weight: 700;" colspan="2">Tax Deducted (TDS)</td>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px;">—</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 11px; color: #b45309;">(₹${tdsAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</td>
                </tr>`;
            }
        }
        if (discAmt > 0) {
            if (isReceipt) {
                adjustmentRows += `
                <tr style="border: 1px solid #000; background: #fafafa;">
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px; font-weight: 700;" colspan="3">Discount allowed</td>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px;">—</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 11px; color: #059669;">(₹${discAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</td>
                </tr>`;
            } else {
                adjustmentRows += `
                <tr style="border: 1px solid #000; background: #fafafa;">
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px; font-weight: 700;" colspan="2">Discount</td>
                    <td style="padding: 8px; border: 1px solid #000; font-size: 11px;">—</td>
                    <td style="padding: 8px; border: 1px solid #000; text-align: right; font-size: 11px; color: #059669;">(₹${discAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</td>
                </tr>`;
            }
        }

        const colPo = isReceipt ? 'PO / Reference' : 'Supplier Invoice No';
        const colDetail = isReceipt ? '<th style="padding: 8px; text-align: left; border: 1px solid #64748b; font-size: 10px; text-transform: uppercase;">Item details</th>' : '';
        const thLinked = 'padding: 8px; text-align: left; border: 1px solid #64748b; font-size: 10px; text-transform: uppercase; color: #fff;';

        return `
            <div class="gtes-pdf-break-safe" style="margin-top: 24px;">
                <h4 style="font-size: 11px; text-transform: uppercase; color: #000; margin-bottom: 8px; font-weight: bold; letter-spacing: 0.02em;">Remittance details</h4>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
                    <thead>
                        <tr style="background: #4a5568;">
                            <th style="${thLinked}">Invoice / Bill No.</th>
                            <th style="${thLinked}">Date</th>
                            ${colDetail}
                            <th style="${thLinked}">${colPo}</th>
                            <th style="padding: 8px; text-align: right; border: 1px solid #64748b; font-size: 10px; text-transform: uppercase; color: #fff;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        ${adjustmentRows}
                    </tbody>
                </table>
            </div>
        `;
    },

    async generatePDF(voucherId) {
        if (typeof DeliveryUI !== 'undefined' && DeliveryUI.downloadVoucherPdf) {
            return DeliveryUI.downloadVoucherPdf(voucherId);
        }
        const element = await this.getVoucherElement(voucherId);
        if (!element) return;

        const filename = `Voucher_${voucherId}.pdf`;
        const opt = {
            margin: [10, 10, 10, 10],
            filename,
            image: { type: 'jpeg', quality: 0.85 },
            html2canvas: {
                scale: (typeof DeliveryUI !== 'undefined' && DeliveryUI.GTES_VOUCHER_HTML2PDF_SCALE) || 1.06,
                useCORS: true,
                allowTaint: true,
                logging: false,
                backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        };
        await html2pdf().set(opt).from(element).save();
    },

    async previewVoucher(voucherId) {
        const element = await this.getVoucherElement(voucherId, { skipQr: true });
        if (!element) return;

        const container = document.getElementById('pdfPreviewContainer');
        const title = document.getElementById('pdfPreviewTitle');
        const downloadBtn = document.getElementById('pdfDownloadBtn');

        container.innerHTML = '';
        container.dataset.gtesPreviewKind = 'voucher';
        container.dataset.gtesPreviewId = String(voucherId);
        element.style.margin = '0 auto';
        element.style.boxShadow = 'none';
        container.appendChild(element);
        title.textContent = 'Voucher Preview';

        downloadBtn.onclick = () => {
            if (typeof DeliveryUI !== 'undefined' && DeliveryUI.downloadVoucherPdf) {
                void DeliveryUI.downloadVoucherPdf(voucherId);
            } else {
                this.generatePDF(voucherId);
            }
        };

        const printBtn = document.getElementById('pdfPrintBtn');
        if (printBtn) {
            printBtn.onclick = () => {
                if (typeof DeliveryUI !== 'undefined' && DeliveryUI.nativePrint) {
                    DeliveryUI.nativePrint();
                } else {
                    window.print();
                }
            };
        }

        const modalEl = document.getElementById('pdfPreviewModal');
        if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI._installPdfPreviewModalCleanup === 'function') {
            DeliveryUI._installPdfPreviewModalCleanup();
        }
        if (modalEl) {
            const inst = bootstrap.Modal.getOrCreateInstance(modalEl);
            inst.show();
            const boostZ = () => {
                modalEl.style.zIndex = '2005';
                const all = document.querySelectorAll('.modal-backdrop');
                if (all.length) all[all.length - 1].style.zIndex = '2000';
            };
            setTimeout(boostZ, 0);
            setTimeout(boostZ, 100);
        }
    },

    async showEditVoucherModal(voucherId) {
        const voucher = VoucherManager.getVoucher(voucherId);
        if (!voucher) { alert('Voucher not found.'); return; }

        // Set current mode based on voucher
        if (voucher.isPurchase) {
            this.currentMode = 'purchase';
        } else if (voucher.hasGst === false) {
            this.currentMode = 'non-gst';
        } else {
            this.currentMode = 'gst';
        }

        // Open the generic create modal pre-filled
        this.showCreateModal(voucher.type || 'receipt');

        // Wait for modal to render (reduced from 300ms to 50ms for snappiness)
        await new Promise(r => setTimeout(r, 50));

        const form = document.getElementById('createVoucherForm');
        if (!form) return;

        // Update title 
        const modalTitle = document.querySelector('#createVoucherModal .modal-title');
        if (modalTitle) modalTitle.innerHTML = `<i class="bi bi-pencil-square me-2"></i>Edit Voucher – ${voucher.id}`;

        // Pre-fill fields
        const setField = (id, val) => { const el = form.querySelector(`#${id}`) || form.querySelector(`[name="${id}"]`); if (el) el.value = val ?? ''; };
        setField('voucherIdField', voucher.id);
        setField('date', voucher.date);
        setField('voucherType', voucher.type);
        setField('amount', voucher.amount);
        setField('tdsAmount', voucher.tdsAmount || 0);
        setField('discountAmount', voucher.discountAmount || 0);
        setField('remarks', voucher.remarks || '');
        setField('refNo', voucher.referenceId || '');
        // Provide allocation context so invoice linking section can restore allocated amounts
        this._editingVoucher = voucher;

        // Payment mode
        const modeEl = form.querySelector('[name="paymentMode"]');
        if (modeEl) {
            modeEl.value = voucher.paymentMode || 'cash';
            this.onPaymentModeChange(modeEl);
        }

        // Party name
        const partyInput = document.getElementById('voucherPartySearch');
        const hiddenId = document.getElementById('voucherCustomerId');
        if (partyInput) partyInput.value = voucher.customerName || '';
        if (hiddenId) hiddenId.value = voucher.customerId || '';

        // Trigger invoice/bill linking list and restore allocations/amounts
        if (partyInput) {
            // Ensure linking section is visible during edit if there are any links/allocations
            const hasLinks = (voucher.allocations && voucher.allocations.length > 0) ||
                (voucher.linkedInvoices && voucher.linkedInvoices.length > 0) ||
                !!voucher.linkedInvoiceId;
            if (hasLinks) {
                const section = document.getElementById('invoiceLinkingSection');
                if (section) section.classList.remove('d-none');
            }
            this.onPartySelect(partyInput);
        }

        // Override save button
        const saveBtn = document.querySelector('#createVoucherModal .btn-primary[onclick*="saveVoucher"]');
        if (saveBtn) {
            saveBtn.removeAttribute('onclick');
            saveBtn.onclick = () => this.saveEditedVoucher(voucherId);
            saveBtn.textContent = 'Update Voucher';
        }
    },

    async saveEditedVoucher(voucherId) {
        const form = document.getElementById('createVoucherForm');
        if (!form || !form.checkValidity()) { form?.reportValidity(); return; }

        const formData = new FormData(form);
        const name = formData.get('customerName');
        const customers = DataManager.getData('customers') || [];
        const found = customers.find(c => c.name === name);
        const resolvedId = found ? found.id : formData.get('customerId');
        const partyId = (found && found.partyId)
            || ((typeof CustomerManager !== 'undefined' && CustomerManager.resolvePartyId)
                ? CustomerManager.resolvePartyId({ customerId: resolvedId, customerName: name })
                : '');

        const updates = {
            type: formData.get('type'),
            date: formData.get('date'),
            customerName: name,
            customerId: resolvedId,
            partyId: partyId || '',
            customerAddress: formData.get('customerAddress') || '',
            amount: parseFloat(formData.get('amount')) || 0,
            paymentMode: formData.get('paymentMode'),
            referenceId: formData.get('refNo'),
            tdsAmount: parseFloat(formData.get('tdsAmount') || 0),
            discountAmount: parseFloat(formData.get('discountAmount') || 0),
            remarks: formData.get('remarks'),
            hasGst: this.currentMode === 'gst',
            isPurchase: this.currentMode === 'purchase'
        };

        try {
            // Update by directly patching the voucher in storage
            const vouchers = DataManager.getData('vouchers') || [];
            const idx = vouchers.findIndex(v => v.id === voucherId);
            if (idx === -1) throw new Error('Voucher not found');
            vouchers[idx] = { ...vouchers[idx], ...updates, updatedAt: new Date().toISOString() };
            await DataManager.saveData('vouchers', vouchers);

            const modalEl = document.getElementById('createVoucherModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            if (typeof App !== 'undefined') App.showNotification('Voucher updated successfully!', 'success');
            queueMicrotask(() => {
                try {
                    this.updateTable();
                } catch (err) {
                    console.error(err);
                }
            });
        } catch (e) {
            console.error(e);
            if (typeof App !== 'undefined') App.showNotification('Error updating voucher: ' + e.message, 'error');
            else alert('Error updating voucher: ' + e.message);
        }
    },
};

window.VouchersUI = VouchersUI;
