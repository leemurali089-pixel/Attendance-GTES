const DocumentAgent = {
    async createInvoice() {
        if (typeof App !== 'undefined') App.showView('invoices');
        if (typeof InvoicesUI !== 'undefined' && InvoicesUI.showCreateModal) {
            InvoicesUI.showCreateModal('gst-invoice');
        }
        return { success: true, message: 'Opening GST invoice form.' };
    },

    async createQuotation() {
        if (typeof App !== 'undefined') App.showView('challans');
        if (typeof DeliveryUI !== 'undefined') DeliveryUI.showSection('history');
        return { success: true, message: 'Please create quotation from Delivery / Estimates section.' };
    },

    async createProforma() {
        return this.createInvoice();
    },

    async createDeliveryChallan() {
        if (typeof App !== 'undefined') App.showView('challans');
        if (typeof DeliveryUI !== 'undefined') DeliveryUI.showSection('create');
        return { success: true, message: 'Opening delivery challan create form.' };
    },

    async createJobCard() {
        if (typeof App !== 'undefined') App.showView('challans');
        if (typeof DeliveryUI !== 'undefined') DeliveryUI.showSection('jobcard');
        return { success: true, message: 'Opening job card section.' };
    },

    async deleteInvoice() {
        return { success: false, needClarify: true, message: 'Please specify the invoice number to delete, or delete from Invoices screen.' };
    }
};

window.DocumentAgent = DocumentAgent;
