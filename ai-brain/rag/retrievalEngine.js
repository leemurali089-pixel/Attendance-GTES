/**
 * retrievalEngine.js — Named API facade over Retriever
 * Part of Jarvis Multi-Agent ERP OS — RAG Layer
 * Adds agent-scoped retrieval so each sub-agent only searches its collections.
 */
(function (global) {
    'use strict';

    // Collections each agent should search by default
    const AGENT_COLLECTIONS = {
        hrAgent:          ['employees', 'attendance'],
        payrollAgent:     ['payroll'],
        accountingAgent:  ['invoices', 'vouchers', 'customers'],
        workflowAgent:    ['tasks', 'documents'],
        adminAgent:       ['employees', 'documents']
    };

    const RetrievalEngine = {
        version: '2.0.0',

        /**
         * Full retrieval across specified collections (delegates to Retriever).
         * @param {string} query
         * @param {{collections?:string[], limit?:number}} opts
         * @returns {Promise<{ok:boolean, hits:Array, sourceRefs:string[]}>}
         */
        retrieve: function (query, opts) {
            if (typeof Retriever === 'undefined') {
                return Promise.resolve({ ok: false, hits: [], message: 'Retriever not loaded', sourceRefs: [] });
            }
            return Retriever.retrieve(query, opts);
        },

        /**
         * Agent-scoped retrieval — only searches this agent's collections.
         * @param {string} agentId
         * @param {string} query
         * @param {number} [limit=4]
         * @returns {Promise<{ok:boolean, hits:Array, sourceRefs:string[]}>}
         */
        retrieveForAgent: function (agentId, query, limit) {
            const collections = AGENT_COLLECTIONS[agentId] || [];
            if (!collections.length) {
                return Promise.resolve({ ok: false, hits: [], message: 'No collections for agent ' + agentId, sourceRefs: [] });
            }
            return this.retrieve(query, { collections: collections, limit: limit || 4 });
        },

        /**
         * Retrieve with a minimum similarity score threshold.
         * Hits below minScore are excluded.
         * @param {string} query
         * @param {{collections?:string[], limit?:number, minScore?:number}} opts
         * @returns {Promise<{ok:boolean, hits:Array, sourceRefs:string[]}>}
         */
        retrieveFiltered: async function (query, opts) {
            opts = opts || {};
            const minScore = opts.minScore || 0;
            const result = await this.retrieve(query, opts);
            if (!result.ok) return result;
            const filtered = result.hits.filter(function (h) { return (h.score || 0) >= minScore; });
            return {
                ok: filtered.length > 0,
                hits: filtered,
                sourceRefs: filtered.map(function (h) { return h.collection + ':' + h.id; })
            };
        },

        /**
         * Get the collection-to-agent mapping.
         * @returns {Object}
         */
        getAgentCollections: function () {
            return AGENT_COLLECTIONS;
        }
    };

    global.RetrievalEngine = RetrievalEngine;
})(typeof window !== 'undefined' ? window : global);
