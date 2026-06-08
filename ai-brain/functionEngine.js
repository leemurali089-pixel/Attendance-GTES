/**
 * functionEngine.js — Dispatches to ErpBridge (CommandRouter or sandbox execute)
 */
(function (global) {
    'use strict';

    const FunctionEngine = {
        invoke: function (functionName, args, opts) {
            opts = opts || {};
            args = args || {};

            if (opts.readOnly || opts.replay) {
                return typeof ErpBridge !== 'undefined'
                    ? ErpBridge.routeCommand({ intent: functionName, slots: args, entities: args }, opts)
                    : Promise.resolve({ ok: false, error: 'ErpBridge missing' });
            }

            if (typeof SandboxEngine !== 'undefined' && SandboxEngine.isSandboxed(functionName)) {
                if (opts.execute) {
                    return typeof ErpBridge !== 'undefined'
                        ? ErpBridge.executeSandbox(functionName, args, opts)
                        : Promise.resolve({ ok: false, error: 'ErpBridge missing' });
                }
                return SandboxEngine.preview(functionName, args, opts);
            }

            if (typeof ErpBridge !== 'undefined') {
                return ErpBridge.routeCommand({
                    intent: functionName,
                    slots: args,
                    entities: args,
                    confidence: 0.8
                }, opts);
            }

            return Promise.resolve({ ok: false, error: 'ErpBridge missing' });
        }
    };

    global.FunctionEngine = FunctionEngine;
})(typeof window !== 'undefined' ? window : global);
