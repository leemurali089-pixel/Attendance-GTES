/**
 * documentAgent.js — Jarvis Document Search Agent (v2)
 *
 * Handles: invoice lookup, challan search, estimate search,
 *          job card search, document summary by customer.
 *
 * All data sourced exclusively from ERP DataManager.
 */
(function (global) {
    'use strict';

    function _fmt(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) return ErpFunctions.formatMoney(n);
        return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    function _norm(s) { return String(s || '').trim().toLowerCase(); }

    // ── Pattern detection ─────────────────────────────────────────────────────

    const DOC_PATTERNS = [
        /\b(invoice|bill|tax\s+invoice)\b/i,
        /\b(challan|delivery\s*note|dc)\b/i,
        /\b(estimate|quotation|quote)\b/i,
        /\b(job\s*card|service\s*report)\b/i,
        /\b(document|doc)\b/i,
        /\binv[-#]?\s*\d+\b/i,
        /\b(latest|last|recent)\s+(invoice|bill|challan|quote)\b/i
    ];

    function _score(q) {
        let s = 0;
        DOC_PATTERNS.forEach(function (p) { if (p.test(q)) s += 0.25; });
        return Math.min(1, s);
    }

    // ── Data fetchers ─────────────────────────────────────────────────────────

    function _getData(key) {
        if (typeof DataManager === 'undefined') return [];
        return DataManager.getData(key) || [];
    }

    function _searchByNumberOrCustomer(items, query, numberField, customerField) {
        const q = _norm(query);
        return items.filter(function (item) {
            const no  = _norm(item[numberField] || item.id || '');
            const cn  = _norm(item[customerField] || item.partyName || item.customerName || '');
            return no.includes(q) || q.includes(no) || cn.includes(q) || q.includes(cn.split(' ')[0]);
        });
    }

    function _getCustomerName(query) {
        const m = query.match(/(?:for|of|customer|party)\s+([A-Za-z0-9\s&.'-]{2,40}?)(?:\s+(?:invoice|challan|estimate|quote)|$)/i);
        if (m) return m[1].trim();
        if (typeof ContextManager !== 'undefined') {
            const s = ContextManager.get();
            if (s.lastCustomerName) return s.lastCustomerName;
        }
        return null;
    }

    function _extractDocNumber(query) {
        // e.g. "INV-001", "invoice 45", "DC 12", "challan 7"
        const m = query.match(/(?:inv|invoice|challan|dc|estimate|quote|job|jc)[-#\s]*(\d+)/i);
        return m ? m[0].trim() : null;
    }

    // ─────────────────────────────────────────────────────────────────────────

    const DocumentAgentBrain = {
        id: 'documentAgent',
        version: '2.0.0',

        canHandle: function (query) {
            return _score(query);
        },

        execute: function (query, context) {
            context = context || {};
            const q = String(query || '').trim();

            // ── RAG-based document search (if available) ──────────────────────
            if (typeof RagEngine !== 'undefined' && /\b(find|search|show|get)\b.*\b(document|file|attachment)\b/i.test(q)) {
                return RagEngine.retrieve(q, { topK: 5 }).then(function (res) {
                    if (!res || !res.hits || !res.hits.length) {
                        return { ok: true, agentId: 'documentAgent', message: 'No documents found for: ' + q, sourceRefs: ['rag'] };
                    }
                    const lines = res.hits.map(function (h, i) {
                        return (i + 1) + '. ' + (h.title || h.id || 'Document') + (h.snippet ? '\n   ' + h.snippet : '');
                    });
                    return {
                        ok: true, agentId: 'documentAgent',
                        message: 'Found ' + res.hits.length + ' document(s):\n' + lines.join('\n'),
                        sourceRefs: ['rag']
                    };
                });
            }

            // ── Job cards ─────────────────────────────────────────────────────
            if (/\b(job\s*card|service\s*report|jc)\b/i.test(q)) {
                const jcKey = DataManager && DataManager.KEYS && DataManager.KEYS.JOBCARDS ? DataManager.KEYS.JOBCARDS : 'gtes_jobcards';
                const items = _getData(jcKey);
                const custName = _getCustomerName(q);
                const docNo = _extractDocNumber(q);
                const matched = items.filter(function (jc) {
                    const no = _norm(jc.jobCardNo || jc.id || '');
                    const cn = _norm(jc.customerName || jc.partyName || '');
                    if (docNo && (no.includes(_norm(docNo)) || _norm(docNo).includes(no))) return true;
                    if (custName && cn.includes(_norm(custName))) return true;
                    return false;
                });
                if (!matched.length) return { ok: true, agentId: this.id, message: 'No job cards found.', sourceRefs: ['jobcards'] };
                const lines = matched.slice(0, 5).map(function (jc) {
                    return '• ' + (jc.jobCardNo || jc.id) + ' — ' + (jc.customerName || '?') + ' — ' + (jc.status || 'Open') + (jc.date ? ' (' + jc.date + ')' : '');
                });
                return { ok: true, agentId: this.id, message: 'Job cards (' + matched.length + '):\n' + lines.join('\n'), sourceRefs: ['jobcards'] };
            }

            // ── Challans ──────────────────────────────────────────────────────
            if (/\b(challan|delivery\s*note|dc)\b/i.test(q)) {
                const chKey = DataManager && DataManager.KEYS && DataManager.KEYS.CHALLANS ? DataManager.KEYS.CHALLANS : 'gtes_challans';
                const items = _getData(chKey);
                const custName = _getCustomerName(q);
                const docNo = _extractDocNumber(q);
                const matched = items.filter(function (ch) {
                    const no = _norm(ch.challanNo || ch.id || '');
                    const cn = _norm(ch.customerName || ch.partyName || '');
                    if (docNo && no.includes(_norm(docNo))) return true;
                    if (custName && cn.includes(_norm(custName))) return true;
                    return false;
                });
                if (!matched.length) return { ok: true, agentId: this.id, message: 'No challans found.', sourceRefs: ['challans'] };
                const lines = matched.slice(0, 5).map(function (ch) {
                    return '• ' + (ch.challanNo || ch.id || '—') + ' — ' + (ch.customerName || '?') + (ch.date ? ' (' + ch.date + ')' : '');
                });
                return { ok: true, agentId: this.id, message: 'Challans (' + matched.length + '):\n' + lines.join('\n'), sourceRefs: ['challans'] };
            }

            // ── Estimates / Quotations ────────────────────────────────────────
            if (/\b(estimate|quotation|quote)\b/i.test(q)) {
                const estKey = DataManager && DataManager.KEYS && DataManager.KEYS.ESTIMATES ? DataManager.KEYS.ESTIMATES : 'gtes_estimates';
                const items = _getData(estKey);
                const custName = _getCustomerName(q);
                const docNo = _extractDocNumber(q);
                const matched = items.filter(function (est) {
                    const no = _norm(est.estimateNo || est.id || '');
                    const cn = _norm(est.customerName || est.partyName || '');
                    if (docNo && no.includes(_norm(docNo))) return true;
                    if (custName && cn.includes(_norm(custName))) return true;
                    return false;
                });
                if (!matched.length) return { ok: true, agentId: this.id, message: 'No estimates found.', sourceRefs: ['estimates'] };
                const lines = matched.slice(0, 5).map(function (est) {
                    return '• ' + (est.estimateNo || est.id || '—') + ' — ' + (est.customerName || '?') +
                        ' — ' + _fmt(est.total || est.amount || 0) + (est.date ? ' (' + est.date + ')' : '');
                });
                return { ok: true, agentId: this.id, message: 'Estimates (' + matched.length + '):\n' + lines.join('\n'), sourceRefs: ['estimates'] };
            }

            // ── Invoices (default document) ───────────────────────────────────
            if (/\b(invoice|bill|inv)\b/i.test(q) || _extractDocNumber(q)) {
                const invKey = DataManager && DataManager.KEYS && DataManager.KEYS.INVOICES ? DataManager.KEYS.INVOICES : 'gtes_invoices';
                const items = _getData(invKey);
                const custName = _getCustomerName(q);
                const docNo = _extractDocNumber(q);
                let matched;

                if (docNo) {
                    matched = _searchByNumberOrCustomer(items, docNo, 'invoiceNo', 'customerName');
                } else if (custName) {
                    matched = items.filter(function (inv) {
                        return _norm(inv.customerName || inv.partyName || '').includes(_norm(custName));
                    });
                } else if (/\b(latest|last|recent)\b/i.test(q)) {
                    matched = items.slice(-5).reverse();
                } else {
                    return { ok: false, agentId: this.id, message: null, sourceRefs: [] };
                }

                if (!matched.length) return { ok: true, agentId: this.id, message: 'No invoices found.', sourceRefs: ['invoices'] };

                const lines = matched.slice(0, 6).map(function (inv) {
                    return '• ' + (inv.invoiceNo || inv.id || '—') + ' — ' + (inv.customerName || inv.partyName || '?') +
                        ' — ' + _fmt(inv.amount || inv.total || inv.grandTotal || 0) + (inv.date ? ' (' + inv.date + ')' : '');
                });
                return {
                    ok: true, agentId: this.id,
                    message: 'Invoice(s) (' + matched.length + '):\n' + lines.join('\n'),
                    facts: [{ count: matched.length }],
                    sourceRefs: ['invoices']
                };
            }

            return { ok: false, agentId: this.id, message: null, sourceRefs: [] };
        },

        // ── Legacy handle() ───────────────────────────────────────────────────
        handle: function (intent, args, ctx) {
            return Promise.resolve(this.execute(intent + ' ' + JSON.stringify(args || {}), ctx));
        }
    };

    global.DocumentAgentBrain = DocumentAgentBrain;
})(typeof window !== 'undefined' ? window : global);
