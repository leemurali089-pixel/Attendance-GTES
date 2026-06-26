/**
 * contextEngine.js — Session + ERP context + Ambiguity State (Jarvis AI OS v3)
 *
 * New in v3:
 *   setPendingClarify(options, domain, originalQuery)  — store multi-match disambiguation
 *   resolveClarify(utterance)                          — match user reply to a pending option
 *   clearPendingClarify()                              — after resolution
 */
(function (global) {
    'use strict';

    // ── Pending clarification state (in-memory, reset each session) ──────────
    let _pendingClarify = null;
    /*
     _pendingClarify = {
       options:       Entity[]      — the candidates shown to user
       domain:        string        — 'customer' | 'employee' | etc.
       originalQuery: string        — the query that triggered ambiguity
       askedAt:       ISO string
     }
    */

    function _norm(s) { return String(s || '').trim().toLowerCase(); }

    const ContextEngine = {

        // ── Legacy session API ────────────────────────────────────────────────

        getSession: function () {
            if (typeof ContextManager !== 'undefined' && ContextManager.get) {
                return ContextManager.get();
            }
            return {
                lastCustomerName: null,
                lastCustomerId: null,
                lastEmployeeName: null,
                lastIntent: null
            };
        },

        setSession: function (patch) {
            if (typeof ContextManager !== 'undefined' && ContextManager.set) {
                ContextManager.set(patch);
            }
        },

        getErpSnapshot: function () {
            const snap = {
                company: null,
                user: null,
                date: new Date().toISOString().slice(0, 10)
            };
            if (typeof UserManager !== 'undefined' && UserManager.getCurrentUser) {
                snap.user = UserManager.getCurrentUser();
            }
            if (typeof DataManager !== 'undefined' && DataManager.getData) {
                try {
                    const settings = DataManager.getData('gtes_settings');
                    if (settings && settings.companyName) snap.company = settings.companyName;
                } catch (e) { /* ignore */ }
            }
            return snap;
        },

        buildTurnContext: function (utterance) {
            const session = this.getSession();
            const erp = this.getErpSnapshot();
            const enriched = typeof TrainingCenter !== 'undefined'
                ? TrainingCenter.enrichUtterance(utterance)
                : { text: utterance };

            return {
                utterance: utterance,
                enriched: enriched,
                session: session,
                erp: erp,
                hasPendingClarify: !!_pendingClarify,
                timestamp: new Date().toISOString()
            };
        },

        buildCommandSlots: function (reasoning, ctx) {
            reasoning = reasoning || {};
            const slots = Object.assign({}, reasoning.slots || {});
            const ent = reasoning.entities || {};

            if (!slots.customerName) slots.customerName = ent.customer || ent.customerName || null;
            if (!slots.partyName) slots.partyName = ent.partyName || ent.customer || slots.customerName || null;
            if (!slots.employeeName) {
                slots.employeeName = ent.employee || ent.employeeName || null;
            }
            if (!slots.taskHint && !slots.taskHintAlt) {
                slots.taskHint = ent.taskHint || ent.taskHintAlt || null;
            }
            if (!slots.narration) slots.narration = ent.narration || null;
            if (!slots.monthName) slots.monthName = ent.month || ent.monthName || null;

            if (typeof ContextManager !== 'undefined') {
                const cust = ContextManager.resolveCustomerName(slots);
                if (cust) slots.customerName = cust;
                const emp = ContextManager.resolveEmployeeName(slots);
                if (emp) slots.employeeName = emp;
            }

            return slots;
        },

        // ── NEW v3: Ambiguity / Clarification State ───────────────────────────

        /**
         * Store a pending clarification state.
         * Called by OrchestratorAgent when multiple candidates are found.
         *
         * @param {Entity[]} options   — list of candidate entities (max 5)
         * @param {string}   domain    — 'customer'|'employee'|'invoice'
         * @param {string}   originalQuery — the original user utterance
         */
        setPendingClarify: function (options, domain, originalQuery) {
            _pendingClarify = {
                options: (options || []).slice(0, 5),
                domain: domain || 'unknown',
                originalQuery: originalQuery || '',
                askedAt: new Date().toISOString()
            };
            // Also mirror into ContextManager so legacy path sees it
            if (typeof ContextManager !== 'undefined' && ContextManager.set) {
                ContextManager.set({ pendingClarify: _pendingClarify });
            }
        },

        /**
         * Get the current pending clarification state.
         * @returns {Object|null}
         */
        getPendingClarify: function () {
            return _pendingClarify;
        },

        /**
         * Clear the pending clarification (after resolution or timeout).
         */
        clearPendingClarify: function () {
            _pendingClarify = null;
            if (typeof ContextManager !== 'undefined' && ContextManager.set) {
                ContextManager.set({ pendingClarify: null });
            }
        },

        /**
         * Try to resolve the user's utterance to one of the pending options.
         * Matches by number ("1", "first", "one"), partial name, or full name.
         *
         * @param {string} utterance — the user's clarification reply
         * @returns {{ resolved: Entity|null, index: number }} 
         *   index = 1-based choice number, or -1 if not resolved
         */
        resolveClarify: function (utterance) {
            if (!_pendingClarify || !_pendingClarify.options.length) {
                return { resolved: null, index: -1 };
            }

            const u = _norm(utterance);
            const options = _pendingClarify.options;

            // ── Match by number word or digit ────────────────────────────────
            const numberWords = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5 };
            const digitMatch = u.match(/\b([1-5])\b/);
            if (digitMatch) {
                const idx = parseInt(digitMatch[1], 10) - 1;
                if (options[idx]) return { resolved: options[idx], index: idx + 1 };
            }
            for (const word in numberWords) {
                if (u.includes(word)) {
                    const idx = numberWords[word] - 1;
                    if (options[idx]) return { resolved: options[idx], index: idx + 1 };
                }
            }

            // ── Match by name substring ──────────────────────────────────────
            let bestScore = 0;
            let bestMatch = null;
            let bestIdx = -1;

            options.forEach(function (opt, i) {
                const name = _norm(opt.name || opt.invoiceNo || opt.voucherId || '');
                let score = 0;
                if (name === u) score = 1.0;
                else if (name.startsWith(u)) score = 0.9;
                else if (name.includes(u)) score = 0.8;
                else {
                    // Word overlap
                    const words = u.split(/\s+/).filter(function (w) { return w.length > 2; });
                    const matches = words.filter(function (w) { return name.includes(w); });
                    score = words.length ? (matches.length / words.length) * 0.7 : 0;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = opt;
                    bestIdx = i + 1;
                }
            });

            if (bestScore >= 0.5) return { resolved: bestMatch, index: bestIdx };
            return { resolved: null, index: -1 };
        },

        /**
         * Check if the utterance is likely a clarification reply
         * (a number or a short name matching one of the options).
         */
        isClarificationReply: function (utterance) {
            if (!_pendingClarify) return false;
            const u = _norm(utterance);
            if (/^\s*[1-5]\s*$/.test(u)) return true;
            if (/\b(first|second|third|one|two|three|four|five)\b/.test(u)) return true;
            // Short utterance that mostly matches a name
            if (u.length <= 30) {
                const result = this.resolveClarify(utterance);
                return result.resolved !== null;
            }
            return false;
        }
    };

    global.ContextEngine = ContextEngine;
})(typeof window !== 'undefined' ? window : global);
