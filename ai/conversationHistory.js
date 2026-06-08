/**
 * Voice conversation history panel + persistence.
 */
const ConversationHistory = {
    _entries: [],
    _max: 50,

    init() {
        try {
            const raw = localStorage.getItem(MemoryManager.KEYS.history);
            this._entries = raw ? JSON.parse(raw) : [];
        } catch (_) {
            this._entries = [];
        }
    },

    add(role, text, meta = {}) {
        const entry = {
            id: Date.now(),
            role,
            text: String(text || '').trim(),
            time: new Date().toISOString(),
            intent: meta.intent || null,
            success: meta.success,
            needClarify: meta.needClarify
        };
        this._entries.push(entry);
        if (this._entries.length > this._max) this._entries.shift();
        try {
            localStorage.setItem(MemoryManager.KEYS.history, JSON.stringify(this._entries.slice(-this._max)));
        } catch (_) { /* quota */ }
        this._renderPanel();
        return entry;
    },

    getRecent(n = 8) {
        return this._entries.slice(-n);
    },

    clear() {
        this._entries = [];
        localStorage.removeItem(MemoryManager.KEYS.history);
        this._renderPanel();
    },

    _renderPanel() {
        const el = document.getElementById('voiceAgentHistoryList');
        if (!el) return;
        const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
        const emptyMsg = lang === 'ta' ? 'இன்னும் உரையாடல் இல்லை.' : 'No conversation yet.';
        if (!this._entries.length) {
            el.innerHTML = `<div class="voice-hist-empty text-muted small">${emptyMsg}</div>`;
            return;
        }
        el.innerHTML = this._entries.slice(-30).map((e) => {
            const isUser = e.role === 'user';
            const cls = isUser ? 'voice-hist-user' : 'voice-hist-ai';
            const roleLabel = isUser
                ? (lang === 'ta' ? 'நீங்கள்' : 'You')
                : (lang === 'ta' ? 'AI' : 'Assistant');
            const icon = isUser ? 'person' : 'robot';
            const time = new Date(e.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const clarifyBadge = e.needClarify ? '<span class="voice-hist-clarify">?</span>' : '';
            const statusCls = e.success === false ? ' voice-hist-fail' : (e.success === true ? ' voice-hist-ok' : '');
            return `<div class="voice-hist-row ${cls}${statusCls}">
                <div class="voice-hist-meta"><i class="bi bi-${icon}"></i> <strong>${roleLabel}</strong> · ${time}${e.intent ? ` · ${e.intent}` : ''}${clarifyBadge}</div>
                <div class="voice-hist-text">${this._esc(e.text)}</div>
            </div>`;
        }).join('');
        el.scrollTop = el.scrollHeight;
    },

    _esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

window.ConversationHistory = ConversationHistory;
