const CustomerAgent = {
    _ambiguousOptions() {
        return 'I can check: outstanding, invoice list, last invoice, attendance, salary. Say help for full list.';
    },

    _notFoundMessage(type, name) {
        const suggestions = type === 'employee'
            ? ErpFunctions.suggestSimilarEmployees(name)
            : ErpFunctions.suggestSimilarCustomers(name);
        if (typeof NotificationAgent !== 'undefined' && NotificationAgent.formatClarify) {
            const key = type === 'employee' ? 'employee_not_found' : 'customer_not_found';
            return NotificationAgent.formatClarify(key, { query: name, suggestions });
        }
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
            const invoices = typeof InvoiceManager !== 'undefined' && InvoiceManager.getInvoicesWithBalance
                ? (InvoiceManager.getInvoicesWithBalance() || [])
                : [];
            let pendingTotal = 0;
            let pendingCount = 0;
            invoices.forEach((inv) => {
                const bal = parseFloat(inv.balance ?? inv.pending ?? 0);
                if (bal > 0.05) {
                    pendingCount += 1;
                    pendingTotal += bal;
                }
            });
            const data = {
                customerName: 'All customers',
                total: pendingTotal,
                invoiceCount: pendingCount,
                overdueCount: pendingCount,
                invoices: []
            };
            return {
                success: true,
                message: pendingCount
                    ? `${pendingCount} pending invoice(s), total ${ErpFunctions.formatMoney(pendingTotal)} outstanding.`
                    : 'No pending invoice balances found.',
                data
            };
        }
        const customer = ErpFunctions.findCustomerByName(name);
        if (!customer) {
            const suggestions = ErpFunctions.suggestSimilarCustomers(name);
            const list = typeof CustomerManager !== 'undefined' ? (CustomerManager.getAllCustomers() || []).map(c => c.name || c.displayName).filter(Boolean) : [];
            const optText = list.length ? '\nAvailable options: ' + list.slice(0, 10).join(', ') + (list.length > 10 ? '...' : '') : '';
            return {
                success: false,
                needClarify: true,
                state: 'need_name',
                query: name,
                candidates: suggestions.map((n) => ({ name: n })),
                message: this._notFoundMessage('customer', name) + optText
            };
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
            const list = typeof CustomerManager !== 'undefined' ? (CustomerManager.getAllCustomers() || []).map(c => c.name || c.displayName).filter(Boolean) : [];
            const optText = list.length ? '\nAvailable options: ' + list.slice(0, 10).join(', ') + (list.length > 10 ? '...' : '') : '';
            return {
                success: false,
                needClarify: true,
                state: 'need_name',
                message: NotificationAgent.formatClarify('customer_need_last_invoice') + optText
            };
        }
        const customer = ErpFunctions.findCustomerByName(name);
        if (!customer) {
            const suggestions = ErpFunctions.suggestSimilarCustomers(name);
            const list = typeof CustomerManager !== 'undefined' ? (CustomerManager.getAllCustomers() || []).map(c => c.name || c.displayName).filter(Boolean) : [];
            const optText = list.length ? '\nAvailable options: ' + list.slice(0, 10).join(', ') + (list.length > 10 ? '...' : '') : '';
            return {
                success: false,
                needClarify: true,
                state: 'need_name',
                query: name,
                candidates: suggestions.map((n) => ({ name: n })),
                message: this._notFoundMessage('customer', name) + optText
            };
        }
        const data = await ErpFunctions.getCustomerLastInvoice(customer.name);
        return { success: true, message: NotificationAgent.format('customer_last_invoice', data), data };
    },

    async getInvoiceList(slots) {
        const name = this._resolveCustomer(slots);
        if (!name) {
            const list = typeof CustomerManager !== 'undefined' ? (CustomerManager.getAllCustomers() || []).map(c => c.name || c.displayName).filter(Boolean) : [];
            const optText = list.length ? '\nAvailable options: ' + list.slice(0, 10).join(', ') + (list.length > 10 ? '...' : '') : '';
            return {
                success: false,
                needClarify: true,
                state: 'need_name',
                message: NotificationAgent.formatClarify('customer_need_invoice_list') + optText
            };
        }
        const customer = ErpFunctions.findCustomerByName(name);
        if (!customer) {
            const suggestions = ErpFunctions.suggestSimilarCustomers(name);
            const list = typeof CustomerManager !== 'undefined' ? (CustomerManager.getAllCustomers() || []).map(c => c.name || c.displayName).filter(Boolean) : [];
            const optText = list.length ? '\nAvailable options: ' + list.slice(0, 10).join(', ') + (list.length > 10 ? '...' : '') : '';
            return {
                success: false,
                needClarify: true,
                state: 'need_name',
                query: name,
                candidates: suggestions.map((n) => ({ name: n })),
                message: this._notFoundMessage('customer', name) + optText
            };
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
