/**
 * Customer Management Module
 * Handles customer data, GST verification, and customer operations
 */

const CustomerManager = {
    _partyIdInitPromise: null,
    _txPartyIdInitPromise: null,
    PARTY_MIGRATION_VERSION: '2',

    async init() {
        await DataManager.init();
        await this.ensurePartyIdsPersisted();
        // Run heavy transaction backfill in background; do not block app startup/sync.
        this.ensureTransactionPartyIdsPersisted().catch(err => {
            console.warn('[CustomerManager] partyId transaction backfill failed:', err);
        });
        console.log('CustomerManager initialized');
    },

    /**
     * Generate next customer ID
     */
    generateCustomerId() {
        const customers = DataManager.getData('customers') || [];
        if (customers.length === 0) return 'CUST-0001';

        const lastId = customers[customers.length - 1].id;
        const num = parseInt(lastId.split('-')[1]) + 1;
        return `CUST-${num.toString().padStart(4, '0')}`;
    },

    /**
     * Generate internal unique party ID (hidden from UI)
     */
    generatePartyId() {
        // O(1) generation; collision risk is negligible for this app scale.
        return `PTY-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    },

    _getOrCreatePartyId(customer) {
        if (!customer || typeof customer !== 'object') return '';
        const existing = (customer.partyId || '').toString().trim();
        if (existing) return existing;
        const created = this.generatePartyId();
        customer.partyId = created;
        return created;
    },

    async ensurePartyIdsPersisted() {
        if (this._partyIdInitPromise) return this._partyIdInitPromise;
        this._partyIdInitPromise = (async () => {
            const customers = DataManager.getData('customers') || [];
            if (!Array.isArray(customers) || customers.length === 0) return;
            let changed = false;
            for (const c of customers) {
                if (!c || typeof c !== 'object') continue;
                const before = (c.partyId || '').toString().trim();
                const after = this._getOrCreatePartyId(c);
                if (!before && after) changed = true;
            }
            if (changed) {
                await DataManager.saveData('customers', customers);
            }
        })().finally(() => {
            this._partyIdInitPromise = null;
        });
        return this._partyIdInitPromise;
    },

    async ensureTransactionPartyIdsPersisted() {
        const migrationKey = `gtes_party_migration_v${this.PARTY_MIGRATION_VERSION}`;
        try {
            if (localStorage.getItem(migrationKey) === 'done') return;
        } catch (e) { /* ignore storage issues */ }
        if (this._txPartyIdInitPromise) return this._txPartyIdInitPromise;

        this._txPartyIdInitPromise = (async () => {
        const resolveFromRecord = (record, typeHint = null) => {
            const name = record?.customerName || record?.vendor || record?.vendorName || record?.partyName || '';
            const id = record?.customerId || record?.vendorId || '';
            const accountType = typeHint || (record?.isPurchase ? 'supplier' : 'customer');
            return this.resolvePartyId({ customerId: id, customerName: name, accountType });
        };

        const patchCollection = async (key, mapper) => {
            const arr = DataManager.getData(key) || [];
            if (!Array.isArray(arr) || arr.length === 0) return;
            let changed = false;
            for (const rec of arr) {
                if (!rec || typeof rec !== 'object') continue;
                if ((rec.partyId || '').toString().trim()) continue;
                const pid = mapper(rec);
                if (pid) {
                    rec.partyId = pid;
                    changed = true;
                }
            }
            if (changed) await DataManager.saveData(key, arr);
        };

        await patchCollection('invoices', (r) => resolveFromRecord(r, 'customer'));
        await patchCollection('vouchers', (r) => resolveFromRecord(r, r?.isPurchase ? 'supplier' : 'customer'));
        await patchCollection(DataManager.KEYS.EXPENSES || 'purchases', (r) => resolveFromRecord(r, 'supplier'));
        try { localStorage.setItem(migrationKey, 'done'); } catch (e) { /* ignore */ }
        })().finally(() => {
            this._txPartyIdInitPromise = null;
        });
        return this._txPartyIdInitPromise;
    },

    /**
     * Verify GSTIN and fetch company details
     * @param {string} gstin - GST number to verify
     * @returns {Promise<Object>} Company details or null
     */
    async verifyGSTIN(gstin) {
        // Validate GSTIN format
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

        if (!gstinRegex.test(gstin)) {
            return {
                success: false,
                message: 'Invalid GSTIN format. Must be 15 characters (e.g., 33AAHCB5405C1ZA)'
            };
        }

        // Format is valid - return success for manual entry
        console.log('✓ GSTIN format validated successfully');
        return {
            success: false,
            message: 'GSTIN format validated. Please enter company details below.'
        };
    },

    /**
     * Format address from GST API response
     */
    formatAddress(addressObj) {
        if (!addressObj) return '';

        // Handle different API response formats
        const parts = [
            addressObj.bno || addressObj.bnm,
            addressObj.flno,
            addressObj.st,
            addressObj.loc,
            addressObj.dst,
            addressObj.stcd,
            addressObj.pncd
        ].filter(Boolean);

        return parts.join(', ');
    },

    /**
     * Add new customer
     */
    async addCustomer(customerData) {
        const customers = DataManager.getData('customers') || [];

        // Check for duplicate GSTIN
        if (customerData.gstin) {
            const existing = customers.find(c => c.gstin === customerData.gstin);
            if (existing) {
                throw new Error('Customer with this GSTIN already exists');
            }
        }

        const customer = {
            id: customerData.id || this.generateCustomerId(),
            partyId: customerData.partyId || this.generatePartyId(),
            name: customerData.name,
            address: customerData.address || '',
            gstin: customerData.gstin || '',
            phone: customerData.phone || '',
            email: customerData.email || '',
            customerDCNumber: customerData.customerDCNumber || '',
            accountType: customerData.accountType || 'Customer',
            isOtherAccount: customerData.isOtherAccount || false,
            accountGroup: customerData.accountGroup || '',
            balance: customerData.balance ?? customerData.openingBalance ?? 0,
            // Created in MJS PrimeLogic UI (not BookKeeper import)
            source: (customerData.source !== undefined && customerData.source !== null && customerData.source !== '')
                ? customerData.source
                : 'local',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const extraKeys = ['bookkeeperId', 'bookkeeperAccountId', 'state', 'pincode', 'pan', 'address2', 'country', 'openingBalance', 'creditLimit', 'creditPeriod', 'displayName', 'status'];
        extraKeys.forEach((k) => {
            const v = customerData[k];
            if (v !== undefined && v !== null && v !== '') customer[k] = v;
        });

        customers.push(customer);
        await DataManager.saveData('customers', customers);
        return customer;
    },

    /**
     * Update customer
     */
    async updateCustomer(customerId, updates) {
        const customers = DataManager.getData('customers') || [];
        const index = customers.findIndex(c => c.id === customerId);

        if (index === -1) {
            throw new Error('Customer not found');
        }

        const merged = {
            ...customers[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        if (!merged.source || merged.source === '') {
            merged.source = 'local';
        }
        customers[index] = merged;

        await DataManager.saveData('customers', customers);
        return customers[index];
    },

    /**
     * Get customer by ID
     */
    getCustomer(customerId) {
        if (!customerId || customerId === 'undefined') return undefined;
        const customers = DataManager.getData('customers') || [];
        const key = String(customerId).trim();
        const byId = customers.find(c => c.id === key);
        if (byId) {
            this._getOrCreatePartyId(byId);
            return byId;
        }
        const byPartyId = customers.find(c => (c.partyId || '').toString().trim() === key);
        if (byPartyId) {
            this._getOrCreatePartyId(byPartyId);
            return byPartyId;
        }
        return undefined;
    },

    /**
     * Get all customers
     */
    getAllCustomers() {
        const raw = DataManager.getData('customers');
        let list = [];
        if (raw == null) return [];
        if (Array.isArray(raw)) list = raw;
        else if (typeof DataManager.coerceJsonArray === 'function') {
            const arr = DataManager.coerceJsonArray(raw);
            list = Array.isArray(arr) ? arr : [];
        } else if (typeof raw === 'object') {
            list = Object.values(raw).filter((x) => x && typeof x === 'object');
        }
        if (typeof DataManager._dedupeFinancialRecords === 'function') {
            return DataManager._dedupeFinancialRecords(list, 'customers');
        }
        return list;
    },

    getCustomerByName(name, accountType = null) {
        const q = (name || '').toString().trim().toLowerCase();
        if (!q) return undefined;
        const customers = this.getAllCustomers();
        return customers.find(c => {
            const nm = (c.name || '').toString().trim().toLowerCase();
            if (nm !== q) return false;
            if (!accountType) return true;
            return (c.accountType || '').toString().trim().toLowerCase() === accountType.toLowerCase();
        });
    },

    resolvePartyId({ customerId = '', customerName = '', accountType = null } = {}) {
        const byId = this.getCustomer(customerId);
        if (byId) return this._getOrCreatePartyId(byId);
        const byName = this.getCustomerByName(customerName, accountType);
        if (byName) return this._getOrCreatePartyId(byName);
        return '';
    },

    /**
     * Search customers
     */
    searchCustomers(query) {
        const customers = this.getAllCustomers();
        const lowerQuery = query.toLowerCase();

        return customers.filter(customer =>
            customer.name.toLowerCase().includes(lowerQuery) ||
            customer.gstin.toLowerCase().includes(lowerQuery) ||
            customer.phone.includes(query)
        );
    },

    /**
     * Delete customer
     */
    async deleteCustomer(customerId) {
        const customers = DataManager.getData('customers') || [];
        const filtered = customers.filter(c => c.id !== customerId);
        // Pre-save merge re-unions the cloud list with local rows and would resurrect deleted parties.
        await DataManager.saveData('customers', filtered, { skipPreSaveMerge: true });
    }
};
