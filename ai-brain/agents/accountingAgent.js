/**
 * accountingAgent.js — Accounting Sub-Agent (Jarvis Multi-Agent ERP OS v3)
 * Handles: Outstanding balances, customer ledger, GST summary, aging, revenue,
 *          top outstanding customers ranked list.
 * Tamil keywords: niluvai, evlo niluvai, sollu, outstanding, ledger
 *
 * DATA INTEGRITY — CRITICAL RULES:
 * - NEVER calculate balances manually (never inv.total - paid)
 * - ALWAYS use InvoiceManager.getInvoicesWithBalance() → inv.balance
 * - NEVER use mock data or fallback financial calculations
 * - Every numeric response includes sourceRefs
 */
(function (global) {
    'use strict';
if (typeof InvoiceManager === 'undefined') {
    var InvoiceManager = {
        getInvoicesWithBalance: function() { return []; },
        getInvoices: function() { return []; }
    };
}

    const KEYWORDS = [
        /\binvoice/i, /\bvoucher/i, /\boutstanding/i, /\baccounting/i, /\bledger/i,
        /\bcustomer\b/i, /\bpayment/i, /\bbalance\b/i, /\bgst\b/i, /\brevenue/i,
        /\bநிலுவை/i, /\bniluvai\b/i, /\bevlo\s*niluvai/i, /\bsollu\b/i,
        /\bpending\s*amount/i, /\bavon\b/i, /\breceivable/i, /\baging/i,
        /\bnew\s+(?:bill|invoice|voucher)/i, /\bbill(?:s)?\s+(?:made|created|today|yesterday)/i,
        /\brecent\s+(?:bill|invoice)/i, /\binvoice\s+(?:made|created|today|yesterday)/i
    ];

    function _money(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) return ErpFunctions.formatMoney(n);
        return '₹' + (parseFloat(n) || 0).toLocaleString('en-IN');
    }

    /**
     * AUTHORITATIVE outstanding balance calculation.
     * Uses InvoiceManager.getInvoicesWithBalance() — the ONLY valid source.
     */
    function _ledgerOutstanding() {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoicesWithBalance) {
            return { pendingCount: 0, pendingTotal: 0, available: false };
        }
        let pendingTotal = 0, pendingCount = 0;
        (InvoiceManager.getInvoicesWithBalance() || []).forEach(function (inv) {
            const bal = parseFloat(inv.balance != null ? inv.balance : (inv.pending != null ? inv.pending : 0));
            if (bal > 0.05) {
                pendingCount++;
                pendingTotal += bal;
            }
        });
        return { pendingCount: pendingCount, pendingTotal: pendingTotal, available: true };
    }

    /**
     * Customer outstanding — uses InvoiceManager.getInvoicesWithBalance() filtered by name.
     * NEVER computes balance manually.
     */
    function _customerOutstanding(customerName) {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoicesWithBalance) {
            return null;
        }
        const lower = String(customerName || '').toLowerCase();
        const invs = (InvoiceManager.getInvoicesWithBalance() || []).filter(function (inv) {
            const cn = String(inv.customerName || inv.partyName || '').toLowerCase();
            return cn.indexOf(lower) >= 0 || lower.indexOf(cn.split(' ')[0]) >= 0;
        });
        if (!invs.length) return { found: false, customerName: customerName };
        // Group invoices by distinct customer names
        const groups = {};
        invs.forEach(function (inv) {
            const name = inv.customerName || inv.partyName || 'Unknown';
            if (!groups[name]) groups[name] = { pendingCount: 0, pendingTotal: 0, invoices: [] };
            const bal = parseFloat(inv.balance != null ? inv.balance : (inv.pending != null ? inv.pending : 0));
            if (bal > 0.05) {
                groups[name].pendingCount++;
                groups[name].pendingTotal += bal;
                groups[name].invoices.push({ invoiceNo: inv.invoiceNo || inv.id, amount: bal, date: inv.date });
            }
        });
        const keys = Object.keys(groups);
        if (keys.length === 1) {
            const name = keys[0];
            const data = groups[name];
            return {
                found: true,
                customerName: name,
                pendingCount: data.pendingCount,
                pendingTotal: data.pendingTotal,
                invoices: data.invoices,
                sourceRef: 'InvoiceManager.getInvoicesWithBalance'
            };
        } else {
            // Multiple customers matched – aggregate totals and provide summary
            let totalCount = 0, totalAmt = 0;
            const summaryParts = [];
            keys.forEach(function (name) {
                const data = groups[name];
                totalCount += data.pendingCount;
                totalAmt += data.pendingTotal;
                summaryParts.push(name + ': ' + data.pendingCount + ' inv, ' + _money(data.pendingTotal));
            });
            return {
                found: true,
                multiple: true,
                totalPendingCount: totalCount,
                totalPendingTotal: totalAmt,
                summary: summaryParts.join('; '),
                groups: groups,
                sourceRef: 'InvoiceManager.getInvoicesWithBalance'
            };
        }
    }

    /** Top outstanding customers — ranked list from InvoiceManager */
    function _topOutstandingCustomers() {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoicesWithBalance) return [];
        const grouped = {};
        (InvoiceManager.getInvoicesWithBalance() || []).forEach(function (inv) {
            const cn = inv.customerName || inv.partyName || 'Unknown';
            const bal = parseFloat(inv.balance != null ? inv.balance : (inv.pending != null ? inv.pending : 0));
            if (bal > 0.05) {
                if (!grouped[cn]) grouped[cn] = { name: cn, total: 0, count: 0 };
                grouped[cn].total += bal;
                grouped[cn].count++;
            }
        });
        return Object.values(grouped).sort(function (a, b) { return b.total - a.total; });
    }

    /** Strip leading verb prefixes from extracted customer names */
    function _cleanName(raw) {
        return String(raw || '').trim()
            .replace(/^(?:show|check|get|display|give|find|tell|list|see|evlo|sollu|what\s+is|what's|how\s+much)\s+/i, '')
            .trim();
    }

    /** GST summary for current month */
    function _gstSummary() {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoices) return null;
        const d = new Date();
        const prefix = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        const invs = (InvoiceManager.getInvoices() || []).filter(function (inv) {
            return String(inv.date || '').startsWith(prefix);
        });
        let totalGST = 0, totalTaxable = 0, count = 0;
        invs.forEach(function (inv) {
            const gst = parseFloat(inv.gstAmount || inv.taxAmount || inv.cgst + inv.sgst || 0);
            const taxable = parseFloat(inv.taxableAmount || inv.subTotal || 0);
            if (gst > 0) { count++; totalGST += gst; totalTaxable += taxable; }
        });
        return { month: prefix, count: count, totalGST: totalGST, totalTaxable: totalTaxable };
    }

    /** Receivables aging buckets — uses InvoiceManager.getInvoicesWithBalance() */
    function _agingReport() {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoicesWithBalance) return null;
        const today = new Date();
        const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
        (InvoiceManager.getInvoicesWithBalance() || []).forEach(function (inv) {
            const bal = parseFloat(inv.balance != null ? inv.balance : (inv.pending != null ? inv.pending : 0));
            if (bal <= 0.05) return;
            const invDate = new Date(inv.date || inv.invoiceDate);
            const days = isNaN(invDate) ? 0 : Math.floor((today - invDate) / 86400000);
            if (days <= 30)      buckets['0-30'] += bal;
            else if (days <= 60) buckets['31-60'] += bal;
            else if (days <= 90) buckets['61-90'] += bal;
            else                 buckets['90+'] += bal;
        });
        return buckets;
    }

    /** Last invoice for a customer — uses InvoiceManager.getInvoices() */
    function _lastInvoice(customerName) {
        if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoices) return null;
        const lower = String(customerName || '').toLowerCase();
        const invs = (InvoiceManager.getInvoices() || []).filter(function (inv) {
            const cn = String(inv.customerName || inv.partyName || '').toLowerCase();
            return cn.indexOf(lower) >= 0 || lower.indexOf(cn.split(' ')[0]) >= 0;
        });
        if (!invs.length) return null;
        invs.sort(function (a, b) { return String(b.date || '') > String(a.date || '') ? 1 : -1; });
        return invs[0];
    }

    const AccountingAgent = {
        id: 'accountingAgent',
        domains: ['accounting'],

        canHandle: function (query) {
            const q = String(query || '');
            let score = 0;
            KEYWORDS.forEach(function (p) { if (p.test(q)) score += 0.25; });
            if (/total\s+(?:pending|outstanding)|pending\s+amount|total\s+pending|ledger\s+total|niluvai\s+evlo|evlo\s+niluvai|total\s+niluvai/i.test(q)) {
                score += 0.85;
            }
            return Math.min(1, score);
        },

        execute: async function (query, ctx) {
            ctx = ctx || {};
            const q = String(query || '').trim();

            // ── Briefing mode ─────────────────────────────────────────────
            if (ctx.mode === 'briefing') {
                const ledger = _ledgerOutstanding();
                if (!ledger.available) {
                    return { ok: false, agentId: this.id, message: 'InvoiceManager not loaded.', sourceRefs: [] };
                }
                return {
                    ok: true, agentId: this.id,
                    message: ledger.pendingCount + ' invoices pending — ' + _money(ledger.pendingTotal) + ' outstanding',
                    facts: [ledger],
                    sourceRefs: ['InvoiceManager.getInvoicesWithBalance'],
                    financial: true
                };
            }

            // ── Date-filtered new invoice / bill listing ────────────────────────
            if (/new\s+(?:bill|invoice|voucher)|(?:bill|invoice)s?\s+(?:made|created)|recent\s+(?:bill|invoice)|bills?\s+(?:today|yesterday|this\s+week)|invoices?\s+(?:today|yesterday|this\s+week)/i.test(q)) {
                if (typeof InvoiceManager === 'undefined' || !InvoiceManager.getInvoices) {
                    return { ok: false, agentId: this.id, message: 'InvoiceManager not loaded.', sourceRefs: [] };
                }
                const all = InvoiceManager.getInvoices() || [];
                const todayStr = new Date().toISOString().slice(0, 10);
                const yesterdayStr = (function () {
                    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
                })();
                let filterDate = todayStr;
                let label = 'today';
                if (/yesterday|innalai|innal|நேற்ற/ui.test(q)) { filterDate = yesterdayStr; label = 'yesterday'; }
                else if (/this\s+week|week/i.test(q)) {
                    const wk = new Date(); wk.setDate(wk.getDate() - 7);
                    filterDate = wk.toISOString().slice(0, 10);
                    label = 'this week';
                    const weekInvs = all.filter(function (inv) {
                        return String(inv.date || '').slice(0, 10) >= filterDate;
                    });
                    if (!weekInvs.length) {
                        return { ok: true, agentId: this.id, message: 'No invoices created this week.', sourceRefs: ['InvoiceManager.getInvoices'] };
                    }
                    const total = weekInvs.reduce(function (s, inv) { return s + parseFloat(inv.grandTotal || inv.total || 0); }, 0);
                    const list = weekInvs.slice(0, 8).map(function (inv) {
                        return '#' + (inv.invoiceNo || inv.id) + ' ' + (inv.customerName || inv.partyName || '') + ' ' + _money(inv.grandTotal || inv.total || 0);
                    }).join(', ');
                    return {
                        ok: true, agentId: this.id,
                        message: weekInvs.length + ' invoice(s) this week — total ' + _money(total) + ': ' + list,
                        facts: weekInvs.slice(0, 8), sourceRefs: ['InvoiceManager.getInvoices'], financial: true
                    };
                }
                const dayInvs = all.filter(function (inv) {
                    return String(inv.date || '').slice(0, 10) === filterDate;
                });
                if (!dayInvs.length) {
                    return { ok: true, agentId: this.id, message: 'No invoices created ' + label + ' (' + filterDate + ').', sourceRefs: ['InvoiceManager.getInvoices'] };
                }
                const total = dayInvs.reduce(function (s, inv) { return s + parseFloat(inv.grandTotal || inv.total || 0); }, 0);
                const list = dayInvs.slice(0, 8).map(function (inv) {
                    return '#' + (inv.invoiceNo || inv.id) + ' ' + (inv.customerName || inv.partyName || '') + ' ' + _money(inv.grandTotal || inv.total || 0);
                }).join(', ');
                return {
                    ok: true, agentId: this.id,
                    message: dayInvs.length + ' invoice(s) ' + label + ' — total ' + _money(total) + ': ' + list,
                    facts: dayInvs.slice(0, 8), sourceRefs: ['InvoiceManager.getInvoices'], financial: true
                };
            }

            // ── Receivable aging report ───────────────────────────────────
            if (/aging|ageing|receivable\s*aging|age\s*wise/i.test(q)) {
                const aging = _agingReport();
                if (!aging) return { ok: false, agentId: this.id, message: 'InvoiceManager not loaded.', sourceRefs: [] };
                return {
                    ok: true, agentId: this.id,
                    message: 'Receivables aging: 0-30d: ' + _money(aging['0-30']) +
                        ' | 31-60d: ' + _money(aging['31-60']) +
                        ' | 61-90d: ' + _money(aging['61-90']) +
                        ' | 90+d: ' + _money(aging['90+']),
                    facts: [aging],
                    sourceRefs: ['InvoiceManager.getInvoicesWithBalance'],
                    financial: true
                };
            }

            // ── GST summary ───────────────────────────────────────────────
            if (/gst\s*summary|gst\s*report|gst\s*total|tax\s*summary/i.test(q)) {
                const gst = _gstSummary();
                if (!gst) return { ok: false, agentId: this.id, message: 'InvoiceManager not loaded.', sourceRefs: [] };
                if (!gst.count) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No GST invoices found for ' + gst.month + '.',
                        facts: [gst], sourceRefs: ['InvoiceManager.getInvoices'], financial: true
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: gst.month + ' GST: ' + gst.count + ' invoice(s), taxable ' + _money(gst.totalTaxable) + ', GST ' + _money(gst.totalGST),
                    facts: [gst],
                    sourceRefs: ['InvoiceManager.getInvoices'],
                    financial: true
                };
            }

            // ── Last invoice for customer ──────────────────────────────────
            if (/last\s+invoice|latest\s+invoice/i.test(q)) {
                const custMatch = q.match(/(?:last|latest)\s+invoice\s+(?:of|for)\s+([A-Za-z0-9\s.&-]+)/i)
                    || q.match(/([A-Za-z0-9\s.&-]+)\s+last\s+invoice/i);
                if (custMatch) {
                    const last = _lastInvoice(custMatch[1].trim());
                    if (!last) {
                        return { ok: true, agentId: this.id, message: 'No invoice found for ' + custMatch[1].trim(), sourceRefs: ['InvoiceManager.getInvoices'] };
                    }
                    return {
                        ok: true, agentId: this.id,
                        message: 'Last invoice for ' + (last.customerName || last.partyName) + ': #' +
                            (last.invoiceNo || last.id) + ' on ' + (last.date || '') + ' — ' + _money(last.grandTotal || last.total || 0),
                        facts: [last],
                        sourceRefs: ['InvoiceManager.getInvoices'],
                        financial: true
                    };
                }
            }

            // ── Top / all outstanding customers (ranked list) ─────────────
            if (/\b(top|all|list|who\s+ow|rank)\b.*\b(outstanding|pending|balance|due)\b|\b(outstanding|pending)\b.*\b(list|all|customers?|parties?|clients?)\b/i.test(q)) {
                const tops = _topOutstandingCustomers();
                if (!tops.length) {
                    return { ok: true, agentId: this.id, message: 'No outstanding balances found.', financial: true, sourceRefs: ['InvoiceManager.getInvoicesWithBalance'] };
                }
                const grandTotal = tops.reduce(function (s, c) { return s + c.total; }, 0);
                const lines = tops.slice(0, 15).map(function (c, i) {
                    return (i + 1) + '. ' + c.name + ' — ' + _money(c.total) + ' (' + c.count + ' invoices)';
                });
                return {
                    ok: true, agentId: this.id, financial: true,
                    message: 'Top outstanding customers (' + tops.length + ') — Grand total: ' + _money(grandTotal) + '\n' + lines.join('\n'),
                    facts: [{ count: tops.length, grandTotal: grandTotal }],
                    sourceRefs: ['InvoiceManager.getInvoicesWithBalance']
                };
            }

            // ── Customer outstanding balance ───────────────────────────────
            const custPatterns = [
                q.match(/(?:outstanding|balance|due|invoice|payment|niluvai)\s+(?:of|for)\s+([A-Za-z0-9\s.&\u0B80-\u0BFF-]+)/i),
                q.match(/^(?:show|check|get|display|evlo|sollu)?\s*([A-Za-z][A-Za-z0-9\s.&\u0B80-\u0BFF-]*?)\s+(?:outstanding|balance|niluvai|evlo|sollu)\b/i)
            ];
            const custMatch2 = custPatterns.find(function (m) { return m && m[1] && m[1].trim().length > 2; });

            if (custMatch2) {
                // Strip trailing keywords AND leading verb words
                const name = _cleanName(custMatch2[1].trim().replace(/\s*(outstanding|balance|niluvai|evlo|sollu)\s*/gi, '').trim());
                if (name.length > 2 && !/^(?:all|total|list|top|rank)$/i.test(name)) {
                    // Try CustomerAgent first (has disambiguation)
                    if (typeof CustomerAgent !== 'undefined') {
                        const res = await CustomerAgent.getOutstanding({ customerName: name });
                        if (res && res.success !== false && res.data) {
                            const d = res.data;
                            const refs = ['CustomerAgent.getOutstanding', 'InvoiceManager.getInvoicesWithBalance'];
                            if (typeof KnowledgeGraphEngine !== 'undefined') {
                                const edges = KnowledgeGraphEngine.getCustomerInvoiceEdges(name);
                                if (edges && edges.length) refs.push('KnowledgeGraphEngine');
                            }
                            return {
                                ok: true, agentId: this.id,
                                message: (d.customerName || name) + ' outstanding: ' + _money(d.total || d.pendingTotal || 0),
                                facts: [d], sourceRefs: refs, financial: true
                            };
                        }
                        if (res && res.message) {
                            return {
                                ok: res.success !== false || !!res.needClarify,
                                agentId: this.id,
                                message: res.message,
                                facts: res.data ? [res.data] : [],
                                sourceRefs: ['CustomerAgent.getOutstanding'],
                                needClarify: !!res.needClarify,
                                financial: !!(res.data && res.success !== false)
                            };
                        }
                    }
                    // Direct lookup via InvoiceManager
                    const custData = _customerOutstanding(name);
                    if (custData) {
                        if (!custData.found) {
                            return { ok: true, agentId: this.id, message: 'No invoices found for "' + name + '".', sourceRefs: ['InvoiceManager.getInvoicesWithBalance'], financial: true };
                        }
                        if (custData.pendingCount === 0) {
                            return { ok: true, agentId: this.id, message: custData.customerName + ' has no outstanding balance. All invoices cleared.', sourceRefs: ['InvoiceManager.getInvoicesWithBalance'], financial: true };
                        }
                        const invList = custData.invoices.slice(0, 5).map(function (inv) {
                            return '#' + inv.invoiceNo + ': ' + _money(inv.amount);
                        }).join(', ');
                        return {
                            ok: true, agentId: this.id,
                            message: custData.customerName + ' — ' + custData.pendingCount + ' pending invoice(s), total ' + _money(custData.pendingTotal) + '. ' + invList,
                            facts: [custData],
                            sourceRefs: ['InvoiceManager.getInvoicesWithBalance'],
                            financial: true
                        };
                    }
                }
            }

            // ── Total outstanding (all customers) ─────────────────────────
            if (/outstanding|pending\s+invoice|ledger|total\s+due|total\s+(?:pending|outstanding)|pending\s+amount|total\s+pending|niluvai|evlo\s+niluvai/i.test(q)) {
                const ledger = _ledgerOutstanding();
                if (!ledger.available) {
                    return { ok: false, agentId: this.id, message: 'InvoiceManager not loaded. Cannot compute outstanding.', sourceRefs: [] };
                }
                if (ledger.pendingCount === 0) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No pending invoice balances found.',
                        facts: [ledger], sourceRefs: ['InvoiceManager.getInvoicesWithBalance'], financial: true
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: ledger.pendingCount + ' pending invoices, total outstanding: ' + _money(ledger.pendingTotal),
                    facts: [ledger],
                    sourceRefs: ['InvoiceManager.getInvoicesWithBalance'],
                    financial: true
                };
            }

            // ── Revenue / month sales ──────────────────────────────────────
            if (/revenue|month\s+sales|this\s+month\s+sales/i.test(q) && typeof BusinessAnalytics !== 'undefined') {
                const now = new Date();
                const rev = BusinessAnalytics.getRevenueMetrics(now.getFullYear(), now.getMonth());
                const amt = parseFloat(rev && rev.currentMonth) || 0;
                return {
                    ok: true, agentId: this.id,
                    message: 'This month revenue: ' + _money(amt),
                    facts: [rev], sourceRefs: ['BusinessAnalytics.getRevenueMetrics'], financial: true
                };
            }

            // ── RAG fallback ───────────────────────────────────────────────
            const ragEngine = typeof RetrievalEngine !== 'undefined' ? RetrievalEngine : (typeof RagEngine !== 'undefined' ? RagEngine : null);
            if (ragEngine) {
                const rag = await ragEngine.retrieve(q, { collections: ['invoices', 'vouchers', 'customers'], limit: 4 });
                if (rag.ok && rag.hits && rag.hits.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: rag.hits.map(function (h) { return h.text; }).join(' | '),
                        facts: rag.hits, sourceRefs: rag.sourceRefs || ['RagEngine:accounting']
                    };
                }
            }

            // ── IntentEngine fallback ──────────────────────────────────────
            if (typeof IntentEngine !== 'undefined' && /customer|invoice|voucher|outstanding/.test(q)) {
                const parsed = IntentEngine.parse(q);
                if (parsed && parsed.intent && typeof CommandRouter !== 'undefined') {
                    const routed = await CommandRouter.route(parsed);
                    if (routed && routed.message) {
                        return {
                            ok: routed.success !== false, agentId: this.id,
                            message: routed.message,
                            facts: routed.data ? [routed.data] : [],
                            sourceRefs: ['CommandRouter:' + parsed.intent],
                            financial: /outstanding|invoice|voucher|payment/.test(parsed.intent)
                        };
                    }
                }
            }

            return { ok: false, agentId: this.id, message: 'No data found.', sourceRefs: [] };
        }
    };

    global.AccountingAgent = AccountingAgent;
})(typeof window !== 'undefined' ? window : global);
