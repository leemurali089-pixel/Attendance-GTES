/**
 * indexingEngine.js — Named API facade over DocumentIndexer
 * Part of Jarvis Multi-Agent ERP OS — RAG Layer
 * Adds agent-scoped reindexing and status reporting.
 */
(function (global) {
    'use strict';

    // Map agent IDs to their relevant RAG collections
    const AGENT_COLLECTIONS = {
        hrAgent:          ['employees', 'attendance'],
        payrollAgent:     ['payroll'],
        accountingAgent:  ['invoices', 'vouchers', 'customers'],
        workflowAgent:    ['tasks', 'documents'],
        adminAgent:       ['employees', 'documents']
    };

    const IndexingEngine = {
        version: '2.0.0',

        /**
         * Index a single named collection.
         * @param {string} collection — e.g. 'employees', 'invoices'
         * @returns {Promise<{ok:boolean, collection:string, count:number}>}
         */
        indexCollection: function (collection) {
            if (typeof DocumentIndexer === 'undefined') {
                return Promise.resolve({ ok: false, error: 'DocumentIndexer not loaded' });
            }
            return DocumentIndexer.indexCollection(collection);
        },

        /**
         * Index all known collections.
         * @returns {Promise<{ok:boolean, results:Array}>}
         */
        indexAll: function () {
            if (typeof DocumentIndexer === 'undefined') {
                return Promise.resolve({ ok: false, error: 'DocumentIndexer not loaded' });
            }
            return DocumentIndexer.indexAll();
        },

        /**
         * Reindex only the collection that maps to a given DataManager storage key.
         * @param {string} storageKey — e.g. 'gtes_employees', 'customers'
         * @returns {Promise<{ok:boolean}>}
         */
        reindexForKey: function (storageKey) {
            if (typeof DocumentIndexer === 'undefined') {
                return Promise.resolve({ ok: false, error: 'DocumentIndexer not loaded' });
            }
            return DocumentIndexer.reindexForStorageKey(storageKey);
        },

        /**
         * Index only the collections relevant to a given agent.
         * @param {string} agentId
         * @returns {Promise<Array>}
         */
        indexForAgent: async function (agentId) {
            const cols = AGENT_COLLECTIONS[agentId] || [];
            const results = [];
            for (let i = 0; i < cols.length; i++) {
                try {
                    results.push(await this.indexCollection(cols[i]));
                } catch (e) {
                    results.push({ ok: false, collection: cols[i], error: e && e.message });
                }
            }
            return results;
        },

        /**
         * Get a summary of all indexed collections.
         * @returns {{collections:string[], backend:string}}
         */
        status: function () {
            const cols = (typeof VectorStore !== 'undefined' && VectorStore.COLLECTIONS) || [];
            const backend = (typeof VectorStore !== 'undefined' && VectorStore.backend) || 'unknown';
            return { collections: cols, backend: backend, agentMap: AGENT_COLLECTIONS };
        }
    };

    global.IndexingEngine = IndexingEngine;
})(typeof window !== 'undefined' ? window : global);
