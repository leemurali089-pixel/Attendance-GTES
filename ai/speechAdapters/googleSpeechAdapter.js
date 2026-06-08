/**
 * Google Cloud Speech-to-Text REST adapter (API key in voice settings).
 */
const GoogleSpeechAdapter = {
    id: 'google',
    label: 'Google Cloud Speech',

    _recorder: null,
    _stream: null,
    _chunks: [],
    _callbacks: null,
    _active: false,
    _flushTimer: null,
    _transcribing: false,
    _lang: 'en-IN',

    isConfigured() {
        return !!this.getApiKey();
    },

    isSupported() {
        return !!(navigator.mediaDevices && window.MediaRecorder);
    },

    getApiKey() {
        const s = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        return String(s.googleSpeechApiKey || '').trim();
    },

    init() {
        if (!this.isSupported()) return false;
        if (!this.isConfigured()) {
            console.warn('[GoogleSpeechAdapter] No googleSpeechApiKey in voice settings.');
            return false;
        }
        return true;
    },

    setLanguage(lang) {
        const map = { ta: 'ta-IN', en: 'en-IN', tanglish: 'en-IN' };
        this._lang = map[lang] || lang || 'en-IN';
    },

    async start({ continuous = true, onResult, onError, onEnd } = {}) {
        this._callbacks = { onResult, onError, onEnd };
        this._active = true;
        this._chunks = [];
        try {
            this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus' : 'audio/webm';
            this._recorder = new MediaRecorder(this._stream, { mimeType: mime });
            this._recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) this._chunks.push(e.data);
            };
            this._recorder.onstop = () => {
                if (this._active) void this._transcribeBuffer(true);
            };
            this._recorder.start(continuous ? 2500 : 5000);
            if (continuous) {
                this._flushTimer = setInterval(() => {
                    if (this._active && this._chunks.length && !this._transcribing) {
                        void this._transcribeBuffer(false);
                    }
                }, 3000);
            }
        } catch (e) {
            if (onError) onError(e && e.name === 'NotAllowedError' ? 'not-allowed' : 'network');
        }
    },

    async _transcribeBuffer(isFinal) {
        if (!this._chunks.length || this._transcribing) return;
        this._transcribing = true;
        const blob = new Blob(this._chunks.splice(0), { type: this._recorder?.mimeType || 'audio/webm' });
        if (blob.size < 800) {
            this._transcribing = false;
            return;
        }

        const key = this.getApiKey();
        if (!key) {
            this._transcribing = false;
            if (this._callbacks?.onError) this._callbacks.onError('no-api-key');
            return;
        }

        const t0 = Date.now();
        try {
            const b64 = await this._blobToBase64(blob);
            const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(key)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: {
                        encoding: 'WEBM_OPUS',
                        sampleRateHertz: 48000,
                        languageCode: this._lang,
                        enableAutomaticPunctuation: true
                    },
                    audio: { content: b64 }
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || res.statusText);
            const text = String(data.results?.map((r) => r.alternatives?.[0]?.transcript).join(' ') || '').trim();
            if (text && this._callbacks?.onResult) {
                this._callbacks.onResult({
                    interim: isFinal ? '' : text,
                    final: isFinal ? text : '',
                    isFinal: !!isFinal,
                    latencyMs: Date.now() - t0
                });
            }
        } catch (e) {
            console.warn('[GoogleSpeechAdapter] transcribe failed:', e);
            if (this._callbacks?.onError) this._callbacks.onError('network');
        }
        this._transcribing = false;
    },

    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const raw = String(reader.result || '');
                resolve(raw.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    stop() {
        this._active = false;
        if (this._flushTimer) clearInterval(this._flushTimer);
        if (this._recorder && this._recorder.state !== 'inactive') {
            try { this._recorder.stop(); } catch (_) { /* */ }
        }
        if (this._stream) {
            this._stream.getTracks().forEach((t) => t.stop());
            this._stream = null;
        }
        if (this._callbacks?.onEnd) this._callbacks.onEnd();
    },

    speak(text, lang) {
        return BrowserSpeechAdapter.speak(text, lang);
    }
};

window.GoogleSpeechAdapter = GoogleSpeechAdapter;
