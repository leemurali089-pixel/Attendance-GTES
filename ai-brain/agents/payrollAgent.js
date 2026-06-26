/**
 * payrollAgent.js — Payroll & Dues Sub-Agent (Jarvis Multi-Agent ERP OS v2)
 * Handles: Salary summary, advance dues, pending payouts, month-wise report
 * ALL write operations are gated through ApprovalEngine.
 * Tamil keywords: sambalam, evlo sambalam, salary list, advance list, payout
 *
 * DATA INTEGRITY:
 * - Uses DataManager.KEYS.ADVANCES as authoritative source for advances/dues
 * - Uses SalaryModule (read-only) for salary records
 * - NEVER writes without ApprovalEngine.request() token
 */
(function (global) {
    'use strict';

    const KEYWORDS = [
        /\bpayroll\b/i, /\bsalary\b/i, /\bdues\b/i, /\badvance\b/i, /\bbonus\b/i,
        /\bpayout\b/i, /\bwage/i, /\bசம்பள/i, /\bsambalam\b/i, /\bsalary\s*list/i,
        /\badvance\s*list/i, /\bpending\s*salary/i, /\bevlo\s*sambalam/i, /\bஊதிய/i,
        /\bgenerate\s*(?:salary|payout)/i, /\bpayout\s*list/i, /\bsalary\s*payout/i
    ];

    function _money(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) return ErpFunctions.formatMoney(n);
        return '₹' + (parseFloat(n) || 0).toLocaleString('en-IN');
    }

    function _currentMonthLabel() {
        const d = new Date();
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getFullYear();
    }

    function _currentMonthPrefix() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return d.getFullYear() + '-' + mm;
    }

    /** Get all advances from DataManager */
    function _getAdvances() {
        if (typeof DataManager === 'undefined') return [];
        return DataManager.getData(DataManager.KEYS.ADVANCES) || [];
    }

    /** Total open advances (balance > 0) */
    function _openAdvances() {
        const adv = _getAdvances();
        let total = 0, count = 0;
        const list = [];
        adv.forEach(function (a) {
            const bal = parseFloat(a.balance != null ? a.balance : (a.amount || 0));
            if (bal > 0) {
                count++;
                total += bal;
                list.push({ employee: a.employee, amount: bal, date: a.date, id: a.id });
            }
        });
        return { count: count, total: total, list: list };
    }

    /** Get salary records for current month via SalaryModule or ADVANCES */
    function _currentMonthSalary() {
        const prefix = _currentMonthPrefix();
        if (typeof SalaryModule !== 'undefined' && SalaryModule.getSalaryRecords) {
            try {
                const records = SalaryModule.getSalaryRecords() || [];
                const month = records.filter(function (r) {
                    return String(r.month || r.date || '').startsWith(prefix);
                });
                let total = 0;
                month.forEach(function (r) { total += parseFloat(r.amount || r.netPay || r.salary || 0); });
                return { count: month.length, total: total, records: month, source: 'SalaryModule' };
            } catch (e) { /* fall through */ }
        }
        // Fallback: advances this month
        const adv = _getAdvances().filter(function (a) {
            return String(a.date || '').startsWith(prefix);
        });
        let total = 0;
        adv.forEach(function (a) { total += parseFloat(a.amount || 0); });
        return { count: adv.length, total: total, records: adv, source: 'DataManager.KEYS.ADVANCES' };
    }

    /** Employees with no payout record this month */
    function _pendingPayoutEmployees() {
        if (typeof DataManager === 'undefined') return [];
        const prefix = _currentMonthPrefix();
        const employees = DataManager.getData(DataManager.KEYS.EMPLOYEES) || [];
        const active = employees.filter(function (e) { return (e.status || 'Active') !== 'Inactive'; });

        let paidNames = new Set();
        if (typeof SalaryModule !== 'undefined' && SalaryModule.getSalaryRecords) {
            try {
                const records = SalaryModule.getSalaryRecords() || [];
                records.filter(function (r) { return String(r.month || r.date || '').startsWith(prefix); })
                       .forEach(function (r) { if (r.employee) paidNames.add(r.employee); });
            } catch (e) { /* fall through */ }
        }
        if (!paidNames.size) {
            const adv = _getAdvances().filter(function (a) { return String(a.date || '').startsWith(prefix); });
            adv.forEach(function (a) { if (a.employee) paidNames.add(a.employee); });
        }

        return active.filter(function (e) { return !paidNames.has(e.name); }).map(function (e) { return e.name; });
    }

    const PayrollAgentBrain = {
        id: 'payrollAgent',
        domains: ['payroll'],

        canHandle: function (query) {
            let score = 0;
            KEYWORDS.forEach(function (p) { if (p.test(String(query || ''))) score += 0.28; });
            return Math.min(1, score);
        },

        execute: async function (query, ctx) {
            ctx = ctx || {};
            const q = String(query || '').trim();

            // ── Briefing mode ─────────────────────────────────────────────
            if (ctx.mode === 'briefing') {
                const open = _openAdvances();
                const monthSal = _currentMonthSalary();
                const label = _currentMonthLabel();
                if (open.count === 0 && monthSal.count === 0) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'Payroll: no open advances. ' + label + ': no salary records.',
                        facts: [{ advCount: 0, pendingAdv: 0 }],
                        sourceRefs: ['DataManager.KEYS.ADVANCES'],
                        financial: true
                    };
                }
                const parts = [];
                if (open.count > 0) parts.push(open.count + ' open advance(s) totalling ' + _money(open.total));
                if (monthSal.count > 0) parts.push(label + ': ' + monthSal.count + ' salary record(s), ' + _money(monthSal.total));
                return {
                    ok: true, agentId: this.id,
                    message: 'Payroll: ' + parts.join('. '),
                    facts: [{ advCount: open.count, pendingAdv: open.total, monthSal: monthSal }],
                    sourceRefs: ['DataManager.KEYS.ADVANCES', monthSal.source],
                    financial: true
                };
            }

            // ── Pending payout / who hasn't been paid ──────────────────────
            if (/pending\s*payout|pending\s*salary|not\s*paid|unpaid|evlo\s*payout/i.test(q)) {
                const pending = _pendingPayoutEmployees();
                const label = _currentMonthLabel();
                if (!pending.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'All employees have salary records for ' + label + '.',
                        facts: [], sourceRefs: ['DataManager.KEYS.EMPLOYEES', 'DataManager.KEYS.ADVANCES'],
                        financial: true
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: pending.length + ' employee(s) with no salary record for ' + label + ': ' + pending.slice(0, 10).join(', '),
                    facts: [{ pending: pending }],
                    sourceRefs: ['DataManager.KEYS.EMPLOYEES', 'DataManager.KEYS.ADVANCES'],
                    financial: true
                };
            }

            // ── Advance dues ───────────────────────────────────────────────
            if (/advance|dues|evlo\s*advance/i.test(q)) {
                const open = _openAdvances();
                if (open.count === 0) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No open salary advances.',
                        facts: [open], sourceRefs: ['DataManager.KEYS.ADVANCES'],
                        financial: true
                    };
                }
                const preview = open.list.slice(0, 5).map(function (a) {
                    return a.employee + ': ' + _money(a.amount);
                }).join(', ');
                return {
                    ok: true, agentId: this.id,
                    message: open.count + ' advance(s) pending: ' + preview + (open.count > 5 ? ' …and more' : '') + '. Total: ' + _money(open.total),
                    facts: [open], sourceRefs: ['DataManager.KEYS.ADVANCES'],
                    financial: true
                };
            }

            // ── Salary for specific employee ───────────────────────────────
            const empMatch = q.match(/(?:salary|payroll|advance|sambalam)\s+(?:for|of)\s+([A-Za-z\s]+)/i);
            if (empMatch && typeof CommandRouter !== 'undefined') {
                const empName = empMatch[1].trim();
                const routed = await CommandRouter.route({
                    intent: /advance/i.test(q) ? 'employee_advance' : 'employee_salary',
                    slots: { employeeName: empName },
                    confidence: 0.9
                });
                if (routed && routed.message) {
                    return {
                        ok: routed.success !== false, agentId: this.id,
                        message: routed.message,
                        facts: routed.data ? [routed.data] : [],
                        sourceRefs: ['CommandRouter:payroll', 'DataManager.KEYS.ADVANCES'],
                        financial: true
                    };
                }
                // Fallback: search advances directly
                const adv = _getAdvances().filter(function (a) {
                    return String(a.employee || '').toLowerCase().indexOf(empName.toLowerCase()) >= 0;
                });
                if (adv.length) {
                    let total = 0;
                    adv.forEach(function (a) { total += parseFloat(a.balance != null ? a.balance : a.amount || 0); });
                    return {
                        ok: true, agentId: this.id,
                        message: empName + ' — ' + adv.length + ' advance record(s), balance: ' + _money(total),
                        facts: adv,
                        sourceRefs: ['DataManager.KEYS.ADVANCES'],
                        financial: true
                    };
                }
            }

            // ── Current month salary summary ───────────────────────────────
            if (/salary\s*list|salary\s*summary|month\s*salary|sambalam\s*list|evlo\s*sambalam/i.test(q)) {
                const monthSal = _currentMonthSalary();
                const label = _currentMonthLabel();
                if (!monthSal.count) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No salary records found for ' + label + '.',
                        facts: [], sourceRefs: [monthSal.source],
                        financial: true
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: label + ' salary: ' + monthSal.count + ' record(s), total ' + _money(monthSal.total),
                    facts: [monthSal], sourceRefs: [monthSal.source],
                    financial: true
                };
            }

            // ── Salary payout LIST (read-only) ────────────────────────────────
            // "generate salary payout list" — shows who gets paid, how much (read-only)
            if (/(?:generate|show|get|salary)\s*payout\s*list|payout\s*(?:list|report|summary)|salary\s*payout\s*(?:list|report)/i.test(q)) {
                if (typeof DataManager === 'undefined') {
                    return { ok: false, agentId: this.id, message: 'DataManager not loaded.', sourceRefs: [] };
                }
                const employees = DataManager.getData(DataManager.KEYS.EMPLOYEES) || [];
                const active = employees.filter(function (e) { return (e.status || 'Active') !== 'Inactive'; });
                if (!active.length) {
                    return { ok: true, agentId: this.id, message: 'No active employees found for payout list.', sourceRefs: ['DataManager.KEYS.EMPLOYEES'] };
                }
                const label = _currentMonthLabel();
                let totalPayout = 0;
                const rows = active.map(function (e) {
                    const base = parseFloat(e.salary || e.basicSalary || e.baseSalary || e.monthlySalary || 0);
                    totalPayout += base;
                    return (e.name || '?') + ': ' + _money(base);
                });
                const preview = rows.slice(0, 10).join(', ');
                const more = rows.length > 10 ? ' … and ' + (rows.length - 10) + ' more' : '';
                return {
                    ok: true, agentId: this.id,
                    message: label + ' salary payout list (' + active.length + ' employees, total ' + _money(totalPayout) + '):\n' + preview + more,
                    facts: active.slice(0, 20),
                    sourceRefs: ['DataManager.KEYS.EMPLOYEES'],
                    financial: true
                };
            }

            // ── Generate payout (WRITE — must go through ApprovalEngine) ──────
            if (/generate\s*payout|run\s*payroll|process\s*salary/i.test(q)) {
                if (typeof ApprovalEngine !== 'undefined') {
                    const pending = _pendingPayoutEmployees();
                    const label = _currentMonthLabel();
                    const result = await ApprovalEngine.request({
                        tier: 'T3',
                        functionName: 'payroll.generatePayout',
                        args: { month: label, employeeCount: pending.length },
                        description: 'Generate salary payout for ' + pending.length + ' employee(s) for ' + label
                    });
                    return {
                        ok: !!(result && result.approved),
                        agentId: this.id,
                        message: result && result.approved
                            ? 'Payout generation approved for ' + label + '. Processing ' + pending.length + ' employee(s).'
                            : 'Payout generation requires confirmation. Approval request raised.',
                        needConfirm: !(result && result.approved),
                        facts: [{ pending: pending.length, month: label }],
                        sourceRefs: ['ApprovalEngine', 'DataManager.KEYS.ADVANCES'],
                        financial: true
                    };
                }
                return {
                    ok: false, agentId: this.id,
                    message: 'Payout generation requires ApprovalEngine confirmation. Please use the Payroll module directly.',
                    sourceRefs: ['ApprovalEngine'],
                    financial: true
                };
            }

            // ── RAG fallback ───────────────────────────────────────────────
            const ragEngine = typeof RetrievalEngine !== 'undefined' ? RetrievalEngine : (typeof RagEngine !== 'undefined' ? RagEngine : null);
            if (ragEngine) {
                const rag = await ragEngine.retrieve(q, { collections: ['payroll'], limit: 3 });
                if (rag.ok && rag.hits && rag.hits.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: rag.hits.map(function (h) { return h.text; }).join(' | '),
                        facts: rag.hits, sourceRefs: rag.sourceRefs || ['RagEngine:payroll']
                    };
                }
            }

            // ── IntentEngine fallback ──────────────────────────────────────
            if (typeof IntentEngine !== 'undefined' && /salary|payroll|advance|bonus/.test(q)) {
                const parsed = IntentEngine.parse(q);
                if (parsed && parsed.intent && typeof CommandRouter !== 'undefined') {
                    const routed = await CommandRouter.route(parsed);
                    if (routed && routed.message) {
                        return {
                            ok: routed.success !== false, agentId: this.id,
                            message: routed.message,
                            sourceRefs: ['CommandRouter:' + parsed.intent],
                            financial: true
                        };
                    }
                }
            }

            return { ok: false, agentId: this.id, message: 'No data found.', sourceRefs: [] };
        }
    };

    global.PayrollAgentBrain = PayrollAgentBrain;
})(typeof window !== 'undefined' ? window : global);
