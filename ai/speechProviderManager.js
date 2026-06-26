/**
 * Speech provider manager — retry, logging, diagnostics, provider abstraction.
 */
const SpeechProviderManager = {
    MAX_NETWORK_RETRIES: 3,
    NETWORK_RETRY_DELAYS: [500, 1000, 2000],
    LANG_FALLBACK_CHAIN: ['en-IN', 'en-US', 'ta-IN'],

    _provider: null,
    _sessionActive: false,
    _userCallbacks: null,
    _networkRetries: 0,
    _micChecked: false,
    _langFallbackIdx: 0,
    _metrics: {
        sessions: 0,
        transcripts: 0,
        totalLatencyMs: 0,
        lastDurationMs: 0,
        micOpened: false,
        lastTranscriptAt: null
    },
    _startupProbeDone: false,
    _lastInitAt: 0,
    _initGeneration: 0,
    _sttBlockedUntilKey: false,
    _loggedElectronNoKey: false,

    diagnostics: {
        recognitionState: 'idle',
        currentLanguage: 'en-IN',
        microphoneAvailable: null,
        microphonePermission: null,
        internetAvailable: true,
        lastError: null,
        classifiedError: null,
        retryCount: 0,
        provider: 'browser',
        providerLabel: 'Browser Speech',
        recognitionAvailable: false,
        lastEvent: null,
        lastLog: [],
        electronVersion: null,
        chromiumVersion: null,
        isElectron: false,
        userAgent: null,
        networkFailuresWhileOnline: 0,
        langFallbackIndex: 0,
        avgLatencyMs: 0,
        micOpen: false,
        transcriptReceived: false,
        googleApiKeyInEnv: false,
        electronBrowserBlocked: false
    },

    _providers: {
        browser: () => (typeof BrowserSpeechProvider !== 'undefined' ? BrowserSpeechProvider : null),
        whisper: () => SpeechProviderManager._wrapAdapter('whisper', typeof OpenAISpeechAdapter !== 'undefined' ? OpenAISpeechAdapter : null),
        deepgram: () => SpeechProviderManager._wrapAdapter('deepgram', typeof DeepgramSpeechAdapter !== 'undefined' ? DeepgramSpeechAdapter : null),
        google: () => SpeechProviderManager._wrapAdapter('google', typeof GoogleSpeechAdapter !== 'undefined' ? GoogleSpeechAdapter : null)
    },

    PROVIDER_OPTIONS: [
        { id: 'browser', label: 'Browser Speech (Web Speech API)' },
        { id: 'whisper', label: 'OpenAI Whisper' },
        { id: 'deepgram', label: 'Deepgram' },
        { id: 'google', label: 'Google Cloud Speech' }
    ],

    _wrapAdapter(id, adapter) {
        if (!adapter) return null;
        return {
            id: id,
            label: adapter.label || id,
            init: () => adapter.init(),
            isSupported: () => (adapter.isSupported ? adapter.isSupported() : adapter.init()),
            isConfigured: () => (adapter.isConfigured ? adapter.isConfigured() : true),
            setLanguage: (lang) => adapter.setLanguage(lang),
            start: (opts) => adapter.start(opts),
            stop: () => adapter.stop(),
            speak: (text, lang) => adapter.speak(text, lang)
        };
    },

    _ensureTtsReady() {
        if (typeof BrowserSpeechAdapter === 'undefined') return false;
        if (!BrowserSpeechAdapter.synthesis) {
            BrowserSpeechAdapter.init();
        }
        return !!BrowserSpeechAdapter.synthesis;
    },

    _detectElectron() {
        this.diagnostics.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        this.diagnostics.isElectron = !!(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron)
            || /Electron/i.test(this.diagnostics.userAgent || '');
        return this.diagnostics.isElectron;
    },

    _bootstrapVoiceKeys() {
        if (typeof MemoryManager === 'undefined' || typeof DataManager === 'undefined') return;
        const s = MemoryManager.getSettings();
        let changed = false;
        try {
            const erp = DataManager.getData('gtes_settings') || {};
            const ai = erp.ai || erp.aiBrain || {};
            if (!String(s.deepgramApiKey || '').trim() && ai.deepgramApiKey) {
                s.deepgramApiKey = String(ai.deepgramApiKey).trim();
                changed = true;
            }
            if (!String(s.openaiApiKey || '').trim() && ai.openaiApiKey) {
                s.openaiApiKey = String(ai.openaiApiKey).trim();
                changed = true;
            }
        } catch (_) { /* */ }
        if (changed) MemoryManager.saveSettings(s);
    },

    _hasCloudSttKey() {
        this._bootstrapVoiceKeys();
        if (typeof DeepgramSpeechAdapter !== 'undefined' && DeepgramSpeechAdapter.isConfigured()) return 'deepgram';
        if (typeof OpenAISpeechAdapter !== 'undefined' && OpenAISpeechAdapter.isConfigured()) return 'whisper';
        return null;
    },

    _persistSpeechProvider(name) {
        if (typeof MemoryManager === 'undefined') return;
        const s = MemoryManager.getSettings();
        if (s.speechProvider === name) return;
        s.speechProvider = name;
        MemoryManager.saveSettings(s);
    },

    _resolveElectronProviderName(settingsName) {
        const preferred = settingsName || 'browser';
        if (!this._detectElectron() || preferred !== 'browser') return preferred;

        const picked = this._hasCloudSttKey();
        if (picked) {
            this._log('provider', 'switched browser → ' + picked + ' (Electron)');
            this._persistSpeechProvider(picked);
            this.diagnostics.electronBrowserBlocked = false;
            return picked;
        }

        this.diagnostics.electronBrowserBlocked = true;
        this._log('electron_stt_warning', 'Browser Web Speech STT is unreliable in Electron');
        return 'browser';
    },

    init(force) {
        this._ensureTtsReady();
        this._detectElectron();
        this._bootstrapVoiceKeys();

        const now = Date.now();
        if (!force && this._provider && this._lastInitAt && (now - this._lastInitAt) < 400) {
            return !!this._provider;
        }
        this._lastInitAt = now;
        this._initGeneration += 1;
        const gen = this._initGeneration;

        if (!this._startupProbeDone) {
            this._startupProbeDone = true;
            void this._loadRuntimeInfo().then(() => {
                if (gen !== this._initGeneration) return;
                this._logStartupProbe();
                this._notifyDiagnostics();
            });
        } else {
            void this._loadRuntimeInfo().then(() => {
                if (gen !== this._initGeneration) return;
                this._notifyDiagnostics();
            });
        }

        const settings = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        let name = this._resolveElectronProviderName(settings.speechProvider || 'browser');

        const provider = this._resolveProvider(name);
        if (!provider) {
            console.warn('[SpeechProviderManager] Provider unavailable:', name);
            return false;
        }

        const ok = provider.init && provider.init();
        if (!ok && name !== 'browser') {
            if (this.diagnostics.isElectron) {
                const alt = name === 'deepgram' ? 'whisper' : (name === 'whisper' ? 'deepgram' : null);
                if (alt && alt !== name) {
                    const altProvider = this._resolveProvider(alt);
                    if (altProvider && altProvider.init && altProvider.init()) {
                        this._provider = altProvider;
                        name = alt;
                        this._persistSpeechProvider(name);
                    } else {
                        console.warn('[SpeechProviderManager] Cloud STT init failed in Electron:', name);
                        this.diagnostics.electronBrowserBlocked = true;
                        return false;
                    }
                } else {
                    console.warn('[SpeechProviderManager] Cloud STT init failed in Electron:', name);
                    this.diagnostics.electronBrowserBlocked = true;
                    return false;
                }
            } else {
                console.warn('[SpeechProviderManager] Provider init failed, falling back to browser:', name);
                name = 'browser';
                this._provider = this._resolveProvider('browser');
                if (!this._provider || !this._provider.init()) return false;
            }
        } else if (!ok) {
            console.warn('[SpeechProviderManager] Browser provider init failed');
            return false;
        } else {
            this._provider = provider;
        }

        this.diagnostics.provider = this._provider.id || name;
        this.diagnostics.providerLabel = this._provider.label || name;
        this.diagnostics.recognitionAvailable = this._provider.isSupported
            ? this._provider.isSupported()
            : true;
        this._refreshInternet();
        if (!this._micChecked) void this._probeMicrophone();
        this._log('init', {
            provider: this.diagnostics.provider,
            recognitionAvailable: this.diagnostics.recognitionAvailable,
            isElectron: this.diagnostics.isElectron
        });
        return true;
    },

    async _loadRuntimeInfo() {
        this._detectElectron();

        if (typeof window !== 'undefined' && window.electronAPI?.getRuntimeInfo) {
            try {
                const info = await window.electronAPI.getRuntimeInfo();
                this.diagnostics.electronVersion = info.electron || null;
                this.diagnostics.chromiumVersion = info.chromium || null;
            } catch (_) { /* */ }
        }
        if (typeof window !== 'undefined' && window.electronAPI?.getSpeechEnvHints) {
            try {
                const hints = await window.electronAPI.getSpeechEnvHints();
                this.diagnostics.googleApiKeyInEnv = !!hints.hasGoogleApiKey;
                if (!this.diagnostics.electronVersion) this.diagnostics.electronVersion = hints.electron;
                if (!this.diagnostics.chromiumVersion) this.diagnostics.chromiumVersion = hints.chromium;
            } catch (_) { /* */ }
        }
    },

    _logStartupProbe() {
        const probe = {
            SpeechRecognition: !!(typeof window !== 'undefined' && window.SpeechRecognition),
            webkitSpeechRecognition: !!(typeof window !== 'undefined' && window.webkitSpeechRecognition),
            navigatorOnLine: typeof navigator !== 'undefined' ? navigator.onLine : null,
            userAgent: this.diagnostics.userAgent,
            isElectron: this.diagnostics.isElectron,
            electronVersion: this.diagnostics.electronVersion,
            chromiumVersion: this.diagnostics.chromiumVersion,
            googleApiKeyInEnv: this.diagnostics.googleApiKeyInEnv
        };
        console.log('[speech.startup.probe]', probe);
        this.diagnostics.lastLog.push({ t: new Date().toISOString(), event: 'startup.probe', detail: probe });
    },

    _resolveProvider(name) {
        const factory = this._providers[name] || this._providers.browser;
        return factory ? factory() : null;
    },

    getProvider() {
        if (!this._provider) this.init();
        return this._provider;
    },

    ensureElectronProvider() {
        this._detectElectron();
        this._bootstrapVoiceKeys();
        if (!this.diagnostics.isElectron) return true;

        const settings = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        const configured = settings.speechProvider || 'browser';
        const active = this._provider?.id || configured;

        if (active !== 'browser') {
            if (!this._provider || this._provider.id !== active) return this.init(true);
            return true;
        }

        const picked = this._hasCloudSttKey();
        if (picked) {
            this._log('provider', 'switched browser → ' + picked + ' (Electron)');
            return this.setProvider(picked);
        }

        this.diagnostics.electronBrowserBlocked = true;
        return false;
    },

    getElectronSttErrorMessage() {
        return 'Voice input needs Deepgram or OpenAI key in Settings → Voice Health. Browser speech does not work in desktop app.';
    },

    isElectronSttBlocked() {
        this._detectElectron();
        this._bootstrapVoiceKeys();
        if (!this.diagnostics.isElectron) return false;
        if (this._sttBlockedUntilKey) return true;
        const settings = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        const active = this._provider?.id || settings.speechProvider || 'browser';
        if (active !== 'browser') return false;
        return !this._hasCloudSttKey();
    },

    clearSttBlock() {
        this._sttBlockedUntilKey = false;
        this._loggedElectronNoKey = false;
        this.diagnostics.electronBrowserBlocked = false;
        if (this.diagnostics.classifiedError === 'electron_no_stt_key') {
            this.diagnostics.classifiedError = null;
            this.diagnostics.lastError = null;
            this.diagnostics.recognitionState = 'idle';
        }
    },

    _emitElectronNoKeyError(callbacks) {
        const err = 'electron_no_stt_key';
        this._sttBlockedUntilKey = true;
        this._sessionActive = false;
        this.diagnostics.electronBrowserBlocked = true;
        this.diagnostics.classifiedError = err;
        this.diagnostics.recognitionState = 'error';
        this.diagnostics.lastError = err;
        if (!this._loggedElectronNoKey) {
            this._loggedElectronNoKey = true;
            this._log('error', err);
        }
        const cbs = callbacks || this._userCallbacks;
        if (cbs?.onNetworkFailed) {
            cbs.onNetworkFailed(0, err);
        } else if (cbs?.onError) {
            cbs.onError(err);
        }
        this._notifyDiagnostics();
    },

    getDiagnostics() {
        this._refreshInternet();
        this.diagnostics.langFallbackIndex = this._langFallbackIdx;
        this.diagnostics.micOpen = this._sessionActive;
        this.diagnostics.transcriptReceived = this._metrics.transcripts > 0;
        this.diagnostics.avgLatencyMs = this._metrics.transcripts > 0
            ? Math.round(this._metrics.totalLatencyMs / this._metrics.transcripts)
            : 0;
        return { ...this.diagnostics, lastLog: this.diagnostics.lastLog.slice(-16), metrics: { ...this._metrics } };
    },

    getDiagnosticReport() {
        const d = this.getDiagnostics();
        return {
            providerName: d.providerLabel || d.provider,
            recognitionAvailable: d.recognitionAvailable,
            microphonePermission: d.microphonePermission,
            microphoneAvailable: d.microphoneAvailable,
            internetStatus: d.internetAvailable ? 'online' : 'offline',
            currentLanguage: d.currentLanguage,
            electronVersion: d.electronVersion || (d.isElectron ? 'detected' : 'n/a'),
            chromiumVersion: d.chromiumVersion || 'n/a',
            classifiedError: d.classifiedError,
            isElectron: d.isElectron,
            googleApiKeyInEnv: d.googleApiKeyInEnv,
            metrics: d.metrics
        };
    },

    _refreshInternet() {
        this.diagnostics.internetAvailable = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
    },

    async _probeMicrophone() {
        if (!navigator.mediaDevices?.getUserMedia) {
            this.diagnostics.microphoneAvailable = false;
            this.diagnostics.microphonePermission = 'unsupported';
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
            this.diagnostics.microphoneAvailable = true;
            this.diagnostics.microphonePermission = 'granted';
        } catch (err) {
            this.diagnostics.microphoneAvailable = false;
            const name = err && err.name;
            this.diagnostics.microphonePermission = name === 'NotAllowedError' ? 'denied' : (name || 'error');
        }
        this._micChecked = true;
        this._notifyDiagnostics();
    },

    _log(event, detail) {
        const entry = { t: new Date().toISOString(), event: event, detail: detail || null };
        this.diagnostics.lastEvent = event;
        this.diagnostics.lastLog.push(entry);
        if (this.diagnostics.lastLog.length > 48) this.diagnostics.lastLog.shift();
        console.log(`[speech.${event}]`, detail !== undefined && detail !== null ? detail : '');
        this._notifyDiagnostics();
    },

    _notifyDiagnostics() {
        if (typeof VoiceDiagnostics !== 'undefined' && VoiceDiagnostics.refresh) {
            VoiceDiagnostics.refresh();
        }
    },

    _recognitionLang() {
        if (typeof LanguageEngine !== 'undefined' && LanguageEngine.getSpeechRecognitionLang) {
            return LanguageEngine.getSpeechRecognitionLang();
        }
        return 'en-IN';
    },

    _resolveLangChain(preferred) {
        const chain = [preferred || 'en-IN'];
        this.LANG_FALLBACK_CHAIN.forEach((l) => {
            if (!chain.includes(l)) chain.push(l);
        });
        return chain;
    },

    _currentLang() {
        const preferred = this._recognitionLang();
        const chain = this._resolveLangChain(preferred);
        return chain[Math.min(this._langFallbackIdx, chain.length - 1)];
    },

    startListening(callbacks = {}) {
        if (this._sttBlockedUntilKey || this.isElectronSttBlocked()) {
            this._emitElectronNoKeyError(callbacks);
            return;
        }
        if (!this.ensureElectronProvider()) {
            this._emitElectronNoKeyError(callbacks);
            return;
        }

        const provider = this.getProvider();
        if (!provider) throw new Error('No speech provider available');

        this._sessionActive = true;
        this._userCallbacks = callbacks;
        this._networkRetries = 0;
        this._langFallbackIdx = 0;
        this.diagnostics.retryCount = 0;
        this.diagnostics.lastError = null;
        this.diagnostics.classifiedError = null;
        this._metrics.sessions += 1;
        this._metrics.micOpened = true;
        this._refreshInternet();

        if (!this.diagnostics.internetAvailable) {
            this._log('offline_warn', null);
            if (callbacks.onOfflineWarning) callbacks.onOfflineWarning();
        }

        this.diagnostics.recognitionState = 'listening';
        const lang = this._currentLang();
        this._log('start', { lang: lang, online: this.diagnostics.internetAvailable, provider: this.diagnostics.provider });
        this._startProvider();
    },

    _startProvider() {
        if (!this._sessionActive) return;
        const provider = this.getProvider();
        const lang = this._currentLang();
        provider.setLanguage(lang);
        this.diagnostics.currentLanguage = lang;
        const t0 = Date.now();

        try {
            provider.start({
                continuous: true,
                onResult: (payload) => {
                    this._networkRetries = 0;
                    this._langFallbackIdx = 0;
                    this.diagnostics.retryCount = 0;
                    this.diagnostics.lastError = null;
                    this.diagnostics.classifiedError = null;
                    this.diagnostics.recognitionState = 'listening';
                    const latency = payload.latencyMs || (Date.now() - t0);
                    if (payload.final || payload.interim) {
                        this._metrics.transcripts += 1;
                        this._metrics.totalLatencyMs += latency;
                        this._metrics.lastDurationMs = Date.now() - t0;
                        this._metrics.lastTranscriptAt = new Date().toISOString();
                        this.diagnostics.transcriptReceived = true;
                    }
                    this._log('result', {
                        isFinal: !!payload.isFinal,
                        len: (payload.final || payload.interim || '').length,
                        latencyMs: latency
                    });
                    if (this._userCallbacks?.onResult) this._userCallbacks.onResult(payload);
                },
                onError: (err) => {
                    if (err === 'no-speech' || err === 'aborted') return;
                    this.diagnostics.lastError = err;
                    this._log('error', err);

                    if (err === 'csp_blocked' || err === 'api_error') {
                        this.diagnostics.classifiedError = err;
                        this.diagnostics.recognitionState = 'error';
                        if (this._userCallbacks?.onNetworkFailed) {
                            this._userCallbacks.onNetworkFailed(0, err);
                        } else if (this._userCallbacks?.onError) {
                            this._userCallbacks.onError(err);
                        }
                        return;
                    }
                    if (err === 'network' || err === 'no-api-key') {
                        if (this.diagnostics.isElectron && this.diagnostics.provider === 'browser') {
                            if (this._provider) this._provider.stop();
                            this._emitElectronNoKeyError(this._userCallbacks);
                            return;
                        }
                        if (this.diagnostics.internetAvailable) {
                            this.diagnostics.networkFailuresWhileOnline += 1;
                        }
                        if (this._tryLangFallback()) return;
                        this._retryNetwork(err);
                        return;
                    }
                    if (err === 'not-allowed' || err === 'service-not-allowed') {
                        this.diagnostics.recognitionState = 'error';
                        if (this._userCallbacks?.onError) this._userCallbacks.onError(err);
                        return;
                    }
                    if (this._userCallbacks?.onError) this._userCallbacks.onError(err);
                },
                onEnd: () => {
                    this._log('end', null);
                    if (!this._sessionActive || this._sttBlockedUntilKey) return;
                    if (this.diagnostics.recognitionState === 'retrying') return;
                    if (this.diagnostics.recognitionState === 'error') return;
                    if (this.diagnostics.isElectron && this.diagnostics.provider === 'browser') {
                        this.diagnostics.recognitionState = 'error';
                        return;
                    }
                    this.diagnostics.recognitionState = 'restarting';
                    this._log('restart', null);
                    setTimeout(() => {
                        if (this._sessionActive && this.diagnostics.recognitionState !== 'retrying') {
                            this._startProvider();
                        }
                    }, 180);
                }
            });
            this._log('success', { lang: lang });
        } catch (err) {
            this._log('error', String(err.message || err));
            if (this._sessionActive) this._retryNetwork('network');
        }
    },

    _tryLangFallback() {
        const preferred = this._recognitionLang();
        const chain = this._resolveLangChain(preferred);
        if (this._langFallbackIdx >= chain.length - 1) return false;

        this._langFallbackIdx += 1;
        const nextLang = chain[this._langFallbackIdx];
        this.diagnostics.recognitionState = 'lang_fallback';
        this._log('lang_fallback', { from: chain[this._langFallbackIdx - 1], to: nextLang });
        if (this.getProvider()) this.getProvider().stop();
        setTimeout(() => {
            if (this._sessionActive) this._startProvider();
        }, 120);
        return true;
    },

    _classifyNetworkFailure() {
        if (this.diagnostics.isElectron && this.diagnostics.provider === 'browser') {
            return 'electron_no_stt_key';
        }
        if (this.diagnostics.provider && this.diagnostics.provider !== 'browser') {
            return 'api_error';
        }
        if (this.diagnostics.internetAvailable && this._networkRetries >= this.MAX_NETWORK_RETRIES) {
            if (this.diagnostics.isElectron) {
                return 'electron_speech_provider_failure';
            }
        }
        return 'network';
    },

    _retryNetwork(errCode) {
        if (!this._sessionActive) return;

        if (this.diagnostics.isElectron && this.diagnostics.provider === 'browser') {
            this._sessionActive = false;
            if (this._provider) this._provider.stop();
            this._emitElectronNoKeyError(this._userCallbacks);
            return;
        }

        if (this._networkRetries >= this.MAX_NETWORK_RETRIES) {
            const classified = this._classifyNetworkFailure();
            this.diagnostics.classifiedError = classified;
            this.diagnostics.recognitionState = 'error';
            this.diagnostics.lastError = classified;
            this._log('retry', 'exhausted');
            if (this._userCallbacks?.onNetworkFailed) {
                this._userCallbacks.onNetworkFailed(this._networkRetries, classified);
            } else if (this._userCallbacks?.onError) {
                this._userCallbacks.onError(classified);
            }
            return;
        }

        const delay = this.NETWORK_RETRY_DELAYS[this._networkRetries] || 2000;
        this._networkRetries += 1;
        this.diagnostics.retryCount = this._networkRetries;
        this.diagnostics.recognitionState = 'retrying';
        this._log('retry', { attempt: this._networkRetries, delayMs: delay, code: errCode });

        if (this._userCallbacks?.onRetry) {
            this._userCallbacks.onRetry(this._networkRetries, this.MAX_NETWORK_RETRIES);
        }

        if (this.getProvider()) this.getProvider().stop();

        setTimeout(() => {
            if (this._sessionActive) {
                this.diagnostics.recognitionState = 'listening';
                this._startProvider();
            }
        }, delay);
    },

    stopListening() {
        this._sessionActive = false;
        this._networkRetries = 0;
        this._langFallbackIdx = 0;
        this.diagnostics.retryCount = 0;
        this._metrics.micOpened = false;
        if (this._provider) this._provider.stop();
        this.diagnostics.recognitionState = 'idle';
        this._log('stop', null);
        this._notifyDiagnostics();
    },

    speak(text, lang) {
        const code = lang || this._recognitionLang();
        const msg = String(text || '').trim();
        if (!msg) return Promise.resolve();
        this._ensureTtsReady();
        this._log('speak', { lang: code, len: msg.length, ttsReady: !!BrowserSpeechAdapter?.synthesis });
        if (typeof BrowserSpeechAdapter !== 'undefined' && BrowserSpeechAdapter.speak) {
            return BrowserSpeechAdapter.speak(msg, code);
        }
        const provider = this.getProvider();
        return provider && provider.speak ? provider.speak(msg, code) : Promise.resolve();
    },

    setLanguage(lang) {
        if (this._provider) this._provider.setLanguage(lang);
        this.diagnostics.currentLanguage = lang;
    },

    setProvider(name) {
        if (typeof MemoryManager !== 'undefined') {
            const s = MemoryManager.getSettings();
            s.speechProvider = name;
            MemoryManager.saveSettings(s);
        }
        this._provider = null;
        this._langFallbackIdx = 0;
        this.diagnostics.electronBrowserBlocked = false;
        const ok = this.init(true);
        if (ok && this._hasCloudSttKey()) this.clearSttBlock();
        return ok;
    },

    listProviders() {
        return this.PROVIDER_OPTIONS.map((p) => {
            const inst = this._resolveProvider(p.id);
            return {
                id: p.id,
                label: p.label,
                available: !!(inst && (inst.isSupported ? inst.isSupported() : true)),
                configured: inst && inst.isConfigured ? inst.isConfigured() : (p.id === 'browser')
            };
        });
    }
};

window.SpeechProviderManager = SpeechProviderManager;
