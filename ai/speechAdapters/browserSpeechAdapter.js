/**
 * Browser Web Speech API adapter (default — free mode).
 */
const BrowserSpeechAdapter = {
    recognition: null,
    synthesis: null,
    _onResult: null,
    _onError: null,
    _onEnd: null,
    _continuous: false,
    _voicesReady: false,
    _lastError: null,
    _sessionActive: false,

    init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return false;
        this.recognition = new SR();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-IN';
        this.recognition.maxAlternatives = 3;
        this.synthesis = window.speechSynthesis || null;
        if (this.synthesis) {
            const loadVoices = () => {
                const v = this.synthesis.getVoices();
                if (v && v.length) this._voicesReady = true;
            };
            loadVoices();
            if (typeof this.synthesis.addEventListener === 'function') {
                this.synthesis.addEventListener('voiceschanged', loadVoices);
            } else {
                this.synthesis.onvoiceschanged = loadVoices;
            }
        }
        return true;
    },

    setLanguage(lang) {
        if (!this.recognition) return;
        const map = { ta: 'ta-IN', en: 'en-IN', tanglish: 'en-IN' };
        this.recognition.lang = map[lang] || lang || 'en-IN';
    },

    start({ continuous = true, onResult, onError, onEnd } = {}) {
        if (!this.recognition) throw new Error('Speech recognition not supported in this browser.');
        this._onResult = onResult;
        this._onError = onError;
        this._onEnd = onEnd;
        this._lastError = null;
        this._sessionActive = true;
        this._continuous = continuous;
        this.recognition.continuous = true;

        this.recognition.onresult = (ev) => {
            let interim = '';
            let final = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const t = ev.results[i][0].transcript;
                if (ev.results[i].isFinal) final += t;
                else interim += t;
            }
            if (this._onResult) {
                this._onResult({
                    interim: (interim + final).trim(),
                    final: final.trim(),
                    isFinal: !!final
                });
            }
        };

        this.recognition.onerror = (ev) => {
            const err = ev.error || 'unknown';
            if (err === 'no-speech' || err === 'aborted') return;
            this._lastError = err;
            if (this._onError) this._onError(err);
        };

        this.recognition.onend = () => {
            if (!this._sessionActive) return;
            if (this._onEnd) this._onEnd();
        };

        try {
            this.recognition.start();
        } catch (e) {
            if (String(e.message).includes('already started')) return;
            throw e;
        }
    },

    stop() {
        this._sessionActive = false;
        if (this.recognition) {
            this.recognition.onend = null;
            try { this.recognition.stop(); } catch (_) { /* */ }
            try { this.recognition.abort(); } catch (_) { /* */ }
        }
    },

    speak(text, lang = 'en-IN') {
        const msg = String(text || '').trim();
        if (!msg) return Promise.resolve();
        if (!this.synthesis) this.init();

        return new Promise((resolve) => {
            if (!this.synthesis) {
                console.warn('[BrowserSpeechAdapter] TTS unavailable — speechSynthesis missing');
                resolve();
                return;
            }

            const doSpeak = () => {
                try {
                    this.synthesis.cancel();
                    if (this.synthesis.paused) this.synthesis.resume();
                    this.synthesis.resume();
                } catch (_) { /* */ }

                const u = new SpeechSynthesisUtterance(msg);
                u.lang = lang;
                u.rate = 1;
                u.volume = 1;
                const voices = this.synthesis.getVoices() || [];
                const langPrefix = String(lang || 'en').slice(0, 2);
                let preferred = voices.find((v) => v.lang.startsWith(langPrefix) && /tamil|google|microsoft|natural|zira|david/i.test(v.name))
                    || voices.find((v) => v.lang.startsWith(langPrefix))
                    || voices.find((v) => /tamil/i.test(v.name) && langPrefix === 'ta');
                if (!preferred && langPrefix === 'ta') {
                    preferred = voices.find((v) => v.lang.startsWith('en') && /google|microsoft|natural|zira|david/i.test(v.name))
                        || voices.find((v) => v.lang.startsWith('en'));
                    if (preferred) u.lang = preferred.lang;
                }
                if (!preferred) {
                    preferred = voices.find((v) => v.lang.startsWith('en') && /google|microsoft|natural|zira|david/i.test(v.name))
                        || voices.find((v) => v.lang.startsWith('en'))
                        || voices[0];
                }
                if (preferred) u.voice = preferred;
                u.onend = () => resolve();
                u.onerror = (e) => {
                    console.warn('[BrowserSpeechAdapter] TTS error:', e && e.error);
                    resolve();
                };
                setTimeout(() => {
                    try {
                        this.synthesis.speak(u);
                        if (this.synthesis.paused) this.synthesis.resume();
                    } catch (e) {
                        console.warn('[BrowserSpeechAdapter] speak failed:', e);
                        resolve();
                    }
                }, 100);
            };

            const voices = this.synthesis.getVoices();
            if (voices && voices.length) {
                doSpeak();
            } else {
                const once = () => {
                    if (typeof this.synthesis.removeEventListener === 'function') {
                        this.synthesis.removeEventListener('voiceschanged', once);
                    } else {
                        this.synthesis.onvoiceschanged = null;
                    }
                    doSpeak();
                };
                if (typeof this.synthesis.addEventListener === 'function') {
                    this.synthesis.addEventListener('voiceschanged', once);
                } else {
                    this.synthesis.onvoiceschanged = once;
                }
                this.synthesis.getVoices();
                setTimeout(doSpeak, 400);
            }
        });
    }
};

window.BrowserSpeechAdapter = BrowserSpeechAdapter;
