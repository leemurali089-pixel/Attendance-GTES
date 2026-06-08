/**
 * OpenAI Whisper adapter — MediaRecorder + REST (works in Electron when API key set).
 */
const OpenAISpeechAdapter = {
    id: 'whisper',
    label: 'OpenAI Whisper',

    _recorder: null,
    _stream: null,
    _chunks: [],
    _callbacks: null,
    _active: false,
    _flushTimer: null,
    _transcribing: false,
    _lang: 'en',

    isConfigured() {
        return !!this.getApiKey();
    },

    isSupported() {
        return !!(navigator.mediaDevices && window.MediaRecorder);
    },

    getApiKey() {
        const s = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        return String(s.openaiApiKey || s.whisperApiKey || '').trim();
    },

    init() {
        if (!this.isSupported()) return false;
        if (!this.isConfigured()) {
            console.warn('[OpenAISpeechAdapter] No openaiApiKey in voice settings — configure in Voice Health panel.');
            return false;
        }
        return true;
    },

    setLanguage(lang) {
        const map = { 'en-IN': 'en', 'en-US': 'en', 'ta-IN': 'ta', ta: 'ta', en: 'en', tanglish: 'en' };
        this._lang = map[lang] || 'en';
    },

    async start({ continuous = true, onResult, onError, onEnd } = {}) {
        this._callbacks = { onResult, onError, onEnd };
        this._active = true;
        this._chunks = [];
        try {
            this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
            this._recorder = mime
                ? new MediaRecorder(this._stream, { mimeType: mime })
                : new MediaRecorder(this._stream);
            this._recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) this._chunks.push(e.data);
            };
            this._recorder.onstop = () => {
                if (this._active) void this._transcribeBuffer(true);
            };
            this._recorder.start(continuous ? 2000 : 5000);

            if (continuous) {
                this._flushTimer = setInterval(() => {
                    if (this._active && this._chunks.length && !this._transcribing) {
                        void this._transcribeBuffer(false);
                    }
                }, 2800);
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
            const fd = new FormData();
            fd.append('file', blob, 'audio.webm');
            fd.append('model', 'whisper-1');
            if (this._lang === 'ta') fd.append('language', 'ta');

            const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${key}` },
                body: fd
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error?.message || res.statusText);
            }
            const text = String(data.text || '').trim();
            if (text && this._callbacks?.onResult) {
                this._callbacks.onResult({
                    interim: isFinal ? '' : text,
                    final: isFinal ? text : '',
                    isFinal: !!isFinal,
                    latencyMs: Date.now() - t0
                });
            }
        } catch (e) {
            console.warn('[OpenAISpeechAdapter] transcribe failed:', e);
            if (this._callbacks?.onError) this._callbacks.onError('network');
        }
        this._transcribing = false;
    },

    stop() {
        this._active = false;
        if (this._flushTimer) {
            clearInterval(this._flushTimer);
            this._flushTimer = null;
        }
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

window.OpenAISpeechAdapter = OpenAISpeechAdapter;
