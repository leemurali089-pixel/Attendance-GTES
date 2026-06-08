/**
 * Deepgram REST adapter — segment recording (complete webm per request).
 */
const DeepgramSpeechAdapter = {
    id: 'deepgram',
    label: 'Deepgram',

    _stream: null,
    _callbacks: null,
    _active: false,
    _segmentTimer: null,
    _recording: false,
    _lang: 'multi',
    _mimeType: 'audio/webm',

    isConfigured() {
        return !!this.getApiKey();
    },

    isSupported() {
        return !!(navigator.mediaDevices && window.MediaRecorder);
    },

    getApiKey() {
        const s = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        return String(s.deepgramApiKey || '').trim();
    },

    init() {
        if (!this.isSupported()) return false;
        if (!this.isConfigured()) {
            console.warn('[DeepgramSpeechAdapter] No deepgramApiKey in voice settings.');
            return false;
        }
        return true;
    },

    /** Map app language codes → Deepgram nova-3 codes */
    setLanguage(lang) {
        const raw = String(lang || '').toLowerCase();
        if (raw === 'ta' || raw === 'ta-in') {
            this._lang = 'ta';
        } else if (raw === 'en' || raw === 'en-in' || raw === 'en-us') {
            this._lang = 'en-IN';
        } else {
            // Tanglish / auto — multilingual code-switching
            this._lang = 'multi';
        }
    },

    _pickMimeType() {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            return 'audio/webm;codecs=opus';
        }
        if (MediaRecorder.isTypeSupported('audio/webm')) {
            return 'audio/webm';
        }
        return '';
    },

    async start({ onResult, onError, onEnd } = {}) {
        this._callbacks = { onResult, onError, onEnd };
        this._active = true;
        this._mimeType = this._pickMimeType();

        try {
            this._stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            void this._segmentLoop();
        } catch (e) {
            if (onError) onError(e && e.name === 'NotAllowedError' ? 'not-allowed' : 'network');
        }
    },

    async _segmentLoop() {
        const segmentMs = 3200;
        while (this._active) {
            if (this._recording) {
                await new Promise((r) => setTimeout(r, 200));
                continue;
            }
            try {
                const result = await this._recordSegment(segmentMs);
                if (result.text && this._callbacks?.onResult) {
                    this._callbacks.onResult({
                        interim: result.interim || '',
                        final: result.final || '',
                        isFinal: !!result.isFinal,
                        latencyMs: result.latencyMs
                    });
                }
                if (result.error) {
                    const fatal = result.error === 'no-api-key' || result.error === 'csp_blocked';
                    if (fatal) {
                        if (this._callbacks?.onError) this._callbacks.onError(result.error);
                        this._active = false;
                        break;
                    }
                    console.warn('[DeepgramSpeechAdapter] segment skipped:', result.detail || result.error);
                }
            } catch (e) {
                console.warn('[DeepgramSpeechAdapter] segment error:', e);
            }
            if (!this._active) break;
            await new Promise((r) => setTimeout(r, 120));
        }
        if (this._callbacks?.onEnd) this._callbacks.onEnd();
    },

    _recordSegment(ms) {
        return new Promise((resolve) => {
            if (!this._stream || !this._active) {
                resolve({ text: '', final: '', isFinal: false });
                return;
            }

            const chunks = [];
            this._recording = true;
            const opts = this._mimeType ? { mimeType: this._mimeType } : undefined;
            let recorder;
            try {
                recorder = new MediaRecorder(this._stream, opts);
            } catch (e) {
                this._recording = false;
                resolve({ error: 'network', text: '' });
                return;
            }

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = async () => {
                this._recording = false;
                const blob = new Blob(chunks, { type: this._mimeType || 'audio/webm' });
                if (blob.size < 1200) {
                    resolve({ text: '', final: '', isFinal: false });
                    return;
                }
                const out = await this._transcribeBlob(blob);
                resolve(out);
            };

            recorder.onerror = () => {
                this._recording = false;
                resolve({ error: 'network', text: '' });
            };

            try {
                recorder.start();
            } catch (_) {
                this._recording = false;
                resolve({ error: 'network', text: '' });
                return;
            }

            setTimeout(() => {
                if (recorder.state === 'recording') {
                    try { recorder.stop(); } catch (_) { this._recording = false; }
                }
            }, ms);
        });
    },

    _buildListenUrl() {
        const params = new URLSearchParams({
            model: 'nova-3',
            language: this._lang,
            punctuate: 'true',
            smart_format: 'true'
        });
        return `https://api.deepgram.com/v1/listen?${params.toString()}`;
    },

    async _transcribeBlob(blob) {
        const key = this.getApiKey();
        if (!key) {
            return { error: 'no-api-key', text: '' };
        }

        const t0 = Date.now();
        try {
            const res = await fetch(this._buildListenUrl(), {
                method: 'POST',
                headers: {
                    Authorization: `Token ${key}`,
                    'Content-Type': blob.type || 'audio/webm'
                },
                body: blob
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = data.err_msg || data.message || res.statusText;
                console.warn('[DeepgramSpeechAdapter] API error:', res.status, msg);
                const code = res.status === 401 || res.status === 403 ? 'no-api-key' : 'api_error';
                return { error: code, text: '', detail: msg };
            }
            const text = String(data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
            if (!text) {
                return { text: '', final: '', isFinal: false, latencyMs: Date.now() - t0 };
            }
            return {
                text,
                final: text,
                isFinal: true,
                latencyMs: Date.now() - t0
            };
        } catch (e) {
            const msg = String(e && e.message ? e.message : e);
            console.warn('[DeepgramSpeechAdapter] transcribe failed:', e);
            const code = /content security policy|csp/i.test(msg) ? 'csp_blocked' : 'network';
            return { error: code, text: '', detail: msg };
        }
    },

    stop() {
        this._active = false;
        if (this._segmentTimer) {
            clearTimeout(this._segmentTimer);
            this._segmentTimer = null;
        }
        if (this._stream) {
            this._stream.getTracks().forEach((t) => t.stop());
            this._stream = null;
        }
    },

    speak(text, lang) {
        return BrowserSpeechAdapter.speak(text, lang);
    }
};

window.DeepgramSpeechAdapter = DeepgramSpeechAdapter;
