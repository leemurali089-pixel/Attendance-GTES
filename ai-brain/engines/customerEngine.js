/**
 * customerEngine.js — Customer outstanding + CRM reads
 */
(function (global) {
    'use strict';

    const CustomerEngine = {
        outstanding: function (args) {
            args = args || {};
            if (typeof CustomerAgent !== 'undefined' && CustomerAgent.getOutstanding) {
                return CustomerAgent.getOutstanding({
                    customerName: args.customer || args.customerName || args.name
                });
            }
            if (typeof KnowledgeEngine !== 'undefined') {
                return KnowledgeEngine.customerOutstanding(args.customer || args.customerId || args.name);
            }
            return Promise.resolve({ ok: false, error: 'Customer outstanding unavailable' });
        }
    };

    global.CustomerEngine = CustomerEngine;
})(typeof window !== 'undefined' ? window : global);
