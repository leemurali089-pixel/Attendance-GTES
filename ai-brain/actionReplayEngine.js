/**
 * actionReplayEngine.js — AI-specific audit trail
 * Records Who / What / When / Why / sourceRefs for every brain action.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'gtes_ai_action_replay_v1';
    const DISK_KEY = 'gtes_ai_audit';
    const MAX_ENTRIES = 500;

    function _uid() {
        return 'ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    function _who() {
        const u = typeof UserManager !== 'undefined' && UserManager.getCurrentUser
            ? UserManager.getCurrentUser() : null;
        return {
            userId: u && (u.id || u.userId || u.username) || 'anonymous',
            username: u && (u.username || u.name) || 'Guest',
            role: u && u.role || 'unknown'
        };
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return [];
    }

    function _save(entries) {
        const trimmed = entries.slice(-MAX_ENTRIES);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch (e) { /* ignore */ }
        if (typeof DataManager !== 'undefined' && DataManager.saveData) {
            DataManager.saveData(DISK_KEY, trimmed).catch(function () {});
        }
    }

    let _entries = _load();
    let _turnIndex = 0;

    function _sanitizeArgs(args) {
        if (!args || typeof args !== 'object') return args;
        const out = {};
        Object.keys(args).forEach(function (k) {
            const v = args[k];
            if (k.toLowerCase().indexOf('password') >= 0) out[k] = '[redacted]';
            else if (typeof v === 'string' && v.length > 200) out[k] = v.slice(0, 200) + '…';
            else out[k] = v;
        });
        return out;
    }

    const ActionReplayEngine = {
        record: function (opts) {
            opts = opts || {};
            _turnIndex += 1;
            const entry = {
                id: _uid(),
                turnIndex: _turnIndex,
                when: new Date().toISOString(),
                who: _who(),
                what: {
                    intent: opts.intent || null,
                    functionName: opts.functionName || null,
                    mode: opts.mode || 'read',
                    args: _sanitizeArgs(opts.args),
                    success: opts.success !== false,
                    resultSummary: opts.resultSummary || null
                },
                why: {
                    reason: opts.reason || opts.utterance || '',
                    decisionPath: opts.decisionPath || [],
                    agentId: opts.agentId || null
                },
                sourceRefs: opts.sourceRefs || []
            };
            _entries.push(entry);
            _save(_entries);
            return entry;
        },

        list: function (filter) {
            filter = filter || {};
            let list = _entries.slice().reverse();
            if (filter.userId) {
                list = list.filter(function (e) {
                    return e.who && e.who.userId === filter.userId;
                });
            }
            if (filter.functionName) {
                list = list.filter(function (e) {
                    return e.what && e.what.functionName === filter.functionName;
                });
            }
            if (filter.since) {
                const since = new Date(filter.since).getTime();
                list = list.filter(function (e) {
                    return new Date(e.when).getTime() >= since;
                });
            }
            if (filter.limit) list = list.slice(0, filter.limit);
            return list;
        },

        get: function (id) {
            return _entries.find(function (e) { return e.id === id; }) || null;
        },

        /** Replay: read-only re-fetch facts; writes show summary only */
        replay: function (id) {
            const entry = this.get(id);
            if (!entry) return { ok: false, error: 'Entry not found' };

            const mode = entry.what && entry.what.mode;
            const fn = entry.what && entry.what.functionName;

            if (mode === 'execute' || mode === 'preview') {
                return {
                    ok: true,
                    replayType: 'summary',
                    entry: entry,
                    message: 'Execute/preview actions are not re-run silently. Review recorded summary and sourceRefs.',
                    sourceRefs: entry.sourceRefs
                };
            }

            if (fn && typeof FunctionEngine !== 'undefined' && FunctionEngine.invoke) {
                return FunctionEngine.invoke(fn, entry.what.args || {}, { replay: true, readOnly: true })
                    .then(function (result) {
                        return { ok: true, replayType: 'read', entry: entry, result: result };
                    })
                    .catch(function (err) {
                        return { ok: false, replayType: 'read', entry: entry, error: String(err) };
                    });
            }

            return { ok: true, replayType: 'metadata', entry: entry };
        },

        clear: function () {
            _entries = [];
            _turnIndex = 0;
            _save(_entries);
        },

        exportJson: function () {
            return JSON.stringify(_entries, null, 2);
        }
    };

    global.ActionReplayEngine = ActionReplayEngine;
})(typeof window !== 'undefined' ? window : global);
