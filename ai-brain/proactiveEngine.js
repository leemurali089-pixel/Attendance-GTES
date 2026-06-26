/**
 * proactiveEngine.js — Daily briefing using InvoiceManager balances (ledger-accurate)
 */
(function (global) {
    'use strict';

    function _formatMoney(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) {
            return ErpFunctions.formatMoney(n);
        }
        return '₹' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function _ledgerOutstanding() {
        let pendingTotal = 0;
        let pendingCount = 0;
        if (typeof InvoiceManager !== 'undefined' && InvoiceManager.getInvoicesWithBalance) {
            const list = InvoiceManager.getInvoicesWithBalance() || [];
            list.forEach(function (inv) {
                const bal = parseFloat(inv.balance ?? inv.pending ?? 0);
                if (bal > 0.05) {
                    pendingCount += 1;
                    pendingTotal += bal;
                }
            });
        }
        return { pendingCount: pendingCount, pendingTotal: pendingTotal };
    }

    function _attendanceMetrics() {
        let activeEmployees = 0;
        let presentCount = 0;
        let absentCount = 0;
        if (typeof DataManager === 'undefined') {
            return { activeEmployees, presentCount, absentCount };
        }

        const employeesRaw = DataManager.getEmployees ? DataManager.getEmployees() : (DataManager.getData(DataManager.KEYS.EMPLOYEES) || []);
        const employees = Array.isArray(employeesRaw) ? employeesRaw.filter(function (e) {
            return (e.status || 'Active') !== 'Inactive';
        }) : [];
        activeEmployees = employees.length;

        const attendance = DataManager.getData(DataManager.KEYS.ATTENDANCE) || [];
        const todayStr = typeof DataManager.formatDate === 'function'
            ? DataManager.formatDate(new Date())
            : new Date().toISOString().slice(0, 10);
        const todayRecords = attendance.filter(function (a) {
            const d = typeof DataManager.formatDate === 'function'
                ? DataManager.formatDate(new Date(a.date))
                : String(a.date || '').slice(0, 10);
            return d === todayStr;
        });
        const presentStatuses = ['Present', 'H-Working', 'Half Day'];
        presentCount = todayRecords.filter(function (a) {
            return presentStatuses.indexOf(a.status) >= 0;
        }).length;
        const markedPresent = new Set(todayRecords.filter(function (a) {
            return a.status === 'Present' || a.status === 'H-Working';
        }).map(function (a) { return a.employee; }));
        absentCount = employees.filter(function (e) {
            return !markedPresent.has(e.name);
        }).length;

        return { activeEmployees, presentCount, absentCount };
    }

    function _pendingTasksCount() {
        if (typeof DataManager === 'undefined') return 0;
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        return tasks.filter(function (t) {
            return t.status === 'open' || t.status === 'pending';
        }).length;
    }

    function _monthRevenue() {
        if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics.getRevenueMetrics) {
            const now = new Date();
            const rev = BusinessAnalytics.getRevenueMetrics(now.getFullYear(), now.getMonth());
            return parseFloat(rev.currentMonth) || 0;
        }
        return 0;
    }

    const ProactiveEngine = {
        getDailyBriefing: function () {
            if (typeof OrchestratorAgent !== 'undefined') {
                return OrchestratorAgent.getProactiveBriefing().then(function (b) {
                    if (b && b.ok) {
                        const date = new Date().toISOString().slice(0, 10);
                        const rev = _monthRevenue();
                        const revMoney = _formatMoney(rev);
                        const messageEn = b.messageEn || b.message;
                        const withRev = messageEn + '\nThis month revenue: ' + revMoney;
                        return Object.assign({}, b, {
                            date: date,
                            briefing: withRev,
                            message: withRev,
                            messageEn: withRev,
                            messageTa: b.messageTa || withRev,
                            metrics: Object.assign({}, b.metrics || {}, { monthRevenue: rev })
                        });
                    }
                    return ProactiveEngine._legacyBriefing();
                }).catch(function () {
                    return ProactiveEngine._legacyBriefing();
                });
            }
            return ProactiveEngine._legacyBriefing();
        },

        _legacyBriefing: function () {
            const date = new Date().toISOString().slice(0, 10);
            const ledger = _ledgerOutstanding();
            const att = _attendanceMetrics();
            const pendingTasks = _pendingTasksCount();
            const revenue = _monthRevenue();
            const money = _formatMoney(ledger.pendingTotal);
            const revMoney = _formatMoney(revenue);

            const messageEn = [
                'Daily briefing for ' + date,
                att.presentCount + ' present, ' + att.absentCount + ' absent (' + att.activeEmployees + ' active employees)',
                ledger.pendingCount + ' invoices pending — ' + money + ' total outstanding',
                pendingTasks + ' pending task(s)',
                'This month revenue: ' + revMoney
            ].join('\n');

            const messageTa = [
                date + ' — இன்றைய சுருக்கம்',
                'வருகை: ' + att.presentCount + ' வந்துள்ளனர், ' + att.absentCount + ' வரவில்லை (' + att.activeEmployees + ' ஊழியர்கள்)',
                'நிலுவை: ' + ledger.pendingCount + ' invoice — மொத்தம் ' + money,
                'நிலுவில் task: ' + pendingTasks,
                'இந்த மாத வருவாய்: ' + revMoney
            ].join('\n');

            const briefing = messageEn;

            return {
                ok: true,
                date: date,
                briefing: briefing,
                message: briefing,
                messageEn: messageEn,
                messageTa: messageTa,
                metrics: {
                    presentCount: att.presentCount,
                    absentCount: att.absentCount,
                    activeEmployees: att.activeEmployees,
                    pendingInvoices: ledger.pendingCount,
                    pendingAmount: ledger.pendingTotal,
                    pendingTasks: pendingTasks,
                    monthRevenue: revenue
                },
                sourceRefs: [
                    'DataManager.getActiveEmployees',
                    'DataManager.getAttendance',
                    'InvoiceManager.getInvoicesWithBalance',
                    'DataManager.KEYS.TASKS',
                    'BusinessAnalytics.getRevenueMetrics'
                ]
            };
        }
    };

    global.ProactiveEngine = ProactiveEngine;
})(typeof window !== 'undefined' ? window : global);
