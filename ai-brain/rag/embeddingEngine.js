/**
 * embeddingEngine.js — Named API facade over EmbeddingProvider
 * Part of Jarvis Multi-Agent ERP OS — RAG Layer
 * Delegates 100% to EmbeddingProvider; adds agent-friendly API.
 */
(function (global) {
    'use strict';

    const EmbeddingEngine = {
        version: '2.0.0',

        /**
         * Initialize the embedding engine (delegates to EmbeddingProvider).
         * @returns {Promise<EmbeddingEngine>}
         */
        init: function () {
            if (typeof EmbeddingProvider !== 'undefined' && EmbeddingProvider.init) {
                return EmbeddingProvider.init().then(function () { return EmbeddingEngine; });
            }
            return Promise.resolve(EmbeddingEngine);
        },

        /**
         * Embed a single text string into a vector.
         * @param {string} text
         * @returns {Promise<number[]>}
         */
        embed: function (text) {
            if (typeof EmbeddingProvider === 'undefined') {
                return Promise.reject(new Error('EmbeddingProvider not loaded'));
            }
            return EmbeddingProvider.embed(text);
        },

        /**
         * Embed multiple texts in batch.
         * @param {string[]} texts
         * @returns {Promise<number[][]>}
         */
        embedBatch: function (texts) {
            if (typeof EmbeddingProvider === 'undefined') {
                return Promise.reject(new Error('EmbeddingProvider not loaded'));
            }
            return EmbeddingProvider.embedBatch(texts);
        },

        /**
         * Get the current embedding provider name (e.g. 'hash', 'openai').
         * @returns {string}
         */
        getProvider: function () {
            if (typeof EmbeddingProvider !== 'undefined' && EmbeddingProvider.getProviderName) {
                return EmbeddingProvider.getProviderName();
            }
            return 'unknown';
        },

        /**
         * Dimension of vectors produced.
         * @returns {number}
         */
        getDimension: function () {
            if (typeof EmbeddingProvider !== 'undefined' && EmbeddingProvider.DIM) {
                return EmbeddingProvider.DIM;
            }
            return 384;
        }
    };

    global.EmbeddingEngine = EmbeddingEngine;
})(typeof window !== 'undefined' ? window : global);
