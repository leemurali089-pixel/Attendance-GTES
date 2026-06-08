/**
 * brain.js — AI Brain orchestrator (Phase 2.5 — CommandRouter integration)
 */
(function (global) {
    'use strict';

    const AIBrain = {
        version: '2.5.1',
        _initialized: false,

        init: function () {
            if (this._initialized) return this;
            this._initialized = true;

            if (typeof TrainingCenter !== 'undefined') TrainingCenter.reload();
            if (typeof ContextManager !== 'undefined' && ContextManager.loadFromMemory) {
                ContextManager.loadFromMemory();
            }
            if (typeof AICommandCenter !== 'undefined' && AICommandCenter.init) {
                AICommandCenter.init();
            }
            console.log('[AIBrain] Phase 2.5 initialized v' + this.version);
            return this;
        },

        _recordAction: function (decision, utterance, result, mode) {
            if (typeof ActionReplayEngine === 'undefined') return;
            ActionReplayEngine.record({
                intent: decision.intent,
                functionName: decision.functionName,
                mode: mode || 'read',
                args: decision.slots || decision.args,
                reason: utterance,
                agentId: decision.agentId,
                decisionPath: decision.decisionPath,
                sourceRefs: (result && result.sourceRefs) || [],
                resultSummary: (result && (result.summary || result.message)) || null,
                success: result && result.success !== false && result.ok !== false
            });
        },

        processTurn: function (utterance, opts) {
            opts = opts || {};
            const self = this;

            if (!this._initialized) this.init();

            const ctx = typeof ContextEngine !== 'undefined'
                ? ContextEngine.buildTurnContext(utterance)
                : { utterance: utterance };

            const reasoning = typeof ReasoningEngine !== 'undefined'
                ? ReasoningEngine.parse(utterance, ctx)
                : { ok: false };

            const decision = typeof DecisionEngine !== 'undefined'
                ? DecisionEngine.decide(reasoning, ctx)
                : { action: 'respond', message: 'Brain not ready' };

            const runCtx = Object.assign({
                utterance: utterance,
                intent: decision.intent,
                agentId: decision.agentId,
                decisionPath: decision.decisionPath,
                confirmed: decision.confirmed
            }, ctx);

            let promise;

            if (decision.action === 'sandbox' && typeof SandboxEngine !== 'undefined') {
                promise = SandboxEngine.run(decision.functionName, decision.slots || decision.args, runCtx);
            } else if (decision.action === 'route' && typeof ErpBridge !== 'undefined') {
                promise = ErpBridge.routeCommand(reasoning, runCtx).then(function (result) {
                    self._recordAction(decision, utterance, result, 'read');
                    return result;
                });
            } else {
                promise = Promise.resolve({
                    ok: false,
                    success: false,
                    message: decision.message || 'Could not process command'
                });
            }

            return promise.then(function (result) {
                if (typeof MemoryEngine !== 'undefined') {
                    MemoryEngine.remember('user', utterance);
                    MemoryEngine.remember('assistant', self.formatResult(result), {
                        intent: decision.intent,
                        success: result && result.success !== false
                    });
                }
                const hasMessage = result && (result.message || result.summary);
                const clarified = result && result.needClarify;
                return {
                    ok: !!(result && (result.success !== false || clarified || hasMessage)),
                    utterance: utterance,
                    reasoning: reasoning,
                    decision: decision,
                    result: result
                };
            });
        },

        formatResult: function (result) {
            if (!result) return 'No result';
            if (result.message) return result.message;
            if (result.summary) return result.summary;
            if (result.data && result.data.customerName && result.data.total != null) {
                return result.data.customerName + ' outstanding: ' +
                    (typeof ErpFunctions !== 'undefined' ? ErpFunctions.formatMoney(result.data.total) : '₹' + result.data.total);
            }
            if (result.briefing) return result.briefing;
            return JSON.stringify(result).slice(0, 300);
        },

        handleVoiceInput: function (text) {
            return this.processTurn(text);
        }
    };

    global.AIBrain = AIBrain;

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(function () { AIBrain.init(); }, 500);
        });
    }
})(typeof window !== 'undefined' ? window : global);
