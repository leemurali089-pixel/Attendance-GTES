/**
 * financeAgent.js — Vouchers, payroll, collections
 */
(function (global) {
    'use strict';

    const FinanceAgent = {
        id: 'financeAgent',
        handle: function (intent, args, ctx) {
            if (intent === 'payroll.generatePayout' && typeof SandboxEngine !== 'undefined') {
                return SandboxEngine.run('payroll.generatePayout', args, ctx);
            }
            if (intent === 'voucher.create' && typeof SandboxEngine !== 'undefined') {
                return SandboxEngine.run('voucher.create', args, ctx);
            }
            return FunctionEngine.invoke(intent, args, ctx);
        }
    };

    global.FinanceAgent = FinanceAgent;
})(typeof window !== 'undefined' ? window : global);
