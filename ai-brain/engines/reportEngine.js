/**
 * reportEngine.js — Report reads (Phase 2 stub)
 */
(function (global) {
    'use strict';

    const ReportEngine = {
        listAvailable: function () {
            return { ok: true, reports: ['sales', 'collections', 'attendance', 'payroll'] };
        }
    };

    global.ReportEngine = ReportEngine;
})(typeof window !== 'undefined' ? window : global);
