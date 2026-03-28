/**
 * Voucher Management Module
 * Handles logic for Receipts, Payments, and Contra vouchers.
 * Manages bank statement alias learning.
 */

const VoucherManager = {
    /**
     * Initialize if needed
     */
    init() {
        console.log('VoucherManager initialized');
    },

    /**
     * Create a new voucher
     * @param {Object} data - Voucher data
     */
    async createVoucher(data) {
        const vouchers = DataManager.getData('vouchers') || [];

        // Generate ID if not provided manually
        let id = data.id;
        if (!id) {
            id = this.getNextVoucherNumber(data.type, data.date);
        }

        const voucher = {
            id: id,
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
            remarks: data.remarks || '',
            hasGst: data.hasGst,
            isPurchase: data.isPurchase,
            createdAt: new Date().toISOString()
        };

        vouchers.push(voucher);
        await DataManager.saveData('vouchers', vouchers);

        // Update Invoice Statuses if linked
        if (data.linkedInvoices && data.linkedInvoices.length > 0) {
            await this.updateLinkedInvoices(data.linkedInvoices, data.type);
        }

        return voucher;
    },

    /**
     * update linked documents status
     */
    async updateLinkedInvoices(invoiceIds, voucherType) {
        // Load Invoices and Expenses
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const purchases = DataManager.getData('purchases') || [];
        
        let modifiedInv = false;
        let modifiedExp = false;
        let modifiedPur = false;

        for (const id of invoiceIds) {
            // 1. Check Sales Invoices
            const invIndex = invoices.findIndex(i => i.id === id);
            if (invIndex !== -1) {
                const doc = invoices[invIndex];
                const total = parseFloat(doc.total || doc.amount || 0);
                const balance = this.getDocumentBalance(id, total);
                
                if (balance <= 0.05) { 
                    invoices[invIndex].status = 'paid';
                } else {
                    invoices[invIndex].status = 'partial';
                }
                modifiedInv = true;
                continue;
            }

            // 2. Check Expenses
            const expIndex = expenses.findIndex(e => e.id === id);
            if (expIndex !== -1) {
                const doc = expenses[expIndex];
                const total = parseFloat(doc.total || doc.amount || doc.vch_amt || 0);
                const balance = this.getDocumentBalance(id, total);
                
                if (balance <= 0.05) {
                    expenses[expIndex].status = 'paid';
                } else {
                    expenses[expIndex].status = 'partial';
                }
                modifiedExp = true;
                continue;
            }

            // 3. Check Purchases
            const purIndex = purchases.findIndex(p => p.id === id);
            if (purIndex !== -1) {
                const doc = purchases[purIndex];
                const total = parseFloat(doc.total || doc.amount || 0);
                const balance = this.getDocumentBalance(id, total);
                
                if (balance <= 0.05) {
                    purchases[purIndex].status = 'paid';
                } else {
                    purchases[purIndex].status = 'partial';
                }
                modifiedPur = true;
            }
        }

        if (modifiedInv) await DataManager.saveData('invoices', invoices);
        if (modifiedExp) await DataManager.saveData(DataManager.KEYS.EXPENSES, expenses);
        if (modifiedPur) await DataManager.saveData('purchases', purchases);
    },

    /**
     * Get voucher by ID
     */
    getVoucher(id) {
        const vouchers = DataManager.getData('vouchers') || [];
        let v = vouchers.find(v => v.id === id);
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
        await DataManager.saveData('vouchers', vouchers);

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
        cleaned = cleaned.replace(/\b(IMPS|RTGS|NEFT|TRTR|TRF|UPI|CHQ|CHEQUE|CLG|NFT|CMS|NET|BANK|TRANS|TRANSFER)\b/g, ' ');
        cleaned = cleaned.replace(/\b(HDFC|ICICI|IDIB|IDBI|SBI|KOTAK|AXIS|BARB|UTIB|YESB|PUNB|CNRB)\b/g, ' ');

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
        
        // Final cleaning: remove single characters and tiny words that are usually noise (CO, EN, etc. if isolated)
        cleaned = cleaned.replace(/\b[A-Z0-9]{1,2}\b/g, ' ');

        // Compress multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    },

    /**
     * Save Bank Description -> Party Name mapping
     */
    async saveBankMapping(description, partyName) {
        if (!description || !partyName) return;

        const mappings = DataManager.getData('gtes_bank_alias') || {};
        const cleaned = this.cleanBankDescription(description);
        
        if (cleaned.length > 3) { // Only save if meaningful text remains
            mappings[cleaned] = partyName;
            await DataManager.saveData('gtes_bank_alias', mappings);
        }
    },

    /**
     * Resolve Party Name from Bank Description
     */
    resolveBankParty(description) {
        const mappings = DataManager.getData('gtes_bank_alias') || {};
        const cleaned = this.cleanBankDescription(description);

        if (!cleaned || cleaned.length < 3) return null;

        // 1. Direct Exact Match (Highest Priority)
        if (mappings[cleaned]) return mappings[cleaned];

        // 2. Strict Substring Match
        // We only match if the alias is a meaningful part of the description
        const entries = Object.entries(mappings);
        for (const [key, val] of entries) {
            if (key.length < 4) continue; // Skip very short alias keys for substring matching
            
            // Check if key is a whole word within cleaned description
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(cleaned)) {
                return val;
            }
        }

        return null;
    },

    /**
     * Check if a voucher already exists for a given party, amount and date
     */
    checkDuplicateVoucher(partyName, amount, date) {
        if (!partyName || !amount || !date) return false;
        const vouchers = this.getAllVouchers();
        const d_amount = parseFloat(amount);
        const d_date = date instanceof Date ? date.toISOString().split('T')[0] : date;

        return vouchers.some(v => {
            const v_name = (v.customerName || '').trim().toLowerCase();
            const p_name = partyName.trim().toLowerCase();
            const v_date = v.date.split('T')[0];
            const d_date_str = d_date.split('T')[0];

            return v_name === p_name && 
                   Math.abs(parseFloat(v.amount) - d_amount) < 0.01 && 
                   v_date === d_date_str;
        });
    },

    /**
     * NEW: Get next sequential voucher number for a type
     * Intelligently detects numeric suffixes to follow manual patterns.
     */
    getNextVoucherNumber(type, date = null) {
        let vouchers = DataManager.getData('vouchers') || [];
        const year = DataManager.getFinancialYear(date || new Date());
        const typeCode = type === 'receipt' ? 'RCT' : (type === 'payment' ? 'PMT' : 'CNT');
        const defaultPrefix = `${typeCode}-${year}-`;
        
        // Also include ANY vouchers in the Bank Import Queue (Ready OR Converted)
        // This ensures the NEXT row immediately picks up the number from the PREVIOUS row, 
        // even if the database sync is still pending in the background.
        if (typeof VouchersUI !== 'undefined' && VouchersUI.currentBankTransactions) {
            const queueVouchers = VouchersUI.currentBankTransactions
                .filter(tx => tx.mappedVoucher)
                .map(tx => tx.mappedVoucher);
            vouchers = vouchers.concat(queueVouchers);
        }

        // Filter by type
        const typeVouchers = vouchers.filter(v => v.type === type && v.id);
        
        if (typeVouchers.length === 0) {
            return `${defaultPrefix}001`;
        }

        // We want to find the "Most Relevant" latest voucher.
        // We prioritize vouchers that match the current year/type pattern.
        // However, if the user has manually started a new series (like PAY173), 
        // we should follow that if it's the absolute maximum.

        let maxNum = 0;
        let bestPrefix = defaultPrefix;
        let maxPadding = 3;

        for (const v of typeVouchers) {
            const match = (v.id || '').match(/^(.*?)(\d+)$/);
            if (match) {
                const prefix = match[1];
                const num = parseInt(match[2], 10);
                
                // Logic: 
                // 1. If it's the absolute highest number seen so far, track it.
                // 2. If it's the same number but matches our preferred prefix, prefer that.
                if (num > maxNum) {
                    maxNum = num;
                    bestPrefix = prefix;
                    maxPadding = match[2].length;
                } else if (num === maxNum && prefix === defaultPrefix) {
                    // Stay with default prefix if same number
                    bestPrefix = prefix;
                    maxPadding = match[2].length;
                }
            }
        }
        
        if (maxNum === 0) {
            return `${defaultPrefix}001`;
        }

        const nextNumber = maxNum + 1;
        const paddedNext = String(nextNumber).padStart(Math.max(maxPadding, 3), '0');
        return bestPrefix + paddedNext;
    },

    /**
    _allocationsCache: null,
    _lastVoucherCount: 0,

    /**
     * NEW: Get a map of all document allocations for fast lookup
     * Returns: Map { docId => totalAllocatedAmount }
     */
    getVoucherAllocationsMap() {
        const vouchers = this.getAllVouchers();
        
        // Simple cache: if count hasn't changed, return cached map
        // Note: For full robustness, a checksum would be better, but count is usually enough for UI performance
        if (this._allocationsCache && this._lastVoucherCount === vouchers.length) {
            return this._allocationsCache;
        }

        const map = new Map();

        vouchers.forEach(v => {
            // 1. Check explicit allocations
            if (v.allocations && v.allocations.length > 0) {
                v.allocations.forEach(a => {
                    const id = a.id || a.no;
                    if (id) {
                        const amount = (parseFloat(a.amount) || 0) + (parseFloat(a.tdsAmount) || 0) + (parseFloat(a.discountAmount) || 0);
                        map.set(id, (map.get(id) || 0) + amount);
                    }
                });
            } 
            // 2. Check legacy/imported linkedInvoices
            else if (v.linkedInvoices && Array.isArray(v.linkedInvoices)) {
                v.linkedInvoices.forEach(link => {
                    let id, amount;
                    if (typeof link === 'string') {
                        id = link;
                        const totalSettlement = (parseFloat(v.amount) || 0) + (parseFloat(v.tdsAmount) || 0) + (parseFloat(v.discountAmount) || 0);
                        amount = totalSettlement / v.linkedInvoices.length;
                    } else if (link && typeof link === 'object') {
                        id = link.id || link.invoiceNo || link.billNo;
                        amount = parseFloat(link.amount) || 0;
                    }

                    if (id) {
                        map.set(id, (map.get(id) || 0) + amount);
                    }
                });
            }
        });

        this._allocationsCache = map;
        this._lastVoucherCount = vouchers.length;
        return map;
    },

    /**
     * Updated: Get the remaining balance for a specific document
     */
    getDocumentBalance(docId, totalAmount, allocationsMap = null) {
        let allocated = 0;
        if (allocationsMap) {
            allocated = allocationsMap.get(docId) || 0;
        } else {
            // Fallback to slow method if map not provided
            const tempMap = this.getVoucherAllocationsMap();
            allocated = tempMap.get(docId) || 0;
        }
        
        return Math.max(0, totalAmount - allocated);
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
