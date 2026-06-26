/**
 * retriever.js — Semantic retrieval over RAG collections
 */
(function (global) {
    'use strict';

    const Retriever = {
        retrieve: async function (query, opts) {
            opts = opts || {};
            const collections = opts.collections || VectorStore.COLLECTIONS;
            const limit = opts.limit || 5;

            if (typeof EmbeddingProvider === 'undefined' || typeof VectorStore === 'undefined') {
                return { ok: false, hits: [], message: 'RAG not loaded' };
            }

            const vector = await EmbeddingProvider.embed(query);
            const hits = [];

            for (let i = 0; i < collections.length; i++) {
                const col = collections[i];
                const rows = await VectorStore.search(col, vector, { limit: limit });
                rows.forEach(function (r) {
                    hits.push({
                        collection: col,
                        id: r.id,
                        text: r.text,
                        meta: r.meta || {},
                        score: r._score || 0
                    });
                });
            }

            hits.sort(function (a, b) { return b.score - a.score; });
            return {
                ok: true,
                hits: hits.slice(0, limit * 2),
                sourceRefs: hits.slice(0, limit).map(function (h) {
                    return h.collection + ':' + h.id;
                })
            };
        }
    };

    global.Retriever = Retriever;
})(typeof window !== 'undefined' ? window : global);
