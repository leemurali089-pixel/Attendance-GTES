/**
 * employeeEngine.js — Employee details via ErpFunctions.resolveEmployeeQuery
 */
(function (global) {
    'use strict';

    const EmployeeEngine = {
        getDetails: function (args) {
            args = args || {};
            const q = args.employee || args.employeeName || args.name || args.employeeId;

            if (typeof EmployeeAgent !== 'undefined' && EmployeeAgent.getEmployeeDetails) {
                return EmployeeAgent.getEmployeeDetails({ employeeName: q }).then(function (r) {
                    return Object.assign({ ok: r.success !== false }, r);
                });
            }

            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.resolveEmployeeQuery) {
                const resolved = ErpFunctions.resolveEmployeeQuery(q);
                const emp = resolved.exact || (resolved.candidates && resolved.candidates[0]);
                if (!emp) {
                    return Promise.resolve({ ok: false, success: false, error: 'Employee not found: ' + q });
                }
                return Promise.resolve({
                    ok: true,
                    success: true,
                    employee: emp,
                    summary: (emp.name || emp.employeeName) + ' — ' + (emp.designation || emp.role || 'Staff'),
                    sourceRefs: [emp.id || emp.empId]
                });
            }

            return Promise.resolve({ ok: false, error: 'Employee lookup unavailable' });
        }
    };

    global.EmployeeEngine = EmployeeEngine;
})(typeof window !== 'undefined' ? window : global);
