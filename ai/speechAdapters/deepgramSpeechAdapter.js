/**
 * Deepgram adapter — future mode stub.
 */
const DeepgramSpeechAdapter = {
    init() {
        console.warn('[VoiceAgent] Deepgram adapter not configured. Using browser fallback.');
        return BrowserSpeechAdapter.init();
    },
    setLanguage(lang) { return BrowserSpeechAdapter.setLanguage(lang); },
    start(opts) { return BrowserSpeechAdapter.start(opts); },
    stop() { return BrowserSpeechAdapter.stop(); },
    speak(text, lang) { return BrowserSpeechAdapter.speak(text, lang); }
};

window.DeepgramSpeechAdapter = DeepgramSpeechAdapter;
