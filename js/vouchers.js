/**
 * Voucher Management Module
 * Handles logic for Receipts, Payments, and Contra vouchers.
 * Manages bank statement alias learning.
 */

const VoucherManager = {
    _allocationsCache: null,
    _bankAliasCache: null,

    /** Too generic for bank alias keys — matching these causes cross-customer false positives. */
    BANK_ALIAS_STOPWORDS: new Set([
        'SRI', 'SHRI', 'SHREE', 'MR', 'MRS', 'MS', 'THE', 'AND', 'FOR', 'FROM', 'TO', 'BY',
        'GAS', 'GASE', 'GASES', 'PVT', 'LTD', 'LIMITED', 'PRIVATE', 'AGENCY', 'ENTERPRISES', 'ENTERPRISE',
        'COMPANY', 'CORP', 'INDIA', 'INDIAN', 'CHENNAI', 'MUMBAI', 'DELHI', 'BANGALORE',
        'HYDERABAD', 'KOLKATA', 'COIMBATORE', 'MADURAI', 'SALEM', 'TRICHY', 'VELLORE',
        'BANK', 'NET', 'CMS', 'TRF', 'TRFR', 'PAYMENT', 'RECEIPT', 'CREDIT', 'DEBIT',
        'TECH', 'HIGH', 'HI', 'NEW', 'OLD', 'NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL',
        'OTHERS', 'OTHR', 'BIL', 'BILL', 'AIR', 'OXYGE', 'OXYGEN'
    ]),

    invalidateAllocationsCache() {
        this._allocationsCache = null;
        this._lastVoucherCount = null;
    },

    invalidateBankAliasCache() {
        this._bankAliasCache = null;
    },

    _lastVoucherCount: 0,

    /**
     * Safer allocation norm key — never collapse INV-NB-0008 / 008 / 08 into bare "8".
     * Party-scoped keys (__pnorm:) are used for lookups to avoid cross-customer collisions.
     */
    _allocationNormKey(raw) {
        const s = String(raw || '').trim().toUpperCase();
        if (!s) return '';
        const gtes = s.match(/^GTES\/(\d{2}-\d{2})\/(.+)$/i);
        if (gtes) {
            const seq = (gtes[2].replace(/\D/g, '').replace(/^0+/, '') || '0');
            return `GTES|${gtes[1]}|${seq}`;
        }
        const invNb = s.match(/^INV[-/]?NB[-/]?(\d+)$/i);
        if (invNb) {
            const seq = invNb[1].replace(/^0+/, '') || '0';
            return `INV-NB|${seq}`;
        }
        const bkInv = s.match(/^BK-INV-(\d+)$/i);
        if (bkInv) return `BK-INV|${bkInv[1]}`;
        if (/^\d+$/.test(s)) {
            if (s.length >= 6) return `NUM|${s}`;
            const seq = s.replace(/^0+/, '') || '0';
            if (seq.length < 5) return '';
            return `NUM|${seq}`;
        }
        return '';
    },

    _resolveDocPartyId(doc) {
        if (!doc) return '';
        return (doc.customerId || doc.partyId || doc.vendorId || '').toString().trim();
    },

    _bumpAllocMap(map, raw, amount, partyId = null) {
        if (raw === undefined || raw === null || raw === '') return;
        const k = raw.toString().trim();
        if (!k) return;
        map.set(k, (map.get(k) || 0) + amount);
        const pid = (partyId || '').toString().trim();
        if (pid) {
            const pk = `__pdoc:${pid}|${k}`;
            map.set(pk, (map.get(pk) || 0) + amount);
        }
        const nk = this._allocationNormKey(k);
        if (!nk || !pid) return;
        const normPk = `__pnorm:${pid}|${nk}`;
        map.set(normPk, (map.get(normPk) || 0) + amount);
    },

    /** Register one allocation amount once per unique ref (id/no/invoiceNo often repeat the same bill no). */
    _bumpAllocRefsOnce(map, refs, amount, partyId = null) {
        const seen = new Set();
        (refs || []).forEach((raw) => {
            if (raw === undefined || raw === null || raw === '') return;
            const k = raw.toString().trim();
            if (!k || seen.has(k)) return;
            seen.add(k);
            this._bumpAllocMap(map, k, amount, partyId);
        });
    },

    _applySessionMappedVoucher(map, mv) {
        if (!mv) return;
        if (mv.allocations && mv.allocations.length > 0) {
            const vTds = parseFloat(mv.tdsAmount) || 0;
            const vDisc = parseFloat(mv.discountAmount) || 0;
            const totalAllocAmt = mv.allocations.reduce((s, a) => s + (parseFloat(a?.amount) || 0), 0);
            const hasAnyAllocTds = mv.allocations.some(a => (parseFloat(a?.tdsAmount) || 0) > 0);
            const hasAnyAllocDisc = mv.allocations.some(a => (parseFloat(a?.discountAmount) || 0) > 0);

            mv.allocations.forEach(a => {
                const baseAmt = parseFloat(a.amount) || 0;
                const ratio = totalAllocAmt > 0 ? (baseAmt / totalAllocAmt) : 0;
                const tdsAmt = (parseFloat(a.tdsAmount) || 0) + ((!hasAnyAllocTds && vTds > 0) ? (vTds * ratio) : 0);
                const discAmt = (parseFloat(a.discountAmount) || 0) + ((!hasAnyAllocDisc && vDisc > 0) ? (vDisc * ratio) : 0);
                const amount = baseAmt + tdsAmt + discAmt;
                if (amount <= 0) return;
                this._bumpAllocRefsOnce(map, [a.id, a.no, a.invoiceNo, a.billNo], amount, mv.customerId);
            });
        } else if (mv.linkedInvoices && mv.linkedInvoices.length > 0) {
            const totalSettlement = (parseFloat(mv.amount) || 0) + (parseFloat(mv.tdsAmount) || 0) + (parseFloat(mv.discountAmount) || 0);
            mv.linkedInvoices.forEach(id => {
                const cleanId = id.toString().trim();
                const amt = mv.allocations?.find(a => (a.id || '').toString().trim() === cleanId)?.amount
                    || (totalSettlement / mv.linkedInvoices.length);
                this._bumpAllocMap(map, cleanId, parseFloat(amt), mv.customerId);
            });
        }
    },

    _applySessionBankTransactions(map, extraTransactions, vouchers, filterType, excludeTxIndex = -1) {
        if (!Array.isArray(extraTransactions)) return;
        extraTransactions.forEach((tx, txIndex) => {
            if (excludeTxIndex >= 0 && txIndex === excludeTxIndex) return;
            const txVchType = this._bankTxVoucherType(tx);
            if (filterType && txVchType !== filterType) return;

            const mv = tx.mappedVoucher || tx.mappedData;
            const vchId = (tx.voucherId || tx.linkedVoucherId || '').toString().trim();
            const dbVch = vchId
                ? (vouchers || []).find(v => v.id === vchId || v.bookkeeperId === vchId)
                : null;
            const dbHasAlloc = dbVch && Array.isArray(dbVch.allocations) && dbVch.allocations.length > 0;

            if (!tx.isReady || !mv) return;

            const hasDetailAlloc = Array.isArray(mv.allocations) && mv.allocations.length > 0;
            const hasLinkedInvList = Array.isArray(mv.linkedInvoices) && mv.linkedInvoices.length > 0;

            // Ready session rows with line allocations always count (even if converted flag set by bank links).
            if (hasDetailAlloc) {
                this._applySessionMappedVoucher(map, mv);
                return;
            }

            if (!tx.converted && !tx.imported) {
                if (tx.linkedVoucherId && !hasLinkedInvList) {
                    const lvid = tx.linkedVoucherId.toString().trim();
                    if (lvid) {
                        this._bumpAllocMap(map, lvid, parseFloat(tx.amount || 0), mv?.customerId);
                    }
                }
                this._applySessionMappedVoucher(map, mv);
                return;
            }

            // Imported row: use session mapped lines when DB voucher has no allocation detail yet
            if (tx.converted && !dbHasAlloc) {
                this._applySessionMappedVoucher(map, mv);
            }
        });
    },

    /**
     * Initialize if needed
     */
    init() {
        console.log('VoucherManager initialized');
    },

    /** Stable key for per-mode serial tracking (GST vs Plain vs Purchase). */
    _serialKey(type, mode) {
        if (mode === undefined || mode === null || mode === '') return type;
        return `${type}::${mode}`;
    },

    /** Bank statement rows use credit/debit; voucher logic uses receipt/payment. */
    _bankTxVoucherType(tx) {
        const t = (tx?.type || '').toString().toLowerCase();
        if (t === 'debit') return 'payment';
        if (t === 'credit') return 'receipt';
        return t;
    },

    /** Whether a voucher belongs to the same Plain/GST/Purchase bucket as the UI mode. */
    _voucherMatchesMode(v, type, mode) {
        if (!v || v.type !== type || !v.id) return false;
        if (!mode) return true;
        if (mode === 'gst') {
            return v.hasGst !== false;
        }
        if (mode === 'non-gst') {
            return v.hasGst === false;
        }
        if (mode === 'purchase') {
            if (v.type !== 'payment' || v.isPurchase === false) return false;
            if (typeof VouchersUI !== 'undefined' && typeof VouchersUI._isBookkeeperPurchaseReturnPaymentVoucher === 'function' &&
                VouchersUI._isBookkeeperPurchaseReturnPaymentVoucher(v)) return false;
            return true;
        }
        return true;
    },

    /**
     * Create a new voucher
     * @param {Object} data - Voucher data
     */
    async createVoucher(data) {
        const vouchers = DataManager.getData('vouchers') || [];

        const rawName = (data.customerName || '').trim();
        if (!rawName) {
            throw new Error('Customer or vendor name is required.');
        }
        const customers = DataManager.getData('customers') || [];
        const cid = (data.customerId || '').toString().trim();
        let party = cid ? customers.find(c => c.id === cid) : null;
        if (!party) {
            party = customers.find(c => (c.name || '').trim().toLowerCase() === rawName.toLowerCase());
        }
        if (!party) {
            throw new Error('Voucher must be linked to a saved customer or vendor account.');
        }
        data.customerId = party.id;
        data.customerName = party.name;
        if (!data.customerAddress && party.address) {
            data.customerAddress = party.address;
        }

        // 1. Generate/Verify ID Uniqueness
        let id = data.id;
        const voucherMode = data.isPurchase ? 'purchase' : (data.hasGst === false ? 'non-gst' : 'gst');

        if (!id) {
            id = this.getNextVoucherNumber(data.type, data.date, voucherMode);
        }

        // Final Collision Check: If this ID is ALREADY in the database or our local session tracker, 
        // keep incrementing until we find a truly unique one.
        const sk = this._serialKey(data.type, voucherMode);
        let uniqueId = id;
        let attempts = 0;
        while (attempts < 100) {
            const isDuplicate = vouchers.some(v => v.id === uniqueId) || 
                               (this._lastSerials[sk] === uniqueId);
            
            if (!isDuplicate) break;
            
            // Increment
            uniqueId = this.getNextVoucherNumber(data.type, data.date, voucherMode);
            attempts++;
        }

        const voucher = {
            id: uniqueId,
            date: data.date,
            type: data.type, // 'receipt', 'payment', 'contra'
            customerName: data.customerName,
            customerId: data.customerId,
            customerAddress: data.customerAddress || null,
            amount: parseFloat(data.amount),
            tdsAmount: parseFloat(data.tdsAmount || 0),
            discountAmount: parseFloat(data.discountAmount || 0),
            paymentMode: data.paymentMode, // 'cash', 'bank', 'cheque', 'upi'
            referenceId: data.referenceId || '',
            linkedInvoices: data.linkedInvoices || [], // Array of invoice IDs being paid
            allocations: data.allocations || [], // NEW: Detailed allocations [{id, no, amount}]
            advanceAmount: parseFloat(data.advanceAmount || 0),
            remarks: data.remarks || '',
            hasGst: data.hasGst,
            isPurchase: data.isPurchase,
            source: data.source || 'local',
            createdAt: new Date().toISOString()
        };

        // Record it immediately to prevent the next call in a loop from taking the same ID
        this.recordUsedSerial(data.type, uniqueId, voucherMode);

        vouchers.push(voucher);
        await DataManager.saveData('vouchers', vouchers, { skipPreSaveMerge: true });

        // Update linked document statuses in the background — can scan many invoices and block the UI if awaited
        const allocIds = (data.allocations || []).flatMap(a => [a.id, a.no, a.billNo, a.invoiceNo].filter(Boolean));
        const linkIds = data.linkedInvoices || [];
        const allLinked = [...new Set([...linkIds, ...allocIds])];
        if (allLinked.length > 0) {
            try {
                await this.updateLinkedInvoices(allLinked, data.type);
            } catch (err) {
                console.error('[VoucherManager] updateLinkedInvoices:', err);
            }
        }

        this.invalidateAllocationsCache();
        return voucher;
    },

    /**
     * update linked documents status
     */
    async updateLinkedInvoices(invoiceIds, voucherType, extraTransactions = null, options = {}) {
        const persist = options.persist !== false;
        // Bank session save: never mutate invoice cache until Import Saved creates a real voucher.
        if (!persist) return;

        // Load Invoices and Expenses
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const purchases = DataManager.getData('purchases') || [];
        const mapFilter = voucherType === 'payment' ? 'payment' : 'receipt';

        let modifiedInv = false;
        let modifiedExp = false;
        let modifiedPur = false;

        const findInvIdx = (raw) => {
            let idx = invoices.findIndex(i => i.id === raw);
            if (idx !== -1) return idx;
            const s = (raw || '').toString().trim();
            if (!s) return -1;
            return invoices.findIndex(i =>
                (i.invoiceNo != null && i.invoiceNo.toString().trim() === s) ||
                (i.id != null && i.id.toString().trim() === s)
            );
        };
        const findExpIdx = (raw) => {
            let idx = expenses.findIndex(e => e.id === raw);
            if (idx !== -1) return idx;
            const s = (raw || '').toString().trim();
            if (!s) return -1;
            return expenses.findIndex(e =>
                (e.billNo != null && e.billNo.toString().trim() === s) ||
                (e.vch_no != null && e.vch_no.toString().trim() === s) ||
                (e.invoiceNo != null && e.invoiceNo.toString().trim() === s)
            );
        };
        const findPurIdx = (raw) => {
            if (purchases === expenses) return -1;
            let idx = purchases.findIndex(p => p.id === raw);
            if (idx !== -1) return idx;
            const s = (raw || '').toString().trim();
            if (!s) return -1;
            return purchases.findIndex(p =>
                (p.billNo != null && p.billNo.toString().trim() === s) ||
                (p.vch_no != null && p.vch_no.toString().trim() === s) ||
                (p.invoiceNo != null && p.invoiceNo.toString().trim() === s)
            );
        };

        const explicitIndex = this.buildExplicitPaidIndex(extraTransactions, mapFilter);

        for (const id of invoiceIds) {
            // 1. Check Sales Invoices
            const invIndex = findInvIdx(id);
            if (invIndex !== -1) {
                const doc = invoices[invIndex];
                const total = parseFloat(doc.total || doc.amount || 0);
                const explicitPaid = this.lookupExplicitPaidAmount(doc, explicitIndex);
                const balance = Math.max(0, total - explicitPaid);
                const paidSoFar = explicitPaid;
                
                if (balance <= 0.05) { 
                    invoices[invIndex].status = 'paid';
                    invoices[invIndex].balanceDue = 0;
                } else if (paidSoFar > 0.05) {
                    invoices[invIndex].status = 'partial';
                    invoices[invIndex].balanceDue = Math.max(0, balance);
                } else {
                    invoices[invIndex].status = 'pending';
                    invoices[invIndex].balanceDue = Math.max(0, balance);
                }
                invoices[invIndex].paidSoFar = Math.max(0, paidSoFar);
                modifiedInv = true;
                continue;
            }

            // 2. Check Expenses (same storage key as purchases — KEYS.EXPENSES is 'purchases')
            const expIndex = findExpIdx(id);
            if (expIndex !== -1) {
                const doc = expenses[expIndex];
                const total = parseFloat(doc.total || doc.amount || doc.vch_amt || 0);
                const alt = doc.billNo || doc.vch_no || doc.invoiceNo;
                const explicitPaid = this.lookupExplicitPaidAmount(doc, explicitIndex);
                const balance = Math.max(0, total - explicitPaid);
                const paidSoFar = explicitPaid;
                
                if (balance <= 0.05) {
                    expenses[expIndex].status = 'paid';
                } else if (paidSoFar > 0.05) {
                    expenses[expIndex].status = 'partial';
                } else {
                    expenses[expIndex].status = 'pending';
                }
                modifiedExp = true;
                continue;
            }

            // 3. Check Purchases array (legacy duplicate key — skip if same ref as expenses)
            const purIndex = findPurIdx(id);
            if (purIndex !== -1) {
                const doc = purchases[purIndex];
                const total = parseFloat(doc.total || doc.amount || 0);
                const alt = doc.billNo || doc.vch_no || doc.invoiceNo;
                const explicitPaid = this.lookupExplicitPaidAmount(doc, explicitIndex);
                const balance = Math.max(0, total - explicitPaid);
                const paidSoFar = explicitPaid;
                
                if (balance <= 0.05) {
                    purchases[purIndex].status = 'paid';
                } else if (paidSoFar > 0.05) {
                    purchases[purIndex].status = 'partial';
                } else {
                    purchases[purIndex].status = 'pending';
                }
                modifiedPur = true;
            }
        }

        if (modifiedInv) await DataManager.saveData('invoices', invoices);
        if (modifiedExp) await DataManager.saveData(DataManager.KEYS.EXPENSES, expenses);
        if (modifiedPur) await DataManager.saveData('purchases', purchases);
        if (modifiedInv || modifiedExp || modifiedPur) {
            this.invalidateAllocationsCache();
            if (typeof InvoiceManager !== 'undefined' && InvoiceManager._balanceCache) {
                InvoiceManager._balanceCache = null;
            }
        }
    },

    /**
     * Get voucher by ID
     */
    getVoucher(id) {
        const vouchers = DataManager.getData('vouchers') || [];
        const sid = (id == null ? '' : String(id)).trim();
        if (!sid) return null;
        let v = vouchers.find(x => x.id === sid);
        if (v) return v;
        v = vouchers.find(x => x.bookkeeperId === sid);
        if (v) return v;

        // Fallback: Check Expenses (for Purchase Vouchers)
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const exp = expenses.find(e => e.id === id);
        if (exp) {
            return {
                ...exp,
                type: 'purchase',
                amount: exp.amount || exp.total || exp.vch_amt || 0,
                customerName: exp.vendor || exp.partyName || exp.supplier || exp.customerName,
                date: exp.date || exp.vch_date
            };
        }
        return null;
    },

    /**
     * Sum amounts on allocation / linked lines (BookKeeper remittance rows), excluding voucher-level TDS/discount fields.
     */
    sumAllocationLineAmounts(voucher) {
        if (!voucher || typeof voucher !== 'object') return 0;
        if (Array.isArray(voucher.allocations) && voucher.allocations.length > 0) {
            return voucher.allocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
        }
        const linked = voucher.linkedInvoices || [];
        let sum = 0;
        for (const link of linked) {
            if (link && typeof link === 'object' && link.amount != null) {
                sum += parseFloat(link.amount) || 0;
            }
        }
        return sum;
    },

    /**
     * Bank/cash + TDS + discount for UI/ledger/PDF. When imported rows only store bank received but allocation
     * lines sum to invoice totals, infer the gap as TDS (BookKeeper "Tax Deducted Receivable") or discount from narration.
     */
    resolveSettlementDisplay(voucher) {
        const bank = parseFloat(voucher?.amount) || 0;
        let tds = parseFloat(voucher?.tdsAmount) || 0;
        let disc = parseFloat(voucher?.discountAmount) || 0;
        const allocSum = this.sumAllocationLineAmounts(voucher);
        if (allocSum > 0.01) {
            const gap = allocSum - bank - tds - disc;
            if (gap > 0.02) {
                const n = String(voucher?.remarks || voucher?.narration || '').toLowerCase();
                if (/\b(discount|cash\s*disc|rebate|cash\s*discount)\b/.test(n) && !/\b(tds|tax\s*deduct|withheld)\b/.test(n)) {
                    disc += gap;
                } else {
                    tds += gap;
                }
            }
        }
        return {
            bankAmount: bank,
            tdsAmount: tds,
            discountAmount: disc,
            allocSum,
            totalSettlement: bank + tds + disc
        };
    },

    /**
     * Get all vouchers
     */
    getAllVouchers() {
        return DataManager.getData('vouchers') || [];
    },

    /**
     * Delete voucher - also reverts linked invoice/bill statuses
     */
    async deleteVoucher(id) {
        const vouchers = DataManager.getData('vouchers') || [];
        const index = vouchers.findIndex(v => v.id === id);

        if (index === -1) return;

        const voucher = vouchers[index];
        const linkedInvoices = voucher.linkedInvoices || [];

        // Move to Recycle Bin BEFORE removing
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        bin.push({
            ...voucher,
            _deletedAt: new Date().toISOString(),
            _recordType: 'voucher'
        });
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, bin);

        // Remove the voucher
        vouchers.splice(index, 1);
        // Deletion must not be union-merged with cloud, otherwise deleted row can reappear.
        await DataManager.saveData('vouchers', vouchers, { skipPreSaveMerge: true });

        // Revert linked invoice/bill statuses
        await this.revertLinkedInvoices(linkedInvoices, voucher, vouchers);
    },

    /**
     * Restore voucher from recycle bin
     */
    async restoreVoucher(id) {
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        const index = bin.findIndex(item => item.id === id && item._recordType === 'voucher');

        if (index === -1) throw new Error('Voucher not found in Recycle Bin');

        const voucher = { ...bin[index] };
        delete voucher._deletedAt;
        delete voucher._recordType;

        const vouchers = DataManager.getData('vouchers') || [];
        vouchers.push(voucher);

        const newBin = bin.filter((_, i) => i !== index);

        await DataManager.saveData('vouchers', vouchers);
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, newBin);

        // Re-run linked invoice status updates
        if (voucher.linkedInvoices && voucher.linkedInvoices.length > 0) {
            await this.updateLinkedInvoices(voucher.linkedInvoices, voucher.type);
        }

        return voucher;
    },

    /**
     * Revert invoice/bill status back to 'unpaid' when a voucher is deleted.
     * Strategy 1: Use linkedInvoices array from the deleted voucher.
     * Strategy 2: Fallback - scan all invoices for this customer and revert
     *             paid ones that no other remaining voucher still links.
     */
    async revertLinkedInvoices(invoiceIds, deletedVoucher, remainingVouchers) {
        // Build a flat set of all invoice IDs still referenced by remaining vouchers
        const stillLinked = new Set(
            remainingVouchers.flatMap(v => v.linkedInvoices || [])
        );

        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const purchases = DataManager.getData('purchases') || [];
        let modifiedInv = false;
        let modifiedExp = false;
        let modifiedPur = false;

        const revertSet = new Set(invoiceIds);

        // Strategy 2 fallback: if no explicit linkedInvoices, or as extra safety,
        // also scan for invoices belonging to this customer that are 'paid'
        // but not referenced by any remaining voucher.
        const partyName = (deletedVoucher.customerName || '').trim().toLowerCase();
        const customerId = deletedVoucher.customerId;

        if (partyName || customerId) {
            invoices.forEach(inv => {
                if (inv.status === 'paid' && !stillLinked.has(inv.id)) {
                    const invCustName = (inv.customerName || '').trim().toLowerCase();
                    if (
                        (customerId && inv.customerId === customerId) ||
                        (partyName && invCustName === partyName)
                    ) {
                        revertSet.add(inv.id);
                        if (inv.invoiceNo) revertSet.add(inv.invoiceNo); // Safety
                    }
                }
            });

            expenses.forEach(exp => {
                if (exp.status === 'paid' && !stillLinked.has(exp.id)) {
                    const expNames = [exp.vendor, exp.customerName, exp.partyName, exp.supplier]
                        .map(n => (n || '').trim().toLowerCase());
                    
                    if (expNames.some(n => n === partyName)) {
                        revertSet.add(exp.id);
                        if (exp.billNo) revertSet.add(exp.billNo);
                        if (exp.vch_no) revertSet.add(exp.vch_no);
                    }
                }
            });
            // ... purchases handled similarly below
        }

        for (const docId of revertSet) {
            if (stillLinked.has(docId)) continue; // Protected by another voucher

            // Try to find for all collections
            const invIdx = invoices.findIndex(i => i.id === docId || i.invoiceNo === docId);
            if (invIdx !== -1 && invoices[invIdx].status === 'paid') {
                invoices[invIdx].status = 'unpaid';
                modifiedInv = true;
                continue;
            }

            const expIdx = expenses.findIndex(e => e.id === docId || e.billNo === docId || e.vch_no === docId);
            if (expIdx !== -1 && expenses[expIdx].status === 'paid') {
                expenses[expIdx].status = 'unpaid';
                modifiedExp = true;
                continue;
            }

            const purIdx = purchases.findIndex(p => p.id === docId || p.invoiceNo === docId);
            if (purIdx !== -1 && purchases[purIdx].status === 'paid') {
                purchases[purIdx].status = 'unpaid';
                modifiedPur = true;
            }
        }

        if (modifiedInv) await DataManager.saveData('invoices', invoices);
        if (modifiedExp) await DataManager.saveData(DataManager.KEYS.EXPENSES, expenses);
        if (modifiedPur) await DataManager.saveData('purchases', purchases);
    },

    /**
     * Clean Bank Description for better alias matching
     */
    cleanBankDescription(description) {
        if (!description) return '';
        let cleaned = description.toUpperCase();
        
        // Remove common transaction codes and technical noise
        cleaned = cleaned.replace(/\b(IMPS|RTGS|NEFT|TRTR|TRF|UPI|CHQ|CHEQUE|CLG|NFT|CMS|NET|BANK|TRANS|TRANSFER|OTHERS|OTHR|BIL|BILL)\b/g, ' ');
        cleaned = cleaned.replace(/\b(HDFC|ICICI|IDIB|IDBI|SBI|SBIN|KOTAK|AXIS|BARB|UTIB|YESB|PUNB|CNRB|IOBA|CBIN|KVBL)\b/g, ' ');

        // Remove long alphanumeric IDs (like IOBA00000005037217, TRTR/400311394255/IMPS)
        // We keep items that are primarily alphabetic or are meaningful names
        cleaned = cleaned.replace(/\b[A-Z0-9]{8,}\b/g, match => {
            // If it has too many digits, it's likely a reference number
            const digitCount = (match.match(/\d/g) || []).length;
            return digitCount > 3 ? ' ' : match;
        });

        // Remove pure numeric dates or transaction IDs
        cleaned = cleaned.replace(/\b\d{4,}\b/g, ' ');
        cleaned = cleaned.replace(/\b\d{2}-\d{2}-\d{4}\b/g, ' ');
        cleaned = cleaned.replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, ' ');

        // Remove special characters, keep alphanumeric and spaces
        cleaned = cleaned.replace(/[^A-Z0-9\s]/g, ' ');
        
        // Remove isolated single-character noise only (keep 2-letter tokens like AI, CO, EN in party names)
        cleaned = cleaned.replace(/\b[A-Z0-9]\b/g, ' ');

        // Compress multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    },

    isDistinctiveBankAliasKey(key) {
        const k = String(key || '').trim().toUpperCase();
        if (!k || k.length < 4) return false;
        if (this.BANK_ALIAS_STOPWORDS.has(k)) return false;
        if (/^\d+$/.test(k)) return false;
        return true;
    },

    extractDistinctiveBankTokens(description) {
        const cleaned = this.cleanBankDescription(description);
        if (!cleaned) return [];
        return cleaned.split(/\s+/).filter((w) => this.isDistinctiveBankAliasKey(w));
    },

    _partyDescOverlapTokens(description, partyName) {
        const cleaned = this.cleanBankDescription(description);
        if (!cleaned) return [];
        return String(partyName || '').toUpperCase().split(/\s+/)
            .filter((w) => this.isDistinctiveBankAliasKey(w))
            .filter((tok) => {
                try {
                    const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    return re.test(cleaned);
                } catch (_) {
                    return false;
                }
            })
            .sort();
    },

    /**
     * Fingerprints saved when user assigns a party — only the same details should match later.
     * full:<cleaned> = exact same bank narrative after noise removal
     * sig:a|b = ALL listed tokens must appear in the description
     */
    getBankAssignmentFingerprints(description, partyName) {
        const cleaned = this.cleanBankDescription(description);
        const fps = new Set();
        if (cleaned.length >= 8) fps.add(`full:${cleaned}`);

        const overlap = this._partyDescOverlapTokens(description, partyName);
        if (overlap.length >= 2) fps.add(`sig:${overlap.join('|')}`);
        else if (overlap.length === 1 && overlap[0].length >= 5) fps.add(`sig:${overlap[0]}`);

        return [...fps];
    },

    /** Session grouping key — same detail pattern only (not generic tokens). */
    getBankMatchSignature(description, partyName) {
        const cleaned = this.cleanBankDescription(description);
        if (partyName) {
            const overlap = this._partyDescOverlapTokens(description, partyName);
            if (overlap.length >= 2) return `sig:${overlap.join('|')}`;
            if (overlap.length === 1 && overlap[0].length >= 5) return `sig:${overlap[0]}`;
        }
        return `full:${cleaned}`;
    },

    _sanitizeBankAliasMappings(mappings) {
        const out = {};
        for (const [key, party] of Object.entries(mappings || {})) {
            if (!key || !party) continue;
            const k = String(key).trim();
            if (k.startsWith('full:') || k.startsWith('sig:')) {
                out[k] = party;
                continue;
            }
            // Legacy: keep only long full-description keys (never bare tokens like GAS/OTHERS/BHOX)
            if (k.length >= 20 && !this.isDistinctiveBankAliasKey(k.split(/\s+/)[0])) {
                out[`full:${k}`] = party;
            }
        }
        return out;
    },

    _getBankAliasMappings() {
        if (!this._bankAliasCache) {
            const raw = DataManager.getData('gtes_bank_alias') || {};
            this._bankAliasCache = this._sanitizeBankAliasMappings(raw);
        }
        return this._bankAliasCache;
    },

    _sigTokensPresent(required, cleaned, descTokens) {
        return required.every((tok) => {
            if (descTokens.has(tok)) return true;
            try {
                const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                return re.test(cleaned);
            } catch (_) {
                return false;
            }
        });
    },

    /**
     * Save mapping from a user assignment — keyed by this row's specific details only.
     */
    async saveBankMapping(description, partyName) {
        if (!description || !partyName) return;

        const mappings = { ...this._getBankAliasMappings() };
        const fingerprints = this.getBankAssignmentFingerprints(description, partyName);
        if (fingerprints.length === 0) return;

        fingerprints.forEach((fp) => {
            mappings[fp] = partyName;
        });

        this._bankAliasCache = this._sanitizeBankAliasMappings(mappings);
        await DataManager.saveData('gtes_bank_alias', this._bankAliasCache);
    },

    /**
     * Resolve party only when description matches a saved fingerprint (exact details).
     */
    resolveBankParty(description) {
        const mappings = this._getBankAliasMappings();
        const cleaned = this.cleanBankDescription(description);
        if (!cleaned || cleaned.length < 3) return null;

        const descTokens = new Set(this.extractDistinctiveBankTokens(description));

        if (mappings[`full:${cleaned}`]) return mappings[`full:${cleaned}`];
        if (mappings[cleaned]) return mappings[cleaned];

        let best = null;
        let bestSpecificity = 0;
        for (const [key, party] of Object.entries(mappings)) {
            if (!key.startsWith('sig:') || !party) continue;
            const required = key.slice(4).split('|').filter(Boolean);
            if (required.length === 0) continue;
            if (!this._sigTokensPresent(required, cleaned, descTokens)) continue;
            const specificity = required.join('|').length + (required.length * 5);
            if (specificity > bestSpecificity) {
                best = party;
                bestSpecificity = specificity;
            }
        }
        return best;
    },

    _normalizeBankTxDate(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    },

    /** Stable key for the same bank line across re-imports of the same statement file. */
    buildBankTxFingerprint(tx) {
        const type = tx?.type === 'debit' ? 'debit' : 'credit';
        const dateStr = this._normalizeBankTxDate(tx?.date);
        const amt = (Math.round((parseFloat(tx?.amount) || 0) * 100) / 100).toFixed(2);
        const desc = this.cleanBankDescription(tx?.description || '');
        return `${type}|${dateStr}|${amt}|${desc}`;
    },

    getBankVoucherLinks() {
        const key = (typeof DataManager !== 'undefined' && DataManager.KEYS?.BANK_LINKS) || 'gtes_bank_links';
        const raw = DataManager.getData(key);
        return Array.isArray(raw) ? raw : [];
    },

    voucherExistsById(voucherId) {
        const id = String(voucherId || '').trim();
        if (!id) return false;
        return (this.getAllVouchers() || []).some((v) => {
            const vid = String(v.id || v.voucherId || '').trim();
            return vid === id;
        });
    },

    _bankTxLooseMatch(tx, record) {
        if (!tx || !record) return false;
        const type = tx.type === 'debit' ? 'debit' : 'credit';
        const recType = record.type === 'debit' ? 'debit' : 'credit';
        if (type !== recType) return false;
        if (this._normalizeBankTxDate(tx.date) !== this._normalizeBankTxDate(record.date)) return false;
        if (Math.abs((parseFloat(tx.amount) || 0) - (parseFloat(record.amount) || 0)) > 0.01) return false;
        const txDesc = this.cleanBankDescription(tx.description || '');
        const recDesc = record.descriptionClean || this.cleanBankDescription(record.description || '');
        return txDesc === recDesc;
    },

    findBankVoucherLink(tx) {
        if (!tx) return null;
        const links = this.getBankVoucherLinks();
        const fp = this.buildBankTxFingerprint(tx);
        let record = links.find((l) => l.fingerprint === fp);
        if (!record) {
            record = links.find((l) => this._bankTxLooseMatch(tx, l));
        }
        if (record?.linkedVoucherId && !this.voucherExistsById(record.linkedVoucherId)) {
            return null;
        }
        return record || null;
    },

    getBankTxLinkInfo(tx) {
        const link = this.findBankVoucherLink(tx);
        if (link?.linkedVoucherId) {
            return { linkedVoucherId: link.linkedVoucherId, linkType: link.linkType || 'manual' };
        }
        if (tx?.linkedVoucherId && this.voucherExistsById(tx.linkedVoucherId)) {
            return { linkedVoucherId: tx.linkedVoucherId, linkType: 'session' };
        }
        return null;
    },

    async saveBankVoucherLink(tx, voucherId, extra = {}) {
        if (!tx || !voucherId) return;
        const key = (typeof DataManager !== 'undefined' && DataManager.KEYS?.BANK_LINKS) || 'gtes_bank_links';
        const links = this.getBankVoucherLinks();
        const fingerprint = this.buildBankTxFingerprint(tx);
        const record = {
            fingerprint,
            type: tx.type === 'debit' ? 'debit' : 'credit',
            date: this._normalizeBankTxDate(tx.date),
            amount: parseFloat(tx.amount) || 0,
            description: tx.description || '',
            descriptionClean: this.cleanBankDescription(tx.description || ''),
            linkedVoucherId: String(voucherId).trim(),
            linkType: extra.linkType || 'manual',
            adjustment: extra.adjustment || null,
            linkedAt: new Date().toISOString()
        };
        const idx = links.findIndex((l) => l.fingerprint === fingerprint);
        if (idx >= 0) links[idx] = record;
        else links.push(record);
        await DataManager.saveData(key, links);
    },

    async removeBankVoucherLink(tx) {
        if (!tx) return;
        const key = (typeof DataManager !== 'undefined' && DataManager.KEYS?.BANK_LINKS) || 'gtes_bank_links';
        const fp = this.buildBankTxFingerprint(tx);
        const links = this.getBankVoucherLinks().filter(
            (l) => l.fingerprint !== fp && !this._bankTxLooseMatch(tx, l)
        );
        await DataManager.saveData(key, links);
    },

    applyPersistedLinksToBankTransactions(transactions) {
        if (!Array.isArray(transactions)) return transactions;
        transactions.forEach((tx) => {
            const hasSessionMap = tx.isReady && !!(tx.mappedVoucher || tx.mappedData);
            if (hasSessionMap) return;
            const link = this.findBankVoucherLink(tx);
            if (link?.linkedVoucherId) {
                tx.linkedVoucherId = link.linkedVoucherId;
                tx.converted = true;
                tx.bankLinkPersisted = true;
            }
        });
        return transactions;
    },

    _bankImportSessionKey() {
        return (typeof DataManager !== 'undefined' && DataManager.KEYS?.BANK_IMPORT_SESSION) || 'gtes_bank_import_session';
    },

    getBankImportSessionRows() {
        const raw = DataManager.getData(this._bankImportSessionKey());
        return Array.isArray(raw) ? raw : [];
    },

    /** Persist a ready-to-import row until Import Saved (survives closing/re-opening the same bank file). */
    async saveBankImportSessionRow(tx) {
        if (!tx || !tx.isReady) return;
        const mv = tx.mappedVoucher || tx.mappedData;
        if (!mv) return;
        const fp = this.buildBankTxFingerprint(tx);
        const rows = this.getBankImportSessionRows();
        const entry = {
            fingerprint: fp,
            isReady: true,
            mappedVoucher: JSON.parse(JSON.stringify(mv)),
            bankAssignedParty: (tx.bankAssignedParty || tx.assignedParty || '').toString(),
            savedAt: new Date().toISOString()
        };
        const idx = rows.findIndex((r) => r.fingerprint === fp);
        if (idx >= 0) rows[idx] = entry;
        else rows.push(entry);
        await DataManager.saveData(this._bankImportSessionKey(), rows);
    },

    async removeBankImportSessionRow(tx) {
        if (!tx) return;
        const fp = this.buildBankTxFingerprint(tx);
        const rows = this.getBankImportSessionRows().filter((r) => r.fingerprint !== fp);
        await DataManager.saveData(this._bankImportSessionKey(), rows);
    },

    /** Re-attach saved session voucher details when the same bank statement file is imported again. */
    restoreBankImportSessionToTransactions(transactions) {
        if (!Array.isArray(transactions)) return transactions;
        const rows = this.getBankImportSessionRows();
        if (!rows.length) return transactions;
        transactions.forEach((tx) => {
            const fp = this.buildBankTxFingerprint(tx);
            const entry = rows.find((r) => r.fingerprint === fp);
            if (!entry?.isReady || !entry.mappedVoucher) return;
            const link = this.findBankVoucherLink(tx);
            if (link?.linkedVoucherId && this.voucherExistsById(link.linkedVoucherId)) return;
            if (tx.isReady && (tx.mappedVoucher || tx.mappedData)) return;
            tx.isReady = true;
            tx.mappedVoucher = entry.mappedVoucher;
            tx.converted = false;
            if (entry.bankAssignedParty) tx.bankAssignedParty = entry.bankAssignedParty;
        });
        return transactions;
    },

    /**
     * Check if a voucher already exists for a given party, amount and date
     */
    checkDuplicateVoucher(partyName, amount, date, opts = {}) {
        if (!partyName || !amount || !date) return false;
        const d_amount = parseFloat(amount);
        const p_name = partyName.trim().toLowerCase();
        const d_date_str = this._normalizeBankTxDate(date);
        if (!d_date_str) return false;
        const expectedType = opts.voucherType || null;
        const cacheKey = `${p_name}|${d_amount.toFixed(2)}|${d_date_str}|${expectedType || 'any'}`;
        const voucherCount = (DataManager.getData('vouchers') || []).length;
        if (this._dupVoucherCache && this._dupVoucherCacheVoucherCount === voucherCount) {
            if (this._dupVoucherCache.has(cacheKey)) return this._dupVoucherCache.get(cacheKey);
        } else {
            this._dupVoucherCache = new Map();
            this._dupVoucherCacheVoucherCount = voucherCount;
        }

        const vouchers = this.getAllVouchers();
        const hit = vouchers.some(v => {
            if (expectedType && (v.type || 'receipt') !== expectedType) return false;
            const v_name = (v.customerName || '').trim().toLowerCase();
            const v_date = this._normalizeBankTxDate(v.date);
            if (!v_name || !v_date) return false;
            if (v_name !== p_name) return false;
            if (Math.abs(parseFloat(v.amount) - d_amount) >= 0.01) return false;
            if (v_date === d_date_str) return true;
            const diff = Math.abs(new Date(v_date).getTime() - new Date(d_date_str).getTime());
            return diff <= 86400000;
        });
        this._dupVoucherCache.set(cacheKey, hit);
        return hit;
    },

    /** Find saved voucher matching a bank row (party + amount + date + receipt/payment type). */
    findMatchingVoucherForBankTx(tx) {
        const partyName = (typeof VouchersUI !== 'undefined' && VouchersUI.resolveBankTxPartyName)
            ? VouchersUI.resolveBankTxPartyName(tx)
            : (tx.bankAssignedParty || tx.assignedParty || '').toString().trim();
        if (!partyName || !tx?.amount || !tx?.date) return null;

        const amount = parseFloat(tx.amount);
        if (!amount) return null;
        const txDate = this._normalizeBankTxDate(tx.date);
        if (!txDate) return null;
        const expectedType = tx.type === 'debit' ? 'payment' : 'receipt';
        const pNorm = partyName.trim().toLowerCase();

        return this.getAllVouchers().find((v) => {
            if ((v.type || 'receipt') !== expectedType) return false;
            const vName = (v.customerName || '').trim().toLowerCase();
            if (vName !== pNorm) return false;
            if (Math.abs(parseFloat(v.amount) - amount) >= 0.01) return false;
            const vDate = this._normalizeBankTxDate(v.date);
            if (!vDate) return false;
            if (vDate === txDate) return true;
            const diff = Math.abs(new Date(vDate).getTime() - new Date(txDate).getTime());
            return diff <= 86400000;
        }) || null;
    },

    /**
     * Cache for the last used serial to ensure immediate increment even 
     * if the database sync is slightly delayed.
     */
    _lastSerials: {},

    /**
     * Track a used serial number in real-time (per type + Plain/GST/Purchase mode).
     */
    recordUsedSerial(type, id, mode = null) {
        if (!type || !id) return;
        this._lastSerials[this._serialKey(type, mode)] = id;
    },

    /**
     * Get next sequential voucher number for a type.
     * @param {string} type - receipt | payment | contra
     * @param {Date|string|null} date - for financial year prefix
     * @param {string|null} mode - 'gst' | 'non-gst' | 'purchase' — only count vouchers in this bucket (Plain vs GST vs Purchase)
     */
    getNextVoucherNumber(type, date = null, mode = null) {
        let vouchers = DataManager.getData('vouchers') || [];
        const year = DataManager.getFinancialYear(date || new Date());
        const typeCode = type === 'receipt' ? 'RCT' : (type === 'payment' ? 'PMT' : (type === 'contra' ? 'CNT' : 'VCH'));
        const defaultPrefix = `${typeCode}-${year}-`;
        
        // 1. Combine with Bank Import Queue (only vouchers that match this mode — avoids Plain next # jumping to GST/bank RCT-…1338)
        if (typeof VouchersUI !== 'undefined' && VouchersUI.currentBankTransactions) {
            const queueVouchers = VouchersUI.currentBankTransactions
                .filter(tx => tx.mappedVoucher || tx.mappedData)
                .map(tx => tx.mappedVoucher || tx.mappedData)
                .filter(v => this._voucherMatchesMode(v, type, mode));
            vouchers = vouchers.concat(queueVouchers);
        }

        // 2. Filter by type and Plain/GST/Purchase bucket
        const typeVouchers = vouchers.filter(v => this._voucherMatchesMode(v, type, mode));
        const typeVouchersByDate = [...typeVouchers].sort((a, b) => {
            const da = new Date(a.date || a.createdAt || 0).getTime();
            const db = new Date(b.date || b.createdAt || 0).getTime();
            return db - da;
        });
        
        // 3. Find the "Best" prefix to follow (most recently dated voucher in this bucket).
        let targetPrefix = defaultPrefix;
        
        const serialKey = this._serialKey(type, mode);
        const lastSessionId = this._lastSerials[serialKey];
        
        if (lastSessionId) {
            const lastMatch = lastSessionId.match(/^(.*?)(\d+)$/);
            if (lastMatch) targetPrefix = lastMatch[1];
        } else if (typeVouchersByDate.length > 0) {
            const lastVch = typeVouchersByDate[0];
            const lastMatch = (lastVch.id || '').match(/^(.*?)(\d+)$/);
            if (lastMatch) targetPrefix = lastMatch[1];
        }

        // 4. Find the maximum number for THIS specific prefix
        let maxNum = 0;
        let padding = 1;

        // Combine database vouchers with our local tracking cache for max number check
        const allReferenceIds = typeVouchersByDate.map(v => v.id);
        if (lastSessionId) allReferenceIds.push(lastSessionId);

        for (const vid of allReferenceIds) {
            const match = (vid || '').match(/^(.*?)(\d+)$/);
            if (match && match[1] === targetPrefix) {
                const n = parseInt(match[2], 10);
                if (n > maxNum) {
                    maxNum = n;
                    padding = match[2].length;
                }
            }
        }

        // Fallback: If no vouchers match the latest prefix (rare), or if we are forced to default,
        // scan everything to find the globally highest record of this type.
        if (maxNum === 0) {
            for (const v of typeVouchersByDate) {
                const match = (v.id || '').match(/^(.*?)(\d+)$/);
                if (match) {
                    const n = parseInt(match[2], 10);
                    if (n > maxNum) {
                        maxNum = n;
                        targetPrefix = match[1];
                        padding = match[2].length;
                    }
                }
            }
        }

        // Also check our local cache for immediate override protection
        if (this._lastSerials[serialKey]) {
            const match = this._lastSerials[serialKey].match(/^(.*?)(\d+)$/);
            if (match && match[1] === targetPrefix) {
                const n = parseInt(match[2], 10);
                if (n > maxNum) {
                    maxNum = n;
                }
            }
        }
        
        if (maxNum === 0) {
            // Plain numeric-only IDs (e.g. "10") use unpadded next number
            if (!targetPrefix || targetPrefix === '') {
                return String(1).padStart(Math.max(padding, 2), '0');
            }
            return `${targetPrefix}001`;
        }

        const nextNum = maxNum + 1;
        if (!targetPrefix || targetPrefix === '') {
            return String(nextNum).padStart(Math.max(padding, 2), '0');
        }
        return targetPrefix + String(nextNum).padStart(Math.max(padding, 3), '0');
    },

    /**
     * Older BookKeeper imports keyed allocations by internal vch_no (e.g. 8577) while bills use bill_no (00349).
     * Mirror those amounts onto id / billNo / invoiceNo when the canonical key is missing.
     */
    _applyBookkeeperVchAliasMirrors(map, filterType) {
        if (filterType && filterType !== 'payment' && filterType !== 'receipt') return;

        const mirrorIfMissing = (internalRaw, canonicalRaw) => {
            const I = (internalRaw || '').toString().trim();
            let C = canonicalRaw;
            if (C === undefined || C === null || C === '') return;
            C = C.toString().trim();
            if (!I || !C || I === C) return;
            const amt = map.get(I);
            if (!amt || amt <= 0) return;
            if (!map.has(C)) map.set(C, amt);
        };

        if (!filterType || filterType === 'payment') {
            const exps = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
            for (const e of exps) {
                const internal = (e.bookkeeperVchNo || '').toString().trim();
                if (!internal) continue;
                if (!map.get(internal)) continue;
                mirrorIfMissing(internal, e.id);
                mirrorIfMissing(internal, e.billNo);
            }
        }
        if (!filterType || filterType === 'receipt') {
            const invs = DataManager.getData('invoices') || [];
            for (const inv of invs) {
                const internal = (inv.bookkeeperVchNo || '').toString().trim();
                if (!internal) continue;
                if (!map.get(internal)) continue;
                mirrorIfMissing(internal, inv.id);
                mirrorIfMissing(internal, inv.invoiceNo);
            }
        }
    },

    /**
     * BookKeeper often puts the original invoice number only in narration (e.g. "Invoice No: 0373").
     */
    parseSalesInvoiceRefFromNarration(text) {
        const s = String(text || '').trim();
        if (!s) return '';
        const clean = (raw) => String(raw || '').replace(/[,;.]+$/g, '').trim();
        const patterns = [
            /sales\s+invoice\s+ref\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /original\s+(?:tax\s+)?invoice\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /invoice\s*no\.?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /original\s+invoice\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /against\s+(?:sales\s+)?invoice\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /sales\s+invoice\s*(?:no\.?|number)?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /bill\s*no\.?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i
        ];
        for (const re of patterns) {
            const m = s.match(re);
            if (m && m[1]) {
                const v = clean(m[1]);
                if (v && v.length <= 48) return v;
            }
        }
        return '';
    },

    parsePurchaseInvoiceRefFromNarration(text) {
        const s = String(text || '').trim();
        if (!s) return '';
        const clean = (raw) => String(raw || '').replace(/[,;.]+$/g, '').trim();
        const patterns = [
            /purchase\s+invoice\s+ref\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /purchase\s*invoice\s*no\.?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /supplier\s*invoice\s*no\.?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /against\s+(?:purchase\s+|p\/?\s*)?(?:bill|invoice)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /against\s+(?:bill|invoice)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i,
            /invoice\s*no\.?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\/\-\.]*)/i
        ];
        for (const re of patterns) {
            const m = s.match(re);
            if (m && m[1]) {
                const v = clean(m[1]);
                if (v && v.length <= 48) return v;
            }
        }
        return '';
    },

    resolveCreditNoteSalesRef(inv) {
        if (!inv) return '';
        const tryStr = (v) => {
            const t = String(v ?? '').trim();
            return t && t !== '-' ? t : '';
        };
        const fromFields = [
            inv.referenceNo, inv.refNo, inv.refInvoiceNo, inv.baseInvoiceNo,
            inv.originalInvoiceNo, inv.salesInvoiceRef, inv.linkedInvoiceId,
            inv.againstInvoice, inv.ref_no, inv.vch_ref
        ];
        for (const c of fromFields) {
            const t = tryStr(c);
            if (t) return t;
        }
        return this.parseSalesInvoiceRefFromNarration(inv.narration || inv.remarks || inv.description || '');
    },

    resolveDebitNotePurchaseRef(exp) {
        if (!exp) return '';
        const tryStr = (v) => {
            const t = String(v ?? '').trim();
            return t && t !== '-' ? t : '';
        };
        const fromFields = [
            exp.referenceNo, exp.refNo, exp.purchaseInvoiceRef, exp.purchaseInvoiceNo,
            exp.refInvoiceNo, exp.baseInvoiceNo, exp.originalInvoiceNo,
            exp.supplierInvoiceNo, exp.supplierBillNo, exp.ref_no, exp.vch_ref
        ];
        for (const c of fromFields) {
            const t = tryStr(c);
            if (t) return t;
        }
        return this.parsePurchaseInvoiceRefFromNarration(exp.narration || exp.description || exp.remarks || '');
    },

    /**
     * Credit / debit notes that reference a specific sales or purchase bill reduce that bill's
     * outstanding (same keys as voucher allocations) so balances, paid/partial, and voucher
     * pending picklists stay aligned. Notes without a resolvable reference bill are skipped.
     */
    _applyReferencedReturnNoteOffsets(map, filterType) {
        if (filterType && filterType !== 'payment' && filterType !== 'receipt') return;

        const normName = (s) => (s || '').toString().toLowerCase().replace(/[,\s]+/g, ' ').trim();

        const billRefVariants = (raw) => {
            const t = String(raw ?? '').trim();
            if (!t || t === '-') return [];
            const out = new Set([t]);
            const stripped = t.replace(/^0+/, '') || t;
            if (stripped !== t) out.add(stripped);
            const n = parseInt(t, 10);
            if (!isNaN(n)) out.add(String(n));
            return [...out];
        };

        const refVariantSet = (refStr) => new Set(billRefVariants(refStr));

        const isCreditNoteInv = (inv) => {
            if (typeof InvoiceManager !== 'undefined' && typeof InvoiceManager._isCreditNoteDoc === 'function') {
                return InvoiceManager._isCreditNoteDoc(inv);
            }
            if (typeof BusinessAnalytics !== 'undefined' && typeof BusinessAnalytics._isCreditNoteInvoice === 'function') {
                return BusinessAnalytics._isCreditNoteInvoice(inv);
            }
            return false;
        };

        const isDebitNoteExp = (exp) => {
            if (typeof BusinessAnalytics !== 'undefined' && typeof BusinessAnalytics._isDebitNotePurchase === 'function') {
                return BusinessAnalytics._isDebitNotePurchase(exp);
            }
            const t = String(exp?.type || exp?.v_type || exp?.billType || '').toLowerCase();
            return (t.includes('debit') && t.includes('note')) || exp?.isDebitNote === true;
        };

        const addToKeys = (doc, amount, keysPick) => {
            if (!doc || amount <= 0.005) return;
            const keys = keysPick(doc);
            keys.forEach(k => {
                const ck = (k || '').toString().trim();
                if (!ck) return;
                map.set(ck, (map.get(ck) || 0) + amount);
            });
        };

        if (!filterType || filterType === 'receipt') {
            const invoices = DataManager.getData('invoices') || [];
            for (const cn of invoices) {
                if (!isCreditNoteInv(cn)) continue;
                const ref = String(this.resolveCreditNoteSalesRef(cn) || '').trim();
                if (!ref || ref === '-') continue;
                const want = refVariantSet(ref);
                if (want.size === 0) continue;
                const partyId = cn.partyId || '';
                const partyName = normName(cn.customerName || '');
                let base = null;
                for (const inv of invoices) {
                    if (isCreditNoteInv(inv)) continue;
                    const fields = [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo];
                    let hit = false;
                    for (const k of fields) {
                        if (k == null || k === '') continue;
                        for (const v of billRefVariants(k)) {
                            if (want.has(v)) {
                                hit = true;
                                break;
                            }
                        }
                        if (hit) break;
                    }
                    if (!hit) continue;
                    if (!base) base = inv;
                    const sameParty = (partyId && inv.partyId === partyId)
                        || (partyName && normName(inv.customerName || '') === partyName);
                    if (sameParty) {
                        base = inv;
                        break;
                    }
                }
                if (!base) continue;
                const amt = Math.abs(parseFloat(cn.total ?? cn.amount ?? 0) || 0);
                addToKeys(base, amt, (d) => [d.id, d.invoiceNo, d.billNo, d.bookkeeperVchNo]);
            }
        }

        if (!filterType || filterType === 'payment') {
            const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
            const purchases = DataManager.getData('purchases') || [];
            const cols = purchases === expenses ? [expenses] : [expenses, purchases];
            const seenDn = new Set();
            for (const col of cols) {
                for (const dn of col || []) {
                    if (!isDebitNoteExp(dn)) continue;
                    const dnKey = (dn.id || dn.billNo || '').toString().trim();
                    if (dnKey && seenDn.has(dnKey)) continue;
                    if (dnKey) seenDn.add(dnKey);
                    const ref = String(this.resolveDebitNotePurchaseRef(dn) || '').trim();
                    if (!ref || ref === '-') continue;
                    const want = refVariantSet(ref);
                    if (want.size === 0) continue;
                    const partyId = dn.partyId || '';
                    const partyName = normName(dn.vendor || dn.vendorName || '');
                    let base = null;
                    for (const e2 of expenses) {
                        if (isDebitNoteExp(e2)) continue;
                        if (!String(e2.category || '').toLowerCase().includes('purchase')) continue;
                        const fields = [e2.id, e2.billNo, e2.vch_no, e2.invoiceNo, e2.bookkeeperVchNo];
                        let hit = false;
                        for (const k of fields) {
                            if (k == null || k === '') continue;
                            for (const v of billRefVariants(k)) {
                                if (want.has(v)) {
                                    hit = true;
                                    break;
                                }
                            }
                            if (hit) break;
                        }
                        if (!hit) continue;
                        if (!base) base = e2;
                        const sameParty = (partyId && e2.partyId === partyId)
                            || (partyName && normName(e2.vendor || e2.vendorName || '') === partyName);
                        if (sameParty) {
                            base = e2;
                            break;
                        }
                    }
                    if (!base) continue;
                    const amt = Math.abs(parseFloat(dn.total ?? dn.amount ?? dn.vch_amt ?? 0) || 0);
                    addToKeys(base, amt, (d) => [d.id, d.billNo, d.vch_no, d.invoiceNo, d.bookkeeperVchNo]);
                }
            }
        }
    },

    /**
     * NEW: Get a map of all document allocations for fast lookup
     * @param {Array} extraTransactions - Optional list of pending bank transactions to include.
     * @param {string|null} filterType - 'receipt' | 'payment'
     * @param {{ excludeTxIndex?: number }} options - excludeTxIndex: skip one bank row (current voucher being edited)
     */
    getVoucherAllocationsMap(extraTransactions = null, filterType = null, options = {}) {
        const vouchers = this.getAllVouchers();
        const excludeTxIndex = Number.isInteger(options.excludeTxIndex) ? options.excludeTxIndex : -1;
        
        // Use a more dynamic key for caching (including filterType to prevent cross-contamination)
        const readyCount = (extraTransactions || []).filter(tx => tx.isReady && !tx.converted).length;
        const invCount = (DataManager.getData('invoices') || []).length;
        const expCount = (DataManager.getData(DataManager.KEYS.EXPENSES) || []).length;
        const cacheKey = `${filterType || 'all'}_v${vouchers.length}_i${invCount}_x${expCount}_e${extraTransactions ? extraTransactions.length : 0}_r${readyCount}_x${excludeTxIndex}`;
        const hasExtra = Array.isArray(extraTransactions) && extraTransactions.length > 0;

        if (!hasExtra && this._allocationsCache && this._lastVoucherCount === cacheKey) {
            return this._allocationsCache;
        }

        const map = new Map();

        const normName = (s) => (s || '')
            .toString()
            .toLowerCase()
            .replace(/[,\s]+/g, ' ')
            .trim();

        const partyMatchesDoc = (doc, voucher) => {
            if (!doc || !voucher) return false;
            const vId = voucher.customerId;
            const vName = normName(voucher.customerName);
            const docCustId = doc.customerId || doc.vendorId;
            const docName = normName(doc.customerName || doc.vendor || doc.partyName || doc.supplier || doc.vendorName);
            if (vId && docCustId && String(vId) === String(docCustId)) return true;
            return Boolean(vName && docName && vName === docName);
        };

        const looksAmbiguousShortNo = (raw) => {
            const s = (raw || '').toString().trim();
            if (!s) return true;
            // Pure numeric short ids like "1", "03", "003", "1110" are commonly duplicated across parties.
            return /^\d+$/.test(s) && s.length <= 4;
        };

        /** Exact match only (case-sensitive): "00024" ≠ "0024" ≠ "24" ≠ "GTES/26-27/024". */
        const keysMatchDocRef = (refKey, docFields) => {
            const key = (refKey || '').toString().trim();
            if (!key) return false;
            return docFields.some(f => (f || '').toString().trim() === key);
        };

        const docRefIndex = new Map();
        const indexDoc = (doc, fields, docCtx) => {
            fields.forEach((f) => {
                const k = (f || '').toString().trim();
                if (!k) return;
                if (!docRefIndex.has(k)) docRefIndex.set(k, []);
                docRefIndex.get(k).push({ doc, docCtx });
            });
        };
        if (!filterType || filterType === 'receipt') {
            (DataManager.getData('invoices') || []).forEach((inv) => {
                indexDoc(inv, [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo], 'receipt');
            });
        }
        if (!filterType || filterType === 'payment') {
            const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
            const purchases = DataManager.getData('purchases') || [];
            const collections = purchases === expenses ? [expenses] : [expenses, purchases];
            collections.forEach((col) => {
                (col || []).forEach((doc) => {
                    indexDoc(doc, [doc.id, doc.billNo, doc.vch_no, doc.invoiceNo, doc.bookkeeperVchNo], 'payment');
                });
            });
        }

        const resolveDocIdsForVoucherKey = (raw, voucher, ctx) => {
            const out = [];
            const s = (raw || '').toString().trim();
            if (!s || !voucher) return out;

            const hits = docRefIndex.get(s);
            if (!hits || !hits.length) return out;

            for (const { doc, docCtx } of hits) {
                if (ctx && docCtx !== ctx) continue;
                if (!partyMatchesDoc(doc, voucher)) continue;
                if (docCtx === 'receipt') {
                    if (doc.id) out.push(doc.id);
                    if (doc.invoiceNo) out.push(doc.invoiceNo);
                } else {
                    if (doc.id) out.push(doc.id);
                    if (doc.billNo) out.push(doc.billNo);
                    if (doc.vch_no) out.push(doc.vch_no);
                }
                break;
            }
            return out;
        };

        // 1. Existing Vouchers from Database
        vouchers.forEach(v => {
            const vType = (v.type || '').toString().toLowerCase();
            // Type Segregation: Only include vouchers that match the requested document context
            if (filterType) {
                if (filterType === 'receipt' && vType !== 'receipt') return;
                if (filterType === 'payment' && vType !== 'payment') return;
            }

            // 1. Check explicit allocations (register BOTH id and bill/invoice no — lookups use either)
            if (v.allocations && v.allocations.length > 0) {
                const vTds = parseFloat(v.tdsAmount) || 0;
                const vDisc = parseFloat(v.discountAmount) || 0;
                const totalAllocAmt = v.allocations.reduce((s, a) => s + (parseFloat(a?.amount) || 0), 0);
                const hasAnyAllocTds = v.allocations.some(a => (parseFloat(a?.tdsAmount) || 0) > 0);
                const hasAnyAllocDisc = v.allocations.some(a => (parseFloat(a?.discountAmount) || 0) > 0);

                v.allocations.forEach(a => {
                    const baseAmt = (parseFloat(a.amount) || 0);
                    const ratio = totalAllocAmt > 0 ? (baseAmt / totalAllocAmt) : 0;
                    const tdsAmt = (parseFloat(a.tdsAmount) || 0) + ((!hasAnyAllocTds && vTds > 0) ? (vTds * ratio) : 0);
                    const discAmt = (parseFloat(a.discountAmount) || 0) + ((!hasAnyAllocDisc && vDisc > 0) ? (vDisc * ratio) : 0);
                    const amount = baseAmt + tdsAmt + discAmt;
                    if (amount <= 0) return;
                    const keySet = new Set();
                    [a.id, a.no, a.invoiceNo, a.billNo].forEach(raw => {
                        if (raw === undefined || raw === null || raw === '') return;
                        const k = raw.toString().trim();
                        if (k) keySet.add(k);
                    });

                    // Resolve ambiguous short numbers (e.g. "003") to party-specific document IDs (exact refs only).
                    const resolved = new Set();
                    keySet.forEach(k => {
                        if (looksAmbiguousShortNo(k)) {
                            resolveDocIdsForVoucherKey(k, v, filterType).forEach(x => {
                                const rk = x.toString().trim();
                                if (rk) resolved.add(rk);
                            });
                        }
                    });
                    resolved.forEach(rk => keySet.add(rk));

                    keySet.forEach(k => {
                        // Avoid indexing truly ambiguous short numeric keys unless we could resolve them.
                        if (looksAmbiguousShortNo(k) && !resolved.has(k)) return;
                        this._bumpAllocMap(map, k, amount, v.customerId);
                    });
                });
            }
            // 2. Check legacy/imported linkedInvoices
            else if (v.linkedInvoices && Array.isArray(v.linkedInvoices)) {
                v.linkedInvoices.forEach(link => {
                    let amount;
                    const addKey = (raw, amt) => {
                        if (raw === undefined || raw === null || raw === '') return;
                        const k = raw.toString().trim();
                        if (!k) return;
                        if (looksAmbiguousShortNo(k)) {
                            const resolvedIds = resolveDocIdsForVoucherKey(k, v, filterType);
                            if (resolvedIds.length) {
                                resolvedIds.forEach(r => {
                                    const rk = r.toString().trim();
                                    if (rk) this._bumpAllocMap(map, rk, amt, v.customerId);
                                });
                                return;
                            }
                            return;
                        }
                        this._bumpAllocMap(map, k, amt, v.customerId);
                    };
                    if (typeof link === 'string') {
                        const totalSettlement = (parseFloat(v.amount) || 0) + (parseFloat(v.tdsAmount) || 0) + (parseFloat(v.discountAmount) || 0);
                        amount = totalSettlement / v.linkedInvoices.length;
                        addKey(link, amount);
                    } else if (link && typeof link === 'object') {
                        amount = parseFloat(link.amount) || 0;
                        if (amount <= 0) {
                            const totalSettlement = (parseFloat(v.amount) || 0) + (parseFloat(v.tdsAmount) || 0) + (parseFloat(v.discountAmount) || 0);
                            amount = totalSettlement / Math.max(v.linkedInvoices.length, 1);
                        }
                        const ks = new Set();
                        [link.id, link.invoiceNo, link.billNo].forEach(raw => {
                            if (raw === undefined || raw === null || raw === '') return;
                            const k = raw.toString().trim();
                            if (k) ks.add(k);
                        });
                        ks.forEach(k => addKey(k, amount));
                    }
                });
            }
        });

        // 3. Pending Bank Transactions (Session-Aware Balance)
        this._applySessionBankTransactions(map, extraTransactions, vouchers, filterType, excludeTxIndex);

        this._applyBookkeeperVchAliasMirrors(map, filterType);
        this._applyReferencedReturnNoteOffsets(map, filterType);

        if (!hasExtra) {
            this._allocationsCache = map;
            this._lastVoucherCount = cacheKey;
        }
        return map;
    },

    /**
     * Voucher + session allocation totals only (no credit-note mirrors / fuzzy keys).
     * Used for paid/partial status and pending-invoice list — avoids false "fully paid".
     */
    buildExplicitPaidIndex(extraTransactions = null, filterType = null, excludeTxIndex = -1) {
        const index = new Map();
        const vouchers = DataManager.getData('vouchers') || [];

        const bumpFromVoucher = (v) => {
            const vType = (v.type || '').toString().toLowerCase();
            if (filterType === 'receipt' && vType !== 'receipt') return;
            if (filterType === 'payment' && vType !== 'payment') return;
            const partyId = (v.customerId || '').toString().trim();

            if (v.allocations && v.allocations.length > 0) {
                const vTds = parseFloat(v.tdsAmount) || 0;
                const vDisc = parseFloat(v.discountAmount) || 0;
                const totalAllocAmt = v.allocations.reduce((s, a) => s + (parseFloat(a?.amount) || 0), 0);
                const hasAnyAllocTds = v.allocations.some(a => (parseFloat(a?.tdsAmount) || 0) > 0);
                const hasAnyAllocDisc = v.allocations.some(a => (parseFloat(a?.discountAmount) || 0) > 0);
                v.allocations.forEach((a) => {
                    const baseAmt = parseFloat(a.amount) || 0;
                    const ratio = totalAllocAmt > 0 ? (baseAmt / totalAllocAmt) : 0;
                    const tdsAmt = (parseFloat(a.tdsAmount) || 0) + ((!hasAnyAllocTds && vTds > 0) ? (vTds * ratio) : 0);
                    const discAmt = (parseFloat(a.discountAmount) || 0) + ((!hasAnyAllocDisc && vDisc > 0) ? (vDisc * ratio) : 0);
                    const amount = baseAmt + tdsAmt + discAmt;
                    if (amount <= 0) return;
                    this._bumpAllocRefsOnce(index, [a.id, a.no, a.invoiceNo, a.billNo], amount, partyId);
                });
            } else if (v.linkedInvoices && Array.isArray(v.linkedInvoices)) {
                const totalSettlement = (parseFloat(v.amount) || 0) + (parseFloat(v.tdsAmount) || 0) + (parseFloat(v.discountAmount) || 0);
                v.linkedInvoices.forEach((link) => {
                    let amount;
                    const keys = [];
                    if (typeof link === 'string') {
                        amount = totalSettlement / v.linkedInvoices.length;
                        keys.push(link);
                    } else if (link && typeof link === 'object') {
                        amount = parseFloat(link.amount) || 0;
                        if (amount <= 0) amount = totalSettlement / Math.max(v.linkedInvoices.length, 1);
                        [link.id, link.invoiceNo, link.billNo].forEach((k) => { if (k) keys.push(k); });
                    }
                    this._bumpAllocRefsOnce(index, keys, amount, partyId);
                });
            }
        };

        vouchers.forEach(bumpFromVoucher);

        if (Array.isArray(extraTransactions)) {
            extraTransactions.forEach((tx, txIndex) => {
                if (excludeTxIndex >= 0 && txIndex === excludeTxIndex) return;
                const txVchType = this._bankTxVoucherType(tx);
                if (filterType && txVchType !== filterType) return;
                const mv = tx.mappedVoucher || tx.mappedData;
                if (!tx.isReady || !mv) return;

                const hasDetailAlloc = Array.isArray(mv.allocations) && mv.allocations.length > 0;
                if (hasDetailAlloc) {
                    this._applySessionMappedVoucher(index, mv);
                    return;
                }

                const importedId = (tx.voucherId || '').toString().trim();
                if (tx.converted && importedId) {
                    const dbVch = vouchers.find(v => v.id === importedId || v.bookkeeperId === importedId);
                    const dbHasAlloc = dbVch && Array.isArray(dbVch.allocations) && dbVch.allocations.length > 0;
                    if (dbHasAlloc) return;
                }
                this._applySessionMappedVoucher(index, mv);
            });
        }

        return index;
    },

    lookupExplicitPaidAmount(doc, explicitIndex) {
        if (!doc || !explicitIndex) return 0;
        const total = parseFloat(doc.total || doc.amount || doc.vch_amt || 0);
        if (!total) return 0;
        const alt = doc.invoiceNo || doc.billNo || doc.vch_no || doc.id;
        const balance = this.getDocumentBalance(doc.id, total, explicitIndex, alt, doc, { allowLooseFallback: false });
        return Math.max(0, total - balance);
    },

    /** Sum line allocations from other ready bank-import rows in this session (session memory). */
    sumSessionAllocationsForDoc(doc, extraTransactions, filterType = 'receipt', excludeTxIndex = -1) {
        if (!doc || !Array.isArray(extraTransactions)) return 0;
        const docKeys = new Set(
            [doc.id, doc.invoiceNo, doc.billNo, doc.bookkeeperVchNo, doc.vch_no]
                .filter((k) => k != null && k !== '')
                .map((k) => String(k).trim())
        );
        let paid = 0;
        extraTransactions.forEach((tx, txIndex) => {
            if (excludeTxIndex >= 0 && txIndex === excludeTxIndex) return;
            if (!tx || !tx.isReady) return;
            const txVchType = this._bankTxVoucherType(tx);
            if (filterType && txVchType !== filterType) return;
            const mv = tx.mappedVoucher || tx.mappedData;
            if (!mv || !Array.isArray(mv.allocations)) return;
            mv.allocations.forEach((a) => {
                const keys = [a.id, a.no, a.invoiceNo, a.billNo]
                    .filter((k) => k != null && k !== '')
                    .map((k) => String(k).trim());
                if (!keys.some((k) => docKeys.has(k))) return;
                paid += parseFloat(a.amount) || 0;
            });
        });
        return paid;
    },

    /** Update in-memory invoice partial hints from all ready bank session rows (not saved to disk). */
    applySessionPartialHintsToInvoiceCache(extraTransactions, filterType = 'receipt') {
        if (!Array.isArray(extraTransactions)) return;
        const invoices = DataManager.getData('invoices') || [];
        const paidByKey = new Map();
        const dbExplicit = this.buildExplicitPaidIndex(null, filterType);

        const bumpPaidOnce = (refs, amt) => {
            const seen = new Set();
            (refs || []).forEach((raw) => {
                const k = (raw || '').toString().trim();
                if (!k || amt <= 0 || seen.has(k)) return;
                seen.add(k);
                paidByKey.set(k, (paidByKey.get(k) || 0) + amt);
            });
        };

        extraTransactions.forEach((tx) => {
            if (!tx || !tx.isReady) return;
            const txVchType = this._bankTxVoucherType(tx);
            if (filterType && txVchType !== filterType) return;
            const mv = tx.mappedVoucher || tx.mappedData;
            if (!mv || !Array.isArray(mv.allocations)) return;
            mv.allocations.forEach((a) => {
                const amt = parseFloat(a.amount) || 0;
                if (amt <= 0) return;
                bumpPaidOnce([a.id, a.no, a.invoiceNo, a.billNo], amt);
            });
        });

        const touched = new Set();
        paidByKey.forEach((_, k) => touched.add(k));

        invoices.forEach((inv) => {
            const keys = [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo]
                .filter((k) => k != null && k !== '')
                .map((k) => String(k).trim());
            const total = parseFloat(inv.total || inv.amount || 0) || 0;
            if (!total) return;

            let sessionPaid = 0;
            keys.forEach((k) => {
                sessionPaid = Math.max(sessionPaid, paidByKey.get(k) || 0);
            });
            const dbPaid = this.lookupExplicitPaidAmount(inv, dbExplicit);
            const combinedPaid = Math.min(total, Math.max(dbPaid, sessionPaid));
            const st = (inv.status || '').toLowerCase();
            const psf = parseFloat(inv.paidSoFar);
            const hadMemHint = st === 'partial' || st === 'paid'
                || (!Number.isNaN(psf) && psf > 0.05)
                || (inv.balanceDue != null && parseFloat(inv.balanceDue) > 0.05);

            if (combinedPaid <= 0.05) {
                const importedStatus = String(inv.status || '').toLowerCase();
                const srcBk = String(inv.source || '').toLowerCase() === 'bookkeeper'
                    || !!(inv.bookkeeperId && String(inv.bookkeeperId).trim());
                // Book Keeper "paid" on import is authoritative until a voucher row settles it in-app.
                if (srcBk && importedStatus === 'paid') return;
                if (hadMemHint && dbPaid <= 0.05) {
                    inv.status = 'pending';
                    delete inv.paidSoFar;
                    delete inv.balanceDue;
                }
                return;
            }

            const balance = Math.max(0, total - combinedPaid);
            inv.paidSoFar = combinedPaid;
            inv.balanceDue = balance;
            inv.status = balance <= 0.05 ? 'paid' : 'partial';
        });
    },

    /**
     * Updated: Get the remaining balance for a specific document
     */
    getDocumentBalance(docId, totalAmount, allocationsMap = null, altId = null, doc = null, options = {}) {
        const map = allocationsMap || this.getVoucherAllocationsMap();
        const allowLooseFallback = options.allowLooseFallback === true;

        const tryKeys = new Set();
        const addKey = (raw) => {
            const k = (raw || '').toString().trim();
            if (k) tryKeys.add(k);
        };
        addKey(docId);
        addKey(altId);
        if (doc) {
            addKey(doc.id);
            addKey(doc.invoiceNo);
            addKey(doc.billNo);
            addKey(doc.bookkeeperVchNo);
            addKey(doc.bookkeeperId);
            addKey(doc.vch_no);
        }

        const partyId = this._resolveDocPartyId(doc);
        const isNumericRef = (k) => /^\d+$/.test((k || '').toString().trim());

        const lookupAlloc = (k) => {
            let a = 0;
            if (partyId && isNumericRef(k)) {
                a = Math.max(a, map.get(`__pdoc:${partyId}|${k}`) || 0);
                const nk = this._allocationNormKey(k);
                if (nk) a = Math.max(a, map.get(`__pnorm:${partyId}|${nk}`) || 0);
                if (a <= 0) a = Math.max(a, map.get(k) || 0);
            } else {
                a = Math.max(a, map.get(k) || 0);
                if (partyId) {
                    a = Math.max(a, map.get(`__pdoc:${partyId}|${k}`) || 0);
                    const nk = this._allocationNormKey(k);
                    if (nk) a = Math.max(a, map.get(`__pnorm:${partyId}|${nk}`) || 0);
                }
            }
            return a;
        };

        let allocated = 0;
        tryKeys.forEach((k) => {
            allocated = Math.max(allocated, lookupAlloc(k));
        });

        const cleanDocId = (docId || '').toString().trim();
        const cleanAltId = (altId || '').toString().trim();

        // Optional legacy fuzzy match (not used for GST invoice balances by default)
        if (allowLooseFallback && allocated === 0 && doc) {
            const lastSeg = (s) => {
                const t = (s || '').toString().trim();
                if (!t) return '';
                const parts = t.split(/[\/\\]/);
                return parts[parts.length - 1].trim();
            };
            const iLast = lastSeg(docId);
            const aLast = lastSeg(altId);
            const iNum = (docId || '').toString().replace(/[^0-9]/g, '');
            const aNum = (altId || '').toString().replace(/[^0-9]/g, '');

            for (const [key, val] of map.entries()) {
                const cleanKey = key.toString().trim();
                const kLast = lastSeg(cleanKey);
                const kNum = cleanKey.replace(/[^0-9]/g, '');

                if (cleanKey === cleanDocId || cleanKey === cleanAltId) {
                    allocated = val;
                    break;
                }
                const segOk = (a, b) => a && b && a === b && a.length >= 2;
                if (segOk(kLast, iLast) || segOk(kLast, aLast)) {
                    allocated = val;
                    break;
                }
                const numOk = (kn, n) => kn && n && kn === n && n.length >= 5;
                if (numOk(kNum, iNum) || numOk(kNum, aNum)) {
                    allocated = val;
                    break;
                }
            }
        }

        let balance = Math.max(0, totalAmount - allocated);

        // Reconcile in-memory paidSoFar/status when voucher rows do not back the stored settlement.
        if (doc && allocated <= 0.05) {
            const st = (doc.status || '').toLowerCase();
            const psf = parseFloat(doc.paidSoFar);
            const hasPsf = !Number.isNaN(psf) && psf > 0.05;
            if (hasPsf && psf < totalAmount - 0.05) {
                balance = Math.max(0.01, totalAmount - psf);
            } else if (hasPsf && psf >= totalAmount - 0.05 && st === 'paid') {
                // Stale full-paid memory with no voucher row — treat as still outstanding.
                balance = totalAmount;
            } else if (st === 'paid' && !hasPsf) {
                const srcBk = String(doc.source || '').toLowerCase() === 'bookkeeper'
                    || !!(doc.bookkeeperId && String(doc.bookkeeperId).trim());
                // BookKeeper "paid" import is not proof of settlement until a voucher row exists.
                if (srcBk) balance = totalAmount;
            }
        }

        return balance;
    },

    /**
     * Update an existing voucher's adjustments (TDS/Discount)
     */
    async updateVoucherAdjustment(id, adjustments) {
        const vouchers = DataManager.getData('vouchers') || [];
        const index = vouchers.findIndex(v => v.id === id);

        if (index !== -1) {
            const voucher = vouchers[index];
            if (adjustments.tdsAmount !== undefined) {
                voucher.tdsAmount = parseFloat(voucher.tdsAmount || 0) + parseFloat(adjustments.tdsAmount);
            }
            if (adjustments.discountAmount !== undefined) {
                voucher.discountAmount = parseFloat(voucher.discountAmount || 0) + parseFloat(adjustments.discountAmount);
            }
            if (adjustments.remarks) {
                voucher.remarks = (voucher.remarks ? voucher.remarks + ' | ' : '') + adjustments.remarks;
            }
            
            vouchers[index] = voucher;
            await DataManager.saveData('vouchers', vouchers);
            return voucher;
        }

        // Also check Expenses/Purchases if it's a purchase record
        const purchases = DataManager.getData('purchases') || [];
        const purIndex = purchases.findIndex(p => p.id === id);
        if (purIndex !== -1) {
            const pur = purchases[purIndex];
            // Purchases/Expenses might store these differently, but we follow the same pattern
            if (adjustments.tdsAmount !== undefined) pur.tdsAmount = (parseFloat(pur.tdsAmount || 0) + parseFloat(adjustments.tdsAmount)).toFixed(2);
            if (adjustments.discountAmount !== undefined) pur.discountAmount = (parseFloat(pur.discountAmount || 0) + parseFloat(adjustments.discountAmount)).toFixed(2);
            
            purchases[purIndex] = pur;
            await DataManager.saveData('purchases', purchases);
            return pur;
        }

        throw new Error('Voucher not found for adjustment');
    }
};
