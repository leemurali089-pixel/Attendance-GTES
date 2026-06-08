/**
 * hrAgent.js — Attendance + employee
 */
(function (global) {
    'use strict';

    const HrAgent = {
        id: 'hrAgent',
        handle: function (intent, args, ctx) {
            if (intent === 'attendance.bulkMark' && typeof SandboxEngine !== 'undefined') {
                return SandboxEngine.run('attendance.bulkMark', args, ctx);
            }
            if (intent === 'attendance.query' && typeof AttendanceEngine !== 'undefined') {
                return Promise.resolve(AttendanceEngine.query(args));
            }
            if (intent === 'employee.details' && typeof EmployeeEngine !== 'undefined') {
                return Promise.resolve(EmployeeEngine.getDetails(args));
            }
            return FunctionEngine.invoke(intent, args, ctx);
        }
    };

    global.HrAgent = HrAgent;
})(typeof window !== 'undefined' ? window : global);
