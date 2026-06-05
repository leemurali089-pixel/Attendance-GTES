/**
 * Universal Document Engine V3 — document type registry and adapter catalog.
 */
const DocumentTemplates = {
    TYPES: {
        'sales-invoice': { label: 'Sales Invoice', native: true, copyType: true },
        'purchase-invoice': { label: 'Purchase Invoice', native: false, copyType: true },
        'purchase-order': { label: 'Purchase Order', native: false, copyType: true },
        'delivery-challan': { label: 'Delivery Challan', native: false, copyType: true },
        'service-challan': { label: 'Service Challan', native: false, copyType: true },
        'job-card': { label: 'Job Card', native: false, copyType: true },
        'quotation': { label: 'Quotation', native: false, copyType: false },
        'proforma-invoice': { label: 'Proforma Invoice', native: false, copyType: true },
        'salary-slip': { label: 'Salary Slip', native: false, copyType: false },
        'attendance-report': { label: 'Attendance Report', native: false, copyType: false },
        'ledger-report': { label: 'Ledger Report', native: false, copyType: false },
        'customer-statement': { label: 'Customer Statement', native: false, copyType: false },
        'receipt-voucher': { label: 'Receipt Voucher', native: false, copyType: false },
        'payment-voucher': { label: 'Payment Voucher', native: false, copyType: false },
        'expense-voucher': { label: 'Expense Voucher', native: false, copyType: false },
        'material-issue': { label: 'Material Issue Note', native: false, copyType: false },
        'material-return': { label: 'Material Return Note', native: false, copyType: false },
        'service-report': { label: 'Service Report', native: false, copyType: false },
        'amc-report': { label: 'AMC Report', native: false, copyType: false },
        'inventory-report': { label: 'Inventory Report', native: false, copyType: false },
        'gst-report': { label: 'GST Report', native: false, copyType: false },
        'book-keeper-report': { label: 'Book Keeper Report', native: false, copyType: false }
    },

    _adapters: new Map(),

    register(type, adapter) {
        const meta = this.TYPES[type];
        if (!meta) {
            console.warn('[DocumentTemplates] Unknown type registered:', type);
        }
        this._adapters.set(type, { type, ...adapter });
        if (meta) meta.native = true;
    },

    get(type) {
        return this._adapters.get(type) || null;
    },

    hasNative(type) {
        const a = this._adapters.get(type);
        return !!(a && (a.buildDocument || a.generatePdfBytes));
    },

    supportsCopyType(type) {
        return DocumentSettings.COPY_TYPE_DOC_TYPES.has(type)
            || !!this._adapters.get(type)?.supportsCopyType;
    },

    label(type) {
        return this.TYPES[type]?.label || type;
    }
};

window.DocumentTemplates = DocumentTemplates;
