/**
 * Persists voice agent context and settings locally.
 */
const MemoryManager = {
    KEYS: {
        context: 'gtes_voice_agent_context',
        history: 'gtes_voice_agent_history',
        settings: 'gtes_voice_agent_settings'
    },

    loadContext() {
        try {
            return JSON.parse(localStorage.getItem(this.KEYS.context) || 'null');
        } catch (_) {
            return null;
        }
    },

    saveContext(ctx) {
        try {
            const slim = {
                lastCustomerName: ctx.lastCustomerName,
                lastCustomerId: ctx.lastCustomerId,
                lastEmployeeName: ctx.lastEmployeeName,
                lastTaskHint: ctx.lastTaskHint,
                lastIntent: ctx.lastIntent,
                lastMonth: ctx.lastMonth
            };
            localStorage.setItem(this.KEYS.context, JSON.stringify(slim));
        } catch (_) { /* quota */ }
    },

    getSettings() {
        try {
            const raw = localStorage.getItem(this.KEYS.settings);
            const defaults = {
                mode: 'free',
                speechProvider: 'browser',
                listenMode: 'push_to_talk',
                responseLang: 'en',
                continuous: false
            };
            return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
        } catch (_) {
            return { mode: 'free', speechProvider: 'browser', listenMode: 'push_to_talk', responseLang: 'en' };
        }
    },

    saveSettings(settings) {
        localStorage.setItem(this.KEYS.settings, JSON.stringify(settings || {}));
    }
};

window.MemoryManager = MemoryManager;
