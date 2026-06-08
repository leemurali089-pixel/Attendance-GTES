/**
 * Speech facade — delegates to SpeechProviderManager (never binds to browser directly).
 */
const SpeechEngine = {
    init() {
        if (typeof SpeechProviderManager === 'undefined') {
            console.warn('[SpeechEngine] SpeechProviderManager not loaded');
            return false;
        }
        return SpeechProviderManager.init();
    },

    getAdapter() {
        return SpeechProviderManager.getProvider();
    },

    getDiagnostics() {
        return typeof SpeechProviderManager !== 'undefined'
            ? SpeechProviderManager.getDiagnostics()
            : null;
    },

    startListening(options) {
        const lang = typeof LanguageEngine !== 'undefined'
            ? LanguageEngine.getSpeechRecognitionLang()
            : 'en-IN';
        SpeechProviderManager.setLanguage(lang);
        return SpeechProviderManager.startListening(options);
    },

    stopListening() {
        if (typeof SpeechProviderManager !== 'undefined') {
            SpeechProviderManager.stopListening();
        }
    },

    speak(text) {
        const lang = typeof LanguageEngine !== 'undefined'
            ? LanguageEngine.getSpeechSynthesisLang()
            : 'en-IN';
        return SpeechProviderManager.speak(text, lang);
    },

    speakWithLang(text, lang) {
        return SpeechProviderManager.speak(text, lang || 'en-IN');
    },

    setResponseLanguage(lang) {
        if (typeof LanguageEngine !== 'undefined') LanguageEngine.setResponseLang(lang);
    },

    setProvider(name) {
        return SpeechProviderManager.setProvider(name);
    }
};

window.SpeechEngine = SpeechEngine;
