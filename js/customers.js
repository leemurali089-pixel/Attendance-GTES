/**
 * Customer Management Module
 * Handles customer data, GST verification, and customer operations
 */

const CustomerManager = {
    async init() {
        await DataManager.init();
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
            name: customerData.name,
            address: customerData.address || '',
            gstin: customerData.gstin || '',
            phone: customerData.phone || '',
            email: customerData.email || '',
            customerDCNumber: customerData.customerDCNumber || '',
            accountType: customerData.accountType || 'Customer',
            isOtherAccount: customerData.isOtherAccount || false,
            accountGroup: customerData.accountGroup || '',
            balance: customerData.balance || 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

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

        customers[index] = {
            ...customers[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await DataManager.saveData('customers', customers);
        return customers[index];
    },

    /**
     * Get customer by ID
     */
    getCustomer(customerId) {
        const customers = DataManager.getData('customers') || [];
        return customers.find(c => c.id === customerId);
    },

    /**
     * Get all customers
     */
    getAllCustomers() {
        return DataManager.getData('customers') || [];
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
        await DataManager.saveData('customers', filtered);
    }
};
