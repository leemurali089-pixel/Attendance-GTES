/**
 * attendanceEngine.js — Delegates to legacy AttendanceAgent / ErpFunctions (no local cache)
 */
(function (global) {
    'use strict';

    const AttendanceEngine = {
        query: function (args) {
            args = args || {};
            if (typeof CommandRouter !== 'undefined' && CommandRouter.route) {
                const when = args.when || args.date;
                const slots = {};
                if (when) slots.when = when;
                if (args.employee || args.employeeName) slots.employeeName = args.employee || args.employeeName;
                const intent = slots.employeeName ? 'employee_attendance' : 'absent_employees';
                return CommandRouter.route({ intent: intent, slots: slots, confidence: 1 })
                    .then(function (r) {
                        return Object.assign({ ok: r.success !== false }, r);
                    });
            }
            return Promise.resolve({ ok: false, error: 'CommandRouter unavailable' });
        }
    };

    global.AttendanceEngine = AttendanceEngine;
})(typeof window !== 'undefined' ? window : global);
