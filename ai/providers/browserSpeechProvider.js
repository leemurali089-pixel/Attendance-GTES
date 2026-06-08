/**
 * Browser Web Speech API provider — wraps BrowserSpeechAdapter.
 */
const BrowserSpeechProvider = {
    id: 'browser',
    label: 'Browser Speech (Web Speech API)',

    init() {
        if (typeof BrowserSpeechAdapter === 'undefined') return false;
        return BrowserSpeechAdapter.init();
    },

    isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },

    isConfigured() {
        return true;
    },

    setLanguage(lang) {
        if (typeof BrowserSpeechAdapter !== 'undefined') {
            BrowserSpeechAdapter.setLanguage(lang);
        }
    },

    start(options) {
        return BrowserSpeechAdapter.start(options);
    },

    stop() {
        if (typeof BrowserSpeechAdapter !== 'undefined') {
            BrowserSpeechAdapter.stop();
        }
    },

    speak(text, lang) {
        return BrowserSpeechAdapter.speak(text, lang);
    }
};

window.BrowserSpeechProvider = BrowserSpeechProvider;
