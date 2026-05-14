/**
 * Invoice Management Module
 * Handles GST and Non-GST Invoices
 */

const InvoiceManager = {
    _isCreditNoteDoc(inv) {
        if (!inv) return false;
        const t = String(inv.type || '').toLowerCase();
        if (t.includes('credit') && t.includes('note')) return true;
        if (t.includes('sales') && t.includes('return')) return true;
        if (inv.isCreditNote === true) return true;
        const bk = String(inv.bookkeeperVchType || inv.v_type || '').toLowerCase();
        if (bk.includes('credit note') || bk.includes('sales return')) return true;
        const no = String(inv.invoiceNo || inv.id || '').toUpperCase();
        // Book Keeper / Tally style numbers: GTES/26-27/CR01, INV/CN12, etc.
        if (/\/(CR|CN)\d+(\b|\/|$)/.test(no)) return true;
        if (/^(CR|CN)[-/]?\d+/.test(no)) return true;
        return false;
    },
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
     * Next purchase bill number (GST vs non-GST prefixes), from expenses only.
     */
    generatePurchaseBillNumber(isGst) {
        const prefix = isGst ? 'PUR-WB' : 'PUR-NB';
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || DataManager.getData('gtes_expenses') || [];
        let maxNum = 0;
        const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^${esc}-(\\d+)$`, 'i');
        expenses.forEach((exp) => {
            const b = String(exp.billNo || exp.invoiceNo || '');
            const m = b.match(re);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
        });
        const next = maxNum + 1;
        return `${prefix}-${next.toString().padStart(4, '0')}`;
    },

    /**
     * Create new invoice
     */
    async createInvoice(invoiceData) {
        const invoices = DataManager.getData('invoices') || [];

        const rawName = (invoiceData.customerName || '').trim();
        if (!rawName) {
            throw new Error('Customer or vendor name is required. Link the invoice to a saved account.');
        }
        const customers = DataManager.getData('customers') || [];
        const cid = (invoiceData.customerId || '').toString().trim();
        let party = cid ? customers.find(c => c.id === cid) : null;
        if (!party) {
            party = customers.find(c => (c.name || '').trim().toLowerCase() === rawName.toLowerCase());
        }
        if (!party) {
            throw new Error('Invoice must be linked to a saved customer or vendor in your accounts list.');
        }
        invoiceData.customerId = party.id;
        invoiceData.customerName = party.name;
        if (!invoiceData.customerAddress && party.address) {
            invoiceData.customerAddress = party.address;
        }

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
            ledgerAccount: invoiceData.ledgerAccount || null,
            dueDate: invoiceData.dueDate || null,
            placeOfSupply: invoiceData.placeOfSupply || null,
            taxScheme: invoiceData.taxScheme || null,
            taxSupplyType: invoiceData.taxSupplyType || null,

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
        const found = invoices.find(inv => inv.id === invoiceId);
        if (found) return found;
        if (invoiceId == null || invoiceId === '') return undefined;
        const s = String(invoiceId);
        return invoices.find(inv =>
            String(inv.id) === s
            || inv.invoiceNo === invoiceId
            || String(inv.invoiceNo || '') === s
        );
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
        if (t.includes('non-gst') || t === 'without-bill' || t === 'non-gst-invoice' || t === 'purchase-non-gst') {
            return false;
        }
        return t === 'sales-gst' || t === 'gst-invoice' || t === 'with-bill' || t === 'purchase-gst';
    },

    /**
     * Delete invoice. Always removes linked delivery/service challans so History / View DC stay in sync.
     * (Second arg kept for older call sites; ignored — challans are always deleted with the invoice.)
     */
    async deleteInvoice(invoiceId, _deleteChallanTooLegacy = true) {
        const invoices = DataManager.getData('invoices') || [];
        const invoice = invoices.find(inv => inv.id === invoiceId);

        if (invoice) {
            if (typeof DeliveryManager !== 'undefined') {
                const allChallans = DeliveryManager.getAllChallans();
                const linkedChallans = allChallans.filter(c => c.invoiceId === invoiceId || (c.id === invoice.challanId));

                for (const challan of linkedChallans) {
                    await DeliveryManager.deleteChallan(challan.id);
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
        // skipPreSaveMerge: union-merge with cloud would re-add rows still present remotely (delete must win).
        await DataManager.saveData('invoices', filtered, { skipPreSaveMerge: true });
        this._balanceCache = null;
        this._lastInvoicesRef = null;
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
    /** Same length as before but new merged array from DataManager — must recompute balances. */
    _lastInvoicesRef: null,

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
        const logicVersion = 14; // hasGst on BK receipts; plain vs GST voucher split
        if (this._balanceCache && 
            this._lastInvoiceCount === invoices.length && 
            this._lastVoucherCount === voucherCount &&
            this._lastInvoicesRef === invoices &&
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
            const isCreditNote = this._isCreditNoteDoc(inv);
            let balance = VoucherManager.getDocumentBalance(
                inv.id,
                invTotal,
                allocationsMap,
                inv.invoiceNo,
                inv,
                { allowLooseFallback: false }
            );
            const importedStatus = String(inv.status || '').toLowerCase();
            // If allocations are absent but imported status is authoritative, honor it.
            if (!isCreditNote && balance >= (invTotal - 0.05)) {
                if (importedStatus === 'paid') {
                    balance = 0;
                } else if (importedStatus === 'partial') {
                    // Keep non-zero to retain partial bucket even without granular allocations.
                    balance = Math.max(0.01, invTotal * 0.5);
                }
            }
            return {
                ...inv,
                balance: balance,
                isPaid: isCreditNote ? true : balance <= 0.05,
                isPartial: isCreditNote ? false : (balance > 0.05 && balance < (invTotal - 0.05))
            };
        });

        this._balanceCache = result;
        this._lastInvoiceCount = invoices.length;
        this._lastVoucherCount = voucherCount;
        this._lastInvoicesRef = invoices;
        return result;
    }
};

window.InvoiceManager = InvoiceManager;
