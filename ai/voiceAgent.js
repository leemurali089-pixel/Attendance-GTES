/**
 * MJS Prime Logic — Voice ERP Agent V1
 * Free mode: Browser Speech API + rule-based intent engine + real ERP integration.
 */
const VoiceAgent = {
    isListening: false,
    isProcessing: false,
    _finalTranscript: '',
    _pttActive: false,

    async init() {
        ContextManager.loadFromMemory();
        ConversationHistory.init();
        const ok = SpeechEngine.init();
        if (!ok && typeof App !== 'undefined') {
            App.showNotification('Voice recognition is not supported in this browser.', 'warning');
        }
        this._buildUI();
        this._wireMicButton();
        console.log('[VoiceAgent] Initialized (free rule-engine mode).');
    },

    _buildUI() {
        if (document.getElementById('voiceAgentPanel')) return;

        const panel = document.createElement('div');
        panel.id = 'voiceAgentPanel';
        panel.className = 'voice-agent-panel';
        panel.innerHTML = `
            <div class="voice-agent-header">
                <span><i class="bi bi-mic-fill me-2"></i>Voice ERP Assistant</span>
                <div class="voice-agent-header-actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceAgentModeBtn" title="Listen mode">
                        <i class="bi bi-hand-index-thumb"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceAgentHistoryToggle" title="History">
                        <i class="bi bi-chat-left-text"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="voiceAgentFullscreenBtn" title="Full screen chat">
                        <i class="bi bi-arrows-fullscreen"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" id="voiceAgentCloseBtn">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </div>
            <div class="voice-agent-status" id="voiceAgentStatus">Tap mic or hold to speak</div>
            <div class="voice-agent-transcript" id="voiceAgentTranscript"></div>
            <div class="voice-agent-input-row">
                <input type="text" id="voiceAgentManualInput" class="form-control form-control-sm" placeholder="Type command (Tamil / English / Tanglish)…" autocomplete="off">
                <button type="button" class="btn btn-primary btn-sm" id="voiceAgentSendBtn"><i class="bi bi-send"></i></button>
            </div>
            <div class="voice-agent-history" id="voiceAgentHistory">
                <div class="voice-agent-history-title">Conversation</div>
                <div id="voiceAgentHistoryList"></div>
            </div>
        `;
        document.body.appendChild(panel);

        const overlay = document.createElement('div');
        overlay.id = 'voiceAgentOverlay';
        overlay.className = 'voice-agent-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="voice-agent-overlay-inner">
                <div class="voice-agent-pulse"></div>
                <p id="voiceAgentOverlayText">Listening…</p>
                <button type="button" class="btn btn-outline-light btn-sm mt-3" id="voiceAgentOverlayStop">Stop</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('voiceAgentCloseBtn').addEventListener('click', () => this.closePanel());
        document.getElementById('voiceAgentFullscreenBtn').addEventListener('click', () => this._toggleFullscreen());
        document.getElementById('voiceAgentHistoryToggle').addEventListener('click', () => {
            document.getElementById('voiceAgentHistory').classList.toggle('open');
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('voiceAgentPanel')?.classList.contains('fullscreen')) {
                this._exitFullscreen();
            }
        });
        document.getElementById('voiceAgentModeBtn').addEventListener('click', () => this._toggleListenMode());
        document.getElementById('voiceAgentSendBtn').addEventListener('click', () => this._submitManual());
        document.getElementById('voiceAgentManualInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this._submitManual();
        });
        document.getElementById('voiceAgentOverlayStop').addEventListener('click', () => this.stopListening());

        ConversationHistory._renderPanel();
        this._updateModeButton();
    },

    _wireMicButton() {
        const btn = document.getElementById('globalAIBtn');
        if (!btn) return;

        btn.title = 'Voice ERP Assistant (Tamil / English / Tanglish)';
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'bi bi-mic-fill';

        btn.onclick = null;
        btn.addEventListener('click', (e) => {
            if (MemoryManager.getSettings().listenMode === 'continuous') {
                this.toggleListening();
            } else {
                this.openPanel();
            }
            e.preventDefault();
        });

        btn.addEventListener('mousedown', (e) => {
            if (MemoryManager.getSettings().listenMode !== 'push_to_talk') return;
            if (e.button !== 0) return;
            this._pttActive = true;
            this.startListening();
        });
        btn.addEventListener('mouseup', () => {
            if (!this._pttActive) return;
            this._pttActive = false;
            this.stopListening();
        });
        btn.addEventListener('mouseleave', () => {
            if (this._pttActive) {
                this._pttActive = false;
                this.stopListening();
            }
        });
    },

    openPanel() {
        const panel = document.getElementById('voiceAgentPanel');
        if (panel) panel.classList.add('open');
    },

    closePanel() {
        this.stopListening();
        this._exitFullscreen();
        const panel = document.getElementById('voiceAgentPanel');
        if (panel) panel.classList.remove('open');
    },

    _toggleFullscreen() {
        const panel = document.getElementById('voiceAgentPanel');
        if (!panel) return;
        if (panel.classList.contains('fullscreen')) this._exitFullscreen();
        else this._enterFullscreen();
    },

    _enterFullscreen() {
        const panel = document.getElementById('voiceAgentPanel');
        const history = document.getElementById('voiceAgentHistory');
        if (!panel) return;
        panel.classList.add('fullscreen');
        if (history) history.classList.add('open');
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
        btn.title = isFullscreen ? 'Exit full screen' : 'Full screen chat';
    },

    _toggleListenMode() {
        const s = MemoryManager.getSettings();
        s.listenMode = s.listenMode === 'push_to_talk' ? 'continuous' : 'push_to_talk';
        s.continuous = s.listenMode === 'continuous';
        MemoryManager.saveSettings(s);
        this._updateModeButton();
        this._setStatus(s.listenMode === 'continuous' ? 'Continuous mode — tap mic to start/stop' : 'Push-to-talk — hold mic button');
    },

    _updateModeButton() {
        const btn = document.getElementById('voiceAgentModeBtn');
        if (!btn) return;
        const mode = MemoryManager.getSettings().listenMode;
        btn.innerHTML = mode === 'continuous'
            ? '<i class="bi bi-broadcast"></i>'
            : '<i class="bi bi-hand-index-thumb"></i>';
        btn.title = mode === 'continuous' ? 'Continuous listening' : 'Push to talk';
    },

    toggleListening() {
        if (this.isListening) this.stopListening();
        else this.startListening();
    },

    startListening() {
        if (this.isListening || this.isProcessing) return;
        this.isListening = true;
        this._finalTranscript = '';
        this._setMicState('listening');
        this._showOverlay(true);
        this._setStatus('Listening…');
        this._setTranscript('');

        const settings = MemoryManager.getSettings();
        SpeechEngine.startListening({
            continuous: settings.continuous,
            onResult: ({ interim, final, isFinal }) => {
                const show = final || interim;
                if (show) this._setTranscript(show);
                if (isFinal && final) {
                    this._finalTranscript = (this._finalTranscript + ' ' + final).trim();
                    if (!settings.continuous) {
                        this.stopListening();
                        this.processText(this._finalTranscript);
                    }
                }
            },
            onError: (err) => {
                if (err === 'no-speech') {
                    this._setStatus('No speech detected. Try again.');
                } else if (err !== 'aborted') {
                    this._setStatus(`Mic error: ${err}`);
                }
                this.stopListening();
            },
            onEnd: () => {
                if (settings.continuous && this._finalTranscript) {
                    this.processText(this._finalTranscript);
                    this._finalTranscript = '';
                }
                if (this.isListening && settings.continuous) {
                    // auto-restart continuous
                    setTimeout(() => {
                        if (this.isListening) this.startListening();
                    }, 300);
                } else {
                    this.stopListening();
                }
            }
        });
    },

    stopListening() {
        this.isListening = false;
        SpeechEngine.stopListening();
        this._setMicState('idle');
        this._showOverlay(false);
        if (!this.isProcessing) this._setStatus('Tap mic or hold to speak');
    },

    async _submitManual() {
        const input = document.getElementById('voiceAgentManualInput');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';
        await this.processText(text);
    },

    async processText(text) {
        if (!text || this.isProcessing) return;
        this.isProcessing = true;
        this.openPanel();
        ConversationHistory.add('user', text);
        this._setStatus('Processing…');

        try {
            const parsed = IntentEngine.parse(text);
            const result = await CommandRouter.route(parsed);
            const msg = result.message || (result.success ? 'Done.' : 'Could not complete request.');

            ConversationHistory.add('assistant', msg, { intent: parsed.intent, success: result.success });
            this._setStatus(msg);
            this._setTranscript(text);

            if (typeof App !== 'undefined') {
                App.showNotification(msg, result.success ? 'success' : (result.needConfirm ? 'warning' : 'error'));
            }
            await NotificationAgent.speak(msg);
        } catch (err) {
            console.error('[VoiceAgent]', err);
            const msg = err.message || 'Sorry, something went wrong.';
            ConversationHistory.add('assistant', msg, { success: false });
            this._setStatus(msg);
            if (typeof App !== 'undefined') App.showNotification(msg, 'error');
        } finally {
            this.isProcessing = false;
        }
    },

    _setMicState(state) {
        const btn = document.getElementById('globalAIBtn');
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (state === 'listening') {
            btn.classList.add('listening');
            if (icon) icon.className = 'bi bi-mic-fill';
        } else {
            btn.classList.remove('listening');
            if (icon) icon.className = 'bi bi-mic-fill';
        }
    },

    _setStatus(t) {
        const el = document.getElementById('voiceAgentStatus');
        if (el) el.textContent = t;
        const ov = document.getElementById('voiceAgentOverlayText');
        if (ov && this.isListening) ov.textContent = t || 'Listening…';
    },

    _setTranscript(t) {
        const el = document.getElementById('voiceAgentTranscript');
        if (el) el.textContent = t;
    },

    _showOverlay(show) {
        const ov = document.getElementById('voiceAgentOverlay');
        if (ov) ov.style.display = show ? 'flex' : 'none';
    }
};

window.VoiceAgent = VoiceAgent;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof DataManager !== 'undefined') {
        VoiceAgent.init();
    } else {
        window.addEventListener('load', () => VoiceAgent.init());
    }
});
