/**
 * analyticsEngine.js — ERP-sourced analytics (used by executiveAgent Phase 5)
 */
(function (global) {
    'use strict';

    const AnalyticsEngine = {
        getRevenueSummary: function (period) {
            period = period || 'month';
            let revenue = 0;
            if (typeof DataManager !== 'undefined' && DataManager.getData) {
                const inv = DataManager.getData('invoices');
                const list = Array.isArray(inv) ? inv : (inv && inv.invoices) || [];
                list.forEach(function (i) {
                    revenue += Number(i.total || i.grandTotal || 0);
                });
            }
            return { ok: true, period: period, revenue: revenue, sourceRefs: ['invoices'] };
        },

        getCollectionsSummary: function () {
            let collected = 0;
            if (typeof DataManager !== 'undefined' && DataManager.getData) {
                const v = DataManager.getData('vouchers');
                const list = Array.isArray(v) ? v : (v && v.vouchers) || [];
                list.forEach(function (x) {
                    if ((x.type || '').toLowerCase() === 'receipt') {
                        collected += Number(x.amount || 0);
                    }
                });
            }
            return { ok: true, collections: collected, sourceRefs: ['vouchers'] };
        }
    };

    global.AnalyticsEngine = AnalyticsEngine;
})(typeof window !== 'undefined' ? window : global);
