/**
 * knowledgeEngine.js — Thin wrappers to legacy ERP (no custom calculations)
 */
(function (global) {
    'use strict';

    const KnowledgeEngine = {
        findCustomer: function (query) {
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.findCustomerByName) {
                return ErpFunctions.findCustomerByName(query);
            }
            return null;
        },

        findEmployee: function (query) {
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.resolveEmployeeQuery) {
                const resolved = ErpFunctions.resolveEmployeeQuery(query);
                return resolved.exact || (resolved.candidates && resolved.candidates[0]) || null;
            }
            return null;
        },

        customerOutstanding: function (customerIdOrName) {
            const name = typeof customerIdOrName === 'object'
                ? (customerIdOrName.name || customerIdOrName.customerName)
                : customerIdOrName;

            if (typeof CustomerAgent !== 'undefined' && CustomerAgent.getOutstanding) {
                return CustomerAgent.getOutstanding({ customerName: name });
            }
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.getCustomerOutstanding) {
                return ErpFunctions.getCustomerOutstanding(name).then(function (d) {
                    return {
                        success: true,
                        message: typeof NotificationAgent !== 'undefined'
                            ? NotificationAgent.format('customer_outstanding', d)
                            : (d.customerName + ' outstanding: ' + d.total),
                        data: d
                    };
                });
            }
            return Promise.resolve({ success: false, message: 'Outstanding lookup unavailable' });
        },

        getErpTerm: function (key) {
            return typeof TrainingCenter !== 'undefined'
                ? TrainingCenter.getErpTerm(key)
                : key;
        }
    };

    global.KnowledgeEngine = KnowledgeEngine;
})(typeof window !== 'undefined' ? window : global);
