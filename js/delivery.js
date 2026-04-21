/**
 * Delivery Challan Management Module
 * Handles DC, SC, Invoices, and Vouchers
 */

const DeliveryManager = {
    async init() {
        await DataManager.init();
        console.log('DeliveryManager initialized');
    },

    /**
     * Generate next challan number
     */
    generateChallanNumber(type) {
        const prefix = type === 'delivery' ? 'DC' : 'SC';
        const challans = DataManager.getData('challans') || [];
        const typeChallans = challans.filter(c => c.type === type);

        if (typeChallans.length === 0) return `${prefix}-0001`;

        const lastId = typeChallans[typeChallans.length - 1].id;
        const num = parseInt(lastId.split('-')[1]) + 1;
        return `${prefix}-${num.toString().padStart(4, '0')}`;
    },

    /**
     * Check if challan number exists
     */
    challanNumberExists(challanNumber) {
        const challans = DataManager.getData('challans') || [];
        return challans.some(c => c.id === challanNumber);
    },

    /**
     * Validate and set custom challan number
     */
    validateChallanNumber(challanNumber, type) {
        const prefix = type === 'delivery' ? 'DC' : 'SC';

        // Check format
        if (!challanNumber.startsWith(prefix + '-')) {
            throw new Error(`Challan number must start with ${prefix}-`);
        }

        // Check if exists
        if (this.challanNumberExists(challanNumber)) {
            throw new Error('This challan number already exists');
        }

        return true;
    },

    /**
     * Create challan
     */
    async createChallan(challanData) {
        const challans = DataManager.getData('challans') || [];

        // Validate custom number if provided
        if (challanData.customNumber) {
            this.validateChallanNumber(challanData.customNumber, challanData.type);
        }

        const challan = {
            id: challanData.customNumber || this.generateChallanNumber(challanData.type),
            type: challanData.type, // 'delivery' or 'service'
            date: challanData.date || new Date().toISOString().split('T')[0],
            customerId: challanData.customerId,
            referenceNumber: challanData.referenceNumber || '',
            serviceLocation: challanData.serviceLocation || '',
            complaint: challanData.complaint || '',
            faultReported: challanData.faultReported || '',
            observations: challanData.observations || '',
            workDone: challanData.workDone || '',
            items: challanData.items || [],
            subtotal: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            cgstPercent: challanData.cgstPercent || 0,
            sgstPercent: challanData.sgstPercent || 0,
            igstPercent: challanData.igstPercent || 0,
            roundOff: 0,
            total: 0,
            gstMode: challanData.gstMode !== false,
            technicianId: challanData.technicianId || '',
            terms: challanData.terms || 'Please check goods before accepting delivery',
            status: challanData.status || 'draft',
            invoiceId: challanData.invoiceId || null,
            dispatchVia: challanData.dispatchVia || '',
            lrNo: challanData.lrNo || '',
            vehicleNo: challanData.vehicleNo || '',
            dispatchDate: challanData.dispatchDate || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Calculate totals
        this.calculateChallanTotals(challan);

        // Reduce Inventory Stock
        await this.adjustInventoryStock(challan.items, false);

        challans.push(challan);
        await DataManager.saveData('challans', challans);
        return challan;
    },

    /**
     * Calculate challan totals
     */
    calculateChallanTotals(challan) {
        // Calculate subtotal
        challan.subtotal = challan.items.reduce((sum, item) => sum + (item.amount || 0), 0);

        if (challan.gstMode) {
            // Calculate GST
            challan.cgst = (challan.subtotal * challan.cgstPercent) / 100;
            challan.sgst = (challan.subtotal * challan.sgstPercent) / 100;
            challan.igst = (challan.subtotal * challan.igstPercent) / 100;
        } else {
            challan.cgst = 0;
            challan.sgst = 0;
            challan.igst = 0;
        }

        // Calculate total before round-off
        const totalBeforeRoundOff = challan.subtotal + challan.cgst + challan.sgst + challan.igst;

        // Calculate round-off
        challan.total = Math.round(totalBeforeRoundOff);
        challan.roundOff = challan.total - totalBeforeRoundOff;
    },

    /**
     * Update challan
     */
    async updateChallan(challanId, updates) {
        const challans = DataManager.getData('challans') || [];
        const index = challans.findIndex(c => c.id === challanId);

        if (index === -1) {
            throw new Error('Challan not found');
        }

        challans[index] = {
            ...challans[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Recalculate totals
        this.calculateChallanTotals(challans[index]);

        await DataManager.saveData('challans', challans);
        return challans[index];
    },

    /**
     * Get challan by ID
     */
    getChallan(challanId) {
        const challans = DataManager.getData('challans') || [];
        return challans.find(c => c.id === challanId);
    },

    /**
     * Get all challans
     */
    getAllChallans() {
        return DataManager.getData('challans') || [];
    },

    /**
     * Get challans with filters
     */
    getFilteredChallans(filters = {}) {
        let challans = this.getAllChallans();

        // Filter by type
        if (filters.type) {
            challans = challans.filter(c => c.type === filters.type);
        }

        // Filter by customer
        if (filters.customerId) {
            challans = challans.filter(c => c.customerId === filters.customerId);
        }

        // Filter by status
        if (filters.status) {
            challans = challans.filter(c => c.status === filters.status);
        }

        // Filter by month
        if (filters.month && filters.year) {
            challans = challans.filter(c => {
                const date = new Date(c.date);
                return date.getMonth() === filters.month && date.getFullYear() === filters.year;
            });
        }

        // Filter by financial year (April to March)
        if (filters.financialYear) {
            const fyStart = `${filters.financialYear}-04-01`;
            const fyEnd = `${filters.financialYear + 1}-03-31`;
            challans = challans.filter(c => c.date >= fyStart && c.date <= fyEnd);
        }

        // Filter by date range
        if (filters.startDate) {
            challans = challans.filter(c => c.date >= filters.startDate);
        }
        if (filters.endDate) {
            challans = challans.filter(c => c.date <= filters.endDate);
        }

        // Filter by technician
        if (filters.technicianId) {
            challans = challans.filter(c => c.technicianId === filters.technicianId);
        }

        return challans;
    },

    /**
     * Delete challan
     */
    async deleteChallan(challanId) {
        const challans = DataManager.getData('challans') || [];
        const challan = challans.find(c => c.id === challanId);

        if (challan) {
            // Restore items to inventory
            await this.adjustInventoryStock(challan.items, true);

            // Move to Recycle Bin BEFORE removing (avoid duplicate rows if delete runs twice)
            const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
            const already = bin.some(b => b.id === challanId && b._recordType === 'challan');
            if (!already) {
                bin.push({
                    ...challan,
                    _deletedAt: new Date().toISOString(),
                    _recordType: 'challan'
                });
                await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, bin);
            }
        }

        const filtered = challans.filter(c => c.id !== challanId);
        await DataManager.saveData('challans', filtered, { skipPreSaveMerge: true });
    },

    /**
     * Restore challan from recycle bin
     */
    async restoreChallan(challanId) {
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        const index = bin.findIndex(item => item.id === challanId && item._recordType === 'challan');

        if (index === -1) throw new Error('Challan not found in Recycle Bin');

        const challan = { ...bin[index] };
        delete challan._deletedAt;
        delete challan._recordType;

        const challans = DataManager.getData('challans') || [];
        challans.push(challan);

        const newBin = bin.filter((_, i) => i !== index);

        // Deduct items back from inventory (reverse of what was done on delete)
        await this.adjustInventoryStock(challan.items, false);

        await DataManager.saveData('challans', challans);
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, newBin);

        return challan;
    },

    /**
     * Adjust Inventory Stock based on Challan Items
     * @param {Array} items - List of items in the challan
     * @param {boolean} isAdding - true to add stock (delete challan), false to remove stock (create challan)
     */
    async adjustInventoryStock(items, isAdding) {
        console.log('adjustInventoryStock called:', { items, isAdding });
        if (!items || items.length === 0) return;

        const inventory = DataManager.getData('inventory') || [];
        console.log('Current Inventory for matching:', inventory);

        for (const item of items) {
            // Find material by name (case-insensitive)
            // Trim whitespace to ensure better matching
            const itemName = (item.description || '').trim().toLowerCase();
            const material = inventory.find(m => (m.name || '').trim().toLowerCase() === itemName);

            console.log(`Processing item: "${item.description}" -> Cleaned: "${itemName}" -> Matched:`, material ? material.name : 'NONE');

            if (material) {
                if (isAdding) {
                    await InventoryManager.addStock(material.id, item.quantity, 'Challan Deleted Restoration');
                    console.log(`Restored ${item.quantity} to ${material.name}`);
                } else {
                    try {
                        await InventoryManager.removeStock(material.id, item.quantity, 'Challan Created');
                        console.log(`Removed ${item.quantity} from ${material.name}`);
                    } catch (e) {
                        console.error(`FAILED to remove stock for ${material.name}: ${e.message}`);
                    }
                }
            } else {
                console.warn(`Item "${item.description}" not found in inventory. Stock not adjusted.`);
            }
        }
    },

    /**
     * Generate challan PDF
     */
    async generateChallanPDF(challanId) {
        const challan = this.getChallan(challanId);
        if (!challan) throw new Error('Challan not found');

        const customer = CustomerManager.getCustomer(challan.customerId);
        const settings = DataManager.getData('settings') || {};

        // TODO: Implement PDF generation using jsPDF
        // This will be implemented in Phase 6
        console.log('PDF generation will be implemented in Phase 6');

        return {
            success: false,
            message: 'PDF generation coming soon'
        };
    }
};
