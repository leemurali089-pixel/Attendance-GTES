/**
 * paymentsAgent.js — Jarvis Payments Agent (v1)
 *
 * Handles all payment/receipt voucher queries:
 *   - "How much has Avon paid?"
 *   - "Show Avon payment history"
 *   - "Recent receipts"
 *   - "Total collections today / this month"
 *   - "Pending vs received summary"
 *
 * DATA INTEGRITY — uses VoucherManager (receipt type) as authoritative source.
 * NEVER invents payment amounts.
 */
(function (global) {
    'use strict';

    function _norm(s) { return String(s || '').trim().toLowerCase(); }

    function _fmt(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) return ErpFunctions.formatMoney(n);
        return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    function _today() { return new Date().toISOString().slice(0, 10); }

    function _monthPrefix() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    // ── Pattern score ─────────────────────────────────────────────────────────

    const PATTERNS = [
        /\b(payment|receipt|received|collected|collection|voucher|paid|pay)\b/i,
        /\b(how\s+much.*paid|paid\s+by|paid\s+us|receipts?)\b/i,
        /\b(total\s+collection|money\s+received|cash\s+received|bank\s+received)\b/i,
        /\b(recent\s+receipt|latest\s+payment|payment\s+history)\b/i,
        /\b(வரவு|ரசீது|பணம்\s+வந்தது)\b/i
    ];

    function _score(q) {
        let s = 0;
        PATTERNS.forEach(function (p) { if (p.test(q)) s += 0.3; });
        return Math.min(1, s);
    }

    // ── Data helpers ──────────────────────────────────────────────────────────

    /** Get all receipt vouchers */
    function _getReceipts() {
        if (typeof VoucherManager !== 'undefined' && VoucherManager.getVouchers) {
            return (VoucherManager.getVouchers() || []).filter(function (v) {
                return /receipt|bank\s*receipt|cash\s*receipt/i.test(v.type || v.voucherType || '');
            });
        }
        // Fallback: DataManager vouchers filtered by type
        if (typeof DataManager !== 'undefined') {
            return (DataManager.getData(DataManager.KEYS.VOUCHERS) || []).filter(function (v) {
                return /receipt|bank\s*receipt|cash\s*receipt/i.test(v.type || v.voucherType || '');
            });
        }
        return [];
    }

    /** Filter receipts for a customer name (fuzzy) */
    function _getCustomerReceipts(receipts, customerName) {
        const lower = _norm(customerName);
        return receipts.filter(function (v) {
            const cn = _norm(v.customerName || v.partyName || '');
            return cn.includes(lower) || lower.includes(cn.split(' ')[0]);
        });
    }

    /** Extract customer name from query, stripping leading verb prefixes */
    function _extractName(q) {
        const VERB_RE = /^(?:show|check|get|display|how\s+much|how\s+much\s+has|how\s+much\s+did|what\s+did|payments?\s+(?:by|from|of)|receipts?\s+(?:by|from|of|for))\s+/i;

        // TamilCommandRegistry
        if (typeof TamilCommandRegistry !== 'undefined' && TamilCommandRegistry.extractCustomerName) {
            const n = TamilCommandRegistry.extractCustomerName(q);
            if (n && !/^(?:show|check|get|all|total|list)$/i.test(n.trim())) {
                return n.replace(VERB_RE, '').trim();
            }
        }

        // "payment/receipt of/from/for X"
        const m1 = q.match(/(?:payment|receipt|paid|collections?)(?:\s+(?:of|from|for|by))?\s+([A-Za-z][A-Za-z0-9\s&.'-]{1,40}?)(?:\s*$|\s+(?:paid|receipt|payment|history|summary|today|this\s+month))/i);
        if (m1) return m1[1].replace(VERB_RE, '').trim();

        // "how much has X paid"
        const m2 = q.match(/how\s+much\s+(?:has\s+)?([A-Za-z][A-Za-z0-9\s&.'-]{1,40}?)\s+(?:paid|given|cleared)/i);
        if (m2) return m2[1].trim();

        // "X payment / X receipts"
        const m3 = q.match(/^(?:show|check|get|display)?\s*([A-Za-z][A-Za-z0-9\s&.'-]{1,40}?)\s+(?:payment|receipt|paid|voucher)s?\s*$/i);
        if (m3) {
            const raw = m3[1].replace(VERB_RE, '').trim();
            if (raw.length > 1 && !/^(?:all|total|list|recent|latest)$/i.test(raw)) return raw;
        }

        // Context
        if (typeof ContextManager !== 'undefined') {
            const s = ContextManager.get();
            if (s.lastCustomerName) return s.lastCustomerName;
        }
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────

    const PaymentsAgent = {
        id: 'paymentsAgent',
        version: '1.0.0',

        canHandle: function (query) {
            return _score(query);
        },

        execute: function (query, context) {
            context = context || {};
            const q = String(query || '').trim();
            const receipts = _getReceipts();

            // ── Total collections today ──────────────────────────────────────
            if (/today|innikku|inniku/i.test(q) && /collect|receipt|received|paid/i.test(q)) {
                const today = _today();
                const todayR = receipts.filter(function (v) {
                    return String(v.date || '').slice(0, 10) === today;
                });
                const total = todayR.reduce(function (s, v) { return s + parseFloat(v.amount || 0); }, 0);
                if (!todayR.length) {
                    return { ok: true, agentId: this.id, message: 'No payments received today (' + today + ').', sourceRefs: ['vouchers'] };
                }
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Collections today (' + today + '): ' + _fmt(total) + ' across ' + todayR.length + ' receipt(s).',
                    facts: [{ date: today, total: total, count: todayR.length }],
                    sourceRefs: ['vouchers']
                };
            }

            // ── Total collections this month ──────────────────────────────────
            if (/this\s+month|month|மாதம்/i.test(q) && /collect|receipt|received|paid/i.test(q)) {
                const prefix = _monthPrefix();
                const monthR = receipts.filter(function (v) {
                    return String(v.date || '').startsWith(prefix);
                });
                const total = monthR.reduce(function (s, v) { return s + parseFloat(v.amount || 0); }, 0);
                if (!monthR.length) {
                    return { ok: true, agentId: this.id, message: 'No payments received this month (' + prefix + ').', sourceRefs: ['vouchers'] };
                }
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Collections this month (' + prefix + '): ' + _fmt(total) + ' across ' + monthR.length + ' receipt(s).',
                    facts: [{ month: prefix, total: total, count: monthR.length }],
                    sourceRefs: ['vouchers']
                };
            }

            // ── Recent receipts (all customers) ─────────────────────────────
            if (/recent\s+receipt|latest\s+payment|last\s+(?:\d+\s+)?receipt/i.test(q) && !_extractName(q)) {
                const sorted = receipts.slice().sort(function (a, b) {
                    return String(b.date || '') > String(a.date || '') ? 1 : -1;
                });
                const top = sorted.slice(0, 8);
                if (!top.length) {
                    return { ok: true, agentId: this.id, message: 'No receipt vouchers found.', sourceRefs: ['vouchers'] };
                }
                const lines = top.map(function (v) {
                    return '• ' + (v.customerName || v.partyName || '—') + ' — ' + _fmt(v.amount) + ' (' + (v.date || '—') + ')';
                });
                const total = top.reduce(function (s, v) { return s + parseFloat(v.amount || 0); }, 0);
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Recent receipts:\n' + lines.join('\n') + '\nTotal shown: ' + _fmt(total),
                    facts: top,
                    sourceRefs: ['vouchers']
                };
            }

            // ── Customer-specific payment history ────────────────────────────
            const custName = context.resolvedEntityName || _extractName(q);
            if (custName) {
                const custR = _getCustomerReceipts(receipts, custName);
                if (!custR.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No payment receipts found for "' + custName + '".',
                        sourceRefs: ['vouchers']
                    };
                }
                const total = custR.reduce(function (s, v) { return s + parseFloat(v.amount || 0); }, 0);
                const lines = custR.slice(0, 8).map(function (v) {
                    return '• ' + _fmt(v.amount) + ' on ' + (v.date || '—') + (v.narration ? ' — ' + v.narration : '');
                });
                // Update context
                if (typeof ContextManager !== 'undefined' && ContextManager.set) {
                    ContextManager.set({ lastCustomerName: custR[0].customerName || custName });
                }
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: (custR[0].customerName || custName) + ' has paid ' + _fmt(total) + ' in ' + custR.length + ' receipt(s):\n' + lines.join('\n'),
                    facts: [{ customerName: custName, total: total, count: custR.length }],
                    sourceRefs: ['vouchers']
                };
            }

            // ── Total all-time collections ───────────────────────────────────
            if (/total\s+(collection|receipt|payment|received)|all\s+receipt/i.test(q)) {
                const total = receipts.reduce(function (s, v) { return s + parseFloat(v.amount || 0); }, 0);
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Total collections (all time): ' + _fmt(total) + ' across ' + receipts.length + ' receipt(s).',
                    facts: [{ total: total, count: receipts.length }],
                    sourceRefs: ['vouchers']
                };
            }

            return { ok: false, agentId: this.id, message: 'No data found.', sourceRefs: [] };
        }
    };

    global.PaymentsAgent = PaymentsAgent;
})(typeof window !== 'undefined' ? window : global);
