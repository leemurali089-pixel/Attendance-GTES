/**
 * knowledgeEngine.js — Structured Knowledge Layer (Jarvis AI OS v3)
 *
 * Entity schema format (vision-aligned):
 *   Employee  : { entityId, type:'employee', name, department, … }
 *   Customer  : { entityId, type:'customer', name, … }
 *   Invoice   : { entityId, type:'invoice', invoiceNo, customerName, balance, … }
 *   Voucher   : { entityId, type:'voucher', id, … }
 */
(function (global) {
    'use strict';

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _norm(s) { return String(s || '').trim().toLowerCase(); }

    function _fuzzyScore(query, target) {
        const q = _norm(query);
        const t = _norm(target);
        if (!q || !t) return 0;
        if (t === q) return 1.0;
        if (t.startsWith(q)) return 0.95;
        if (t.includes(q)) return 0.85;
        // Word-level partial match
        const words = q.split(/\s+/);
        const matches = words.filter(function (w) { return w.length > 1 && t.includes(w); });
        if (matches.length === words.length) return 0.80;
        if (matches.length > 0) return 0.5 + (matches.length / words.length) * 0.3;
        return 0;
    }

    function _makeEntityId(type, name) {
        return type + ':' + _norm(name).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    // ─── Entity Schema Wrappers ───────────────────────────────────────────────

    function _wrapEmployee(raw) {
        if (!raw) return null;
        return {
            entityId: _makeEntityId('employee', raw.name || raw.employeeName || ''),
            type: 'employee',
            name: raw.name || raw.employeeName || '',
            department: raw.department || raw.dept || '',
            designation: raw.designation || raw.role || '',
            salary: raw.salary || raw.monthlySalary || null,
            salaryType: raw.salaryType || null,
            joiningDate: raw.joiningDate || raw.joinDate || null,
            status: raw.status || 'Active',
            _raw: raw
        };
    }

    function _wrapCustomer(raw) {
        if (!raw) return null;
        return {
            entityId: _makeEntityId('customer', raw.name || raw.customerName || ''),
            type: 'customer',
            name: raw.name || raw.customerName || '',
            phone: raw.phone || raw.mobile || '',
            email: raw.email || '',
            address: raw.address || '',
            gstin: raw.gstin || '',
            _raw: raw
        };
    }

    function _wrapInvoice(raw) {
        if (!raw) return null;
        return {
            entityId: _makeEntityId('invoice', raw.invoiceNo || raw.id || ''),
            type: 'invoice',
            invoiceNo: raw.invoiceNo || raw.id || '',
            customerId: _makeEntityId('customer', raw.customerName || raw.partyName || ''),
            customerName: raw.customerName || raw.partyName || '',
            balance: parseFloat(raw.balance != null ? raw.balance : (raw.pending || 0)),
            amount: parseFloat(raw.amount || raw.total || 0),
            date: raw.date || null,
            dueDate: raw.dueDate || null,
            _raw: raw
        };
    }

    function _wrapVoucher(raw) {
        if (!raw) return null;
        return {
            entityId: _makeEntityId('voucher', raw.id || raw.voucherId || ''),
            type: 'voucher',
            voucherId: raw.id || raw.voucherId || '',
            customerName: raw.customerName || raw.partyName || '',
            amount: parseFloat(raw.amount || 0),
            date: raw.date || null,
            allocatedInvoices: raw.allocations || raw.linkedInvoices || [],
            _raw: raw
        };
    }

    // ─── Core Resolution ──────────────────────────────────────────────────────

    /**
     * Resolve a query to employee candidates.
     * Returns { exact: Entity|null, candidates: Entity[] }
     */
    function _resolveEmployees(query) {
        const candidates = [];
        let exact = null;

        let raw = [];
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.resolveEmployeeQuery) {
            const res = ErpFunctions.resolveEmployeeQuery(query);
            if (res && res.exact) {
                exact = _wrapEmployee(res.exact);
                return { exact: exact, candidates: [exact] };
            }
            if (res && res.candidates) raw = res.candidates;
        }

        // Fallback: scan DataManager employees
        if (!raw.length && typeof DataManager !== 'undefined') {
            raw = DataManager.getData(DataManager.KEYS.EMPLOYEES) || [];
        }

        const q = _norm(query);
        raw.forEach(function (emp) {
            const name = _norm(emp.name || emp.employeeName || '');
            const score = _fuzzyScore(q, name);
            if (score >= 0.5) {
                const wrapped = _wrapEmployee(emp);
                wrapped._score = score;
                if (score >= 0.95) exact = wrapped;
                candidates.push(wrapped);
            }
        });

        candidates.sort(function (a, b) { return (b._score || 0) - (a._score || 0); });
        return { exact: exact, candidates: candidates };
    }

    /**
     * Resolve a query to customer candidates.
     * Returns { exact: Entity|null, candidates: Entity[] }
     */
    function _resolveCustomers(query) {
        let exact = null;
        const candidates = [];

        let raw = [];
        if (typeof CustomerManager !== 'undefined' && CustomerManager.getAllCustomers) {
            raw = CustomerManager.getAllCustomers() || [];
        } else if (typeof ErpFunctions !== 'undefined' && ErpFunctions.findCustomerByName) {
            const found = ErpFunctions.findCustomerByName(query);
            if (found) {
                exact = _wrapCustomer(found);
                return { exact: exact, candidates: [exact] };
            }
        } else if (typeof DataManager !== 'undefined') {
            raw = DataManager.getData(DataManager.KEYS.CUSTOMERS) || [];
        }

        const q = _norm(query);
        raw.forEach(function (cust) {
            const name = _norm(cust.name || cust.customerName || '');
            const score = _fuzzyScore(q, name);
            if (score >= 0.4) {
                const wrapped = _wrapCustomer(cust);
                wrapped._score = score;
                if (score >= 0.95) exact = wrapped;
                candidates.push(wrapped);
            }
        });

        candidates.sort(function (a, b) { return (b._score || 0) - (a._score || 0); });
        return { exact: exact, candidates: candidates };
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    const KnowledgeEngine = {

        // ── Legacy compatibility ──────────────────────────────────────────────

        findCustomer: function (query) {
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.findCustomerByName) {
                return ErpFunctions.findCustomerByName(query);
            }
            const res = _resolveCustomers(query);
            return res.exact ? res.exact._raw : (res.candidates[0] ? res.candidates[0]._raw : null);
        },

        findEmployee: function (query) {
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.resolveEmployeeQuery) {
                const resolved = ErpFunctions.resolveEmployeeQuery(query);
                return resolved.exact || (resolved.candidates && resolved.candidates[0]) || null;
            }
            const res = _resolveEmployees(query);
            return res.exact ? res.exact._raw : (res.candidates[0] ? res.candidates[0]._raw : null);
        },

        customerOutstanding: function (customerIdOrName) {
            const name = typeof customerIdOrName === 'object'
                ? (customerIdOrName.name || customerIdOrName.customerName)
                : customerIdOrName;

            if (typeof CustomerAgent !== 'undefined' && CustomerAgent.getOutstanding) {
                return CustomerAgent.getOutstanding({ customerName: name });
            }
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.getCustomerOutstanding) {
                return ErpFunctions.getCustomerOutstanding(name).then(function (d) {
                    return {
                        success: true,
                        message: typeof NotificationAgent !== 'undefined'
                            ? NotificationAgent.format('customer_outstanding', d)
                            : (d.customerName + ' outstanding: ' + d.total),
                        data: d
                    };
                });
            }
            return Promise.resolve({ success: false, message: 'Outstanding lookup unavailable' });
        },

        getErpTerm: function (key) {
            return typeof TrainingCenter !== 'undefined'
                ? TrainingCenter.getErpTerm(key)
                : key;
        },

        // ── NEW: Entity Schema API (Vision-aligned) ───────────────────────────

        /**
         * Resolve any entity type with ambiguity support.
         * @param {string} query  — spoken/typed name
         * @param {string} type   — 'customer'|'employee'|'invoice'|'voucher'
         * @returns {{ exact: Entity|null, candidates: Entity[], ambiguous: boolean }}
         */
        resolveEntity: function (query, type) {
            let result = { exact: null, candidates: [] };

            if (type === 'employee') {
                result = _resolveEmployees(query);
            } else if (type === 'customer') {
                result = _resolveCustomers(query);
            } else if (type === 'invoice') {
                const raw = (typeof DataManager !== 'undefined')
                    ? (DataManager.getData(DataManager.KEYS.INVOICES) || [])
                    : [];
                const q = _norm(query);
                raw.forEach(function (inv) {
                    const no = _norm(inv.invoiceNo || inv.id || '');
                    const cn = _norm(inv.customerName || inv.partyName || '');
                    const score = Math.max(_fuzzyScore(q, no), _fuzzyScore(q, cn));
                    if (score >= 0.4) {
                        const w = _wrapInvoice(inv);
                        w._score = score;
                        if (score >= 0.95) result.exact = w;
                        result.candidates.push(w);
                    }
                });
                result.candidates.sort(function (a, b) { return (b._score || 0) - (a._score || 0); });
            } else if (type === 'voucher') {
                const raw = (typeof DataManager !== 'undefined')
                    ? (DataManager.getData(DataManager.KEYS.VOUCHERS) || [])
                    : [];
                const q = _norm(query);
                raw.forEach(function (v) {
                    const id = _norm(v.id || v.voucherId || '');
                    const cn = _norm(v.customerName || v.partyName || '');
                    const score = Math.max(_fuzzyScore(q, id), _fuzzyScore(q, cn));
                    if (score >= 0.4) {
                        const w = _wrapVoucher(v);
                        w._score = score;
                        if (score >= 0.95) result.exact = w;
                        result.candidates.push(w);
                    }
                });
                result.candidates.sort(function (a, b) { return (b._score || 0) - (a._score || 0); });
            }

            return {
                exact: result.exact,
                candidates: result.candidates.slice(0, 10),
                ambiguous: !result.exact && result.candidates.length > 1,
                count: result.candidates.length
            };
        },

        /**
         * Build a vision-schema entity wrapper from a raw ERP record.
         * @param {Object} raw
         * @param {string} type — 'employee'|'customer'|'invoice'|'voucher'
         * @returns {Entity}
         */
        buildEntitySchema: function (raw, type) {
            switch (type) {
                case 'employee': return _wrapEmployee(raw);
                case 'customer': return _wrapCustomer(raw);
                case 'invoice':  return _wrapInvoice(raw);
                case 'voucher':  return _wrapVoucher(raw);
                default: return Object.assign({ entityId: 'unknown:?', type: type }, raw);
            }
        },

        /**
         * Get entity by its generated ID (e.g. 'customer:avon_oxygen').
         * @param {string} entityId
         * @returns {Entity|null}
         */
        getEntityById: function (entityId) {
            if (!entityId) return null;
            const parts = entityId.split(':');
            const type = parts[0];
            const key = parts.slice(1).join(':');

            // Try to match by denormalized name
            const candidates = this.resolveEntity(key.replace(/_/g, ' '), type).candidates;
            return candidates.find(function (c) { return c.entityId === entityId; }) || candidates[0] || null;
        },

        /**
         * Detect entity type from a query (best-effort).
         * Returns 'customer'|'employee'|'invoice'|'voucher'|null
         */
        detectEntityType: function (query) {
            const q = _norm(query);
            if (/invoice|bill|challan|quotation|estimate/i.test(q)) return 'invoice';
            if (/voucher|receipt|payment/i.test(q)) return 'voucher';
            if (/employee|staff|worker|operator|attendance|salary/i.test(q)) return 'employee';
            if (/customer|party|client|vendor|outstanding|pending/i.test(q)) return 'customer';
            return null;
        },

        /** Expose schema helpers for agents */
        _wrapEmployee: _wrapEmployee,
        _wrapCustomer: _wrapCustomer,
        _wrapInvoice: _wrapInvoice,
        _wrapVoucher: _wrapVoucher,
        _fuzzyScore: _fuzzyScore,
        _norm: _norm
    };

    global.KnowledgeEngine = KnowledgeEngine;
})(typeof window !== 'undefined' ? window : global);
