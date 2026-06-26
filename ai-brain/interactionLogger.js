/**
 * interactionLogger.js — Jarvis AI OS Interaction Memory (v1)
 *
 * Logs every user turn, clarification request, correction, and failed query.
 * Builds frequency maps so Jarvis knows the most-accessed entities.
 *
 * Storage: localStorage (fast) + Firebase via DataManager.saveData (persistent).
 * Key    : 'gtes_jarvis_interaction_log_v1'
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'gtes_jarvis_interaction_log_v1';
    const MAX_LOG_ENTRIES = 500;   // Rolling window — oldest dropped when exceeded
    const SAVE_DEBOUNCE_MS = 2000; // Debounce Firebase sync

    // ── Data structure ────────────────────────────────────────────────────────
    /*
      _store = {
        turns:         TurnEntry[]    — every processTurn call
        corrections:   Correction[]   — "X means Y" learnings
        clarifications: Clarification[] — ambiguity-triggered events
        noDataQueries: NoDataEntry[]  — queries that returned no result
        frequency: {
          customers:  { [name]: count }
          employees:  { [name]: count }
          intents:    { [intent]: count }
        }
        version: 1
      }
    */

    function _clone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
    }

    function _defaultStore() {
        return {
            turns: [],
            corrections: [],
            clarifications: [],
            noDataQueries: [],
            frequency: { customers: {}, employees: {}, intents: {} },
            version: 1
        };
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const def = _defaultStore();
                // Merge — keep frequency maps and arrays
                return {
                    turns: parsed.turns || def.turns,
                    corrections: parsed.corrections || def.corrections,
                    clarifications: parsed.clarifications || def.clarifications,
                    noDataQueries: parsed.noDataQueries || def.noDataQueries,
                    frequency: parsed.frequency || def.frequency,
                    version: 1
                };
            }
        } catch (e) { /* corrupt — start fresh */ }
        return _defaultStore();
    }

    let _store = _load();
    let _saveTimer = null;

    function _persist() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_store)); } catch (e) { /* quota */ }
        // Debounced Firebase sync
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(function () {
            if (typeof DataManager !== 'undefined' && DataManager.saveData) {
                DataManager.saveData('gtes_jarvis_interaction_log', _store).catch(function () {});
            }
        }, SAVE_DEBOUNCE_MS);
    }

    function _trimLog(arr) {
        if (arr.length > MAX_LOG_ENTRIES) arr.splice(0, arr.length - MAX_LOG_ENTRIES);
    }

    function _now() { return new Date().toISOString(); }

    function _incrementFreq(bucket, name) {
        if (!name) return;
        const key = String(name).trim().toLowerCase();
        _store.frequency[bucket] = _store.frequency[bucket] || {};
        _store.frequency[bucket][key] = (_store.frequency[bucket][key] || 0) + 1;
    }

    // ─────────────────────────────────────────────────────────────────────────

    const InteractionLogger = {

        // ── Core Turn Logging ─────────────────────────────────────────────────

        /**
         * Log a completed Jarvis turn.
         * Called from brain.js / orchestratorAgent after every processTurn.
         *
         * @param {string} utterance     — raw user input
         * @param {Object} decision      — { intent, agentId, action }
         * @param {Object} result        — { ok, message, sourceRefs }
         */
        log: function (utterance, decision, result) {
            if (!utterance) return;
            const entry = {
                at: _now(),
                utterance: utterance,
                intent: (decision && decision.intent) || null,
                agentId: (decision && decision.agentId) || null,
                ok: !!(result && result.ok),
                clarifyNeeded: !!(result && result.needClarify),
                sourceRefs: (result && result.sourceRefs) || []
            };
            _store.turns.push(entry);
            _trimLog(_store.turns);

            // Track intent frequency
            if (entry.intent) _incrementFreq('intents', entry.intent);

            // Track entity frequency from sourceRefs
            const sr = entry.sourceRefs.join(' ');
            if (/customer|invoice|outstanding/i.test(sr)) {
                // Try to extract a customer name from the utterance/result message
                const custMatch = String(result && result.message || utterance).match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
                if (custMatch) _incrementFreq('customers', custMatch[1]);
            }
            if (/employee|attendance|salary/i.test(sr)) {
                const empMatch = String(utterance).match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
                if (empMatch) _incrementFreq('employees', empMatch[1]);
            }

            _persist();
        },

        /**
         * Log when Jarvis asked a clarification question.
         */
        logClarification: function (originalQuery, options, domain) {
            const entry = {
                at: _now(),
                originalQuery: originalQuery,
                domain: domain || 'unknown',
                optionCount: (options || []).length,
                optionNames: (options || []).slice(0, 5).map(function (o) {
                    return o.name || o.invoiceNo || o.voucherId || '?';
                })
            };
            _store.clarifications.push(entry);
            _trimLog(_store.clarifications);
            _persist();
        },

        /**
         * Log when the user provided a correction (e.g., "Avon means Avon Oxygen").
         */
        logCorrection: function (spoken, resolved, domain) {
            const entry = {
                at: _now(),
                spoken: spoken,
                resolved: resolved,
                domain: domain || 'customer'
            };
            _store.corrections.push(entry);
            _trimLog(_store.corrections);
            // Boost frequency for the resolved entity
            _incrementFreq(domain === 'employee' ? 'employees' : 'customers', resolved);
            _persist();
        },

        /**
         * Log a query that returned no data.
         */
        logNoData: function (query, domain) {
            const entry = {
                at: _now(),
                query: query,
                domain: domain || 'unknown'
            };
            _store.noDataQueries.push(entry);
            _trimLog(_store.noDataQueries);
            _persist();
        },

        // ── Frequency / Preference API ────────────────────────────────────────

        /**
         * Get top N most-frequently accessed customers.
         * Used by OrchestratorAgent to rank candidates.
         * @param {number} n
         * @returns {Array<{name:string, count:number}>}
         */
        getFrequentCustomers: function (n) {
            return _topN(_store.frequency.customers || {}, n || 5);
        },

        /**
         * Get top N most-frequently accessed employees.
         * @param {number} n
         * @returns {Array<{name:string, count:number}>}
         */
        getFrequentEmployees: function (n) {
            return _topN(_store.frequency.employees || {}, n || 5);
        },

        /**
         * Get top N most-used intents.
         * @param {number} n
         */
        getFrequentIntents: function (n) {
            return _topN(_store.frequency.intents || {}, n || 10);
        },

        /**
         * Get a frequency boost score for an entity name (0.0 – 0.3).
         * Allows OrchestratorAgent to prioritize known-frequent entities.
         */
        getFrequencyBoost: function (name, type) {
            if (!name) return 0;
            const bucket = type === 'employee' ? 'employees' : 'customers';
            const freq = _store.frequency[bucket] || {};
            const count = freq[String(name).trim().toLowerCase()] || 0;
            // Boost: 0.05 per access, max 0.3
            return Math.min(0.3, count * 0.05);
        },

        // ── Summary / Export ──────────────────────────────────────────────────

        getSummary: function () {
            return {
                totalTurns: _store.turns.length,
                totalClarifications: _store.clarifications.length,
                totalCorrections: _store.corrections.length,
                totalNoData: _store.noDataQueries.length,
                topCustomers: this.getFrequentCustomers(5),
                topEmployees: this.getFrequentEmployees(5),
                topIntents: this.getFrequentIntents(5),
                since: _store.turns.length ? _store.turns[0].at : null
            };
        },

        exportLog: function () {
            return _clone(_store);
        },

        clearLog: function () {
            _store = _defaultStore();
            _persist();
        },

        reload: function () {
            _store = _load();
        }
    };

    // ── Internal helper ───────────────────────────────────────────────────────

    function _topN(map, n) {
        return Object.keys(map)
            .map(function (k) { return { name: k, count: map[k] }; })
            .sort(function (a, b) { return b.count - a.count; })
            .slice(0, n);
    }

    global.InteractionLogger = InteractionLogger;
})(typeof window !== 'undefined' ? window : global);
