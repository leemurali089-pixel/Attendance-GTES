/**
 * Speech abstraction — swap providers without changing ERP agents.
 */
const SpeechEngine = {
    _adapter: null,
    _adapters: {
        browser: () => BrowserSpeechAdapter,
        openai: () => OpenAISpeechAdapter,
        google: () => GoogleSpeechAdapter,
        deepgram: () => DeepgramSpeechAdapter
    },

    init() {
        const settings = MemoryManager.getSettings();
        const factory = this._adapters[settings.speechProvider] || this._adapters.browser;
        this._adapter = factory();
        const ok = this._adapter.init();
        this._adapter.setLanguage(settings.responseLang === 'ta' ? 'ta-IN' : 'en-IN');
        return ok;
    },

    getAdapter() {
        if (!this._adapter) this.init();
        return this._adapter;
    },

    startListening(options) {
        return this.getAdapter().start(options);
    },

    stopListening() {
        if (this._adapter) this._adapter.stop();
    },

    speak(text) {
        const settings = MemoryManager.getSettings();
        const lang = settings.responseLang === 'ta' ? 'ta-IN' : 'en-IN';
        return this.getAdapter().speak(text, lang);
    },

    setProvider(name) {
        const settings = MemoryManager.getSettings();
        settings.speechProvider = name;
        MemoryManager.saveSettings(settings);
        this._adapter = null;
        return this.init();
    }
};

window.SpeechEngine = SpeechEngine;
