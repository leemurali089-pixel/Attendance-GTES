/**
 * Invoices UI Module
 * Handles display, creation, and professional PDF generation for invoices
 * Integrated with Synced Data (Customers, Inventory)
 */
const InvoicesUI = {
    /** Indian states / UT for Place of Supply (Book Keeper style). */
    INDIAN_POS_OPTIONS: [
        'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
        'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
        'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
        'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
        'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
        'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
    ],

    _getPlaceOfSupplyOptionsHtml(selected = '') {
        const sel = (selected || '').trim();
        const opts = this.INDIAN_POS_OPTIONS.map((s) =>
            `<option value="${String(s).replace(/"/g, '&quot;')}" ${sel === s ? 'selected' : ''}>${String(s).replace(/</g, '&lt;')}</option>`
        ).join('');
        return `<option value="">— Select —</option>${opts}`;
    },

    /** GST first-two-digit state codes (common + UT); used for Local vs Interstate. */
    _STATE_NAME_TO_GST_CODE: {
        'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03', 'chandigarh': '04',
        'uttarakhand': '05', 'haryana': '06', 'delhi': '07', 'rajasthan': '08',
        'uttar pradesh': '09', 'bihar': '10', 'sikkim': '11', 'arunachal pradesh': '12',
        'nagaland': '13', 'manipur': '14', 'mizoram': '15', 'tripura': '16', 'meghalaya': '17',
        'assam': '18', 'west bengal': '19', 'jharkhand': '20', 'odisha': '21', 'chhattisgarh': '22',
        'madhya pradesh': '23', 'gujarat': '24', 'dadra and nagar haveli and daman and diu': '26',
        'maharashtra': '27', 'andhra pradesh': '37', 'karnataka': '29', 'goa': '30',
        'lakshadweep': '31', 'kerala': '32', 'tamil nadu': '33', 'puducherry': '34',
        'andaman and nicobar islands': '35', 'telangana': '36', 'ladakh': '38',
        'other territory': '97'
    },

    _normalizePartyKey(name) {
        return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    },

    /** Sales: customers (exclude pure suppliers). Purchase: suppliers/creditors only. Dedupes by normalized name. */
    _getPartiesForInvoiceSheet(isSales, customers) {
        const list = customers || [];
        const seen = new Set();
        const out = [];
        for (const c of list) {
            if (!c || !c.name || !String(c.name).trim()) continue;
            const t = String(c.accountType || c.type || '').toLowerCase();
            const g = String(c.accountGroup || '').toLowerCase();
            if (isSales) {
                if (t === 'supplier' && !g.includes('debtor')) continue;
            } else {
                const isSup = t.includes('supplier') || t.includes('vendor') || t.includes('creditor')
                    || g.includes('creditor') || g.includes('sundry creditor');
                if (!isSup) continue;
            }
            const key = this._normalizePartyKey(c.name);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(c);
        }
        out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return out;
    },

    _gstStateCodeFromGstin(gstin) {
        const g = String(gstin || '').replace(/\s/g, '').toUpperCase();
        if (g.length >= 2 && /^[0-9]{2}/.test(g)) return g.slice(0, 2);
        return '';
    },

    _companyGstStateCode() {
        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const g = settings.gstin || (DataManager.COMPANY_PROFILE && DataManager.COMPANY_PROFILE.gstin) || '';
        return this._gstStateCodeFromGstin(g);
    },

    _inferStateCodeFromAddressText(addr) {
        if (!addr) return '';
        const low = String(addr).toLowerCase();
        for (const st of this.INDIAN_POS_OPTIONS) {
            if (low.includes(st.toLowerCase())) {
                const code = this._STATE_NAME_TO_GST_CODE[st.toLowerCase()];
                if (code) return code;
            }
        }
        return '';
    },

    _partyEffectiveStateCode(party) {
        if (!party) return '';
        let c = this._gstStateCodeFromGstin(party.gstin);
        if (c) return c;
        c = this._inferStateCodeFromAddressText(party.address || '');
        if (c) return c;
        if (party.state && String(party.state).length <= 2 && /^[0-9]{2}$/.test(String(party.state))) return String(party.state);
        return this._inferStateCodeFromAddressText(String(party.state || ''));
    },

    /** Debounced party datalist — avoids huge &lt;option&gt; lists (lag while typing). */
    _partyDlTimer: null,
    _refreshPartyDatalist(query, isSales) {
        const dl = document.getElementById('invCustomerList');
        if (!dl) return;
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : (DataManager.getData('customers') || []);
        dl.innerHTML = this._buildInvPartyDatalistOptionsHtml(isSales, customers, query, null);
    },

    _buildLedgerAccountSelectOptions(isPurchase) {
        const esc = (str) => String(str || '').replace(/"/g, '&quot;');
        const presets = isPurchase
            ? ['Purchase A/C', 'Direct Expenses', 'Indirect Expenses', 'Import Purchase', 'Local Purchase @ 18%']
            : ['Sales A/C', 'Direct Income', 'Indirect Income', 'Service Income'];
        const gtes = DataManager.getData(DataManager.KEYS.ACCOUNTS) || DataManager.getData('gtes_accounts') || [];
        const cust = DataManager.getData('customers') || [];
        const extra = cust.filter((c) => {
            const n = String(c.name || '').toLowerCase();
            const t = String(c.accountType || '').toLowerCase();
            if (isPurchase) {
                return t === 'other' || c.isOtherAccount || /expense|purchase/i.test(n);
            }
            return t === 'other' || c.isOtherAccount || /income|sales/i.test(n);
        });
        const seen = new Set();
        let html = '<option value="">— Select ledger —</option>';
        const add = (label) => {
            const v = String(label || '').trim();
            if (!v || seen.has(v)) return;
            seen.add(v);
            html += `<option value="${esc(v)}">${esc(v)}</option>`;
        };
        presets.forEach(add);
        gtes.forEach((a) => add(a.name));
        extra.forEach((c) => add(c.name));
        return html;
    },

    /** Book Keeper–style direct expense heads for the Other charges line. */
    OTHER_CHARGES_DIRECT_PRESETS: [
        'BASIC SALARY A/C',
        'CARTAGE A/C',
        'DISCOUNT GIVEN A/C',
        'DISCOUNT ON SALE A/C',
        'HOUSE RENT ALLOWANCE - HRA A/C',
        'OVERTIME ALLOWANCE - OA A/C',
        'TRAVELLING ALLOWANCE - TA A/C',
        'Salary',
        'Incentive',
        'Rajmohan',
        'Cartage charged'
    ],
    OTHER_CHARGES_INDIRECT_PRESETS: [
        'PACKING & FORWARDING A/C',
        'Forex Gain',
        'Interest received',
        'Shipping',
        'Transport Charges',
        'Discount On Purchase',
        'Discount received'
    ],

    /**
     * Dropdown options for other charges: Direct / Indirect expense ledgers (presets + gtes_accounts by group).
     * Stored value remains `otherCharges.label` (account name) for backward compatibility.
     */
    _buildOtherChargesAccountSelectOptions(selected = '') {
        const esc = (str) => String(str || '').replace(/"/g, '&quot;');
        const sel = String(selected || '').trim();
        const gtes = DataManager.getData(DataManager.KEYS.ACCOUNTS) || DataManager.getData('gtes_accounts') || [];
        const customers = DataManager.getData('customers') || [];
        const extraDirect = [];
        const extraIndirect = [];
        const pushByGroup = (a) => {
            const n = String(a.name || '').trim();
            if (!n) return;
            const g = String(a.accountGroup || a.group || '').toLowerCase();
            if (g.includes('direct') && g.includes('expense')) extraDirect.push(n);
            else if (g.includes('indirect') && g.includes('expense')) extraIndirect.push(n);
        };
        gtes.forEach(pushByGroup);
        customers.forEach(pushByGroup);
        const mergeOrdered = (presets, extras) => {
            const seen = new Set();
            const out = [];
            const add = (n) => {
                const v = String(n || '').trim();
                const k = v.toLowerCase();
                if (!v || seen.has(k)) return;
                seen.add(k);
                out.push(v);
            };
            presets.forEach(add);
            [...new Set(extras)].sort((a, b) => a.localeCompare(b)).forEach(add);
            return out;
        };
        const directList = mergeOrdered(this.OTHER_CHARGES_DIRECT_PRESETS, extraDirect);
        const indirectList = mergeOrdered(this.OTHER_CHARGES_INDIRECT_PRESETS, extraIndirect);
        const opt = (name) => {
            const v = esc(name);
            const picked = sel === name ? ' selected' : '';
            return `<option value="${v}"${picked}>${v}</option>`;
        };
        let html = `<option value="">${esc('— Select account —')}</option>`;
        html += `<optgroup label="Direct Expenses">${directList.map(opt).join('')}</optgroup>`;
        html += `<optgroup label="Indirect Expenses">${indirectList.map(opt).join('')}</optgroup>`;
        return html;
    },

    /** Built-in + Admin → Tax scheme groups (`gtes_tax_schemes`). */
    _buildTaxSchemeSelectHtml(selected = '') {
        const esc = (str) => String(str || '').replace(/"/g, '&quot;');
        const sel = String(selected || '').trim();
        const builtins = [
            { value: 'DEFAULT', label: 'DEFAULT' },
            { value: 'GST18', label: 'GST 18%' },
            { value: 'GST12', label: 'GST 12%' },
            { value: 'GST5', label: 'GST 5%' }
        ];
        const custom = DataManager.getData(DataManager.KEYS.TAX_SCHEMES) || [];
        let html = '';
        builtins.forEach((b) => {
            html += `<option value="${esc(b.value)}"${sel === b.value ? ' selected' : ''}>${esc(b.label)}</option>`;
        });
        custom.forEach((t) => {
            const v = String(t.code || '').trim();
            if (!v) return;
            const lab = t.name || t.label || v;
            html += `<option value="${esc(v)}"${sel === v ? ' selected' : ''}>${esc(lab)}</option>`;
        });
        return html;
    },

    /**
     * Quick-add a ledger for other charges (Book Keeper style).
     * Stored as a customer row with accountGroup Direct/Indirect Expenses.
     * Uses a Bootstrap modal — Electron does not support window.prompt()/confirm().
     */
    _ensureAddChargeAccountModal() {
        let el = document.getElementById('gtesAddChargeAccountModal');
        if (el) return el;
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="gtesAddChargeAccountModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title"><i class="bi bi-plus-circle me-2 text-warning"></i>Add charge account</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <label class="form-label small text-white-50" for="gtesChargeAccountNameInp">Account name</label>
                            <input type="text" class="form-control bg-dark text-white border-secondary" id="gtesChargeAccountNameInp"
                                placeholder="e.g. Transport Charges, Loading" autocomplete="off">
                            <div class="mt-3">
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="gtesChargeExpType" id="gtesChargeIndirect" value="indirect" checked>
                                    <label class="form-check-label" for="gtesChargeIndirect">Indirect Expenses</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="gtesChargeExpType" id="gtesChargeDirect" value="direct">
                                    <label class="form-check-label" for="gtesChargeDirect">Direct Expenses</label>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-warning" id="gtesChargeAccountSaveBtn">
                                <i class="bi bi-check-lg me-1"></i>Add account
                            </button>
                        </div>
                    </div>
                </div>
            </div>`);
        el = document.getElementById('gtesAddChargeAccountModal');
        const onSave = async () => {
            const nameInp = document.getElementById('gtesChargeAccountNameInp');
            const name = (nameInp?.value || '').trim();
            if (!name) {
                if (typeof App !== 'undefined') App.showNotification('Enter an account name', 'warning');
                return;
            }
            const isIndirect = document.getElementById('gtesChargeIndirect')?.checked !== false;
            const accountGroup = isIndirect ? 'Indirect Expenses' : 'Direct Expenses';
            try {
                if (typeof CustomerManager === 'undefined' || !CustomerManager.addCustomer) {
                    throw new Error('CustomerManager is not available');
                }
                await CustomerManager.addCustomer({
                    name,
                    accountType: 'Customer',
                    accountGroup,
                    isOtherAccount: true,
                    address: ''
                });
                const sel = document.querySelector('#createInvoiceForm select[name="otherChargesLabel"]');
                if (sel) {
                    sel.innerHTML = InvoicesUI._buildOtherChargesAccountSelectOptions(name);
                    sel.value = name;
                }
                bootstrap.Modal.getInstance(el)?.hide();
                if (typeof App !== 'undefined') App.showNotification(`Added to ${accountGroup}: ${name}`, 'success');
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                if (typeof App !== 'undefined') App.showNotification(msg, 'error');
                else console.error(e);
            }
        };
        document.getElementById('gtesChargeAccountSaveBtn')?.addEventListener('click', onSave);
        document.getElementById('gtesChargeAccountNameInp')?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                void onSave();
            }
        });
        el.addEventListener('hidden.bs.modal', () => {
            const nameInp = document.getElementById('gtesChargeAccountNameInp');
            if (nameInp) nameInp.value = '';
        });
        el.addEventListener('shown.bs.modal', () => {
            document.getElementById('gtesChargeAccountNameInp')?.focus();
        });
        return el;
    },

    promptAddOtherChargeAccount() {
        const el = this._ensureAddChargeAccountModal();
        const nameInp = document.getElementById('gtesChargeAccountNameInp');
        if (nameInp) nameInp.value = '';
        const ind = document.getElementById('gtesChargeIndirect');
        const dir = document.getElementById('gtesChargeDirect');
        if (ind) ind.checked = true;
        if (dir) dir.checked = false;
        bootstrap.Modal.getOrCreateInstance(el).show();
    },

    _applyAutoTaxSupplyFromParty() {
        const form = document.getElementById('createInvoiceForm');
        if (!form) return;
        const typeInput = form.querySelector('[name="type"]');
        const isGST = typeInput && (typeof InvoiceManager !== 'undefined' && InvoiceManager.isGSTType
            ? InvoiceManager.isGSTType(typeInput.value)
            : String(typeInput.value || '').includes('gst'));
        if (!isGST) return;
        const cid = (form.querySelector('input[name="customerId"]')?.value || '').trim();
        const customers = DataManager.getData('customers') || [];
        const party = cid ? customers.find((c) => c.id === cid) : null;
        if (!party) return;
        const shipSame = document.getElementById('shipSameAsBilling')?.checked !== false;
        let shipAddr = '';
        if (!shipSame) {
            shipAddr = (form.querySelector('[name="shipToAddress"]')?.value || '').trim();
        }
        const partyCode = shipSame || !shipAddr
            ? this._partyEffectiveStateCode(party)
            : this._inferStateCodeFromAddressText(shipAddr) || this._partyEffectiveStateCode(party);
        const co = this._companyGstStateCode();
        const localRadio = document.getElementById('gtesTaxLocal');
        const interRadio = document.getElementById('gtesTaxInter');
        if (!localRadio || !interRadio) return;
        if (co && partyCode) {
            if (co !== partyCode) {
                interRadio.checked = true;
            } else {
                localRadio.checked = true;
            }
        }
        const pos = form.querySelector('[name="placeOfSupply"]');
        if (pos && partyCode) {
            const match = this.INDIAN_POS_OPTIONS.find((st) =>
                (this._STATE_NAME_TO_GST_CODE[st.toLowerCase()] || '') === partyCode
            );
            if (match) pos.value = match;
        }
        this.calculateTotals();
    },

    scheduleApplyAutoTax() {
        clearTimeout(this._autoTaxTimer);
        this._autoTaxTimer = setTimeout(() => this._applyAutoTaxSupplyFromParty(), 150);
    },

    onShipSameToggle() {
        const cb = document.getElementById('shipSameAsBilling');
        const block = document.getElementById('shipToBlock');
        if (cb && block) block.style.display = cb.checked ? 'none' : 'block';
        if (cb && cb.checked) {
            const ta = document.querySelector('#createInvoiceForm [name="shipToAddress"]');
            if (ta) ta.value = '';
        }
        this._applyAutoTaxSupplyFromParty();
    },

    toggleOtherCharges() {
        const cb = document.getElementById('otherChargesToggle');
        const sec = document.getElementById('otherChargesSection');
        if (cb && sec) {
            sec.style.display = cb.checked ? 'block' : 'none';
            this.calculateTotals();
        }
    },

    currentMode: 'gst', // 'gst' or 'non-gst'

    escapePdfHtml(str) {
        if (str == null || str === '') return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    currentStatusFilter: 'all',
    /** Sales list: filter by whether receipt vouchers allocate to this bill (explains bill vs ledger gaps). */
    currentVoucherLinkFilter: 'all',
    searchTimeout: null,

    async init() {
        console.log('Invoices UI Initialized');
        if (App.currentView === 'invoices') {
            this.renderInvoicesList(this.currentMode);
        }
    },

    _parseFinancialYearRange(fyLabel) {
        const s = String(fyLabel || '').trim();
        const m = s.match(/^(\d{4})-(\d{2})$/);
        if (!m) return { startDate: '', endDate: '' };
        const startYear = parseInt(m[1], 10);
        if (!Number.isFinite(startYear)) return { startDate: '', endDate: '' };
        return { startDate: `${startYear}-04-01`, endDate: `${startYear + 1}-03-31` };
    },

    _salesLedgerRangeFromFilters(yearFilter, calMonth) {
        if (calMonth && /^\d{4}-\d{2}$/.test(String(calMonth))) {
            const y = parseInt(String(calMonth).slice(0, 4), 10);
            const m = parseInt(String(calMonth).slice(5, 7), 10);
            const lastDay = new Date(y, m, 0).getDate();
            return {
                startDate: `${y}-${String(m).padStart(2, '0')}-01`,
                endDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
            };
        }
        return this._parseFinancialYearRange(yearFilter);
    },

    _purchaseLedgerRangeFromFilters(yearFilter) {
        return this._parseFinancialYearRange(yearFilter);
    },

    _resolveLedgerForParty(party, accountGroup, dateRange) {
        if (typeof BusinessAnalytics === 'undefined' || !BusinessAnalytics.getAccountLedger) return null;
        const probes = [party?.partyId, party?.customerId, party?.vendorId, party?.name].filter(Boolean);
        for (const probe of probes) {
            try {
                const l = BusinessAnalytics.getAccountLedger(probe, {
                    accountGroup,
                    startDate: dateRange?.startDate || undefined,
                    endDate: dateRange?.endDate || undefined
                });
                if (l) return l;
            } catch (e) { }
        }
        return null;
    },

    _partyLedgerCacheKey(inv) {
        const pid = String(inv?.partyId || '').trim();
        if (pid) return `p:${pid}`;
        const cid = String(inv?.customerId || '').trim();
        if (cid) return `c:${cid}`;
        return `n:${String(inv?.customerName || '').trim()}`;
    },

    /** Max receipt allocation recorded against this invoice (by id / invoice no / BK refs). */
    _receiptAllocatedForInvoice(inv, allocMap) {
        if (!inv || !allocMap || typeof allocMap.get !== 'function') return 0;
        let maxA = 0;
        for (const k of [inv.id, inv.invoiceNo, inv.bookkeeperVchNo, inv.bookkeeperId]) {
            if (k == null || k === '') continue;
            const v = allocMap.get(String(k).trim()) || 0;
            if (v > maxA) maxA = v;
        }
        return maxA;
    },

    _invoiceMatchesVoucherLinkFilter(inv, filter, allocMap) {
        if (filter === 'all' || !filter) return true;
        const alloc = this._receiptAllocatedForInvoice(inv, allocMap);
        const bal = parseFloat(inv.balance) || 0;
        if (filter === 'linked') return alloc > 0.05;
        if (filter === 'unlinked') return alloc <= 0.05 && bal > 0.05;
        return true;
    },

    setVoucherLinkFilter(val) {
        this.currentVoucherLinkFilter = val;
        this.updateTable();
    },

    load(params = {}) {
        const mode = params.mode || null;
        if (!mode) {
            this.renderSubSelection();
        } else {
            this.renderInvoicesList(mode);
        }
    },

    renderSubSelection() {
        const view = document.getElementById('invoicesView');
        if (!view) return;

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-invoice text-info me-2"></i> Sales Invoices</h2>
                    <button class="btn btn-outline-light btn-sm" onclick="App.showView('accounting')">
                        <i class="bi bi-arrow-left"></i> Back to Accounting
                    </button>
                </div>
                
                <div class="row g-4 justify-content-center pt-5">
                    <div class="col-md-5">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="InvoicesUI.load({mode: 'gst'})" style="cursor:pointer">
                            <i class="bi bi-receipt text-success display-1 mb-4"></i>
                            <h3 class="card-title text-white">GST Invoices</h3>
                            <p class="text-muted">Taxable sales with CGST/SGST/IGST</p>
                        </div>
                    </div>
                    <div class="col-md-5">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="InvoicesUI.load({mode: 'non-gst'})" style="cursor:pointer">
                            <i class="bi bi-receipt-cutoff text-info display-1 mb-4"></i>
                            <h3 class="card-title text-white">Plain Invoices</h3>
                            <p class="text-muted">Non-GST sales / Estimates</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderInvoicesList(mode = 'gst') {
        this.currentMode = mode;
        const view = document.getElementById('invoicesView');
        if (!view) return;

        // Update Title and Icon based on mode
        const isGST = mode === 'gst';
        const titleIcon = isGST ? 'bi-receipt text-success' : 'bi-receipt-cutoff text-success';
        const titleText = isGST ? 'GST Invoices' : 'Plain Invoices (Non-GST)';

        // Populate Filter Options
        const allInvoices = DataManager.getData('invoices') || [];
        const invoices = allInvoices.filter(i => isGST ? (i.type === 'gst-invoice' || i.type === 'with-bill' || !i.type) : (i.type === 'non-gst-invoice' || i.type === 'without-bill'));

        // Financial Years (April - March)
        const fYears = [...new Set(invoices.map(i => DataManager.getFinancialYear(i.date)))].filter(Boolean).sort().reverse();
        const yearOptions = fYears.map(y => `<option value="${y}">${y}</option>`).join('');

        // Customers
        const customers = [...new Set(invoices.map(i => i.customerName).filter(Boolean))].sort();
        const customerOptions = customers.map(c => `<option value="${c}">${c}</option>`).join('');

        // Add summary cards for financial overview
        const summaryHtml = `
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card bg-dark border-secondary shadow-sm">
                        <div class="card-body p-3 text-center">
                            <div class="text-white-50 fw-bold small text-uppercase mb-1">Total Pending Amount</div>
                            <h3 class="mb-0 text-danger" id="summaryPendingAmount">₹0.00</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-dark border-secondary shadow-sm hover-lift" style="cursor: pointer;" role="button" tabindex="0" title="View list of pending bills" onclick="InvoicesUI.showSalesOutstandingModal('bills')" onkeydown="if(event.key==='Enter')InvoicesUI.showSalesOutstandingModal('bills')">
                        <div class="card-body p-3 text-center">
                            <div class="text-white-50 fw-bold small text-uppercase mb-1">Total Pending Bills</div>
                            <h3 class="mb-0 text-warning" id="summaryPendingBills">0</h3>
                            <div class="text-white-50 extra-small mt-1">Click for details</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-dark border-secondary shadow-sm hover-lift" style="cursor: pointer;" role="button" tabindex="0" title="View outstanding by customer" onclick="InvoicesUI.showSalesOutstandingModal('parties')" onkeydown="if(event.key==='Enter')InvoicesUI.showSalesOutstandingModal('parties')">
                        <div class="card-body p-3 text-center">
                            <div class="text-white-50 fw-bold small text-uppercase mb-1">Parties with Outstanding</div>
                            <h3 class="mb-0 text-info" id="summaryPendingParties">0</h3>
                            <div class="text-white-50 extra-small mt-1">Click for details</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-file-earmark-text text-info me-2"></i> ${titleText}</h2>
                    <div class="d-flex gap-2">
                        <button class="btn btn-info" onclick="InvoicesUI.showCreateModal('${isGST ? 'sales-gst' : 'sales-non-gst'}')">
                            <i class="bi bi-plus-circle me-1"></i> Create New
                        </button>
                        <button class="btn btn-outline-light" onclick="App.showView('accounting')">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                </div>
                
                ${summaryHtml}

                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                        <div class="row g-2 mb-3">
                            <div class="col-md-3">
                                <label class="form-label small text-white-50">Calendar month</label>
                                <input type="month" class="form-control bg-dark text-white border-secondary" id="filterCalendarMonth"
                                    title="Optional — e.g. April 2024" onchange="InvoicesUI.updateTable()" />
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small text-white-50">Customer</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterCustomer" onchange="InvoicesUI.updateTable()">
                                    <option value="">All Customers</option>
                                    ${customerOptions}
                                </select>
                            </div>
                            <div class="col-md-3 text-end">
                                <label class="form-label small text-white-50 d-block">Filter by Status</label>
                                <div class="btn-group w-100" role="group">
                                    <input type="radio" class="btn-check" name="statusFilter" id="statusAll" value="all" ${this.currentStatusFilter === 'all' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('all')">
                                    <label class="btn btn-outline-secondary btn-sm" for="statusAll">All</label>
                                    
                                    <input type="radio" class="btn-check" name="statusFilter" id="statusPending" value="pending" ${this.currentStatusFilter === 'pending' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('pending')">
                                    <label class="btn btn-outline-danger btn-sm" for="statusPending">Pending</label>

                                    <input type="radio" class="btn-check" name="statusFilter" id="statusPartial" value="partial" ${this.currentStatusFilter === 'partial' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('partial')">
                                    <label class="btn btn-outline-warning btn-sm" for="statusPartial">Partial</label>
                                    
                                    <input type="radio" class="btn-check" name="statusFilter" id="statusPaid" value="paid" ${this.currentStatusFilter === 'paid' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('paid')">
                                    <label class="btn btn-outline-success btn-sm" for="statusPaid">Paid</label>
                                </div>
                            </div>
                        </div>
                        <div class="row g-2 mb-2">
                            <div class="col-12">
                                <label class="form-label small text-white-50 mb-1">Receipt link (per bill)</label>
                                <div class="d-flex flex-wrap align-items-center gap-2">
                                    <div class="btn-group" role="group">
                                        <input type="radio" class="btn-check" name="voucherLinkFilter" id="vlinkAll" value="all" ${this.currentVoucherLinkFilter === 'all' ? 'checked' : ''} onchange="InvoicesUI.setVoucherLinkFilter('all')">
                                        <label class="btn btn-outline-secondary btn-sm" for="vlinkAll">All</label>
                                        <input type="radio" class="btn-check" name="voucherLinkFilter" id="vlinkLinked" value="linked" ${this.currentVoucherLinkFilter === 'linked' ? 'checked' : ''} onchange="InvoicesUI.setVoucherLinkFilter('linked')">
                                        <label class="btn btn-outline-info btn-sm" for="vlinkLinked">Linked</label>
                                        <input type="radio" class="btn-check" name="voucherLinkFilter" id="vlinkUnlinked" value="unlinked" ${this.currentVoucherLinkFilter === 'unlinked' ? 'checked' : ''} onchange="InvoicesUI.setVoucherLinkFilter('unlinked')">
                                        <label class="btn btn-outline-warning btn-sm" for="vlinkUnlinked">Not linked</label>
                                    </div>
                                    <span class="text-white-50 small">Ledger due uses Account Ledger closing for the period above; Balance is this bill’s open amount from receipt allocations.</span>
                                </div>
                            </div>
                        </div>
                        <div class="row g-2">
                            <div class="col-12">
                                <label class="form-label small text-white-50">Search</label>
                                <div class="input-group">
                                    <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                                    <input type="text" class="form-control bg-dark text-light border-secondary" id="invoiceSearch" 
                                        placeholder="Search invoices by number, customer or items..." onkeyup="InvoicesUI.debouncedFilter()">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="table-responsive" id="invoicesTableContainer">
                    <div class="text-center py-5">
                        <div class="spinner-border text-info" role="status"></div>
                    </div>
                </div>
                <p class="text-white-50 small mt-2 mb-0" id="invoicesDcHint" style="display: none;">
                    <i class="bi bi-info-circle me-1"></i> Delivery challan bills (numbers containing DC) count toward totals above; open them from <strong>Accounting → Challans → View DC</strong>.
                </p>
            </div>
        `;

        this.updateTable();
    },

    setStatusFilter(val) {
        this.currentStatusFilter = val;
        this.updateTable();
        this.updatePurchasesTable();
    },

    debouncedFilter() {
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            if (document.getElementById('invoiceSearch')) this.updateTable();
            if (document.getElementById('purchaseSearch')) this.updatePurchasesTable();
        }, 300);
    },

    updateTable() {
        const type = this.currentMode; // Use currentMode to determine GST/Non-GST
        const isGST = type === 'gst'; 
        
        // High accuracy: data with balance calculation from InvoiceManager
        let invoices = (typeof InvoiceManager !== 'undefined') ? InvoiceManager.getInvoicesWithBalance() : [];
        const typeFilter = isGST ? 'with-bill' : 'without-bill';
        invoices = invoices.filter(inv => inv.type === typeFilter);

        const calMonth = document.getElementById('filterCalendarMonth')?.value || '';
        const customerFilter = document.getElementById('filterCustomer')?.value;
        const query = document.getElementById('invoiceSearch')?.value?.toLowerCase();
        const statusFilter = this.currentStatusFilter;
        const linkFilter = this.currentVoucherLinkFilter || 'all';
        const range = this._salesLedgerRangeFromFilters('', calMonth);
        const allocMap = (typeof VoucherManager !== 'undefined' && VoucherManager.getVoucherAllocationsMap)
            ? VoucherManager.getVoucherAllocationsMap(null, 'receipt')
            : new Map();

        const invYm = (d) => {
            if (!d) return '';
            const s = String(d);
            return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
        };
        const filteredAll = invoices.filter(inv => {
            const monthMatch = !calMonth || invYm(inv.date) === calMonth;
            const customerMatch = !customerFilter || inv.customerName === customerFilter;
            const statusMatch = statusFilter === 'all' || 
                             (statusFilter === 'paid' && inv.isPaid) ||
                             (statusFilter === 'pending' && !inv.isPaid && !inv.isPartial) ||
                             (statusFilter === 'partial' && inv.isPartial);
            const searchMatch = !query || 
                               (inv.invoiceNo || '').toLowerCase().includes(query) || 
                               (inv.customerName || '').toLowerCase().includes(query) ||
                               (inv.items || []).some(item => (item.name || '').toLowerCase().includes(query));
            const linkMatch = this._invoiceMatchesVoucherLinkFilter(inv, linkFilter, allocMap);

            return monthMatch && customerMatch && statusMatch && searchMatch && linkMatch;
        });

        const isDc = (inv) => (typeof InvoiceManager !== 'undefined') && InvoiceManager.isDcStyleSalesInvoice(inv);
        const forTable = filteredAll.filter(inv => !isDc(inv));

        // Summary includes DC-style bills (View DC) so totals match receipts / Book Keeper
        let totalPending = filteredAll.reduce((sum, inv) => sum + (inv.balance || 0), 0);
        const pendingCount = filteredAll.filter(inv => (inv.balance || 0) > 0.05).length;
        let outstandingParties = new Set(filteredAll.filter(inv => (inv.balance || 0) > 0.05).map(inv => inv.customerId || inv.customerName)).size;
        const canComputeLedgerSummary = typeof BusinessAnalytics !== 'undefined'
            && BusinessAnalytics.getAccountLedger
            && !query
            && filteredAll.length <= 300;
        if (canComputeLedgerSummary) {
            const partyMap = new Map();
            filteredAll.forEach(inv => {
                const key = (inv.partyId || inv.customerId || inv.customerName || '').toString().trim();
                if (!key || partyMap.has(key)) return;
                partyMap.set(key, { partyId: inv.partyId, customerId: inv.customerId, name: inv.customerName });
            });
            let ledgerSum = 0;
            let ledgerPartyCount = 0;
            for (const party of partyMap.values()) {
                const l = this._resolveLedgerForParty(party, 'customer', range);
                const bal = Math.max(0, parseFloat(l?.summary?.balance || 0) || 0);
                if (bal > 0.05) {
                    ledgerSum += bal;
                    ledgerPartyCount += 1;
                }
            }
            totalPending = ledgerSum;
            outstandingParties = ledgerPartyCount;
        }

        // Update Summary Cards if visible
        const updateEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        updateEl('summaryPendingAmount', `₹${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        updateEl('summaryPendingBills', pendingCount);
        updateEl('summaryPendingParties', outstandingParties);

        const dcHint = document.getElementById('invoicesDcHint');
        if (dcHint) {
            const hasDcInScope = filteredAll.some(inv => isDc(inv));
            dcHint.style.display = hasDcInScope ? 'block' : 'none';
        }

        const container = document.getElementById('invoicesTableContainer');
        if (!container) return;

        if (forTable.length === 0) {
            if (filteredAll.length > 0) {
                container.innerHTML = `<div class="text-center py-5 text-muted">No standard GST invoices match this view. Delivery challan bills are listed under <strong>Accounting → Challans → View DC</strong>.</div>`;
            } else {
                container.innerHTML = `<div class="text-center py-5 text-muted">No invoices found matching current filters.</div>`;
            }
            return;
        }

        // Sort by date desc
        forTable.sort((a, b) => new Date(b.date) - new Date(a.date));

        const canComputeRowLedgerDue = typeof BusinessAnalytics !== 'undefined'
            && BusinessAnalytics.getAccountLedger
            && !query
            && forTable.length <= 200;
        const ledgerCache = new Map();
        const getLedgerDueForInv = (inv) => {
            if (!canComputeRowLedgerDue) return null;
            if (typeof BusinessAnalytics === 'undefined' || !BusinessAnalytics.getAccountLedger) return null;
            const k = this._partyLedgerCacheKey(inv);
            if (ledgerCache.has(k)) return ledgerCache.get(k);
            const party = { partyId: inv.partyId, customerId: inv.customerId, name: inv.customerName };
            const l = this._resolveLedgerForParty(party, 'customer', range);
            const bal = Math.max(0, parseFloat(l?.summary?.balance || 0) || 0);
            ledgerCache.set(k, bal);
            return bal;
        };

        const salesReturnDocs = invoices.filter(x => {
            const t = String(x?.type || '').toLowerCase();
            const bk = String(x?.bookkeeperVchType || x?.v_type || '').toLowerCase();
            return x?.isCreditNote === true ||
                (t.includes('credit') && t.includes('note')) ||
                (t.includes('sales') && t.includes('return')) ||
                bk.includes('credit note') ||
                bk.includes('sales return');
        });
        const hasCreditAdjustment = (inv) => {
            const baseNo = String(inv?.invoiceNo || inv?.id || '').trim();
            if (!baseNo) return false;
            return salesReturnDocs.some(cn => {
                const ref = String(
                    cn?.referenceNo || cn?.refNo || cn?.invoiceRef || cn?.salesInvoiceRef || cn?.baseInvoiceNo || ''
                ).trim();
                return ref && ref === baseNo;
            });
        };

        const html = `
            <table class="table table-dark table-hover align-middle border-secondary">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Invoice #</th>
                        <th>Customer</th>
                        <th class="text-end">Total Amount</th>
                        <th class="text-end">Balance</th>
                        <th class="text-end" title="Customer ledger closing (same period as filters)">Ledger due</th>
                        <th class="text-center">Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${forTable.map(inv => {
            const statusBadge = inv.isPaid ? 
                '<span class="badge bg-success-subtle text-success border border-success">Paid</span>' : 
                (inv.isPartial ? 
                    '<span class="badge bg-warning-subtle text-warning border border-warning">Partial</span>' : 
                    '<span class="badge bg-danger-subtle text-danger border border-danger">Pending</span>');
            
            const itemsList = (inv.items || []).map(item => item.name).join(', ');
            const creditAdjBadge = hasCreditAdjustment(inv)
                ? '<span class="badge bg-secondary-subtle text-secondary border border-secondary ms-2">Credit Note</span>'
                : '';
            const ld = getLedgerDueForInv(inv);
            const ledgerCell = ld == null
                ? '<td class="text-end text-muted">—</td>'
                : `<td class="text-end fw-bold text-warning" title="Same as Account Ledger closing for this customer and period">₹${ld.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
                    
            return `
                        <tr>
                            <td>${DataManager.formatDateDisplay(inv.date)}</td>
                            <td>
                                <div class="fw-bold text-info">${inv.invoiceNo || inv.id}${creditAdjBadge}</div>
                                <div style="font-size: 10px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                                    ${itemsList}
                                </div>
                            </td>
                            <td>${inv.customerName}</td>
                            <td class="text-end">₹${(parseFloat(inv.total ?? inv.amount ?? 0) || 0).toFixed(2)}</td>
                            <td class="text-end fw-bold ${inv.balance > 0 ? 'text-danger' : 'text-success'}">₹${(parseFloat(inv.balance) || 0).toFixed(2)}</td>
                            ${ledgerCell}
                            <td class="text-center">${statusBadge}</td>
                            <td class="text-end">
                                <div class="btn-group">
                                    <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewInvoice('${inv.id}')" title="View/Print">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-warning" onclick="InvoicesUI.showEditModal('${inv.id}')" title="Edit">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" onclick="InvoicesUI.deleteInvoice('${inv.id}')" title="Delete">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = html;
    },

    // Legacy method redirection for existing onclicks
    // filterInvoices() {
    //     if (!this.debouncedFilter) {
    //         this.debouncedFilter = this.debounce(() => this.performFilter(), 300);
    //     }
    //     this.debouncedFilter();
    // },

    showCreateModal(type = 'sales-gst') {
        const UI = InvoicesUI;
        const isPurchase = String(type).includes('purchase');
        const isSales = !isPurchase;
        UI._createInvoicePartyIsSales = isSales;
        const isGST = type === 'sales-gst' || type === 'purchase-gst';
        const title = isPurchase
            ? (isGST ? 'Purchase (GST)' : 'Purchase (Non-GST)')
            : (isGST ? 'Tax Invoice (GST)' : 'Plain Invoice (Non-GST)');
        const partyLabel = isSales ? 'Customer/Cash' : 'Supplier/Cash';
        const accountLabel = isSales ? 'Sales Account' : 'Purchase Account';
        const docNoLabel = isPurchase ? 'Purchase No' : 'Invoice #';
        const submitBtnText = isPurchase ? 'CREATE PURCHASE' : 'CREATE INVOICE';

        const customers = CustomerManager ? CustomerManager.getAllCustomers() : (DataManager.getData('customers') || []);
        const inventory = InventoryManager ? InventoryManager.getAllMaterials() : (DataManager.getData('inventory') || []);
        // Support for Services (Try dedicated keys, then fallback to Inventory)
        let services = DataManager.getData('gtes_services') || DataManager.getData('services') || [];
        if (services.length === 0) {
            services = inventory.filter(m => m.unit === 'service' || m.type === 'service' || m.category === 'Services' || m.category === 'Service Charges');
        }
        const settings = DataManager.getData('settings') || {};

        // Helper to escape quotes for HTML attributes
        const esc = (str) => String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const ledgerSelOpts = typeof UI._buildLedgerAccountSelectOptions === 'function'
            ? UI._buildLedgerAccountSelectOptions(isPurchase)
            : '<option value="">— Select ledger —</option>';
        const otherChargesOpts = typeof UI._buildOtherChargesAccountSelectOptions === 'function'
            ? UI._buildOtherChargesAccountSelectOptions('')
            : '<option value="">— Select account —</option>';
        const taxSchemeOpts = typeof UI._buildTaxSchemeSelectHtml === 'function'
            ? UI._buildTaxSchemeSelectHtml('')
            : (() => {
                const escOpt = (s) => String(s || '').replace(/"/g, '&quot;');
                return [
                    ['DEFAULT', 'DEFAULT'],
                    ['GST18', 'GST 18%'],
                    ['GST12', 'GST 12%'],
                    ['GST5', 'GST 5%']
                ].map(([v, lab]) => `<option value="${escOpt(v)}">${escOpt(lab)}</option>`).join('');
            })();
        // Slim party datalist (deduped + role-filtered); typing refreshes via debounce
        const customerOptions = typeof UI._buildInvPartyDatalistOptionsHtml === 'function'
            ? UI._buildInvPartyDatalistOptionsHtml(isSales, customers, '', esc)
            : '';

        // Separate Inventory and Services
        const inventoryOptions = inventory
            .filter(m => m.unit !== 'service' && m.type !== 'service' && m.category !== 'Services')
            .map(i => `<option value="${esc(i.name)}" data-type="item" data-rate="${isSales ? (i.rate || 0) : (i.purchaseRate || i.rate || 0)}" data-unit="${esc(i.unit || 'pcs')}" data-gst="${i.gstRate || 0}" data-hsn="${esc(i.hsnCode)}" data-stock="${i.currentStock || i.stock || i.unitsLeft || 0}"></option>`)
            .join('');
        const serviceOptions = services.map(s => `<option value="${esc(s.name)}" data-type="service" data-rate="${s.rate || 0}" data-unit="${esc(s.unit || 'job')}" data-gst="${s.tax || 0}" data-hsn="${esc(s.hsn || s.hsnCode)}"> (Service)</option>`).join('');
        const allItemOptions = inventoryOptions + serviceOptions;

        // Generate next document number
        const nextNo = isPurchase
            ? (InvoiceManager && InvoiceManager.generatePurchaseBillNumber
                ? InvoiceManager.generatePurchaseBillNumber(isGST)
                : (isGST ? 'PUR-WB-0001' : 'PUR-NB-0001'))
            : (InvoiceManager ? InvoiceManager.generateInvoiceNumber(isGST ? 'with-bill' : 'without-bill') : '00001');
        const dcLabel = isPurchase
            ? 'Supplier Invoice No'
            : (isSales ? 'Customer DC / Ref No' : 'Supplier Bill No / Ref');
        const today = new Date().toISOString().split('T')[0];
        const posOpts = typeof UI._getPlaceOfSupplyOptionsHtml === 'function'
            ? UI._getPlaceOfSupplyOptionsHtml(settings.defaultPlaceOfSupply || 'Tamil Nadu')
            : '<option value="">— Select —</option>';
        
        const modalHtml = `
            <div class="modal fade" id="createInvoiceModal" tabindex="-1">
                <style>
                    .glass-panel {
                        background: rgba(255, 255, 255, 0.05);
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    .bk-form-control {
                        background: #1a1d21 !important;
                        color: #ffffff !important;
                        border: 1px solid #3d444d !important;
                        border-radius: 4px;
                        padding: 6px 12px;
                        font-size: 14px;
                        color-scheme: dark;
                    }
                    .bk-form-control:focus {
                        border-color: #0d6efd !important;
                        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
                        outline: none;
                    }
                    .bk-form-label {
                        font-size: 12px;
                        color: #dee2e6; /* Increased brightness for visibility */
                        margin-bottom: 4px;
                        font-weight: 500;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .table-dark {
                        --bs-table-bg: #1a1d21;
                        --bs-table-border-color: #3d444d;
                    }
                    .highlight-input {
                        border-color: #ffc107 !important;
                    }
                    .footer-label {
                        color: #ced4da; /* Brightened from adb5bd */
                        font-size: 0.85rem;
                        font-weight: 500;
                    }
                    .bk-form-control::placeholder {
                        color: #9ea1a4 !important; /* Increased placeholder visibility */
                        opacity: 0.7;
                    }
                    .gtes-create-invoice-body {
                        min-height: 0;
                        flex: 1 1 auto;
                        max-height: calc(100vh - 52px);
                    }
                    .gtes-invoice-items-scroll {
                        min-height: 120px;
                        -webkit-overflow-scrolling: touch;
                    }
                </style>
                <div class="modal-dialog modal-fullscreen" style="max-width: 100vw; margin: 0;">
                    <div class="modal-content bg-dark text-white border-secondary d-flex flex-column h-100">
                        <div class="modal-header border-secondary d-flex justify-content-between align-items-center">
                            <div>
                                <span class="fw-bold fs-5 me-3"><i class="bi ${isPurchase ? 'bi-bag-check me-2 text-warning' : 'bi-receipt me-2 text-info'}"></i> ${title}</span>
                                <button type="button" class="btn btn-sm btn-outline-info ms-2 py-0 px-2" onclick="InvoicesUI.toggleFullscreen()" title="Toggle Fullscreen">
                                    <i class="bi bi-arrows-fullscreen"></i>
                                </button>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>

                        <div class="modal-body p-4 bg-dark d-flex flex-column overflow-hidden gtes-create-invoice-body">
                            <form id="createInvoiceForm" class="d-flex flex-column flex-grow-1" style="min-height:0;" onsubmit="event.preventDefault(); InvoicesUI.saveInvoice(event)">
                                <datalist id="invCustomerList">${customerOptions}</datalist>
                                <datalist id="invInventoryList">${inventoryOptions}</datalist>
                                <datalist id="invServiceList">${serviceOptions}</datalist>
                                <datalist id="invItemList">${allItemOptions}</datalist>
                                <input type="hidden" name="type" value="${type}">
                                <input type="hidden" name="customerId">
                                <input type="hidden" name="customerAddress">


                                <!-- Header + search (fixed top of form) -->
                                <div class="flex-shrink-0 gtes-invoice-form-top">
                                <div class="row g-3 mb-3">
                                    <div class="col-md-3">
                                        <div class="bk-form-label">${docNoLabel}</div>
                                        <input type="text" class="bk-form-control w-100 highlight-input" name="invoiceNo" value="${nextNo}" required>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">${dcLabel}</div>
                                        <input type="text" class="bk-form-control w-100" name="poNumber" placeholder="No.">
                                    </div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">Voucher Date</div>
                                        <input type="date" class="bk-form-control w-100" name="date" value="${today}" required>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">${partyLabel} *</div>
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text bg-dark border-secondary text-info"><i class="bi bi-person-badge"></i></span>
                                            <input type="text" class="bk-form-control flex-grow-1" name="customerName" list="invCustomerList" 
                                                onchange="InvoicesUI.onCustomerSelect(this)" onblur="InvoicesUI.scheduleUnknownPartyCheck(this)" placeholder="${isPurchase ? 'Search supplier…' : 'Search customer…'}">
                                        </div>
                                        <div id="customerDetailsInfo" class="small text-muted mt-1" style="font-size: 11px; min-height: 15px;"></div>
                                        <div id="partyBillingDetails" class="mt-2 p-2 rounded border border-secondary bg-dark" style="display:none;">
                                            <div class="row g-2">
                                                <div class="col-md-6">
                                                    <div class="bk-form-label small mb-0">GSTIN</div>
                                                    <div id="partyGstDisplay" class="text-info small">—</div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="bk-form-label small mb-0">Billing address</div>
                                                    <div id="partyAddrDisplay" class="text-white-50 small" style="white-space:pre-wrap;">—</div>
                                                </div>
                                            </div>
                                            <div class="form-check form-switch mt-2 mb-1">
                                                <input class="form-check-input" type="checkbox" id="shipSameAsBilling" checked onchange="InvoicesUI.onShipSameToggle()">
                                                <label class="form-check-label small" for="shipSameAsBilling">Ship to same as billing</label>
                                            </div>
                                            <div id="shipToBlock" style="display:none;">
                                                <div class="bk-form-label small">Ship-to address</div>
                                                <textarea class="bk-form-control w-100" name="shipToAddress" rows="2" placeholder="Delivery / consignee address" oninput="InvoicesUI.scheduleApplyAutoTax()"></textarea>
                                                <div class="form-check mt-2 mb-0">
                                                    <input class="form-check-input" type="checkbox" id="includeShipToOnPdf" name="includeShipToOnPdf" checked>
                                                    <label class="form-check-label small" for="includeShipToOnPdf">Show delivery address on printed invoice / PDF</label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="row g-3 mb-4 p-3 rounded border border-secondary" style="background: rgba(255,255,255,0.03);">
                                    <div class="col-12 mb-1"><span class="text-white-50 small"><i class="bi bi-journal-text me-1"></i> Ledger &amp; tax (Book Keeper style)</span></div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">${accountLabel}</div>
                                        <select class="bk-form-control w-100" name="ledgerAccount">${ledgerSelOpts}</select>
                                    </div>
                                    <div class="col-md-2">
                                        <div class="bk-form-label">Due Date</div>
                                        <input type="date" class="bk-form-control w-100" name="dueDate" value="${today}">
                                    </div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">Place of Supply</div>
                                        <select class="bk-form-control w-100" name="placeOfSupply">${posOpts}</select>
                                    </div>
                                    ${isGST ? `
                                    <div class="col-md-2">
                                        <div class="bk-form-label">Tax</div>
                                        <div class="btn-group btn-group-sm w-100 flex-wrap" role="group">
                                            <input type="radio" class="btn-check" name="taxSupplyType" id="gtesTaxLocal" value="local" checked onchange="InvoicesUI.calculateTotals()">
                                            <label class="btn btn-outline-info" for="gtesTaxLocal">Local</label>
                                            <input type="radio" class="btn-check" name="taxSupplyType" id="gtesTaxInter" value="interstate" onchange="InvoicesUI.calculateTotals()">
                                            <label class="btn btn-outline-info" for="gtesTaxInter">Interstate</label>
                                        </div>
                                    </div>
                                    <div class="col-md-2">
                                        <div class="bk-form-label">Tax scheme</div>
                                        <select class="bk-form-control w-100" name="taxScheme" onchange="InvoicesUI.calculateTotals()">${taxSchemeOpts}</select>
                                    </div>
                                    ` : '<div class="col-md-4"></div>'}
                                </div>

                                <!-- Search Panels -->
                                <div class="row g-3 mb-4">
                                    <div class="col-md-6">
                                        <div class="card glass-panel h-100">
                                            <div class="card-body p-3">
                                                <label class="bk-form-label text-info">Search Inventory (Materials)</label>
                                                <div class="input-group input-group-sm mb-2">
                                                     <span class="input-group-text bg-dark border-secondary text-info"><i class="bi bi-box-seam"></i></span>
                                                     <input type="text" class="bk-form-control flex-grow-1" id="invSearchInput" 
                                                         placeholder="Type material name..." list="invInventoryList" 
                                                         onchange="InvoicesUI.handleInventorySelect(this, 'invInventoryList')">
                                                 </div>
                                                <div class="row g-2">
                                                    <div class="col-6">
                                                        <button type="button" class="btn btn-sm btn-outline-success w-100" onclick="InvoicesUI.addItemRow()">
                                                            <i class="bi bi-plus-lg"></i> Custom
                                                        </button>
                                                    </div>
                                                    <div class="col-6">
                                                        <button type="button" class="btn btn-sm btn-outline-primary w-100" onclick="window.DeliveryUI?.showInventoryModal()">
                                                            <i class="bi bi-plus-circle"></i> New Item
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card glass-panel h-100">
                                            <div class="card-body p-3">
                                                <label class="bk-form-label text-warning">Search Services / Labor</label>
                                                <div class="input-group input-group-sm mb-2">
                                                     <span class="input-group-text bg-dark border-secondary text-warning"><i class="bi bi-tools"></i></span>
                                                     <input type="text" class="bk-form-control flex-grow-1" id="svcSearchInput" 
                                                         placeholder="Type service name..." list="invServiceList"
                                                         onchange="InvoicesUI.handleInventorySelect(this, 'invServiceList')">
                                                 </div>
                                                <button type="button" class="btn btn-sm btn-outline-warning w-100" onclick="window.DeliveryUI?.showSection('services')">
                                                    <i class="bi bi-gear"></i> Manage Services
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </div>

                                <!-- Middle: line items only (scrolls) -->
                                <div class="d-flex flex-column flex-grow-1 mb-3 gtes-invoice-middle" style="min-height:0;">
                                <div class="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
                                    <h6 class="mb-0 text-uppercase letter-spacing-1 fw-bold"><i class="bi bi-list-check me-2 text-info"></i>Selected Items</h6>
                                </div>

                                <!-- Items Table -->
                                <div class="table-responsive border border-secondary rounded gtes-invoice-items-scroll flex-grow-1">
                                    <table class="table table-dark table-hover table-sm mb-0" id="invoiceItemsTable">
                                        <thead>
                                            <tr class="bg-black">
                                                <th class="ps-3 py-2" width="${isGST ? '25%' : '30%'}">ITEM</th>
                                                <th width="${isGST ? '20%' : '25%'}">DESCRIPTION</th>
                                                ${isGST ? '<th width="10%">HSN</th>' : ''}
                                                <th width="8%">QTY</th>
                                                <th width="8%">UNIT</th>
                                                <th width="12%">RATE</th>
                                                ${isGST ? '<th width="8%">GST%</th>' : ''}
                                                <th width="12%">AMOUNT</th>
                                                <th width="3%"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="invoiceItemsBody">
                                            <!-- Dynamic Rows -->
                                        </tbody>
                                    </table>
                                </div>
                                </div>

                                <!-- Footer: dispatch, narration, totals (pinned to bottom of form) -->
                                <div class="row g-4 flex-shrink-0 mt-auto gtes-invoice-form-footer">
                                    <div class="col-md-8">
                                        <div class="row g-3">
                                            <div class="col-md-12">
                                                <div class="form-check form-switch mb-3">
                                                    <input class="form-check-input" type="checkbox" id="dispatchDetails" onchange="InvoicesUI.toggleDispatchDetails()">
                                                    <label class="form-check-label fw-bold text-info" for="dispatchDetails">ADD DISPATCH DETAILS</label>
                                                </div>
                                                <div id="dispatchSection" style="display: none;" class="card glass-panel border-info mb-3">
                                                    <div class="card-body p-3">
                                                        <div class="row g-3">
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">Dispatch Via</div>
                                                                <input type="text" class="bk-form-control w-100" name="dispatchVia" placeholder="e.g. Courier">
                                                            </div>
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">LR / Tracking No</div>
                                                                <input type="text" class="bk-form-control w-100" name="lrNo" placeholder="No.">
                                                            </div>
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">Vehicle No</div>
                                                                <input type="text" class="bk-form-control w-100" name="vehicleNo" placeholder="No.">
                                                            </div>
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">Date</div>
                                                                <input type="date" class="bk-form-control w-100" name="dispatchDate" value="${new Date().toISOString().split('T')[0]}">
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-12">
                                                <div class="form-check form-switch mb-2">
                                                    <input class="form-check-input" type="checkbox" id="otherChargesToggle" onchange="InvoicesUI.toggleOtherCharges()">
                                                    <label class="form-check-label fw-bold text-warning" for="otherChargesToggle">OTHER CHARGES</label>
                                                </div>
                                                <div id="otherChargesSection" style="display: none;" class="card glass-panel border-warning mb-3">
                                                    <div class="card-body p-3">
                                                        <div class="row g-3">
                                                            <div class="col-md-6">
                                                                <div class="bk-form-label">Charge account</div>
                                                                <select class="bk-form-control w-100" name="otherChargesLabel" onchange="InvoicesUI.calculateTotals()">${otherChargesOpts}</select>
                                                            </div>
                                                            <div class="col-md-6">
                                                                <div class="bk-form-label">Amount</div>
                                                                <input type="number" class="bk-form-control w-100" name="otherChargesAmount" value="0" step="0.01" onchange="InvoicesUI.calculateTotals()">
                                                            </div>
                                                            <div class="col-12">
                                                                <button type="button" class="btn btn-sm btn-outline-warning" onclick="InvoicesUI.promptAddOtherChargeAccount()">
                                                                    <i class="bi bi-plus-lg"></i> Add charge account
                                                                </button>
                                                                <span class="small text-white-50 ms-2">Creates a ledger under Direct or Indirect Expenses (saved in Accounts).</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-12">
                                                <div class="bk-form-label">Narration</div>
                                                <textarea class="bk-form-control w-100" name="narration" rows="2" placeholder="Enter remarks..."></textarea>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="card glass-panel border-secondary">
                                            <div class="card-body p-3">
                                                <div class="d-flex justify-content-between mb-2">
                                                    <span class="footer-label">SUBTOTAL:</span>
                                                    <span class="fw-bold text-white" id="subTotal">0.00</span>
                                                </div>
                                                ${isGST ? `
                                                <div id="gtesCgstSgstFooter">
                                                <div class="d-flex justify-content-between mb-1">
                                                    <span class="footer-label">CGST:</span>
                                                    <span class="fw-bold text-white" id="cgstTotal">0.00</span>
                                                </div>
                                                <div class="d-flex justify-content-between mb-2">
                                                    <span class="footer-label">SGST:</span>
                                                    <span class="fw-bold text-white" id="sgstTotal">0.00</span>
                                                </div>
                                                </div>
                                                <div id="gtesIgstFooter" class="d-none mb-2">
                                                    <div class="d-flex justify-content-between mb-1">
                                                        <span class="footer-label">IGST:</span>
                                                        <span class="fw-bold text-white" id="igstTotalDisplay">0.00</span>
                                                    </div>
                                                </div>
                                                ` : ''}
                                                <div class="d-flex justify-content-between mb-2">
                                                    <span class="footer-label">OTHER CHARGES:</span>
                                                    <span class="fw-bold text-white" id="otherChargesDisplay">0.00</span>
                                                </div>
                                                <div class="d-flex justify-content-between align-items-center mb-3">
                                                    <span class="footer-label">ROUND OFF:</span>
                                                    <input type="number" class="bk-form-control text-end p-1" style="width: 100px; height: 30px;" 
                                                        id="roundOff" value="0.00" step="0.01" onchange="InvoicesUI.calculateTotals()">
                                                </div>
                                                <hr class="border-secondary mt-0">
                                                <div class="d-flex justify-content-between align-items-center">
                                                    <h6 class="mb-0 text-info">TOTAL:</h6>
                                                    <h5 class="mb-0 text-info" id="totalAmountDisplay">0.00</h5>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="d-flex gap-2 mt-4">
                                            <button type="button" class="btn btn-outline-secondary flex-grow-1" data-bs-dismiss="modal">CANCEL</button>
                                            <button type="submit" class="btn btn-primary flex-grow-1 py-2 fw-bold">
                                                <i class="bi bi-plus-circle me-2"></i>${submitBtnText}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('createInvoiceModal');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('createInvoiceModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        const onModalHidden = () => {
            document.querySelectorAll('.gtes-fixed-datalist-popup').forEach((p) => {
                if (typeof p._gtesPopupCleanup === 'function') p._gtesPopupCleanup();
                p.remove();
            });
            modalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        modalEl.addEventListener('hidden.bs.modal', onModalHidden);

        // Add first row (use UI so this works if showCreateModal is ever called unbound)
        if (typeof UI.addItemRow === 'function') UI.addItemRow();
        if (typeof UI.activateCustomDatalists === 'function') UI.activateCustomDatalists();
        const cn = document.querySelector('#createInvoiceForm [name="customerName"]');
        if (cn) {
            cn.addEventListener('input', () => {
                clearTimeout(UI._partyDlTimer);
                const q = cn.value;
                UI._partyDlTimer = setTimeout(() => {
                    if (typeof UI._refreshPartyDatalist === 'function') {
                        UI._refreshPartyDatalist(q, UI._createInvoicePartyIsSales !== false);
                    }
                }, 200);
            });
            if (typeof UI._refreshPartyDatalist === 'function') {
                UI._refreshPartyDatalist('', UI._createInvoicePartyIsSales !== false);
            }
        }
    },

    _buildInvPartyDatalistOptionsHtml(isSales, customers, query, esc) {
        const escFn = esc || ((str) => String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
        const pool = this._getPartiesForInvoiceSheet(isSales, customers || []);
        const q = this._normalizePartyKey(query || '');
        const matches = q
            ? pool.filter((c) => this._normalizePartyKey(c.name).includes(q))
            : pool.slice(0, 80);
        return matches.slice(0, 80).map((c) => {
            const addr = escFn(c.address || '');
            const gst = escFn(c.gstin || '');
            const st = escFn(c.state || '');
            return `<option value="${escFn(c.name)}" data-id="${escFn(c.id)}" data-address="${addr}" data-gst="${gst}" data-state="${st}" data-dc-number="${escFn(c.customerDCNumber || '')}"></option>`;
        }).join('');
    },

    /** After saving a new party from DeliveryUI customer modal while invoice is open */
    afterPartySavedFromInvoice(customer) {
        if (!customer || !document.getElementById('createInvoiceForm')) return;
        const dl = document.getElementById('invCustomerList');
        const isSales = this._createInvoicePartyIsSales !== false;
        const all = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : (DataManager.getData('customers') || []);
        if (dl) {
            dl.innerHTML = this._buildInvPartyDatalistOptionsHtml(isSales, all, '', null);
        }
        const nameInp = document.querySelector('#createInvoiceForm [name="customerName"]');
        if (nameInp) {
            nameInp.value = customer.name || '';
            this.onCustomerSelect(nameInp);
        }
    },

    scheduleUnknownPartyCheck(input) {
        clearTimeout(this._unknownPartyTimer);
        this._unknownPartyTimer = setTimeout(() => this.maybePromptNewPartyFromInvoice(input), 280);
    },

    /**
     * @returns {boolean} true if the create-party modal was opened (caller should abort save).
     */
    maybePromptNewPartyFromInvoice(input) {
        if (!input || !document.getElementById('createInvoiceModal')?.classList.contains('show')) return false;
        const val = (input.value || '').trim();
        if (!val) return false;
        const form = document.getElementById('createInvoiceForm');
        const type = form?.querySelector('[name="type"]')?.value || '';
        const isSales = !String(type).includes('purchase');
        const list = document.getElementById('invCustomerList');
        if (!list) return false;
        const opts = Array.from(list.querySelectorAll('option'));
        const hit = opts.find(o => o.value && o.value.toLowerCase() === val.toLowerCase());
        if (hit) {
            if (input.value !== hit.value) input.value = hit.value;
            this.onCustomerSelect(input);
            return false;
        }
        const hid = form?.querySelector('input[name="customerId"]')?.value;
        if (hid && hid.trim()) return false;

        const label = isSales ? 'customer' : 'supplier';
        if (!confirm(`"${val}" is not in your ${label} list.\n\nCreate as a new ${label} and fill in details?`)) return false;

        if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.showCustomerModal === 'function') {
            DeliveryUI.currentCustomerType = isSales ? 'Customer' : 'Supplier';
            DeliveryUI.showCustomerModal(null, { prefillName: val });
            return true;
        }
        App.showNotification('Open Customers to add this party first.', 'warning');
        return false;
    },

    /**
     * Invoices require a party that exists in Customers (matched by id or exact name).
     * @returns {object|null} Customer row or null if blocked (notification shown).
     */
    assertResolvedPartyOrAbort(formData, opts = {}) {
        const saveBtn = opts.saveBtn;
        const type = formData.get('type') || '';
        const isPurchase = String(type).includes('purchase');
        const label = isPurchase ? 'supplier' : 'customer';
        const rawName = (formData.get('customerName') || '').trim();
        if (!rawName) {
            App.showNotification(`Enter a ${label} name and choose a saved account from the list.`, 'error');
            if (saveBtn) saveBtn.disabled = false;
            return null;
        }
        const customers = DataManager.getData('customers') || [];
        const hId = (formData.get('customerId') || '').toString().trim();
        let party = hId ? customers.find(c => c.id === hId) : null;
        if (party && rawName && (party.name || '').trim().toLowerCase() !== rawName.toLowerCase()) {
            party = null;
        }
        if (!party) {
            party = customers.find(c => (c.name || '').trim().toLowerCase() === rawName.toLowerCase());
        }
        if (!party) {
            const nameInput = document.querySelector('#createInvoiceForm [name="customerName"]');
            if (nameInput && this.maybePromptNewPartyFromInvoice(nameInput)) {
                if (saveBtn) saveBtn.disabled = false;
                return null;
            }
            App.showNotification(
                `No saved ${label} matches "${rawName}". Add them under Customers / Suppliers first, then select from the list.`,
                'error'
            );
            if (saveBtn) saveBtn.disabled = false;
            return null;
        }
        return party;
    },

    activateCustomDatalists() {
        document.querySelectorAll('#createInvoiceModal input[list]').forEach(input => {
            if (input.dataset.gtesDatalistBound === '1') return;
            const listId = input.getAttribute('list');
            const datalist = document.getElementById(listId);
            if (!datalist) return;

            input.removeAttribute('list');
            input.dataset.gtesDatalistBound = '1';

            const wrapper = document.createElement('div');
            wrapper.className = 'position-relative w-100 flex-grow-1';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            const popup = document.createElement('div');
            popup.className = 'dropdown-menu bg-dark border-secondary shadow-lg custom-datalist-popup gtes-fixed-datalist-popup p-0';
            popup.style.maxHeight = 'min(360px, calc(100vh - 120px))';
            popup.style.overflowY = 'auto';
            popup.style.position = 'fixed';
            popup.style.display = 'none';
            popup.style.zIndex = '20050';
            popup.style.minWidth = '200px';
            document.body.appendChild(popup);

            const positionPopup = () => {
                if (popup.style.display === 'none' || popup.style.display === '') return;
                const r = input.getBoundingClientRect();
                const vw = window.innerWidth;
                let w = Math.max(r.width, 280);
                let left = r.left;
                if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
                popup.style.left = `${left}px`;
                popup.style.top = `${r.bottom + 2}px`;
                popup.style.width = `${w}px`;
                const spaceBelow = window.innerHeight - r.bottom - 8;
                popup.style.maxHeight = `${Math.min(360, Math.max(120, spaceBelow))}px`;
            };

            const getOptions = () => Array.from(datalist.options);
            let selectedIndex = -1;
            let currentFiltered = [];

            const hidePopup = () => {
                popup.style.display = 'none';
                popup.classList.remove('show');
            };

            const filterOptions = () => {
                const val = input.value.toLowerCase().trim();
                popup.innerHTML = '';
                selectedIndex = -1;

                currentFiltered = getOptions().filter(opt => {
                    if (!val) return true;
                    return opt.value.toLowerCase().includes(val) || (opt.textContent && opt.textContent.toLowerCase().includes(val));
                });

                currentFiltered.forEach((opt) => {
                    const div = document.createElement('div');
                    div.className = 'dropdown-item text-white px-3 py-2 text-wrap';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    div.style.fontSize = '14px';

                    let displayHTML = opt.value;
                    if (opt.textContent) {
                        displayHTML += `<span class="text-secondary ms-1" style="font-size:12px">${opt.textContent}</span>`;
                    }
                    div.innerHTML = displayHTML;

                    div.onmousedown = (e) => {
                        e.preventDefault();
                        input.value = opt.value;
                        hidePopup();
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    };
                    div.onmouseover = () => {
                        updateHighlight(Array.from(popup.children).indexOf(div));
                    };
                    popup.appendChild(div);
                });

                if (currentFiltered.length > 0) {
                    popup.classList.add('show');
                    popup.style.display = 'block';
                    positionPopup();
                } else {
                    hidePopup();
                }
            };

            const updateHighlight = (index) => {
                const items = popup.children;
                for (let i = 0; i < items.length; i++) {
                    if (i === index) {
                        items[i].classList.add('bg-primary');
                        items[i].classList.remove('text-white');
                        items[i].classList.add('text-white');
                        items[i].scrollIntoView({ block: 'nearest' });
                    } else {
                        items[i].classList.remove('bg-primary');
                    }
                }
                selectedIndex = index;
            };

            const onScrollOrResize = () => positionPopup();
            window.addEventListener('scroll', onScrollOrResize, true);
            window.addEventListener('resize', onScrollOrResize);

            input.addEventListener('input', filterOptions);
            input.addEventListener('focus', filterOptions);
            input.addEventListener('blur', () => {
                setTimeout(() => {
                    hidePopup();
                }, 200);
            });

            input.addEventListener('keydown', (e) => {
                if (popup.style.display === 'none' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    filterOptions();
                    return;
                }
                const items = popup.children;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selectedIndex < items.length - 1) updateHighlight(selectedIndex + 1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectedIndex > 0) updateHighlight(selectedIndex - 1);
                } else if (e.key === 'Enter') {
                    if (popup.style.display === 'block') {
                        e.preventDefault();
                        if (selectedIndex >= 0 && currentFiltered[selectedIndex]) {
                            input.value = currentFiltered[selectedIndex].value;
                            hidePopup();
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                } else if (e.key === 'Escape') {
                    hidePopup();
                }
            });

            input.addEventListener('click', () => {
                if (popup.style.display === 'none') filterOptions();
            });

            popup._gtesPopupCleanup = () => {
                window.removeEventListener('scroll', onScrollOrResize, true);
                window.removeEventListener('resize', onScrollOrResize);
            };
        });
    },

    toggleFullscreen() {
        const dialog = document.querySelector('#createInvoiceModal .modal-dialog');
        if (dialog) {
            if (dialog.classList.contains('modal-fullscreen')) {
                dialog.classList.remove('modal-fullscreen');
                dialog.classList.add('modal-xl');
                dialog.style.maxWidth = '95vw';
            } else {
                dialog.classList.remove('modal-xl');
                dialog.classList.add('modal-fullscreen');
                dialog.style.maxWidth = '100vw';
            }
        }
    },

    toggleDispatchDetails() {
        const checkbox = document.getElementById('dispatchDetails');
        const section = document.getElementById('dispatchSection');
        if (checkbox && section) {
            section.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    addItemRow(data = null) {
        const tbody = document.getElementById('invoiceItemsBody');
        if (!tbody) return;
        const row = document.createElement('tr');
        
        // Correctly read the type input which contains the actual invoice type
        const typeInput = document.querySelector('#createInvoiceForm [name="type"]');
        const isGST = typeInput ? (typeof InvoiceManager !== 'undefined' && InvoiceManager.isGSTType
            ? InvoiceManager.isGSTType(typeInput.value)
            : (String(typeInput.value).includes('gst') && !String(typeInput.value).includes('non'))) : false;
        
        row.innerHTML = `
            <td class="ps-3 py-2">
                <input type="text" name="item[]" list="invItemList" class="bk-form-control w-100 highlight-input" 
                    value="${data ? (data.name || data.description || '') : ''}" required onchange="InvoicesUI.onItemSelect(this)">
            </td>
            <td>
                <input type="text" name="desc[]" class="bk-form-control w-100" 
                    value="${data ? (data.description || data.itemDescription || '') : ''}" placeholder="Details">
            </td>
            ${isGST ? `
            <td>
                <input type="text" name="hsn[]" class="bk-form-control w-100 text-center" value="${data ? (data.hsn || '') : ''}">
            </td>
            ` : ''}
            <td>
                <input type="number" name="qty[]" class="bk-form-control w-100 text-center" 
                    value="${data ? (data.quantity || 1) : 1}" min="0.01" step="0.01" oninput="InvoicesUI.calculateRow(this)">
            </td>
            <td>
                <select name="unit[]" class="bk-form-control w-100">
                    <option value="pcs" ${data && data.unit === 'pcs' ? 'selected' : ''}>pcs</option>
                    <option value="set" ${data && data.unit === 'set' ? 'selected' : ''}>set</option>
                    <option value="nos" ${data && data.unit === 'nos' ? 'selected' : ''}>nos</option>
                    <option value="kg" ${data && data.unit === 'kg' ? 'selected' : ''}>kg</option>
                    <option value="mtr" ${data && data.unit === 'mtr' ? 'selected' : ''}>mtr</option>
                    <option value="sqft" ${data && data.unit === 'sqft' ? 'selected' : ''}>sqft</option>
                    <option value="service" ${data && data.unit === 'service' ? 'selected' : ''}>svc</option>
                </select>
            </td>
            <td>
                <input type="number" name="rate[]" class="bk-form-control w-100 text-end" 
                    value="${data ? data.rate : 0}" step="0.01" oninput="InvoicesUI.calculateRow(this)">
            </td>
            ${isGST ? `
            <td>
                <select name="tax[]" class="bk-form-control w-100" onchange="InvoicesUI.calculateRow(this)">
                    <option value="0" ${data && data.gstRate === 0 ? 'selected' : ''}>0%</option>
                    <option value="5" ${data && data.gstRate === 5 ? 'selected' : ''}>5%</option>
                    <option value="12" ${data && data.gstRate === 12 ? 'selected' : ''}>12%</option>
                    <option value="18" ${data && (data.gstRate === 18 || !data.gstRate) ? 'selected' : 'selected'}>18%</option>
                    <option value="28" ${data && data.gstRate === 28 ? 'selected' : ''}>28%</option>
                </select>
            </td>
            ` : ''}
            <td class="text-end pe-3 fw-bold text-info align-middle">
                <span class="row-amount">${data ? (data.quantity * data.rate).toFixed(2) : '0.00'}</span>
                <input type="hidden" name="value[]" value="${data ? (data.quantity * data.rate) : 0}">
            </td>
            <td class="text-center align-middle">
                <button type="button" class="btn btn-link text-danger p-0" onclick="this.closest('tr').remove(); InvoicesUI.calculateTotals()">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        
        if (!data) {
            row.querySelector('input').focus();
        }
        this.calculateTotals();
        this.activateCustomDatalists();
    },

    handleInventorySelect(input, listId = 'invItemList') {
        const val = input.value.trim();
        if (!val) return;

        const list = document.getElementById(listId);
        const option = Array.from(list.options).find(opt => opt.value === val);

        if (option) {
            const data = {
                name: val,
                rate: parseFloat(option.dataset.rate) || 0,
                unit: option.dataset.unit || 'pcs',
                hsn: option.dataset.hsn || '',
                gstRate: parseFloat(option.dataset.gst) || 18
            };
            this.addItemRow(data);
            input.value = ''; // Clear search input
        }
    },

    onCustomerSelect(input) {
        const val = (input.value || '').trim();
        const list = document.getElementById('invCustomerList');
        let option = list ? Array.from(list.options).find(opt => opt.value === val) : null;
        if (!option && val && list) {
            option = Array.from(list.options).find(opt => opt.value && opt.value.toLowerCase() === val.toLowerCase());
            if (option) input.value = option.value;
        }
        const customers = DataManager.getData('customers') || [];
        const infoDiv = document.getElementById('customerDetailsInfo');
        const form = document.getElementById('createInvoiceForm');
        const panel = document.getElementById('partyBillingDetails');
        const gstEl = document.getElementById('partyGstDisplay');
        const addrEl = document.getElementById('partyAddrDisplay');

        if (option) {
            let id = option.getAttribute('data-id');
            let address = option.getAttribute('data-address') || '';
            let gstin = option.getAttribute('data-gst') || '';
            const full = id ? customers.find(c => c.id === id) : customers.find(c => (c.name || '').trim().toLowerCase() === val.toLowerCase());
            if (full) {
                id = full.id;
                address = full.address || address;
                gstin = full.gstin || gstin;
            }

            const idField = document.querySelector('#createInvoiceForm input[name="customerId"]');
            if (idField) idField.value = (id && id !== 'undefined') ? id : '';
            const hAddress = form?.querySelector('[name="customerAddress"]');
            if (hAddress) hAddress.value = address || '';

            const poField = form?.querySelector('[name="poNumber"]');
            if (poField && full && full.customerDCNumber) {
                poField.value = full.customerDCNumber;
            } else if (poField && option.getAttribute('data-dc-number')) {
                poField.value = option.getAttribute('data-dc-number');
            }

            if (infoDiv) {
                infoDiv.innerHTML = `<span class="text-info"><i class="bi bi-check2-circle"></i> ${(full || {}).name || val}</span>`;
            }
            if (panel) panel.style.display = 'block';
            if (gstEl) gstEl.textContent = gstin || '—';
            if (addrEl) addrEl.textContent = address || '—';

            const shipSame = document.getElementById('shipSameAsBilling');
            const shipTa = form?.querySelector('[name="shipToAddress"]');
            if (shipSame && shipSame.checked && shipTa) shipTa.value = '';

            this._applyAutoTaxSupplyFromParty();
        } else {
            if (infoDiv) infoDiv.innerHTML = '';
            if (panel) panel.style.display = 'none';
            if (gstEl) gstEl.textContent = '—';
            if (addrEl) addrEl.textContent = '—';
            const hidField = form?.querySelector('input[name="customerId"]');
            if (hidField) hidField.value = '';
        }
    },

    onItemSelect(input) {
        const val = input.value;
        const list = document.getElementById('invItemList');
        const option = Array.from(list.options).find(opt => opt.value === val);

        if (option) {
            const row = input.closest('tr');
            
            const typeInput = document.querySelector('#createInvoiceForm [name="type"]');
            const isGST = typeInput ? typeInput.value.includes('gst') : false;

            row.querySelector('[name="rate[]"]').value = option.dataset.rate || 0;
            row.querySelector('[name="unit[]"]').value = option.dataset.unit || 'pcs';
            
            if (isGST) {
                const hsnField = row.querySelector('[name="hsn[]"]');
                const taxSelect = row.querySelector('[name="tax[]"]');
                if (hsnField) hsnField.value = option.dataset.hsn || '';
                if (taxSelect && option.dataset.gst) {
                    const match = option.dataset.gst.match(/(\d+)/);
                    if (match) taxSelect.value = match[0];
                }
            }
            this.calculateRow(input);
        }
    },

    calculateRow(element) {
        const row = element.closest('tr');
        const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
        const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;
        const amount = qty * rate;

        const amountSpan = row.querySelector('.row-amount');
        const amountInput = row.querySelector('[name="value[]"]');
        
        if (amountSpan) amountSpan.textContent = amount.toFixed(2);
        if (amountInput) amountInput.value = amount;

        this.calculateTotals();
    },

    calculateTotals() {
        const rows = document.querySelectorAll('#invoiceItemsBody tr');
        
        const typeInput = document.querySelector('#createInvoiceForm [name="type"]');
        const isGST = typeInput ? (typeof InvoiceManager !== 'undefined' && InvoiceManager.isGSTType
            ? InvoiceManager.isGSTType(typeInput.value)
            : (String(typeInput.value).includes('gst') && !String(typeInput.value).includes('non'))) : false;
        
        let subTotal = 0;
        let taxTotal = 0;

        rows.forEach(row => {
            const val = parseFloat(row.querySelector('[name="value[]"]')?.value) || 0;
            subTotal += val;

            if (isGST) {
                const taxRate = parseFloat(row.querySelector('[name="tax[]"]')?.value) || 0;
                taxTotal += (val * taxRate / 100);
            }
        });

        const roundOff = parseFloat(document.getElementById('roundOff')?.value) || 0;
        const otherToggle = document.getElementById('otherChargesToggle');
        const otherEl = document.querySelector('#createInvoiceForm [name="otherChargesAmount"]');
        const other = (otherToggle && otherToggle.checked && otherEl)
            ? (parseFloat(otherEl.value) || 0)
            : 0;
        const otherDisp = document.getElementById('otherChargesDisplay');
        if (otherDisp) otherDisp.textContent = other.toFixed(2);
        const grandTotal = Math.round(subTotal + taxTotal + roundOff + other);

        const subTotalEl = document.getElementById('subTotal');
        const totalAmountEl = document.getElementById('totalAmountDisplay');

        if (subTotalEl) subTotalEl.textContent = subTotal.toFixed(2);
        
        if (isGST) {
            const interstate = document.querySelector('#createInvoiceForm input[name="taxSupplyType"]:checked')?.value === 'interstate';
            const cgstBlock = document.getElementById('gtesCgstSgstFooter');
            const igstBlock = document.getElementById('gtesIgstFooter');
            const igstEl = document.getElementById('igstTotalDisplay');
            const cgstEl = document.getElementById('cgstTotal');
            const sgstEl = document.getElementById('sgstTotal');
            if (interstate) {
                if (cgstBlock) cgstBlock.classList.add('d-none');
                if (igstBlock) igstBlock.classList.remove('d-none');
                if (igstEl) igstEl.textContent = taxTotal.toFixed(2);
                if (cgstEl) cgstEl.textContent = '0.00';
                if (sgstEl) sgstEl.textContent = '0.00';
            } else {
                if (cgstBlock) cgstBlock.classList.remove('d-none');
                if (igstBlock) igstBlock.classList.add('d-none');
                if (cgstEl) cgstEl.textContent = (taxTotal / 2).toFixed(2);
                if (sgstEl) sgstEl.textContent = (taxTotal / 2).toFixed(2);
                if (igstEl) igstEl.textContent = '0.00';
            }
        }

        if (totalAmountEl) totalAmountEl.textContent = grandTotal.toFixed(2);
    },

    async saveInvoice(e) {
        if (e) e.preventDefault();

        // Prevent duplicate creation on double-click / repeated submit
        if (this._saveInvoiceInProgress) return;
        this._saveInvoiceInProgress = true;
        const saveBtn = document.querySelector('#createInvoiceModal .btn-primary[onclick*="saveInvoice"], #createInvoiceForm button[type="submit"]');
        if (saveBtn) saveBtn.disabled = true;
        
        const form = document.getElementById('createInvoiceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            this._saveInvoiceInProgress = false;
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        const nameInpSync = form.querySelector('[name="customerName"]');
        if (nameInpSync) this.onCustomerSelect(nameInpSync);
        const formData = new FormData(form);
        const type = formData.get('type') || '';
        const isGST = (typeof InvoiceManager !== 'undefined' && InvoiceManager.isGSTType)
            ? InvoiceManager.isGSTType(type)
            : (String(type).includes('gst') && !String(type).includes('non'));

        const party = this.assertResolvedPartyOrAbort(formData, { saveBtn });
        if (!party) {
            this._saveInvoiceInProgress = false;
            if (saveBtn) saveBtn.disabled = false;
            return;
        }

        const items = [];
        const total = parseFloat(document.getElementById('totalAmountDisplay').textContent);

        form.querySelectorAll('tbody tr').forEach(row => {
            const nameInput = row.querySelector('[name="item[]"]');
            if (!nameInput) return;
            const name = nameInput.value;
            const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
            const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;

            if (name && qty > 0) {
                const finalAmt = parseFloat(row.querySelector('[name="value[]"]').value) || (qty * rate);
                const hsn = row.querySelector('[name="hsn[]"]')?.value || '';
                const taxSelect = row.querySelector('[name="tax[]"]');
                const gst = taxSelect ? parseFloat(taxSelect.value) : 0;

                items.push({
                    name: name,
                    description: row.querySelector('[name="desc[]"]').value,
                    hsn: hsn,
                    quantity: qty,
                    unit: row.querySelector('[name="unit[]"]').value,
                    rate: rate,
                    gstRate: gst,
                    amount: finalAmt
                });
            }
        });

        const interstate = (formData.get('taxSupplyType') || 'local') === 'interstate';
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        if (isGST) {
            if (interstate) {
                igstAmount = parseFloat(document.getElementById('igstTotalDisplay')?.textContent) || 0;
            } else {
                cgstAmount = parseFloat(document.getElementById('cgstTotal')?.textContent) || 0;
                sgstAmount = parseFloat(document.getElementById('sgstTotal')?.textContent) || 0;
            }
        }

        const isPurchaseFlow = String(type).includes('purchase');
        const hId = party.id;
        const acctType = isPurchaseFlow ? 'Supplier' : 'Customer';
        const resolvedPartyId = (typeof CustomerManager !== 'undefined' && CustomerManager.resolvePartyId)
            ? CustomerManager.resolvePartyId({ customerId: hId, customerName: party.name, accountType: acctType })
            : (party.partyId || '');
        const addrFromForm = (formData.get('customerAddress') || '').trim();

        if (isPurchaseFlow) {
            const purchaseData = {
                billNo: formData.get('invoiceNo'),
                date: formData.get('date'),
                dueDate: formData.get('dueDate') || null,
                vendor: party.name,
                vendorName: party.name,
                vendorId: party.id,
                customerId: party.id,
                partyId: resolvedPartyId || '',
                category: 'Purchase Material',
                description: ((formData.get('narration') || '').trim() || 'Purchase'),
                poNumber: formData.get('poNumber') || '',
                supplierBillNo: formData.get('poNumber') || '',
                amount: total,
                total: total,
                subtotal: parseFloat(document.getElementById('subTotal').textContent),
                cgst: cgstAmount,
                sgst: sgstAmount,
                igst: igstAmount,
                roundOff: parseFloat(document.getElementById('roundOff')?.value) || 0,
                items,
                billType: isGST ? 'gst' : 'plain',
                ledgerAccount: (formData.get('ledgerAccount') || '').trim(),
                placeOfSupply: (formData.get('placeOfSupply') || '').trim(),
                taxScheme: (formData.get('taxScheme') || '').trim() || 'DEFAULT',
                taxSupplyType: (formData.get('taxSupplyType') || 'local').trim(),
                narration: (formData.get('narration') || '').trim(),
                dispatchDetails: {
                    via: formData.get('dispatchVia') || '',
                    lrNo: formData.get('lrNo') || '',
                    vehicleNo: formData.get('vehicleNo') || '',
                    date: formData.get('dispatchDate') || ''
                },
                otherCharges: {
                    label: (formData.get('otherChargesLabel') || '').trim(),
                    amount: (document.getElementById('otherChargesToggle')?.checked ? (parseFloat(formData.get('otherChargesAmount')) || 0) : 0)
                },
                shipSameAsBilling: document.getElementById('shipSameAsBilling')?.checked !== false,
                shipToAddress: (document.getElementById('shipSameAsBilling')?.checked ? '' : (formData.get('shipToAddress') || '').trim()),
                includeShipToOnPdf: document.getElementById('shipSameAsBilling')?.checked ? false : (document.getElementById('includeShipToOnPdf')?.checked !== false),
                status: 'pending',
                source: 'local'
            };
            try {
                await ExpenseManager.saveExpense(purchaseData);
                bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal'))?.hide();
                App.showNotification('Purchase recorded successfully.', 'success');
                queueMicrotask(() => {
                    if (App.currentView === 'purchases' && typeof this.updatePurchasesTable === 'function') {
                        this.updatePurchasesTable();
                    }
                });
            } catch (err) {
                console.error(err);
                App.showNotification('Error saving purchase: ' + (err.message || err), 'error');
            } finally {
                this._saveInvoiceInProgress = false;
                if (saveBtn) saveBtn.disabled = false;
            }
            return;
        }

        const invoiceData = {
            id: formData.get('invoiceNo'),
            invoiceNo: formData.get('invoiceNo'), // Also store explicitly for table display
            type: isGST ? 'gst-invoice' : 'non-gst-invoice',
            customerName: party.name,
            customerAddress: addrFromForm || party.address || '',
            customerId: hId,
            partyId: resolvedPartyId || '',
            date: formData.get('date'),
            poNumber: formData.get('poNumber'),
            items: items,
            subtotal: parseFloat(document.getElementById('subTotal').textContent),
            gst: {
                cgst: interstate ? 0 : cgstAmount,
                sgst: interstate ? 0 : sgstAmount,
                igst: interstate ? igstAmount : 0
            },
            total: total,
            roundOff: parseFloat(document.getElementById('roundOff')?.value) || 0,
            narration: formData.get('narration'),
            dispatchDetails: {
                via: formData.get('dispatchVia') || '',
                lrNo: formData.get('lrNo') || '',
                vehicleNo: formData.get('vehicleNo') || '',
                date: formData.get('dispatchDate') || ''
            },
            status: 'pending',
            jobCardId: form.getAttribute('data-source-jc') || null,
            ledgerAccount: (formData.get('ledgerAccount') || '').trim() || null,
            dueDate: formData.get('dueDate') || null,
            placeOfSupply: (formData.get('placeOfSupply') || '').trim() || null,
            taxScheme: (formData.get('taxScheme') || '').trim() || null,
            taxSupplyType: (formData.get('taxSupplyType') || 'local').trim(),
            otherCharges: {
                label: (formData.get('otherChargesLabel') || '').trim(),
                amount: (document.getElementById('otherChargesToggle')?.checked ? (parseFloat(formData.get('otherChargesAmount')) || 0) : 0)
            },
            shipSameAsBilling: document.getElementById('shipSameAsBilling')?.checked !== false,
            shipToAddress: (document.getElementById('shipSameAsBilling')?.checked ? '' : (formData.get('shipToAddress') || '').trim()),
            includeShipToOnPdf: document.getElementById('shipSameAsBilling')?.checked ? false : (document.getElementById('includeShipToOnPdf')?.checked !== false)
        };

        console.log('Saving Invoice:', invoiceData.invoiceNo, invoiceData.id);

        try {
            const invoice = await InvoiceManager.createInvoice(invoiceData);

            // Immediate feedback — do not block on challan sync, PDF, or heavy list refreshes
            bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal'))?.hide();
            if (typeof App !== 'undefined') App.showNotification('Invoice created successfully!', 'success');

            queueMicrotask(() => {
                try {
                    this.updateTable();
                } catch (err) {
                    console.error(err);
                }
            });

            // Challan sync + delivery lists in background (was awaited before and froze the UI)
            if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.createAutoChallanFromInvoice === 'function') {
                void Promise.resolve(DeliveryUI.createAutoChallanFromInvoice(invoice)).catch((err) => {
                    console.error('Auto challan:', err);
                });
            }
            if (typeof App !== 'undefined' && App.currentView === 'challans' && typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.loadHistory === 'function') {
                queueMicrotask(() => {
                    try {
                        DeliveryUI.loadHistory();
                    } catch (err) {
                        console.error(err);
                    }
                });
            }

            if (invoiceData.jobCardId && typeof JobCardManager !== 'undefined') {
                void JobCardManager.updateJobCard(invoiceData.jobCardId, {
                    status: 'dispatched',
                    invoiceId: invoice.id
                }).catch((err) => console.error('Job card update:', err));
            }

            // Open PDF after the next paint so the modal can close first
            requestAnimationFrame(() => {
                setTimeout(() => {
                    try {
                        this.previewInvoice(invoice.id);
                    } catch (err) {
                        console.error(err);
                    }
                }, 50);
            });
        } catch (e) {
            console.error(e);
            if (typeof App !== 'undefined') App.showNotification('Error creating invoice: ' + e.message, 'error');
            else alert('Error creating invoice: ' + e.message);
        } finally {
            this._saveInvoiceInProgress = false;
            if (saveBtn) saveBtn.disabled = false;
        }
    },

    async showEditModal(invoiceId) {
        const invoice = InvoiceManager.getInvoice(invoiceId);
        if (!invoice) { alert('Invoice not found.'); return; }

        // Determine type from stored invoice
        const invoiceType = invoice.type === 'gst-invoice' || invoice.type === 'with-bill' ? 'sales-gst' : 'sales-non-gst';

        // Open the standard create modal (re-uses all existing UI)
        this.showCreateModal(invoiceType);

        // Wait for modal DOM to render (Reduced wait)
        await new Promise(r => setTimeout(r, 100));

        const form = document.getElementById('createInvoiceForm');
        if (!form) return;

        // Update modal title to indicate editing
        const modalTitle = document.querySelector('#createInvoiceModal .modal-title');
        if (modalTitle) modalTitle.innerHTML = `<i class="bi bi-pencil-square me-2"></i>Edit Invoice`;

        // Pre-fill header fields
        const setField = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = val || ''; };
        setField('invoiceNo', invoice.invoiceNo || invoice.id);
        setField('date', invoice.date);
        setField('poNumber', invoice.poNumber);
        setField('customerName', invoice.customerName);
        setField('customerId', invoice.customerId);
        setField('customerAddress', invoice.customerAddress);
        setField('narration', invoice.narration);
        setField('dispatchVia', invoice.dispatchDetails?.via);
        setField('lrNo', invoice.dispatchDetails?.lrNo);
        setField('vehicleNo', invoice.dispatchDetails?.vehicleNo);
        setField('dispatchDate', invoice.dispatchDetails?.date);
        const ledgerSel = form.querySelector('[name="ledgerAccount"]');
        if (ledgerSel && invoice.ledgerAccount && !Array.from(ledgerSel.options).some((o) => o.value === invoice.ledgerAccount)) {
            const opt = document.createElement('option');
            opt.value = invoice.ledgerAccount;
            opt.textContent = invoice.ledgerAccount;
            ledgerSel.appendChild(opt);
        }
        setField('ledgerAccount', invoice.ledgerAccount);
        setField('placeOfSupply', invoice.placeOfSupply);
        const tsSel = form.querySelector('[name="taxScheme"]');
        const tsVal = String(invoice.taxScheme || '').trim();
        if (tsSel && tsVal && !Array.from(tsSel.options).some((o) => o.value === tsVal)) {
            const opt = document.createElement('option');
            opt.value = tsVal;
            opt.textContent = tsVal;
            tsSel.appendChild(opt);
        }
        setField('taxScheme', invoice.taxScheme);
        if (invoice.taxSupplyType === 'interstate') {
            const ir = form.querySelector('#gtesTaxInter');
            if (ir) ir.checked = true;
        } else if (invoice.taxSupplyType === 'local') {
            const lr = form.querySelector('#gtesTaxLocal');
            if (lr) lr.checked = true;
        }
        const oc = invoice.otherCharges;
        if (oc && (oc.amount || 0) > 0) {
            const ot = document.getElementById('otherChargesToggle');
            if (ot) ot.checked = true;
            const ocSel = form.querySelector('select[name="otherChargesLabel"]');
            const lab = String(oc.label || '').trim();
            if (ocSel && lab && !Array.from(ocSel.options).some((o) => o.value === lab)) {
                const opt = document.createElement('option');
                opt.value = lab;
                opt.textContent = lab;
                ocSel.appendChild(opt);
            }
            setField('otherChargesLabel', oc.label);
            setField('otherChargesAmount', oc.amount);
            this.toggleOtherCharges();
        }
        if (invoice.shipToAddress) {
            const ss = document.getElementById('shipSameAsBilling');
            if (ss) ss.checked = false;
            this.onShipSameToggle();
            setField('shipToAddress', invoice.shipToAddress);
        }
        const incPdf = document.getElementById('includeShipToOnPdf');
        if (incPdf) incPdf.checked = invoice.includeShipToOnPdf !== false;
        const nameInpSync = form.querySelector('[name="customerName"]');
        if (nameInpSync) this.onCustomerSelect(nameInpSync);

        // Show customer details info if possible
        if (invoice.customerId) {
            const customers = DataManager.getData('customers') || [];
            const cust = customers.find(c => c.id === invoice.customerId);
            if (cust) {
                const infoEl = document.getElementById('customerDetailsInfo');
                if (infoEl) infoEl.textContent = `${cust.address || ''} | GSTIN: ${cust.gstin || '-'}`;
            }
        }

        // Clear existing item rows and re-add from invoice data
        const tbody = form.querySelector('tbody');
        if (tbody) tbody.innerHTML = '';

        for (const item of (invoice.items || [])) {
            // Optimized: Use the built-in data support in addItemRow to populate immediately
            this.addItemRow(item);
        }

        // Recalculate totals
        this.calculateTotals();

        // Override the form submit to UPDATE instead of create
        form.onsubmit = async (e) => {
            e.preventDefault();
            await this.saveEditedInvoice(invoiceId);
        };

        // Also override the button in the footer
        const saveBtn = document.querySelector('#createInvoiceModal .btn-primary[onclick*="saveInvoice"]');
        if (saveBtn) {
            saveBtn.removeAttribute('onclick');
            saveBtn.onclick = () => this.saveEditedInvoice(invoiceId);
            saveBtn.textContent = 'Update Invoice';
        }
    },

    async saveEditedInvoice(invoiceId) {
        const form = document.getElementById('createInvoiceForm');
        if (!form || !form.checkValidity()) { form?.reportValidity(); return; }

        const formData = new FormData(form);
        const party = this.assertResolvedPartyOrAbort(formData);
        if (!party) return;

        const type = formData.get('type') || '';
        const isGST = (typeof InvoiceManager !== 'undefined' && InvoiceManager.isGSTType)
            ? InvoiceManager.isGSTType(type)
            : (String(type).includes('gst') && !String(type).includes('non'));
        const items = [];
        const total = parseFloat(document.getElementById('totalAmountDisplay')?.textContent) || 0;

        form.querySelectorAll('tbody tr').forEach(row => {
            const nameInput = row.querySelector('[name="item[]"]');
            if (!nameInput) return;
            const name = nameInput.value;
            const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
            const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;
            if (name && qty > 0) {
                const finalAmt = parseFloat(row.querySelector('[name="value[]"]').value) || (qty * rate);
                const taxSelect = row.querySelector('[name="tax[]"]');
                items.push({
                    name,
                    description: row.querySelector('[name="desc[]"]').value,
                    hsn: row.querySelector('[name="hsn[]"]')?.value || '',
                    quantity: qty,
                    unit: row.querySelector('[name="unit[]"]').value,
                    rate,
                    gstRate: taxSelect ? parseFloat(taxSelect.value) : 0,
                    amount: finalAmt
                });
            }
        });

        const interstate = isGST && (formData.get('taxSupplyType') || 'local') === 'interstate';
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        if (isGST) {
            if (interstate) {
                igstAmount = parseFloat(document.getElementById('igstTotalDisplay')?.textContent) || 0;
            } else {
                cgstAmount = parseFloat(document.getElementById('cgstTotal')?.textContent) || 0;
                sgstAmount = parseFloat(document.getElementById('sgstTotal')?.textContent) || 0;
            }
        }

        const addrEd = (formData.get('customerAddress') || '').trim();
        const updates = {
            invoiceNo: formData.get('invoiceNo'),
            date: formData.get('date'),
            customerName: party.name,
            customerId: party.id,
            partyId: (typeof CustomerManager !== 'undefined' && CustomerManager.resolvePartyId)
                ? CustomerManager.resolvePartyId({ customerId: party.id, customerName: party.name, accountType: 'customer' })
                : (party.partyId || ''),
            customerAddress: addrEd || party.address || '',
            poNumber: formData.get('poNumber'),
            narration: formData.get('narration'),
            ledgerAccount: (formData.get('ledgerAccount') || '').trim() || null,
            placeOfSupply: (formData.get('placeOfSupply') || '').trim() || null,
            taxScheme: (formData.get('taxScheme') || '').trim() || null,
            taxSupplyType: (formData.get('taxSupplyType') || 'local').trim(),
            dispatchDetails: {
                via: formData.get('dispatchVia') || '',
                lrNo: formData.get('lrNo') || '',
                vehicleNo: formData.get('vehicleNo') || '',
                date: formData.get('dispatchDate') || ''
            },
            otherCharges: {
                label: (formData.get('otherChargesLabel') || '').trim(),
                amount: (document.getElementById('otherChargesToggle')?.checked ? (parseFloat(formData.get('otherChargesAmount')) || 0) : 0)
            },
            shipSameAsBilling: document.getElementById('shipSameAsBilling')?.checked !== false,
            shipToAddress: (document.getElementById('shipSameAsBilling')?.checked ? '' : (formData.get('shipToAddress') || '').trim()),
            includeShipToOnPdf: document.getElementById('shipSameAsBilling')?.checked ? false : (document.getElementById('includeShipToOnPdf')?.checked !== false),
            items,
            subtotal: parseFloat(document.getElementById('subTotal')?.textContent) || 0,
            gst: {
                cgst: interstate ? 0 : cgstAmount,
                sgst: interstate ? 0 : sgstAmount,
                igst: interstate ? igstAmount : 0
            },
            total,
        };

        console.log('Updating Invoice:', invoiceId, 'to new No:', updates.invoiceNo);

        try {
            const updatedInvoice = await InvoiceManager.updateInvoice(invoiceId, updates);

            if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.createAutoChallanFromInvoice === 'function') {
                void Promise.resolve(DeliveryUI.createAutoChallanFromInvoice(updatedInvoice)).catch((err) => console.error('Auto challan:', err));
            }

            bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal'))?.hide();
            if (typeof App !== 'undefined') App.showNotification('Invoice updated successfully!', 'success');

            queueMicrotask(() => {
                try {
                    this.updateTable();
                } catch (err) {
                    console.error(err);
                }
            });

            if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.loadInvoices === 'function') {
                queueMicrotask(() => {
                    try {
                        DeliveryUI.loadInvoices();
                    } catch (err) {
                        console.error(err);
                    }
                });
            }

            requestAnimationFrame(() => {
                setTimeout(() => {
                    try {
                        this.previewInvoice(invoiceId);
                    } catch (err) {
                        console.error(err);
                    }
                }, 50);
            });
        } catch (e) {
            console.error(e);
            if (typeof App !== 'undefined') App.showNotification('Error updating invoice: ' + e.message, 'error');
            else alert('Error updating invoice: ' + e.message);
        }
    },

    async getInvoiceElement(invoiceId) {
        const invoice = (DataManager.getData('invoices') || []).find(i => i.id === invoiceId);
        if (!invoice) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const company = {
            name: settings.companyName || DataManager.COMPANY_PROFILE.name,
            address: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
            workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
            gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
            pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
            iec: settings.iec || DataManager.COMPANY_PROFILE.iec,
            emails: settings.emails || DataManager.COMPANY_PROFILE.emails,
            phones: settings.phones || DataManager.COMPANY_PROFILE.phones,
            bank: settings.bankDetails || DataManager.COMPANY_PROFILE.bankDetails
        };

        // Fetch customer details or use imported ones
        const customer = CustomerManager.getCustomer(invoice.customerId) || {
            name: invoice.customerName,
            address: invoice.customerAddress || '',
            gstin: invoice.customerGstin || '',
            pan: invoice.customerPan || ''
        };

        const pdfW = (typeof DeliveryUI !== 'undefined' && DeliveryUI.GTES_PDF_DOCUMENT_WIDTH_PX) || 760;
        const element = document.createElement('div');
        element.className = 'gtes-pdf-document';
        element.style.width = `${pdfW}px`;
        element.style.padding = '14px';
        element.style.background = 'white';
        element.style.color = '#000';
        element.style.fontFamily = 'Arial, Helvetica, "Liberation Sans", sans-serif';

        const isPlainPdf = invoice.type === 'non-gst-invoice' || invoice.type === 'without-bill';
        const isGstPdf = !isPlainPdf && (invoice.billType === 'gst' || invoice.type === 'with-bill' || invoice.type === 'gst-invoice' || invoice.type === 'sales-gst');
        const isInterstateGst = isGstPdf && this._isInterstateSalesGst(invoice, customer, company.gstin);

        // Fetch Master Data for real-time HSN/Unit/Description lookup
        const masterInventory = DataManager.getData(DataManager.KEYS.INVENTORY) || [];
        const masterServices = DataManager.getData(DataManager.KEYS.SERVICES || 'gtes_services') || [];
        const allMasterItems = [...masterInventory, ...masterServices];

        const thBase = 'padding: 8px; border: 1px solid #64748b;';
        const theadStyle = 'background: #4a5568; color: #fff; font-size: 10px; text-transform: uppercase; text-align: center;';

        const itemsHtml = invoice.items.map((item, idx) => {
            const details = this.getItemDisplayDetails(item, allMasterItems, isPlainPdf);
            const nm = this.escapePdfHtml(item.name);
            const ds = details.displayDesc ? this.escapePdfHtml(details.displayDesc) : '';
            const qtyCell = `${details.qty}${details.unit !== 'nos' ? ' ' + this.escapePdfHtml(details.unit) : ''}`;
            const cell = 'padding: 5px 6px; border: 1px solid #000; font-size: 10px;';

            if (isPlainPdf || details.isPlain) {
                return `
                <tr style="page-break-inside: avoid;">
                    <td style="${cell} text-align: center;">${idx + 1}</td>
                    <td style="${cell} vertical-align: top;">
                        <div style="font-weight: 700;">${nm}</div>
                        ${ds ? `<div style="font-size: 9px; font-style: italic; color: #222; margin-top: 3px; line-height: 1.35; white-space: pre-line;">${ds}</div>` : ''}
                    </td>
                    <td style="${cell} text-align: center; word-break: break-all; max-width: 88px;">${this.escapePdfHtml(details.hsn)}</td>
                    <td style="${cell} text-align: center;">${qtyCell}</td>
                    <td style="${cell} text-align: right;">${details.rate.toFixed(2)}</td>
                    <td style="${cell} text-align: center;">${this.escapePdfHtml(details.unit)}</td>
                    <td style="${cell} text-align: right;">${item.discount || 0}%</td>
                    <td style="${cell} text-align: right; font-weight: 700;">${details.amount.toFixed(2)}</td>
                </tr>`;
            }
            if (isInterstateGst) {
                const { igstA, igstR } = this._resolveInterstateLineIgst(item, details);
                return `
                <tr style="page-break-inside: avoid;">
                    <td style="${cell} text-align: center;">${idx + 1}</td>
                    <td style="${cell} vertical-align: top;">
                        <div style="font-weight: 700;">${nm}</div>
                        ${ds ? `<div style="font-size: 9px; font-style: italic; color: #222; margin-top: 3px; line-height: 1.35; white-space: pre-line;">${ds}</div>` : ''}
                    </td>
                    <td style="${cell} text-align: center; word-break: break-all; max-width: 88px;">${this.escapePdfHtml(details.hsn)}</td>
                    <td style="${cell} text-align: center;">${qtyCell}</td>
                    <td style="${cell} text-align: right;">${details.rate.toFixed(2)}</td>
                    <td style="${cell} text-align: center;">${this.escapePdfHtml(details.unit)}</td>
                    <td style="${cell} text-align: right;">${item.discount || 0}%</td>
                    <td style="${cell} text-align: right;">${igstR.toFixed(1)}%</td>
                    <td style="${cell} text-align: right;">${igstA.toFixed(2)}</td>
                    <td style="${cell} text-align: right; font-weight: 700;">${details.amount.toFixed(2)}</td>
                </tr>`;
            }
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
            return `
                <tr style="page-break-inside: avoid;">
                    <td style="${cell} text-align: center;">${idx + 1}</td>
                    <td style="${cell} vertical-align: top;">
                        <div style="font-weight: 700;">${nm}</div>
                        ${ds ? `<div style="font-size: 9px; font-style: italic; color: #222; margin-top: 3px; line-height: 1.35; white-space: pre-line;">${ds}</div>` : ''}
                    </td>
                    <td style="${cell} text-align: center; word-break: break-all; max-width: 88px;">${this.escapePdfHtml(details.hsn)}</td>
                    <td style="${cell} text-align: center;">${qtyCell}</td>
                    <td style="${cell} text-align: right;">${details.rate.toFixed(2)}</td>
                    <td style="${cell} text-align: center;">${this.escapePdfHtml(details.unit)}</td>
                    <td style="${cell} text-align: right;">${item.discount || 0}%</td>
                    <td style="${cell} text-align: right;">${cgstR.toFixed(1)}%</td>
                    <td style="${cell} text-align: right;">${cgstA.toFixed(2)}</td>
                    <td style="${cell} text-align: right;">${sgstR.toFixed(1)}%</td>
                    <td style="${cell} text-align: right;">${sgstA.toFixed(2)}</td>
                    <td style="${cell} text-align: right; font-weight: 700;">${details.amount.toFixed(2)}</td>
                </tr>`;
        }).join('');

        const totalQty = invoice.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        const subtotal = invoice.subtotal || invoice.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        if (isInterstateGst) {
            const inter = this._accumulateInterstateSalesPdfFooterTaxes(invoice.items || [], allMasterItems);
            igstAmount = inter.igst;
            if (!(invoice.items || []).length && invoice.gst) {
                igstAmount = parseFloat(invoice.gst.igst) || 0;
                if (igstAmount < 0.01) {
                    igstAmount = (parseFloat(invoice.gst.cgst) || 0) + (parseFloat(invoice.gst.sgst) || 0);
                }
            }
        } else {
            const taxSum = this._accumulatePurchasePdfFooterTaxes(invoice.items || [], allMasterItems);
            cgstAmount = taxSum.cgst;
            sgstAmount = taxSum.sgst;
            igstAmount = taxSum.igst;
            if (!(invoice.items || []).length && invoice.gst) {
                cgstAmount = parseFloat(invoice.gst.cgst) || 0;
                sgstAmount = parseFloat(invoice.gst.sgst) || 0;
                igstAmount = parseFloat(invoice.gst.igst) || 0;
            }
        }

        const roundOff = invoice.roundOff !== undefined ? invoice.roundOff : 0;
        const total = invoice.total != null ? invoice.total : (subtotal + cgstAmount + sgstAmount + igstAmount + roundOff);

        const payStatus = (invoice.status || 'pending').toUpperCase();
        const payColor = invoice.status === 'paid' ? '#27ae60' : '#e67e22';
        const upiId = settings.upiId || '';
        const qrUrl = upiId ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(company.name)}&am=${total}&cu=INR`)}` : '';

        const isCreditNote = this._isCreditNoteSalesDoc(invoice);
        const isDcDoc = typeof InvoiceManager !== 'undefined' && InvoiceManager.isDcStyleSalesInvoice(invoice);
        const docTitle = isCreditNote ? 'Credit Note / Sales Return' : (isDcDoc ? 'Delivery Challan' : (isPlainPdf ? 'Invoice' : 'Tax Invoice'));
        const docNoLabel = isCreditNote ? 'Credit Note No' : (isDcDoc ? 'Delivery Challan No' : 'Invoice No');
        const shipToAddr = (invoice.shipToAddress || '').trim();
        const showShipToPdf = !!shipToAddr && invoice.includeShipToOnPdf !== false;
        const detailsRightTitle = isDcDoc ? 'Challan Details' : 'Invoice Details';
        const salesRefNo = this._inferSalesReferenceNo(invoice);
        const emailLine = [company.emails].flat().filter(Boolean).join(', ') || '';
        const phoneLine = [company.phones].flat().filter(Boolean).join(', ') || '';

        const gstTableHead = isGstPdf ? (isInterstateGst ? `
                    <tr style="${theadStyle}">
                        <th style="${thBase}">#</th>
                        <th style="${thBase} text-align: left;">Description</th>
                        <th style="${thBase}">HSN</th>
                        <th style="${thBase}">Qty</th>
                        <th style="${thBase}">Rate</th>
                        <th style="${thBase}">Per</th>
                        <th style="${thBase}">Disc</th>
                        <th style="${thBase}">IGST Rate</th>
                        <th style="${thBase}">IGST Amt</th>
                        <th style="${thBase}">Amount</th>
                    </tr>` : `
                    <tr style="${theadStyle}">
                        <th rowspan="2" style="${thBase} vertical-align: middle;">#</th>
                        <th rowspan="2" style="${thBase} text-align: left;">Description</th>
                        <th rowspan="2" style="${thBase}">HSN</th>
                        <th rowspan="2" style="${thBase}">Qty</th>
                        <th rowspan="2" style="${thBase}">Rate</th>
                        <th rowspan="2" style="${thBase}">Per</th>
                        <th rowspan="2" style="${thBase}">Disc</th>
                        <th colspan="2" style="${thBase}">CGST</th>
                        <th colspan="2" style="${thBase}">SGST</th>
                        <th rowspan="2" style="${thBase}">Amount</th>
                    </tr>
                    <tr style="${theadStyle}">
                        <th style="${thBase}">%</th>
                        <th style="${thBase}">Amt</th>
                        <th style="${thBase}">%</th>
                        <th style="${thBase}">Amt</th>
                    </tr>`) : `
                    <tr style="${theadStyle}">
                        <th style="${thBase}">#</th>
                        <th style="${thBase} text-align: left;">Description</th>
                        <th style="${thBase}">HSN</th>
                        <th style="${thBase}">Qty</th>
                        <th style="${thBase}">Rate</th>
                        <th style="${thBase}">Per</th>
                        <th style="${thBase}">Disc</th>
                        <th style="${thBase}">Amount</th>
                    </tr>`;

        const summaryBox = isGstPdf ? (isInterstateGst ? `
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: #f1f3f5;">
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">Subtotal</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right; font-weight: 600; min-width: 100px;">₹${subtotal.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">IGST Total</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right;">₹${igstAmount.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">Round Off</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right;">${roundOff.toFixed(2)}</td></tr>
                        <tr><td colspan="2" style="padding: 10px 8px 8px; background: #dfe3e8;">
                            <table style="width: 100%; border-collapse: collapse; background: #fff; border: 2px solid #111;">
                                <tr style="font-weight: bold; font-size: 17px;">
                                    <td style="padding: 10px 8px; text-align: right;">Total Amount</td>
                                    <td style="padding: 10px 12px 10px 8px; text-align: right;">₹${total.toFixed(2)}</td>
                                </tr>
                            </table>
                        </td></tr>
                    </table>` : `
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: #f1f3f5;">
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">Subtotal</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right; font-weight: 600; min-width: 100px;">₹${subtotal.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">CGST Total</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right;">₹${cgstAmount.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">SGST Total</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right;">₹${sgstAmount.toFixed(2)}</td></tr>
                        ${igstAmount > 0 ? `<tr><td style="padding: 6px 8px; text-align: right; color: #334155;">IGST Total</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right;">₹${igstAmount.toFixed(2)}</td></tr>` : ''}
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">Round Off</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right;">${roundOff.toFixed(2)}</td></tr>
                        <tr><td colspan="2" style="padding: 10px 8px 8px; background: #dfe3e8;">
                            <table style="width: 100%; border-collapse: collapse; background: #fff; border: 2px solid #111;">
                                <tr style="font-weight: bold; font-size: 17px;">
                                    <td style="padding: 10px 8px; text-align: right;">Total Amount</td>
                                    <td style="padding: 10px 12px 10px 8px; text-align: right;">₹${total.toFixed(2)}</td>
                                </tr>
                            </table>
                        </td></tr>
                    </table>`) : `
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: #f1f3f5;">
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">Subtotal</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right; font-weight: 600; min-width: 100px;">₹${subtotal.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 8px; text-align: right; color: #334155;">Round Off</td>
                            <td style="padding: 6px 10px 6px 8px; text-align: right;">${roundOff.toFixed(2)}</td></tr>
                        <tr><td colspan="2" style="padding: 10px 8px 8px; background: #dfe3e8;">
                            <table style="width: 100%; border-collapse: collapse; background: #fff; border: 2px solid #111;">
                                <tr style="font-weight: bold; font-size: 17px;">
                                    <td style="padding: 10px 8px; text-align: right;">Total Amount</td>
                                    <td style="padding: 10px 12px 10px 8px; text-align: right;">₹${total.toFixed(2)}</td>
                                </tr>
                            </table>
                        </td></tr>
                    </table>`;

        const taxLeftBlock = isGstPdf ? (isInterstateGst ? `
                    <div style="margin-bottom: 6px;"><strong>IGST Amt:</strong> ${igstAmount.toFixed(2)}</div>
                    <div style="margin-bottom: 12px;"><strong>Total Tax:</strong> ${igstAmount.toFixed(2)}</div>
                    <div style="font-size: 10px; color: #666; font-style: italic; line-height: 1.4;">Total Qty: ${totalQty.toFixed(2)}</div>` : `
                    <div style="margin-bottom: 6px;"><strong>CGST Amt:</strong> ${cgstAmount.toFixed(2)}</div>
                    <div style="margin-bottom: 6px;"><strong>SGST Amt:</strong> ${sgstAmount.toFixed(2)}</div>
                    ${igstAmount > 0 ? `<div style="margin-bottom: 6px;"><strong>IGST Amt:</strong> ${igstAmount.toFixed(2)}</div>` : ''}
                    <div style="margin-bottom: 12px;"><strong>Total Tax:</strong> ${(cgstAmount + sgstAmount + igstAmount).toFixed(2)}</div>
                    <div style="font-size: 10px; color: #666; font-style: italic; line-height: 1.4;">Total Qty: ${totalQty.toFixed(2)}</div>`) : `
                    <div style="font-size: 10px; color: #666; font-style: italic; line-height: 1.4;">Total Qty: ${totalQty.toFixed(2)}</div>`;

        element.innerHTML = `
            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: collapse; margin: 0 0 16px 0; border-bottom: 2px solid #000;">
                <tr>
                    <td style="width: 62%; vertical-align: top; padding: 0 12px 12px 0;">
                        <h1 style="margin: 0; color: #000; font-size: 24px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase;">${this.escapePdfHtml(company.name)}</h1>
                        <div style="font-size: 10px; color: #222; margin-top: 6px; line-height: 1.45;">
                            ${this.escapePdfHtml(company.address)}<br>
                            <strong>Work:</strong> ${this.escapePdfHtml(company.workAddress)}<br>
                            ${emailLine ? `Email: ${this.escapePdfHtml(emailLine)}<br>` : ''}
                            ${phoneLine ? `Ph: ${this.escapePdfHtml(phoneLine)}<br>` : ''}
                            <strong>GSTIN:</strong> ${this.escapePdfHtml(company.gstin)} | <strong>PAN:</strong> ${this.escapePdfHtml(company.pan)}
                            ${company.iec ? ` | <strong>IEC:</strong> ${this.escapePdfHtml(company.iec)}` : ''}
                        </div>
                    </td>
                    <td style="width: 38%; vertical-align: top; text-align: right; padding: 0 0 12px 0;">
                        <div style="font-size: 18px; font-weight: 800; color: #000; text-transform: uppercase; margin-bottom: 8px;">${docTitle}</div>
                        <div style="font-size: 10px; color: #222; line-height: 1.5;">
                            <strong>${docNoLabel}:</strong> ${this.escapePdfHtml(invoice.invoiceNo || invoice.id)}<br>
                            <strong>Date:</strong> ${this.escapePdfHtml(invoice.date)}
                        </div>
                    </td>
                </tr>
            </table>

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px;">
                <tr>
                    <td style="width: 50%; vertical-align: top; padding: 0 7px 0 0;">
                        <div style="border: 1px solid #000; padding: 10px; height: 100%;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">Details of Receiver (Billed To)</div>
                            <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: #111;">${this.escapePdfHtml(customer.name)}</div>
                            <div style="font-size: 10px; line-height: 1.4; white-space: pre-wrap;">${this.escapePdfHtml(customer.address)}</div>
                            ${customer.gstin ? `<div style="font-size: 10px; margin-top: 6px;"><strong>GSTIN:</strong> ${this.escapePdfHtml(customer.gstin)}</div>` : ''}
                        </div>
                    </td>
                    <td style="width: 50%; vertical-align: top; padding: 0 0 0 7px;">
                        <div style="border: 1px solid #000; padding: 10px; height: 100%;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">${detailsRightTitle}</div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; width: 110px; color: #444;">PO / Ref No:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(invoice.poNumber || '-')}</strong></td></tr>
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Sales Invoice Ref:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(salesRefNo)}</strong></td></tr>
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Vehicle No:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(invoice.dispatchDetails?.vehicleNo || '-')}</strong></td></tr>
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">LR / WayBill:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(invoice.dispatchDetails?.lrNo || '-')}</strong></td></tr>
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Dispatch Via:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(invoice.dispatchDetails?.via || '-')}</strong></td></tr>
                                ${isCreditNote
                ? `<tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Return Status:</td><td style="padding: 2px 0; vertical-align: top;"><strong style="color: #334155;">POSTED</strong></td></tr>`
                : `<tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Payment Status:</td><td style="padding: 2px 0; vertical-align: top;"><strong style="color: ${payColor};">${payStatus}</strong></td></tr>`}
                            </table>
                        </div>
                    </td>
                </tr>
            </table>

            ${showShipToPdf ? `
            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px;">
                <tr>
                    <td style="width: 100%; vertical-align: top; padding: 0;">
                        <div style="border: 1px solid #000; padding: 10px;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">Details of Consignee (Shipped To)</div>
                            <div style="font-size: 10px; line-height: 1.4; white-space: pre-wrap;">${this.escapePdfHtml(shipToAddr)}</div>
                            ${invoice.shipToGstin ? `<div style="font-size: 10px; margin-top: 6px;"><strong>GSTIN:</strong> ${this.escapePdfHtml(invoice.shipToGstin)}</div>` : ''}
                        </div>
                    </td>
                </tr>
            </table>` : ''}

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #000; table-layout: auto;">
                <thead>${gstTableHead}</thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 0;">
                <tr>
                    <td style="width: 50%; vertical-align: top; padding: 0 8px 0 0; font-size: 11px;">
                        ${taxLeftBlock}
                        <div style="margin-top: 16px; font-size: 10px; line-height: 1.45;">
                            <strong>Terms &amp; Conditions:</strong><br>
                            1. Goods once sold will not be taken back.<br>
                            2. Subject to Chennai Jurisdiction.
                        </div>
                        <div style="margin-top: 12px; font-size: 10px; color: #666; font-style: italic; line-height: 1.4;">
                            ${isDcDoc
                ? 'We declare that this delivery challan shows the actual quantity and description of goods and that all particulars are true and correct.'
                : 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'}
                        </div>
                        ${invoice.narration ? `
                        <div style="margin-top: 12px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px;">
                            <span style="text-transform: uppercase; font-size: 9px; font-weight: bold; color: #64748b;">Narration</span><br>
                            <span style="font-size: 10px; color: #111;">${this.escapePdfHtml(invoice.narration)}</span>
                        </div>` : ''}
                        <div style="margin-top: 10px; font-size: 10px; color: #333; font-style: italic;">Amount in Words: ${this.numberToWords(total)} Only</div>
                        <div style="margin-top: 8px; font-size: 10px; color: #111;">
                            <strong>Ledger Effect:</strong>
                            ${isCreditNote
                ? `Credit (Customer A/c) ₹${Math.abs(total).toFixed(2)}`
                : `Debit (Customer A/c) ₹${Math.abs(total).toFixed(2)}`}
                        </div>
                        ${qrUrl ? `
                        <table style="margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa; border-collapse: collapse;"><tr>
                            <td style="padding: 8px; vertical-align: middle;"><img src="${qrUrl}" alt="UPI" style="width: 72px; height: 72px; display: block;" /></td>
                            <td style="padding: 8px 12px 8px 0; vertical-align: middle;">
                                <div style="font-size: 9px; font-weight: bold; text-transform: uppercase;">Pay via UPI</div>
                                <div style="font-size: 10px; font-weight: bold;">${this.escapePdfHtml(upiId)}</div>
                            </td>
                        </tr></table>` : ''}
                        <div style="margin-top: 14px; font-size: 10px;">
                            <strong>Bank:</strong> ${this.escapePdfHtml(company.bank?.bankName || '-')}
                            &nbsp;|&nbsp; <strong>A/c:</strong> ${this.escapePdfHtml(company.bank?.accountNo || '-')}
                            &nbsp;|&nbsp; <strong>IFSC:</strong> ${this.escapePdfHtml(company.bank?.ifsc || '-')}
                        </div>
                    </td>
                    <td style="width: 50%; vertical-align: top; padding: 0 0 0 8px;">
                        <div style="border: 1px solid #ddd; border-radius: 4px; padding: 8px;">
                            ${summaryBox}
                        </div>
                    </td>
                </tr>
            </table>

            <table style="width: 100%; margin-top: 36px; border-collapse: collapse;"><tr><td style="text-align: right;">
                <div style="display: inline-block; text-align: right; width: 280px; max-width: 100%;">
                    <div style="font-size: 11px; margin-bottom: 44px;">For <strong style="font-weight: 800;">${this.escapePdfHtml(company.name)}</strong></div>
                    <div style="border-top: 1px solid #000; padding-top: 8px; text-align: center;">
                        <span style="font-weight: bold; font-size: 12px; text-transform: uppercase;">Authorized Signatory</span>
                    </div>
                </div>
            </td></tr></table>

            <div style="margin-top: 24px; text-align: center; font-size: 9px; color: #64748b; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                ${isDcDoc
            ? 'This is a computer generated delivery challan and does not require a physical signature.'
            : 'This is a computer generated invoice and does not require a physical signature.'}
            </div>
        `;
        return element;
    },

    generatePDF(invoiceId) {
        if (typeof DeliveryUI !== 'undefined' && DeliveryUI.downloadInvoicePdf) {
            void DeliveryUI.downloadInvoicePdf(invoiceId);
        } else if (typeof DeliveryUI !== 'undefined' && DeliveryUI.printInvoice) {
            void DeliveryUI.printInvoice(invoiceId);
        } else {
            App.showNotification('PDF generation not available', 'error');
        }
    },

    previewInvoice(invoiceId) {
        if (typeof DeliveryUI !== 'undefined' && DeliveryUI.viewInvoice) {
            DeliveryUI.viewInvoice(invoiceId);
        } else {
            App.showNotification('Preview not available in this context', 'error');
        }
    },

    getItemDisplayDetails(item, masterList, isPlainInvoice = false) {
        const cleanName = (item.name || '').toLowerCase().trim();
        let masterItem = (masterList || []).find(m => m.name.toLowerCase() === cleanName);
        
        // Fallback: If exact match has no description, try to find a related service with keywords
        if (!masterItem || !(masterItem.description || masterItem.desc || masterItem.details)) {
            const testingKeywords = ['testing', 'inspection', 'calibration', 'hydro', '300 bar', 'high pressure'];
            if (testingKeywords.some(k => cleanName.includes(k))) {
                const related = (masterList || []).find(m => 
                    m.type === 'service' && 
                    (m.name.toLowerCase().includes('testing') || m.name.toLowerCase().includes('cylinder')) &&
                    (m.description || m.desc || m.details)
                );
                if (related && !masterItem) masterItem = related;
                else if (related && masterItem) {
                    // Merge description if possible
                    masterItem = {...masterItem, description: related.description || related.desc || related.details};
                }
            }
        }

        const qty = parseFloat(item.quantity) || 0;
        const rate = parseFloat(item.rate) || 0;
        const amount = parseFloat(item.amount) || (qty * rate);
        const gstRate = parseFloat(item.gstRate?.toString().replace(/[^0-9.]/g, '')) || 0;
        const cgstRate = gstRate / 2;

        const hsn = masterItem?.hsnCode || item.hsn || '-';
        const unit = masterItem?.unit || item.unit || 'nos';

        let displayDesc = '';
        const itemDesc = (item.description || item.desc || item.details || item.itemDescription || '').trim();
        const mstrDesc = (masterItem?.description || masterItem?.desc || masterItem?.details || '').trim();

        if (itemDesc && itemDesc.toLowerCase().trim() !== item.name.toLowerCase().trim()) {
            displayDesc = itemDesc;
        }

        if (mstrDesc && mstrDesc !== 'NA' && mstrDesc.toLowerCase().trim() !== item.name.toLowerCase().trim()) {
            if (!displayDesc) {
                displayDesc = mstrDesc;
            } else if (!displayDesc.toLowerCase().includes(mstrDesc.toLowerCase())) {
                displayDesc += '<br>' + mstrDesc;
            }
        }

        return {
            qty, rate, amount, gstRate, cgstRate, hsn, unit, displayDesc, isPlain: isPlainInvoice
        };
    },

    numberToWords(num) {
        // Placeholder for efficient number to words
        return num.toFixed(2);
    },

    async deleteInvoice(id) {
        if (window.InvoiceManager && window.InvoiceManager.deleteInvoice) {
            const invoice = InvoiceManager.getInvoice(id);
            const linked = (typeof DeliveryManager !== 'undefined')
                ? DeliveryManager.getAllChallans().filter(c => c.invoiceId === id || c.id === invoice?.challanId)
                : [];
            let msg = 'Are you sure you want to delete this invoice?';
            if (linked.length) {
                const ids = linked.map(c => c.id).join(', ');
                msg = `Delete this invoice and ${linked.length} linked challan(s) (${ids})?\n\nThey will be removed from History and View DC, and moved to Recycle Bin.`;
            }
            if (!confirm(msg)) return;
            await InvoiceManager.deleteInvoice(id);
        }
        this.updateTable();
        if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.loadHistory === 'function') {
            try { DeliveryUI.loadHistory(); } catch (e) { /* ignore */ }
        }
    },

    renderPurchasesList() {
        const view = document.getElementById('purchasesView');
        if (!view) return;

        // Fetch purchases for filters
        const purchases = (DataManager.getData(DataManager.KEYS.EXPENSES) || [])
            .filter(p => (p.category || '').toLowerCase().includes('purchase'));

        // Financial Years (April - March)
        const fYears = [...new Set(purchases.map(p => DataManager.getFinancialYear(p.date)))].filter(Boolean).sort().reverse();
        const yearOptions = fYears.map(y => `<option value="${y}">${y}</option>`).join('');

        // Vendors
        const vendors = [...new Set(purchases.map(p => p.vendor).filter(Boolean))].sort();
        const vendorOptions = vendors.map(v => `<option value="${v}">${v}</option>`).join('');

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <h2 class="mb-0"><i class="bi bi-cart-check text-warning me-2"></i> Purchase Bills</h2>
                    <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-success btn-sm" onclick="InvoicesUI.showCreateModal('purchase-gst')">
                            <i class="bi bi-plus-circle me-1"></i> Record purchase
                        </button>
                         <button class="btn btn-outline-light btn-sm" onclick="App.showView('accounting')">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                     </div>
                </div>
                
                <!-- Financial Summary Cards -->
                <div class="row g-3 mb-4">
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary shadow-sm">
                            <div class="card-body p-3 text-center">
                                <div class="text-white-50 fw-bold small text-uppercase mb-1">Total Outstanding</div>
                                <h3 class="mb-0 text-danger" id="summaryPurchasePendingAmount">₹0.00</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary shadow-sm hover-lift" style="cursor: pointer;" role="button" tabindex="0" title="View pending purchase bills" onclick="InvoicesUI.showPurchaseOutstandingModal('bills')" onkeydown="if(event.key==='Enter')InvoicesUI.showPurchaseOutstandingModal('bills')">
                            <div class="card-body p-3 text-center">
                                <div class="text-white-50 fw-bold small text-uppercase mb-1">Pending Bills</div>
                                <h3 class="mb-0 text-warning" id="summaryPurchasePendingBills">0</h3>
                                <div class="text-white-50 extra-small mt-1">Click for details</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary shadow-sm hover-lift" style="cursor: pointer;" role="button" tabindex="0" title="View outstanding by supplier" onclick="InvoicesUI.showPurchaseOutstandingModal('vendors')" onkeydown="if(event.key==='Enter')InvoicesUI.showPurchaseOutstandingModal('vendors')">
                            <div class="card-body p-3 text-center">
                                <div class="text-white-50 fw-bold small text-uppercase mb-1">Suppliers with O/S</div>
                                <h3 class="mb-0 text-info" id="summaryPurchasePendingParties">0</h3>
                                <div class="text-white-50 extra-small mt-1">Click for details</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                         <div class="row g-2 mb-3">
                            <div class="col-md-3">
                                <label class="form-label small text-white-50">Calendar Month</label>
                                <input type="month" class="form-control bg-dark text-white border-secondary" id="filterPurchaseMonth" onchange="InvoicesUI.updatePurchasesTable()">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small text-white-50">Vendor</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterPurchaseVendor" onchange="InvoicesUI.updatePurchasesTable()">
                                    <option value="">All Vendors</option>
                                    ${vendorOptions}
                                </select>
                            </div>
                            <div class="col-md-3 text-end">
                                <label class="form-label small text-white-50 d-block">Status</label>
                                <div class="btn-group w-100" role="group">
                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusAll" value="all" ${this.currentStatusFilter === 'all' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('all')">
                                    <label class="btn btn-outline-secondary btn-sm" for="purStatusAll">All</label>
                                    
                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusPending" value="pending" ${this.currentStatusFilter === 'pending' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('pending')">
                                    <label class="btn btn-outline-danger btn-sm" for="purStatusPending">Pending</label>

                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusPartial" value="partial" ${this.currentStatusFilter === 'partial' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('partial')">
                                    <label class="btn btn-outline-warning btn-sm" for="purStatusPartial">Partial</label>
                                    
                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusPaid" value="paid" ${this.currentStatusFilter === 'paid' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('paid')">
                                    <label class="btn btn-outline-success btn-sm" for="purStatusPaid">Paid</label>
                                </div>
                            </div>
                        </div>
                         <div class="input-group">
                            <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control bg-dark text-light border-secondary" id="purchaseSearch" 
                                placeholder="Search bills by number, vendor or items..." onkeyup="InvoicesUI.debouncedFilter()">
                        </div>
                    </div>
                </div>

                <div class="table-responsive" id="purchasesTableContainer">
                    <div class="text-center py-5">
                        <div class="spinner-border text-warning" role="status"></div>
                    </div>
                </div>
            </div>
        `;

        this.updatePurchasesTable();
    },

    updatePurchasesTable() {
        const purchasesRaw = (DataManager.getData(DataManager.KEYS.EXPENSES) || [])
            .filter(p => (p.category || '').toLowerCase().includes('purchase'));
        const voucherMap = (typeof VoucherManager !== 'undefined') ? VoucherManager.getVoucherAllocationsMap(null, 'payment') : new Map();
        
        // Enhance with balance and status
        const purchases = purchasesRaw.map(p => {
            const isDebitNote = this._isDebitNotePurchaseDoc(p);
            const docTotal = Math.abs(parseFloat(p.total ?? p.amount ?? p.vch_amt ?? 0) || 0);
            let balance = (typeof VoucherManager !== 'undefined') ? 
                (isDebitNote ? 0 : VoucherManager.getDocumentBalance(
                    p.id,
                    docTotal,
                    voucherMap,
                    p.billNo || p.vch_no || p.invoiceNo,
                    p,
                    { allowLooseFallback: false }
                )) :
                (isDebitNote ? 0 : docTotal);
            const importedStatus = String(p.status || '').toLowerCase();
            if (!isDebitNote && balance >= (docTotal - 0.05)) {
                if (importedStatus === 'paid') balance = 0;
                else if (importedStatus === 'partial') balance = Math.max(0.01, docTotal * 0.5);
            }
            return {
                ...p,
                isDebitNote,
                balance,
                isPaid: isDebitNote ? true : balance <= 0.05,
                isPartial: balance > 0.05 && balance < (docTotal - 0.05)
            };
        });

        // Filter UI states
        const monthFilter = document.getElementById('filterPurchaseMonth')?.value || '';
        const vendorFilter = document.getElementById('filterPurchaseVendor')?.value;
        const query = document.getElementById('purchaseSearch')?.value?.toLowerCase();
        const statusFilter = this.currentStatusFilter;

        const filtered = purchases.filter(p => {
            const dateObj = new Date(p.date);
            const monthYm = Number.isNaN(dateObj.getTime()) ? '' : `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            const monthMatch = !monthFilter || monthYm === monthFilter;
            const vendorMatch = !vendorFilter || p.vendor === vendorFilter;
            const statusMatch = statusFilter === 'all' || 
                             (statusFilter === 'paid' && p.isPaid) ||
                             (statusFilter === 'pending' && !p.isPaid && !p.isPartial) ||
                             (statusFilter === 'partial' && p.isPartial);
            const searchMatch = !query || 
                               (p.billNo || '').toLowerCase().includes(query) || 
                               (p.vendor || '').toLowerCase().includes(query) ||
                               (p.description || '').toLowerCase().includes(query);

            return monthMatch && vendorMatch && statusMatch && searchMatch;
        });

        // Update Summary Cards
        let totalPending = filtered.reduce((sum, p) => sum + p.balance, 0);
        const pendingCount = filtered.filter(p => p.balance > 0.05).length;
        let outstandingParties = new Set(filtered.filter(p => p.balance > 0.05).map(p => p.vendor)).size;
        if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics.getAccountLedger) {
            const range = this._purchaseLedgerRangeFromFilters('');
            const partyMap = new Map();
            filtered.forEach(p => {
                const key = (p.partyId || p.vendorId || p.vendor || p.customerId || '').toString().trim();
                if (!key || partyMap.has(key)) return;
                partyMap.set(key, { partyId: p.partyId, vendorId: p.vendorId, customerId: p.customerId, name: p.vendor || p.vendorName || p.partyName });
            });
            let ledgerSum = 0;
            let ledgerPartyCount = 0;
            for (const party of partyMap.values()) {
                const l = this._resolveLedgerForParty(party, 'vendor', range);
                const bal = Math.max(0, parseFloat(l?.summary?.balance || 0) || 0);
                if (bal > 0.05) {
                    ledgerSum += bal;
                    ledgerPartyCount += 1;
                }
            }
            totalPending = ledgerSum;
            outstandingParties = ledgerPartyCount;
        }

        const updateEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        updateEl('summaryPurchasePendingAmount', `₹${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        updateEl('summaryPurchasePendingBills', pendingCount);
        updateEl('summaryPurchasePendingParties', outstandingParties);

        const container = document.getElementById('purchasesTableContainer');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `<div class="text-center py-5 text-muted">No purchase records found matching filters.</div>`;
            return;
        }

        // Sort by date desc
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        const html = `
            <table class="table table-dark table-hover align-middle border-secondary">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Bill #</th>
                        <th>Vendor</th>
                        <th class="text-end">Total Amount</th>
                        <th class="text-end">Balance</th>
                        <th class="text-center">Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(p => {
            const itemsList = (p.items || []).map(item => item.name).join(', ');
            const searchTerms = `${p.billNo} ${p.vendor} ${itemsList}`.toLowerCase();
            const statusBadge = p.isDebitNote
                ? '<span class="badge bg-secondary-subtle text-secondary border border-secondary">Debit Note</span>'
                : (p.isPaid
                    ? '<span class="badge bg-success-subtle text-success border border-success">Paid</span>'
                    : (p.isPartial
                        ? '<span class="badge bg-warning-subtle text-warning border border-warning">Partial</span>'
                        : '<span class="badge bg-danger-subtle text-danger border border-danger">Pending</span>'));

            return `
                        <tr data-search="${searchTerms}" data-year="${DataManager.getFinancialYear(p.date)}" data-vendor="${p.vendor}" data-status="${p.isPaid ? 'paid' : (p.isPartial ? 'partial' : 'pending')}">
                            <td>${DataManager.formatDateDisplay(p.date)}</td>
                            <td>
                                <div class="fw-bold text-warning">${p.billNo || 'N/A'}</div>
                                <div style="font-size: 11px; color: #aaa; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">
                                    ${itemsList}
                                </div>
                            </td>
                            <td>${p.vendor || 'Unknown'}</td>
                            <td class="text-end">₹${Math.abs(parseFloat(p.total ?? p.amount ?? p.vch_amt ?? 0) || 0).toFixed(2)}</td>
                            <td class="text-end fw-bold ${p.balance > 0 ? 'text-danger' : 'text-success'}">₹${p.balance.toFixed(2)}</td>
                            <td class="text-center">${statusBadge}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewPurchase('${p.id}')" title="View Purchase">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = html;
    },

    filterPurchases() {
        const query = document.getElementById('purchaseSearch')?.value.toLowerCase() || '';
        const yearFilter = document.getElementById('filterPurchaseYear')?.value || '';
        const vendorFilter = document.getElementById('filterPurchaseVendor')?.value || '';
        const statusFilter = document.getElementById('filterPurchaseStatus')?.value || '';

        const rows = document.querySelectorAll('#purchasesTableContainer tbody tr');

        requestAnimationFrame(() => {
            rows.forEach(row => {
                const searchMatch = !query || (row.dataset.search || '').includes(query);
                const yearMatch = !yearFilter || (row.dataset.year === yearFilter);
                const vendorMatch = !vendorFilter || (row.dataset.vendor === vendorFilter);
                const statusMatch = !statusFilter || (row.dataset.status === statusFilter);

                if (searchMatch && yearMatch && vendorMatch && statusMatch) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    },

    async getPurchaseElement(id) {
        const purchases = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const p = purchases.find(pur => pur.id === id);
        if (!p) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const companyData = {
            name: settings.companyName || DataManager.COMPANY_PROFILE.name,
            address: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
            workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
            gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
            pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
            emails: settings.emails || DataManager.COMPANY_PROFILE.emails,
            phones: settings.phones || DataManager.COMPANY_PROFILE.phones
        };

        // Robust Vendor Name Cleaning
        const getCleanVendor = (val) => {
            if (!val) return 'Unknown Vendor';
            // If it looks like a list of items (many commas) and is very long, it might be the description
            if (val.includes(',') && val.length > 50) {
                const parts = val.split(',').map(s => s.trim());
                if (parts.length > 3) {
                    // Try to see if any part is a known vendor or just use first part if it's not too long
                    return parts[0].length < 40 ? parts[0] : 'Multiple Items (Vendor Missing)';
                }
            }
            return val;
        };

        const displayVendor = getCleanVendor(p.vendor || p.vendorName);
        const isDebitNote = this._isDebitNotePurchaseDoc(p);
        const purchaseRefNo = this._inferPurchaseReferenceNo(p);
        const purchaseDocTitle = isDebitNote ? 'Debit Note / Purchase Return' : 'Purchase Bill';
        const purchaseDocNoLabel = isDebitNote ? 'Debit Note No' : 'Bill No';
        const purchaseShipAddr = (p.shipToAddress || p.deliveryAddress || '').trim();
        const showPurchaseShipPdf = !!purchaseShipAddr && p.includeShipToOnPdf !== false;

        const masterInventory = DataManager.getData(DataManager.KEYS.INVENTORY) || DataManager.getData('gtes_inventory_items') || [];
        const masterServices = DataManager.getData(DataManager.KEYS.SERVICES || 'gtes_services') || DataManager.getData('gtes_services') || [];
        const allMasterItems = [...masterInventory, ...masterServices];

        const dnDocTotal = Math.abs(parseFloat(p.total ?? p.amount ?? p.vch_amt ?? 0) || 0);
        let pdfItems = (p.items && p.items.length) ? JSON.parse(JSON.stringify(p.items)) : [];
        let pdfLineTaxes = null;

        if (isDebitNote && this._debitNoteUsesFallbackLineItems(p)) {
            const basePur = this._findBasePurchaseForDebitNote(p, purchases);
            if (basePur && basePur.items && basePur.items.length > 0) {
                const cloned = JSON.parse(JSON.stringify(basePur.items));
                pdfItems = this._pickDebitNoteLinesMatchingTotal(cloned, dnDocTotal);
            }
        }

        if (pdfItems.length > 0) {
            pdfLineTaxes = this._accumulatePurchasePdfFooterTaxes(pdfItems, allMasterItems);
        }

        const pdfCgst = pdfLineTaxes ? pdfLineTaxes.cgst : (parseFloat(p.cgst) || 0);
        const pdfSgst = pdfLineTaxes ? pdfLineTaxes.sgst : (parseFloat(p.sgst) || 0);
        const pdfIgst = pdfLineTaxes ? pdfLineTaxes.igst : (parseFloat(p.igst) || 0);
        const pdfTaxableSub = pdfLineTaxes
            ? pdfLineTaxes.taxable
            : (parseFloat(p.subtotal) || (dnDocTotal - pdfCgst - pdfSgst - pdfIgst));

        const pdfW = (typeof DeliveryUI !== 'undefined' && DeliveryUI.GTES_PDF_DOCUMENT_WIDTH_PX) || 760;
        const element = document.createElement('div');
        element.className = 'gtes-pdf-document';
        element.style.width = `${pdfW}px`;
        element.style.padding = '14px';
        element.style.background = 'white';
        element.style.color = '#000';
        element.style.fontFamily = 'Arial, Helvetica, "Liberation Sans", sans-serif';

        const itemsHtml = (pdfItems && pdfItems.length > 0) ? pdfItems.map((item, idx) => {
            const details = this.getItemDisplayDetails(item, allMasterItems, false);
            const nm = this.escapePdfHtml(item.name);
            const ds = details.displayDesc ? this.escapePdfHtml(details.displayDesc) : '';

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

            return `
            <tr style="font-size: 10px; page-break-inside: avoid;">
                <td style="padding: 5px 6px; text-align: center; border: 1px solid #000;">${idx + 1}</td>
                <td style="padding: 5px 6px; border: 1px solid #000; vertical-align: top;">
                    <div style="font-weight: 700;">${nm}</div>
                    ${ds ? `<div style="font-size: 9px; font-style: italic; color: #222; margin-top: 3px; line-height: 1.35; white-space: pre-line;">${ds}</div>` : ''}
                </td>
                <td style="padding: 5px 6px; text-align: center; border: 1px solid #000; word-break: break-all; max-width: 88px;">${this.escapePdfHtml(details.hsn)}</td>
                <td style="padding: 5px 6px; text-align: center; border: 1px solid #000;">${details.qty}${details.unit !== 'nos' ? ' ' + this.escapePdfHtml(details.unit) : ''}</td>
                <td style="padding: 5px 6px; text-align: right; border: 1px solid #000;">${details.rate.toFixed(2)}</td>
                <td style="padding: 5px 6px; text-align: center; border: 1px solid #000;">${this.escapePdfHtml(details.unit)}</td>
                <td style="padding: 5px 6px; text-align: right; border: 1px solid #000;">${item.discount || 0}%</td>
                <td style="padding: 5px 6px; text-align: right; border: 1px solid #000;">${cgstR.toFixed(1)}%</td>
                <td style="padding: 5px 6px; text-align: right; border: 1px solid #000;">${cgstA.toFixed(2)}</td>
                <td style="padding: 5px 6px; text-align: right; border: 1px solid #000;">${sgstR.toFixed(1)}%</td>
                <td style="padding: 5px 6px; text-align: right; border: 1px solid #000;">${sgstA.toFixed(2)}</td>
                <td style="padding: 5px 6px; text-align: right; font-weight: 700; border: 1px solid #000;">${details.amount.toFixed(2)}</td>
            </tr>
        `;
        }).join('') : `
            <tr style="font-size: 10px;">
                <td style="padding: 5px 6px; text-align: center; border: 1px solid #000;">1</td>
                <td style="padding: 5px 6px; border: 1px solid #000;">
                    <div style="font-weight: 700;">${this.escapePdfHtml((p.description || 'Purchase').split('\n')[0].slice(0, 200))}</div>
                </td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: center;">-</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: center;">1</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: right;">${(parseFloat(p.amount) || 0).toFixed(2)}</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: center;">nos</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: right;">0%</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: right;">0%</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: right;">0.00</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: right;">0%</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: right;">0.00</td>
                <td style="padding: 5px 6px; border: 1px solid #000; text-align: right; font-weight: 700;">${(parseFloat(p.amount) || 0).toFixed(2)}</td>
            </tr>`;

        element.innerHTML = `
            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: collapse; margin: 0 0 16px 0; border-bottom: 2px solid #000;">
                <tr>
                    <td style="width: 65%; vertical-align: top; padding: 0 12px 12px 0;">
                        <h1 style="margin: 0; color: #000; font-size: 24px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase;">${this.escapePdfHtml(companyData.name)}</h1>
                        <div style="font-size: 10px; color: #222; margin-top: 6px; line-height: 1.45;">
                            ${this.escapePdfHtml(companyData.address)}<br>
                            <strong>Work:</strong> ${this.escapePdfHtml(companyData.workAddress)}<br>
                            <strong>GSTIN:</strong> ${this.escapePdfHtml(companyData.gstin)} | <strong>PAN:</strong> ${this.escapePdfHtml(companyData.pan)}
                        </div>
                    </td>
                    <td style="width: 35%; vertical-align: top; text-align: right; padding: 0 0 12px 0;">
                        <div style="font-size: 18px; font-weight: 800; color: #000; text-transform: uppercase; margin-bottom: 6px;">${purchaseDocTitle}</div>
                        <div style="font-size: 10px; color: #222;">
                            Date: <strong>${this.escapePdfHtml(p.date)}</strong><br>
                            ${purchaseDocNoLabel}: <strong>${this.escapePdfHtml(p.billNo)}</strong>
                        </div>
                    </td>
                </tr>
            </table>

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px;">
                <tr>
                    <td style="width: 50%; vertical-align: top; padding: 0 7px 0 0;">
                        <div style="border: 1px solid #000; padding: 10px;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">Bill From (Supplier)</div>
                            <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: #111;">${this.escapePdfHtml(displayVendor)}</div>
                            <div style="font-size: 10px; line-height: 1.4; white-space: pre-wrap;">${this.escapePdfHtml(p.vendorAddress || 'Address not available')}</div>
                            ${(p.vendorGstin || p.vendorGSTIN) ? `<div style="font-size: 10px; margin-top: 6px;"><strong>GSTIN:</strong> ${this.escapePdfHtml(p.vendorGstin || p.vendorGSTIN)}</div>` : ''}
                        </div>
                    </td>
                    <td style="width: 50%; vertical-align: top; padding: 0 0 0 7px;">
                        <div style="border: 1px solid #000; padding: 10px;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">Bill Details</div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; width: 120px; color: #444;">Supplier Bill No:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(p.supplierBillNo || p.supplierInvoiceNo || p.purchaseInvoiceRef || p.referenceNo || p.billNo || '-')}</strong></td></tr>
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Purchase Invoice Ref:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(purchaseRefNo)}</strong></td></tr>
                                <tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Ref No / PO:</td><td style="padding: 2px 0; vertical-align: top;"><strong>${this.escapePdfHtml(p.poNumber || '-')}</strong></td></tr>
                                ${isDebitNote
                ? `<tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Return Status:</td><td style="padding: 2px 0; vertical-align: top;"><strong style="color: #334155;">POSTED</strong></td></tr>`
                : `<tr><td style="padding: 2px 8px 2px 0; vertical-align: top; color: #444;">Payment Status:</td><td style="padding: 2px 0; vertical-align: top;"><strong style="color: ${p.status === 'paid' ? '#27ae60' : '#e67e22'}">${(p.status || 'pending').toUpperCase()}</strong></td></tr>`}
                            </table>
                        </div>
                    </td>
                </tr>
            </table>

            ${showPurchaseShipPdf ? `
            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px;">
                <tr>
                    <td style="width: 100%; vertical-align: top; padding: 0;">
                        <div style="border: 1px solid #000; padding: 10px;">
                            <div style="text-transform: uppercase; font-size: 9px; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">Ship To / Delivery Address</div>
                            <div style="font-size: 10px; line-height: 1.4; white-space: pre-wrap;">${this.escapePdfHtml(purchaseShipAddr)}</div>
                            ${p.shipToGstin ? `<div style="font-size: 10px; margin-top: 6px;"><strong>GSTIN:</strong> ${this.escapePdfHtml(p.shipToGstin)}</div>` : ''}
                        </div>
                    </td>
                </tr>
            </table>` : ''}

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #000; table-layout: auto;">
                <thead>
                    <tr style="background: #4a5568; color: #fff; font-size: 10px; text-transform: uppercase; text-align: center;">
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; vertical-align: middle; width: 30px;">#</th>
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; text-align: left; width: 25%;">Description</th>
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; min-width: 64px; max-width: 88px; word-break: break-all;">HSN</th>
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; width: 85px;">Qty</th>
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; width: 80px;">Rate</th>
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; width: 65px;">Per</th>
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; width: 40px;">Disc</th>
                        <th colspan="2" style="padding: 8px; border: 1px solid #64748b;">CGST</th>
                        <th colspan="2" style="padding: 8px; border: 1px solid #64748b;">SGST</th>
                        <th rowspan="2" style="padding: 8px; border: 1px solid #64748b; width: 90px; vertical-align: middle;">Amount</th>
                    </tr>
                    <tr style="background: #4a5568; color: #fff; font-size: 9px; text-align: center;">
                        <th style="border: 1px solid #64748b; padding: 4px; width: 30px;">%</th>
                        <th style="border: 1px solid #64748b; padding: 4px; width: 50px;">Amt</th>
                        <th style="border: 1px solid #64748b; padding: 4px; width: 30px;">%</th>
                        <th style="border: 1px solid #64748b; padding: 4px; width: 50px;">Amt</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <table class="gtes-pdf-break-safe" style="width: 100%; border-collapse: separate; border-spacing: 0;">
                <tr>
                    <td style="width: 50%; vertical-align: top; padding: 0 8px 0 0; font-size: 11px;">
                        <div style="margin-bottom: 5px;"><strong>CGST Amt:</strong> ${pdfCgst.toFixed(2)}</div>
                        <div style="margin-bottom: 5px;"><strong>SGST Amt:</strong> ${pdfSgst.toFixed(2)}</div>
                        ${pdfIgst > 0 ? `<div style="margin-bottom: 5px;"><strong>IGST Amt:</strong> ${pdfIgst.toFixed(2)}</div>` : ''}
                        <div style="margin-bottom: 15px;"><strong>Total Tax:</strong> ${(pdfCgst + pdfSgst + pdfIgst).toFixed(2)}</div>
                        <div style="margin-top: 30px; font-size: 10px; color: #666; font-style: italic; line-height: 1.4;">
                            We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                        </div>
                        <div style="margin-top: 10px; font-size: 10px; color: #111;">
                            <strong>Ledger Effect:</strong>
                            ${isDebitNote
                ? `Debit (Vendor A/c) ₹${Math.abs(parseFloat(p.amount) || 0).toFixed(2)}`
                : `Credit (Vendor A/c) ₹${Math.abs(parseFloat(p.amount) || 0).toFixed(2)}`}
                        </div>
                    </td>
                    <td style="width: 50%; vertical-align: top; padding: 0 0 0 8px;">
                        <div style="border: 1px solid #ddd; border-radius: 4px; padding: 8px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: #f1f3f5;">
                                <tr>
                                    <td style="padding: 6px 8px; text-align: right; color: #334155;">Subtotal</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; font-weight: 600; min-width: 100px;">₹${pdfTaxableSub.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 8px; text-align: right; color: #334155;">CGST Total</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; min-width: 100px;">₹${pdfCgst.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 8px; text-align: right; color: #334155;">SGST Total</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; min-width: 100px;">₹${pdfSgst.toFixed(2)}</td>
                                </tr>
                                ${pdfIgst > 0 ? `
                                <tr>
                                    <td style="padding: 6px 8px; text-align: right; color: #334155;">IGST Total</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; min-width: 100px;">₹${pdfIgst.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                ${p.roundOff ? `
                                <tr>
                                    <td style="padding: 6px 8px; text-align: right; color: #334155;">Round Off</td>
                                    <td style="padding: 6px 10px 6px 8px; text-align: right; min-width: 100px;">₹${parseFloat(p.roundOff).toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                <tr><td colspan="2" style="padding: 10px 8px 8px; background: #dfe3e8;">
                                    <table style="width: 100%; border-collapse: collapse; background: #fff; border: 2px solid #111;">
                                        <tr style="font-weight: bold; font-size: 17px;">
                                            <td style="padding: 10px 8px; text-align: right;">Total Amount</td>
                                            <td style="padding: 10px 12px 10px 8px; text-align: right; color: #000; min-width: 110px;">₹${parseFloat(p.amount).toFixed(2)}</td>
                                        </tr>
                                    </table>
                                </td></tr>
                            </table>
                        </div>
                    </td>
                </tr>
            </table>

            <table style="width: 100%; margin-top: 40px; border-collapse: collapse;"><tr><td style="text-align: right;">
                <div style="display: inline-block; text-align: right; width: 300px; max-width: 100%;">
                    <div style="font-size: 11px; margin-bottom: 50px;">For <strong style="font-weight: 800;">${this.escapePdfHtml(companyData.name)}</strong></div>
                    <div style="border-top: 1px solid #000; padding-top: 10px; text-align: center;">
                        <span style="font-weight: bold; font-size: 13px; text-transform: uppercase;">Authorized Signatory</span>
                    </div>
                </div>
            </td></tr></table>

            <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #64748b; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                This is a computer generated invoice and does not require a physical signature.
            </div>
        `;
        return element;
    },

    _getFilteredSalesInvoicesAll() {
        const isGST = this.currentMode === 'gst';
        const typeFilter = isGST ? 'with-bill' : 'without-bill';
        let invoices = (typeof InvoiceManager !== 'undefined') ? InvoiceManager.getInvoicesWithBalance() : [];
        invoices = invoices.filter(inv => inv.type === typeFilter);
        const yearFilter = document.getElementById('filterYear')?.value;
        const calMonth = document.getElementById('filterCalendarMonth')?.value || '';
        const customerFilter = document.getElementById('filterCustomer')?.value;
        const query = document.getElementById('invoiceSearch')?.value?.toLowerCase();
        const statusFilter = this.currentStatusFilter;
        const linkFilter = this.currentVoucherLinkFilter || 'all';
        const allocMap = (typeof VoucherManager !== 'undefined' && VoucherManager.getVoucherAllocationsMap)
            ? VoucherManager.getVoucherAllocationsMap(null, 'receipt')
            : new Map();
        const invYm = (d) => {
            if (!d) return '';
            const s = String(d);
            return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
        };
        return invoices.filter(inv => {
            const yearMatch = !yearFilter || DataManager.getFinancialYear(inv.date) === yearFilter;
            const monthMatch = !calMonth || invYm(inv.date) === calMonth;
            const customerMatch = !customerFilter || inv.customerName === customerFilter;
            const statusMatch = statusFilter === 'all' ||
                             (statusFilter === 'paid' && inv.isPaid) ||
                             (statusFilter === 'pending' && !inv.isPaid && !inv.isPartial) ||
                             (statusFilter === 'partial' && inv.isPartial);
            const searchMatch = !query ||
                               (inv.invoiceNo || '').toLowerCase().includes(query) ||
                               (inv.customerName || '').toLowerCase().includes(query) ||
                               (inv.items || []).some(item => (item.name || '').toLowerCase().includes(query));
            const linkMatch = this._invoiceMatchesVoucherLinkFilter(inv, linkFilter, allocMap);
            return yearMatch && monthMatch && customerMatch && statusMatch && searchMatch && linkMatch;
        });
    },

    /**
     * Credit notes / sales returns reduce receivable in the ledger (credit side). They are not "pending bills"
     * to collect; including their positive `balance` in outstanding modals inflated totals vs ledger closing.
     */
    _isCreditNoteSalesDoc(inv) {
        if (!inv) return false;
        if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics._isCreditNoteInvoice) {
            return BusinessAnalytics._isCreditNoteInvoice(inv);
        }
        const t = (inv.type || '').toLowerCase();
        if (t === 'credit-note' || t === 'credit_note' || t === 'sales-return' || t === 'sales_return') return true;
        if (inv.isCreditNote === true) return true;
        const bk = String(inv.bookkeeperVchType || inv.v_type || '').toLowerCase();
        if (bk.includes('credit') && bk.includes('note')) return true;
        return false;
    },

    _isDebitNotePurchaseDoc(exp) {
        if (!exp) return false;
        if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics._isDebitNotePurchase) {
            return BusinessAnalytics._isDebitNotePurchase(exp);
        }
        const t = String(exp.type || exp.v_type || exp.billType || '').toLowerCase();
        const billNo = String(exp.billNo || exp.bookkeeperVchNo || exp.id || '').toUpperCase();
        if (t === 'debit-note' || t === 'debit_note') return true;
        if (t.includes('debit') && t.includes('note')) return true;
        if (t.includes('purchase') && t.includes('return')) return true;
        if (/^PRR/.test(billNo) || /^DN/.test(billNo) || /^DRN/.test(billNo)) return true;
        if (exp.isDebitNote === true) return true;
        return false;
    },

    _normVendorName(v) {
        return String(v || '').toLowerCase().replace(/[,\s]+/g, ' ').trim();
    },

    _purchaseBillRefVariants(raw) {
        const t = String(raw ?? '').trim();
        if (!t || t === '-') return [];
        const out = new Set([t]);
        const stripped = t.replace(/^0+/, '') || t;
        if (stripped !== t) out.add(stripped);
        const n = parseInt(t, 10);
        if (!isNaN(n)) out.add(String(n));
        return [...out];
    },

    _debitNoteUsesFallbackLineItems(p) {
        if (!p || !this._isDebitNotePurchaseDoc(p)) return false;
        const items = p.items || [];
        if (items.length === 0) return true;
        if (items.length > 1) return false;
        const it = items[0];
        const n = String(it.name || '').toLowerCase();
        const d = String(it.description || '').toLowerCase();
        if (n.includes('general purchase') || d.includes('expense entry')) return true;
        const hsn = String(it.hsn || it.hsn_code || '').trim();
        const taxMicro =
            (parseFloat(it.cgst) || 0) + (parseFloat(it.sgst) || 0) + (parseFloat(it.igst) || 0) +
            (parseFloat(it.cgstAmount) || 0) + (parseFloat(it.sgstAmount) || 0) + (parseFloat(it.igstAmount) || 0);
        const qty = parseFloat(it.quantity) || 0;
        if (!hsn && taxMicro < 0.01 && qty <= 1.001) {
            const lineAmt = parseFloat(it.amount) || parseFloat(it.rate) || 0;
            const docAmt = Math.abs(parseFloat(p.amount) || 0);
            if (docAmt > 0 && Math.abs(lineAmt - docAmt) < Math.max(1, docAmt * 0.02)) return true;
        }
        return false;
    },

    _findBasePurchaseForDebitNote(p, allExpenses) {
        if (!p || !Array.isArray(allExpenses)) return null;
        const refSet = new Set();
        for (const r of [p.purchaseInvoiceRef, p.referenceNo, p.refNo]) {
            this._purchaseBillRefVariants(r).forEach(x => refSet.add(x));
        }
        if (refSet.size === 0) {
            const inf = this._inferPurchaseReferenceNo(p);
            if (inf && inf !== '-') this._purchaseBillRefVariants(inf).forEach(x => refSet.add(x));
        }
        if (refSet.size === 0) return null;
        const vendorWant = this._normVendorName(p.vendor || p.vendorName);
        const pool = allExpenses.filter(e =>
            e &&
            e !== p &&
            !this._isDebitNotePurchaseDoc(e) &&
            String(e.category || '').toLowerCase().includes('purchase')
        );
        const billMatchesRef = (e) => {
            const keys = [e.billNo, e.id, e.supplierBillNo, e.vch_no, e.invoiceNo, e.bookkeeperVchNo];
            for (const k of keys) {
                if (k == null || k === '') continue;
                for (const v of this._purchaseBillRefVariants(k)) {
                    if (refSet.has(v)) return true;
                }
            }
            return false;
        };
        let vendorHit = null;
        let anyHit = null;
        for (const e of pool) {
            if (!billMatchesRef(e)) continue;
            if (!anyHit) anyHit = e;
            const v = this._normVendorName(e.vendor || e.vendorName);
            if (vendorWant && v && v === vendorWant) {
                vendorHit = e;
                break;
            }
        }
        return vendorHit || anyHit;
    },

    _sumPurchaseLineTaxes(items) {
        let cgst = 0;
        let sgst = 0;
        let igst = 0;
        let taxable = 0;
        for (const it of items || []) {
            taxable += parseFloat(it.amount) || 0;
            cgst += parseFloat(it.cgst) || parseFloat(it.cgstAmount) || 0;
            sgst += parseFloat(it.sgst) || parseFloat(it.sgstAmount) || 0;
            igst += parseFloat(it.igst) || parseFloat(it.igstAmount) || 0;
        }
        return { cgst, sgst, igst, taxable };
    },

    _purchaseItemLineGrandTotal(it) {
        if (!it || typeof it !== 'object') return 0;
        const t = parseFloat(it.totalAmount);
        if (!Number.isNaN(t) && Math.abs(t) > 0.01) return Math.abs(t);
        const taxable = parseFloat(it.amount) || 0;
        const cgst = parseFloat(it.cgst) || parseFloat(it.cgstAmount) || 0;
        const sgst = parseFloat(it.sgst) || parseFloat(it.sgstAmount) || 0;
        const igst = parseFloat(it.igst) || parseFloat(it.igstAmount) || 0;
        return Math.abs(taxable + cgst + sgst + igst);
    },

    /**
     * Debit notes often store only a header total while the referenced purchase has many lines.
     * Keep all lines only when their sum matches the note total; otherwise pick the smallest subset
     * (pair, else single closest line) that matches the note amount.
     */
    _pickDebitNoteLinesMatchingTotal(baseItems, dnGrandTotal) {
        const raw = Array.isArray(baseItems) ? baseItems : [];
        const items = raw.map(x => JSON.parse(JSON.stringify(x)));
        if (items.length === 0) return [];
        const target = Math.abs(parseFloat(dnGrandTotal) || 0);
        if (target <= 0.01) return items;
        const tol = Math.max(1, target * 0.02);
        const cloneOne = (it) => JSON.parse(JSON.stringify(it));
        const lineG = items.map(it => ({ it, g: this._purchaseItemLineGrandTotal(it) }));
        const sumAll = lineG.reduce((s, x) => s + x.g, 0);
        if (Math.abs(sumAll - target) <= tol) return items;

        if (lineG.length <= 12 && sumAll > target + tol) {
            for (let i = 0; i < lineG.length; i++) {
                for (let j = i + 1; j < lineG.length; j++) {
                    const s = lineG[i].g + lineG[j].g;
                    if (Math.abs(s - target) <= tol) {
                        return [cloneOne(lineG[i].it), cloneOne(lineG[j].it)];
                    }
                }
            }
        }

        let best = lineG[0].it;
        let bestDiff = Math.abs(lineG[0].g - target);
        for (const x of lineG) {
            const d = Math.abs(x.g - target);
            if (d < bestDiff) {
                bestDiff = d;
                best = x.it;
            }
        }
        if (sumAll < target - tol) return items;
        if (sumAll > target + tol) return [cloneOne(best)];
        if (bestDiff <= tol * 3) return [cloneOne(best)];
        return items;
    },

    _normalizeGstStateCode(gstin) {
        const s = (gstin || '').toString().replace(/\s/g, '');
        if (s.length < 2) return '';
        const d = s.slice(0, 2);
        return /^\d{2}$/.test(d) ? d : '';
    },

    /**
     * Different seller vs buyer / place-of-supply state → interstate supply (IGST only on PDF).
     * Same state → intrastate (CGST + SGST).
     */
    _isInterstateSalesGst(invoice, customer, sellerGstin) {
        const seller = this._normalizeGstStateCode(sellerGstin);
        let buyer = this._normalizeGstStateCode(
            (customer && customer.gstin) || invoice.customerGstin || invoice.billingGstin || invoice.shipToGstin
        );
        if (!buyer && invoice.placeOfSupply) {
            const m = String(invoice.placeOfSupply).trim().match(/^(\d{2})/);
            if (m) buyer = m[1];
        }
        if (!seller || !buyer) return false;
        return seller !== buyer;
    },

    /**
     * Interstate line: prefer stored IGST; else CGST+SGST; else taxable × rate when imports omit tax columns.
     */
    _resolveInterstateLineIgst(item, details) {
        const taxable = parseFloat(details.amount) || 0;
        let igstA = parseFloat(item.igst) || parseFloat(item.igstAmount) || 0;
        const cgstA = parseFloat(item.cgstAmount) || 0;
        const sgstA = parseFloat(item.sgstAmount) || 0;
        if (igstA < 0.01 && Math.abs(cgstA + sgstA) > 0.01) {
            igstA = cgstA + sgstA;
        }

        let igstR = parseFloat(String(item.igstRate || '').replace(/[^0-9.]/g, '')) || 0;
        if (igstR < 0.01) {
            const g = parseFloat(String(item.gstRate || '').replace(/[^0-9.]/g, '')) || 0;
            if (g > 0.01) igstR = g;
        }
        if (igstR < 0.01) {
            const cr = parseFloat(item.cgstRate) || 0;
            const sr = parseFloat(item.sgstRate) || 0;
            if (cr + sr > 0.01) igstR = cr + sr;
        }
        if (igstR < 0.01 && details) {
            const fullG = parseFloat(details.gstRate) || 0;
            if (fullG > 0.01) igstR = fullG;
            else {
                const half = parseFloat(details.cgstRate) || 0;
                if (half > 0.01) igstR = half * 2;
            }
        }

        if (igstA < 0.01 && taxable > 0.01 && igstR > 0.01) {
            igstA = taxable * (igstR / 100);
        }
        return { igstA, igstR };
    },

    /** Interstate sales PDF: line IGST, or CGST+SGST combined when data was stored as intrastate split. */
    _accumulateInterstateSalesPdfFooterTaxes(items, allMasterItems) {
        let igst = 0;
        let taxable = 0;
        for (const item of items || []) {
            const details = this.getItemDisplayDetails(item, allMasterItems, false);
            taxable += details.amount;
            const { igstA } = this._resolveInterstateLineIgst(item, details);
            igst += igstA;
        }
        return { igst, taxable };
    },

    /** Match purchase PDF footer taxes to row rendering (including IGST shown as split CGST/SGST). */
    _accumulatePurchasePdfFooterTaxes(items, allMasterItems) {
        let cgst = 0;
        let sgst = 0;
        let igst = 0;
        let taxable = 0;
        for (const item of items || []) {
            const details = this.getItemDisplayDetails(item, allMasterItems, false);
            taxable += details.amount;
            let cgstR = parseFloat(item.cgstRate) || details.cgstRate || 0;
            let sgstR = parseFloat(item.sgstRate) || details.cgstRate || 0;
            let cgstA = parseFloat(item.cgstAmount || (details.amount * cgstR / 100)) || 0;
            let sgstA = parseFloat(item.sgstAmount || (details.amount * sgstR / 100)) || 0;
            const igstA = parseFloat(item.igst) || parseFloat(item.igstAmount) || 0;
            if (igstA > 0.01 && Math.abs(cgstA + sgstA) < 0.01) {
                cgstA = igstA / 2;
                sgstA = igstA / 2;
                cgst += cgstA;
                sgst += sgstA;
            } else {
                cgst += cgstA;
                sgst += sgstA;
                igst += igstA;
            }
        }
        return { cgst, sgst, igst, taxable };
    },

    _inferSalesReferenceNo(inv) {
        const direct = inv?.referenceNo || inv?.refNo || inv?.refInvoiceNo || inv?.baseInvoiceNo || inv?.originalInvoiceNo;
        if (direct && String(direct).trim()) return String(direct).trim();
        if (typeof VoucherManager !== 'undefined' && VoucherManager.resolveCreditNoteSalesRef && this._isCreditNoteSalesDoc(inv)) {
            const parsed = String(VoucherManager.resolveCreditNoteSalesRef(inv) || '').trim();
            if (parsed) return parsed;
        }
        if (!inv) return '-';
        const all = DataManager.getData('invoices') || [];
        const partyId = inv.partyId || '';
        const custId = inv.customerId || '';
        const custName = (inv.customerName || '').toLowerCase().trim();
        const invDate = new Date(inv.date || 0).getTime() || Date.now();
        const isCandidate = (x) => {
            if (!x || x.id === inv.id) return false;
            if (this._isCreditNoteSalesDoc(x)) return false;
            const sameParty = (partyId && x.partyId === partyId)
                || (custId && x.customerId === custId)
                || (custName && String(x.customerName || '').toLowerCase().trim() === custName);
            if (!sameParty) return false;
            const xDate = new Date(x.date || 0).getTime() || 0;
            return xDate <= invDate;
        };
        const prior = all.filter(isCandidate).sort((a, b) => (new Date(b.date || 0) - new Date(a.date || 0)));
        return prior[0]?.invoiceNo || prior[0]?.id || '-';
    },

    _inferPurchaseReferenceNo(exp) {
        const direct = exp?.referenceNo || exp?.refNo || exp?.purchaseInvoiceRef || exp?.purchaseInvoiceNo || exp?.refInvoiceNo || exp?.baseInvoiceNo || exp?.originalInvoiceNo || exp?.supplierInvoiceNo || exp?.supplierBillNo;
        if (direct && String(direct).trim()) return String(direct).trim();
        if (!exp) return '-';
        const all = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const partyId = exp.partyId || '';
        const vendor = (exp.vendor || exp.vendorName || '').toLowerCase().trim();
        const expDate = new Date(exp.date || 0).getTime() || Date.now();
        const isCandidate = (x) => {
            if (!x || x.id === exp.id) return false;
            if (this._isDebitNotePurchaseDoc(x)) return false;
            const sameParty = (partyId && x.partyId === partyId)
                || (vendor && String(x.vendor || x.vendorName || '').toLowerCase().trim() === vendor);
            if (!sameParty) return false;
            const xDate = new Date(x.date || 0).getTime() || 0;
            return xDate <= expDate;
        };
        const prior = all.filter(isCandidate).sort((a, b) => (new Date(b.date || 0) - new Date(a.date || 0)));
        const best = prior[0];
        return best?.billNo || best?.supplierBillNo || best?.id || '-';
    },

    showSalesOutstandingModal(mode) {
        const lines = this._getFilteredSalesInvoicesAll().filter(inv =>
            (inv.balance || 0) > 0.05 && !this._isCreditNoteSalesDoc(inv)
        );
        const isGST = this.currentMode === 'gst';
        const yearFilter = document.getElementById('filterYear')?.value;
        const calMonth = document.getElementById('filterCalendarMonth')?.value || '';
        const range = this._salesLedgerRangeFromFilters(yearFilter, calMonth);
        const title = mode === 'parties'
            ? (isGST ? 'Outstanding by customer (GST)' : 'Outstanding by customer (Plain)')
            : (isGST ? 'Pending bills (GST)' : 'Pending bills (Plain)');
        let body = '';
        const dcBadge = (inv) => (typeof InvoiceManager !== 'undefined' && InvoiceManager.isDcStyleSalesInvoice(inv))
            ? ' <span class="badge bg-secondary">DC</span>' : '';
        const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (mode === 'parties') {
            const partySeen = new Map();
            for (const inv of lines) {
                const key = this._partyLedgerCacheKey(inv);
                if (!partySeen.has(key)) {
                    partySeen.set(key, {
                        displayName: inv.customerName || inv.customerId || 'Unknown',
                        party: { partyId: inv.partyId, customerId: inv.customerId, name: inv.customerName },
                        billSum: 0
                    });
                }
                partySeen.get(key).billSum += (inv.balance || 0);
            }
            const rows = [...partySeen.values()].map((entry) => {
                let ledgerDue = null;
                if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics.getAccountLedger) {
                    const l = this._resolveLedgerForParty(entry.party, 'customer', range);
                    ledgerDue = Math.max(0, parseFloat(l?.summary?.balance || 0) || 0);
                }
                return { ...entry, ledgerDue };
            }).filter((r) => (r.ledgerDue != null && r.ledgerDue > 0.05) || r.billSum > 0.05);
            rows.sort((a, b) => {
                const la = a.ledgerDue != null ? a.ledgerDue : a.billSum;
                const lb = b.ledgerDue != null ? b.ledgerDue : b.billSum;
                return lb - la;
            });
            body = `<div class="table-responsive" style="max-height: 70vh;"><table class="table table-dark table-sm align-middle mb-0">
                <thead><tr><th>Customer</th><th class="text-end" title="Account Ledger closing">Ledger due</th><th class="text-end" title="Sum of open bill balances (linked allocations)">On bills</th></tr></thead>
                <tbody>${rows.map((r) => `<tr><td>${this.escapePdfHtml(r.displayName)}</td>
                    <td class="text-end text-warning fw-bold">${r.ledgerDue != null ? `₹${fmt(r.ledgerDue)}` : '—'}</td>
                    <td class="text-end text-danger fw-bold">₹${fmt(r.billSum)}</td></tr>`).join('')}</tbody>
            </table></div>
            <p class="text-white-50 small mt-2 mb-0">Ledger due matches <strong>Accounting → Account Ledger</strong> for the selected financial year or month. On bills is the total still open on individual invoices in this list.</p>`;
            if (rows.length === 0) body = '<p class="text-muted mb-0">No outstanding balances for the current filters.</p>';
        } else {
            const sorted = [...lines].sort((a, b) => new Date(b.date) - new Date(a.date));
            const ledgerCache = new Map();
            const ledgerFor = (inv) => {
                if (typeof BusinessAnalytics === 'undefined' || !BusinessAnalytics.getAccountLedger) return null;
                const k = this._partyLedgerCacheKey(inv);
                if (ledgerCache.has(k)) return ledgerCache.get(k);
                const party = { partyId: inv.partyId, customerId: inv.customerId, name: inv.customerName };
                const l = this._resolveLedgerForParty(party, 'customer', range);
                const bal = Math.max(0, parseFloat(l?.summary?.balance || 0) || 0);
                ledgerCache.set(k, bal);
                return bal;
            };
            body = `<div class="table-responsive" style="max-height: 70vh;"><table class="table table-dark table-sm align-middle mb-0">
                <thead><tr><th>Date</th><th>Invoice #</th><th>Customer</th><th class="text-end">Balance</th><th class="text-end">Ledger due</th></tr></thead>
                <tbody>${sorted.map(inv => {
                const ld = ledgerFor(inv);
                const ldCell = ld == null ? '<td class="text-end text-muted">—</td>' : `<td class="text-end text-warning fw-bold">₹${fmt(ld)}</td>`;
                return `<tr>
                    <td>${DataManager.formatDateDisplay(inv.date)}</td>
                    <td><span class="text-info">${this.escapePdfHtml(inv.invoiceNo || inv.id)}</span>${dcBadge(inv)}</td>
                    <td>${this.escapePdfHtml(inv.customerName || '')}</td>
                    <td class="text-end text-danger fw-bold">₹${fmt(inv.balance || 0)}</td>
                    ${ldCell}
                </tr>`;
            }).join('')}</tbody>
            </table></div>`;
            if (lines.length === 0) body = '<p class="text-muted mb-0">No pending bills for the current filters.</p>';
        }
        document.getElementById('invoicesDrilldownModal')?.remove();
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="invoicesDrilldownModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content bg-dark text-white border-secondary">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">${title}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">${body}</div>
                </div>
            </div>
        </div>`);
        new bootstrap.Modal(document.getElementById('invoicesDrilldownModal')).show();
    },

    _getFilteredPurchasesAll() {
        const purchasesRaw = (DataManager.getData(DataManager.KEYS.EXPENSES) || [])
            .filter(p => (p.category || '').toLowerCase().includes('purchase'));
        const voucherMap = (typeof VoucherManager !== 'undefined') ? VoucherManager.getVoucherAllocationsMap(null, 'payment') : new Map();
        const purchases = purchasesRaw.map(p => {
            const isDebitNote = this._isDebitNotePurchaseDoc(p);
            const docTotal = Math.abs(parseFloat(p.total ?? p.amount ?? p.vch_amt ?? 0) || 0);
            let balance = (typeof VoucherManager !== 'undefined') ?
                (isDebitNote ? 0 : VoucherManager.getDocumentBalance(
                    p.id,
                    docTotal,
                    voucherMap,
                    p.billNo || p.vch_no || p.invoiceNo,
                    p,
                    { allowLooseFallback: false }
                )) :
                (isDebitNote ? 0 : docTotal);
            const importedStatus = String(p.status || '').toLowerCase();
            if (!isDebitNote && balance >= (docTotal - 0.05)) {
                if (importedStatus === 'paid') balance = 0;
                else if (importedStatus === 'partial') balance = Math.max(0.01, docTotal * 0.5);
            }
            return { ...p, isDebitNote, balance, isPaid: isDebitNote ? true : balance <= 0.05, isPartial: balance > 0.05 && balance < (docTotal - 0.05) };
        });
        const yearFilter = document.getElementById('filterPurchaseYear')?.value;
        const vendorFilter = document.getElementById('filterPurchaseVendor')?.value;
        const query = document.getElementById('purchaseSearch')?.value?.toLowerCase();
        const statusFilter = this.currentStatusFilter;
        return purchases.filter(p => {
            const yearStr = DataManager.getFinancialYear(p.date);
            const yearMatch = !yearFilter || yearStr === yearFilter;
            const vendorMatch = !vendorFilter || p.vendor === vendorFilter;
            const statusMatch = statusFilter === 'all' ||
                             (statusFilter === 'paid' && p.isPaid) ||
                             (statusFilter === 'pending' && !p.isPaid && !p.isPartial) ||
                             (statusFilter === 'partial' && p.isPartial);
            const searchMatch = !query ||
                               (p.billNo || '').toLowerCase().includes(query) ||
                               (p.vendor || '').toLowerCase().includes(query) ||
                               (p.description || '').toLowerCase().includes(query) ||
                               (p.items || []).some(it => (it.name || '').toLowerCase().includes(query));
            return yearMatch && vendorMatch && statusMatch && searchMatch;
        });
    },

    showPurchaseOutstandingModal(mode) {
        const lines = this._getFilteredPurchasesAll().filter(p => (p.balance || 0) > 0.05 && !p.isDebitNote);
        const title = mode === 'vendors' ? 'Suppliers with outstanding' : 'Pending purchase bills';
        let body = '';
        if (mode === 'vendors') {
            const map = new Map();
            lines.forEach(p => {
                const key = p.vendor || 'Unknown';
                map.set(key, (map.get(key) || 0) + (p.balance || 0));
            });
            let rows = [...map.entries()].map(([name, amt]) => {
                let alignedAmt = amt;
                // Align supplier outstanding modal with Customer Ledger logic when available.
                // Ledger is party-based (includes supplier payments even if bill links are imperfect).
                if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics.getAccountLedger) {
                    try {
                        const l = BusinessAnalytics.getAccountLedger(name, { accountGroup: 'vendor' });
                        if (l && l.summary && Number.isFinite(Number(l.summary.balance))) {
                            alignedAmt = Math.max(0, parseFloat(l.summary.balance) || 0);
                        }
                    } catch (e) { /* keep fallback amount */ }
                }
                return [name, alignedAmt];
            }).filter(([, amt]) => (parseFloat(amt) || 0) > 0.05);
            rows = rows.sort((a, b) => b[1] - a[1]);
            body = `<div class="table-responsive" style="max-height: 70vh;"><table class="table table-dark table-sm align-middle mb-0">
                <thead><tr><th>Supplier</th><th class="text-end">Total pending</th></tr></thead>
                <tbody>${rows.map(([name, amt]) => `<tr><td>${this.escapePdfHtml(name)}</td><td class="text-end text-danger fw-bold">₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`).join('')}</tbody>
            </table></div>`;
            if (rows.length === 0) body = '<p class="text-muted mb-0">No outstanding balances for the current filters.</p>';
        } else {
            const sorted = [...lines].sort((a, b) => new Date(b.date) - new Date(a.date));
            body = `<div class="table-responsive" style="max-height: 70vh;"><table class="table table-dark table-sm align-middle mb-0">
                <thead><tr><th>Date</th><th>Bill #</th><th>Vendor</th><th class="text-end">Balance</th></tr></thead>
                <tbody>${sorted.map(p => `<tr>
                    <td>${DataManager.formatDateDisplay(p.date)}</td>
                    <td>${this.escapePdfHtml(p.billNo || p.id)}</td>
                    <td>${this.escapePdfHtml(p.vendor || '')}</td>
                    <td class="text-end text-danger fw-bold">₹${(p.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>`).join('')}</tbody>
            </table></div>`;
            if (lines.length === 0) body = '<p class="text-muted mb-0">No pending bills for the current filters.</p>';
        }
        document.getElementById('purchaseDrilldownModal')?.remove();
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="purchaseDrilldownModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content bg-dark text-white border-secondary">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">${title}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">${body}</div>
                </div>
            </div>
        </div>`);
        new bootstrap.Modal(document.getElementById('purchaseDrilldownModal')).show();
    },

    previewPurchase(id) {
        if (typeof DeliveryUI !== 'undefined' && DeliveryUI.viewPurchaseDetails) {
            DeliveryUI.viewPurchaseDetails(id);
        } else {
            App.showNotification('Purchase preview not available', 'error');
        }
    },

    async viewPurchase(id) {
        return this.previewPurchase(id);
    }
};

window.InvoicesUI = InvoicesUI;
