/**
 * decisionEngine.js — Route legacy intents to CommandRouter; sandbox for bulk/financial writes
 */
(function (global) {
    'use strict';

    const DecisionEngine = {
        decide: function (reasoning, ctx) {
            ctx = ctx || {};
            if (!reasoning || !reasoning.ok) {
                return {
                    action: 'respond',
                    message: 'I did not understand that command. Try asking about attendance, customer outstanding, tasks, or daily briefing.',
                    tier: 'T0'
                };
            }

            const intent = reasoning.intent;
            const fn = reasoning.functionName || intent;
            const sandboxed = typeof SandboxEngine !== 'undefined' && SandboxEngine.isSandboxed(fn);
            const legacyDef = typeof IntentRegistry !== 'undefined' && IntentRegistry.get
                ? IntentRegistry.get(intent)
                : null;

            let action = 'respond';
            if (sandboxed) {
                action = 'sandbox';
            } else if (legacyDef) {
                action = 'route';
            } else if (intent === 'briefing.daily' || fn === 'briefing.daily') {
                action = 'route';
            }

            const tier = legacyDef && legacyDef.destructive ? 'T4'
                : (sandboxed && typeof SandboxEngine !== 'undefined' ? (SandboxEngine.getMeta(fn) || {}).tier : 'T1');

            return {
                action: action,
                intent: intent,
                functionName: fn,
                agentId: reasoning.agentId,
                tier: tier || 'T1',
                args: reasoning.entities || {},
                slots: reasoning.slots || {},
                confirmed: !!reasoning.confirmed,
                sandboxed: sandboxed,
                legacy: !!legacyDef,
                decisionPath: (reasoning.decisionPath || []).concat(['decisionEngine:' + action])
            };
        }
    };

    global.DecisionEngine = DecisionEngine;
})(typeof window !== 'undefined' ? window : global);
