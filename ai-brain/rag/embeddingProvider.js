/**
 * embeddingProvider.js — Pluggable embeddings (hash fallback + future API providers)
 */
(function (global) {
    'use strict';

    const DIM = 384;

    function _tokenize(text) {
        return String(text || '').toLowerCase().replace(/[^\w\s\u0B80-\u0BFF]/g, ' ').split(/\s+/).filter(Boolean);
    }

    function _hashEmbed(text) {
        const vec = new Float32Array(DIM);
        const tokens = _tokenize(text);
        if (!tokens.length) return Array.from(vec);

        tokens.forEach(function (tok) {
            for (let i = 0; i < tok.length; i++) {
                const gram = tok.slice(i, Math.min(i + 3, tok.length));
                let h = 0;
                for (let c = 0; c < gram.length; c++) {
                    h = ((h << 5) - h + gram.charCodeAt(c)) | 0;
                }
                const idx = Math.abs(h) % DIM;
                vec[idx] += 1;
            }
        });

        let norm = 0;
        for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < DIM; i++) vec[i] /= norm;
        return Array.from(vec);
    }

    const EmbeddingProvider = {
        DIM: DIM,
        provider: 'hash',

        init: function () {
            if (typeof DataManager !== 'undefined') {
                const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
                const ai = settings.ai || settings.aiBrain || {};
                if (ai.embeddingProvider) this.provider = ai.embeddingProvider;
                if (ai.openaiApiKey) this._openaiKey = ai.openaiApiKey;
            }
            return Promise.resolve(this);
        },

        getProviderName: function () {
            return this.provider;
        },

        embed: function (text) {
            const self = this;
            if (this.provider === 'openai' && this._openaiKey) {
                return this._embedOpenAI(text).catch(function () {
                    return _hashEmbed(text);
                });
            }
            return Promise.resolve(_hashEmbed(text));
        },

        embedBatch: function (texts) {
            const self = this;
            return Promise.all((texts || []).map(function (t) { return self.embed(t); }));
        },

        _embedOpenAI: async function (text) {
            const key = this._openaiKey;
            if (!key || typeof fetch === 'undefined') return _hashEmbed(text);
            const res = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + key
                },
                body: JSON.stringify({ model: 'text-embedding-3-small', input: String(text || '').slice(0, 8000) })
            });
            if (!res.ok) throw new Error('OpenAI embed failed');
            const json = await res.json();
            return json.data && json.data[0] ? json.data[0].embedding : _hashEmbed(text);
        }
    };

    global.EmbeddingProvider = EmbeddingProvider;
})(typeof window !== 'undefined' ? window : global);
