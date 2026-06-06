const CustomerAgent = {
    _ambiguousOptions() {
        return 'I can check: outstanding, invoice list, last invoice, attendance, salary. Say help for full list.';
    },

    _notFoundMessage(type, name) {
        const suggestions = type === 'employee'
            ? ErpFunctions.suggestSimilarEmployees(name)
            : ErpFunctions.suggestSimilarCustomers(name);
        let msg = `No ${type} found matching "${name}".`;
        if (suggestions.length) msg += ` Did you mean: ${suggestions.join(', ')}?`;
        return msg;
    },

    _resolveCustomer(slots) {
        let name = ContextManager.resolveCustomerName(slots);
        if (name) {
            name = TamilCommandRegistry.stripTemporalAndNoise(name);
            if (!TamilCommandRegistry.isValidEntityName(name)) {
                name = ContextManager.get().lastCustomerName || null;
            }
        }
        return name;
    },

    async getOutstanding(slots) {
        const name = this._resolveCustomer(slots);
        if (!name) {
            return { success: false, needClarify: true, message: `Which customer? Say the name, e.g. "outstanding of Vega" or just "Vega". ${this._ambiguousOptions()}` };
        }
        const customer = ErpFunctions.findCustomerByName(name);
        if (!customer) {
            return { success: false, needClarify: true, message: this._notFoundMessage('customer', name) };
        }
        const data = await ErpFunctions.getCustomerOutstanding(customer.name);
        return { success: true, message: NotificationAgent.format('customer_outstanding', data), data };
    },

    async getLastInvoice(slots) {
        let name = this._resolveCustomer(slots);
        if (!name && slots.customerName) {
            name = TamilCommandRegistry.stripTemporalAndNoise(slots.customerName);
        }
        if (!name) {
            return { success: false, needClarify: true, message: `Which customer last invoice should I show? Say "last invoice billed to [name]" or just the customer name. ${this._ambiguousOptions()}` };
        }
        const customer = ErpFunctions.findCustomerByName(name);
        if (!customer) {
            return { success: false, needClarify: true, message: this._notFoundMessage('customer', name) };
        }
        const data = await ErpFunctions.getCustomerLastInvoice(customer.name);
        return { success: true, message: NotificationAgent.format('customer_last_invoice', data), data };
    },

    async getInvoiceList(slots) {
        const name = this._resolveCustomer(slots);
        if (!name) {
            return { success: false, needClarify: true, message: `Which customer invoices should I list? Say the customer name or check outstanding first. ${this._ambiguousOptions()}` };
        }
        const customer = ErpFunctions.findCustomerByName(name);
        if (!customer) {
            return { success: false, needClarify: true, message: this._notFoundMessage('customer', name) };
        }
        const data = await ErpFunctions.getCustomerInvoiceList(customer.name);
        return { success: true, message: NotificationAgent.format('customer_invoice_list', data), data };
    },

    async searchCustomer(slots) {
        const name = slots.customerName;
        const c = ErpFunctions.findCustomerByName(name);
        if (!c) return { success: false, message: `No customer found matching "${name}".` };
        return {
            success: true,
            message: `Found ${c.name}${c.gstin ? `, GSTIN ${c.gstin}` : ''}.`,
            data: { customerId: c.id, customerName: c.name }
        };
    }
};

window.CustomerAgent = CustomerAgent;
