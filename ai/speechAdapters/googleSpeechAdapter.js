/**
 * Google Cloud Speech-to-Text adapter — future mode stub.
 */
const GoogleSpeechAdapter = {
    init() {
        console.warn('[VoiceAgent] Google Speech adapter not configured. Using browser fallback.');
        return BrowserSpeechAdapter.init();
    },
    setLanguage(lang) { return BrowserSpeechAdapter.setLanguage(lang); },
    start(opts) { return BrowserSpeechAdapter.start(opts); },
    stop() { return BrowserSpeechAdapter.stop(); },
    speak(text, lang) { return BrowserSpeechAdapter.speak(text, lang); }
};

window.GoogleSpeechAdapter = GoogleSpeechAdapter;
