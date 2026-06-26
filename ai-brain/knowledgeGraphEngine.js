/**
 * knowledgeGraphEngine.js — ERP Relationship Graph (Jarvis Multi-Agent ERP OS v2)
 * New in v2: AMC edges, service edges, getUpcomingAMC(), getCustomerAMCEdges()
 */
(function (global) {
    'use strict';

    function _findCustomer(name) {
        if (typeof KnowledgeEngine !== 'undefined') return KnowledgeEngine.findCustomer(name);
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.findCustomerByName) return ErpFunctions.findCustomerByName(name);
        return null;
    }

    function _findEmployee(name) {
        if (typeof KnowledgeEngine !== 'undefined') return KnowledgeEngine.findEmployee(name);
        return null;
    }

    function _today() { return new Date().toISOString().slice(0, 10); }

    function _addDays(dateStr, n) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
    }

    function _getTasks() {
        if (typeof DataManager === 'undefined') return [];
        return DataManager.getData(DataManager.KEYS.TASKS) || [];
    }

    const KnowledgeGraphEngine = {

        // ─────────────────────────────────────────────────────────────────
        // Customer → Invoice edges (pending only, via InvoiceManager)
        // ─────────────────────────────────────────────────────────────────
        getCustomerInvoiceEdges: function (customerIdOrName) {
            const name = typeof customerIdOrName === 'object'
                ? (customerIdOrName.name || customerIdOrName.customerName)
                : String(customerIdOrName || '');
            if (!name) return [];

            let list = [];
            if (typeof InvoiceManager !== 'undefined' && InvoiceManager.getInvoicesWithBalance) {
                list = InvoiceManager.getInvoicesWithBalance() || [];
            } else if (typeof DataManager !== 'undefined') {
                list = DataManager.getData(DataManager.KEYS.INVOICES) || [];
            }

            const lower = name.toLowerCase();
            return list.filter(function (inv) {
                const cn = String(inv.customerName || inv.partyName || '').toLowerCase();
                return cn.indexOf(lower) >= 0 || lower.indexOf(cn.split(' ')[0]) >= 0;
            }).filter(function (inv) {
                return parseFloat(inv.balance != null ? inv.balance : (inv.pending != null ? inv.pending : 0)) > 0.05;
            }).map(function (inv) {
                return {
                    from: 'customer:' + name,
                    to: 'invoice:' + (inv.invoiceNo || inv.id),
                    type: 'has_pending_invoice',
                    label: inv.invoiceNo || inv.id,
                    amount: inv.balance != null ? inv.balance : inv.pending,
                    date: inv.date
                };
            });
        },

        // ─────────────────────────────────────────────────────────────────
        // Invoice → Voucher edges
        // ─────────────────────────────────────────────────────────────────
        getInvoiceVoucherEdges: function (invoiceNo) {
            const edges = [];
            if (typeof DataManager === 'undefined') return edges;
            const vouchers = DataManager.getData(DataManager.KEYS.VOUCHERS) || [];
            vouchers.forEach(function (v) {
                const allocs = v.allocations || v.linkedInvoices || [];
                allocs.forEach(function (a) {
                    const no = a.invoiceNo || a.invoiceId || a.id;
                    if (no && String(no) === String(invoiceNo)) {
                        edges.push({
                            from: 'invoice:' + invoiceNo,
                            to: 'voucher:' + v.id,
                            type: 'paid_by_voucher',
                            label: v.id,
                            amount: a.amount || v.amount
                        });
                    }
                });
            });
            return edges;
        },

        // ─────────────────────────────────────────────────────────────────
        // Customer → Task edges (all tasks)
        // ─────────────────────────────────────────────────────────────────
        getCustomerTaskEdges: function (customerName) {
            const tasks = _getTasks();
            const name = String(customerName || '').toLowerCase();
            return tasks.filter(function (t) {
                return String(t.partyName || t.customerName || '').toLowerCase().indexOf(name) >= 0;
            }).map(function (t) {
                return {
                    from: 'customer:' + customerName,
                    to: 'task:' + (t.id || t.taskId),
                    type: 'has_task',
                    label: t.narration || t.type,
                    status: t.status,
                    followupDate: t.followupDate || t.dueDate
                };
            });
        },

        // ─────────────────────────────────────────────────────────────────
        // NEW v2: Customer → AMC task edges
        // ─────────────────────────────────────────────────────────────────
        getCustomerAMCEdges: function (customerName) {
            return this.getCustomerTaskEdges(customerName).filter(function (e) {
                return /amc|service|annual\s*maintenance|maintenance/i.test(String(e.label || '') + ' ' + String(e.type || ''));
            }).map(function (e) {
                return Object.assign({}, e, { type: 'has_amc' });
            });
        },

        // ─────────────────────────────────────────────────────────────────
        // NEW v2: Customer → Service job card edges
        // ─────────────────────────────────────────────────────────────────
        getCustomerServiceEdges: function (customerName) {
            // Check job cards in documents collection
            const edges = [];
            if (typeof DataManager === 'undefined') return edges;
            const lower = String(customerName || '').toLowerCase();
            const jobcards = DataManager.getData('jobcards') || [];
            jobcards.forEach(function (jc) {
                const cn = String(jc.customerName || jc.partyName || '').toLowerCase();
                if (cn.indexOf(lower) >= 0 || lower.indexOf(cn.split(' ')[0]) >= 0) {
                    edges.push({
                        from: 'customer:' + customerName,
                        to: 'jobcard:' + (jc.id || jc.jobCardNo),
                        type: 'has_service',
                        label: jc.jobCardNo || jc.id,
                        status: jc.status,
                        date: jc.date
                    });
                }
            });
            // Also check tasks with type=service
            this.getCustomerTaskEdges(customerName).filter(function (e) {
                return /service|job\s*card/i.test(String(e.label || ''));
            }).forEach(function (e) {
                edges.push(Object.assign({}, e, { type: 'has_service' }));
            });
            return edges;
        },

        // ─────────────────────────────────────────────────────────────────
        // NEW v2: AMC → follow-up edges (upcoming renewals)
        // ─────────────────────────────────────────────────────────────────
        getAMCFollowupEdges: function (days) {
            const today = _today();
            const limit = _addDays(today, days || 30);
            return _getTasks().filter(function (t) {
                const s = String(t.status || '').toLowerCase();
                if (s === 'closed' || s === 'done' || s === 'completed') return false;
                const isAmc = /amc|service|annual\s*maintenance/i.test(String(t.type || '') + ' ' + String(t.narration || ''));
                if (!isAmc) return false;
                const fd = String(t.followupDate || t.dueDate || t.nextDate || '');
                return fd >= today && fd <= limit;
            }).map(function (t) {
                return {
                    from: 'amc:' + (t.id || t.taskId),
                    to: 'followup:' + (t.followupDate || t.dueDate),
                    type: 'amc_followup',
                    label: (t.partyName || '—') + ' — ' + (t.narration || t.type || ''),
                    followupDate: t.followupDate || t.dueDate,
                    status: t.status,
                    partyName: t.partyName || t.customerName
                };
            });
        },

        // ─────────────────────────────────────────────────────────────────
        // NEW v2: getUpcomingAMC(days) — AMC tasks due within N days
        // ─────────────────────────────────────────────────────────────────
        getUpcomingAMC: function (days) {
            return this.getAMCFollowupEdges(days || 30);
        },

        // ─────────────────────────────────────────────────────────────────
        // Employee → Attendance edges
        // ─────────────────────────────────────────────────────────────────
        getEmployeeAttendanceEdges: function (employeeName) {
            if (typeof DataManager === 'undefined') return [];
            const attendance = DataManager.getData(DataManager.KEYS.ATTENDANCE) || [];
            return attendance.filter(function (a) {
                return String(a.employee || '').toLowerCase() === String(employeeName || '').toLowerCase();
            }).slice(-10).map(function (a) {
                return {
                    from: 'employee:' + employeeName,
                    to: 'attendance:' + a.date,
                    type: 'attendance_record',
                    label: a.status,
                    date: a.date
                };
            });
        },

        // ─────────────────────────────────────────────────────────────────
        // Employee → Payroll/advance edges
        // ─────────────────────────────────────────────────────────────────
        getEmployeePayrollEdges: function (employeeName) {
            if (typeof DataManager === 'undefined') return [];
            const adv = DataManager.getData(DataManager.KEYS.ADVANCES) || [];
            return adv.filter(function (a) {
                return String(a.employee || '').toLowerCase() === String(employeeName || '').toLowerCase();
            }).map(function (a) {
                return {
                    from: 'employee:' + employeeName,
                    to: 'advance:' + (a.id || a.date),
                    type: 'salary_advance',
                    label: a.amount,
                    amount: a.amount
                };
            });
        },

        // ─────────────────────────────────────────────────────────────────
        // Full customer relationship chain
        // ─────────────────────────────────────────────────────────────────
        getCustomerChain: function (customerIdOrName) {
            const cust = typeof customerIdOrName === 'object'
                ? customerIdOrName
                : _findCustomer(customerIdOrName);
            const name = cust ? (cust.name || cust.customerName) : String(customerIdOrName || '');
            if (!name) return [];

            const chain = [{ type: 'customer', label: name, to: name }];

            // Pending invoices
            const invEdges = this.getCustomerInvoiceEdges(name);
            invEdges.forEach(function (e) {
                chain.push({ type: e.type, label: e.label, to: e.to, amount: e.amount });
                const vch = KnowledgeGraphEngine.getInvoiceVoucherEdges(e.label || String(e.to).replace('invoice:', ''));
                vch.forEach(function (v) {
                    chain.push({ type: v.type, label: v.label, to: v.to, amount: v.amount });
                });
            });

            // All tasks
            const tasks = this.getCustomerTaskEdges(name);
            tasks.forEach(function (t) {
                chain.push({ type: t.type, label: t.label, to: t.to, status: t.status, followupDate: t.followupDate });
            });

            // AMC links (v2)
            const amcEdges = this.getCustomerAMCEdges(name);
            amcEdges.forEach(function (e) {
                chain.push({ type: 'amc_link', label: e.label, to: e.to, followupDate: e.followupDate });
            });

            // Service links (v2)
            const serviceEdges = this.getCustomerServiceEdges(name);
            serviceEdges.forEach(function (e) {
                chain.push({ type: 'service_link', label: e.label, to: e.to, status: e.status });
            });

            return chain;
        },

        // ─────────────────────────────────────────────────────────────────
        // Employee relationship chain
        // ─────────────────────────────────────────────────────────────────
        getEmployeeChain: function (employeeName) {
            const emp = _findEmployee(employeeName) || { name: employeeName };
            const name = emp.name || employeeName;
            const chain = [{ type: 'employee', label: name, to: name }];
            this.getEmployeeAttendanceEdges(name).forEach(function (e) { chain.push(e); });
            this.getEmployeePayrollEdges(name).forEach(function (e) { chain.push(e); });
            return chain;
        },

        // ─────────────────────────────────────────────────────────────────
        // Resolve with candidates (v3 wrapper)
        // ─────────────────────────────────────────────────────────────────
        resolveWithCandidates: function (name, type) {
            if (typeof KnowledgeEngine !== 'undefined' && KnowledgeEngine.resolveEntity) {
                return KnowledgeEngine.resolveEntity(name, type);
            }
            return { exact: null, candidates: [] };
        },

        // ─────────────────────────────────────────────────────────────────
        // Generic query entry point
        // ─────────────────────────────────────────────────────────────────
        query: function (entityType, entityId) {
            if (entityType === 'customer') return this.getCustomerChain(entityId);
            if (entityType === 'employee') return this.getEmployeeChain(entityId);
            if (entityType === 'amc')      return this.getUpcomingAMC(entityId || 30);
            return [];
        }
    };

    global.KnowledgeGraphEngine = KnowledgeGraphEngine;
})(typeof window !== 'undefined' ? window : global);
