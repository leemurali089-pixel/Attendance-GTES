/**
 * Invoice Management Module
 * Handles GST and Non-GST Invoices
 */

const InvoiceManager = {
    async init() {
        await DataManager.init();
        console.log('InvoiceManager initialized');
    },

    /**
     * Generate next invoice number based on type
     * With Bill: INV-WB-0001
     * Without Bill: INV-NB-0001
     */
    generateInvoiceNumber(type) {
        const isGST = type === 'with-bill' || type === 'gst-invoice' || type === 'sales-gst';
        const prefix = isGST ? 'INV-WB' : 'INV-NB';
        const invoices = DataManager.getData('invoices') || [];
        
        let maxNum = 0;
        invoices.forEach(inv => {
            const invIsGST = inv.type === 'with-bill' || inv.type === 'gst-invoice' || inv.type === 'sales-gst';
            if (invIsGST === isGST) {
                // Check both internal ID and display invoiceNo for the maximum number
                [inv.id, inv.invoiceNo].forEach(val => {
                    if (val && val.startsWith(prefix)) {
                        const parts = val.split('-');
                        const lastNumStr = parts[parts.length - 1];
                        if (lastNumStr && !isNaN(parseInt(lastNumStr))) {
                            maxNum = Math.max(maxNum, parseInt(lastNumStr));
                        }
                    }
                });
            }
        });

        const nextNum = maxNum + 1;
        return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
    },

    /**
     * Create new invoice
     */
    async createInvoice(invoiceData) {
        const invoices = DataManager.getData('invoices') || [];

        // Validate challan if provided
        if (invoiceData.challanId) {
            const deliveryManager = (typeof DeliveryManager !== 'undefined') ? DeliveryManager : null;
            if (deliveryManager && !deliveryManager.getChallan(invoiceData.challanId)) {
                throw new Error('Invalid Challan ID');
            }
        }

        let finalId = invoiceData.id || invoiceData.invoiceNo || this.generateInvoiceNumber(invoiceData.type);
        
        // Ensure perfect uniqueness of ID
        let collisionCount = 1;
        while (invoices.some(i => i.id === finalId)) {
            console.warn(`Invoice ID ${finalId} already exists in database. Generating a new ID...`);
            // Attempt to fetch a new number
            let proposedId = this.generateInvoiceNumber(invoiceData.type);
            
            // If the generator also suggested an existing one (which shouldn't happen, but safely guard against it)
            if (finalId === proposedId || invoices.some(i => i.id === proposedId)) {
                proposedId = `${proposedId}-${collisionCount++}`;
            }
            
            finalId = proposedId;
        }

        console.log('InvoiceManager.createInvoice - Final ID:', finalId, 'Source ID:', invoiceData.id, 'Source No:', invoiceData.invoiceNo);
        
        let normalizedType = invoiceData.type;
        if (normalizedType === 'sales-gst' || normalizedType === 'gst-invoice') normalizedType = 'with-bill';
        if (normalizedType === 'sales-non-gst' || normalizedType === 'non-gst-invoice') normalizedType = 'without-bill';

        const invoice = {
            id: finalId,
            invoiceNo: invoiceData.invoiceNo && invoiceData.invoiceNo !== invoiceData.id ? invoiceData.invoiceNo : finalId, // Preserve custom display numbers if explicitly set, else sync
            type: normalizedType,
            billType: normalizedType === 'with-bill' ? 'gst' : 'plain',
            challanId: invoiceData.challanId || null,
            jobCardId: invoiceData.jobCardId || null,
            date: invoiceData.date || new Date().toISOString().split('T')[0],
            customerId: invoiceData.customerId,
            customerName: invoiceData.customerName,
            customerAddress: invoiceData.customerAddress || null,
            poNumber: invoiceData.poNumber || null,
            narration: invoiceData.narration || null,
            dispatchDetails: invoiceData.dispatchDetails || null,
            items: invoiceData.items || [],

            // Financials
            subtotal: invoiceData.subtotal || 0,
            gst: invoiceData.gst || { cgst: 0, sgst: 0, igst: 0 },
            roundOff: invoiceData.roundOff || 0,
            total: invoiceData.total || 0,

            status: 'pending', // pending|paid|cancelled
            paymentDate: null,
            paymentMode: null,

            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        invoices.push(invoice);
        await DataManager.saveData('invoices', invoices);

        // Update Challan status if linked
        if (invoice.challanId && typeof DeliveryManager !== 'undefined') {
            await DeliveryManager.updateChallan(invoice.challanId, {
                invoiceId: invoice.id,
                status: 'invoiced'
            });
        }

        return invoice;
    },

    /**
     * Update invoice
     */
    async updateInvoice(invoiceId, updates) {
        const invoices = DataManager.getData('invoices') || [];
        const index = invoices.findIndex(inv => inv.id === invoiceId);

        if (index === -1) {
            throw new Error('Invoice not found');
        }

        console.log('InvoiceManager.updateInvoice - ID:', invoiceId, 'Updates:', updates);
        invoices[index] = {
            ...invoices[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await DataManager.saveData('invoices', invoices);
        return invoices[index];
    },

    /**
     * Get invoice by ID
     */
    getInvoice(invoiceId) {
        const invoices = DataManager.getData('invoices') || [];
        return invoices.find(inv => inv.id === invoiceId);
    },

    /**
     * Get all invoices
     */
    getAllInvoices() {
        return DataManager.getData('invoices') || [];
    },

    /**
     * Get invoices by type
     */
    getInvoicesByType(type) {
        const invoices = this.getAllInvoices();
        // Normalize search type
        let searchType = type;
        if (searchType === 'sales-gst' || searchType === 'gst-invoice') searchType = 'with-bill';
        if (searchType === 'sales-non-gst' || searchType === 'non-gst-invoice') searchType = 'without-bill';
        
        return invoices.filter(inv => inv.type === searchType && !this.isDcStyleSalesInvoice(inv));
    },
    
    /**
     * Helper to check if a type is GST
     */
    isGSTType(type) {
        if (!type) return true; // Default to GST for safety if unknown
        const t = (type || '').toString().toLowerCase();
        return t === 'sales-gst' || t === 'gst-invoice' || t === 'with-bill' || t === 'purchase-gst';
    },

    /**
     * Delete invoice
     */
    async deleteInvoice(invoiceId, deleteChallanToo = false) {
        const invoices = DataManager.getData('invoices') || [];
        const invoice = invoices.find(inv => inv.id === invoiceId);

        if (invoice) {
            if (typeof DeliveryManager !== 'undefined') {
                // Robust check: find any challan that points to this invoiceId
                const allChallans = DeliveryManager.getAllChallans();
                const linkedChallans = allChallans.filter(c => c.invoiceId === invoiceId || (c.id === invoice.challanId));

                for (const challan of linkedChallans) {
                    if (deleteChallanToo) {
                        await DeliveryManager.deleteChallan(challan.id);
                    } else {
                        await DeliveryManager.updateChallan(challan.id, {
                            invoiceId: null,
                            status: 'pending'
                        });
                    }
                }
            }

            // Move to Recycle Bin
            const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
            bin.push({
                ...invoice,
                _deletedAt: new Date().toISOString(),
                _recordType: 'invoice'
            });
            await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, bin);
        }

        const filtered = invoices.filter(inv => inv.id !== invoiceId);
        await DataManager.saveData('invoices', filtered);
    },

    /**
     * Restore invoice from recycle bin
     */
    async restoreInvoice(invoiceId) {
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        const index = bin.findIndex(item => item.id === invoiceId && item._recordType === 'invoice');
        
        if (index === -1) throw new Error('Invoice not found in Recycle Bin');

        const invoice = { ...bin[index] };
        delete invoice._deletedAt;
        delete invoice._recordType;

        const invoices = DataManager.getData('invoices') || [];
        invoices.push(invoice);
        
        const newBin = bin.filter((_, i) => i !== index);

        await DataManager.saveData('invoices', invoices);
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, newBin);
        
        return invoice;
    },

    _balanceCache: null,
    _lastInvoiceCount: 0,
    _lastVoucherCount: 0,

    /**
     * Delivery-challan billing documents (DC01, GTES/26-27/DC01, …): show under View DC, not GST invoice table,
     * but still included in getInvoicesWithBalance() so receipts / pending totals stay correct.
     */
    isDcStyleSalesInvoice(inv) {
        if (!inv) return false;
        const no = (inv.invoiceNo || inv.id || '').toString().trim();
        if (/^DC\d+$/i.test(no)) return true;
        return /\bDC\d+\b/i.test(no);
    },

    /**
     * NEW: Get invoices with current balance (Calculated via VoucherManager)
     */
    getInvoicesWithBalance() {
        const invoices = this.getAllInvoices();
        const voucherCount = typeof VoucherManager !== 'undefined' ? (DataManager.getData('vouchers') || []).length : 0;

        // Cache hit check (Force clear if logic updated)
        const logicVersion = 7; // Include DC-style rows in balances; hide only from GST table UI
        if (this._balanceCache && 
            this._lastInvoiceCount === invoices.length && 
            this._lastVoucherCount === voucherCount &&
            this._lastLogicVersion === logicVersion) {
            return this._balanceCache;
        }

        this._lastLogicVersion = logicVersion;

        if (typeof VoucherManager === 'undefined') {
            return invoices.map(inv => ({ ...inv, balance: parseFloat(inv.total ?? inv.amount ?? 0) || 0 }));
        }

        const allocationsMap = VoucherManager.getVoucherAllocationsMap(null, 'receipt');

        const result = invoices.map(inv => {
            const invTotal = parseFloat(inv.total ?? inv.amount ?? 0) || 0;
            const balance = VoucherManager.getDocumentBalance(
                inv.id,
                invTotal,
                allocationsMap,
                inv.invoiceNo,
                inv,
                { allowLooseFallback: false }
            );
            return {
                ...inv,
                balance: balance,
                isPaid: balance <= 0.05,
                isPartial: balance > 0.05 && balance < (invTotal - 0.05)
            };
        });

        this._balanceCache = result;
        this._lastInvoiceCount = invoices.length;
        this._lastVoucherCount = voucherCount;
        return result;
    }
};

window.InvoiceManager = InvoiceManager;
