/**
 * knowledgeGraphEngine.js — Core relationship edges (Phase 2 skeleton)
 */
(function (global) {
    'use strict';

    const KnowledgeGraphEngine = {
        getCustomerInvoiceEdges: function (customerId) {
            if (typeof KnowledgeEngine === 'undefined') return [];
            const out = KnowledgeEngine.customerOutstanding(customerId);
            if (!out.ok) return [];
            return (out.pendingInvoices || []).map(function (inv) {
                return { from: 'customer:' + customerId, to: 'invoice:' + inv.invoiceNo, type: 'has_pending_invoice', amount: inv.pending };
            });
        }
    };

    global.KnowledgeGraphEngine = KnowledgeGraphEngine;
})(typeof window !== 'undefined' ? window : global);
