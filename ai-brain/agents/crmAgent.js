/**
 * crmAgent.js — Jarvis CRM Agent (v2)
 *
 * Handles: customer outstanding, invoice history, task summary,
 *          relationship chain, multi-match disambiguation,
 *          top outstanding customers list.
 *
 * canHandle() returns a score so OrchestratorAgent can route correctly.
 * execute()   handles all CRM read queries.
 */
(function (global) {
    'use strict';

    // Leading verb words that must be stripped from extracted customer names
    const VERB_PREFIX_RE = /^(?:show|check|get|display|give|find|tell|list|see|evlo|sollu|what\s+is|what's|how\s+much)\s+/i;

    function _norm(s) { return String(s || '').trim().toLowerCase(); }

    function _fmt(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) return ErpFunctions.formatMoney(n);
        return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    function _today() { return new Date().toISOString().slice(0, 10); }

    // ── Pattern sets ──────────────────────────────────────────────────────────

    const CUSTOMER_PATTERNS = [
        /\b(outstanding|pending|niluvai|balance|due|receivable)\b/i,
        /\b(customer|party|client|vendor)\b/i,
        /\b(invoice|bill|challan)\b.*\b(customer|party|for)\b/i,
        /\b(who\s+owes|owes\s+us|unpaid)\b/i,
        /\b(ledger|account\s+summary)\b/i,
        /\b(tasks?\s+for|followup\s+for|amc\s+for)\b/i,
        /niluvai|evlo\s+niluvai/i
    ];

    function _score(q) {
        let s = 0;
        CUSTOMER_PATTERNS.forEach(function (p) { if (p.test(q)) s += 0.25; });
        return Math.min(1, s);
    }

    // ── Customer resolution (with ambiguity) ──────────────────────────────────

    function _resolveCustomer(query) {
        if (typeof KnowledgeEngine !== 'undefined') {
            return KnowledgeEngine.resolveEntity(query, 'customer');
        }
        return { exact: null, candidates: [], ambiguous: false };
    }

    function _extractCustomerName(query) {
        const q = String(query || '');

        // 1. TamilCommandRegistry — handles "avon pending", "pending of avon", etc.
        if (typeof TamilCommandRegistry !== 'undefined' && TamilCommandRegistry.extractCustomerName) {
            const n = TamilCommandRegistry.extractCustomerName(q);
            // Only use if not just a verb
            if (n && !/^(?:show|check|get|display|give|find|tell|all|total|list)$/i.test(n.trim())) {
                // Strip leading verbs that the registry may have captured
                return n.trim().replace(VERB_PREFIX_RE, '').trim() || null;
            }
        }

        // 2. "for X" / "of X" / "customer/party/client X" pattern
        const m1 = q.match(/(?:for|of|customer|party|client)\s+([A-Za-z0-9\s&.'-]{2,40}?)(?:\s+(?:outstanding|pending|due|balance|invoice|task)|$)/i);
        if (m1) return m1[1].trim();

        // 3. "[verb] X pending/outstanding/balance/niluvai" — strip leading verb
        //    Handles: "show avon pending", "check avon outstanding", "avon niluvai"
        const m2 = q.match(/^(?:show|check|get|display|give|find|tell|evlo|sollu)?\s*([A-Za-z][A-Za-z0-9\s&.'-]{1,40}?)\s+(?:pending|outstanding|balance|due|niluvai|evlo|receivable|sollu)\s*(?:amount|balance)?\s*$/i);
        if (m2) {
            const raw = m2[1].trim();
            // Reject pure stop-words
            if (raw.length > 1 && !/^(?:show|check|get|display|give|find|tell|all|total|list)$/i.test(raw)) {
                return raw;
            }
        }

        // 4. "X ka/ki/ke pending" — Hindi / code-mix
        const m3 = q.match(/([A-Za-z][A-Za-z0-9\s&.'-]{1,35}?)\s+(?:ka|ki|ke)\s+(?:outstanding|pending|balance)/i);
        if (m3) return m3[1].trim();

        // 5. Context fallback (last resolved customer)
        if (typeof ContextManager !== 'undefined') {
            const s = ContextManager.get();
            if (s.lastCustomerName) return s.lastCustomerName;
        }
        return null;
    }

    // ── Data fetchers ─────────────────────────────────────────────────────────

    function _getOutstanding(customerName) {
        if (typeof InvoiceManager !== 'undefined' && InvoiceManager.getInvoicesWithBalance) {
            const invoices = InvoiceManager.getInvoicesWithBalance() || [];
            const lower = _norm(customerName);
            const matched = invoices.filter(function (inv) {
                const cn = _norm(inv.customerName || inv.partyName || '');
                return cn.includes(lower) || lower.includes(cn.split(' ')[0]);
            });
            const total = matched.reduce(function (sum, inv) {
                return sum + parseFloat(inv.balance != null ? inv.balance : (inv.pending || 0));
            }, 0);
            return { total: total, invoices: matched, customerName: customerName };
        }
        return null;
    }

    function _getTasks(customerName) {
        if (typeof DataManager === 'undefined') return [];
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const lower = _norm(customerName);
        return tasks.filter(function (t) {
            return _norm(t.partyName || t.customerName || '').includes(lower);
        });
    }

    function _getOverdueCustomers() {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoicesWithBalance) return [];
        const invoices = InvoiceManager.getInvoicesWithBalance() || [];
        const today = _today();
        const grouped = {};
        invoices.forEach(function (inv) {
            const cn = inv.customerName || inv.partyName || 'Unknown';
            const bal = parseFloat(inv.balance != null ? inv.balance : (inv.pending || 0));
            if (bal <= 0) return;
            const due = inv.dueDate || inv.date;
            const overdue = due && due < today;
            if (overdue) {
                grouped[cn] = (grouped[cn] || 0) + bal;
            }
        });
        return Object.keys(grouped).map(function (name) {
            return { name: name, amount: grouped[name] };
        }).sort(function (a, b) { return b.amount - a.amount });
    }

    /** All customers with outstanding — ranked by amount (high to low) */
    function _getAllOutstandingCustomers() {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoicesWithBalance) return [];
        const invoices = InvoiceManager.getInvoicesWithBalance() || [];
        const grouped = {};
        invoices.forEach(function (inv) {
            const cn = inv.customerName || inv.partyName || 'Unknown';
            const bal = parseFloat(inv.balance != null ? inv.balance : (inv.pending || 0));
            if (bal > 0.05) {
                if (!grouped[cn]) grouped[cn] = { name: cn, total: 0, count: 0 };
                grouped[cn].total += bal;
                grouped[cn].count++;
            }
        });
        return Object.values(grouped).sort(function (a, b) { return b.total - a.total; });
    }

    // ─────────────────────────────────────────────────────────────────────────

    const CrmAgent = {
        id: 'crmAgent',
        version: '2.0.0',

        canHandle: function (query) {
            return _score(query);
        },

        execute: function (query, context) {
            context = context || {};
            const q = String(query || '').trim();
            const lower = _norm(q);

            // ── All / top outstanding customers list ──────────────────────────
            if (/\b(top|all|list|rank|show\s+all|who\s+ow)\b.*\b(outstanding|pending|balance|due)\b|\b(outstanding|pending)\b.*\b(list|all|customers?|parties?|clients?)\b/i.test(q)) {
                const list = _getAllOutstandingCustomers();
                if (!list.length) return { ok: true, agentId: this.id, message: 'No outstanding balances found.', sourceRefs: ['invoices'] };
                const lines = list.slice(0, 15).map(function (c, i) {
                    return (i + 1) + '. ' + c.name + ' — ' + _fmt(c.total) + ' (' + c.count + ' inv)';
                });
                const grandTotal = list.reduce(function (s, c) { return s + c.total; }, 0);
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Outstanding customers (' + list.length + ' total) — Grand total: ' + _fmt(grandTotal) + '\n' + lines.join('\n'),
                    facts: [{ count: list.length, grandTotal: grandTotal, list: list }],
                    sourceRefs: ['invoices']
                };
            }

            // ── Overdue customers ─────────────────────────────────────────────
            if (/\b(overdue|over\s*due|late\s+payment|defaulter)\b/i.test(q)) {
                const list = _getOverdueCustomers();
                if (!list.length) return { ok: true, agentId: this.id, message: 'No overdue payments found.', sourceRefs: ['invoices'] };
                const lines = list.slice(0, 10).map(function (c, i) {
                    return (i + 1) + '. ' + c.name + ' — ' + _fmt(c.amount);
                });
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Customers with overdue payments (' + list.length + '):\n' + lines.join('\n'),
                    facts: [{ overdueCount: list.length, list: list }],
                    sourceRefs: ['invoices']
                };
            }

            // ── Pending/outstanding list (all customers) ──────────────────────
            if (/\b(all|total|list)\b.*\b(pending|outstanding)\b|\b(pending|outstanding)\b.*\b(list|all|total)\b/i.test(q) && !_extractCustomerName(q)) {
                // Delegate to AccountingAgent — it handles the full list better
                return { ok: false, agentId: this.id, message: null, sourceRefs: [] };
            }

            // ── Specific customer ─────────────────────────────────────────────
            const custName = context.resolvedEntityName || _extractCustomerName(q);
            if (!custName) {
                return { ok: false, agentId: this.id, message: null, sourceRefs: [] };
            }

            // ── Ambiguity check ───────────────────────────────────────────────
            const resolution = _resolveCustomer(custName);
            if (resolution.ambiguous && resolution.candidates.length > 1) {
                return {
                    ok: true, agentId: this.id,
                    needClarify: true,
                    candidates: resolution.candidates,
                    domain: 'customer',
                    message: 'Multiple customers match "' + custName + '".',
                    sourceRefs: ['customers']
                };
            }

            const resolvedName = resolution.exact ? resolution.exact.name : custName;

            // Update session context
            if (typeof ContextManager !== 'undefined' && ContextManager.set) {
                ContextManager.set({ lastCustomerName: resolvedName });
            }

            // ── Tasks for customer ────────────────────────────────────────────
            if (/\b(task|followup|follow.up|amc|service|remind)\b/i.test(q)) {
                const tasks = _getTasks(resolvedName);
                if (!tasks.length) {
                    return { ok: true, agentId: this.id, message: 'No tasks found for ' + resolvedName + '.', sourceRefs: ['tasks'] };
                }
                const open = tasks.filter(function (t) { return !/closed|done|completed/i.test(t.status || ''); });
                const lines = open.slice(0, 8).map(function (t) {
                    return '• ' + (t.type || 'Task') + ': ' + (t.narration || t.description || '') +
                        (t.followupDate ? ' (due ' + t.followupDate + ')' : '') +
                        ' [' + (t.status || 'Open') + ']';
                });
                return {
                    ok: true, agentId: this.id,
                    message: resolvedName + ' has ' + open.length + ' open task(s):\n' + lines.join('\n'),
                    facts: [{ customer: resolvedName, openTasks: open.length }],
                    sourceRefs: ['tasks']
                };
            }

            // ── Customer outstanding (default) ────────────────────────────────
            const data = _getOutstanding(resolvedName);
            if (!data || data.total <= 0) {
                return { ok: true, agentId: this.id, message: resolvedName + ' has no outstanding balance.', financial: true, sourceRefs: ['invoices'] };
            }

            const topInv = data.invoices.slice(0, 5).map(function (inv) {
                return '• ' + (inv.invoiceNo || inv.id || '—') + ' — ' + _fmt(inv.balance != null ? inv.balance : inv.pending) +
                    (inv.date ? ' (' + inv.date + ')' : '');
            });

            return {
                ok: true, agentId: this.id, financial: true,
                message: resolvedName + ' outstanding: ' + _fmt(data.total) +
                    (topInv.length ? '\n\nTop invoices:\n' + topInv.join('\n') : ''),
                facts: [{ customerName: resolvedName, total: data.total, invoiceCount: data.invoices.length }],
                sourceRefs: ['invoices']
            };
        }
    };

    global.CrmAgent = CrmAgent;
})(typeof window !== 'undefined' ? window : global);
