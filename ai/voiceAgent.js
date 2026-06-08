/**
 * MJS Prime Logic — Voice ERP Agent V2.1
 */
const VoiceAgent = {
    isListening: false,
    isProcessing: false,
    _finalTranscript: '',
    _pttActive: false,
    _silenceTimer: null,
    _maxListenTimer: null,
    _micFatalError: null,

    async init() {
        ContextManager.loadFromMemory();
        ConversationHistory.init();
        const ok = SpeechEngine.init();
        if (!ok && typeof App !== 'undefined') {
            App.showNotification('Voice recognition is not supported in this browser.', 'warning');
        }
        const s = MemoryManager.getSettings();
        if (!s.silenceTimeoutMs || s.silenceTimeoutMs < 15000) {
            s.silenceTimeoutMs = 18000;
            MemoryManager.saveSettings(s);
        }
        this._buildUI();
        this._wireMicButton();
        this._updateLangBadge();
        this._seedWelcome();
        console.log('[VoiceAgent] Initialized.');
    },

    _seedWelcome() {
        if (ConversationHistory.getRecent(1).length) return;
        const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'ta';
        const msg = lang === 'ta'
            ? 'வணக்கம்! Text box-ல் type செய்யுங்கள் (எப்போதும் வேலை செய்யும்). Voice-க்கு internet + mic வேண்டும். உதா: "help" அல்லது "Avon outstanding evlo".'
            : 'Hello! Type in the box below (always works). Voice needs internet + mic. Try "help" or "outstanding of Avon".';
        ConversationHistory.add('assistant', msg, { success: true });
    },

    _buildUI() {
        const staleOverlay = document.getElementById('voiceAgentOverlay');
        if (staleOverlay) staleOverlay.remove();
        const stalePanel = document.getElementById('voiceAgentPanel');
        if (stalePanel) stalePanel.remove();

        const panel = document.createElement('div');
        panel.id = 'voiceAgentPanel';
        panel.className = 'voice-agent-panel';
        panel.innerHTML = `
            <div class="voice-agent-header">
                <span><i class="bi bi-chat-dots-fill me-2"></i>Voice ERP Assistant</span>
                <div class="voice-agent-header-actions">
                    <span class="voice-agent-lang-badge" id="voiceAgentLangBadge" title="Tap: Auto / EN / Tamil input">Auto</span>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceAgentHealthBtn" title="Voice health diagnostics">
                        <i class="bi bi-heart-pulse"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="voiceAgentTestBtn" title="Test voice (5s mic + TTS)">
                        <i class="bi bi-mic"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceAgentModeBtn" title="Listen mode">
                        <i class="bi bi-hand-index-thumb"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceAgentFullscreenBtn" title="Full screen">
                        <i class="bi bi-arrows-fullscreen"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" id="voiceAgentCloseBtn">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </div>
            <div class="voice-agent-body">
                <div class="voice-agent-history open" id="voiceAgentHistory">
                    <div class="voice-agent-history-title">உரையாடல் / Conversation</div>
                    <div id="voiceAgentHistoryList"></div>
                </div>
                <div class="voice-agent-status" id="voiceAgentStatus">Type a message below or tap the red mic</div>
                <div class="voice-agent-transcript" id="voiceAgentTranscript"></div>
                <div class="voice-agent-options" id="voiceAgentOptions"></div>
                <div class="voice-agent-input-row">
                    <button type="button" class="btn btn-danger btn-sm voice-agent-mic-btn" id="voiceAgentMicBtn" title="Start / stop voice">
                        <i class="bi bi-mic-fill"></i>
                    </button>
                    <input type="text" id="voiceAgentManualInput" class="form-control form-control-sm"
                        placeholder="Type here — Tamil / English / Tanglish…" autocomplete="off">
                    <button type="button" class="btn btn-primary btn-sm" id="voiceAgentSendBtn" title="Send">
                        <i class="bi bi-send"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('voiceAgentCloseBtn').addEventListener('click', () => this.closePanel());
        document.getElementById('voiceAgentFullscreenBtn').addEventListener('click', () => this._toggleFullscreen());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isListening) this.stopListening(false);
                else this.closePanel();
            }
        });
        document.getElementById('voiceAgentModeBtn').addEventListener('click', () => this._toggleListenMode());
        document.getElementById('voiceAgentHealthBtn').addEventListener('click', () => {
            if (typeof VoiceDiagnostics !== 'undefined') VoiceDiagnostics.toggle();
        });
        document.getElementById('voiceAgentTestBtn').addEventListener('click', () => {
            if (typeof VoiceDiagnostics !== 'undefined') {
                VoiceDiagnostics.toggle(true);
                void VoiceDiagnostics.runVoiceTest();
            }
        });
        document.getElementById('voiceAgentLangBadge').addEventListener('click', () => {
            if (typeof LanguageEngine !== 'undefined') {
                LanguageEngine.cycleSpeechInputMode();
                this._updateLangBadge();
            }
        });
        if (typeof VoiceDiagnostics !== 'undefined') VoiceDiagnostics.init();
        document.getElementById('voiceAgentSendBtn').addEventListener('click', () => this._submitManual());
        document.getElementById('voiceAgentMicBtn').addEventListener('click', () => {
            if (this.isListening) this.stopListening(true);
            else this.startListening();
        });
        document.getElementById('voiceAgentManualInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._submitManual();
            }
        });

        ConversationHistory._renderPanel();
        this._updateModeButton();
    },

    _wireMicButton() {
        const btn = document.getElementById('globalAIBtn');
        if (!btn) return;

        btn.title = 'Open Voice ERP Assistant (double-click for Command Center)';
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'bi bi-chat-dots-fill';

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const panel = document.getElementById('voiceAgentPanel');
            if (panel && panel.classList.contains('open')) {
                if (this.isListening) this.stopListening(false);
                this.closePanel();
            } else {
                this.openPanel();
            }
        });

        newBtn.addEventListener('mousedown', (e) => {
            if (MemoryManager.getSettings().listenMode !== 'push_to_talk') return;
            if (e.button !== 0) return;
            this._pttActive = true;
            this.openPanel();
            this.startListening();
        });
        newBtn.addEventListener('mouseup', () => {
            if (!this._pttActive) return;
            this._pttActive = false;
            this.stopListening(true);
        });
    },

    openPanel() {
        const panel = document.getElementById('voiceAgentPanel');
        if (!panel) return;
        panel.classList.add('open');
        const input = document.getElementById('voiceAgentManualInput');
        if (input) setTimeout(() => input.focus(), 120);
        ConversationHistory._renderPanel();
    },

    closePanel() {
        this.stopListening(false);
        this._exitFullscreen();
        const panel = document.getElementById('voiceAgentPanel');
        if (panel) panel.classList.remove('open', 'listening');
    },

    _toggleFullscreen() {
        const panel = document.getElementById('voiceAgentPanel');
        if (!panel) return;
        if (panel.classList.contains('fullscreen')) this._exitFullscreen();
        else this._enterFullscreen();
    },

    _enterFullscreen() {
        document.getElementById('voiceAgentPanel')?.classList.add('fullscreen');
        this._updateFullscreenButton(true);
    },

    _exitFullscreen() {
        const panel = document.getElementById('voiceAgentPanel');
        if (!panel || !panel.classList.contains('fullscreen')) return;
        panel.classList.remove('fullscreen');
        this._updateFullscreenButton(false);
    },

    _updateFullscreenButton(isFullscreen) {
        const btn = document.getElementById('voiceAgentFullscreenBtn');
        if (!btn) return;
        btn.innerHTML = isFullscreen
            ? '<i class="bi bi-arrows-angle-contract"></i>'
            : '<i class="bi bi-arrows-fullscreen"></i>';
    },

    _toggleListenMode() {
        const s = MemoryManager.getSettings();
        const order = ['tap', 'push_to_talk', 'continuous'];
        s.listenMode = order[(order.indexOf(s.listenMode) + 1) % order.length];
        s.continuous = s.listenMode !== 'push_to_talk';
        MemoryManager.saveSettings(s);
        this._updateModeButton();
        const sec = Math.round(this._silenceTimeoutMs() / 1000);
        const hints = {
            tap: `Tap red mic — sends after ${sec}s pause`,
            push_to_talk: 'Hold floating mic while speaking',
            continuous: 'Continuous — tap red mic to start/stop'
        };
        this._setStatus(hints[s.listenMode] || hints.tap);
    },

    _updateModeButton() {
        const btn = document.getElementById('voiceAgentModeBtn');
        if (!btn) return;
        const mode = MemoryManager.getSettings().listenMode;
        if (mode === 'continuous') btn.innerHTML = '<i class="bi bi-broadcast"></i>';
        else if (mode === 'push_to_talk') btn.innerHTML = '<i class="bi bi-hand-index-thumb"></i>';
        else btn.innerHTML = '<i class="bi bi-mic"></i>';
    },

    _updateLangBadge() {
        const el = document.getElementById('voiceAgentLangBadge');
        if (!el || typeof LanguageEngine === 'undefined') return;
        el.textContent = LanguageEngine.getSpeechInputModeLabel();
        el.title = 'Input: ' + LanguageEngine.getSpeechInputMode() + ' — tap to cycle Auto / EN / Tamil';
    },

    _silenceTimeoutMs() {
        const ms = Number(MemoryManager.getSettings().silenceTimeoutMs);
        return ms > 0 ? ms : 18000;
    },

    _clearListenTimers() {
        if (this._silenceTimer) clearTimeout(this._silenceTimer);
        if (this._maxListenTimer) clearTimeout(this._maxListenTimer);
        this._silenceTimer = null;
        this._maxListenTimer = null;
    },

    _armSilenceTimer() {
        this._clearListenTimers();
        const ms = this._silenceTimeoutMs();
        this._silenceTimer = setTimeout(() => {
            if (this.isListening) {
                if (typeof SpeechProviderManager !== 'undefined') SpeechProviderManager._log('timeout', { ms });
                this.stopListening(true);
            }
        }, ms);
        this._maxListenTimer = setTimeout(() => {
            if (this.isListening) this.stopListening(true);
        }, Math.max(ms * 4, 120000));
    },

    _handleMicFatal(err, retriesDone) {
        if (this._micFatalError) return;
        this._micFatalError = err;
        const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'ta';
        const classified = typeof SpeechProviderManager !== 'undefined'
            ? SpeechProviderManager.getDiagnostics().classifiedError
            : null;
        const code = classified || err;
        let msg;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
            msg = lang === 'ta'
                ? 'Mic permission இல்லை — Windows Settings → Privacy → Microphone. Text box use செய்யுங்கள்.'
                : 'Microphone blocked — allow mic in Windows settings. Use the text box.';
        } else if (code === 'electron_speech_provider_failure') {
            msg = lang === 'ta'
                ? 'Electron-ல் Browser Speech STT வேலை செய்யாது. Voice Health → Deepgram/Whisper தேர்வு செய்து API key சேர்க்கவும்.'
                : 'Browser Speech STT is blocked in Electron. Switch to Deepgram or Whisper in Voice Health and add an API key.';
        } else if (code === 'api_error') {
            msg = lang === 'ta'
                ? 'Deepgram API error — Voice Health-ல் provider/key சரி பாருங்கள். App restart செய்யுங்கள்.'
                : 'Speech API error — check Deepgram key in Voice Health and restart the app.';
        } else if (err === 'no-api-key') {
            msg = lang === 'ta'
                ? 'API key இல்லை — Voice Health panel-ல் OpenAI/Deepgram key சேர்க்கவும்.'
                : 'No API key — add OpenAI or Deepgram key in Voice Health panel.';
        } else if (err === 'csp_blocked') {
            msg = lang === 'ta'
                ? 'Deepgram API CSP-ஆல் block ஆகிறது — app restart செய்யுங்கள் (index.html CSP update).'
                : 'Speech API blocked by security policy — restart the app to load the updated CSP.';
        } else {
            msg = lang === 'ta'
                ? `Voice STT failed (${retriesDone || 3} retries). Voice Health பாருங்கள். Text box வேலை செய்யும்.`
                : `Voice STT failed after ${retriesDone || 3} retries. Check Voice Health panel. Text box still works.`;
        }
        console.warn('[VoiceAgent] mic stopped after retries:', code);
        this.stopListening(false);
        this._setStatus(msg);
        ConversationHistory.add('assistant', msg, { success: false });
        if (typeof App !== 'undefined') App.showNotification(msg, 'warning');
        document.getElementById('voiceAgentManualInput')?.focus();
    },

    startListening() {
        if (this.isListening || this.isProcessing) return;
        this.openPanel();
        this.isListening = true;
        this._micFatalError = null;
        this._finalTranscript = '';
        this._setMicState('listening');
        this._setPanelListening(true);
        const sec = Math.round(this._silenceTimeoutMs() / 1000);
        this._setStatus(`Listening… (${sec}s pause to send)`);
        this._setTranscript('');
        this._armSilenceTimer();
        this._beginRecognition();
    },

    _beginRecognition() {
        if (!this.isListening) return;
        try {
            SpeechEngine.startListening({
                onOfflineWarning: () => {
                    const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
                    const msg = lang === 'ta'
                        ? 'Internet இல்லை — voice recognition fail ஆகலாம். Mic தொடரும்; text box use செய்யலாம்.'
                        : 'Internet unavailable. Voice recognition may fail. Mic stays open; you can type.';
                    this._setStatus(msg);
                    if (typeof App !== 'undefined') App.showNotification(msg, 'warning');
                },
                onRetry: (attempt, max) => {
                    this._setStatus(`Reconnecting voice… (${attempt}/${max})`);
                },
                onNetworkFailed: (attempts, classified) => {
                    this._handleMicFatal(classified || 'network', attempts);
                },
                onResult: ({ interim, final, isFinal }) => {
                    const chunk = (final || interim || '').trim();
                    if (chunk && typeof LanguageEngine !== 'undefined') {
                        LanguageEngine.detect(chunk);
                        SpeechEngine.setResponseLanguage(LanguageEngine.getResponseLang());
                        this._updateLangBadge();
                    }
                    const combined = (this._finalTranscript + ' ' + (final || interim || '')).trim();
                    if (interim || final) {
                        this._setTranscript(combined);
                        this._armSilenceTimer();
                        const sec = Math.round(this._silenceTimeoutMs() / 1000);
                        this._setStatus(`Listening… (${sec}s pause to send)`);
                    }
                    if (isFinal && final) {
                        this._finalTranscript = (this._finalTranscript + ' ' + final).trim();
                        this._setTranscript(this._finalTranscript);
                        this._armSilenceTimer();
                    }
                },
                onError: (err) => {
                    if (err === 'no-speech' || err === 'aborted' || err === 'network') return;
                    if (err === 'not-allowed' || err === 'service-not-allowed') {
                        this._handleMicFatal(err, 0);
                    }
                }
            });
        } catch (err) {
            console.error('[VoiceAgent] mic start:', err);
            this._setStatus('Mic unavailable — type your message below');
            this.stopListening(false);
        }
    },

    stopListening(processTranscript = false) {
        const transcript = (this._finalTranscript || '').trim();
        const wasListening = this.isListening;
        this.isListening = false;
        this._micFatalError = null;
        this._clearListenTimers();
        if (wasListening) SpeechEngine.stopListening();
        this._setMicState('idle');
        this._setPanelListening(false);

        if (processTranscript && transcript && !this.isProcessing) {
            void this.processText(transcript);
        } else if (processTranscript && !transcript && !this.isProcessing) {
            this._setStatus('No speech heard — type below or tap mic again');
            this._setTranscript('');
        } else if (!this.isProcessing) {
            this._setStatus('Type a message below or tap the red mic');
            this._setTranscript('');
        }
    },

    async _submitManual() {
        const input = document.getElementById('voiceAgentManualInput');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';
        if (this.isListening) this.stopListening(false);
        await this.processText(text);
    },

    async processText(text) {
        if (!text || this.isProcessing) return;
        this.isProcessing = true;
        this.openPanel();
        this._clearClarify();

        if (typeof LanguageEngine !== 'undefined') {
            LanguageEngine.detect(text);
            SpeechEngine.setResponseLanguage(LanguageEngine.getResponseLang());
            this._updateLangBadge();
        }

        ConversationHistory.add('user', text);
        const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
        this._setStatus(lang === 'ta' ? 'செயல்படுத்துகிறது…' : 'Processing…');

        try {
            let turn;
            if (typeof VoiceEngine !== 'undefined' && VoiceEngine.processTranscript) {
                turn = await VoiceEngine.processTranscript(text);
            } else if (typeof AIBrain !== 'undefined' && AIBrain.processTurn) {
                turn = await AIBrain.processTurn(text);
            } else {
                const parsed = IntentEngine.parse(text);
                turn = { ok: true, result: await CommandRouter.route(parsed), reasoning: { intent: parsed.intent } };
            }

            const result = turn.result || {};
            let msg = result.message
                || (typeof AIBrain !== 'undefined' && AIBrain.formatResult ? AIBrain.formatResult(result) : null)
                || (lang === 'ta' ? 'முடிக்க முடியல.' : 'Could not complete request.');

            if (/^help$/i.test(text.trim()) && typeof NotificationAgent !== 'undefined') {
                msg = NotificationAgent.getHelpText();
            }

            const needClarify = result.needClarify === true || result.needConfirm === true;
            const success = turn.ok !== false && result.success !== false && !needClarify;

            const clarifyType = needClarify ? this._inferClarifyType(result) : null;
            const clarifyData = needClarify ? this._clarifyData(result) : null;

            let historyMsg = msg;
            let statusMsg = msg;
            let speakMsg = msg;

            if (needClarify && typeof NotificationAgent !== 'undefined') {
                if (NotificationAgent.formatClarifySummary) {
                    historyMsg = NotificationAgent.formatClarifySummary(clarifyType, clarifyData);
                }
                statusMsg = lang === 'ta' ? 'கீழே option தேர்வு செய்யுங்கள்' : 'Choose an option below';
                if (NotificationAgent.formatClarifySpeak) {
                    speakMsg = NotificationAgent.formatClarifySpeak(clarifyType, clarifyData);
                }
            }

            ConversationHistory.add('assistant', historyMsg, {
                intent: turn.reasoning && turn.reasoning.intent,
                success: success,
                needClarify: needClarify
            });
            this._setStatus(statusMsg);
            this._setTranscript('');
            if (needClarify) this._showClarifyOptions(result);

            if (typeof App !== 'undefined') {
                const toast = needClarify ? statusMsg : (msg.length > 100 ? msg.slice(0, 100) + '…' : msg);
                App.showNotification(toast, success ? 'success' : 'warning');
            }

            if (needClarify) {
                await this._speak(speakMsg);
            } else {
                await this._speak(msg);
                if (success && typeof SpeechProviderManager !== 'undefined') {
                    SpeechProviderManager._log('success', { intent: turn.reasoning?.intent });
                }
            }
        } catch (err) {
            console.error('[VoiceAgent]', err);
            const msg = err.message || 'Error processing request';
            ConversationHistory.add('assistant', msg, { success: false });
            this._setStatus(msg);
            await this._speak(msg);
        } finally {
            this.isProcessing = false;
        }
    },

    async _speak(text) {
        const raw = String(text || '').trim();
        if (!raw || typeof SpeechEngine === 'undefined') return;
        const msg = raw.length > 420 ? raw.slice(0, 417) + '…' : raw;

        if (this.isListening) this.stopListening(false);
        if (typeof SpeechProviderManager !== 'undefined' && SpeechProviderManager._sessionActive) {
            SpeechProviderManager.stopListening();
        }

        await new Promise((r) => setTimeout(r, 200));

        try {
            const t0 = Date.now();
            await SpeechEngine.speak(msg);
            console.log('[VoiceAgent] TTS done', { ms: Date.now() - t0, len: msg.length });
        } catch (e) {
            console.warn('[VoiceAgent] TTS:', e);
        }
    },

    _inferClarifyType(result) {
        const pending = typeof ContextManager !== 'undefined' ? ContextManager.getPendingClarify() : null;
        const state = result.state || pending?.state;
        const field = pending?.field || 'employee';
        const intent = pending?.intent || '';
        const hasCandidates = (result.candidates?.length || pending?.candidates?.length) > 0;

        if (result.needConfirm === true && result.needClarify !== true) {
            return 'destructive_confirm';
        }
        if (state === 'need_pick') {
            return field === 'customer' ? 'customer_need_pick' : 'employee_need_pick';
        }
        if (state === 'need_confirm') return 'employee_need_confirm';
        if (field === 'customer') {
            if (/last_invoice|last invoice/i.test(intent)) return 'customer_need_last_invoice';
            if (/invoice_list/i.test(intent)) return 'customer_need_invoice_list';
            if (hasCandidates && result.query) return 'customer_not_found';
            return 'customer_need_name';
        }
        if (hasCandidates && result.query) return 'employee_not_found';
        return 'employee_need_name';
    },

    _clarifyData(result) {
        const pending = typeof ContextManager !== 'undefined' ? ContextManager.getPendingClarify() : null;
        const candidates = result.candidates || pending?.candidates || [];
        const tentative = result.tentative || pending?.tentative || candidates[0];
        const name = tentative
            ? (typeof tentative === 'string' ? tentative : tentative.name)
            : null;
        return {
            name,
            query: result.query || null,
            candidates,
            suggestions: candidates.map((c) => (typeof c === 'string' ? c : c.name))
        };
    },

    _showClarifyOptions(result) {
        const el = document.getElementById('voiceAgentOptions');
        if (!el) return;

        const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
        const pending = typeof ContextManager !== 'undefined' ? ContextManager.getPendingClarify() : null;
        const state = result.state || pending?.state;
        const isDestructiveConfirm = result.needConfirm === true && result.needClarify !== true;
        const isNeedConfirm = state === 'need_confirm' || isDestructiveConfirm;
        const candidates = result.candidates || pending?.candidates || [];
        const tentative = result.tentative || pending?.tentative || candidates[0];

        el.innerHTML = '';
        el.classList.remove('visible');

        if (isNeedConfirm) {
            const name = tentative
                ? (typeof tentative === 'string' ? tentative : tentative.name)
                : null;
            const yesLabel = lang === 'ta' ? 'ஆம்' : 'Yes';
            const noLabel = lang === 'ta' ? 'இல்லை' : 'No';
            el.innerHTML = `
                <div class="voice-option-confirm">
                    ${name ? `<div class="voice-option-card voice-option-highlight">
                        <span class="voice-option-label">${this._escHtml(name)}</span>
                    </div>` : ''}
                    <div class="voice-option-actions">
                        <button type="button" class="voice-option-btn voice-option-yes" data-text="yes">${yesLabel}</button>
                        <button type="button" class="voice-option-btn voice-option-no" data-text="no">${noLabel}</button>
                    </div>
                </div>`;
            el.classList.add('visible');
            this._wireOptionButtons(el);
            return;
        }

        if (!candidates.length) {
            el.classList.remove('visible');
            return;
        }

        const cards = candidates.map((c, i) => {
            const name = typeof c === 'string' ? c : c.name;
            const sub = c && typeof c === 'object' && c.id ? c.id : '';
            return `<button type="button" class="voice-option-card" data-text="${this._escAttr(name)}">
                <span class="voice-option-num">${i + 1}</span>
                <span class="voice-option-label">${this._escHtml(name)}</span>
                ${sub ? `<span class="voice-option-sub">${this._escHtml(sub)}</span>` : ''}
            </button>`;
        }).join('');

        el.innerHTML = `<div class="voice-option-grid">${cards}</div>`;
        el.classList.add('visible');
        this._wireOptionButtons(el);
    },

    _wireOptionButtons(container) {
        container.querySelectorAll('[data-text]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const t = btn.getAttribute('data-text');
                if (t) void this.processText(t);
            });
        });
    },

    _escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    },

    _clearClarify() {
        const el = document.getElementById('voiceAgentOptions');
        if (el) {
            el.innerHTML = '';
            el.classList.remove('visible');
        }
    },

    _setMicState(state) {
        const btn = document.getElementById('globalAIBtn');
        if (!btn) return;
        btn.classList.toggle('listening', state === 'listening');
        const icon = btn.querySelector('i');
        if (icon) icon.className = state === 'listening' ? 'bi bi-mic-fill' : 'bi bi-chat-dots-fill';
    },

    _setPanelListening(listening) {
        document.getElementById('voiceAgentPanel')?.classList.toggle('listening', listening);
        document.getElementById('voiceAgentMicBtn')?.classList.toggle('listening', listening);
    },

    _setStatus(t) {
        const el = document.getElementById('voiceAgentStatus');
        if (el) el.textContent = t;
    },

    _setTranscript(t) {
        const el = document.getElementById('voiceAgentTranscript');
        if (!el) return;
        el.textContent = t;
        el.style.display = t ? 'block' : 'none';
    }
};

window.VoiceAgent = VoiceAgent;

function _initVoiceAgent() {
    if (typeof MemoryManager === 'undefined' || typeof SpeechEngine === 'undefined') return;
    VoiceAgent.init();
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof DataManager !== 'undefined') _initVoiceAgent();
    else window.addEventListener('load', _initVoiceAgent);
});
