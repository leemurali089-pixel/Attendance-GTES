/**
 * attendanceEngine.js — Delegates to legacy AttendanceAgent / ErpFunctions (no local cache)
 */
(function (global) {
    'use strict';

    const AttendanceEngine = {
        query: function (args, queryText) {
            args = args || {};
            if (typeof CommandRouter !== 'undefined' && CommandRouter.route) {
                const q = String(queryText || '');
                let when = args.when || args.date;
                if (!when && /yesterday|innal|innalai|நேற்ற/u.test(q)) when = 'yesterday';
                else if (!when && /today|inniku|innikku|இன்ற/u.test(q)) when = 'today';
                const slots = {};
                if (when) slots.when = when;
                if (args.employee || args.employeeName) slots.employeeName = args.employee || args.employeeName;
                const intent = slots.employeeName ? 'employee_attendance' : 'absent_employees';
                return CommandRouter.route({ intent: intent, slots: slots, confidence: 1 })
                    .then(function (r) {
                        return Object.assign({ ok: r.success !== false }, r);
                    })
                    .catch(function (err) {
                        return { ok: false, success: false, message: err && err.message ? err.message : 'Attendance query failed.' };
                    });
            }
            return Promise.resolve({ ok: false, error: 'CommandRouter unavailable' });
        }
    };

    global.AttendanceEngine = AttendanceEngine;
})(typeof window !== 'undefined' ? window : global);
