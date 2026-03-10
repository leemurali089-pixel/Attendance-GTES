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
        const prefix = type === 'with-bill' ? 'INV-WB' : 'INV-NB';
        const invoices = DataManager.getData('invoices') || [];
        const typeInvoices = invoices.filter(inv => inv.type === type);

        if (typeInvoices.length === 0) return `${prefix}-0001`;

        // Get the last invoice ID and extract the numeric part more robustly
        const lastInvoice = typeInvoices[typeInvoices.length - 1];
        const lastId = lastInvoice.id || '';
        const parts = lastId.split('-');
        const lastNumStr = parts[parts.length - 1];

        let nextNum = 1;
        if (lastNumStr && !isNaN(parseInt(lastNumStr))) {
            nextNum = parseInt(lastNumStr) + 1;
        } else {
            // Fallback: count total invoices of this type
            nextNum = typeInvoices.length + 1;
        }

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

        const invoice = {
            id: invoiceData.id || this.generateInvoiceNumber(invoiceData.type),
            type: invoiceData.type, // 'with-bill' or 'without-bill'
            challanId: invoiceData.challanId || null,
            date: invoiceData.date || new Date().toISOString().split('T')[0],
            customerId: invoiceData.customerId,
            customerName: invoiceData.customerName,
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
        return invoices.filter(inv => inv.type === type);
    },

    /**
     * Delete invoice
     */
    async deleteInvoice(invoiceId, deleteChallanToo = false) {
        const invoices = DataManager.getData('invoices') || [];
        const invoice = invoices.find(inv => inv.id === invoiceId);

        if (invoice && invoice.challanId && typeof DeliveryManager !== 'undefined') {
            if (deleteChallanToo) {
                // Delete the linked challan
                await DeliveryManager.deleteChallan(invoice.challanId);
            } else {
                // Instead of deleting the challan, we simply unlink it and reset its status
                await DeliveryManager.updateChallan(invoice.challanId, {
                    invoiceId: null,
                    status: 'pending'
                });
            }
        }

        const filtered = invoices.filter(inv => inv.id !== invoiceId);
        await DataManager.saveData('invoices', filtered);
    }
};

window.InvoiceManager = InvoiceManager;
