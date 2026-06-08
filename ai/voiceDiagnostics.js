/**
 * Voice diagnostics panel — AI Health / speech engine status.
 */
const VoiceDiagnostics = {
    _open: false,
    _testRunning: false,
    _lastTest: null,
    _lastDirectStt: null,

    init() {
        if (document.getElementById('voiceDiagnosticsPanel')) return;
        const host = document.getElementById('voiceAgentPanel');
        if (!host) return;

        const panel = document.createElement('div');
        panel.id = 'voiceDiagnosticsPanel';
        panel.className = 'voice-diagnostics-panel';
        panel.innerHTML = `
            <div class="voice-diagnostics-title">
                <i class="bi bi-heart-pulse me-1"></i> AI Voice Health
                <button type="button" class="btn btn-sm btn-link voice-diag-close" id="voiceDiagCloseBtn">&times;</button>
            </div>
            <div id="voiceDiagnosticsBody" class="voice-diagnostics-body"></div>
            <div class="voice-diagnostics-actions">
                <label class="voice-diag-provider-label">STT Provider</label>
                <select id="voiceProviderSelect" class="form-select form-select-sm voice-diag-select"></select>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceDirectSttBtn">
                    <i class="bi bi-soundwave"></i> Direct STT Test
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" id="voiceTestBtn">
                    <i class="bi bi-mic"></i> Test Voice
                </button>
            </div>
            <div id="voiceApiKeysSection" class="voice-api-keys"></div>
            <div id="voiceTestResults" class="voice-test-results"></div>
        `;
        host.querySelector('.voice-agent-body')?.insertBefore(panel, host.querySelector('.voice-agent-history'));

        document.getElementById('voiceDiagCloseBtn')?.addEventListener('click', () => this.toggle(false));
        document.getElementById('voiceTestBtn')?.addEventListener('click', () => this.runVoiceTest());
        document.getElementById('voiceDirectSttBtn')?.addEventListener('click', () => this.runDirectSttTest());
        document.getElementById('voiceProviderSelect')?.addEventListener('change', (e) => this._onProviderChange(e.target.value));
        this._buildProviderSelect();
        this._buildApiKeyFields();
        this.refresh();
    },

    _buildProviderSelect() {
        const sel = document.getElementById('voiceProviderSelect');
        if (!sel || typeof SpeechProviderManager === 'undefined') return;
        const list = SpeechProviderManager.listProviders();
        const cur = SpeechProviderManager.getDiagnostics().provider;
        sel.innerHTML = list.map((p) => {
            const status = p.configured ? '' : ' (needs API key)';
            const dis = p.id !== 'browser' && !p.configured ? ' disabled' : '';
            return `<option value="${p.id}"${p.id === cur ? ' selected' : ''}${dis}>${p.label}${status}</option>`;
        }).join('');
    },

    _buildApiKeyFields() {
        const el = document.getElementById('voiceApiKeysSection');
        if (!el) return;
        const s = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        el.innerHTML = `
            <div class="voice-api-keys-title">API Keys (stored locally)</div>
            <input type="password" id="voiceOpenaiKey" class="form-control form-control-sm mb-1" placeholder="OpenAI API key (Whisper)" value="${s.openaiApiKey ? '••••••••' : ''}">
            <input type="password" id="voiceDeepgramKey" class="form-control form-control-sm mb-1" placeholder="Deepgram API key" value="${s.deepgramApiKey ? '••••••••' : ''}">
            <input type="password" id="voiceGoogleKey" class="form-control form-control-sm mb-1" placeholder="Google Speech API key" value="${s.googleSpeechApiKey ? '••••••••' : ''}">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceSaveKeysBtn">Save Keys</button>
        `;
        document.getElementById('voiceSaveKeysBtn')?.addEventListener('click', () => this._saveApiKeys());
    },

    _saveApiKeys() {
        if (typeof MemoryManager === 'undefined') return;
        const s = MemoryManager.getSettings();
        const o = document.getElementById('voiceOpenaiKey')?.value || '';
        const d = document.getElementById('voiceDeepgramKey')?.value || '';
        const g = document.getElementById('voiceGoogleKey')?.value || '';
        if (o && !o.includes('••')) s.openaiApiKey = o.trim();
        if (d && !d.includes('••')) s.deepgramApiKey = d.trim();
        if (g && !g.includes('••')) s.googleSpeechApiKey = g.trim();
        MemoryManager.saveSettings(s);
        if (typeof SpeechProviderManager !== 'undefined') SpeechProviderManager.init();
        this._buildProviderSelect();
        this.refresh();
        if (typeof App !== 'undefined') App.showNotification('Voice API keys saved.', 'success');
    },

    _onProviderChange(name) {
        if (typeof SpeechProviderManager === 'undefined') return;
        SpeechProviderManager.setProvider(name);
        this._buildProviderSelect();
        this.refresh();
    },

    toggle(force) {
        this._open = typeof force === 'boolean' ? force : !this._open;
        const panel = document.getElementById('voiceDiagnosticsPanel');
        if (panel) panel.classList.toggle('open', this._open);
        if (this._open) {
            this._buildProviderSelect();
            this.refresh();
        }
    },

    getLastTestResult() {
        return this._lastTest;
    },

    getVoiceStatus() {
        if (this._testRunning) return { level: 'warning', label: 'Testing…' };
        if (typeof SpeechProviderManager === 'undefined') {
            return { level: 'error', label: 'Unavailable' };
        }
        const d = SpeechProviderManager.getDiagnostics();
        if (d.classifiedError === 'electron_speech_provider_failure') {
            return { level: 'error', label: 'Electron STT blocked' };
        }
        if (d.recognitionState === 'error' || d.microphoneAvailable === false) {
            return { level: 'error', label: d.classifiedError || d.lastError || 'Error' };
        }
        if (d.recognitionState === 'retrying' || !d.internetAvailable) {
            return { level: 'warning', label: d.internetAvailable ? 'Retrying' : 'Offline' };
        }
        if (this._lastDirectStt?.sttPass || (this._lastTest && this._lastTest.sttSuccess)) {
            return { level: 'healthy', label: 'OK' };
        }
        if (d.isElectron && d.provider === 'browser') {
            return { level: 'warning', label: 'Use Whisper/Deepgram' };
        }
        return { level: 'healthy', label: d.recognitionState || 'Ready' };
    },

    /** Direct SpeechRecognition test — bypasses AI Brain */
    async runDirectSttTest() {
        if (this._testRunning) return this._lastDirectStt;
        this._testRunning = true;
        const resultsEl = document.getElementById('voiceTestResults');
        const btn = document.getElementById('voiceDirectSttBtn');
        if (btn) btn.disabled = true;
        if (resultsEl) {
            resultsEl.innerHTML = '<div class="voice-test-running">Direct STT test — speak now (8s)…</div>';
            resultsEl.classList.add('visible');
        }

        const t0 = Date.now();
        let transcript = '';
        let sttPass = false;
        let errorCode = null;
        const provider = SpeechProviderManager?.getDiagnostics()?.provider || 'browser';

        try {
            transcript = await this._directRecord(8);
            sttPass = transcript.length > 0;
        } catch (e) {
            errorCode = String(e.message || e);
        }

        const duration = Date.now() - t0;
        this._lastDirectStt = {
            transcript,
            sttPass,
            sttFail: !sttPass,
            errorCode,
            provider,
            micOpen: true,
            recognitionDurationMs: duration,
            at: new Date().toISOString()
        };
        this._testRunning = false;
        if (btn) btn.disabled = false;
        this._renderDirectSttResults(this._lastDirectStt);
        this.refresh();
        return this._lastDirectStt;
    },

    _directRecord(seconds) {
        return new Promise((resolve, reject) => {
            let text = '';
            let settled = false;
            let errorSeen = null;
            const finish = () => {
                if (settled) return;
                settled = true;
                if (typeof SpeechProviderManager !== 'undefined') {
                    SpeechProviderManager.stopListening();
                }
                if (errorSeen && !text) reject(new Error(errorSeen));
                else resolve(text.trim());
            };

            if (typeof SpeechProviderManager === 'undefined') {
                finish();
                return;
            }

            try {
                SpeechProviderManager.startListening({
                    onResult: (payload) => {
                        const chunk = payload.final || payload.interim || '';
                        if (chunk) text = chunk;
                        if (payload.isFinal && payload.final) text = payload.final;
                    },
                    onError: (err) => {
                        errorSeen = err;
                        if (err === 'electron_speech_provider_failure' || err === 'network') finish();
                    },
                    onNetworkFailed: (_n, classified) => {
                        errorSeen = classified || 'network';
                        finish();
                    }
                });
            } catch (e) {
                reject(e);
                return;
            }

            setTimeout(finish, (seconds || 8) * 1000);
        });
    },

    _renderDirectSttResults(r) {
        const el = document.getElementById('voiceTestResults');
        if (!el || !r) return;
        const sttCls = r.sttPass ? 'text-success' : 'text-danger';
        const verdict = r.sttPass ? 'STT PASS' : 'STT FAIL';
        el.innerHTML = `
            <div class="voice-test-title">Direct STT Test (no AI Brain)</div>
            <div class="voice-diag-row"><span>Verdict</span><strong class="${sttCls}">${verdict}</strong></div>
            <div class="voice-diag-row"><span>Raw Transcript</span><strong>${r.transcript || '—'}</strong></div>
            <div class="voice-diag-row"><span>Provider</span><strong>${r.provider}</strong></div>
            <div class="voice-diag-row"><span>Mic Open</span><strong>${r.micOpen ? 'Yes' : 'No'}</strong></div>
            <div class="voice-diag-row"><span>Recognition Duration</span><strong>${r.recognitionDurationMs} ms</strong></div>
            ${r.errorCode ? `<div class="voice-diag-row"><span>Error</span><strong class="text-danger">${r.errorCode}</strong></div>` : ''}
        `;
        el.classList.add('visible');
    },

    async runVoiceTest() {
        if (this._testRunning) return this._lastTest;
        this._testRunning = true;
        const resultsEl = document.getElementById('voiceTestResults');
        const btn = document.getElementById('voiceTestBtn');
        if (btn) btn.disabled = true;
        if (resultsEl) {
            resultsEl.innerHTML = '<div class="voice-test-running">Recording 5 seconds… speak now.</div>';
            resultsEl.classList.add('visible');
        }

        const t0 = Date.now();
        let transcript = '';
        let sttSuccess = false;
        let ttsSuccess = false;
        let provider = 'browser';
        let sttLatency = 0;
        let ttsLatency = 0;

        try {
            if (typeof SpeechProviderManager !== 'undefined') {
                provider = SpeechProviderManager.getDiagnostics().provider || 'browser';
            }

            transcript = await this._recordSeconds(5);
            sttLatency = Date.now() - t0;
            sttSuccess = transcript.length > 0;

            const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
            const reply = lang === 'ta'
                ? (sttSuccess ? 'குரல் சோதனை வெற்றி.' : 'ஒலி கண்டறியப்படவில்லை.')
                : (sttSuccess ? 'Voice test successful.' : 'No speech detected.');

            const ttsStart = Date.now();
            if (typeof SpeechEngine !== 'undefined') {
                await SpeechEngine.speak(reply);
                ttsSuccess = true;
            } else if (typeof NotificationAgent !== 'undefined') {
                await NotificationAgent.speak(reply);
                ttsSuccess = true;
            }
            ttsLatency = Date.now() - ttsStart;
        } catch (err) {
            console.warn('[VoiceDiagnostics] test failed', err);
        }

        const d = typeof SpeechProviderManager !== 'undefined' ? SpeechProviderManager.getDiagnostics() : {};
        this._lastTest = {
            transcript,
            sttSuccess,
            ttsSuccess,
            provider,
            sttLatencyMs: sttLatency,
            ttsLatencyMs: ttsLatency,
            totalLatencyMs: Date.now() - t0,
            avgLatencyMs: d.avgLatencyMs || 0,
            micOpen: d.micOpen,
            classifiedError: d.classifiedError,
            at: new Date().toISOString()
        };
        this._testRunning = false;
        if (btn) btn.disabled = false;
        this._renderTestResults(this._lastTest);
        this.refresh();
        return this._lastTest;
    },

    _recordSeconds(seconds) {
        return new Promise((resolve) => {
            let text = '';
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                if (typeof SpeechProviderManager !== 'undefined') {
                    SpeechProviderManager.stopListening();
                }
                resolve(text.trim());
            };

            if (typeof SpeechProviderManager === 'undefined') {
                finish();
                return;
            }

            try {
                SpeechProviderManager.startListening({
                    onResult: (payload) => {
                        const chunk = payload.final || payload.interim || '';
                        if (chunk) text = chunk;
                        if (payload.isFinal && payload.final) text = payload.final;
                    },
                    onError: () => finish(),
                    onNetworkFailed: () => finish()
                });
            } catch (_) {
                finish();
                return;
            }

            setTimeout(finish, (seconds || 5) * 1000);
        });
    },

    _renderTestResults(r) {
        const el = document.getElementById('voiceTestResults');
        if (!el || !r) return;
        const sttCls = r.sttSuccess ? 'text-success' : 'text-danger';
        const ttsCls = r.ttsSuccess ? 'text-success' : 'text-danger';
        el.innerHTML = `
            <div class="voice-test-title">Last Voice Test</div>
            <div class="voice-diag-row"><span>Transcript</span><strong>${r.transcript || '—'}</strong></div>
            <div class="voice-diag-row"><span>STT Success</span><strong class="${sttCls}">${r.sttSuccess ? 'Yes' : 'No'}</strong></div>
            <div class="voice-diag-row"><span>TTS Success</span><strong class="${ttsCls}">${r.ttsSuccess ? 'Yes' : 'No'}</strong></div>
            <div class="voice-diag-row"><span>Provider</span><strong>${r.provider}</strong></div>
            <div class="voice-diag-row"><span>STT Latency</span><strong>${r.sttLatencyMs} ms</strong></div>
            <div class="voice-diag-row"><span>TTS Latency</span><strong>${r.ttsLatencyMs} ms</strong></div>
            <div class="voice-diag-row"><span>Avg Latency</span><strong>${r.avgLatencyMs || 0} ms</strong></div>
            ${r.classifiedError ? `<div class="voice-diag-row"><span>Classified</span><strong class="text-danger">${r.classifiedError}</strong></div>` : ''}
        `;
        el.classList.add('visible');
    },

    refresh() {
        const body = document.getElementById('voiceDiagnosticsBody');
        if (!body || typeof SpeechProviderManager === 'undefined') return;

        const report = SpeechProviderManager.getDiagnosticReport();
        const d = SpeechProviderManager.getDiagnostics();
        const stateCls = d.recognitionState === 'error' ? 'text-danger'
            : d.recognitionState === 'retrying' ? 'text-warning' : 'text-success';
        const errLabel = d.classifiedError === 'electron_speech_provider_failure'
            ? 'ELECTRON_SPEECH_PROVIDER_FAILURE'
            : (d.lastError || '—');

        body.innerHTML = `
            <div class="voice-diag-section">Voice Diagnostic Report</div>
            <div class="voice-diag-row"><span>Provider Name</span><strong>${report.providerName}</strong></div>
            <div class="voice-diag-row"><span>Recognition Available</span><strong>${report.recognitionAvailable ? 'Yes' : 'No'}</strong></div>
            <div class="voice-diag-row"><span>Microphone Permission</span><strong>${report.microphonePermission || '…'}</strong></div>
            <div class="voice-diag-row"><span>Microphone</span><strong>${report.microphoneAvailable === null ? '…' : (report.microphoneAvailable ? 'Yes' : 'No')}</strong></div>
            <div class="voice-diag-row"><span>Internet Status</span><strong>${report.internetStatus}</strong></div>
            <div class="voice-diag-row"><span>Current Language</span><strong>${report.currentLanguage}</strong></div>
            <div class="voice-diag-row"><span>Electron Version</span><strong>${report.electronVersion || 'n/a'}</strong></div>
            <div class="voice-diag-row"><span>Chromium Version</span><strong>${report.chromiumVersion || 'n/a'}</strong></div>
            <div class="voice-diag-row"><span>Recognition State</span><strong class="${stateCls}">${d.recognitionState}</strong></div>
            <div class="voice-diag-row"><span>Last Error</span><strong class="${d.classifiedError ? 'text-danger' : ''}">${errLabel}</strong></div>
            <div class="voice-diag-row"><span>Lang Fallback</span><strong>${d.langFallbackIndex || 0}</strong></div>
            <div class="voice-diag-row"><span>Retry Count</span><strong>${d.retryCount} / ${SpeechProviderManager.MAX_NETWORK_RETRIES}</strong></div>
            <div class="voice-diag-row"><span>Mic Open</span><strong>${d.micOpen ? 'Yes' : 'No'}</strong></div>
            <div class="voice-diag-row"><span>Transcript Received</span><strong>${d.transcriptReceived ? 'Yes' : 'No'}</strong></div>
            <div class="voice-diag-row"><span>Avg Latency</span><strong>${d.avgLatencyMs || 0} ms</strong></div>
            ${d.isElectron && d.provider === 'browser' ? '<div class="voice-diag-alert">Browser STT does not work reliably in Electron. Switch to OpenAI Whisper or Deepgram and add an API key below.</div>' : ''}
        `;
    },

    _inputModeLabel() {
        const s = typeof MemoryManager !== 'undefined' ? MemoryManager.getSettings() : {};
        const m = s.speechInputLang || 'auto';
        if (m === 'ta') return 'Tamil (ta-IN)';
        if (m === 'en') return 'English (en-IN)';
        return 'Auto (en-IN default)';
    }
};

window.VoiceDiagnostics = VoiceDiagnostics;
