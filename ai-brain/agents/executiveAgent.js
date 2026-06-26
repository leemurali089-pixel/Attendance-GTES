/**
 * executiveAgent.js — Jarvis Executive Analytics Agent (v2)
 *
 * Handles: revenue summary, collections, top customers by outstanding,
 *          month-over-month comparison, executive daily summary.
 *
 * All figures sourced exclusively from ERP DataManager / BusinessAnalytics.
 * Never guesses or fabricates financial values.
 */
(function (global) {
    'use strict';

    function _fmt(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) return ErpFunctions.formatMoney(n);
        return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    function _norm(s) { return String(s || '').trim().toLowerCase(); }

    function _today() { return new Date().toISOString().slice(0, 10); }
    function _thisMonth() {
        const d = new Date();
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }

    // ── Pattern detection ─────────────────────────────────────────────────────

    const EXEC_PATTERNS = [
        /\b(revenue|sales|collection|receivable|receipt|nalvadai)\b/i,
        /\b(profit|loss|margin|pl\b)\b/i,
        /\b(top\s+customer|biggest\s+customer|largest\s+account)\b/i,
        /\b(business\s+(summary|analytics|intelligence|overview|report))\b/i,
        /\b(month\s*(to|over)\s*month|mtd|ytd|year\s+to\s+date)\b/i,
        /\b(executive|analytics|kpi|dashboard)\b/i,
        /\b(how\s+much\s+(did|have|has)\s+we\s+(collect|receive|earn|sell))\b/i
    ];

    function _score(q) {
        let s = 0;
        EXEC_PATTERNS.forEach(function (p) { if (p.test(q)) s += 0.2; });
        return Math.min(1, s);
    }

    // ── Data fetchers ─────────────────────────────────────────────────────────

    function _getVoucherCollections(year, month) {
        if (typeof DataManager === 'undefined') return { total: 0, count: 0, items: [] };
        const vouchers = DataManager.getData(DataManager.KEYS.VOUCHERS) || [];
        const prefix = year + '-' + String(month).padStart(2, '0');
        const matched = vouchers.filter(function (v) {
            return String(v.date || '').startsWith(prefix) &&
                   /receipt|payment\s*received|customer\s*payment/i.test(v.type || v.voucherType || '');
        });
        const total = matched.reduce(function (sum, v) { return sum + parseFloat(v.amount || 0); }, 0);
        return { total: total, count: matched.length, items: matched };
    }

    function _getInvoiceSales(year, month) {
        if (typeof DataManager === 'undefined') return { total: 0, count: 0 };
        const invoices = DataManager.getData(DataManager.KEYS.INVOICES) || [];
        const prefix = year + '-' + String(month).padStart(2, '0');
        const matched = invoices.filter(function (inv) {
            return String(inv.date || '').startsWith(prefix);
        });
        const total = matched.reduce(function (sum, inv) {
            return sum + parseFloat(inv.amount || inv.total || inv.grandTotal || 0);
        }, 0);
        return { total: total, count: matched.length };
    }

    function _getTotalOutstanding() {
        if (typeof DataManager === 'undefined') return { total: 0, customerCount: 0, topCustomers: [] };
        let invoices = [];
        if (typeof InvoiceManager !== 'undefined' && InvoiceManager.getInvoicesWithBalance) {
            invoices = InvoiceManager.getInvoicesWithBalance() || [];
        } else {
            invoices = DataManager.getData(DataManager.KEYS.INVOICES) || [];
        }

        const grouped = {};
        invoices.forEach(function (inv) {
            const cn = inv.customerName || inv.partyName || 'Unknown';
            const bal = parseFloat(inv.balance != null ? inv.balance : (inv.pending || 0));
            if (bal > 0) grouped[cn] = (grouped[cn] || 0) + bal;
        });

        const list = Object.keys(grouped).map(function (name) {
            return { name: name, amount: grouped[name] };
        }).sort(function (a, b) { return b.amount - a.amount; });

        const total = list.reduce(function (s, c) { return s + c.amount; }, 0);
        return { total: total, customerCount: list.length, topCustomers: list.slice(0, 5) };
    }

    function _getMonthLabel(year, month) {
        const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return (names[month - 1] || '') + ' ' + year;
    }

    // ─────────────────────────────────────────────────────────────────────────

    const ExecutiveAgent = {
        id: 'executiveAgent',
        version: '2.0.0',

        canHandle: function (query) {
            return _score(query);
        },

        execute: function (query, context) {
            context = context || {};
            const q = String(query || '').trim();
            const { year, month } = _thisMonth();

            // ── Top customers by outstanding ──────────────────────────────────
            if (/\b(top|biggest|largest|highest)\b.*\b(customer|party|client)\b/i.test(q) ||
                /\b(who\s+(owes|has\s+the\s+most)|maximum\s+outstanding)\b/i.test(q)) {
                const data = _getTotalOutstanding();
                if (!data.topCustomers.length) {
                    return { ok: true, agentId: this.id, financial: true, message: 'No outstanding balances found.', sourceRefs: ['invoices'] };
                }
                const lines = data.topCustomers.map(function (c, i) {
                    return (i + 1) + '. ' + c.name + ' — ' + _fmt(c.amount);
                });
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Top customers by outstanding balance:\n' + lines.join('\n') +
                             '\n\nTotal outstanding across ' + data.customerCount + ' customer(s): ' + _fmt(data.total),
                    facts: [data],
                    sourceRefs: ['invoices']
                };
            }

            // ── Collections (receipts received) ───────────────────────────────
            if (/\b(collection|receipt|received|collected|nalvadai)\b/i.test(q)) {
                const data = _getVoucherCollections(year, month);
                if (!data.total) {
                    return { ok: true, agentId: this.id, financial: true, message: 'No collections recorded for ' + _getMonthLabel(year, month) + '.', sourceRefs: ['vouchers'] };
                }
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Collections for ' + _getMonthLabel(year, month) + ': ' + _fmt(data.total) +
                             ' (' + data.count + ' receipt(s))',
                    facts: [{ month: _getMonthLabel(year, month), total: data.total, count: data.count }],
                    sourceRefs: ['vouchers']
                };
            }

            // ── Revenue / Sales ───────────────────────────────────────────────
            if (/\b(revenue|sales|invoiced|billing|turnover)\b/i.test(q)) {
                // Try BusinessAnalytics first (more accurate)
                if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics.getRevenueMetrics) {
                    const metrics = BusinessAnalytics.getRevenueMetrics();
                    if (metrics && metrics.currentMonth != null) {
                        return {
                            ok: true, agentId: this.id, financial: true,
                            message: 'Revenue for ' + _getMonthLabel(year, month) + ': ' + _fmt(metrics.currentMonth) +
                                     (metrics.lastMonth != null ? '\nLast month: ' + _fmt(metrics.lastMonth) : ''),
                            facts: [metrics],
                            sourceRefs: ['invoices']
                        };
                    }
                }
                // Fallback: compute from invoices
                const data = _getInvoiceSales(year, month);
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Sales invoiced in ' + _getMonthLabel(year, month) + ': ' + _fmt(data.total) +
                             ' (' + data.count + ' invoice(s))',
                    facts: [{ month: _getMonthLabel(year, month), total: data.total, count: data.count }],
                    sourceRefs: ['invoices']
                };
            }

            // ── Executive summary / daily briefing ────────────────────────────
            if (/\b(executive|summary|overview|brief|dashboard|analytics|kpi)\b/i.test(q) ||
                context.mode === 'briefing') {
                const sales     = _getInvoiceSales(year, month);
                const collect   = _getVoucherCollections(year, month);
                const outstanding = _getTotalOutstanding();

                const lines = [
                    'Sales this month: ' + _fmt(sales.total) + ' (' + sales.count + ' invoices)',
                    'Collections this month: ' + _fmt(collect.total) + ' (' + collect.count + ' receipts)',
                    'Total outstanding: ' + _fmt(outstanding.total) + ' across ' + outstanding.customerCount + ' customers'
                ];

                if (outstanding.topCustomers.length) {
                    lines.push('Highest pending: ' + outstanding.topCustomers[0].name +
                               ' (' + _fmt(outstanding.topCustomers[0].amount) + ')');
                }

                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Executive Summary — ' + _getMonthLabel(year, month) + ':\n' + lines.join('\n'),
                    facts: [{ sales: sales, collections: collect, outstanding: outstanding }],
                    sourceRefs: ['invoices', 'vouchers']
                };
            }

            return { ok: false, agentId: this.id, message: null, sourceRefs: [] };
        },

        // ── Legacy handle() kept for backward compat ──────────────────────────
        handle: function (intent, args) {
            switch (intent) {
                case 'executive.revenue':     return Promise.resolve(this.execute('revenue'));
                case 'executive.collections': return Promise.resolve(this.execute('collections'));
                case 'executive.bi':          return Promise.resolve(this.execute('executive summary'));
                default:                      return Promise.resolve(this.execute(intent));
            }
        }
    };

    global.ExecutiveAgent = ExecutiveAgent;
})(typeof window !== 'undefined' ? window : global);
