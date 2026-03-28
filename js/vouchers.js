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

        // 1. Generate/Verify ID Uniqueness
        let id = data.id;
        if (!id) {
            id = this.getNextVoucherNumber(data.type, data.date);
        }

        // Final Collision Check: If this ID is ALREADY in the database or our local session tracker, 
        // keep incrementing until we find a truly unique one.
        let uniqueId = id;
        let attempts = 0;
        while (attempts < 100) {
            const isDuplicate = vouchers.some(v => v.id === uniqueId) || 
                               (this._lastSerials[data.type] === uniqueId);
            
            if (!isDuplicate) break;
            
            // Increment
            uniqueId = this.getNextVoucherNumber(data.type, data.date);
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
            remarks: data.remarks || '',
            hasGst: data.hasGst,
            isPurchase: data.isPurchase,
            createdAt: new Date().toISOString()
        };

        // Record it immediately to prevent the next call in a loop from taking the same ID
        this.recordUsedSerial(data.type, uniqueId);

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
     * Cache for the last used serial to ensure immediate increment even 
     * if the database sync is slightly delayed.
     */
    _lastSerials: {},

    /**
     * Track a used serial number in real-time
     */
    recordUsedSerial(type, id) {
        if (!type || !id) return;
        this._lastSerials[type] = id;
    },

    /**
     * Get next sequential voucher number for a type
     * Intelligently detects numeric suffixes and follows the LATEST used prefix.
     */
    getNextVoucherNumber(type, date = null) {
        let vouchers = DataManager.getData('vouchers') || [];
        const year = DataManager.getFinancialYear(date || new Date());
        const typeCode = type === 'receipt' ? 'RCT' : (type === 'payment' ? 'PMT' : (type === 'contra' ? 'CNT' : 'VCH'));
        const defaultPrefix = `${typeCode}-${year}-`;
        
        // 1. Combine with Bank Import Queue (Ready OR Converted)
        if (typeof VouchersUI !== 'undefined' && VouchersUI.currentBankTransactions) {
            const queueVouchers = VouchersUI.currentBankTransactions
                .filter(tx => tx.mappedVoucher || tx.mappedData)
                .map(tx => tx.mappedVoucher || tx.mappedData);
            vouchers = vouchers.concat(queueVouchers);
        }

        // 2. Filter by type
        const typeVouchers = vouchers.filter(v => v.type === type && v.id);
        
        // 3. Find the "Best" prefix to follow. 
        // We prioritize the prefix used by the most recently added voucher of this type.
        let targetPrefix = defaultPrefix;
        
        // Use the last item in our session cache if available
        const lastSessionId = this._lastSerials[type];
        
        if (lastSessionId) {
            const lastMatch = lastSessionId.match(/^(.*?)(\d+)$/);
            if (lastMatch) targetPrefix = lastMatch[1];
        } else if (typeVouchers.length > 0) {
            // Use the last item in the list as the "most recent" reference
            const lastVch = typeVouchers[typeVouchers.length - 1];
            const lastMatch = (lastVch.id || '').match(/^(.*?)(\d+)$/);
            if (lastMatch) targetPrefix = lastMatch[1];
        }

        // 4. Find the maximum number for THIS specific prefix
        let maxNum = 0;
        let padding = 1;

        // Combine database vouchers with our local tracking cache for max number check
        const allReferenceIds = typeVouchers.map(v => v.id);
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
            for (const v of typeVouchers) {
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
        if (this._lastSerials[type]) {
            const match = this._lastSerials[type].match(/^(.*?)(\d+)$/);
            if (match && match[1] === targetPrefix) {
                const n = parseInt(match[2], 10);
                if (n > maxNum) {
                    maxNum = n;
                }
            }
        }
        
        if (maxNum === 0) {
            return `${targetPrefix}001`;
        }

        const nextNum = maxNum + 1;
        return targetPrefix + String(nextNum).padStart(Math.max(padding, 3), '0');
    },

    /**
     * Record the use of a serial number to ensure next increment is correct
     */
    recordUsedSerial(type, id) {
        if (!type || !id) return;
        this._lastSerials[type] = id;
    },

    /**
    _allocationsCache: null,
    _lastVoucherCount: 0,

    /**
     * NEW: Get a map of all document allocations for fast lookup
     * @param {Array} extraTransactions - Optional list of pending bank transactions to include.
     */
    getVoucherAllocationsMap(extraTransactions = null) {
        const vouchers = this.getAllVouchers();
        
        // Use a more dynamic key for caching (including isReady count to detect session changes)
        const readyCount = (extraTransactions || []).filter(tx => tx.isReady || tx.converted).length;
        const cacheKey = extraTransactions ? `v${vouchers.length}_e${extraTransactions.length}_r${readyCount}` : `v${vouchers.length}`;

        if (this._allocationsCache && this._lastVoucherCount === cacheKey) {
            return this._allocationsCache;
        }

        const map = new Map();

        // 1. Existing Vouchers from Database
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

        // 3. Pending Bank Transactions (Session-Aware Balance)
        if (extraTransactions && Array.isArray(extraTransactions)) {
            extraTransactions.forEach(tx => {
                // If it's linked but not yet imported
                if ((tx.isReady || tx.converted) && !tx.imported) {
                    if (tx.linkedVoucherId) {
                        map.set(tx.linkedVoucherId, (map.get(tx.linkedVoucherId) || 0) + parseFloat(tx.amount || 0));
                    }
                    const mv = tx.mappedVoucher || tx.mappedData;
                    if (mv && mv.linkedInvoices) {
                        mv.linkedInvoices.forEach(id => {
                            // If it's a bulk link, we assume the whole amount for simplicity or check allocations if present
                            const amt = mv.allocations?.find(a => a.id === id)?.amount || (tx.amount / mv.linkedInvoices.length);
                            map.set(id, (map.get(id) || 0) + parseFloat(amt));
                        });
                    }
                }
            });
        }

        this._allocationsCache = map;
        this._lastVoucherCount = cacheKey;
        return map;
    },

    /**
     * Updated: Get the remaining balance for a specific document
     */
    getDocumentBalance(docId, totalAmount, allocationsMap = null, extraTransactions = null) {
        let allocated = 0;
        if (allocationsMap) {
            allocated = allocationsMap.get(docId) || 0;
        } else {
            // Pass extraTransactions specifically if map not provided
            const tempMap = this.getVoucherAllocationsMap(extraTransactions);
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
