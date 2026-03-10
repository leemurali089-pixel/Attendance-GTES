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

        // Generate ID
        const datePart = data.date.replace(/-/g, '').substring(2); // YYMMDD
        const count = vouchers.filter(v => v.date === data.date).length + 1;
        const typeCode = data.type === 'receipt' ? 'RCT' : (data.type === 'payment' ? 'PMT' : 'CNT');
        const id = `${typeCode}-${datePart}-${String(count).padStart(3, '0')}`;

        const voucher = {
            id: id,
            date: data.date,
            type: data.type, // 'receipt', 'payment', 'contra'
            customerName: data.customerName,
            customerId: data.customerId,
            amount: parseFloat(data.amount),
            tdsAmount: parseFloat(data.tdsAmount || 0),
            discountAmount: parseFloat(data.discountAmount || 0),
            paymentMode: data.paymentMode, // 'cash', 'bank', 'cheque', 'upi'
            referenceId: data.referenceId || '',
            linkedInvoices: data.linkedInvoices || [], // Array of invoice IDs being paid
            allocations: data.allocations || [], // NEW: Detailed allocations [{id, no, amount}]
            remarks: data.remarks || '',
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
        // This is a simplified status update. Ideally we track partial payments.
        // For now, if a voucher pays an invoice, we mark it as 'paid' or adjust balance.
        // Since we don't have partial tracking fully defined in InvoiceManager yet,
        // we will leave this logic minimal or delegate.

        // Load Invoices and Expenses
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        let modifiedInv = false;
        let modifiedExp = false;

        for (const id of invoiceIds) {
            // Check Sales Invoices
            const invIndex = invoices.findIndex(i => i.id === id);
            if (invIndex !== -1) {
                invoices[invIndex].status = 'paid'; // Simple mark as paid
                modifiedInv = true;
                continue;
            }

            // Check Purchase Bills
            const expIndex = expenses.findIndex(e => e.id === id);
            if (expIndex !== -1) {
                expenses[expIndex].status = 'paid';
                modifiedExp = true;
            }
        }

        if (modifiedInv) await DataManager.saveData('invoices', invoices);
        if (modifiedExp) await DataManager.saveData(DataManager.KEYS.EXPENSES, expenses);
    },

    /**
     * Get voucher by ID
     */
    getVoucher(id) {
        const vouchers = DataManager.getData('vouchers') || [];
        return vouchers.find(v => v.id === id);
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

        // Remove the voucher first
        vouchers.splice(index, 1);
        await DataManager.saveData('vouchers', vouchers);

        // Revert linked invoice/bill statuses
        await this.revertLinkedInvoices(linkedInvoices, voucher, vouchers);
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
        // Remove common prefixes
        cleaned = cleaned.replace(/^(TO\s*:?\s*|BY\s*:?\s*)/, '');
        // Remove long alphanumeric IDs (like IOBA00000005037217, TRTR/400311394255/IMPS)
        cleaned = cleaned.replace(/[A-Z0-9]{10,}/g, ' ');
        // Remove pure numbers
        cleaned = cleaned.replace(/\b\d+\b/g, ' ');
        // Remove typical bank terms
        cleaned = cleaned.replace(/\b(IMPS|RTGS|NEFT|TRTR|TRF|UPI)\b/g, ' ');
        // Remove dates (DD-MM-YYYY)
        cleaned = cleaned.replace(/\b\d{2}-\d{2}-\d{4}\b/g, ' ');
        // Remove special characters, keep alphanumeric and spaces
        cleaned = cleaned.replace(/[^A-Z0-9\s]/g, ' ');
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

        // 1. Direct Match of cleaned description
        if (mappings[cleaned]) return mappings[cleaned];

        // 2. Contains Match (useful if alias is a subset of the description)
        for (const [key, val] of Object.entries(mappings)) {
            if (cleaned.includes(key) || key.includes(cleaned)) {
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
    }
};
