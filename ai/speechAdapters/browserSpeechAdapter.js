/**
 * Browser Web Speech API adapter (default — free mode).
 */
const BrowserSpeechAdapter = {
    recognition: null,
    synthesis: null,
    _onResult: null,
    _onError: null,
    _continuous: false,

    init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return false;
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-IN';
        this.recognition.maxAlternatives = 3;
        this.synthesis = window.speechSynthesis || null;
        if (this.synthesis) this.synthesis.getVoices();
        return true;
    },

    setLanguage(lang) {
        if (!this.recognition) return;
        const map = { ta: 'ta-IN', en: 'en-IN', tanglish: 'en-IN' };
        this.recognition.lang = map[lang] || lang || 'en-IN';
    },

    start({ continuous = false, onResult, onError, onEnd } = {}) {
        if (!this.recognition) throw new Error('Speech recognition not supported in this browser.');
        this._onResult = onResult;
        this._onError = onError;
        this._continuous = continuous;
        this.recognition.continuous = continuous;

        this.recognition.onresult = (ev) => {
            let interim = '';
            let final = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const t = ev.results[i][0].transcript;
                if (ev.results[i].isFinal) final += t;
                else interim += t;
            }
            if (this._onResult) this._onResult({ interim, final, isFinal: !!final });
        };

        this.recognition.onerror = (ev) => {
            if (this._onError) this._onError(ev.error || 'unknown');
        };

        this.recognition.onend = () => {
            if (onEnd) onEnd();
        };

        try {
            this.recognition.start();
        } catch (e) {
            if (String(e.message).includes('already started')) return;
            throw e;
        }
    },

    stop() {
        if (this.recognition) {
            try { this.recognition.stop(); } catch (_) { /* */ }
        }
    },

    speak(text, lang = 'en-IN') {
        return new Promise((resolve) => {
            if (!this.synthesis) {
                resolve();
                return;
            }
            const u = new SpeechSynthesisUtterance(String(text || ''));
            u.lang = lang;
            u.rate = 1;
            const voices = this.synthesis.getVoices();
            const preferred = voices.find((v) => v.lang.startsWith('en') && v.name.includes('Google'))
                || voices.find((v) => v.lang.startsWith('en'))
                || voices[0];
            if (preferred) u.voice = preferred;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            this.synthesis.cancel();
            this.synthesis.speak(u);
        });
    }
};

window.BrowserSpeechAdapter = BrowserSpeechAdapter;
