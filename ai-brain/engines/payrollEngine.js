/**
 * payrollEngine.js — Salary payout (sandboxed)
 */
(function (global) {
    'use strict';

    const PayrollEngine = {
        generatePayoutPreview: function (args) {
            return typeof ErpBridge !== 'undefined'
                ? ErpBridge.preview('payroll.generatePayout', args)
                : Promise.resolve({ ok: true, summary: 'Payout preview' });
        }
    };

    global.PayrollEngine = PayrollEngine;
})(typeof window !== 'undefined' ? window : global);
