/**
 * OpenAI Realtime API adapter — future mode stub.
 * ERP logic unchanged; swap provider via MemoryManager settings.
 */
const OpenAISpeechAdapter = {
    init() {
        console.warn('[VoiceAgent] OpenAI Realtime adapter not configured. Using browser fallback.');
        return BrowserSpeechAdapter.init();
    },
    setLanguage(lang) { return BrowserSpeechAdapter.setLanguage(lang); },
    start(opts) { return BrowserSpeechAdapter.start(opts); },
    stop() { return BrowserSpeechAdapter.stop(); },
    speak(text, lang) { return BrowserSpeechAdapter.speak(text, lang); }
};

window.OpenAISpeechAdapter = OpenAISpeechAdapter;
