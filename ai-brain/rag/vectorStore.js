/**
 * vectorStore.js — LanceDB via Electron IPC when available; JSON fallback at Data/ai-rag/
 */
(function (global) {
    'use strict';

    const COLLECTIONS = ['employees', 'attendance', 'payroll', 'customers', 'invoices', 'vouchers', 'tasks', 'documents'];
    const _mem = {};
    const _loaded = {};

    function _storageKey(collection) {
        return 'ai-rag_' + collection;
    }

    function _hasLanceIpc() {
        return !!(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.rag);
    }

    const VectorStore = {
        COLLECTIONS: COLLECTIONS,
        backend: 'json',

        init: async function () {
            if (_hasLanceIpc()) {
                try {
                    const st = await window.electronAPI.rag.status();
                    if (st && st.ok && st.backend === 'lancedb') {
                        this.backend = 'lancedb';
                        return this;
                    }
                } catch (_) { /* fallback */ }
            }
            this.backend = 'json';
            for (let i = 0; i < COLLECTIONS.length; i++) {
                await this._loadJson(COLLECTIONS[i]);
            }
            return this;
        },

        _loadJson: async function (collection) {
            if (_loaded[collection]) return _mem[collection] || [];
            _loaded[collection] = true;
            let rows = [];
            try {
                if (typeof FileStorage !== 'undefined' && FileStorage.loadData) {
                    const raw = await FileStorage.loadData(_storageKey(collection));
                    if (Array.isArray(raw)) rows = raw;
                } else if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem(_storageKey(collection));
                    if (raw) rows = JSON.parse(raw);
                }
            } catch (_) { /* empty */ }
            _mem[collection] = rows;
            return rows;
        },

        _saveJson: async function (collection, rows) {
            _mem[collection] = rows;
            try {
                if (typeof FileStorage !== 'undefined' && FileStorage.saveData) {
                    await FileStorage.saveData(_storageKey(collection), rows);
                } else if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(_storageKey(collection), JSON.stringify(rows));
                }
            } catch (e) {
                console.warn('[VectorStore] save failed', collection, e && e.message);
            }
        },

        upsert: async function (collection, records) {
            if (!records || !records.length) return { ok: true, count: 0 };
            if (_hasLanceIpc() && this.backend === 'lancedb') {
                try {
                    return await window.electronAPI.rag.upsert({ collection: collection, records: records });
                } catch (_) { /* fallback below */ }
            }
            await this._loadJson(collection);
            const existing = _mem[collection] || [];
            const byId = {};
            existing.forEach(function (r) { if (r.id) byId[r.id] = r; });
            records.forEach(function (r) { if (r.id) byId[r.id] = r; });
            const merged = Object.keys(byId).map(function (k) { return byId[k]; });
            await this._saveJson(collection, merged);
            return { ok: true, count: records.length, backend: 'json' };
        },

        search: async function (collection, queryVector, opts) {
            opts = opts || {};
            const limit = opts.limit || 5;
            if (_hasLanceIpc() && this.backend === 'lancedb') {
                try {
                    const res = await window.electronAPI.rag.search({
                        collection: collection,
                        vector: queryVector,
                        limit: limit
                    });
                    if (res && res.ok) return res.rows || [];
                } catch (_) { /* fallback */ }
            }
            await this._loadJson(collection);
            const rows = _mem[collection] || [];
            if (!queryVector || !queryVector.length) return rows.slice(0, limit);

            function dot(a, b) {
                let s = 0;
                const n = Math.min(a.length, b.length);
                for (let i = 0; i < n; i++) s += a[i] * b[i];
                return s;
            }

            return rows
                .map(function (r) {
                    return { row: r, score: r.vector ? dot(queryVector, r.vector) : 0 };
                })
                .sort(function (a, b) { return b.score - a.score; })
                .slice(0, limit)
                .map(function (x) {
                    return Object.assign({}, x.row, { _score: x.score });
                });
        },

        clear: async function (collection) {
            if (_hasLanceIpc() && this.backend === 'lancedb') {
                try {
                    await window.electronAPI.rag.clear({ collection: collection });
                } catch (_) { /* ignore */ }
            }
            await this._saveJson(collection, []);
            return { ok: true };
        }
    };

    global.VectorStore = VectorStore;
})(typeof window !== 'undefined' ? window : global);
