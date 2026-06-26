/**
 * ragEngine.js — RAG orchestration + auto-reindex hooks
 */
(function (global) {
    'use strict';

    const RagEngine = {
        _initialized: false,
        _reindexTimer: null,

        init: async function () {
            if (this._initialized) return this;
            if (typeof EmbeddingProvider !== 'undefined') await EmbeddingProvider.init();
            if (typeof VectorStore !== 'undefined') await VectorStore.init();
            this._wireDataHooks();
            this._initialized = true;
            console.log('[RagEngine] ready backend=' + (VectorStore && VectorStore.backend));
            return this;
        },

        _wireDataHooks: function () {
            const self = this;
            if (typeof window === 'undefined') return;
            window.addEventListener('gtes:data-changed', function (ev) {
                const key = ev.detail && ev.detail.key;
                if (!key || typeof DocumentIndexer === 'undefined') return;
                if (!DocumentIndexer.collectionForKey(key)) return;
                if (self._reindexTimer) clearTimeout(self._reindexTimer);
                self._reindexTimer = setTimeout(function () {
                    DocumentIndexer.reindexForStorageKey(key).catch(function (e) {
                        console.warn('[RagEngine] reindex failed', key, e && e.message);
                    });
                }, 800);
            });
        },

        indexAll: function () {
            if (typeof DocumentIndexer === 'undefined') {
                return Promise.resolve({ ok: false, error: 'DocumentIndexer missing' });
            }
            return DocumentIndexer.indexAll();
        },

        retrieve: function (query, opts) {
            if (typeof Retriever === 'undefined') {
                return Promise.resolve({ ok: false, hits: [] });
            }
            return Retriever.retrieve(query, opts);
        },

        status: function () {
            return {
                ok: true,
                initialized: this._initialized,
                backend: typeof VectorStore !== 'undefined' ? VectorStore.backend : 'none',
                embedding: typeof EmbeddingProvider !== 'undefined' ? EmbeddingProvider.getProviderName() : 'none'
            };
        }
    };

    global.RagEngine = RagEngine;
})(typeof window !== 'undefined' ? window : global);
