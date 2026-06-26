/**
 * erpBridge.js — Gateway to CommandRouter + real sandbox ERP handlers
 */
(function (global) {
    'use strict';

    const INTENT_ALIASES = {
        'customer.outstanding': 'customer_outstanding',
        'employee.details': 'employee_details'
    };

    function _normalizeResult(result) {
        if (!result) return { ok: false, success: false, message: 'No response' };
        const ok = result.success !== false && result.ok !== false;
        return Object.assign({}, result, {
            ok: ok,
            success: result.success !== undefined ? result.success : ok,
            summary: result.message || result.summary || null
        });
    }

    function _resolveIntent(intent) {
        if (typeof IntentRegistry !== 'undefined' && IntentRegistry.get(intent)) {
            return intent;
        }
        return INTENT_ALIASES[intent] || intent;
    }

    function _employeeList(args) {
        if (args && args.employeeIds && args.employeeIds.length && typeof ErpFunctions !== 'undefined') {
                return args.employeeIds.map(function (id) {
                    return ErpFunctions.findEmployeeById(id) || ErpFunctions.findEmployeeByName(String(id));
                }).filter(Boolean);
        }
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions._employeeList) {
            return ErpFunctions._employeeList();
        }
        if (typeof DataManager !== 'undefined' && DataManager.getData) {
            const key = DataManager.KEYS?.EMPLOYEES || 'gtes_employees';
            const raw = DataManager.getData(key);
            if (Array.isArray(raw)) return raw;
            if (raw && typeof raw === 'object') return Object.values(raw).filter(function (v) { return v && typeof v === 'object'; });
        }
        return [];
    }

    async function _executeBulkAttendance(args) {
        args = args || {};
        const date = args.date ? new Date(args.date) : new Date();
        const status = args.status || 'present';
        const employees = _employeeList(args);
        if (!employees.length) {
            throw new Error('No employees found for bulk attendance.');
        }

        const results = [];
        for (let i = 0; i < employees.length; i++) {
            const emp = employees[i];
            const name = emp.name || emp.employeeName;
            if (!name) continue;
            const row = await ErpFunctions.markAttendanceDirect({
                employeeName: name,
                status: status,
                date: date
            });
            results.push(row);
        }

        if (typeof AttendanceModule !== 'undefined') {
            if (typeof AttendanceModule.loadAttendanceForDate === 'function') {
                await AttendanceModule.loadAttendanceForDate();
            } else if (typeof AttendanceModule.load === 'function') {
                await AttendanceModule.load();
            }
        }

        return {
            ok: true,
            success: true,
            summary: 'Bulk attendance: marked ' + results.length + ' employee(s) as ' + status,
            affectedCount: results.length,
            rows: results.slice(0, 20),
            sourceRefs: ['gtes_attendance']
        };
    }

    async function _executeBulkTasks(args) {
        args = args || {};
        const created = [];
        const tasks = args.tasks || [];

        if (tasks.length) {
            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i];
                const row = await ErpFunctions.createTaskDirect({
                    partyName: t.partyName || args.partyName,
                    narration: t.narration || t.hint || 'Bulk task',
                    type: t.type || 'normal',
                    followupDate: t.followupDate
                });
                created.push(row);
            }
        } else if (typeof TaskAgent !== 'undefined' && TaskAgent.createTask) {
            const result = await TaskAgent.createTask({
                partyName: args.partyName,
                taskHint: args.taskHint || args.narration,
                narration: args.narration
            });
            if (result && result.data) created.push(result.data);
        } else {
            const row = await ErpFunctions.createTaskDirect({
                partyName: args.partyName,
                narration: args.narration || args.taskHint || 'Task created via AI Brain',
                followupDate: args.followupDate
            });
            created.push(row);
        }

        return {
            ok: true,
            success: true,
            summary: 'Created ' + created.length + ' task(s)',
            affectedCount: created.length,
            rows: created,
            sourceRefs: ['gtes_tasks']
        };
    }

    async function _executeVoucherCreate(args) {
        args = args || {};
        if (!args.customerName && !args.customerId) {
            throw new Error('customerName is required for voucher creation');
        }
        if (!args.amount) {
            throw new Error('amount is required for voucher creation');
        }
        if (typeof VoucherManager === 'undefined' || !VoucherManager.createVoucher) {
            throw new Error('VoucherManager not available');
        }

        const voucher = await VoucherManager.createVoucher({
            type: args.type || 'receipt',
            date: args.date || new Date().toISOString().slice(0, 10),
            customerName: args.customerName,
            customerId: args.customerId,
            amount: parseFloat(args.amount),
            paymentMode: args.paymentMode || 'bank',
            allocations: args.allocations || [],
            linkedInvoices: args.linkedInvoices || [],
            remarks: args.remarks || 'Created via AI Brain',
            hasGst: args.hasGst,
            isPurchase: args.isPurchase
        });

        if (typeof InvoiceManager !== 'undefined' && InvoiceManager._balanceCache) {
            InvoiceManager._balanceCache = null;
        }

        return {
            ok: true,
            success: true,
            summary: 'Voucher ' + voucher.id + ' created for ₹' + (parseFloat(args.amount) || 0).toLocaleString('en-IN'),
            voucherId: voucher.id,
            affectedCount: 1,
            sourceRefs: [voucher.id]
        };
    }

    async function _executePayrollPayout(args) {
        args = args || {};
        if (typeof PayrollAgent !== 'undefined' && PayrollAgent.generateSalary) {
            const result = await PayrollAgent.generateSalary({
                monthName: args.monthName || args.month
            });
            return _normalizeResult(result);
        }
        if (typeof ReportsModule !== 'undefined' && ReportsModule.startSalaryPayoutFlow) {
            const now = new Date();
            const monthIdx = typeof ErpFunctions !== 'undefined'
                ? ErpFunctions.parseMonthName(args.monthName || args.month)
                : now.getMonth();
            await ReportsModule.startSalaryPayoutFlow(now.getFullYear(), monthIdx);
            return {
                ok: true,
                success: true,
                summary: 'Salary payout flow started',
                sourceRefs: ['payroll']
            };
        }
        throw new Error('Payroll payout not available');
    }

    const ErpBridge = {
        routeCommand: function (reasoning, ctx) {
            ctx = ctx || {};
            const rawIntent = reasoning.intent;

            if (rawIntent === 'briefing.daily' && typeof ProactiveEngine !== 'undefined') {
                return Promise.resolve(ProactiveEngine.getDailyBriefing()).then(function (b) {
                    return _normalizeResult({
                        success: true,
                        message: b.briefing || b.message,
                        data: b,
                        sourceRefs: b.sourceRefs
                    });
                });
            }

            if (typeof CommandRouter === 'undefined' || !CommandRouter.route) {
                return Promise.resolve({ ok: false, success: false, message: 'CommandRouter not available' });
            }

            const intent = _resolveIntent(rawIntent);
            const slots = typeof ContextEngine !== 'undefined'
                ? ContextEngine.buildCommandSlots(reasoning, ctx)
                : (reasoning.slots || reasoning.entities || {});

            const parsed = {
                intent: intent,
                slots: slots,
                confidence: reasoning.confidence || 0.8,
                confirmed: !!(reasoning.confirmed || ctx.confirmed)
            };

            return Promise.resolve(CommandRouter.route(parsed)).then(_normalizeResult);
        },

        executeSandbox: function (functionName, args, opts) {
            opts = opts || {};
            args = args || {};

            switch (functionName) {
                case 'attendance.bulkMark':
                    return _executeBulkAttendance(args);
                case 'task.bulkCreate':
                    return _executeBulkTasks(args);
                case 'voucher.create':
                    return _executeVoucherCreate(args);
                case 'payroll.generatePayout':
                    return _executePayrollPayout(args);
                default:
                    return Promise.resolve({ ok: false, success: false, error: 'Unknown sandbox function: ' + functionName });
            }
        },

        preview: function (functionName, args) {
            args = args || {};

            switch (functionName) {
                case 'payroll.generatePayout': {
                    const month = args.monthName || args.month || 'current month';
                    return Promise.resolve({
                        ok: true,
                        summary: 'Salary payout for ' + month + ' — opens payout confirmation in Salary module',
                        affectedCount: 1,
                        totals: {},
                        rows: [],
                        sourceRefs: ['payroll']
                    });
                }

                case 'attendance.bulkMark': {
                    const date = args.date || new Date().toISOString().slice(0, 10);
                    const status = args.status || 'present';
                    const employees = _employeeList(args);
                    return Promise.resolve({
                        ok: true,
                        summary: 'Bulk mark ' + status + ' on ' + date + ' for ' + employees.length + ' employees',
                        affectedCount: employees.length,
                        rows: employees.slice(0, 10).map(function (e) {
                            return { employee: e.name || e.employeeName, date: date, status: status };
                        }),
                        sourceRefs: ['gtes_attendance']
                    });
                }

                case 'task.bulkCreate': {
                    const tasks = args.tasks || [];
                    const count = tasks.length || (args.narration ? 1 : 0);
                    return Promise.resolve({
                        ok: true,
                        summary: 'Create ' + count + ' task(s)' + (args.partyName ? ' for ' + args.partyName : ''),
                        affectedCount: count,
                        rows: tasks.slice(0, 5),
                        sourceRefs: ['gtes_tasks']
                    });
                }

                case 'voucher.create':
                    return Promise.resolve({
                        ok: true,
                        summary: 'Voucher: ' + (args.type || 'receipt') + ' ₹' + (Number(args.amount) || 0).toLocaleString('en-IN') +
                            (args.customerName ? ' — ' + args.customerName : ''),
                        affectedCount: (args.allocations || []).length || 1,
                        totals: { amount: Number(args.amount) || 0 },
                        rows: args.allocations || [],
                        sourceRefs: (args.allocations || []).map(function (a) {
                            return a.invoiceNo || a.id;
                        }).filter(Boolean)
                    });

                default:
                    return Promise.resolve({
                        ok: true,
                        summary: 'Preview not available for ' + functionName,
                        affectedCount: 0,
                        rows: []
                    });
            }
        },

        execute: function (functionName, args, opts) {
            if (typeof SandboxEngine !== 'undefined' && SandboxEngine.isSandboxed(functionName)) {
                return this.executeSandbox(functionName, args, opts);
            }
            return this.routeCommand({ intent: functionName, entities: args, slots: args }, opts || {});
        }
    };

    global.ErpBridge = ErpBridge;
})(typeof window !== 'undefined' ? window : global);
