/**
 * brain.js — AI Brain entry (OrchestratorAgent + legacy CommandRouter)
 */
(function (global) {
    'use strict';

    const AIBrain = {
        version: '3.0.0',
        _initialized: false,

        init: function () {
            if (this._initialized) return this;
            this._initialized = true;

            if (typeof TrainingCenter !== 'undefined') TrainingCenter.reload();
            if (typeof ContextManager !== 'undefined' && ContextManager.loadFromMemory) {
                ContextManager.loadFromMemory();
            }
            if (typeof RagEngine !== 'undefined') {
                RagEngine.init().then(function () {
                    return RagEngine.indexAll();
                }).catch(function (e) {
                    console.warn('[AIBrain] RAG init deferred:', e && e.message);
                });
            }
            if (typeof AICommandCenter !== 'undefined' && AICommandCenter.init) {
                AICommandCenter.init();
            }
            console.log('[AIBrain] Multi-agent v' + this.version + ' initialized');
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
                agentId: decision.agentId || (result && result.agents && result.agents[0]),
                decisionPath: decision.decisionPath,
                sourceRefs: (result && result.sourceRefs) || [],
                resultSummary: (result && (result.summary || result.message)) || null,
                success: result && result.success !== false && result.ok !== false
            });
        },

        _orchestratorTurn: function (utterance, ctx) {
            if (typeof OrchestratorAgent === 'undefined') {
                return Promise.resolve({ handled: false });
            }
            return OrchestratorAgent.processQuery(utterance, ctx).then(function (result) {
                if (result.delegateLegacy) return { handled: false };
                return { handled: !!result.handled, result: result };
            });
        },

        _legacyTurn: function (utterance, opts, ctx) {
            const self = this;
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
                return { reasoning: reasoning, decision: decision, result: result };
            });
        },

        processTurn: function (utterance, opts) {
            opts = opts || {};
            const self = this;
            const skipUiHistory = !!opts.skipUiHistory;

            if (!this._initialized) this.init();

            const ctx = typeof ContextEngine !== 'undefined'
                ? ContextEngine.buildTurnContext(utterance)
                : { utterance: utterance };

            return this._orchestratorTurn(utterance, ctx).then(function (orch) {
                if (orch.handled && orch.result) {
                    const result = orch.result;
                    if (typeof MemoryEngine !== 'undefined' && !skipUiHistory) {
                        MemoryEngine.remember('user', utterance);
                        MemoryEngine.remember('assistant', self.formatResult(result), {
                            intent: 'orchestrator.multi',
                            success: result.success !== false
                        });
                    }
                    return {
                        ok: result.ok !== false,
                        utterance: utterance,
                        reasoning: { ok: true, intent: 'orchestrator.multi', agents: result.agents },
                        decision: { action: 'orchestrator', agentId: 'orchestratorAgent' },
                        result: result
                    };
                }

                return self._legacyTurn(utterance, opts, ctx).then(function (legacy) {
                    const result = legacy.result;
                    if (typeof MemoryEngine !== 'undefined' && !skipUiHistory) {
                        MemoryEngine.remember('user', utterance);
                        MemoryEngine.remember('assistant', self.formatResult(result), {
                            intent: legacy.decision.intent,
                            success: result && result.success !== false
                        });
                    }
                    if (typeof InteractionLogger !== 'undefined') {
                        InteractionLogger.log(utterance, legacy.decision, result);
                    }
                    const hasMessage = result && (result.message || result.summary);
                    const clarified = result && result.needClarify;
                    return {
                        ok: !!(result && (result.success !== false || clarified || hasMessage)),
                        utterance: utterance,
                        reasoning: legacy.reasoning,
                        decision: legacy.decision,
                        result: result
                    };
                });
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
        },

        getProactiveBriefing: function () {
            if (typeof OrchestratorAgent !== 'undefined') {
                return OrchestratorAgent.getProactiveBriefing();
            }
            if (typeof ProactiveEngine !== 'undefined') {
                return Promise.resolve(ProactiveEngine.getDailyBriefing());
            }
            return Promise.resolve({ ok: false, message: 'Briefing unavailable' });
        }
    };

    global.AIBrain = AIBrain;

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(function () { AIBrain.init(); }, 500);
        });
    }
})(typeof window !== 'undefined' ? window : global);
