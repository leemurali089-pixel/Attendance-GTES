/**
 * crmAgent.js — Customer outstanding + CRM reads
 */
(function (global) {
    'use strict';

    const CrmAgent = {
        id: 'crmAgent',
        handle: function (intent, args, ctx) {
            if (intent === 'customer.outstanding' && typeof CustomerEngine !== 'undefined') {
                return Promise.resolve(CustomerEngine.outstanding(args));
            }
            return FunctionEngine.invoke(intent, args, ctx);
        }
    };

    global.CrmAgent = CrmAgent;
})(typeof window !== 'undefined' ? window : global);
