/**
 * voiceEngine.js — Mic transcript → AIBrain.processTurn; TTS via SpeechEngine
 */
(function (global) {
    'use strict';

    const VoiceEngine = {
        startListening: function () {
            if (typeof VoiceAgent !== 'undefined' && VoiceAgent.startListening) {
                return VoiceAgent.startListening();
            }
        },

        stopListening: function (processTranscript) {
            if (typeof VoiceAgent !== 'undefined' && VoiceAgent.stopListening) {
                return VoiceAgent.stopListening(!!processTranscript);
            }
        },

        processTranscript: function (text, opts) {
            if (typeof AIBrain !== 'undefined' && AIBrain.processTurn) {
                return AIBrain.processTurn(text, Object.assign({ skipUiHistory: true }, opts || {}));
            }
            return Promise.resolve({ ok: false, result: { message: 'AIBrain not loaded' } });
        },

        speak: function (text) {
            const msg = String(text || '').trim();
            if (!msg) return Promise.resolve();

            if (typeof SpeechEngine !== 'undefined' && SpeechEngine.speak) {
                return SpeechEngine.speak(msg);
            }
            if (typeof NotificationAgent !== 'undefined' && NotificationAgent.speak) {
                return NotificationAgent.speak(msg);
            }
            return Promise.resolve();
        }
    };

    global.VoiceEngine = VoiceEngine;
})(typeof window !== 'undefined' ? window : global);
